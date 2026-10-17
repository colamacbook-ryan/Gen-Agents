import type { z } from 'zod';
import type { ErrorCode, RouteErrorCode } from './common.ts';

// Kiểu + bộ dựng route (BACKEND-TRIAL §3.1). Tách khỏi `routes.ts` để tệp lane (`sys.ts`, `hr.ts`…) import mà không vòng:
// lane → define.ts ← routes.ts (gom ROUTES). Mỗi route khai báo MỘT lần, ở đúng tệp của lane chủ.

/** Lane chủ. EXT-01…04 do L-SEC (M1), EXT-05 do L-RT (M1); SYS-30…79 do L-HR (tách khỏi L-SYS, Gen quyết). */
export const LANES = ['L-SYS', 'L-HR', 'L-GW', 'L-WORK', 'L-OPS', 'L-SEC', 'L-RT'] as const;
export type Lane = (typeof LANES)[number];

/**
 * Quyền (`workspace_members.access_level`, DATABASE §9.7):
 *   `public` = không cần phiên · `V` = mọi thành viên (viewer chỉ đọc, không thấy `confidential`) · `A` = owner hoặc admin ·
 *   `O` = chỉ owner. Trigger DB vẫn là chốt cuối; người ghi lấy từ `app_actor()`, không từ body.
 */
export const AUTH_LEVELS = ['public', 'V', 'A', 'O'] as const;
export type AuthLevel = (typeof AUTH_LEVELS)[number];

const AUTH_RANK: Record<AuthLevel, number> = { public: 0, V: 1, A: 2, O: 3 };
/** `have` đủ quyền cho `need`? (public < V < A < O). */
export function authAtLeast(have: AuthLevel, need: AuthLevel): boolean {
  return AUTH_RANK[have] >= AUTH_RANK[need];
}
/** Quyền cao hơn trong hai mức. */
export function maxAuth(a: AuthLevel, b: AuthLevel): AuthLevel {
  return AUTH_RANK[a] >= AUTH_RANK[b] ? a : b;
}

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'WS'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

/**
 * Cột "O4" của đặc tả: `open` = ✓ mở được khi `mode = recovery` · `blocked` = ✗ (`423 recovery.blocked`) · `setup` = chỉ hợp lệ
 * khi onboarding chưa xong (sau đó `409 conflict`) · `core` = ✓* mở khi recovery nhưng CHỈ với tài khoản Core agent.
 */
export const O4_MODES = ['open', 'blocked', 'setup', 'core'] as const;
export type O4Mode = (typeof O4_MODES)[number];

/**
 * Quy tắc chung (Gen, fail-closed): MỌI route NỚI một hàng rào bảo mật = `O`; siết chặt giữ `A`. Khi chiều thay đổi phụ thuộc
 * một giá trị trong request / trạng thái đã lưu, route khai `ownerWhen` (một điều kiện hoặc danh sách; khớp BẤT KỲ điều kiện
 * nào ⇒ `O`). `requiredAccess()` đánh giá SAU khi parse request; dịch vụ PHẢI gọi trước khi ghi.
 */
export type OwnerWhenField =
  /** `body[field] === equals` (vd `action = 'allow'`). */
  | { in: 'body' | 'query'; field: string; equals: string | boolean }
  /** `body[field]` thuộc danh sách (vd `decision ∈ {allow, ask}`: mọi giá trị khác `deny` đều nới). */
  | { in: 'body' | 'query'; field: string; equalsAny: readonly (string | boolean)[] }
  /** Khoá có mặt (kể cả `null`) — đặt / đổi / gỡ một hạn mức là nới (vd `dailyTokenQuota`). */
  | { in: 'body' | 'query'; field: string; present: true };

export type OwnerWhen =
  | OwnerWhenField
  /** Khoá `SETTINGS[key]` mà admin không ghi được (`settingWritableBy(key, 'admin') = false`) ⇒ owner. */
  | { rule: 'setting_writers' }
  /**
   * Xoá một luật egress: xoá luật `deny` = nới ⇒ owner; xoá luật `allow` = siết ⇒ A. Chiều do TRẠNG THÁI ĐÃ LƯU quyết định
   * (`req.stored.egressAction`, dịch vụ tra DB theo ref); thiếu ⇒ `O` (fail-closed).
   */
  | { rule: 'egress_loosen' };

/** Bảng chính sách truy cập mà việc ghi có thể nới hàng rào (route ghi phải `O` hoặc có `ownerWhen`). */
export const ACCESS_POLICY_TABLES = [
  'egress_rules',
  'tool_grants',
  'telegram_allowlist',
  'proactive_policies',
] as const;
export type AccessPolicyTable = (typeof ACCESS_POLICY_TABLES)[number];

