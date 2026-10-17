import { z } from 'zod';
import { BoundedJson, DbTimestamp, JSON_LIMITS } from '../bounds.ts';
import { API_ERROR_CODES, type ApiErrorCode, DB_ERROR_CODES, type DbErrorCode } from '../errors.ts';
import { ENTITY_TYPES, type EntityPrefix, formatDisplayId, parseDisplayId, ULID_RE } from '../ids.ts';

// Quy ước chung của hợp đồng API (BACKEND-TRIAL §3.0; L-API, M2). Mọi lane M2 dùng chung — KHÔNG định nghĩa lại kiểu ở lane.
//
// Luật của tệp này (contract test ở test/api/*.test.ts giữ):
//   - Mọi chuỗi có trần độ dài; object luôn strict; không z.any() / z.unknown(); JSON tự do chỉ qua `Json` (trần độ sâu / số phần tử).
//   - Secret (mật khẩu, API key, token bot, token neo) chỉ qua `SecretInput`, chỉ nằm trong body (không query / path / header thường).
//   - Chữ giao diện KHÔNG nằm ở API (CNS-179): API trả khoá i18n + tham số.

/** Base của mọi route (trừ WS `/term` của L-RT, gắn ở gốc edge). */
export const API_BASE = '/api/v1' as const;

/**
 * Tên header CSRF — NGUỒN DUY NHẤT cho frontend / CLI (frontend không được import `@ga/security`). PHẢI trùng đúng
 * `CSRF_HEADER` của `@ga/security` (packages/security/src/session.ts): giá trị sao chép từ mã nguồn đó, test golden ở cả hai nơi
 * giữ không lệch. Chữ thường (HTTP header không phân biệt hoa thường). Thiếu / sai ở method ghi ⇒ `403 auth.csrf`.
 */
export const CSRF_HEADER = 'x-ga-csrf' as const;

/**
 * Tên cookie phiên — sao chép từ `SESSION` của `@ga/security` (session.ts): HTTPS (sau Caddy TLS) dùng `__Host-ga_sid` (+ Secure,
 * trình duyệt cấm subdomain / HTTP ghi đè); HTTP thường (cài mặc định :7400) dùng `ga_sid`. Cả hai HttpOnly, SameSite=Strict, Path=/.
 * (Đặc tả BACKEND-TRIAL §3.0 / §3.2 ghi `ga_session`: lệch với bản cài đặt đã duyệt; hợp đồng theo bản cài đặt.)
 */
export const SESSION_COOKIE_NAMES = { secure: '__Host-ga_sid', insecure: 'ga_sid' } as const;

/** Cookie phiên + tên header dùng chung (HTTP header không phân biệt hoa thường: hợp đồng ghi chữ thường). */
export const API_AUTH = {
  sessionCookieSecure: SESSION_COOKIE_NAMES.secure,
  sessionCookieInsecure: SESSION_COOKIE_NAMES.insecure,
  csrfHeader: CSRF_HEADER,
  idempotencyHeader: 'idempotency-key',
  lastEventIdHeader: 'last-event-id',
  contentSha256Header: 'x-content-sha256',
} as const;

export const API_LIMITS = {
  /** Edge PHẢI chặn thân request quá trần này TRƯỚC khi parse JSON (multipart: trần riêng của route). */
  bodyBytes: 1_048_576,
  pageMax: 200,
  /** Lưới (OPS-33) và mảng trong response. */
  gridPageMax: 500,
  cursorChars: 256,
  idempotencyKeyChars: 128,
  /** Tên thực thể dài nhất cho ConfirmName (tên Role ≤ 60, workspace ≤ 80, nhãn tài khoản ≤ 60). */
  confirmChars: 200,
  /** `Json` tự do: mỗi chuỗi = trần chuỗi của gateway (mcp.ts); sâu ≤ 8; ≤ 1000 phần tử / khoá. */
  jsonString: JSON_LIMITS.string,
  jsonDepth: JSON_LIMITS.depth,
  jsonItems: JSON_LIMITS.items,
  jsonKeyChars: JSON_LIMITS.keyChars,
} as const;

// ---------------------------------------------------------------- chuỗi có trần
/** Chuỗi có trần độ dài (bắt buộc ở mọi nơi trong hợp đồng này). `min` > 0 ⇒ không rỗng / tối thiểu. */
export function str(max: number, min = 0) {
  const s = z.string().max(max);
  return min > 0 ? s.min(min) : s;
}

