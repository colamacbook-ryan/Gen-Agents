import { z } from 'zod';
import { ENTITY_TYPES, type EntityPrefix } from './ids.ts';

// Hợp đồng MCP gateway (BUILD-PLAN §B.4 `gateway/`, STD-08 §3–§5; CNS-133).
//
// LUẬT LỌC CREDENTIAL LÀ DEFAULT-DENY, KHÔNG CÓ NGOẠI LỆ (CNS-133, INT-06):
//   - `screenToolPayload` quét payload THÔ của MỌI tool (kể cả tên tool lạ) bằng bộ phát hiện credential TRƯỚC khi parse,
//     thực thi, ghi bền hay gửi ra. Khớp ⇒ `denied` mã `credential_like_payload`; audit chỉ lưu hash đoạn khớp.
//     Không tool nào được bỏ qua bước quét (review bảo mật M0 bắt hai lần: danh sách cho phép thủ công, rồi miễn quét
//     cho tool "chỉ nhận anchor" trong khi slug anchor vẫn chở được token chữ thường / hex).
//   - Riêng biệt với quét: `STRICT_SCHEMA_TOOLS` là các tool mà MỌI tham số có schema chặt (enum / số / chuỗi neo ^…$ từ
//     registry cố định). Đó chỉ là cam kết về schema (lớp phòng thủ thứ hai), KHÔNG phải miễn quét.
//   - Anchor chỉ nhận tên bảng / màn / panel trong registry cố định của contracts + display_id có prefix đã đăng ký.
// Bộ phát hiện dùng chung thật (che log + chặn payload, gồm biến thể) thuộc packages/security (L-SEC, M1) và PHẢI phủ ít nhất
// `CREDENTIAL_PATTERNS` dưới đây; `screenToolPayload` là cổng tham chiếu v0 mà gateway (L-GW) giữ nguyên ngữ nghĩa.

// ---------------------------------------------------------------- anchor + payload Ghim (STD-08 §1, §3)
/** Mã màn hình (FRONTEND-SPEC) cho anchor vùng `region:…@screen:<mã>`. Thêm màn = PR "contract". */
export const ANCHOR_SCREENS = [
  'g1',
  'g2',
  'a0',
  'a1',
  'a2',
  'a3',
  'a4',
  'a5',
  'a6',
  'a7',
  'a8',
  'a9',
  'a10',
  'a11',
  'o1',
  'o2',
  'o3',
  'o4',
] as const;

/** Panel có anchor riêng (STD-08 §1, vd `panel:formula-bar`). [ĐỀ XUẤT — L0] — thêm panel = PR "contract". */
export const ANCHOR_PANELS = [
  'formula-bar',
  'query-box',
  'context-bar',
  'composer',
  'chat',
  'inspector',
  'changeset-tray',
  'log-stream',
  'tree',
  'terminal',
  'token-meter',
  'notifications',
  'palette',
] as const;

/** Lưới có anchor = bảng có display_id (ENTITY_TYPES); hàng = display_id cùng prefix của bảng đó. */
export const ANCHOR_GRID_TABLES = [...new Set(Object.values(ENTITY_TYPES))].sort();

const alt = (xs: readonly string[]) => xs.map((x) => x.replace(/[-]/g, '\\-')).join('|');
const PREFIX_ALT = alt(Object.keys(ENTITY_TYPES).sort((a, b) => b.length - a.length));
const DISPLAY_ID = `(?:${PREFIX_ALT})-\\d{4,8}`;

/**
 * Anchor ổn định gắn ID dữ liệu thật (STD-08 §1). Ngữ pháp ĐÓNG — không có slug tự do:
 *   grid:<bảng ENTITY_TYPES>/row:<display_id cùng prefix>[/col:<A–ZZZ>] · panel:<ANCHOR_PANELS>
 *   role:RL-… · msg:MSG-… · file:AT-… · row:<display_id> · region:x,y,w,h@screen:<ANCHOR_SCREENS>
 * Phần số dài nhất là 8 chữ số (display_seq) — không chở được chuỗi số / hex / token.
 */
