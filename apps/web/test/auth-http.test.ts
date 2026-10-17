import { describe, expect, it, vi } from 'vitest';
import { classifyAuthError } from '../src/auth/classify.ts';
import { AUTH_PATHS, CSRF_HEADER, createHttpAuthClient } from '../src/auth/http-client.ts';
import { type AuthError, isAuthError } from '../src/auth/types.ts';
import { authError } from './support/fake-auth-client.ts';
import { createFakeAuthServer } from './support/fake-auth-server.ts';
import { FIRST_PASSWORD, NEW_PASSWORD, WRONG_PASSWORD } from './support/secrets.ts';

const FIRST = FIRST_PASSWORD;
const STRONG = NEW_PASSWORD;
const SECRET = `bi mat ${NEW_PASSWORD.length}`;

async function failure(p: Promise<unknown>): Promise<AuthError> {
  try {
    await p;
  } catch (e) {
    expect(isAuthError(e), String(e)).toBe(true);
    return e as AuthError;
  }
  throw new Error('mong đợi lỗi nhưng không có');
}

describe('máy khách HTTP theo đặc tả L-SEC', () => {
  it('luồng lần đầu: đăng nhập → buộc đổi mật khẩu → đổi → phiên không còn bị buộc → đăng xuất', async () => {
    const server = createFakeAuthServer({ firstPassword: FIRST });
    const client = createHttpAuthClient({ fetchImpl: server.fetch });

    expect(await client.session()).toBeNull();
    expect(await client.login({ username: 'admin', password: FIRST })).toEqual({ mustChangePassword: true });
    expect(await client.session()).toMatchObject({ username: 'admin', mustChangePassword: true });
    await client.changePassword({ currentPassword: FIRST, newPassword: STRONG });
    expect(await client.session()).toMatchObject({ mustChangePassword: false });
    await client.logout();
    expect(await client.session()).toBeNull();
    expect(server.log.map((l) => `${l.method} ${l.path} ${l.status}`)).toEqual([
      'GET /api/auth/session 401',
      'POST /api/auth/login 200',
      'GET /api/auth/session 200',
      'POST /api/auth/password 200',
      'GET /api/auth/session 200',
      'POST /api/auth/logout 204',
      'GET /api/auth/session 401',
    ]);
  });

  it('mọi POST sau đăng nhập mang header CSRF đúng token hiện hành; đổi mật khẩu cấp token mới', async () => {
    const server = createFakeAuthServer({ firstPassword: FIRST });
    const client = createHttpAuthClient({ fetchImpl: server.fetch });
    await client.login({ username: 'admin', password: FIRST });
    const first = server.state.csrf;
    await client.changePassword({ currentPassword: FIRST, newPassword: STRONG });
    expect(server.state.csrf).not.toBe(first);
    await client.logout();
    const posts = server.log.filter((l) => l.method === 'POST' && l.path !== AUTH_PATHS.login);
    expect(posts[0]?.csrfHeader).toBe(first);
    expect(posts[1]?.csrfHeader).toMatch(/^csrf-/);
    expect(posts[1]?.csrfHeader).not.toBe(first);
    // đăng nhập không mang CSRF (chưa có phiên)
    expect(server.log.find((l) => l.path === AUTH_PATHS.login)?.csrfHeader).toBeNull();
    expect(CSRF_HEADER).toBe('x-ga-csrf');
  });

  it('thiếu / sai CSRF ⇒ 403 auth.csrf (ca âm: máy chủ giả từ chối, máy khách báo đúng loại)', async () => {
    const server = createFakeAuthServer({ firstPassword: FIRST });
    const client = createHttpAuthClient({ fetchImpl: server.fetch });
    await client.login({ username: 'admin', password: FIRST });
    server.state.csrf = 'token-khac'; // phiên bị đổi phía máy chủ
    const e = await failure(client.changePassword({ currentPassword: FIRST, newPassword: STRONG }));
    expect(e).toMatchObject({ status: 403, code: 'auth.csrf', i18nKey: 'errors.auth.csrf' });
    expect(classifyAuthError(e)).toBe('csrf');
  });

  it('sai mật khẩu và sai tên cho CÙNG một lỗi (không lộ phần nào sai)', async () => {
    const server = createFakeAuthServer({ firstPassword: FIRST, maxFailures: 99 });
    const client = createHttpAuthClient({ fetchImpl: server.fetch });
    const wrongPass = await failure(client.login({ username: 'admin', password: WRONG_PASSWORD }));
    const wrongUser = await failure(client.login({ username: 'khong-co', password: FIRST }));
    for (const e of [wrongPass, wrongUser]) {
      expect(e).toMatchObject({ status: 401, i18nKey: 'errors.auth.invalid_credentials' });
      expect(classifyAuthError(e)).toBe('invalid_credentials');
    }
    expect({ ...wrongPass, requestId: 'x', stack: '' }).toEqual({ ...wrongUser, requestId: 'x', stack: '' });
  });

  it('khoá tạm sau nhiều lần sai: 429 kèm retryAfterSeconds; hết hạn khoá thì đăng nhập lại được', async () => {
    let t = 1_000_000;
    const server = createFakeAuthServer({ firstPassword: FIRST, maxFailures: 3, lockSeconds: 90, now: () => t });
    const client = createHttpAuthClient({ fetchImpl: server.fetch });
    for (let i = 0; i < 3; i++) await failure(client.login({ username: 'admin', password: WRONG_PASSWORD }));
    const locked = await failure(client.login({ username: 'admin', password: FIRST })); // đúng mật khẩu vẫn bị khoá
    expect(locked).toMatchObject({
      status: 429,
      code: 'auth.rate_limited',
      i18nKey: 'errors.auth.locked',
      retryAfterSeconds: 90,
    });
    expect(classifyAuthError(locked)).toBe('locked');
    t += 91_000;
    expect(await client.login({ username: 'admin', password: FIRST })).toEqual({ mustChangePassword: true });
  });

  it('retry-after ở header được dùng khi thân không có retryAfterSeconds', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: 'auth.rate_limited', i18nKey: 'errors.auth.rate_limited' } }), {
          status: 429,
          headers: { 'content-type': 'application/json', 'retry-after': '42' },
        }),
    );
    const e = await failure(createHttpAuthClient({ fetchImpl }).login({ username: 'a', password: 'b' }));
    expect(e.retryAfterSeconds).toBe(42);
    expect(classifyAuthError(e)).toBe('rate_limited');
  });

  it('mật khẩu mới yếu: mỗi lý do cho đúng khoá i18n + reason, phân loại weak_password', async () => {
    const cases: [string, string][] = [
      ['ngan', 'too_short'],
      ['a'.repeat(300), 'too_long'],
      ['abababababab', 'too_repetitive'],
      ['xin chao admin 2026', 'contains_username'],
      [FIRST, 'same_as_current'],
    ];
    for (const [pw, reason] of cases) {
      const server = createFakeAuthServer({ firstPassword: FIRST });
      const client = createHttpAuthClient({ fetchImpl: server.fetch });
      await client.login({ username: 'admin', password: FIRST });
      // same_as_current cần độ dài đạt nên dùng chính mật khẩu đầu (≥ 12 ký tự)
      const e = await failure(client.changePassword({ currentPassword: FIRST, newPassword: pw }));
      expect(e, reason).toMatchObject({ status: 400, i18nKey: `errors.auth.password.${reason}`, reason });
      expect(classifyAuthError(e), reason).toBe('weak_password');
    }
  });

  it('mật khẩu hiện tại sai khi đổi mật khẩu ⇒ lỗi thông tin đăng nhập, không phải mật khẩu yếu', async () => {
    const server = createFakeAuthServer({ firstPassword: FIRST });
    const client = createHttpAuthClient({ fetchImpl: server.fetch });
    await client.login({ username: 'admin', password: FIRST });
    const e = await failure(client.changePassword({ currentPassword: 'sai-roi', newPassword: STRONG }));
    expect(classifyAuthError(e)).toBe('invalid_credentials');
  });

  it('session(): 401 ⇒ null (không ném) và quên CSRF; logout khi đã hết phiên coi như xong', async () => {
    const server = createFakeAuthServer({ firstPassword: FIRST });
    const client = createHttpAuthClient({ fetchImpl: server.fetch });
    await client.login({ username: 'admin', password: FIRST });
    server.state.loggedIn = false; // phiên hết phía máy chủ
    expect(await client.session()).toBeNull();
    await expect(client.logout()).resolves.toBeUndefined();
  });

  it('lỗi mạng: AuthError code network, giữ nguyên nguyên nhân gốc', async () => {
    const cause = new TypeError('Failed to fetch');
    const client = createHttpAuthClient({ fetchImpl: () => Promise.reject(cause) });
    const e = await failure(client.login({ username: 'a', password: 'b' }));
    expect(e).toMatchObject({ code: 'network', status: 0, i18nKey: 'errors.network' });
    expect(e.cause).toBe(cause);
    expect(classifyAuthError(e)).toBe('network');
  });

  it('phản hồi hỏng không bị nuốt: 200 sai hình ⇒ bad_response; 500 thân HTML ⇒ internal; mã lạ ⇒ bad_response', async () => {
    const mk =
      (status: number, body: string, type = 'application/json') =>
      async () =>
        new Response(body, { status, headers: { 'content-type': type } });
    expect(
      await failure(createHttpAuthClient({ fetchImpl: mk(200, '{"x":1}') }).login({ username: 'a', password: 'b' })),
    ).toMatchObject({ code: 'bad_response' });
    expect(await failure(createHttpAuthClient({ fetchImpl: mk(200, 'không phải json') }).session())).toMatchObject({
      code: 'bad_response',
    });
    expect(
      await failure(
        createHttpAuthClient({ fetchImpl: mk(500, '<html>oops</html>', 'text/html') }).login({
          username: 'a',
          password: 'b',
        }),
      ),
    ).toMatchObject({ code: 'internal', i18nKey: 'errors.internal' });
    expect(
      await failure(
        createHttpAuthClient({
          fetchImpl: mk(400, JSON.stringify({ error: { code: 'ma.la.chua.biet', i18nKey: 'errors.ma.la' } })),
        }).login({ username: 'a', password: 'b' }),
      ),
    ).toMatchObject({ code: 'bad_response' });
    // phiên trả thiếu csrfToken ⇒ không tin
    expect(
      await failure(
        createHttpAuthClient({ fetchImpl: mk(200, '{"username":"admin","mustChangePassword":false}') }).session(),
      ),
    ).toMatchObject({ code: 'bad_response' });
  });

  it('yêu cầu gửi đi: JSON, cùng origin, không cache, KHÔNG đưa thông tin đăng nhập lên URL', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return new Response(JSON.stringify({ mustChangePassword: false, csrfToken: 'c' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    await createHttpAuthClient({ fetchImpl, baseUrl: '' }).login({ username: 'admin', password: SECRET });
    const call = calls[0];
    if (!call) throw new Error('không có yêu cầu nào được gửi');
    expect(call.url).toBe('/api/auth/login');
    expect(call.url).not.toContain(SECRET);
    expect(call.init).toMatchObject({ method: 'POST', credentials: 'same-origin', cache: 'no-store' });
    expect((call.init.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(JSON.parse(call.init.body as string)).toEqual({ username: 'admin', password: SECRET });
  });
});

describe('classifyAuthError nhận cả hai dạng mã (không phụ thuộc L-SEC chọn dạng nào)', () => {
  it('mã riêng của contracts: auth.locked, auth.weak_password', () => {
    expect(classifyAuthError(authError('auth.locked', { status: 429 }))).toBe('locked');
    expect(classifyAuthError(authError('auth.weak_password', { status: 400 }))).toBe('weak_password');
    expect(classifyAuthError(authError('auth.invalid_credentials', { status: 401 }))).toBe('invalid_credentials');
  });

  it('mã chung + khoá i18n (dạng L-SEC hiện tại)', () => {
    expect(classifyAuthError(authError('auth.rate_limited', { i18nKey: 'errors.auth.locked' }))).toBe('locked');
    expect(classifyAuthError(authError('auth.rate_limited'))).toBe('rate_limited');
    expect(
      classifyAuthError(
        authError('validation.failed', { i18nKey: 'errors.auth.password.too_short', reason: 'too_short' }),
      ),
    ).toBe('weak_password');
    expect(classifyAuthError(authError('auth.required', { i18nKey: 'errors.auth.invalid_credentials' }))).toBe(
      'invalid_credentials',
    );
    expect(classifyAuthError(authError('auth.required'))).toBe('session_expired');
    expect(classifyAuthError(authError('internal'))).toBe('other');
  });
});
