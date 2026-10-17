// Handler HTTP chuẩn Web (Request → Response) cho đăng nhập owner — Hono / @hono/node-server gọi qua `c.req.raw`
// (lane INT đăng ký route ở `routes/index.ts`; module `http/` lo middleware chung). Hợp đồng lỗi: ApiErrorBody của contracts.
//   POST /api/auth/login     {username, password}            → 200 {mustChangePassword, csrfToken} + Set-Cookie
//   GET  /api/auth/session                                    → 200 {username, mustChangePassword, csrfToken}
//   POST /api/auth/password  {currentPassword, newPassword}   → 200 {csrfToken} + Set-Cookie (phiên mới)
//   POST /api/auth/logout                                     → 204 + Set-Cookie xoá
// Mọi POST: chỉ nhận `application/json` (form chéo trang không gửi được), thân ≤ 4 KiB đọc có trần TRƯỚC khi parse;
// login kiểm Origin / Sec-Fetch-Site (chống login CSRF); các POST khác kiểm thêm CSRF gắn phiên (AuthService.authenticate).
// `ip` do tầng http/ cung cấp (lấy từ edge tin cậy — Caddy — không lấy thẳng X-Forwarded-For của client).
import { randomUUID } from 'node:crypto';
import { type ApiErrorCode, i18nKeyFor } from '@ga/contracts';
import { CSRF_HEADER, checkRequestOrigin } from '@ga/security';
import type { AuthContext, AuthFailure, AuthService } from './service.ts';

export const AUTH_ROUTES = {
  login: { method: 'POST', path: '/api/auth/login' },
  session: { method: 'GET', path: '/api/auth/session' },
  password: { method: 'POST', path: '/api/auth/password' },
  logout: { method: 'POST', path: '/api/auth/logout' },
} as const;

export const MAX_AUTH_BODY_BYTES = 4096;

/** Endpoint vẫn mở khi phiên đang bắt đổi mật khẩu (FS G1 → G2 bước 1). */
export const ALLOWED_DURING_PASSWORD_CHANGE: ReadonlySet<string> = new Set([
  AUTH_ROUTES.session.path,
  AUTH_ROUTES.password.path,
  AUTH_ROUTES.logout.path,
]);

