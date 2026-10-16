import { z } from 'zod';

// Hợp đồng MCP gateway (BUILD-PLAN §B.4 `gateway/`, STD-08 §3–§5; CNS-133).
//
// LUẬT LỌC CREDENTIAL LÀ DEFAULT-DENY (CNS-133, INT-06):
//   - MỌI tool (kể cả tên tool chưa có trong registry) đi qua bộ lọc credential trước khi thực thi / ghi bền / gửi ra.
//     Khớp mẫu credential hoặc canary ⇒ `denied` mã `credential_like_payload`; audit chỉ lưu hash đoạn khớp.
//   - Miễn lọc CHỈ cho tool trong `CREDENTIAL_FILTER_EXEMPT`, và chỉ khi MỌI tham số có schema chặt (enum / số / chuỗi
//     ràng buộc bởi regex neo ^…$ + độ dài tối đa — vd Anchor chỉ chứa display_id / slug thường). Không có chuỗi tự do,
//     z.json(), record, any. Test contracts `credentialFilterViolations` duyệt mọi tool: tool miễn mà có trường tự do ⇒ đỏ.
//   - Tool mới mặc định bị lọc; muốn miễn phải sửa danh sách miễn qua PR "contract" và qua test đó.
// Bộ phát hiện dùng chung thật (che log + chặn payload, gồm biến thể) thuộc packages/security (L-SEC, M1) và PHẢI phủ ít nhất
// `CREDENTIAL_PATTERNS` dưới đây; `screenToolPayload` là cổng tham chiếu v0 mà gateway (L-GW) giữ nguyên ngữ nghĩa.

// ---------------------------------------------------------------- anchor + payload Ghim (STD-08 §1, §3)
const DISPLAY_ID = '[A-Z]{2,3}-\\d{4,8}';
const SLUG = '[a-z][a-z0-9_-]{0,39}';
/**
 * Anchor ổn định gắn ID dữ liệu thật (STD-08 §1). Ngữ pháp chặt — chỉ display_id, slug chữ thường, chữ cột, số vùng:
 *   grid:<bảng>/row:<DISPLAY_ID>[/col:<CỘT>] · panel:<slug> · role|msg|file|row:<DISPLAY_ID> · region:x,y,w,h@screen:<slug>
 * Nên một anchor không chở được credential nguyên vẹn (token có chữ hoa/thường lẫn lộn, dấu chấm, chuỗi dài).
 */
export const ANCHOR_RE = new RegExp(
  `^(?:grid:${SLUG}/row:${DISPLAY_ID}(?:/col:[A-Z]{1,3})?|panel:${SLUG}|(?:role|msg|file|row):${DISPLAY_ID}|region:\\d{1,5},\\d{1,5},\\d{1,5},\\d{1,5}@screen:${SLUG})$`,
);
export const Anchor = z.string().max(120).regex(ANCHOR_RE, 'anchor không đúng ngữ pháp STD-08 §1');

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

/**
 * Tool ĐƯỢC MIỄN lọc credential (danh sách nhỏ, khai rõ). Điều kiện: mọi tham số có schema chặt — xem
 * `credentialFilterViolations`. `highlight` (label tự do), `annotate` (note), `propose_edit` (newValue json) KHÔNG được miễn.
 */
export const CREDENTIAL_FILTER_EXEMPT = ['navigate', 'tour'] as const satisfies readonly McpToolName[];

/** Default-deny: mọi tên tool — kể cả tên lạ ngoài registry — đều phải lọc, trừ khi nằm trong danh sách miễn. */
export function requiresCredentialFilter(tool: string): boolean {
  return !(CREDENTIAL_FILTER_EXEMPT as readonly string[]).includes(tool);
}

// ---------------------------------------------------------------- kiểm schema: trường tự do
type ZodDef = { type: string; [k: string]: unknown };
const defOf = (s: z.ZodType): ZodDef => (s as unknown as { _zod: { def: ZodDef } })._zod.def;

function isStrictString(def: ZodDef): boolean {
  const checks = (def.checks as Array<{ _zod: { def: Record<string, unknown> } }> | undefined) ?? [];
  const defs = checks.map((c) => c._zod.def);
  const anchoredRegex = defs.some((d) => {
    if (d.check !== 'string_format' || d.format !== 'regex') return false;
    const src = (d.pattern as RegExp).source;
    return src.startsWith('^') && src.endsWith('$');
  });
  const bounded = defs.some((d) => d.check === 'max_length' && typeof d.maximum === 'number');
  return anchoredRegex && bounded;
}

/**
 * Đường dẫn các trường TỰ DO trong một schema: chuỗi không có regex neo ^…$ + độ dài tối đa, z.json(), record, any,
 * unknown, lazy, transform… Rỗng ⇒ schema chặt.
 */