/** Khoá enum ổn định MỞ (không liệt kê hết ở hợp đồng): chữ thường, `_ . -`. Chữ hiển thị lấy từ i18n theo khoá này. */
export const KeyStr = z
  .string()
  .max(64)
  .regex(/^[a-z][a-z0-9_.-]{0,63}$/)
  .meta({ example: 'key' });

/** Khoá trong `detail` của lỗi (reason / field / gate): chữ + số + `_ . -`. */
const DetailKey = z
  .string()
  .max(64)
  .regex(/^[A-Za-z0-9_.-]{1,64}$/)
  .meta({ example: 'reason' });

export const Lang = z.enum(['vi', 'en']);

// ---------------------------------------------------------------- số
const MAX_SAFE = Number.MAX_SAFE_INTEGER;
/** Số nguyên ≥ 0 (đếm, token, byte). */
export const Nat = z.number().int().min(0).max(MAX_SAFE);
/** Số nguyên có dấu (biến động). */
export const Int = z.number().int().min(-MAX_SAFE).max(MAX_SAFE);
/** ₲ × 100, ≥ 0. */
export const Minor = Nat;
/** ₲ × 100, > 0 (số tiền cấp / thưởng / trần thưởng). */
export const PosMinor = z.number().int().min(1).max(MAX_SAFE);
/** ₲ × 100 có dấu (biến động bút toán). */
export const SMinor = Int;
/** Basis point 1–10000. */
export const Bp = z.number().int().min(1).max(10_000);
export const Pct = z.number().int().min(0).max(100);

// ---------------------------------------------------------------- thời gian
/** Chuỗi UTC 24 ký tự (`toDbTimestamp`). */
export const Ts = DbTimestamp;

/** IANA timezone: do `Intl` quyết (không tự viết danh sách). */
export function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch (e) {
    if (e instanceof RangeError) return false;
    throw e;
  }
}
export const IanaTimezone = str(64, 1)
  .refine(isIanaTimezone, 'timezone không phải IANA')
  .meta({ example: 'Asia/Ho_Chi_Minh' });

// ---------------------------------------------------------------- JSON tự do có trần
export type { JsonValue } from '../bounds.ts';
/**
 * Giá trị JSON tự do — dùng cho `value` của DNA, `payload` ui_action, `before/after` change set… (hình dạng thật do
 * JSON Schema của miền kiểm ở tầng dịch vụ). Có trần: chuỗi, độ sâu, số phần tử (`BoundedJson` của bounds.ts). KHÔNG dùng
 * `z.json()` (không trần).
 */
export const Json = BoundedJson;

// ---------------------------------------------------------------- định danh
export const Ulid = z.string().length(26).regex(ULID_RE).meta({ example: '01JABCDEFGHJKMNPQRSTVWXYZ0' });

const displayIdCache = new Map<EntityPrefix, z.ZodString>();
/** `display_id` đúng prefix: `RL-0001`. */
export function DisplayId(prefix: EntityPrefix): z.ZodString {
  const cached = displayIdCache.get(prefix);
  if (cached) return cached;
  const schema = z
    .string()
    .max(20)
    .regex(new RegExp(`^${prefix}-\\d{4,12}$`))
    .meta({ example: formatDisplayId(prefix, 1) });
  displayIdCache.set(prefix, schema);
  return schema;
}

/** Trải `{id, displayId}` của prefix: `z.strictObject({ ...idShape('RL'), name })` (= `…Id(RL)` trong đặc tả). */
export function idShape(prefix: EntityPrefix) {
  return { id: Ulid, displayId: DisplayId(prefix) };
}

const idOfCache = new Map<EntityPrefix, ReturnType<typeof makeIdOf>>();
function makeIdOf(prefix: EntityPrefix) {
  return z.strictObject(idShape(prefix));
}
/** `Id(XX)` = `{id: ULID, displayId: 'XX-nnnn'}`. */
export function IdOf(prefix: EntityPrefix) {
  const cached = idOfCache.get(prefix);
  if (cached) return cached;
  const schema = makeIdOf(prefix);
  idOfCache.set(prefix, schema);
  return schema;
}

/** `Id` với prefix bất kỳ đã đăng ký (đích chung của thông báo, audit, `target: Id?`). */
export const AnyId = z.strictObject({
  id: Ulid,
  displayId: str(20, 6)
    .refine((v) => parseDisplayId(v) !== null, 'display_id không đúng dạng / prefix chưa đăng ký')
    .meta({ example: 'RL-0001' }),
});

