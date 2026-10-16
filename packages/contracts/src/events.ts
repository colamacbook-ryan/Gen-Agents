import { z } from 'zod';
import { EngineInstallStatus } from './engine.ts';
import { UI_TOOLS } from './mcp.ts';
import { PtyCloseReason } from './supervisor.ts';
import { UPDATE_STEPS } from './update.ts';

// Union sự kiện SSE server → trình duyệt (BUILD-PLAN §D.3). Hub SSE theo workspace; tự nối lại bằng Last-Event-ID.
// Mọi sự kiện mang `id` tăng dần (Last-Event-ID) và `workspaceId`. Không bao giờ mang token / vé / nội dung credential.

/**
 * 16 trạng thái avatar theo THỨ TỰ ƯU TIÊN (state_rank 1 → 16) của view DB `v_role_avatar_state` (DATABASE v2.3.0).
 * Nhãn hiển thị lấy từ i18n theo PS §4.7 — không chép nhãn ở đây.
 */
export const AVATAR_STATES = [
  'error',
  'failover',
  'penalty',
  'quota',
  'rest',
  'wait',
  'discover',
  'rank1',
  'reward',
  'commit',
  'unsure',
  'think',
  'run',
  'idle',
  'sleep',
  'normal',
] as const;

const Ulid = z.string().length(26);
const Severity = z.enum(['ok', 'info', 'warn', 'danger']);

const base = { id: z.string().min(1), workspaceId: Ulid, at: z.string() };

export const SseEvent = z.discriminatedUnion('type', [
  z.strictObject({
    ...base,
    type: z.literal('role.state'),
    roleId: Ulid,
    lifecycle: z.string(),
    runtime: z.enum(['none', 'sleeping', 'starting', 'running', 'error', 'stopped']),
  }),
  z.strictObject({
    ...base,
    type: z.literal('avatar.state'),
    roleId: Ulid,
    state: z.enum(AVATAR_STATES),
    sourceDisplayId: z.string().nullable(),
    expiresAt: z.string().nullable(),
  }),
  z.strictObject({ ...base, type: z.literal('chat.delta'), threadId: Ulid, messageId: Ulid, text: z.string() }),
  z.strictObject({
    ...base,
    type: z.literal('chat.tool'),
    threadId: Ulid,
    messageId: Ulid,
    tool: z.string(),
    stage: z.enum(['call', 'result']),
    deniedCode: z.string().nullable(),
  }),
  z.strictObject({
    ...base,
    type: z.literal('ui.action'),
    threadId: Ulid,
    action: z.enum(UI_TOOLS),
    uiActionDisplayId: z.string(),
    args: z.json(),
  }),
  z.strictObject({
    ...base,
    type: z.literal('notification'),
    notificationDisplayId: z.string(),
    severity: Severity,
    kind: z.string(),
  }),
  z.strictObject({
    ...base,
    type: z.literal('core_agent.status'),
    /** = v_core_agent_status.mode */
    mode: z.enum(['setup', 'ok', 'recovery']),
    reason: z.string().nullable(),
    isIncident: z.boolean(),
  }),
  z.strictObject({
    ...base,
    type: z.literal('job.progress'),
    jobDisplayId: z.string(),
    kind: z.string(),
    status: z.enum(['queued', 'running', 'succeeded', 'failed', 'dead', 'cancelled']),
    progressPct: z.number().int().min(0).max(100).nullable(),
  }),
  z.strictObject({
    ...base,
    type: z.literal('update.step'),
    step: z.enum(UPDATE_STEPS),
    state: z.enum(['pending', 'running', 'done', 'failed', 'rolled_back']),
  }),
  z.strictObject({
    ...base,
    type: z.literal('probe.result'),
    engineAccountId: Ulid,
    probeDisplayId: z.string(),
    kind: z.enum(['login_check', 'capability_scan']),
    status: z.enum(['running', 'ok', 'partial', 'failed']),
  }),
  z.strictObject({ ...base, type: z.literal('engine.install'), engineSlug: z.string(), status: EngineInstallStatus }),
  z.strictObject({ ...base, type: z.literal('pty.closed'), engineAccountId: Ulid, reason: PtyCloseReason }),
]);
export type SseEvent = z.infer<typeof SseEvent>;
export type SseEventType = SseEvent['type'];
