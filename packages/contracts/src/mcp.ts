import { z } from 'zod';

// Hợp đồng MCP gateway (BUILD-PLAN §B.4 `gateway/`, STD-08 §3–§5; CNS-133).
// Mọi tool có dữ liệu đi ra hoặc ghi bền đi qua BỘ LỌC CREDENTIAL: khớp mẫu credential hoặc canary ⇒ `denied`
// với mã `credential_like_payload`; audit chỉ lưu hash đoạn khớp. v0: tên tool, tham số tối thiểu, mã từ chối.

// ---------------------------------------------------------------- anchor + payload Ghim (STD-08 §1, §3)
/** Anchor ổn định gắn ID dữ liệu thật, vd `grid:skills/row:SK-0004/col:C`, `role:RL-0001`, `msg:MSG-0142`. */
export const Anchor = z.string().min(3).max(300);

export const PinnedAnchor = z.strictObject({
  anchor: Anchor,
  entity: z.string().min(1),
  /** display_id của hàng (vd SK-0004). */
  id: z.string().min(1),
  column: z.string().nullable(),
  label: z.string(),
  /** Đã cắt theo ngân sách token. */
  snapshot: z.string(),
  snapshotHash: z.string().min(1),
  version: z.number().int().nonnegative().nullable(),
});
export type PinnedAnchor = z.infer<typeof PinnedAnchor>;

export const PinPayload = z.strictObject({
  text: z.string(),
  screen: z.strictObject({
    route: z.string(),
    role: z.string().nullable(),
    tab: z.string().nullable(),
    filters: z.string().nullable(),
  }),
  anchors: z.array(PinnedAnchor),
  attachments: z.array(
    z.strictObject({ id: z.string(), name: z.string(), mime: z.string(), size: z.number().int().nonnegative() }),
  ),
});
export type PinPayload = z.infer<typeof PinPayload>;

// ---------------------------------------------------------------- tool
/** Tool nghiệp vụ. `set_field` chỉ Interviewer / Trainer (tool_grants ép). */
export const DATA_TOOLS = [
  'recall',
  'remember',
  'set_field',
  'report_task',
  'send_telegram',
  'propose_change',
] as const;

/** Tool UI "Soi" — frontend thực thi, gateway ghi `ui_actions` (STD-08 §4; enum trùng ui_actions.action). */
export const UI_TOOLS = ['highlight', 'navigate', 'annotate', 'tour', 'propose_edit'] as const;

export const MCP_TOOLS = [...DATA_TOOLS, ...UI_TOOLS] as const;
export type McpToolName = (typeof MCP_TOOLS)[number];

/** Tool có payload đi ra hoặc ghi bền ⇒ BẮT BUỘC qua bộ lọc credential (CNS-133). */
export const CREDENTIAL_FILTERED_TOOLS = [
  'send_telegram',
  'remember',
  'report_task',
  'propose_change',
  'set_field',
] as const satisfies readonly McpToolName[];

export const ToolArgs = {
  recall: z.strictObject({ query: z.string().min(1).max(2000), limit: z.number().int().min(1).max(50).default(8) }),
  remember: z.strictObject({
    content: z.string().min(1).max(4000),
    kind: z.enum(['fact', 'lesson', 'person', 'commitment', 'procedure']),
    scope: z.enum(['personal', 'position']),
  }),
  set_field: z.strictObject({
    field: z.string().min(1),
    itemIndex: z.number().int().min(0).default(0),
    value: z.json(),
  }),
  report_task: z.strictObject({
    taskId: z.string().nullable(),
    status: z.enum(['done', 'failed', 'blocked', 'waiting_approval']),
    summary: z.string().max(4000),
    /** Role tự khai chưa chắc (nguồn chat_messages.certainty / avatar 'unsure', G-13). */
    certainty: z.enum(['sure', 'unsure']).nullable(),
  }),
  send_telegram: z.strictObject({ chatRef: z.string().min(1), text: z.string().min(1).max(4096) }),
  propose_change: z.strictObject({ title: z.string().min(1).max(200), items: z.array(z.json()).min(1) }),
  highlight: z.strictObject({ anchor: Anchor, label: z.string().max(120).nullable() }),
  navigate: z.strictObject({ anchor: Anchor }),
  annotate: z.strictObject({ anchor: Anchor, note: z.string().max(500), n: z.number().int().min(1).max(20) }),
  tour: z.strictObject({ anchors: z.array(Anchor).min(1).max(20) }),
  propose_edit: z.strictObject({ anchor: Anchor, newValue: z.json() }),
} as const satisfies Record<McpToolName, z.ZodType>;

// ---------------------------------------------------------------- từ chối
export const TOOL_DENIAL_CODES = [
  /** Payload giống credential (JWT, ya29., sk-ant-, 1//0, AIza, PEM, "refresh_token") hoặc canary. */
  'credential_like_payload',
  'not_granted',
  'goal_check_failed',
  'recovery_mode',
  'wounded',
  'ticket_invalid',
  'rate_limited',
] as const;
export type ToolDenialCode = (typeof TOOL_DENIAL_CODES)[number];

export const ToolResult = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('ok'), data: z.json() }),
  z.strictObject({
    status: z.literal('denied'),
    code: z.enum(TOOL_DENIAL_CODES),
    auditDisplayId: z.string().nullable(),
  }),
  z.strictObject({ status: z.literal('error'), message: z.string() }),
]);
export type ToolResult = z.infer<typeof ToolResult>;

// ---------------------------------------------------------------- vé lượt (CNS-142)
/** Vé lượt 256-bit, chỉ hợp lệ cho (turn_id, container) và IP nguồn của container trên ga-roles; hết hạn khi lượt kết thúc. */
export const TURN_TICKET = {
  bytes: 32,
  /** Header MCP client gửi gateway. Cấu hình MCP đọc vé từ TỆP /run/ga/<lượt>/ticket, không nhúng vé. */
  header: 'authorization',
  scheme: 'Bearer',
  bundlePath: '/turn/bundle',
} as const;