/** Id không có prefix bảng (cửa sổ bắt Telegram, luồng đổi owner): chuỗi mờ 16–64 ký tự an toàn. */
export const OpaqueId = z
  .string()
  .min(16)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/)
  .meta({ example: 'cap_0123456789abcdef' });

// ---------------------------------------------------------------- Ref (ULID hoặc display_id)
export type RefPrefixes = EntityPrefix | readonly EntityPrefix[] | '*';
export type RefKind = 'ulid' | 'display_id' | 'wrong_prefix' | 'malformed';

const refPrefixesBySchema = new WeakMap<z.ZodType, readonly EntityPrefix[] | '*'>();
const refCache = new Map<string, z.ZodString>();

function normalizePrefixes(prefixes: RefPrefixes): readonly EntityPrefix[] | '*' {
  if (prefixes === '*') return '*';
  return typeof prefixes === 'string' ? [prefixes] : prefixes;
}

/**
 * `Ref<P>` (BACKEND-TRIAL §3.0): ULID 26 ký tự HOẶC `display_id` đúng dạng. Schema chỉ kiểm HÌNH DẠNG (400 nếu rác);
 * prefix sai ⇒ **404 `not_found`** (không phải 400): tầng route gọi `classifyRef(refPrefixesOf(schema), value)` sau parse.
 * ULID không mang prefix nên chỉ tra DB mới biết loại — thuộc dịch vụ.
 */
export function Ref(prefixes: RefPrefixes): z.ZodString {
  const norm = normalizePrefixes(prefixes);
  const cacheKey = norm === '*' ? '*' : [...norm].sort().join(',');
  const cached = refCache.get(cacheKey);
  if (cached) return cached;
  const first = norm === '*' ? 'RL' : (norm[0] ?? 'RL');
  const schema = z
    .string()
    .max(26)
    .refine((v) => ULID_RE.test(v) || parseDisplayId(v) !== null, 'không phải ULID hoặc display_id')
    .meta({ example: formatDisplayId(first, 1) });
  refPrefixesBySchema.set(schema, norm);
  refCache.set(cacheKey, schema);
  return schema;
}

/** Prefix mà một schema `Ref(...)` chấp nhận; `undefined` nếu schema không phải Ref. */
export function refPrefixesOf(schema: z.ZodType): readonly EntityPrefix[] | '*' | undefined {
  return refPrefixesBySchema.get(schema);
}

export function classifyRef(prefixes: readonly EntityPrefix[] | '*', value: string): RefKind {
  if (ULID_RE.test(value)) return 'ulid';
  const parsed = parseDisplayId(value);
  if (!parsed) return 'malformed';
  if (prefixes === '*' || prefixes.includes(parsed.prefix)) return 'display_id';
  return 'wrong_prefix';
}

/** Mọi prefix bảng có display_id (OPS-35 `Ref<*>`). */
export const ALL_REF_PREFIXES = Object.keys(ENTITY_TYPES) as EntityPrefix[];

// ---------------------------------------------------------------- Secret (chỉ ghi, chỉ trong body)
export const SECRET_KINDS = ['password', 'api_key', 'bot_token', 'anchor_token'] as const;
export type SecretKind = (typeof SECRET_KINDS)[number];
/** Trần độ dài theo loại secret. */
export const SECRET_MAX_CHARS: Record<SecretKind, number> = {
  password: 256,
  api_key: 512,
  bot_token: 128,
  anchor_token: 512,
};
export const SECRET_META_KEY = 'gaSecret' as const;

/**
 * Mọi field mang secret PHẢI có kiểu này. Chỉ nằm trong BODY (contract test: không query / path / header thường). Không
 * bao giờ có trong response, log hay audit (log che theo tên khoá + bộ lọc credential của packages/security).
 */
export function SecretInput(kind: SecretKind) {
  return z
    .string()
    .min(1)
    .max(SECRET_MAX_CHARS[kind])
    .meta({ [SECRET_META_KEY]: kind });
}

/** Đọc dấu SecretInput từ schema (đã bóc optional / nullable / default). */
export function secretKindOf(schema: z.ZodType): SecretKind | undefined {
  const meta = schema.meta() as Record<string, unknown> | undefined;
  const kind = meta?.[SECRET_META_KEY];
  return typeof kind === 'string' && (SECRET_KINDS as readonly string[]).includes(kind)
    ? (kind as SecretKind)
    : undefined;
}