interface ErrorExtra {
  /** ⇒ `error.detail.retryAfterS` + header `Retry-After`. */
  retryAfterSeconds?: number;
  /** ⇒ `error.detail.reason` (khoá enum, không chuỗi tự do). */
  reason?: string;
  setCookie?: string | null;
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export function errorResponse(status: number, code: ApiErrorCode, extra: ErrorExtra = {}): Response {
  const headers: Record<string, string> = {};
  if (extra.retryAfterSeconds !== undefined) headers['retry-after'] = String(extra.retryAfterSeconds);
  if (extra.setCookie) headers['set-cookie'] = extra.setCookie;
  // Phong bì đúng `ApiErrorEnvelope` của contracts (strict): i18nKey suy từ mã, phần phụ nằm trong `error.detail`
  // (L-APP sửa ánh xạ mã lỗi theo yêu cầu Gen 2026-10-17 — logic xác thực không đổi).
  const detail = {
    ...(extra.retryAfterSeconds !== undefined ? { retryAfterS: extra.retryAfterSeconds } : {}),
    ...(extra.reason !== undefined ? { reason: extra.reason } : {}),
  };
  return json(
    status,
    {
      error: {
        code,
        i18nKey: i18nKeyFor(code),
        requestId: randomUUID(),
        ...(Object.keys(detail).length > 0 ? { detail } : {}),
      },
    },
    headers,
  );
}

/** Mã lỗi đăng nhập ⇒ HTTP. "Sai user hay sai pass" không phân biệt (FS G1). */
function failureResponse(f: AuthFailure): Response {
  switch (f.code) {
    case 'invalid_credentials':
      return errorResponse(401, 'auth.invalid_credentials');
    case 'locked':
      return errorResponse(403, 'auth.locked', { retryAfterSeconds: f.retryAfterSeconds });
    case 'rate_limited':
      return errorResponse(429, 'auth.rate_limited', { retryAfterSeconds: f.retryAfterSeconds });
    case 'bad_request':
      return errorResponse(400, 'validation.failed');
  }
}

/** Đọc thân JSON có trần byte (dừng ngay khi vượt, không đọc hết luồng). null = sai content-type / quá lớn / JSON hỏng. */
export async function readJsonBody(
  req: Request,
  maxBytes = MAX_AUTH_BODY_BYTES,
): Promise<Record<string, unknown> | null> {
  const ct = req.headers.get('content-type') ?? '';
  if (!/^application\/json\s*(;|$)/i.test(ct)) return null;
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > maxBytes) return null;
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export interface AuthHttpOptions {
  service: AuthService;
  allowedOrigins: readonly string[];
}

export type GuardResult = { ok: true; ctx: AuthContext } | { ok: false; response: Response };

export function createAuthHandlers(opts: AuthHttpOptions) {
  const { service } = opts;

  /** Middleware cho mọi route API cần đăng nhập (tầng http/ gọi). */
  function guard(req: Request): GuardResult {
    const r = service.authenticate({
      method: req.method,
      cookieHeader: req.headers.get('cookie'),
      csrfHeader: req.headers.get(CSRF_HEADER),
      origin: req.headers.get('origin'),
      secFetchSite: req.headers.get('sec-fetch-site'),
    });
    if (!r.ok) {
      if (r.code === 'auth.csrf') return { ok: false, response: errorResponse(403, 'auth.csrf') };
      return { ok: false, response: errorResponse(401, 'auth.required', { setCookie: r.clearCookie }) };
    }
    const path = new URL(req.url).pathname;
    if (r.ctx.mustChangePassword && !ALLOWED_DURING_PASSWORD_CHANGE.has(path)) {
      return { ok: false, response: errorResponse(403, 'auth.must_change_password') };
    }
    return r;
  }

  async function login(req: Request, ip: string): Promise<Response> {
    const origin = checkRequestOrigin({
      method: req.method,
      origin: req.headers.get('origin'),
      secFetchSite: req.headers.get('sec-fetch-site'),
      allowedOrigins: opts.allowedOrigins,
    });
    if (!origin.ok) return errorResponse(403, 'auth.csrf');
    const body = await readJsonBody(req);
    if (!body) return errorResponse(400, 'validation.failed');
    const r = await service.login({
      username: body.username,
      password: body.password,
      ip,
      userAgent: req.headers.get('user-agent'),
    });
    if (!r.ok) return failureResponse(r);
    return json(
      200,
      { mustChangePassword: r.mustChangePassword, csrfToken: r.csrfToken },
      { 'set-cookie': r.setCookie },
    );
  }

  function session(req: Request): Response {
    const g = guard(req);
    if (!g.ok) return g.response;
    return json(200, {
      username: g.ctx.username,
      mustChangePassword: g.ctx.mustChangePassword,
      csrfToken: g.ctx.csrfToken,
    });
  }

  async function changePassword(req: Request, ip: string): Promise<Response> {
    const g = guard(req);
    if (!g.ok) return g.response;
    const body = await readJsonBody(req);
    if (!body) return errorResponse(400, 'validation.failed');
    const r = await service.changePassword(g.ctx, {
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
      ip,
      userAgent: req.headers.get('user-agent'),
    });
    if (r.ok) return json(200, { csrfToken: r.csrfToken }, { 'set-cookie': r.setCookie });
    if (r.code === 'weak_password') {
      return errorResponse(422, 'auth.weak_password', { reason: r.reason });
    }
    return failureResponse(r);
  }

  function logout(req: Request): Response {
    const g = guard(req);
    if (!g.ok) return g.response;
    const { setCookie } = service.logout(g.ctx);
    return new Response(null, { status: 204, headers: { 'set-cookie': setCookie, 'cache-control': 'no-store' } });
  }

  return { guard, login, session, changePassword, logout };
}