export interface RequestSpec {
  /** Tham số đường dẫn: khoá = `{tên}` trong path (contract test khớp hai chiều). */
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  /** Header riêng của route (chỉ `idempotency-key`, `last-event-id`); KHÔNG secret. */
  headers?: z.ZodType;
  /** `multipart` = body là các phần form (tệp + trường văn bản của `body`). Mặc định `json`. */
  bodyKind?: 'json' | 'multipart';
  /**
   * Kiểm CHÉO các phần của request sau khi từng phần đã qua schema (vd `cols` của query phải thuộc whitelist của lưới trong
   * `params`). Trả về danh sách vi phạm (rỗng = hợp lệ); mỗi vi phạm là một `400 query.invalid` / `validation`. Hàm thuần,
   * không I/O. `requestSchemaOf` gắn nó vào schema tổng nên test và edge dùng chung một nguồn.
   */
  refine?: (req: RequestParts) => readonly string[];
}

/** Các phần request đã qua schema (đầu ra, sau transform). */
export interface RequestParts {
  readonly params: Readonly<Record<string, unknown>>;
  readonly query: Readonly<Record<string, unknown>>;
  readonly body: unknown;
}

export type ResponseSpec =
  | { kind: 'json'; status: 200 | 201 | 202; schema: z.ZodType; noStore: boolean }
  | { kind: 'empty'; status: 204 }
  | { kind: 'sse'; events: z.ZodType }
  | { kind: 'csv'; formulaEscape: true; maxRows: number; streamed: true }
  | { kind: 'binary'; contentType: 'application/octet-stream' }
  | { kind: 'ws'; client: z.ZodType; server: z.ZodType };

export interface JsonResponse<S extends z.ZodType, St extends 200 | 201 | 202> {
  kind: 'json';
  status: St;
  schema: S;
  noStore: boolean;
}
export const ok = <S extends z.ZodType>(schema: S): JsonResponse<S, 200> => ({
  kind: 'json',
  status: 200,
  schema,
  noStore: false,
});
export const created = <S extends z.ZodType>(schema: S): JsonResponse<S, 201> => ({
  kind: 'json',
  status: 201,
  schema,
  noStore: false,
});
export const accepted = <S extends z.ZodType>(schema: S): JsonResponse<S, 202> => ({
  kind: 'json',
  status: 202,
  schema,
  noStore: false,
});
/** 200 + `Cache-Control: no-store` (response mang vé / CSRF token). */
export const okNoStore = <S extends z.ZodType>(schema: S): JsonResponse<S, 200> => ({
  kind: 'json',
  status: 200,
  schema,
  noStore: true,
});
export const noContent = (): { kind: 'empty'; status: 204 } => ({ kind: 'empty', status: 204 });
export const sse = <E extends z.ZodType>(events: E): { kind: 'sse'; events: E } => ({ kind: 'sse', events });
/**
 * Xuất `text/csv` + header `X-Content-SHA256`. BẮT BUỘC khai `formulaEscape: true` (mọi ô văn bản đi qua `csvCell`, chống CSV /
 * formula injection — review bảo mật PR #7, L3) và `maxRows` (trần số hàng; vượt ⇒ cắt kèm dòng báo, không buffer vô hạn). Luôn
 * `streamed`: handler ghi theo luồng (đọc dòng từ connection chỉ đọc → ghi ngay), KHÔNG gom cả tệp vào bộ nhớ.
 */
export const csv = (opts: {
  formulaEscape: true;
  maxRows: number;
}): { kind: 'csv'; formulaEscape: true; maxRows: number; streamed: true } => {
  if (!Number.isInteger(opts.maxRows) || opts.maxRows < 1) throw new Error('csv: maxRows phải là số nguyên dương');
  return { kind: 'csv', formulaEscape: opts.formulaEscape, maxRows: opts.maxRows, streamed: true };
};

const CSV_FORMULA_START = /^(?:[\t\r]|[ ]*[=+\-@])/;

/**
 * Một ô CSV. Ô VĂN BẢN: bắt đầu bằng `=` `+` `-` `@` (sau khoảng trắng đầu) hoặc tab / CR ⇒ thêm tiền tố `'` (Excel / Sheets không
 * chạy công thức), rồi bọc ngoặc kép đầy đủ (`"` → `""`, nên dấu phẩy / xuống dòng trong ô an toàn). Ô SỐ giữ nguyên (`-500` là
 * số, không phải công thức); `null` / `undefined` / số không hữu hạn ⇒ ô rỗng.
 */