export const ANCHOR_RE = new RegExp(
  `^(?:grid:(?:${alt(ANCHOR_GRID_TABLES)})/row:${DISPLAY_ID}(?:/col:[A-Z]{1,3})?|panel:(?:${alt(ANCHOR_PANELS)})` +
    `|role:RL-\\d{4,8}|msg:MSG-\\d{4,8}|file:AT-\\d{4,8}|row:${DISPLAY_ID}` +
    `|region:\\d{1,5},\\d{1,5},\\d{1,5},\\d{1,5}@screen:(?:${alt(ANCHOR_SCREENS)}))$`,
);

/** Lưới `grid:<bảng>/row:<PREFIX-…>`: prefix của hàng phải là prefix của chính bảng đó. */
function gridRowMatchesTable(anchor: string): boolean {
  const m = /^grid:([a-z_]+)\/row:([A-Z]{2,3})-/.exec(anchor);
  if (!m) return true;
  return ENTITY_TYPES[m[2] as EntityPrefix] === m[1];
}

export const Anchor = z
  .string()
  .max(120)
  .regex(ANCHOR_RE, 'anchor không đúng ngữ pháp STD-08 §1 (bảng / màn / panel phải thuộc registry)')
  .refine(gridRowMatchesTable, 'anchor lưới: prefix của hàng không thuộc bảng của lưới');

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
 * Tool có MỌI tham số theo schema chặt (lớp phòng thủ thứ hai). KHÔNG phải miễn quét: `screenToolPayload` vẫn quét mọi tool.
 * Test contracts: tool trong danh sách này mà có trường tự do (string tự do / z.json / record / any) ⇒ đỏ.
 */
export const STRICT_SCHEMA_TOOLS = ['navigate', 'tour'] as const satisfies readonly McpToolName[];

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

