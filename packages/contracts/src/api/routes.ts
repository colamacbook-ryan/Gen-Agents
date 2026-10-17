import { z } from 'zod';
import { isSettingKey, settingWritableBy } from '../settings.ts';
import { AUTH_ROUTES } from './auth.ts';
import { ALL_ERROR_CODES, API_BASE, COMMON_ERROR_CODES, type ErrorCode, type RouteErrorCode } from './common.ts';
import { fsOf } from './coverage.ts';
import type { AuthLevel, OwnerWhen, Route, RouteDraft } from './define.ts';
import { GW_ROUTES } from './gw.ts';
import { HR_ROUTES } from './hr.ts';
import { OPS_ROUTES } from './ops.ts';
import { SYS_ROUTES } from './sys.ts';
import { WORK_ROUTES } from './work.ts';

export * from './define.ts';

// Registry route (BACKEND-TRIAL §3.1): MỘT nguồn cho edge (quyền, CSRF, RecoveryGuard), CLI, frontend và contract test.
// 196 route M2 (SYS 85 = L-SYS 35 + L-HR 50, GW 32, WRK 43, OPS 36) + 5 route có chủ ở M1 (EXT-01…05, L-SEC / L-RT).

const DRAFTS: readonly RouteDraft[] = [
  ...AUTH_ROUTES,
  ...SYS_ROUTES,
  ...HR_ROUTES,
  ...GW_ROUTES,
  ...WORK_ROUTES,
  ...OPS_ROUTES,
];

/** Mọi route. `fs` dẫn xuất từ bảng độ phủ §3.11 (`coverage.ts`). */
export const ROUTES: readonly Route[] = DRAFTS.map((d) => ({ ...d, fs: fsOf(d.id) }));

/** 196 route M2 (không gồm EXT-01…05 đã có chủ ở M1). */
export const M2_ROUTES: readonly Route[] = ROUTES.filter((r) => !r.id.startsWith('EXT-'));

const BY_ID = new Map(ROUTES.map((r) => [r.id, r] as const));
export function routeById(id: string): Route | undefined {
  return BY_ID.get(id);
}

/**
 * Schema của TOÀN BỘ request một route: `{params?, query?, headers?, body?}` — chỉ gồm phần route khai báo, strict (phần
 * route không khai báo mà client gửi ⇒ từ chối, vd body ở route không nhận body). Dùng cho edge và contract test.
 */
export function requestSchemaOf(route: Pick<Route, 'request'>): z.ZodType {
  const r = route.request;
  const shape: Record<string, z.ZodType> = {};
  if (r.params) shape.params = r.params;
  if (r.query) shape.query = r.query;
  if (r.headers) shape.headers = r.headers;
  if (r.body) shape.body = r.body;
  return z.strictObject(shape);
}

/** Schema của response JSON (`null` nếu route trả 204 / luồng / tệp). */
export function responseSchemaOf(route: Pick<Route, 'response'>): z.ZodType | null {
  const res = route.response;
  switch (res.kind) {
    case 'json':
      return res.schema;
    case 'ws':
      return z.union([res.client, res.server]);
    default:
      return null;
  }
}

/** Đường dẫn đầy đủ: `/api/v1` + path (route `mount: 'edge'` ở gốc edge). */
export function fullPath(route: Pick<Route, 'mount' | 'path'>): string {
  return route.mount === 'edge' ? route.path : `${API_BASE}${route.path}`;
}

/** Method ghi (trừ route `public`) phải gửi `X-GA-CSRF` — thiếu thì `403 auth.csrf`. */
export function requiresCsrf(route: Pick<Route, 'method' | 'auth'>): boolean {
  return route.method !== 'GET' && route.method !== 'WS' && route.auth !== 'public';
}

/**
 * Allowlist của `RecoveryGuard` (O4): CHỈ đọc từ cờ `recovery` trong registry — một nguồn duy nhất, có test.
 * Route `recoveryCoreOnly` chỉ mở khi đích là tài khoản Core agent (`recoveryDecision`).
 */
export function recoveryAllowlist(): readonly Route[] {
  return ROUTES.filter((r) => r.recovery);
}

