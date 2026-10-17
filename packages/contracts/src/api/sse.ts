import { z } from 'zod';
import { SseEvent } from '../events.ts';
import { TURN_REJECTIONS } from '../sessions.ts';
import { DisplayId, Int, KeyStr, Nat, Pct, str, Ts, Ulid } from './common.ts';
import { GridKey } from './grids.ts';
import {
  CHANGE_SET_STATUSES,
  CHAT_AUTHOR_KINDS,
  CHAT_MESSAGE_STATUSES,
  KNOWLEDGE_PROCESSING_STATES,
  LEDGER_ENTRY_TYPES,
  TgUserId,
  TRIAL_STATES,
} from './shapes.ts';

// Sự kiện SSE `GET /api/v1/stream` (BACKEND-TRIAL §3.7): 26 loại. 13 loại đầu đã có ở `events.ts` (dùng lại NGUYÊN, không
// định nghĩa trùng); 12 loại mới ở đây + `log.line` (chỉ trên `/logs/stream`).
//   - Phong bì chung `{id, workspaceId, at, type, …}`; `id` tăng dần cho `Last-Event-ID`.
//   - Bộ đệm vòng [ĐỀ XUẤT: 1.000 sự kiện hoặc 5 phút]; mất khoảng ⇒ phát `resync`, client đọc lại bằng GET.
//   - KHÔNG sự kiện nào mang token, vé hay nội dung credential. Văn bản duy nhất là `chat.delta.text` (đã qua bộ lọc che).

export const SSE_KEEPALIVE_SECONDS = 15;
export const SSE_REPLAY_BUFFER = { events: 1000, seconds: 300 } as const;

/** 26 loại theo thứ tự của đặc tả (số thứ tự 1–26). */
export const SSE_EVENT_TYPES = [
  'role.state',
  'avatar.state',
  'chat.delta',
  'chat.tool',
  'ui.action',
  'notification',
  'core_agent.status',
  'job.progress',
  'update.step',
  'probe.result',
  'engine.install',
  'pty.closed',
  'credential.blocked',
  'chat.message',
  'chat.turn',
  'changeset.state',
  'grid.changed',
  'attention.changed',
  'card.step',
  'trial.progress',
  'knowledge.progress',
  'telegram.capture',
  'wallet.changed',
  'engine.failover',
  'resync',
  'log.line',
] as const;
export type SseEventTypeName = (typeof SSE_EVENT_TYPES)[number];

/** Ai được nhận sự kiện: `V` mọi thành viên · `A` admin / owner · `O` owner · `recipient` chỉ người nhận (`user_id` của phiên). */
export type SseAudience = 'V' | 'A' | 'O' | 'recipient';

/**
 * Đối tượng nhận của TỪNG loại sự kiện (review bảo mật PR #7, M7; HANDLER-OBLIGATIONS #6). KHÔNG có mặc định: `Record` theo
 * `SseEventTypeName` nên thêm loại sự kiện mà quên khai ⇒ lỗi kiểu lúc compile VÀ test quét 26 loại đỏ. Handler lọc từng kết nối
 * theo (workspace, audience, người nhận) và cắt luồng khi thành viên bị gỡ / hạ quyền. `grid.changed` còn chịu `GRID_MIN_AUTH`
 * của lưới (xem `sseEventAllows` ở access.ts).
 */
export const SSE_EVENT_AUDIENCE: Record<SseEventTypeName, SseAudience> = {
  'role.state': 'V',
  'avatar.state': 'V',
  // Nội dung hội thoại với agent: chỉ owner / admin.
  'chat.delta': 'A',
  'chat.tool': 'A',
  'ui.action': 'A',
  // Thông báo của riêng từng người: lọc `user_id = người dùng của phiên` (SYS-83 / SYS-84 `scope: 'self'`).
  notification: 'recipient',
  'core_agent.status': 'V',
  'job.progress': 'A',
  'update.step': 'A',
  'probe.result': 'A',
  'engine.install': 'A',
  // Phiên đăng nhập terminal / credential bị chặn: chỉ owner.
  'pty.closed': 'O',
  'credential.blocked': 'O',
  'chat.message': 'A',
  'chat.turn': 'A',
  'changeset.state': 'V',
  'grid.changed': 'V',
  'attention.changed': 'V',
  'card.step': 'A',
  'trial.progress': 'V',
  'knowledge.progress': 'V',
  // `candidate` mang tên hiển thị + tgUserId của người ngoài (PII).
  'telegram.capture': 'A',
  'wallet.changed': 'V',
  // Mang ID tài khoản engine.
  'engine.failover': 'A',
  resync: 'V',
  'log.line': 'A',
};

/** 13 loại đã có ở contracts M0 (`events.ts`). */
export const SSE_EXISTING_TYPES = SSE_EVENT_TYPES.slice(0, 13);
/** 12 loại mới trên `/stream` (#14–#25). */
export const SSE_NEW_TYPES = SSE_EVENT_TYPES.slice(13, 25);

const base = { id: str(64, 1), workspaceId: Ulid, at: Ts };

