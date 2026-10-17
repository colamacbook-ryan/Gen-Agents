import { z } from 'zod';
import { BOUNDS, BoundedJson } from './bounds.ts';
import { ENTITY_TYPES, type EntityPrefix } from './ids.ts';
import { CERTAINTY_LEVELS } from './sessions.ts';

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
  entity: z.string().min(1).max(BOUNDS.name),
  /** display_id của hàng (vd SK-0004). */
  id: z.string().min(1).max(BOUNDS.displayId),
  column: z.string().max(BOUNDS.name).nullable(),
  label: z.string().max(200),
  /** Đã cắt theo ngân sách token. */
  snapshot: z.string().max(16_384),
  snapshotHash: z.string().min(1).max(128),
  version: z.number().int().nonnegative().nullable(),
});
export type PinnedAnchor = z.infer<typeof PinnedAnchor>;

export const PinPayload = z.strictObject({
  text: z.string().max(BOUNDS.chatText),
  screen: z.strictObject({
    route: z.string().max(200),
    role: z.string().max(BOUNDS.displayId).nullable(),
    tab: z.string().max(64).nullable(),
    filters: z.string().max(500).nullable(),
  }),
  anchors: z.array(PinnedAnchor).max(20),
  attachments: z
    .array(
      z.strictObject({
        id: z.string().max(26),
        name: z.string().max(255),
        mime: z.string().max(127),
        size: z.number().int().nonnegative(),
      }),
    )
    .max(10),
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
    field: z.string().min(1).max(BOUNDS.name),
    itemIndex: z.number().int().min(0).default(0),
    value: BoundedJson,
  }),
  report_task: z.strictObject({
    taskId: z.string().max(26).nullable(),
    status: z.enum(['done', 'failed', 'blocked', 'waiting_approval']),
    summary: z.string().max(4000),
    /** Role tự khai chưa chắc (nguồn chat_messages.certainty / avatar 'unsure', G-13). */
    certainty: z.enum(CERTAINTY_LEVELS).nullable(),
  }),
  /**
   * chatRef = display_id của một hàng telegram_allowlist (AL-…) — gateway tự tra chat_id từ allowlist, KHÔNG BAO GIỜ nhận
   * chat_id / username từ Role (review tay M0, LOW: không định tuyến bằng chuỗi tự do).
   */
  send_telegram: z.strictObject({ chatRef: z.string().regex(/^AL-\d{4,8}$/), text: z.string().min(1).max(4096) }),
  propose_change: z.strictObject({
    title: z.string().min(1).max(200),
    items: z.array(BoundedJson).min(1).max(BOUNDS.smallList),
  }),
  highlight: z.strictObject({ anchor: Anchor, label: z.string().max(120).nullable() }),
  navigate: z.strictObject({ anchor: Anchor }),
  annotate: z.strictObject({ anchor: Anchor, note: z.string().max(500), n: z.number().int().min(1).max(20) }),
  tour: z.strictObject({ anchors: z.array(Anchor).min(1).max(20) }),
  propose_edit: z.strictObject({ anchor: Anchor, newValue: BoundedJson }),
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
  // JSON tự do CÓ TRẦN (`BoundedJson`, thay z.json()) vẫn là trường tự do về NGỮ NGHĨA (hình dạng do tầng dịch vụ kiểm): nhận
  // theo định danh, không đi vào các nhánh union bên trong.
  if (schema === BoundedJson) return [path];
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
// Chạy TUYẾN TÍNH: regex tiền tố có quantifier GIỚI HẠN ({N}), regex một lớp ký tự cho đoạn token, JWT / PEM kiểm bằng code
// (indexOf + đếm). Không regex nào ở đây có quantifier lồng hoặc lookahead chứa * / + (lint no-redos-regex); test 1 MiB.
// Ngữ nghĩa phải KHÔNG YẾU HƠN bộ regex tham chiếu (test đối chiếu `mcp-detector-differential.test.ts`).

/** Ký tự "từ" của `\b` trong regex JS: [0-9A-Za-z_] (KHÔNG gồm '-'). */
function isWordCode(c: number): boolean {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
}