/** `mode = recovery`: cho qua không? `isCoreAgentAccount` = đích của request là tài khoản Core agent. */
export function recoveryDecision(
  route: Pick<Route, 'recovery' | 'recoveryCoreOnly'>,
  ctx: { isCoreAgentAccount: boolean },
): 'allow' | 'blocked' {
  if (!route.recovery) return 'blocked';
  if (route.recoveryCoreOnly && !ctx.isCoreAgentAccount) return 'blocked';
  return 'allow';
}

/** Mã lỗi một route có thể trả: chung (§3.0) + riêng + (`recovery.blocked` nếu O4 ✗) + (`idempotency.conflict` nếu idempotent). */
export function routeErrors(
  route: Pick<Route, 'errors' | 'recovery' | 'idempotent' | 'auth'>,
): readonly RouteErrorCode[] {
  const out = new Set<RouteErrorCode>(COMMON_ERROR_CODES);
  if (route.auth === 'public') {
    out.delete('auth.required');
    out.delete('auth.csrf');
    out.delete('auth.forbidden');
  }
  for (const e of route.errors) out.add(e);
  if (!route.recovery) out.add('recovery.blocked');
  if (route.idempotent) out.add('idempotency.conflict');
  return [...out];
}

/** Mã lỗi cụ thể mà route có thể trả (mở `db.*` thành mọi mã DB). */
export function expandRouteErrors(codes: readonly RouteErrorCode[]): ErrorCode[] {
  const out = new Set<ErrorCode>();
  for (const c of codes) {
    if (c === 'db.*') {
      for (const x of ALL_ERROR_CODES) if (x.startsWith('db.')) out.add(x);
    } else out.add(c);
  }
  return [...out];
}

const LEVEL_RANK: Record<AuthLevel, number> = { public: 0, V: 1, A: 2, O: 3 };
export function authAtLeast(have: AuthLevel, need: AuthLevel): boolean {
  return LEVEL_RANK[have] >= LEVEL_RANK[need];
}

/** Trạng thái ĐÃ LƯU của đối tượng đích (dịch vụ tra DB theo ref, cùng workspace) — dùng cho `ownerWhen` theo chiều thay đổi. */
export interface StoredState {
  /** `egress_rules.action` của luật bị xoá (OPS-08). */
  egressAction?: 'allow' | 'deny';
}

function ownerWhenMatches(
  w: OwnerWhen,
  req: { params?: Record<string, unknown>; body?: unknown; query?: unknown; stored?: StoredState },
): boolean {
  if ('rule' in w) {
    if (w.rule === 'setting_writers') {
      const key = req.params?.settingKey;
      // Khoá lạ ⇒ coi như chỉ owner (fail-closed); dịch vụ trả 404 sau.
      return typeof key !== 'string' || !isSettingKey(key) || !settingWritableBy(key, 'admin');
    }
    // egress_loosen: chỉ xoá luật `allow` (siết) mới ở mức A; `deny` hoặc không rõ ⇒ O.
    return req.stored?.egressAction !== 'allow';
  }
  const source = (w.in === 'body' ? req.body : req.query) as Record<string, unknown> | undefined;
  if (source === undefined || source === null || typeof source !== 'object') return false;
  const value = source[w.field];
  if ('present' in w) return value !== undefined;
  if ('equalsAny' in w) return w.equalsAny.some((x) => x === value);
  return value === w.equals;
}

/**
 * Quyền THỰC SỰ cần cho một request: `auth` của route, nâng lên `O` khi BẤT KỲ `ownerWhen` nào khớp (vd OPS-07 `action = allow`,
 * GW-31 `mode ∈ {allow, ask}`, OPS-03 khoá admin không ghi được, OPS-08 xoá luật `deny`). Gọi SAU khi parse request.
 */
export function requiredAccess(
  route: Pick<Route, 'auth' | 'ownerWhen'>,
  req: { params?: Record<string, unknown>; body?: unknown; query?: unknown; stored?: StoredState },
): AuthLevel {
  return route.ownerWhen.some((w) => ownerWhenMatches(w, req)) ? 'O' : route.auth;
}