export function freeFormFields(schema: z.ZodType, path = '$'): string[] {
  const def = defOf(schema);
  switch (def.type) {
    case 'string':
      return isStrictString(def) ? [] : [path];
    case 'number':
    case 'int':
    case 'boolean':
    case 'enum':
    case 'literal':
    case 'null':
    case 'undefined':
    case 'never':
      return [];
    case 'object': {
      const shape = def.shape as Record<string, z.ZodType>;
      const out = Object.entries(shape).flatMap(([k, v]) => freeFormFields(v, `${path}.${k}`));
      const catchall = def.catchall as z.ZodType | undefined;
      if (catchall && defOf(catchall).type !== 'never') out.push(`${path}.*`);
      return out;
    }
    case 'array':
      return freeFormFields(def.element as z.ZodType, `${path}[]`);
    case 'optional':
    case 'nullable':
    case 'default':
    case 'prefault':
    case 'readonly':
    case 'nonoptional':
    case 'catch':
      return freeFormFields(def.innerType as z.ZodType, path);
    case 'union':
      return (def.options as z.ZodType[]).flatMap((o, i) => freeFormFields(o, `${path}|${i}`));
    default:
      // lazy (z.json), record, any, unknown, pipe, transform, custom, map, set… ⇒ coi là tự do
      return [path];
  }
}

/** Tool miễn lọc mà có trường tự do ⇒ vi phạm. Gateway nên gọi lúc khởi động và từ chối chạy nếu khác rỗng. */
export function credentialFilterViolations(
  registry: Record<string, z.ZodType>,
  exempt: readonly string[],
): Array<{ tool: string; fields: string[] }> {
  const out: Array<{ tool: string; fields: string[] }> = [];
  for (const tool of exempt) {
    const schema = registry[tool];
    if (!schema) {
      out.push({ tool, fields: ['(không có trong registry)'] });
      continue;
    }
    const fields = freeFormFields(schema);
    if (fields.length > 0) out.push({ tool, fields });
  }
  return out;
}

// ---------------------------------------------------------------- mẫu credential (tối thiểu, BUILD-PLAN §B.4)
/** Bộ phát hiện ở packages/security phải phủ ÍT NHẤT các mẫu này (+ biến thể). Canary do CLI giả ghi: `GA-CANARY-<uuid>`. */
export const CREDENTIAL_PATTERNS: ReadonlyArray<{ id: string; re: RegExp }> = [
  { id: 'jwt', re: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ },
  { id: 'google_oauth_access_token', re: /ya29\.[0-9A-Za-z_-]{10,}/ },
  { id: 'google_refresh_token', re: /1\/\/0[0-9A-Za-z_-]{10,}/ },
  { id: 'google_api_key', re: /AIza[0-9A-Za-z_-]{30,}/ },
  { id: 'vendor_api_key_sk_ant', re: /sk-ant-[0-9A-Za-z_-]{10,}/ },
  { id: 'pem_private_key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: 'refresh_token_field', re: /["']?refresh_token["']?\s*[:=]/i },
  { id: 'canary', re: /GA-CANARY-[0-9a-f-]{8,}/i },
];

/** Tên khoá JSON mang credential: payload có khoá này (bất kể giá trị) ⇒ chặn. */
export const CREDENTIAL_KEY_RE = /^(?:refresh_token|access_token|id_token|client_secret|private_key)$/i;

/** Duyệt mọi chuỗi (giá trị và khoá) trong payload; trả mẫu khớp đầu tiên, không trả đoạn khớp (gateway băm). */
export function findCredentialLike(value: unknown, depth = 0): { patternId: string } | null {
  if (depth > 64) return { patternId: 'too_deep' };
  if (typeof value === 'string') {
    for (const p of CREDENTIAL_PATTERNS) if (p.re.test(value)) return { patternId: p.id };
    return null;
  }
  if (Array.isArray(value)) {
    for (const v of value) {
      const hit = findCredentialLike(v, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (CREDENTIAL_KEY_RE.test(k)) return { patternId: 'credential_field_name' };
      const hit = findCredentialLike(k, depth + 1) ?? findCredentialLike(v, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

export type ScreenResult =
  | { status: 'ok'; tool: McpToolName; args: unknown }
  | { status: 'denied'; code: 'credential_like_payload'; patternId: string }
  | { status: 'invalid'; reason: string };

/**
 * Cổng tham chiếu cho mọi lời gọi tool: (1) lọc credential trên payload THÔ (trước khi parse, để không trường nào bị bỏ qua)
 * cho mọi tool không được miễn; (2) parse đúng schema. Tool lạ ⇒ lọc rồi `invalid`.
 */
export function screenToolPayload(tool: string, rawArgs: unknown): ScreenResult {
  if (requiresCredentialFilter(tool)) {
    const hit = findCredentialLike(rawArgs);
    if (hit) return { status: 'denied', code: 'credential_like_payload', patternId: hit.patternId };
  }
  if (!(MCP_TOOLS as readonly string[]).includes(tool)) return { status: 'invalid', reason: `tool lạ: ${tool}` };
  const parsed = ToolArgs[tool as McpToolName].safeParse(rawArgs);
  if (!parsed.success) return { status: 'invalid', reason: parsed.error.issues.map((i) => i.message).join('; ') };
  return { status: 'ok', tool: tool as McpToolName, args: parsed.data };
}

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