export const CARD_STEPS = [
  'checks',
  'container',
  'mounts',
  'adapter_config',
  'compile',
  'bot',
  'healthcheck',
  'issue',
  'grant',
  'rollback',
] as const;

export const NewSseEvent = z.discriminatedUnion('type', [
  z.strictObject({
    ...base,
    type: z.literal('chat.message'),
    threadId: Ulid,
    messageId: Ulid,
    messageDisplayId: DisplayId('MSG'),
    authorKind: z.enum(CHAT_AUTHOR_KINDS),
    status: z.enum(CHAT_MESSAGE_STATUSES),
  }),
  z.strictObject({
    ...base,
    type: z.literal('chat.turn'),
    threadId: Ulid,
    state: z.enum(['queued', 'running', 'done', 'failed', 'rejected', 'cancelled']),
    sessionDisplayId: DisplayId('SS').nullable(),
    rejection: z.enum(TURN_REJECTIONS).nullable(),
  }),
  z.strictObject({
    ...base,
    type: z.literal('changeset.state'),
    changeSetDisplayId: DisplayId('CS'),
    roleId: Ulid.nullable(),
    state: z.enum(CHANGE_SET_STATUSES),
    tokenDelta: Int.nullable(),
  }),
  z.strictObject({
    ...base,
    type: z.literal('grid.changed'),
    grid: GridKey,
    displayIds: z.array(str(20, 1)).max(100),
    op: z.enum(['insert', 'update', 'delete']),
  }),
  z.strictObject({
    ...base,
    type: z.literal('attention.changed'),
    count: Nat,
    /** `null` khi `count = 0`. */
    maxSeverity: z.enum(['info', 'warn', 'danger']).nullable(),
  }),
  z.strictObject({
    ...base,
    type: z.literal('card.step'),
    roleId: Ulid,
    cardDisplayId: DisplayId('CD').nullable(),
    step: z.enum(CARD_STEPS),
    state: z.enum(['running', 'done', 'failed']),
    refDisplayId: str(20, 1).nullable(),
  }),
  z.strictObject({
    ...base,
    type: z.literal('trial.progress'),
    trialRunDisplayId: DisplayId('TR'),
    caseIndex: Nat,
    caseCount: Nat,
    state: z.enum(TRIAL_STATES),
    score: z.number().min(0).max(1).nullable(),
  }),
  z.strictObject({
    ...base,
    type: z.literal('knowledge.progress'),
    knowledgeDisplayId: DisplayId('KN'),
    // `duplicate` = `duplicate_of_id` đặt (không phải processing_state của DB).
    state: z.enum([...KNOWLEDGE_PROCESSING_STATES, 'duplicate']),
    progressPct: Pct.nullable(),
  }),
  z.strictObject({
    ...base,
    type: z.literal('telegram.capture'),
    captureId: str(64, 16),
    botDisplayId: DisplayId('TG'),
    purpose: z.enum(['allowlist', 'owner_change']),
    state: z.enum(['captured', 'expired']),
    candidate: z.strictObject({ displayName: str(120), tgUserId: TgUserId }).nullable(),
  }),
  z.strictObject({
    ...base,
    type: z.literal('wallet.changed'),
    roleId: Ulid,
    balanceMinor: Nat,
    ledgerDisplayId: DisplayId('LG'),
    entryType: z.enum(LEDGER_ENTRY_TYPES),
    rank: Nat.nullable(),
  }),
  z.strictObject({
    ...base,
    type: z.literal('engine.failover'),
    roleId: Ulid,
    direction: z.enum(['failover', 'failback']),
    fromAccountId: Ulid,
    toAccountId: Ulid,
    reason: KeyStr.nullable(),
    eventDisplayId: DisplayId('EV'),
  }),
  z.strictObject({ ...base, type: z.literal('resync'), reason: z.enum(['gap', 'restart']) }),
]);
export type NewSseEvent = z.infer<typeof NewSseEvent>;

/** Mọi sự kiện của `GET /stream` (25 loại: 13 có sẵn + 12 mới). */
export const StreamEvent = z.union([SseEvent, NewSseEvent]);
export type StreamEvent = z.infer<typeof StreamEvent>;

/** Một dòng log JSONL: `{ts, container, level, message}`; `message` ĐÃ qua bộ che (OPS-24 stream, OPS-25 đọc tệp). */
export const logLineShape = {
  ts: Ts,
  container: str(63, 1),
  level: KeyStr,
  message: str(16_384),
} as const;
export const LogLine = z.strictObject(logLineShape);

/** `log.line` — CHỈ trên `GET /logs/stream` (OPS-24): phong bì chung + `LogLine`. */
export const LogLineEvent = z.strictObject({
  ...base,
  type: z.literal('log.line'),
  ...logLineShape,
});
export type LogLineEvent = z.infer<typeof LogLineEvent>;

/** Loại sự kiện đã định nghĩa trong hợp đồng theo schema (cho test đối chiếu với SSE_EVENT_TYPES). */
export function definedSseTypes(): string[] {
  return [
    ...SseEvent.options.map((o) => o.shape.type.value),
    ...NewSseEvent.options.map((o) => o.shape.type.value),
    LogLineEvent.shape.type.value,
  ];
}