/** Ký tự token [0-9A-Za-z_-] — so mã ký tự, không regex. */
function isTokenCode(c: number): boolean {
  return isWordCode(c) || c === 45;
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

/**
 * PEM: `-----BEGIN ` + chuỗi [A-Z ] bất kỳ dài + `PRIVATE KEY-----` (tương đương regex tham chiếu `[A-Z ]*`, không giới hạn
 * độ dài như bản {0,40} cũ). Đoạn [A-Z ] tối đại sau BEGIN phải kết thúc bằng `PRIVATE KEY` và ngay sau là `-----`
 * ('-' không thuộc [A-Z ]). Các đoạn sau những `-----BEGIN ` khác nhau rời nhau ⇒ tuyến tính.
 */
function hasPemPrivateKey(s: string): boolean {
  const head = '-----BEGIN ';
  const tail = 'PRIVATE KEY';
  let from = 0;
  for (;;) {
    const at = s.indexOf(head, from);
    if (at < 0) return false;
    const start = at + head.length;
    let end = start;
    while (end < s.length) {
      const c = s.charCodeAt(end);
      if (!((c >= 65 && c <= 90) || c === 32)) break;
      end++;
    }
    if (end - start >= tail.length && s.startsWith(tail, end - tail.length) && s.startsWith('-----', end)) return true;
    from = Math.max(at + 1, end);
  }
}

/**
 * Tên khoá mang credential — khoá object trong payload (bất kể giá trị) và vế trái của phép gán trong chuỗi thô
 * (`credential_assignment`). Không gồm từ chung chung (`password`, `token`, `secret`) để không chặn câu văn thường.
 */
export const CREDENTIAL_KEY_NAMES = [
  'refresh_token',
  'access_token',
  'id_token',
  'auth_token',
  'session_token',
  'bearer_token',
  'client_secret',
  'secret_key',
  'private_key',
  'api_key',
  'apikey',
  'x-api-key',
  'api_secret',
  'api_token',
  'aws_secret_access_key',
  // L-RT / L-SEC đề xuất (Gen duyệt): chỉ khớp ở dạng KHOÁ object hoặc PHÉP GÁN có giá trị ≥ 8 ký tự — không khớp từ trần
  // trong câu văn ("quên password?", "password: tối thiểu 12 ký tự" không bị chặn; test đo trên văn bản thật của repo).
  'password',
  'passwd',
] as const;

/** Trần độ dài tên khoá TRƯỚC khi chuẩn hoá (= trần một chuỗi của payload, đã chặn trước khi quét). */
export const CREDENTIAL_KEY_NAME_MAX_CHARS = TOOL_PAYLOAD_LIMITS.maxStringChars;

/** Trần độ dài SAU NFKC của một chuỗi được quét (NFKC có thể nở một ký tự thành tới 18, vd U+FDFA). */
export const NFKC_MAX_CHARS = TOOL_PAYLOAD_LIMITS.maxStringChars;
const NFKC_CHUNK = 2048;

/**
 * NFKC có trần (security review: DoS — chuỗi đã qua trần kích thước vẫn phình tới 18× rồi bị quét): chuẩn hoá theo từng
 * khúc ≤ 2 048 code unit (không cắt đôi cặp surrogate), cộng dồn độ dài và DỪNG ngay khi vượt `max` ⇒ trả null (người gọi
 * coi là too_large, fail-closed). Việc làm ≤ max + 18 × khúc. Tính đúng độ dài thật (không ước lượng bi quan) ⇒ văn bản
 * tiếng Việt có dấu (NFKC giữ nguyên) không bị từ chối nhầm. Ghép khúc có thể khác NFKC cả chuỗi ở chỗ khúc cắt giữa một
 * chuỗi ký tự tổ hợp — không ảnh hưởng tên credential (ASCII sau NFKC, ký tự fullwidth chuẩn hoá độc lập từng ký tự).
 */
export function boundedNfkc(s: string, max: number = NFKC_MAX_CHARS): string | null {
  if (!/[^\t\n\r\x20-\x7e]/.test(s)) return s.length > max ? null : s; // ASCII: NFKC giữ nguyên
  const parts: string[] = [];
  let total = 0;
  for (let i = 0; i < s.length; ) {
    let end = Math.min(s.length, i + NFKC_CHUNK);
    const last = s.charCodeAt(end - 1);
    if (end < s.length && last >= 0xd800 && last <= 0xdbff) end--; // không tách cặp surrogate
    const part = s.slice(i, end).normalize('NFKC');
    total += part.length;
    if (total > max) return null;
    parts.push(part);
    i = end;
  }
  return parts.join('');
}

/**
 * Chuẩn hoá tên khoá — MỘT nguồn cho contracts và @ga/security (security review MEDIUM: bản chỉ bỏ `_` / `-` làm lọt
 * `"refresh token"`, `"refresh.token"`, `"refresh:token"`, `"refresh_token "`, fullwidth `\uff52\uff45…_token`):
 *   NFKC (fullwidth / ký tự tương thích → ASCII) → chữ thường → bỏ MỌI ký tự ngoài a–z0–9.
 * Tên dài hơn CREDENTIAL_KEY_NAME_MAX_CHARS ⇒ RangeError (người gọi chặn kích thước trước — xem credentialKeyMatches).
 */
export function normalizeCredentialName(name: string): string {
  if (name.length > CREDENTIAL_KEY_NAME_MAX_CHARS) throw new RangeError('tên khoá vượt trần trước khi chuẩn hoá');
  const nf = boundedNfkc(name);
  if (nf === null) throw new RangeError('tên khoá vượt trần sau NFKC');
  return nf.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Dạng chuẩn hoá KHÔNG NFKC (= bản cũ của packages/security) — giữ để bản mới ⊇ bản cũ (vd `refresh①token`). */
function plainCredentialName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Khoá object có thuộc tập tên (đã chuẩn hoá bằng normalizeCredentialName) không — so CẢ dạng NFKC lẫn dạng cũ ⇒ không hẹp
 * hơn bản nào. Vượt trần ⇒ coi là khớp (fail-closed). @ga/security dùng hàm này với tập tên của mình.
 */
export function credentialKeyMatches(key: string, normalizedNames: ReadonlySet<string>): boolean {
  if (key.length > CREDENTIAL_KEY_NAME_MAX_CHARS) return true;
  const nf = boundedNfkc(key);
  if (nf === null) return true; // phình quá trần sau NFKC ⇒ khớp (fail-closed)
  return (
    normalizedNames.has(nf.toLowerCase().replace(/[^a-z0-9]/g, '')) || normalizedNames.has(plainCredentialName(key))
  );
}

export const CREDENTIAL_KEY_NAMES_NORMALIZED: ReadonlySet<string> = new Set(
  CREDENTIAL_KEY_NAMES.map(normalizeCredentialName),
);

/**
 * Vế trái của phép gán trong CHUỖI THÔ chỉ khớp theo ngữ pháp `[_-]*` giữa các phần (không mở rộng ra mọi dấu câu — tránh
 * báo nhầm câu văn), không phân biệt hoa thường; chuỗi có ký tự ngoài ASCII được thử thêm bản NFKC (fullwidth…).
 */
const CREDENTIAL_NAMES_ALT = [...CREDENTIAL_KEY_NAMES_NORMALIZED]
  .map((n) => {
    const raw = CREDENTIAL_KEY_NAMES.find((k) => normalizeCredentialName(k) === n) as string;
    return raw.split(/[_-]/).join('[_-]*');
  })
  .join('|');

/**
 * Chuỗi thô chứa phép gán credential (security review L-RT — parser-differential: khoá JSON NHÚNG trong chuỗi, vd log
 * `INFO got {"refresh_token":"…"}` hay `access_token=…`, không phải khoá object nên CREDENTIAL_KEY_RE không thấy).
 * Hai `\s*` nối tiếp (không lồng), phần giá trị giới hạn {8} ⇒ tuyến tính (đo trên 1 MiB đối nghịch trong test).
 */
const CREDENTIAL_ASSIGNMENT_RE = new RegExp(
  `(?:${CREDENTIAL_NAMES_ALT})["']?\\s*[:=]\\s*["']?[A-Za-z0-9._~+/=-]{8}`,
  'i',
);

/**
 * Thử regex trên chuỗi, và trên bản NFKC CÓ TRẦN nếu chuỗi có ký tự ngoài ASCII (fullwidth / ký tự tương thích → ASCII).
 * Vượt trần sau NFKC ⇒ true (fail-closed; findCredentialLike đã trả too_large trước khi tới đây).
 */
function testWithNfkc(s: string, re: RegExp): boolean {
  if (re.test(s)) return true;
  if (!/[^\t\n\r\x20-\x7e]/.test(s)) return false;
  const nf = boundedNfkc(s);
  return nf === null || re.test(nf);
}

/**
 * Đoạn token tối đại ≥ 32: lookbehind MỘT ký tự (không quantifier) ⇒ chỉ thử ở ĐẦU đoạn, mỗi đoạn quét một lần (nhanh ~3×
 * so với thử ở mọi vị trí trên chuỗi nhiều đoạn ngắn); lastIndex nhảy qua cả đoạn ⇒ tuyến tính.
 */
const LONG_TOKEN_RUN_RE = /(?<![0-9A-Za-z_-])[0-9A-Za-z_-]{32,}/g;

/**
 * Đoạn token liền ≥ 32 ký tự có CẢ chữ hoa, chữ thường VÀ chữ số (Gen quyết 2026-10-16, CNS-169). Đoạn chỉ gồm chữ số hex
 * + '-' (hex mọi độ dài / hoa thường, UUID) KHÔNG bị chặn — mã commit, checksum, UUID là dữ liệu làm việc hợp lệ (sink MCP
 * do owner kiểm soát; lối ra ngoài qua egress allowlist).
 * Phần bù cho key hex / chữ thường: chỉ khi nó đứng cạnh TÊN — `credential_assignment` (tên credential mọi kiểu viết
 * snake / camel / kebab + `:` / `=` + ≥ 8 ký tự), khoá object tên credential (`credential_field_name`, cùng chuẩn hoá) và
 * `env_secret_assignment` (`ABC_SECRET=…`). Secret base64 có `+` / `/` (bị cắt thành đoạn ngắn ở đây) do `base64_secret_run`.
 * KHÔNG bù (rủi ro chấp nhận theo CNS-169): key hex / chỉ chữ thường đứng một mình, không tên, không tiền tố hãng.
 */
function hasHighEntropyRun(s: string): boolean {
  const re = LONG_TOKEN_RUN_RE;
  re.lastIndex = 0;
  for (let m = re.exec(s); m !== null; m = re.exec(s)) {
    const r = m[0];
    if (/\d/.test(r) && /[a-z]/.test(r) && /[A-Z]/.test(r) && /[G-Zg-z_]/.test(r)) return true;
  }
  return false;
}

/** `\s` của regex JS (WhiteSpace + LineTerminator), so mã ký tự. */
function isJsSpace(c: number): boolean {
  return (
    (c >= 9 && c <= 13) ||
    c === 32 ||
    c === 0xa0 ||
    c === 0x1680 ||
    (c >= 0x2000 && c <= 0x200a) ||
    c === 0x2028 ||
    c === 0x2029 ||
    c === 0x202f ||
    c === 0x205f ||
    c === 0x3000 ||
    c === 0xfeff
  );
}

/** Ứng viên A: scheme đặc biệt ở BẤT KỲ đâu (không cần ranh giới trái) — alternation chuỗi cố định, không quantifier. */
const SPECIAL_SCHEME_ANYWHERE_RE = /(?:https?|wss?|ftp|file):/gi;

/**
 * Mật khẩu trong URL — XẤP XỈ TRÊN parser WHATWG (fail-closed, Gen quyết sau ba vòng review parser-differential: mô phỏng
 * đúng từng nhánh của parser thì lỗ nào cũng phải vá riêng ⇒ chặn RỘNG hơn parser, không bao giờ hẹp hơn):
 *   1. bỏ mọi TAB / LF / CR (parser URL bỏ trước khi parse; trần kích thước đã đặt trước bước này);
 *   2. ứng viên A — mọi `http: https: ws: wss: ftp: file:` (không phân biệt hoa thường, KHÔNG cần ranh giới trái:
 *      `1.https:`, `-https:`, `x.ftp:` vẫn là ứng viên): bỏ qua `[/\\]*`, authority tới ký tự đầu tiên trong `/ \\ ? #` hoặc
 *      khoảng trắng;
 *   3. ứng viên B — mọi `://` (scheme bất kỳ): authority tới ký tự đầu tiên trong `/ ? #` hoặc khoảng trắng;
 *   4. authority có `@` và đoạn trước `@` CUỐI chứa `:` ⇒ bắt (tên đăng nhập có thể rỗng).
 * Báo nhầm tăng nhẹ được chấp nhận (dòng chứa `user:pass@` sau một scheme). Khoảng trắng kết thúc authority (quét văn bản).
 * Tuyến tính: authority của ứng viên B không chồng nhau; ứng viên A nằm trong authority đã quét (không khớp) của ứng viên A
 * trước thì nhảy qua (không thể khớp) ⇒ mỗi ký tự được quét tối đa một lần cho A và một lần cho B (`https:https:…`, `://a:`).
 */
function hasUrlUserinfo(raw: string): boolean {
  if (!raw.includes('@') || !raw.includes(':')) return false;
  const s = /[\t\n\r]/.test(raw) ? raw.replace(/[\t\n\r]/g, '') : raw;
  const n = s.length;
  /** Quét authority [start, …) tới ký tự dừng; trả [khớp?, vị trí dừng]. `backslash` = '\\' cũng dừng (ứng viên A). */
  const scan = (start: number, backslash: boolean): [boolean, number] => {
    let firstColon = -1;
    let lastAt = -1;
    let i = start;
    for (; i < n; i++) {
      const c = s.charCodeAt(i);
      if (c === 47 || c === 63 || c === 35 || (backslash && c === 92)) break;
      if ((c <= 32 || c >= 127) && isJsSpace(c)) break;
      if (c === 58) {
        if (firstColon < 0) firstColon = i;
      } else if (c === 64) lastAt = i;
    }
    return [firstColon >= 0 && firstColon < lastAt, i];
  };
  // A: ứng viên nằm TRONG authority đã quét không khớp của ứng viên A trước (cùng tập dừng) cũng không thể khớp — ':' đầu
  // tiên của nó không sớm hơn, '@' cuối không muộn hơn ⇒ nhảy qua; ứng viên có gạch ngay sau ':' bắt đầu SAU vị trí dừng.
  const re = SPECIAL_SCHEME_ANYWHERE_RE;
  re.lastIndex = 0;
  let doneA = 0;
  for (let m = re.exec(s); m !== null; m = re.exec(s)) {
    let i = m.index + m[0].length;
    while (i < n && (s.charCodeAt(i) === 47 || s.charCodeAt(i) === 92)) i++;
    re.lastIndex = m.index + 1;
    if (i < doneA) continue;
    const [hit, end] = scan(i, true);
    if (hit) return true;
    doneA = end;
  }
  // B: authority của các `://` không chồng nhau (authority dừng ở '/', mà `://` kế tiếp chứa '/')
  for (let at = s.indexOf('://'); at >= 0; at = s.indexOf('://', at + 1)) {
    const [hit, end] = scan(at + 3, false);
    if (hit) return true;
    if (end > at + 3) at = end - 3;
  }
  return false;
}

/** Đoạn tối đại trên lớp base64 [A-Za-z0-9+/=_-] ≥ 40 (lookbehind một ký tự ⇒ chỉ thử ở đầu đoạn, tuyến tính). */
const BASE64_RUN_RE = /(?<![A-Za-z0-9+/=_-])[A-Za-z0-9+/=_-]{40,}/g;

/**
 * Secret base64 chuẩn có `+` / `/` (vd secret 40 ký tự kiểu AWS) — high_entropy_run không thấy vì `+` / `/` cắt nó thành
 * đoạn < 32 (review tay M0, LOW: ~58 % mẫu 40 ký tự lọt). Bắt khi đoạn [A-Za-z0-9+/=_-] ≥ 40 có `+` hoặc `/` VÀ có một
 * đoạn con giữa hai `/` dài ≥ 10, đủ hoa + thường + số, có chữ ngoài hex, mật độ đổi lớp (hoa ↔ thường ↔ số giữa hai ký tự
 * chữ / số liền kề) ≥ 1/4. Base64 ngẫu nhiên đổi lớp ~65 %; đoạn của đường dẫn / URL là từ / mã (`ASSET_MANIFEST`,
 * `CNS-2026-10-15-coreagent-r5`, đổi lớp < 10 %) hoặc mã commit hex. Đo: 99,73 % secret base64 40 ký tự có + / bị chặn
 * (cùng các detector khác); 0 báo nhầm trên 2 168 đường tệp + URL GitHub / raw (repo này + Second-Brain). Lần đo đầu
 * (mật độ tính trên CẢ đoạn) báo nhầm 24 URL chứa mã commit ⇒ đổi sang tính theo đoạn con. Một lượt mỗi đoạn ⇒ tuyến tính.
 */
function hasBase64SecretRun(s: string): boolean {
  const re = BASE64_RUN_RE;
  re.lastIndex = 0;
  for (let m = re.exec(s); m !== null; m = re.exec(s)) {
    const r = m[0];
    if (!/[+/]/.test(r)) continue;
    // đường dẫn / URL: mỗi đoạn giữa '/' là từ / mã (ít đổi lớp) hoặc hex — base64 có đoạn ≥ 10 đổi lớp dày, đủ 3 lớp
    for (const seg of r.split('/')) if (seg.length >= 10 && isBase64LikeSegment(seg)) return true;
  }
  return false;
}

/** Đủ hoa + thường + số, có chữ ngoài hex, và ≥ 1/4 cặp chữ / số liền kề đổi lớp (hoa ↔ thường ↔ số). */
function isBase64LikeSegment(seg: string): boolean {
  if (!/\d/.test(seg) || !/[a-z]/.test(seg) || !/[A-Z]/.test(seg) || !/[G-Zg-z]/.test(seg)) return false;
  let pairs = 0;
  let changes = 0;
  let prev = -1; // 0 = hoa, 1 = thường, 2 = số, -1 = ký tự khác
  for (let i = 0; i < seg.length; i++) {
    const c = seg.charCodeAt(i);
    const cls = c >= 65 && c <= 90 ? 0 : c >= 97 && c <= 122 ? 1 : c >= 48 && c <= 57 ? 2 : -1;
    if (cls >= 0 && prev >= 0) {
      pairs++;
      if (cls !== prev) changes++;
    }
    prev = cls;
  }
  return pairs > 0 && changes * 4 >= pairs;
}

/** Tiền tố của canary do CLI giả ghi: `GA-CANARY-<uuid>` — bằng chứng chắc duy nhất (chỉ có trong test). */
export const CANARY_PREFIX = 'GA-CANARY-';

/**
 * Bộ phát hiện ở packages/security phải phủ ÍT NHẤT các mẫu này (+ biến thể). CNS-169 (Gen quyết 2026-10-16):
 *   - chặn: tiền tố đã biết, JWT, PEM, phép gán / khoá tên credential, canary, đoạn entropy cao (hoa + thường + số ≥ 32);
 *   - KHÔNG chặn (cố ý): hex thuần mọi độ dài / hoa thường, UUID dạng chuẩn, đoạn ≥ 32 thiếu một trong ba lớp ký tự
 *     (vd base32 / base64url chỉ chữ thường) — trừ khi khớp tiền tố đã biết;
 *   - lần chặn ⇒ `denied` + audit `credential.blocked` (cảnh báo owner), KHÔNG phải harness.violation (xem CREDENTIAL_BLOCKED).
 * Regex tiền tố dùng quantifier GIỚI HẠN ({N} — "có ≥ N ký tự" ⇔ "có đúng N ký tự kế tiếp") ⇒ mỗi vị trí thử ≤ N bước.
 */
export const CREDENTIAL_DETECTORS: ReadonlyArray<{ id: string; test: (s: string) => boolean }> = [
  { id: 'jwt', test: hasJwt },
  { id: 'google_oauth_access_token', test: (s) => /ya29\.[0-9A-Za-z_-]{10}/.test(s) },
  { id: 'google_refresh_token', test: (s) => /1\/\/0[0-9A-Za-z_-]{10}/.test(s) },
  { id: 'google_api_key', test: (s) => /AIza[0-9A-Za-z_-]{30}/.test(s) },
  { id: 'vendor_api_key_sk_ant', test: (s) => /sk-ant-[0-9A-Za-z_-]{10}/.test(s) },
  /** Khoá kiểu `sk-…` của các hãng (không riêng một hãng); `\b`: '-' trước vẫn là ranh giới (`x-sk-…` bị bắt). */
  { id: 'generic_sk_key', test: (s) => /\bsk-[0-9A-Za-z_-]{20}/.test(s) },
  { id: 'stripe_secret_key', test: (s) => /\b[sr]k_(?:live|test)_[0-9A-Za-z_-]{16}/.test(s) },
  { id: 'github_token', test: (s) => /\bgh[pousr]_[0-9A-Za-z_-]{30}|\bgithub_pat_[0-9A-Za-z_-]{40}/.test(s) },
  { id: 'slack_token', test: (s) => /\bxox[abpre]-[0-9A-Za-z_-]{10}/.test(s) },
  { id: 'gitlab_token', test: (s) => /\bglpat-[0-9A-Za-z_-]{20}/.test(s) },
  // L-SEC đề xuất (Gen duyệt): ranh giới trước = lookbehind MỘT ký tự [0-9A-Za-z] (như packages/security), không quantifier
  { id: 'npm_token', test: (s) => /(?<![0-9A-Za-z])npm_[0-9A-Za-z_-]{30}/.test(s) },
  { id: 'huggingface_token', test: (s) => /(?<![0-9A-Za-z])hf_[0-9A-Za-z_-]{30}/.test(s) },
  { id: 'google_oauth_client_secret', test: (s) => /(?<![0-9A-Za-z])GOCSPX-[0-9A-Za-z_-]{20}/.test(s) },
  /** Header `Authorization: Bearer <token ≥ 16>` trong log / payload; "the bearer of …" / "Bearer short" không bắt. */
  { id: 'bearer_token', test: (s) => /(?<![0-9A-Za-z])bearer[ \t]{1,16}[0-9A-Za-z_.~+/=-]{16}/i.test(s) },
  { id: 'url_userinfo', test: hasUrlUserinfo },
  { id: 'aws_access_key_id', test: (s) => /\b(?:AKIA|ASIA)[0-9A-Z]{16}/.test(s) },
  { id: 'telegram_bot_token', test: (s) => /\b\d{8,10}:[0-9A-Za-z_-]{35}/.test(s) },
  { id: 'pem_private_key', test: hasPemPrivateKey },
  // tiền tố cố định + MỘT quantifier (\s*) ⇒ tuyến tính; refresh_token + phép gán ⇒ chặn bất kể giá trị (giữ từ v0)
  { id: 'refresh_token_field', test: (s) => testWithNfkc(s, /refresh[_-]*token["']?\s*[:=]/i) },
  { id: 'credential_assignment', test: (s) => testWithNfkc(s, CREDENTIAL_ASSIGNMENT_RE) },
  /**
   * Gán kiểu `.env` (Gen, security review "miễn hex làm lọt key hãng không prefix"): tên UPPER_SNAKE kết thúc bằng
   * _SECRET / _TOKEN / _PASSWORD / _PASSWD / _KEY / _PAT + [:=] + ≥ 8 ký tự giá trị. PHÂN BIỆT hoa thường (câu văn không
   * bắt). `\b` chỉ ở đầu đoạn từ, `[A-Z0-9_]*` không lồng, giá trị giới hạn {8} ⇒ tuyến tính (test 1 MiB `A_A_A_…`).
   */
  {
    id: 'env_secret_assignment',
    test: (s) => /\b[A-Z][A-Z0-9_]*_(?:SECRET|TOKEN|PASSWORD|PASSWD|KEY|PAT)\s*[:=]\s*["']?[^\s"']{8}/.test(s),
  },
  { id: 'canary', test: (s) => /GA-CANARY-[0-9a-f-]{8}/i.test(s) },
  { id: 'high_entropy_run', test: hasHighEntropyRun },
  { id: 'base64_secret_run', test: hasBase64SecretRun },
];

/** Dạng regex của tên (ngữ pháp chuỗi thô `[_-]*`) — giữ cho bên dùng cũ; khoá object dùng isCredentialKeyName. */
export const CREDENTIAL_KEY_RE = new RegExp(`^(?:${CREDENTIAL_NAMES_ALT})$`, 'i');

/** Khoá object có phải tên credential không — chuẩn hoá ĐẦY ĐỦ (NFKC, hoa thường, bỏ mọi ký tự ngoài a–z0–9). */
export function isCredentialKeyName(key: string): boolean {
  return credentialKeyMatches(key, CREDENTIAL_KEY_NAMES_NORMALIZED);
}

/** Mọi patternId có thể trả về (audit `credential.blocked` chỉ mang id này, không mang payload). */
/**
 * = id của CREDENTIAL_DETECTORS (đúng thứ tự, test giữ đồng bộ) + `encoded_marker_flood` (chỉ bộ quét giải mã của
 * packages/security sinh: quá nhiều dấu hiệu trong đoạn mã hoá ⇒ chặn cả chuỗi) + `credential_field_name` + `too_deep`.
 */
export const CREDENTIAL_PATTERN_IDS = [
  'jwt',
  'google_oauth_access_token',
  'google_refresh_token',
  'google_api_key',
  'vendor_api_key_sk_ant',
  'generic_sk_key',
  'stripe_secret_key',
  'github_token',
  'slack_token',
  'gitlab_token',
  'npm_token',
  'huggingface_token',
  'google_oauth_client_secret',
  'bearer_token',
  'url_userinfo',
  'aws_access_key_id',
  'telegram_bot_token',
  'pem_private_key',
  'refresh_token_field',
  'credential_assignment',
  'env_secret_assignment',
  'canary',
  'high_entropy_run',
  'base64_secret_run',
  'encoded_marker_flood',
  'credential_field_name',
  'too_deep',
  'too_large',
] as const;
export type CredentialPatternId = (typeof CREDENTIAL_PATTERN_IDS)[number];

/**
 * Duyệt mọi chuỗi (giá trị và khoá) trong payload; trả mẫu khớp đầu tiên, không trả đoạn khớp (gateway băm).
 * Người gọi PHẢI chặn kích thước trước (`payloadLimitExceeded`) — screenToolPayload làm đúng thứ tự đó.
 */
export function findCredentialLike(value: unknown, depth = 0): { patternId: string } | null {
  if (depth > TOOL_PAYLOAD_LIMITS.maxDepth) return { patternId: 'too_deep' };
  if (typeof value === 'string') {
    // trần TRƯỚC (chuỗi) và SAU NFKC — vượt ⇒ too_large (screenToolPayload trả payload_too_large), không quét tiếp
    if (value.length > TOOL_PAYLOAD_LIMITS.maxStringChars || boundedNfkc(value) === null)
      return { patternId: 'too_large' };
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
      if (isCredentialKeyName(k)) return { patternId: 'credential_field_name' };
      const hit = findCredentialLike(k, depth + 1) ?? findCredentialLike(v, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

export type ScreenResult =
  | { status: 'ok'; tool: McpToolName; args: unknown }
  | { status: 'denied'; code: 'credential_like_payload'; patternId: string; audit: CredentialBlockedAudit }
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
  if (hit?.patternId === 'too_large') {
    return { status: 'denied', code: 'payload_too_large', reason: 'chuỗi vượt trần sau chuẩn hoá NFKC' };
  }
  if (hit) {
    return {
      status: 'denied',
      code: 'credential_like_payload',
      patternId: hit.patternId,
      audit: credentialBlockedAudit(tool, hit.patternId),
    };
  }
  if (!(MCP_TOOLS as readonly string[]).includes(tool)) return { status: 'invalid', reason: `tool lạ: ${tool}` };
  const parsed = ToolArgs[tool as McpToolName].safeParse(rawArgs);
  if (!parsed.success) return { status: 'invalid', reason: parsed.error.issues.map((i) => i.message).join('; ') };
  return { status: 'ok', tool: tool as McpToolName, args: parsed.data };
}

// ---------------------------------------------------------------- từ chối
export const TOOL_DENIAL_CODES = [
  /** Payload giống credential (CREDENTIAL_DETECTORS) hoặc canary — audit `credential.blocked`, KHÔNG phải harness.violation. */
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

// ---------------------------------------------------------------- audit lần chặn credential (CNS-169, Gen quyết 2026-10-16)
/** Action audit mà trigger ví (`ledger_entries_bi`) coi là "máy phát hiện" ⇒ khoá hạng phạt 100 % — KHÔNG dùng cho lần chặn. */
export const PENALTY_EVIDENCE_ACTIONS = ['harness.violation', 'concealment.detected'] as const;

/**
 * Lần chặn payload giống credential ⇒ audit_log `action = 'credential.blocked'`, `result = 'denied'`, `channel = 'gateway'`,
 * cột `tool`, `role_id`; `detail_json` CHỈ {patternId, tool} — không payload, không đoạn khớp. Owner thấy CẢNH BÁO (A0,
 * severity `warn`, SSE `credential.blocked`). Không bao giờ là harness.violation / concealment.detected ⇒ không khoá hạng
 * phạt, không tự trừ ₲; owner tự quyết nếu muốn phạt (canary trong test là bằng chứng chắc duy nhất).
 */
export const CREDENTIAL_BLOCKED = {
  action: 'credential.blocked',
  result: 'denied',
  channel: 'gateway',
  severity: 'warn',
} as const;

export const CredentialBlockedDetail = z.strictObject({
  patternId: z.enum(CREDENTIAL_PATTERN_IDS),
  /** Tên tool trong registry; tên lạ ghi `unknown` (tên tool thô có thể chính là credential). */
  tool: z.union([z.enum(MCP_TOOLS), z.literal('unknown')]),
});
export type CredentialBlockedDetail = z.infer<typeof CredentialBlockedDetail>;

export interface CredentialBlockedAudit {
  action: typeof CREDENTIAL_BLOCKED.action;
  result: typeof CREDENTIAL_BLOCKED.result;
  channel: typeof CREDENTIAL_BLOCKED.channel;
  severity: typeof CREDENTIAL_BLOCKED.severity;
  tool: McpToolName | 'unknown';
  detail: CredentialBlockedDetail;
}

/** Bản ghi audit cho một lần chặn (gateway thêm role_id / request_id / actor). Không nhận payload — không lộ được. */
export function credentialBlockedAudit(tool: string, patternId: string): CredentialBlockedAudit {
  const knownTool = (MCP_TOOLS as readonly string[]).includes(tool) ? (tool as McpToolName) : 'unknown';
  const detail = CredentialBlockedDetail.parse({ patternId, tool: knownTool });
  return { ...CREDENTIAL_BLOCKED, tool: knownTool, detail };
}

export const ToolResult = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('ok'), data: BoundedJson }),
  z.strictObject({
    status: z.literal('denied'),
    code: z.enum(TOOL_DENIAL_CODES),
    auditDisplayId: z.string().max(BOUNDS.displayId).nullable(),
  }),
  z.strictObject({ status: z.literal('error'), message: z.string().max(BOUNDS.message) }),
]);
export type ToolResult = z.infer<typeof ToolResult>;

// ---------------------------------------------------------------- vé lượt (CNS-142)
/** Vé lượt 256-bit, chỉ hợp lệ cho (turn_id, container) và IP nguồn của container trên ga-roles; hết hạn khi lượt kết thúc. */
export const TURN_TICKET = {
  bytes: 32,
  /** Header MCP client gửi gateway. Cấu hình MCP đọc vé từ TỆP /run/ga/<lượt>/ticket, không nhúng vé. */
  header: 'authorization',
  scheme: 'Bearer',
  /** GET → TurnBundle (contracts/runner.ts — ý định, không argv). Kiểm đăng nhập / probe: bundle đi qua stdin (ProbeBundle). */
  bundlePath: '/turn/bundle',
  /** Đường MCP (Streamable HTTP) trên gateway: adapter nhận `${GA_GATEWAY_URL}${mcpPath}` (thay hằng tạm của runner). */
  mcpPath: '/mcp',
} as const;