// ---------------------------------------------------------------- Idempotency-Key, ConfirmName
/**
 * Header `Idempotency-Key` (bắt buộc ở SYS-19, SYS-74, WRK-23…26): ghi vào `ledger_entries.idempotency_key` (UNIQUE).
 * KHÔNG chứa `:` (review bảo mật PR #7, M9): hệ thống đặt khoá nội bộ dạng `activate:<ulid>`, `reverse:<ulid>`… cùng cột UNIQUE;
 * client không được tự đặt khoá giả danh (đụng khoá ⇒ chặn việc ghi sổ hợp lệ, hoặc phát lại bút toán của hệ thống).
 */
export const IdempotencyKey = z
  .string()
  .min(8)
  .max(API_LIMITS.idempotencyKeyChars)
  .regex(/^[A-Za-z0-9._-]+$/)
  .meta({ example: 'idem-0001-abcdef' });
export const IdempotencyHeaders = z.strictObject({ [API_AUTH.idempotencyHeader]: IdempotencyKey });

/** Bước 2 của ConfirmModal: phải trùng NGUYÊN VĂN tên thực thể; sai ⇒ `400 confirm.mismatch`. */
export const ConfirmName = str(API_LIMITS.confirmChars, 1);

// ---------------------------------------------------------------- query (chuỗi → kiểu)
/** `?flag=true|false` → boolean. */
export function queryBool() {
  return z.enum(['true', 'false']).transform((v) => v === 'true');
}
/** `?n=12` → số nguyên trong khoảng. */
export function queryInt(min: number, max: number) {
  return z.coerce.number().int().min(min).max(max);
}
/** `?status=a,b` (danh sách phân tách bằng dấu phẩy) → mảng enum. */
export function queryCsv<const T extends readonly [string, ...string[]]>(values: T, maxItems = values.length) {
  return z
    .string()
    .max(256)
    .meta({ example: values[0] })
    .transform((s) => s.split(','))
    .pipe(z.array(z.enum(values)).max(maxItems));
}

/** Mảng có trần (response dạng danh sách không phân trang). */
export function list<T extends z.ZodType>(item: T, max: number = API_LIMITS.gridPageMax) {
  return z.array(item).max(max);
}

/** `?cols=a,b,c` (danh sách phân tách bằng dấu phẩy, mỗi phần tử theo `item`, ≤ `maxItems`). `example` = giá trị mẫu hợp lệ. */
export function queryList<T extends z.ZodType<unknown, string>>(item: T, maxItems: number, example: string) {
  return z
    .string()
    .max(512)
    .meta({ example })
    .transform((s) => s.split(','))
    .pipe(z.array(item).max(maxItems));
}

// ---------------------------------------------------------------- phân trang
export const CursorStr = str(API_LIMITS.cursorChars, 1).meta({ example: 'cursor' });

/** `Page<T>` = `{items, nextCursor}`. `nextCursor = null` ⇒ hết trang. */
export function PageOf<T extends z.ZodType>(item: T) {
  return z.strictObject({
    items: z.array(item).max(API_LIMITS.gridPageMax),
    nextCursor: CursorStr.nullable(),
  });
}

/** Trường query phân trang: `cursor`, `limit` (≤ 200; lưới ≤ 500). */
export function pageQueryShape(maxLimit: number = API_LIMITS.pageMax) {
  return { cursor: CursorStr.optional(), limit: queryInt(1, maxLimit).optional() };
}

// ---------------------------------------------------------------- Job
export const JOB_STATES = ['queued', 'running', 'succeeded', 'failed', 'dead', 'cancelled'] as const;
export const Job = z.strictObject({ jobDisplayId: DisplayId('JB'), state: z.enum(JOB_STATES) });

// ---------------------------------------------------------------- lỗi
export const ALL_ERROR_CODES = [...API_ERROR_CODES, ...DB_ERROR_CODES] as const;
export type ErrorCode = ApiErrorCode | DbErrorCode;

export const HTTP_ERROR_STATUSES = [400, 401, 403, 404, 409, 410, 413, 415, 422, 423, 429, 500] as const;
export type HttpErrorStatus = (typeof HTTP_ERROR_STATUSES)[number];

/**
 * Mã lỗi → HTTP status (một nguồn). `db.*` theo `mapDbError`: lỗi ràng buộc / luật DB = 409; hai mã lỗi hạ tầng của
 * chính server (`db.connection_contract`, `db.readonly`) = 500 — không phải lỗi của client.
 */
