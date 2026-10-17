// EXT-01…04 mount qua registry (L-SYS): đường thật /api/v1/auth/*, Set-Cookie do pipeline gắn, UserView, 204, Origin.
import { SYSTEM_WORKSPACE_ID } from '@ga/contracts';
import { hashPassword } from '@ga/security';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sysHandlers } from '../../src/onboarding/sys-handlers.ts';
import { makeTestApp, type TestApp } from '../http/harness.ts';

const PASSWORD = ['ngua', 'xanh', 'chay', 'qua', 'doi', 'xa'].join('-');
const NEW_PASSWORD = ['meo', 'vang', 'ngu', 'tren', 'mai', 'nha'].join('-');

let t: TestApp;
let sysActor: string;
beforeAll(async () => {
  t = makeTestApp({ handlers: sysHandlers });
  sysActor = t.world.store.systemActorId(SYSTEM_WORKSPACE_ID);
  const hash = await hashPassword(PASSWORD);
  const u = t.world.user('A.owner');
  t.world.store.write(sysActor, (tx) =>
    tx.users.setPassword(u.userId, { passwordHash: hash, mustChangePassword: false }),
  );
});
afterAll(() => t.close());

const cookieOf = (res: { headers: Headers }): string => {
  const raw = res.headers.get('set-cookie') ?? '';
  return raw.split(';')[0] ?? '';
};

describe('EXT-01 đăng nhập', () => {
  it('đúng mật khẩu ⇒ 200 UserView owner + csrfToken + Set-Cookie phiên; cookie dùng được cho EXT-03', async () => {
    const owner = t.world.user('A.owner');
    const res = await t.as('anon').call('EXT-01', { body: { username: owner.username, password: PASSWORD } });
    expect(res.status, res.text).toBe(200);
    const body = res.json as {
      user: { id: string; accessLevel: string };
      csrfToken: string;
      mustChangePassword: boolean;
    };
    expect(body.user.id).toBe(owner.userId);
    expect(body.user.accessLevel).toBe('owner');
    expect(body.mustChangePassword).toBe(false);
    const cookie = cookieOf(res);
    expect(cookie).toMatch(/^ga_sid=/);
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly/i);

    const me = await t.as('anon').call('EXT-03', { cookie });
    expect(me.status, me.text).toBe(200);
    const m = me.json as { user: { id: string }; workspace: { id: string }; csrfToken: string };
    expect(m.user.id).toBe(owner.userId);
    expect(m.workspace.id).toBe(t.world.tenants.A.workspaceId);
    expect(m.csrfToken).toBe(body.csrfToken);
  });

  it('Origin lạ ⇒ 403 auth.csrf, KHÔNG Set-Cookie (login CSRF)', async () => {
    const owner = t.world.user('A.owner');
    const res = await t
      .as('anon')
      .call('EXT-01', { body: { username: owner.username, password: PASSWORD }, origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(res.code).toBe('auth.csrf');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('sai mật khẩu ⇒ 401 auth.invalid_credentials, không Set-Cookie', async () => {
    const owner = t.world.user('A.owner');
    const res = await t.as('anon').call('EXT-01', { body: { username: owner.username, password: 'sai-roi-nhe' } });
    expect(res.status).toBe(401);
    expect(res.code).toBe('auth.invalid_credentials');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('user không có membership ⇒ 403, KHÔNG gửi cookie (phiên mồ côi không tới tay client)', async () => {
    const hash = await hashPassword(PASSWORD);
    const u = t.world.store.createUser({
      username: 'lonely-user',
      displayName: 'Lonely',
      passwordHash: hash,
      mustChangePassword: false,
    });
    expect(u.id).toBeTruthy();
    const res = await t.as('anon').call('EXT-01', { body: { username: 'lonely-user', password: PASSWORD } });
    expect(res.status).toBe(403);
    expect(res.code).toBe('auth.forbidden');
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});

describe('EXT-02 / EXT-04', () => {
  it('đổi mật khẩu: yếu ⇒ 422; đúng ⇒ 204 + cookie mới, phiên cũ ⇒ 401; đăng xuất ⇒ 204 + cookie xoá, phiên ⇒ 401', async () => {
    const owner = t.world.user('A.owner');
    const s = t.world.newSession(owner.userId);
    const weak = await t
      .as('A.owner')
      .call('EXT-04', { cookie: s.cookie, csrf: s.csrf, body: { currentPassword: PASSWORD, newPassword: 'abc' } });
    expect(weak.status, weak.text).toBe(422);
    expect(weak.code).toBe('auth.weak_password');

    const ok = await t.as('A.owner').call('EXT-04', {
      cookie: s.cookie,
      csrf: s.csrf,
      body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
    });
    expect(ok.status, ok.text).toBe(204);
    const fresh = cookieOf(ok);
    expect(fresh).toMatch(/^ga_sid=/);
    expect((await t.as('anon').call('EXT-03', { cookie: s.cookie })).status).toBe(401);

    const me = await t.as('anon').call('EXT-03', { cookie: fresh });
    expect(me.status).toBe(200);
    const csrf = (me.json as { csrfToken: string }).csrfToken;
    const out = await t.as('A.owner').call('EXT-02', { cookie: fresh, csrf });
    expect(out.status).toBe(204);
    expect(out.headers.get('set-cookie')).toMatch(/Max-Age=0|Expires=/i);
    expect((await t.as('anon').call('EXT-03', { cookie: fresh })).status).toBe(401);
  });

  it('phiên bắt đổi mật khẩu: EXT-03 qua, SYS-06 ⇒ 403 auth.must_change_password', async () => {
    t.world.setMustChangePassword('A.admin', true);
    try {
      expect((await t.as('A.admin').call('EXT-03')).status).toBe(200);
      const res = await t.as('A.admin').call('SYS-06');
      expect(res.status).toBe(403);
      expect(res.code).toBe('auth.must_change_password');
    } finally {
      t.world.setMustChangePassword('A.admin', false);
    }
  });
});