/** Tool khai là "schema chặt" mà có trường tự do ⇒ vi phạm. Gateway gọi lúc khởi động, khác rỗng thì từ chối chạy. */
export function strictSchemaViolations(
  registry: Record<string, z.ZodType>,
  tools: readonly string[],
): Array<{ tool: string; fields: string[] }> {
  const out: Array<{ tool: string; fields: string[] }> = [];
  for (const tool of tools) {
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

// ---------------------------------------------------------------- giới hạn kích thước (chặn TRƯỚC khi quét)
/**
 * Trần cứng cho payload thô của MỘT lời gọi tool. Vượt trần ⇒ `denied` mã `payload_too_large`, KHÔNG quét (STD-11 1.10).
 * Chuỗi lớn nhất schema cho phép là 4096 ký tự (send_telegram.text); trường json (newValue, items, value) cần chỗ cho
 * một khối instruction / skill ⇒ trần mỗi chuỗi 16 384 ký tự, cả payload 65 536 ký tự (khoá + giá trị), sâu 32, 10 000 nút.
 */
export const TOOL_PAYLOAD_LIMITS = {
  maxStringChars: 16_384,
  maxTotalChars: 65_536,
  maxDepth: 32,
  maxNodes: 10_000,
} as const;

/** Đo payload mà không đi quá trần: dừng ngay khi vượt (không duyệt hết mảng 1 triệu phần tử). null = trong trần. */
export function payloadLimitExceeded(value: unknown): string | null {
  let nodes = 0;
  let chars = 0;
  const stack: Array<{ v: unknown; d: number }> = [{ v: value, d: 0 }];
  while (stack.length > 0) {
    const { v, d } = stack.pop() as { v: unknown; d: number };
    if (++nodes > TOOL_PAYLOAD_LIMITS.maxNodes) return 'quá nhiều nút';
    if (d > TOOL_PAYLOAD_LIMITS.maxDepth) return 'lồng quá sâu';
    if (typeof v === 'string') {
      if (v.length > TOOL_PAYLOAD_LIMITS.maxStringChars) return 'chuỗi quá dài';
      chars += v.length;
    } else if (Array.isArray(v)) {
      if (v.length > TOOL_PAYLOAD_LIMITS.maxNodes) return 'mảng quá dài';
      for (const x of v) stack.push({ v: x, d: d + 1 });
    } else if (v !== null && typeof v === 'object') {
      const keys = Object.keys(v);
      if (keys.length > TOOL_PAYLOAD_LIMITS.maxNodes) return 'quá nhiều khoá';
      for (const k of keys) {
        if (k.length > TOOL_PAYLOAD_LIMITS.maxStringChars) return 'khoá quá dài';
        chars += k.length;
        stack.push({ v: (v as Record<string, unknown>)[k], d: d + 1 });
      }
    } else if (v !== null && typeof v !== 'number' && typeof v !== 'boolean') {
      return `kiểu không phải JSON: ${typeof v}`;
    }
    if (chars > TOOL_PAYLOAD_LIMITS.maxTotalChars) return 'payload quá lớn';
  }
  return null;
}

// ---------------------------------------------------------------- bộ phát hiện credential (tối thiểu, BUILD-PLAN §B.4)
// Chạy TUYẾN TÍNH: tách chuỗi thành các "đoạn token" tối đại bằng một regex một lớp ký tự (không lồng, không lookahead),
// rồi kiểm từng mẫu bằng code (indexOf + đếm). Không regex nào ở đây có quantifier lồng hoặc lookahead chứa * / +.

/** Ký tự token [0-9A-Za-z_-] — so mã ký tự, không regex. */
function isTokenCode(c: number): boolean {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 45;
}

// runEnd[i] = vị trí kết thúc của đoạn token tối đại chứa i (hoặc i nếu s[i] không phải ký tự token). Tính MỘT lần mỗi chuỗi
// (đi ngược, O(n)) và dùng chung cho mọi bộ phát hiện ⇒ các lần xét tiền tố chồng nhau ("sk-sk-sk-…", "eyJeyJ…") không quét lại.
let cachedString: string | null = null;
let cachedRunEnd: Int32Array = new Int32Array(0);
function runEndOf(s: string): Int32Array {
  if (s === cachedString) return cachedRunEnd;
  const end = new Int32Array(s.length + 1);
  end[s.length] = s.length;
  for (let i = s.length - 1; i >= 0; i--) {
    end[i] = isTokenCode(s.charCodeAt(i)) ? (end[i + 1] as number) : i;
  }
  cachedString = s;
  cachedRunEnd = end;
  return end;
}

/** Số ký tự token liền nhau bắt đầu tại `from` — O(1) nhờ runEnd. */
function tokenRunLength(s: string, from: number): number {
  if (from >= s.length) return 0;
  return (runEndOf(s)[from] as number) - from;
}

/** Có xuất hiện `prefix` mà ngay sau đó là ≥ `min` ký tự token không? indexOf + O(1) mỗi lần ⇒ tuyến tính. */
function prefixThenRun(s: string, prefix: string, min: number, needWordStart = false): boolean {
  let from = 0;
  for (;;) {
    const at = s.indexOf(prefix, from);
    if (at < 0) return false;
    if (
      (!needWordStart || at === 0 || !isTokenCode(s.charCodeAt(at - 1))) &&
      tokenRunLength(s, at + prefix.length) >= min
    ) {
      return true;
    }
    from = at + 1;
  }
}

/** JWT: eyJ… . … . … — ba đoạn token ≥ 8 nối bằng dấu chấm. */
function hasJwt(s: string): boolean {
  let from = 0;
  for (;;) {
    const at = s.indexOf('eyJ', from);
    if (at < 0) return false;
    const a = tokenRunLength(s, at);
    if (a >= 8 && s[at + a] === '.') {
      const b = tokenRunLength(s, at + a + 1);
      if (b >= 8 && s[at + a + 1 + b] === '.' && tokenRunLength(s, at + a + 2 + b) >= 8) return true;
    }
    // mọi 'eyJ' sau đó trong CÙNG đoạn token có cùng điểm kết thúc ⇒ cùng kết quả (đoạn ngắn hơn) ⇒ nhảy qua cả đoạn
    from = at + Math.max(1, a);
  }
}

/** Đoạn token liền ≥ 32 ký tự có cả chữ số lẫn chữ cái (hex 40, base64url thường…). Một lượt quét. */
function hasLongTokenRun(s: string): boolean {
  let run = 0;
  let digit = false;
  let alpha = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (isTokenCode(c)) {
      run++;
      if (c >= 48 && c <= 57) digit = true;
      else if (c !== 95 && c !== 45) alpha = true;
      if (run >= 32 && digit && alpha) return true;
    } else {
      run = 0;
      digit = false;
      alpha = false;
    }
  }
  return false;
}

/** Bộ phát hiện ở packages/security phải phủ ÍT NHẤT các mẫu này (+ biến thể). Canary do CLI giả ghi: `GA-CANARY-<uuid>`. */
export const CREDENTIAL_DETECTORS: ReadonlyArray<{ id: string; test: (s: string) => boolean }> = [
  { id: 'jwt', test: hasJwt },
  { id: 'google_oauth_access_token', test: (s) => prefixThenRun(s, 'ya29.', 10) },
  { id: 'google_refresh_token', test: (s) => prefixThenRun(s, '1//0', 10) },
  { id: 'google_api_key', test: (s) => prefixThenRun(s, 'AIza', 30) },
  { id: 'vendor_api_key_sk_ant', test: (s) => prefixThenRun(s, 'sk-ant-', 10) },
  // regex có quantifier GIỚI HẠN ({0,40}) ⇒ tuyến tính
  { id: 'pem_private_key', test: (s) => /-----BEGIN [A-Z ]{0,40}PRIVATE KEY-----/.test(s) },
  { id: 'refresh_token_field', test: (s) => /["']?refresh_token["']?\s{0,8}[:=]/i.test(s) },
  { id: 'canary', test: (s) => /GA-CANARY-[0-9a-f-]{8}/i.test(s) },
  /** Khoá kiểu `sk-…` của các hãng (không riêng một hãng). */
  { id: 'generic_sk_key', test: (s) => prefixThenRun(s, 'sk-', 20, true) },
  /** ULID (26) và display_id không chạm ngưỡng; UUID có gạch nối (36) BỊ bắt — chấp nhận (không phải ID của hệ). */
  { id: 'long_token_run', test: hasLongTokenRun },
];

/** Tên khoá JSON mang credential: payload có khoá này (bất kể giá trị) ⇒ chặn. */
export const CREDENTIAL_KEY_RE = /^(?:refresh_token|access_token|id_token|client_secret|private_key)$/i;

/**
 * Duyệt mọi chuỗi (giá trị và khoá) trong payload; trả mẫu khớp đầu tiên, không trả đoạn khớp (gateway băm).
 * Người gọi PHẢI chặn kích thước trước (`payloadLimitExceeded`) — screenToolPayload làm đúng thứ tự đó.
 */
export function findCredentialLike(value: unknown, depth = 0): { patternId: string } | null {
  if (depth > TOOL_PAYLOAD_LIMITS.maxDepth) return { patternId: 'too_deep' };
  if (typeof value === 'string') {
    for (const d of CREDENTIAL_DETECTORS) if (d.test(value)) return { patternId: d.id };
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
  | { status: 'denied'; code: 'payload_too_large'; reason: string }
  | { status: 'invalid'; reason: string };

/**
 * Cổng tham chiếu cho mọi lời gọi tool, đúng thứ tự:
 *   (1) chặn kích thước payload THÔ (và tên tool) — vượt trần ⇒ denied, không quét;
 *   (2) quét credential trên payload thô của MỌI tool (trước khi parse, để không trường nào — kể cả trường lạ — bị bỏ qua);
 *   (3) parse đúng schema. Tool lạ ⇒ quét rồi `invalid`.
 */
export function screenToolPayload(tool: string, rawArgs: unknown): ScreenResult {
  const tooBig = tool.length > 64 ? 'tên tool quá dài' : payloadLimitExceeded(rawArgs);
  if (tooBig) return { status: 'denied', code: 'payload_too_large', reason: tooBig };
  // luôn quét — không có tool nào, không có cờ nào bỏ qua được bước này
  const hit = findCredentialLike(tool) ?? findCredentialLike(rawArgs);
  if (hit) return { status: 'denied', code: 'credential_like_payload', patternId: hit.patternId };
  if (!(MCP_TOOLS as readonly string[]).includes(tool)) return { status: 'invalid', reason: `tool lạ: ${tool}` };
  const parsed = ToolArgs[tool as McpToolName].safeParse(rawArgs);
  if (!parsed.success) return { status: 'invalid', reason: parsed.error.issues.map((i) => i.message).join('; ') };
  return { status: 'ok', tool: tool as McpToolName, args: parsed.data };
}

// ---------------------------------------------------------------- từ chối
export const TOOL_DENIAL_CODES = [
  /** Payload giống credential (JWT, ya29., sk-ant-, 1//0, AIza, PEM, "refresh_token") hoặc canary. */
  'credential_like_payload',
  /** Payload thô vượt TOOL_PAYLOAD_LIMITS — từ chối trước khi quét. */
  'payload_too_large',
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
