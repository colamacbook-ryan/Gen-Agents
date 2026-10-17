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

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'WS'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

/**
 * Cột "O4" của đặc tả: `open` = ✓ mở được khi `mode = recovery` · `blocked` = ✗ (`423 recovery.blocked`) · `setup` = chỉ hợp lệ
 * khi onboarding chưa xong (sau đó `409 conflict`) · `core` = ✓* mở khi recovery nhưng CHỈ với tài khoản Core agent.
 */
export const O4_MODES = ['open', 'blocked', 'setup', 'core'] as const;
export type O4Mode = (typeof O4_MODES)[number];

/**
 * Cổng người ghi (STD-11): route ghi credential / mở PTY ⇒ `O`. Contract test: `credential_write` / `pty` ⇒ `auth = 'O'`;
 * mọi body có `SecretInput` phải khai cổng; `user_password` (mật khẩu đăng nhập của chính người dùng) là `public` hoặc `V`.
 */
export const ROUTE_GATES = ['credential_write', 'pty', 'user_password'] as const;
export type RouteGate = (typeof ROUTE_GATES)[number];

/** Route `A` nhưng một giá trị của request nâng lên `O` (vd WRK-03 `purpose = owner_change`). */
export type OwnerWhen =
  | { in: 'body' | 'query'; field: string; equals: string | boolean }
  /** Khoá `SETTINGS[key]` mà admin không ghi được (`settingWritableBy(key, 'admin') = false`) ⇒ owner. */
  | { rule: 'setting_writers' };

export interface RequestSpec {
  /** Tham số đường dẫn: khoá = `{tên}` trong path (contract test khớp hai chiều). */
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  /** Header riêng của route (chỉ `idempotency-key`, `last-event-id`); KHÔNG secret. */
  headers?: z.ZodType;
  /** `multipart` = body là các phần form (tệp + trường văn bản của `body`). Mặc định `json`. */
  bodyKind?: 'json' | 'multipart';
}

export type ResponseSpec =
  | { kind: 'json'; status: 200 | 201 | 202; schema: z.ZodType; noStore: boolean }
  | { kind: 'empty'; status: 204 }
  | { kind: 'sse'; events: z.ZodType }
  | { kind: 'csv' }
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
export const csv = (): { kind: 'csv' } => ({ kind: 'csv' });
export const binary = (): { kind: 'binary'; contentType: 'application/octet-stream' } => ({
  kind: 'binary',
  contentType: 'application/octet-stream',
});
export const ws = <C extends z.ZodType, S extends z.ZodType>(
  client: C,
  server: S,
): { kind: 'ws'; client: C; server: S } => ({ kind: 'ws', client, server });

/** Đầu vào khai báo một route ở tệp lane. */
export interface RouteInput<Q extends RequestSpec, S extends ResponseSpec> {
  /** `SYS-01`, `GW-12`, `EXT-05`… — duy nhất toàn registry. */
  id: string;
  method: HttpMethod;
  /** Tương đối `/api/v1` (trừ `mount: 'edge'`). Tham số đường dẫn dạng `{tên}`. */
  path: string;
  /** `api` = dưới `/api/v1` (mặc định); `edge` = gốc edge (WS `/term`). */
  mount?: 'api' | 'edge';
  auth: AuthLevel;
  ownerWhen?: OwnerWhen;
  gate?: RouteGate;
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
}

export interface RouteDraft<Q extends RequestSpec = RequestSpec, S extends ResponseSpec = ResponseSpec> {
  readonly id: string;
  readonly method: HttpMethod;
  readonly path: string;
  readonly mount: 'api' | 'edge';
  readonly lane: Lane;
  readonly auth: AuthLevel;
  readonly ownerWhen?: OwnerWhen;
  readonly gate?: RouteGate;
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
      ...(input.ownerWhen ? { ownerWhen: input.ownerWhen } : {}),
      ...(input.gate ? { gate: input.gate } : {}),
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
    };
  };
}