export const API_ERROR_HTTP: Record<ErrorCode, HttpErrorStatus> = {
  'auth.required': 401,
  'auth.csrf': 403,
  'auth.rate_limited': 429,
  'auth.must_change_password': 403,
  'auth.invalid_credentials': 401,
  'auth.locked': 403,
  'auth.weak_password': 422,
  'auth.forbidden': 403,
  'recovery.blocked': 423,
  'validation.failed': 400,
  not_found: 404,
  conflict: 409,
  internal: 500,
  'gate.core_agent_not_ready': 409,
  'gate.onboarding_incomplete': 409,
  'gate.sign_blocked': 409,
  'gate.card_blocked': 409,
  'consent.required': 422,
  'consent.notice_mismatch': 422,
  'engine.not_installed': 409,
  'engine.login_busy': 409,
  'capability.unavailable': 422,
  'turn.rejected': 409,
  'recovery.not_incident': 409,
  'telegram.token_invalid': 422,
  'telegram.capture_expired': 410,
  'telegram.code_invalid': 422,
  'telegram.code_expired': 410,
  'upload.too_large': 413,
  'upload.type_rejected': 415,
  'upload.not_clean': 422,
  'query.invalid': 400,
  'confirm.mismatch': 400,
  'idempotency.conflict': 409,
  'reflection.limit': 409,
  'db.replace_forbidden': 409,
  'db.immutable_identity': 409,
  'db.append_only': 409,
  'db.ledger_rule': 409,
  'db.tenant_mismatch': 409,
  'db.wounded': 409,
  'db.settings_invalid': 409,
  'db.core_agent_rule': 409,
  'db.character_library': 409,
  'db.fk_violation': 409,
  'db.conflict': 409,
  'db.check_failed': 409,
  'db.required': 409,
  'db.readonly': 500,
  'db.connection_contract': 500,
  'db.rule_violation': 409,
};

export function httpStatusFor(code: ErrorCode): HttpErrorStatus {
  return API_ERROR_HTTP[code];
}

/**
 * Mã lỗi chung — KHÔNG lặp trong từng route (§3.0). Thêm tuỳ route: `recovery.blocked` (route O4 `✗`),
 * `idempotency.conflict` (route `idempotent`), `db.*` đặc thù.
 */
export const COMMON_ERROR_CODES = [
  'validation.failed',
  'auth.required',
  'auth.csrf',
  'auth.forbidden',
  'not_found',
  'conflict',
  'auth.rate_limited',
  'internal',
] as const satisfies readonly ErrorCode[];

/** Mã lỗi một route khai: mã cụ thể, hoặc `db.*` = "bất kỳ mã DB nào" (theo `mapDbError`). */
export type RouteErrorCode = ErrorCode | 'db.*';

/** `detail` của lỗi: chỉ khoá enum hoặc số (§3.0) — không chuỗi DB / stack. */
export const ErrorDetail = z.strictObject({
  reason: DetailKey.optional(),
  field: DetailKey.optional(),
  gate: DetailKey.optional(),
  attemptsLeft: Nat.optional(),
  retryAfterS: Nat.optional(),
  /** Vị trí ký tự (từ 0) của mệnh đề lỗi trong ô truy vấn (`query.invalid`) — để vẽ chip đỏ đúng chỗ. */
  position: Nat.optional(),
});

/** Thân lỗi (mở rộng `ApiErrorBody` của errors.ts với `detail`). */
export const ApiErrorEnvelope = z.strictObject({
  error: z.strictObject({
    code: z.enum(ALL_ERROR_CODES),
    i18nKey: str(96, 1),
    requestId: str(64, 1),
    detail: ErrorDetail.optional(),
  }),
});
export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelope>;

/** Lý do `detail.reason` đã chốt ở đặc tả (mã khác: khoá tự do theo bảng của miền, vd `card_block_reason`). */
export const ERROR_DETAIL_REASONS = {
  'gate.sign_blocked': ['unconfirmed_inferred', 'budget_exceeded'],
  'engine.not_installed': ['not_installed', 'installing', 'failed'],
  /** DATABASE §8.3: lỗi cú pháp / cột ngoài whitelist hiện thành chip đỏ, không chạy truy vấn nửa vời. */
  'query.invalid': ['syntax', 'unknown_field', 'op_not_allowed', 'bad_value', 'too_complex', 'timeout'],
} as const satisfies Partial<Record<ErrorCode, readonly string[]>>;