export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  const text = CSV_FORMULA_START.test(value) ? `'${value}` : value;
  return `"${text.replaceAll('"', '""')}"`;
}

/** Một dòng CSV (kết thúc CRLF). */
export function csvRow(cells: readonly (string | number | boolean | null | undefined)[]): string {
  return `${cells.map(csvCell).join(',')}\r\n`;
}
export const binary = (): { kind: 'binary'; contentType: 'application/octet-stream' } => ({
  kind: 'binary',
  contentType: 'application/octet-stream',
});
export const ws = <C extends z.ZodType, S extends z.ZodType>(
  client: C,
  server: S,
): { kind: 'ws'; client: C; server: S } => ({ kind: 'ws', client, server });

/** Đầu vào khai báo một route ở tệp lane. */
export type RouteScope = 'workspace' | 'self';

export interface RouteInput<Q extends RequestSpec, S extends ResponseSpec> {
  /** `SYS-01`, `GW-12`, `EXT-05`… — duy nhất toàn registry. */
  id: string;
  method: HttpMethod;
  /** Tương đối `/api/v1` (trừ `mount: 'edge'`). Tham số đường dẫn dạng `{tên}`. */
  path: string;
  /** `api` = dưới `/api/v1` (mặc định); `edge` = gốc edge (WS `/term`). */
  mount?: 'api' | 'edge';
  auth: AuthLevel;
  /** Nâng lên `O` khi khớp (xem `OwnerWhen`). */
  ownerWhen?: OwnerWhen | readonly OwnerWhen[];
  /**
   * Route GHI `egress_rules` / `tool_grants` (nới hoặc siết). Contract test: có cờ ⇒ `auth = 'O'` hoặc có `ownerWhen`
   * (chỉ phần SIẾT được ở mức A). Khai tường minh, không suy từ tên route.
   */
  writesAccessPolicy?: readonly AccessPolicyTable[];
  /**
   * Route TẠO / SỬA / XOÁ / THU HỒI / XUẤT credential (khoá API, token bot, token neo, tài khoản engine + volume `/auth`,
   * đồng ý Clause 6 gắn tài khoản, đổi chủ Telegram) HOẶC mở PTY đăng nhập. Contract test: cờ này ⇒ `auth = 'O'`, KHÔNG ngoại lệ
   * (không `ownerWhen`) — fail-closed, STD-11 "cổng người ghi". Khai tường minh, không suy từ tên route.
   */
  touchesCredential?: boolean;
  /** Route nhận mật khẩu đăng nhập của CHÍNH người dùng (EXT-01, EXT-04): `public` hoặc `V`, không phải `touchesCredential`. */
  userPassword?: boolean;
  o4: O4Mode;
  /** Bắt buộc header `Idempotency-Key` (SYS-19, SYS-74, WRK-23…26). */
  idempotent?: boolean;
  request?: Q;
  response: S;
  /** "Lỗi riêng" của route (mã chung §3.0 KHÔNG lặp ở đây). `db.*` = mã DB đặc thù. */
  errors?: readonly RouteErrorCode[];
  /** Giá trị `detail.reason` đã chốt cho từng mã. */
  errorReasons?: Partial<Record<ErrorCode, readonly string[]>>;
  /** Lệnh `genagents` gọi route này (cột CLI của đặc tả). */
  cli?: readonly string[];
  /** Route không có lệnh CLI (kèm lý do). */
  noCli?: string;
  /** Route KHÔNG thuộc màn nào ở §3.11 (kèm lý do): chỉ CLI / dịch vụ nội bộ dùng. */
  cliOnly?: string;
  /** Chưa có nguồn dữ liệu ở DB (T8: SYS-62). */
  pendingDb?: boolean;
  /**
   * `self` = dữ liệu của RIÊNG người gọi (lọc `user_id = người dùng của phiên`, HANDLER-OBLIGATIONS #7): route không nhận
   * tham số chọn người dùng khác, và owner / admin cũng không đọc hộ người khác. Mặc định `workspace`.
   */
  scope?: RouteScope;
}

