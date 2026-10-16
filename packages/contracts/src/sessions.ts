import { z } from 'zod';
import { TokenUsage, TURN_OUTCOMES, TurnClassification, type TurnOutcome } from './engine.ts';

// Hợp đồng dịch vụ phiên (CNS-151): L-GW cung cấp, L-SYS / L-WORK gọi — đóng băng ở M0 để không phải chờ code.
// Một lượt = một hàng `sessions` (SS-). Không resume native: ngữ cảnh mỗi lượt do compiler dựng từ DB (CNS-132).
// Enum dưới đây trùng CHECK của bảng `sessions` (DATABASE v2.3.0); test @ga/db đối chiếu với kiểu sinh từ DB.

export const AGENT_KINDS = ['role', 'interviewer', 'trainer', 'consolidator', 'judge', 'system'] as const;
export type AgentKind = (typeof AGENT_KINDS)[number];

export const SESSION_TRIGGERS = [
  'telegram',
  'heartbeat',
  'proactive',
  'task',
  'chat',
  'trial',
  'interview',
  'training',
  'consolidation',
  'probe',
  'baseline',
  'reflection',
] as const;
export type SessionTrigger = (typeof SESSION_TRIGGERS)[number];

export const SESSION_STATUSES = [
  'running',
  'ok',
  'error',
  'timeout',
  'cancelled',
  'auth_required',
  'quota_exhausted',
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/** sessions.native_memory. Chính sách tmpfs-per-turn ⇒ 'off' khi auth-gc sạch; allowlist chưa biết ⇒ 'unknown' + báo owner. */
export const NATIVE_MEMORY_STATES = ['off', 'imported', 'discarded', 'unknown'] as const;

/** sessions.phase (DB v2.3.0): planning trước sự kiện công cụ đầu tiên, acting sau đó. Không tách được ⇒ null (avatar hiện 'run'). */
export const SESSION_PHASES = ['planning', 'acting'] as const;

const Ulid = z.string().length(26);

export const TurnRequest = z.strictObject({
  workspaceId: Ulid,
  agentKind: z.enum(AGENT_KINDS),
  trigger: z.enum(SESSION_TRIGGERS),
  /** Bắt buộc khi agentKind = 'role'. */
  roleId: Ulid.nullable(),
  taskId: Ulid.nullable(),
  threadId: Ulid.nullable(),
  /** Tin nhắn kích hoạt lượt (chat / Telegram) nếu có — compiler đọc từ DB, không nhận văn bản thô ở đây. */
  sourceMessageId: Ulid.nullable(),
  /** Chống chạy trùng khi job được thử lại. */
  idempotencyKey: z.string().min(1).max(200),
  timeoutMs: z.number().int().positive().max(3_600_000).nullable(),
});
export type TurnRequest = z.infer<typeof TurnRequest>;

/** Lý do runTurn từ chối TRƯỚC khi tạo phiên (§B.5 bước 2). Với tác tử hệ thống, 'recovery_mode' ⇒ job chờ, xả khi thoát O4 (G-22). */
export const TURN_REJECTIONS = [
  'no_active_card',
  'wounded',
  'quota_exceeded',
  'recovery_mode',
  'core_agent_not_ready',
  'engine_not_installed',
  'no_binding',
  'duplicate',
] as const;
export type TurnRejection = (typeof TURN_REJECTIONS)[number];

export class TurnRejectedError extends Error {
  readonly reason: TurnRejection;
  constructor(reason: TurnRejection, message?: string) {
    super(message ?? `runTurn từ chối: ${reason}`);
    this.name = 'TurnRejectedError';
    this.reason = reason;
  }
}

export const TurnEvent = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('started'),
    sessionId: Ulid,
    sessionDisplayId: z.string(),
    engineAccountId: Ulid,
    /** 1 = lần đầu; > 1 = sau fallback sang loại CLI khác (chỉ Role). */
    attempt: z.number().int().positive(),
  }),
  z.strictObject({ type: z.literal('phase'), phase: z.enum(SESSION_PHASES), at: z.string() }),
  z.strictObject({ type: z.literal('delta'), text: z.string() }),
  z.strictObject({
    type: z.literal('tool'),
    stage: z.enum(['call', 'result']),
    name: z.string().min(1),
    callId: z.string().nullable(),
    /** Gateway từ chối (vd `credential_like_payload`) — chỉ mã, không nội dung. */
    deniedCode: z.string().nullable(),
  }),
  z.strictObject({ type: z.literal('usage'), usage: TokenUsage }),
  z.strictObject({
    type: z.literal('failover'),
    fromAccountId: Ulid,
    toAccountId: Ulid,
    reason: z.enum(['login_expired', 'outage', 'quota_exhausted', 'account_suspended']),
  }),
]);
export type TurnEvent = z.infer<typeof TurnEvent>;

export const TurnResult = z.strictObject({
  sessionId: Ulid,
  status: z.enum(SESSION_STATUSES).exclude(['running']),
  outcome: z.enum(TURN_OUTCOMES),
  classification: TurnClassification,
  usage: TokenUsage,
  nativeMemory: z.enum(NATIVE_MEMORY_STATES),
  failoverCount: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  /** Văn bản trả lời cuối (đã qua bộ lọc che bí mật). */
  text: z.string(),
});
export type TurnResult = z.infer<typeof TurnResult>;

export interface TurnHandle {
  readonly sessionId: string;
  readonly events: AsyncIterable<TurnEvent>;
  readonly result: Promise<TurnResult>;
  /** Huỷ lượt: supervisor kết thúc exec; phiên đóng 'cancelled'. */
  cancel(reason: string): void;
}

export interface SessionsService {
  /** Ném TurnRejectedError nếu điều kiện §B.5 bước 2 không đạt (không tạo phiên). */
  runTurn(req: TurnRequest): Promise<TurnHandle>;
}

/** Ánh xạ kết quả adapter → sessions.status (một nguồn cho mọi lane). */
export function sessionStatusFor(
  outcome: TurnOutcome,
  flags: { timedOut: boolean; cancelled: boolean },
): Exclude<SessionStatus, 'running'> {
  if (flags.cancelled) return 'cancelled';
  if (flags.timedOut) return 'timeout';
  switch (outcome) {
    case 'ok':
      return 'ok';
    case 'AUTH_REQUIRED':
    case 'login_expired':
      return 'auth_required';
    case 'quota_exhausted':
      return 'quota_exhausted';
    case 'outage':
    case 'account_suspended':
    case 'transient':
      return 'error';
  }
}
