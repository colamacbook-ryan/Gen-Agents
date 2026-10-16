// Đăng nhập owner end-to-end trên DB thật (migration vendor + hợp đồng kết nối ⑥-05) + handler HTTP chuẩn Web.
// Mỗi lối vào có ca âm: sai mật khẩu, user lạ, khoá tạm, giới hạn IP / tài khoản, cookie giả / trùng / hết hạn / thu hồi,
// thiếu CSRF / CSRF phiên khác / Origin lạ, bắt đổi mật khẩu lần đầu, mật khẩu yếu, thân request sai / quá lớn.
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Clock } from '@ga/contracts';
import { SYSTEM_WORKSPACE_ID } from '@ga/contracts';
import { type AppConnection, migrate, openWriter, SQLITE_MIGRATIONS_DIR } from '@ga/db';
import { CSRF_HEADER, deriveSubkey, passwordHasherRuns } from '@ga/security';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AuthService,
  createAuthHandlers,
  firstPasswordFile,
  LOGIN_LIMITS,
  SqliteAuthStore,
} from '../src/auth/index.ts';

class FakeClock implements Clock {
  private t = Date.parse('2026-10-16T08:00:00.000Z');
  now(): Date {
    return new Date(this.t);
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

const ORIGIN = 'http://localhost:7400';
const SYS_ACTOR = '0000000000000000000000SYS1';

interface Env {
  dir: string;
  conn: AppConnection;
  clock: FakeClock;
  service: AuthService;
  http: ReturnType<typeof createAuthHandlers>;
  firstPath: string;
}

function setup(): Env {
  const dir = mkdtempSync(join(tmpdir(), 'ga-auth-'));
  const clock = new FakeClock();
  const conn = openWriter(join(dir, 'gen.sqlite'), { clock });
  migrate(conn, { dir: SQLITE_MIGRATIONS_DIR, appVersion: '0.0.0' });
  // workspace hệ thống + actor system (bản cài thật: seed tham chiếu CNS-170 làm việc này)
  conn.db
    .prepare(
      "INSERT INTO workspaces (id, kind, slug, name, short_code) VALUES (?, 'system', 'system', 'System', 'SYS0')",
    )
    .run(SYSTEM_WORKSPACE_ID);
  conn.db
    .prepare(
      "INSERT INTO actors (id, workspace_id, kind, system_key, label) VALUES (?, ?, 'system', 'system', 'System')",
    )
    .run(SYS_ACTOR, SYSTEM_WORKSPACE_ID);
  const firstPath = join(dir, 'first-password');
  const service = new AuthService({
    store: new SqliteAuthStore(conn),
    clock,
    csrfKey: deriveSubkey(Buffer.alloc(32, 7), 'csrf'),
    secureCookies: false,
    allowedOrigins: [ORIGIN],
    firstPassword: firstPasswordFile(firstPath),
  });
  return { dir, conn, clock, service, http: createAuthHandlers({ service, allowedOrigins: [ORIGIN] }), firstPath };
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const get = (path: string, headers: Record<string, string> = {}) => new Request(`${ORIGIN}${path}`, { headers });
const cookieOf = (res: Response) => (res.headers.get('set-cookie') ?? '').split(';')[0] as string;

async function loginOk(env: Env, password: string, ip = '10.0.0.1') {
  const res = await env.http.login(post('/api/auth/login', { username: 'admin', password }), ip);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { csrfToken: string; mustChangePassword: boolean };
  return { cookie: cookieOf(res), csrf: body.csrfToken, mustChange: body.mustChangePassword, res };
}

describe('auth owner', () => {
  let env: Env;
  let first: string;
  beforeEach(async () => {
    env = setup();
    expect(await env.service.bootstrapOwner({ displayName: 'Chủ' })).toEqual({ created: true });
    first = readFileSync(env.firstPath, 'utf8').trim();
  });
  afterEach(() => {
    env.conn.close();
    rmSync(env.dir, { recursive: true, force: true });
  });

  it('khởi động lần đầu: mật khẩu vài từ, tệp 0600, DB chỉ có argon2id; lần hai không tạo lại', async () => {
    expect(first).toMatch(/^[a-z]{3,8}-[a-z]{3,8}-[a-z]{3,8}-\d{4}$/);
    expect(statSync(env.firstPath).mode & 0o777).toBe(0o600);
    const row = env.conn.db.prepare('SELECT username, password_hash, must_change_password FROM users').get() as {
      username: string;
      password_hash: string;
      must_change_password: number;
    };
    expect(row.username).toBe('admin');
    expect(row.password_hash).toMatch(/^\$argon2id\$v=19\$/);
    expect(row.password_hash).not.toContain(first);
    expect(row.must_change_password).toBe(1);
    expect(await env.service.bootstrapOwner({ displayName: 'Chủ' })).toEqual({ created: false });
  });

  it('đăng nhập lần đầu ⇒ phiên bắt đổi mật khẩu: mọi API khác 403, đổi xong mới vào; tệp mật khẩu lần đầu bị xoá', async () => {
    const s = await loginOk(env, first);
    expect(s.mustChange).toBe(true);
    expect(s.res.headers.get('set-cookie')).toMatch(
      /^ga_sid=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=\d+; HttpOnly; SameSite=Strict$/,
    );
    // route khác (vd lưới A0) bị chặn tới khi đổi mật khẩu
    const other = env.http.guard(get('/api/overview', { cookie: s.cookie }));
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.response.status).toBe(403);
    expect((await env.http.session(get('/api/auth/session', { cookie: s.cookie })).json()) as object).toMatchObject({
      mustChangePassword: true,
    });
    // đổi mật khẩu
    const res = await env.http.changePassword(
      post(
        '/api/auth/password',
        { currentPassword: first, newPassword: 'một câu dễ nhớ của chủ' },
        { cookie: s.cookie, [CSRF_HEADER]: s.csrf },
      ),
      '10.0.0.1',
    );
    expect(res.status).toBe(200);
    const newCookie = cookieOf(res);
    expect(newCookie).not.toBe(s.cookie);
    expect(existsSync(env.firstPath)).toBe(false);
    // phiên cũ bị thu hồi (chống cố định phiên); phiên mới vào được mọi route
    expect(env.http.guard(get('/api/overview', { cookie: s.cookie })).ok).toBe(false);
    expect(env.http.guard(get('/api/overview', { cookie: newCookie })).ok).toBe(true);
    // mật khẩu lần đầu hết hiệu lực
    const old = await env.http.login(post('/api/auth/login', { username: 'admin', password: first }), '10.0.0.2');
    expect(old.status).toBe(401);
  });

  it('ca âm đăng nhập: sai mật khẩu / user lạ cùng một mã lỗi; user lạ tốn đúng một lần băm', async () => {
    const wrong = await env.http.login(
      post('/api/auth/login', { username: 'admin', password: 'sai-mat-khau' }),
      '10.0.0.3',
    );
    const ghost = await env.http.login(post('/api/auth/login', { username: 'khong-co', password: 'x' }), '10.0.0.4');
    expect(wrong.status).toBe(401);
    expect(ghost.status).toBe(401);
    const a = (await wrong.json()) as { error: { code: string; i18nKey: string } };
    const b = (await ghost.json()) as { error: { code: string; i18nKey: string } };
    expect(a.error.code).toBe(b.error.code);
    expect(a.error.i18nKey).toBe(b.error.i18nKey);
    const before = passwordHasherRuns();
    await env.service.login({ username: 'nobody', password: 'x', ip: '10.0.0.5', userAgent: null });
    expect(passwordHasherRuns() - before).toBe(1);
    // username hoa / khoảng trắng / NFC được chuẩn hoá
    expect(
      (await env.service.login({ username: ' ADMIN ', password: first, ip: '10.0.0.6', userAgent: null })).ok,
    ).toBe(true);
  });

  it('khoá tạm tài khoản sau 5 lần sai (đếm ngược), mật khẩu đúng trong lúc khoá vẫn bị từ chối, hết hạn thì vào được', async () => {
    for (let i = 0; i < 4; i++) {
      const r = await env.service.login({
        username: 'admin',
        password: `sai-${i}`,
        ip: `10.1.0.${i}`,
        userAgent: null,
      });
      expect(r).toEqual({ ok: false, code: 'invalid_credentials' });
    }
    const fifth = await env.service.login({ username: 'admin', password: 'sai-5', ip: '10.1.0.9', userAgent: null });
    expect(fifth).toEqual({ ok: false, code: 'locked', retryAfterSeconds: 30 });
    const during = await env.service.login({ username: 'admin', password: first, ip: '10.1.1.1', userAgent: null });
    expect(during).toMatchObject({ ok: false, code: 'locked' });
    const res = await env.http.login(post('/api/auth/login', { username: 'admin', password: first }), '10.1.1.2');
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    env.clock.advance(31_000);
    expect((await env.service.login({ username: 'admin', password: first, ip: '10.1.1.3', userAgent: null })).ok).toBe(
      true,
    );
    const row = env.conn.db.prepare('SELECT failed_login_count, locked_until FROM users').get();
    expect(row).toEqual({ failed_login_count: 0, locked_until: null });
  });

  it('giới hạn theo IP (10 / 15 phút) — chặn cả đầu vào hỏng, không có đường thử miễn phí; qua cửa sổ thì mở lại', async () => {
    for (let i = 0; i < LOGIN_LIMITS.perIp.limit; i++) {
      const r = await env.service.login({ username: `ghost${i}`, password: 'x', ip: '10.2.0.1', userAgent: null });
      expect(r.ok).toBe(false);
    }
    expect(
      await env.service.login({ username: 'admin', password: first, ip: '10.2.0.1', userAgent: null }),
    ).toMatchObject({
      ok: false,
      code: 'rate_limited',
    });
    expect(await env.service.login({ username: '', password: 1, ip: '10.2.0.1', userAgent: null })).toMatchObject({
      code: 'rate_limited',
    });
    env.clock.advance(LOGIN_LIMITS.perIp.windowMs + 1);
    expect((await env.service.login({ username: 'admin', password: first, ip: '10.2.0.1', userAgent: null })).ok).toBe(
      true,
    );
  });

  it('giới hạn theo tài khoản: đổi IP liên tục vẫn bị chặn sau 10 lần (đã khoá từ lần 5)', async () => {
    let last: unknown;
    for (let i = 0; i < 11; i++)
      last = await env.service.login({ username: 'admin', password: `x${i}`, ip: `10.3.${i}.1`, userAgent: null });
    expect(last).toMatchObject({ ok: false });
    expect(['locked', 'rate_limited']).toContain((last as { code: string }).code);
  });

  it('ca âm phiên: không cookie, cookie giả, cookie trùng tên, phiên thu hồi, hết hạn tuyệt đối, quá lâu không hoạt động', async () => {
    const s = await loginOk(env, first);
    const g = (cookie: string) => env.http.guard(get('/api/auth/session', { cookie }));
    expect(g('').ok).toBe(false);
    expect(g(`ga_sid=${'A'.repeat(43)}`).ok).toBe(false);
    // cookie 43 ký tự không phải base64url chuẩn ⇒ 401, không lỗi 500 (review adversarial)
    const bad = g(`ga_sid=${'A'.repeat(42)}B`);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.response.status).toBe(401);
    expect(g(`${s.cookie}; ${s.cookie.replace(/.$/, 'B')}`).ok).toBe(false);
    expect(g(s.cookie).ok).toBe(true);
    // không hoạt động > 12 giờ
    env.clock.advance(12 * 3600_000 + 1);
    const idle = g(s.cookie);
    expect(idle.ok).toBe(false);
    if (!idle.ok) expect(idle.response.headers.get('set-cookie')).toContain('Max-Age=0');
    // hết hạn tuyệt đối: giữ hoạt động mỗi giờ nhưng quá 7 ngày
    const s2 = await loginOk(env, first, '10.4.0.1');
    for (let h = 0; h < 7 * 24; h++) {
      env.clock.advance(3600_000);
      g(s2.cookie);
    }
    env.clock.advance(3600_000);
    expect(g(s2.cookie).ok).toBe(false);
    // đăng xuất ⇒ thu hồi
    const s3 = await loginOk(env, first, '10.4.0.2');
    const out = env.http.logout(post('/api/auth/logout', {}, { cookie: s3.cookie, [CSRF_HEADER]: s3.csrf }));
    expect(out.status).toBe(204);
    expect(g(s3.cookie).ok).toBe(false);
  });

  it('ca âm CSRF: POST thiếu header, CSRF của phiên khác, Origin lạ, Sec-Fetch-Site cross-site; GET không cần CSRF', async () => {
    const s = await loginOk(env, first);
    const t = await loginOk(env, first, '10.5.0.1');
    const guardPost = (headers: Record<string, string>) => env.http.guard(post('/api/auth/logout', {}, headers));
    const status = (r: ReturnType<typeof guardPost>) => (r.ok ? 200 : r.response.status);
    expect(status(guardPost({ cookie: s.cookie }))).toBe(403);
    expect(status(guardPost({ cookie: s.cookie, [CSRF_HEADER]: t.csrf }))).toBe(403);
    expect(status(guardPost({ cookie: s.cookie, [CSRF_HEADER]: s.csrf, origin: 'https://evil.example' }))).toBe(403);
    expect(status(guardPost({ cookie: s.cookie, [CSRF_HEADER]: s.csrf, 'sec-fetch-site': 'cross-site' }))).toBe(403);
    expect(status(guardPost({ cookie: s.cookie, [CSRF_HEADER]: s.csrf }))).toBe(200);
    expect(env.http.guard(get('/api/auth/session', { cookie: s.cookie })).ok).toBe(true);
  });

  it('ca âm login CSRF + thân request: Origin lạ, form urlencoded, JSON hỏng, thân > 4 KiB, mảng', async () => {
    const res = (r: Request) => env.http.login(r, '10.6.0.1');
    expect(
      (await res(post('/api/auth/login', { username: 'admin', password: first }, { origin: 'https://evil.example' })))
        .status,
    ).toBe(403);
    expect(
      (
        await res(
          new Request(`${ORIGIN}/api/auth/login`, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: 'username=admin',
          }),
        )
      ).status,
    ).toBe(400);
    expect((await res(post('/api/auth/login', '{không phải json'))).status).toBe(400);
    expect((await res(post('/api/auth/login', { username: 'admin', password: 'x'.repeat(5000) }))).status).toBe(400);
    expect((await res(post('/api/auth/login', '[1,2]'))).status).toBe(400);
  });

  it('ca âm đổi mật khẩu: sai mật khẩu hiện tại, mật khẩu yếu (từng luật), trùng mật khẩu cũ', async () => {
    const s = await loginOk(env, first);
    const change = (currentPassword: string, newPassword: string) =>
      env.http.changePassword(
        post('/api/auth/password', { currentPassword, newPassword }, { cookie: s.cookie, [CSRF_HEADER]: s.csrf }),
        '10.7.0.1',
      );
    expect((await change('sai', 'một câu dễ nhớ của chủ')).status).toBe(401);
    for (const [pw, reason] of [
      ['ngắn', 'too_short'],
      ['aaaaaaaaaaaaaaaa', 'too_repetitive'],
      ['my-admin-pass-2026', 'contains_username'],
      [first, 'same_as_current'],
    ] as const) {
      const r = await change(first, pw);
      expect(r.status, pw).toBe(400);
      expect(((await r.json()) as { reason: string }).reason).toBe(reason);
    }
    expect(existsSync(env.firstPath)).toBe(true);
  });

  it('DB không bao giờ giữ token phiên thô / mật khẩu thô', async () => {
    const s = await loginOk(env, first);
    const token = s.cookie.split('=')[1] as string;
    const dump =
      JSON.stringify(env.conn.db.prepare('SELECT * FROM auth_sessions').all()) +
      JSON.stringify(env.conn.db.prepare('SELECT * FROM users').all());
    expect(dump).not.toContain(token);
    expect(dump).not.toContain(first);
  });
});