export interface RouteDraft<Q extends RequestSpec = RequestSpec, S extends ResponseSpec = ResponseSpec> {
  readonly id: string;
  readonly method: HttpMethod;
  readonly path: string;
  readonly mount: 'api' | 'edge';
  readonly lane: Lane;
  readonly auth: AuthLevel;
  readonly ownerWhen: readonly OwnerWhen[];
  readonly writesAccessPolicy: readonly AccessPolicyTable[];
  readonly touchesCredential: boolean;
  readonly userPassword: boolean;
  readonly o4: O4Mode;
  /** Dẫn xuất từ `o4`: RecoveryGuard đọc cờ này (một nguồn duy nhất). */
  readonly recovery: boolean;
  /** Dẫn xuất: `o4 = 'core'` (chỉ tài khoản Core agent khi recovery). */
  readonly recoveryCoreOnly: boolean;
  /** Dẫn xuất: `o4 = 'setup'`. */
  readonly setupOnly: boolean;
  readonly idempotent: boolean;
  readonly request: Q;
  readonly response: S;
  readonly errors: readonly RouteErrorCode[];
  readonly errorReasons: Partial<Record<ErrorCode, readonly string[]>>;
  readonly cli: readonly string[];
  readonly noCli?: string;
  readonly cliOnly?: string;
  readonly pendingDb: boolean;
  readonly scope: RouteScope;
}

/** Route đã vào registry: thêm `fs` (mã màn / thành phần FRONTEND-SPEC) dẫn xuất từ bảng §3.11 (`coverage.ts`). */
export interface Route<Q extends RequestSpec = RequestSpec, S extends ResponseSpec = ResponseSpec>
  extends RouteDraft<Q, S> {
  readonly fs: readonly string[];
}

/** Lane chủ theo dải ID (BACKEND-TRIAL §3.2–§3.6, đã tách L-SYS / L-HR). Contract test: route nằm đúng tệp của lane. */
export function expectedLane(id: string): Lane | null {
  const m = /^([A-Z]+)-(\d{2})$/.exec(id);
  if (!m) return null;
  const n = Number(m[2]);
  switch (m[1]) {
    case 'SYS':
      return (n >= 1 && n <= 29) || (n >= 80 && n <= 85) ? 'L-SYS' : n >= 30 && n <= 79 ? 'L-HR' : null;
    case 'GW':
      return n >= 1 && n <= 32 ? 'L-GW' : null;
    case 'WRK':
      return n >= 1 && n <= 43 ? 'L-WORK' : null;
    case 'OPS':
      return n >= 1 && n <= 36 ? 'L-OPS' : null;
    case 'EXT':
      return n >= 1 && n <= 4 ? 'L-SEC' : n === 5 ? 'L-RT' : null;
    default:
      return null;
  }
}

/** Tên tham số đường dẫn theo thứ tự xuất hiện: `/roles/{roleRef}/dna/{dnaRef}` → `['roleRef', 'dnaRef']`. */
export function pathParamNames(path: string): string[] {
  return [...path.matchAll(/\{([A-Za-z][A-Za-z0-9]{0,31})\}/g)].map((m) => m[1] as string);
}

const O4_FLAGS: Record<O4Mode, { recovery: boolean; core: boolean; setup: boolean }> = {
  open: { recovery: true, core: false, setup: false },
  blocked: { recovery: false, core: false, setup: false },
  setup: { recovery: false, core: false, setup: true },
  core: { recovery: true, core: true, setup: false },
};

/** Bộ dựng route của một lane: `const sys = defineLane('L-SYS'); export const SYS_01 = sys({...})`. */
export function defineLane(lane: Lane) {
  return <Q extends RequestSpec = RequestSpec, S extends ResponseSpec = ResponseSpec>(
    input: RouteInput<Q, S>,
  ): RouteDraft<Q, S> => {
    const flags = O4_FLAGS[input.o4];
    return {
      id: input.id,
      method: input.method,
      path: input.path,
      mount: input.mount ?? 'api',
      lane,
      auth: input.auth,
      ownerWhen:
        input.ownerWhen === undefined ? [] : Array.isArray(input.ownerWhen) ? input.ownerWhen : [input.ownerWhen],
      writesAccessPolicy: input.writesAccessPolicy ?? [],
      touchesCredential: input.touchesCredential ?? false,
      userPassword: input.userPassword ?? false,
      o4: input.o4,
      recovery: flags.recovery,
      recoveryCoreOnly: flags.core,
      setupOnly: flags.setup,
      idempotent: input.idempotent ?? false,
      request: input.request ?? ({} as Q),
      response: input.response,
      errors: input.errors ?? [],
      errorReasons: input.errorReasons ?? {},
      cli: input.cli ?? [],
      ...(input.noCli ? { noCli: input.noCli } : {}),
      ...(input.cliOnly ? { cliOnly: input.cliOnly } : {}),
      pendingDb: input.pendingDb ?? false,
      scope: input.scope ?? 'workspace',
    };
  };
}
