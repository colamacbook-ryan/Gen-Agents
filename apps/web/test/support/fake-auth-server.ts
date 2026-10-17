// Máy chủ giả của API đăng nhập owner (đặc tả L-SEC, feat/m1-sec: apps/control-plane/src/auth/http.ts). Hàm thuần (Request → Response)
// để dùng ở ba nơi: test máy khách HTTP (qua fetchImpl), test app đầy đủ trong happy-dom, và Chromium thật (page.route).
//   POST /api/auth/login     {username, password}            → 200 {mustChangePassword, csrfToken} | 401 | 429 (khoá, kèm retryAfterSeconds)
//   GET  /api/auth/session                                    → 200 {username, mustChangePassword, csrfToken} | 401
//   POST /api/auth/password  {currentPassword, newPassword}   → 200 {csrfToken} | 400 (reason) | 401 | 403 (csrf)
//   POST /api/auth/logout                                     → 204 | 401 | 403 (csrf)
// Chính sách mật khẩu mới chép từ packages/security/src/password.ts (validateNewPassword) của L-SEC.
import { FIRST_PASSWORD } from './secrets.ts';

export const FAKE_PASSWORD_RULES = { minChars: 12, maxChars: 256, minDistinctChars: 5 } as const;

export interface FakeAuthOptions {
  username?: string;
  /** mật khẩu ban đầu (in ở cuối lúc cài đặt) */
  firstPassword?: string;
  /** phiên đầu tiên bị buộc đổi mật khẩu */
  mustChangePassword?: boolean;
  /** số lần sai liên tiếp thì khoá */
  maxFailures?: number;
  lockSeconds?: number;
  now?: () => number;
}

export interface FakeAuthLogEntry {
  method: string;
  path: string;
  status: number;
  csrfHeader: string | null;
  body: unknown;
}

export interface FakeAuthServer {
  handle(req: Request): Promise<Response>;
  /** hàm giống `fetch`, cho createHttpAuthClient({ fetchImpl }) */
  fetch: typeof fetch;
  state: {
    loggedIn: boolean;
    mustChangePassword: boolean;
    password: string;
    csrf: string;
    failures: number;
    lockedUntil: number;
  };
  log: FakeAuthLogEntry[];
}

export function createFakeAuthServer(opts: FakeAuthOptions = {}): FakeAuthServer {
  const username = opts.username ?? 'admin';
  const maxFailures = opts.maxFailures ?? 5;
  const lockSeconds = opts.lockSeconds ?? 60;
  const now = opts.now ?? Date.now;
  let seq = 0;
  const state: FakeAuthServer['state'] = {
    loggedIn: false,
    mustChangePassword: opts.mustChangePassword ?? true,
    password: opts.firstPassword ?? FIRST_PASSWORD,
    csrf: '',
    failures: 0,
    lockedUntil: 0,
  };
  const log: FakeAuthLogEntry[] = [];
  const newCsrf = (): string => `csrf-${++seq}-${Math.random().toString(36).slice(2)}`;

  const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
    });
  const error = (
    status: number,
    code: string,
    i18nKey: string,
    extra: Record<string, unknown> = {},
    headers: Record<string, string> = {},
  ): Response => json(status, { error: { code, i18nKey, requestId: `req-${++seq}` }, ...extra }, headers);

  async function body(req: Request): Promise<Record<string, unknown> | null> {
    if (!/^application\/json\s*(;|$)/i.test(req.headers.get('content-type') ?? '')) return null;
    try {
      const parsed: unknown = JSON.parse(await req.text());
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  function policy(pw: string, current?: string): string | null {
    const chars = [...pw];
    if (chars.length < FAKE_PASSWORD_RULES.minChars) return 'too_short';
    if (chars.length > FAKE_PASSWORD_RULES.maxChars) return 'too_long';
    if (new Set(chars).size < FAKE_PASSWORD_RULES.minDistinctChars) return 'too_repetitive';
    if (username.length >= 3 && pw.toLowerCase().includes(username)) return 'contains_username';
    if (current !== undefined && pw === current) return 'same_as_current';
    return null;
  }

  async function route(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const csrfOk = req.headers.get('x-ga-csrf') === state.csrf && state.csrf !== '';

    if (path === '/api/auth/login' && req.method === 'POST') {
      const b = await body(req);
      if (!b || typeof b.username !== 'string' || typeof b.password !== 'string')
        return error(400, 'validation.failed', 'errors.validation.failed');
      if (now() < state.lockedUntil) {
        const retry = Math.ceil((state.lockedUntil - now()) / 1000);
        return error(
          429,
          'auth.rate_limited',
          'errors.auth.locked',
          { retryAfterSeconds: retry },
          { 'retry-after': String(retry) },
        );
      }
      if (b.username !== username || b.password !== state.password) {
        state.failures += 1;
        if (state.failures >= maxFailures) state.lockedUntil = now() + lockSeconds * 1000;
        // không phân biệt sai tên hay sai mật khẩu
        return error(401, 'auth.required', 'errors.auth.invalid_credentials');
      }
      state.failures = 0;
      state.loggedIn = true;
      state.csrf = newCsrf();
      return json(
        200,
        { mustChangePassword: state.mustChangePassword, csrfToken: state.csrf },
        { 'set-cookie': 'ga_sid=fake; HttpOnly; SameSite=Strict; Path=/' },
      );
    }

    if (path === '/api/auth/session' && req.method === 'GET') {
      if (!state.loggedIn) return error(401, 'auth.required', 'errors.auth.required');
      return json(200, { username, mustChangePassword: state.mustChangePassword, csrfToken: state.csrf });
    }

    if (path === '/api/auth/password' && req.method === 'POST') {
      if (!state.loggedIn) return error(401, 'auth.required', 'errors.auth.required');
      if (!csrfOk) return error(403, 'auth.csrf', 'errors.auth.csrf');
      const b = await body(req);
      if (!b || typeof b.currentPassword !== 'string' || typeof b.newPassword !== 'string')
        return error(400, 'validation.failed', 'errors.validation.failed');
      if (b.currentPassword !== state.password) return error(401, 'auth.required', 'errors.auth.invalid_credentials');
      const reason = policy(b.newPassword, b.currentPassword);
      if (reason) return error(400, 'validation.failed', `errors.auth.password.${reason}`, { reason });
      state.password = b.newPassword;
      state.mustChangePassword = false;
      state.csrf = newCsrf();
      return json(200, { csrfToken: state.csrf }, { 'set-cookie': 'ga_sid=fake2; HttpOnly; SameSite=Strict; Path=/' });
    }

    if (path === '/api/auth/logout' && req.method === 'POST') {
      if (!state.loggedIn) return error(401, 'auth.required', 'errors.auth.required');
      if (!csrfOk) return error(403, 'auth.csrf', 'errors.auth.csrf');
      state.loggedIn = false;
      state.csrf = '';
      return new Response(null, { status: 204, headers: { 'set-cookie': 'ga_sid=; Max-Age=0; Path=/' } });
    }

    return error(404, 'not_found', 'errors.not_found');
  }

  async function handle(req: Request): Promise<Response> {
    const clone = req.clone();
    const res = await route(req);
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(await clone.text());
    } catch {
      parsed = null;
    }
    log.push({
      method: req.method,
      path: new URL(req.url).pathname,
      status: res.status,
      csrfHeader: req.headers.get('x-ga-csrf'),
      body: parsed,
    });
    return res;
  }

  return {
    handle,
    fetch: (input, init) => handle(new Request(new URL(String(input), 'http://localhost'), init)),
    state,
    log,
  };
}
