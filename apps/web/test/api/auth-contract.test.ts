import { describe, expect, it } from 'vitest';
import { createApiClient } from '../../src/api/client.ts';
import { createCsrfStore } from '../../src/api/csrf.ts';
import { createFakeBackend } from '../../src/api/fake/index.ts';
import { classifyAuthError } from '../../src/auth/classify.ts';
import { createContractAuthClient } from '../../src/auth/contract-client.ts';
import { type AuthError, isAuthError } from '../../src/auth/types.ts';
import { noSleep } from './support.ts';

function rig(opts: Parameters<typeof createFakeBackend>[0] = {}) {
  const fake = createFakeBackend(opts);
  const csrf = createCsrfStore();
  const api = createApiClient({ csrf, fetchImpl: fake.fetch, validate: true, sleep: noSleep });
  return { ...fake, api, csrf, auth: createContractAuthClient(api) };
}

async function authFailure(p: Promise<unknown>): Promise<AuthError> {
  try {
    await p;
  } catch (e) {
    expect(isAuthError(e), String(e)).toBe(true);
    return e as AuthError;
  }
  throw new Error('mong đợi lỗi nhưng không có');
}

describe('máy khách đăng nhập theo hợp đồng (EXT-01…04) trên backend giả', () => {
  it('chưa đăng nhập: session() = null (không ném); đăng nhập xong: có phiên + CSRF cho client API', async () => {
    const { auth, csrf, control } = rig();
    expect(await auth.session()).toBeNull();
    expect(csrf.get()).toBeNull();
    expect(await auth.login(control.credentials)).toEqual({ mustChangePassword: false });
    expect(csrf.get()).toMatch(/^csrf-/);
    expect(await auth.session()).toMatchObject({ username: control.db.owner.name, mustChangePassword: false });
  });

  it('lỗi đăng nhập thành AuthError mà màn đăng nhập phân loại đúng (sai mật khẩu / khoá + đếm ngược)', async () => {
    const { auth, control } = rig();
    const wrong = await authFailure(
      auth.login({ username: control.credentials.username, password: 'sai-mat-khau-0000' }),
    );
    expect(classifyAuthError(wrong)).toBe('invalid_credentials');
    for (let i = 0; i < 4; i++) await authFailure(auth.login({ username: 'admin', password: 'sai-mat-khau-0000' }));
    const locked = await authFailure(auth.login(control.credentials));
    expect(classifyAuthError(locked)).toBe('locked');
    expect(locked.retryAfterSeconds).toBe(30);
  });

  it('buộc đổi mật khẩu: đăng nhập báo cờ; session() coi là chưa có phiên (đăng nhập lại để lấy CSRF); đổi xong vào được', async () => {
    const { auth, control, csrf } = rig({ mustChangePassword: true });
    expect(await auth.login(control.credentials)).toEqual({ mustChangePassword: true });
    expect(await auth.session()).toBeNull();
    expect(csrf.get()).toBeNull();
    await auth.login(control.credentials);
    const weak = await authFailure(
      auth.changePassword({ currentPassword: control.credentials.password, newPassword: 'ngan' }),
    );
    expect(classifyAuthError(weak)).toBe('weak_password');
    expect(weak.i18nKey).toBe('errors.auth.password.too_short');
    await auth.changePassword({
      currentPassword: control.credentials.password,
      newPassword: `moi-${crypto.randomUUID()}`,
    });
    expect(await auth.session()).toMatchObject({ mustChangePassword: false });
  });

  it('đăng xuất xoá CSRF; đăng xuất khi phiên đã hết (401) vẫn coi là xong', async () => {
    const { auth, control, csrf } = rig();
    await auth.login(control.credentials);
    await auth.logout();
    expect(csrf.get()).toBeNull();
    expect(await auth.session()).toBeNull();
    await expect(auth.logout()).resolves.toBeUndefined();
  });

  it('mạng rớt ⇒ AuthError network', async () => {
    const { auth, control } = rig();
    control.failNext('network', { times: 1 });
    const e = await authFailure(auth.login(control.credentials));
    expect(classifyAuthError(e)).toBe('network');
  });
});
