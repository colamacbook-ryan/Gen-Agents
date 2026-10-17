// Hàng rào hợp đồng cho lỗi của L-SEC (src/auth/http.ts): MỌI phản hồi lỗi phải đúng `ApiErrorEnvelope` (strict — không khoá
// thừa ở gốc) và HTTP status = `httpStatusFor(code)` (một nguồn). L-DS báo lệch 2026-10-17: `auth.rate_limited` + i18nKey
// `errors.auth.locked`, `validation.failed` + `errors.auth.password.<reason>` ⇒ đã đổi sang `auth.locked` / `auth.weak_password`.
import { ApiErrorEnvelope, type ErrorCode, httpStatusFor } from '@ga/contracts';
import { CSRF_HEADER, hashPassword } from '@ga/security';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthService, createAuthHandlers, LOGIN_LIMITS, SqliteAuthStore } from '../../src/auth/index.ts';
import { type TestWorld, tk } from './harness.ts';

const PASSWORD = 'một câu dễ nhớ của chủ nhà';
let world: TestWorld;
let http: ReturnType<typeof createAuthHandlers>;
const origin = () => world.origin;

beforeAll(async () => {
  world = tk.makeWorld();
  const passwordHash = await hashPassword(PASSWORD);
  world.store.createUser({ username: 'fence-user', displayName: 'Fence', passwordHash, mustChangePassword: false });
  world.store.createUser({ username: 'fence-must', displayName: 'Must', passwordHash, mustChangePassword: true });
  world.store.createUser({ username: 'fence-lock', displayName: 'Lock', passwordHash, mustChangePassword: false });
  const service = new AuthService({
    store: new SqliteAuthStore(world.writer),
    clock: world.clock,
    csrfKey: world.csrfKey,
    secureCookies: false,
    allowedOrigins: [world.origin],
  });
  http = createAuthHandlers({ service, allowedOrigins: [world.origin] });
});
afterAll(() => world.close());

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${origin()}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: origin(), ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

async function expectContractError(res: Response, code: ErrorCode): Promise<Record<string, unknown> | undefined> {
  const body = (await res.json()) as unknown;
  const parsed = ApiErrorEnvelope.safeParse(body);
  expect(parsed.success, JSON.stringify(body)).toBe(true);
  expect(parsed.data?.error.code).toBe(code);
  expect(res.status).toBe(httpStatusFor(code));
  expect(parsed.data?.error.i18nKey).toBe(`errors.${code}`);
  return parsed.data?.error.detail as Record<string, unknown> | undefined;
}

async function login(username: string, password: string, ip: string) {
  return http.login(post('/api/auth/login', { username, password }), ip);
}

describe('lỗi của L-SEC qua hàng rào ApiErrorEnvelope', () => {
  it('sai mật khẩu / user lạ ⇒ auth.invalid_credentials (401), cùng một thân', async () => {
    await expectContractError(await login('fence-user', 'sai-mat-khau', '10.9.0.1'), 'auth.invalid_credentials');
    await expectContractError(await login('khong-co-ai', 'x', '10.9.0.2'), 'auth.invalid_credentials');
  });

  it('khoá tạm ⇒ auth.locked (403) + detail.retryAfterS + Retry-After', async () => {
    let res: Response | null = null;
    for (let i = 0; i < 6; i++) res = await login('fence-lock', `sai-${i}`, `10.9.1.${i}`);
    const locked = await login('fence-lock', PASSWORD, '10.9.1.99');
    const detail = await expectContractError(locked, 'auth.locked');
    expect(detail?.retryAfterS).toBeGreaterThan(0);
    expect(Number(locked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(res).not.toBeNull();
  });

  it('vượt giới hạn IP ⇒ auth.rate_limited (429) + detail.retryAfterS', async () => {
    for (let i = 0; i < LOGIN_LIMITS.perIp.limit; i++) await login(`ghost-${i}`, 'x', '10.9.2.1');
    const detail = await expectContractError(await login('ghost-x', 'x', '10.9.2.1'), 'auth.rate_limited');
    expect(detail?.retryAfterS).toBeGreaterThan(0);
  });

  it('thân hỏng ⇒ validation.failed (400); Origin lạ ⇒ auth.csrf (403)', async () => {
    await expectContractError(await http.login(post('/api/auth/login', '{x'), '10.9.3.1'), 'validation.failed');
    const evil = post('/api/auth/login', { username: 'a', password: 'b' }, { origin: 'https://evil.example' });
    await expectContractError(await http.login(evil, '10.9.3.2'), 'auth.csrf');
  });

  it('không phiên ⇒ auth.required (401); phiên bắt đổi mật khẩu ⇒ auth.must_change_password (403)', async () => {
    const g = http.guard(new Request(`${origin()}/api/overview`));
    expect(g.ok).toBe(false);
    if (!g.ok) await expectContractError(g.response, 'auth.required');
    const ok = await login('fence-must', PASSWORD, '10.9.4.1');
    const cookie = (ok.headers.get('set-cookie') ?? '').split(';')[0] as string;
    const g2 = http.guard(new Request(`${origin()}/api/overview`, { headers: { cookie } }));
    expect(g2.ok).toBe(false);
    if (!g2.ok) await expectContractError(g2.response, 'auth.must_change_password');
  });

  it('mật khẩu mới yếu ⇒ auth.weak_password (422) + detail.reason; sai mật khẩu hiện tại ⇒ auth.invalid_credentials', async () => {
    const ok = await login('fence-user', PASSWORD, '10.9.5.1');
    const cookie = (ok.headers.get('set-cookie') ?? '').split(';')[0] as string;
    const { csrfToken } = (await ok.json()) as { csrfToken: string };
    const change = (currentPassword: string, newPassword: string) =>
      http.changePassword(
        post('/api/auth/password', { currentPassword, newPassword }, { cookie, [CSRF_HEADER]: csrfToken }),
        '10.9.5.2',
      );
    const weak = await expectContractError(await change(PASSWORD, 'ngắn'), 'auth.weak_password');
    expect(weak?.reason).toBe('too_short');
    await expectContractError(
      await change('sai-mat-khau-hien-tai', 'một câu khác hẳn dài'),
      'auth.invalid_credentials',
    );
  });
});
