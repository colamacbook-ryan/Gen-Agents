// Hook request-extras của khung http (L-SYS): IP client chỉ tin X-Forwarded-For từ proxy tin cậy; Set-Cookie chỉ nhận cookie
// phiên của L-SEC (không chèn header); thiếu AccountService / phiên ⇒ ném (fail-closed).
import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../../src/auth/index.ts';
import { InMemoryEventBus } from '../../src/events/bus.ts';
import {
  type AccountService,
  clientIp,
  createRequestExtras,
  DEFAULT_SSE_LIMITS,
  type ExtrasDeps,
} from '../../src/http/request-extras.ts';

describe('clientIp', () => {
  it('socket không phải proxy tin cậy ⇒ bỏ qua X-Forwarded-For', () => {
    expect(clientIp('203.0.113.9', '1.2.3.4', [])).toBe('203.0.113.9');
    expect(clientIp('203.0.113.9', '1.2.3.4', ['10.0.0.1'])).toBe('203.0.113.9');
  });
  it('proxy tin cậy ⇒ phần tử CUỐI của X-Forwarded-For (proxy gắn), phải là IP', () => {
    expect(clientIp('10.0.0.1', '6.6.6.6, 198.51.100.7', ['10.0.0.1'])).toBe('198.51.100.7');
    expect(clientIp('10.0.0.1', '198.51.100.7, not-an-ip', ['10.0.0.1'])).toBe('10.0.0.1');
    expect(clientIp('10.0.0.1', null, ['10.0.0.1'])).toBe('10.0.0.1');
  });
  it('không có socket / rác ⇒ unknown', () => {
    expect(clientIp(undefined, '1.2.3.4', ['1.2.3.4'])).toBe('unknown');
    expect(clientIp('xyz', null, [])).toBe('unknown');
  });
});

const meta = { ip: '10.9.9.9', userAgent: null, origin: null, secFetchSite: null, method: 'POST' };
const session: AuthContext = {
  userId: 'U',
  sessionId: 'S',
  tokenHash: 'H',
  username: 'u',
  mustChangePassword: false,
  csrfToken: 'c',
};

function deps(accounts: AccountService | null): ExtrasDeps {
  return {
    reader: {} as never,
    store: {} as never,
    events: new InMemoryEventBus({ clock: { now: () => new Date('2026-10-17T00:00:00Z') } }),
    accounts,
    allowedOrigins: ['http://ok.example'],
    sse: DEFAULT_SSE_LIMITS,
  };
}

const accounts = (setCookie: string): AccountService => ({
  login: async () => ({ ok: false, code: 'invalid_credentials' }),
  changePassword: async () => ({ ok: true, setCookie, csrfToken: 'x' }),
  logout: () => ({ setCookie }),
});

describe('createRequestExtras', () => {
  it('Set-Cookie chỉ nhận cookie phiên (ga_sid / __Host-ga_sid), không CR/LF', async () => {
    const good = createRequestExtras(deps(accounts('ga_sid=abc; Path=/; HttpOnly')), { meta, session, actor: null });
    good.logout();
    expect(good.cookies).toEqual(['ga_sid=abc; Path=/; HttpOnly']);
    for (const bad of ['other=1', 'ga_sid=1\r\nx-evil: 1', 'ga_sidx=1']) {
      const x = createRequestExtras(deps(accounts(bad)), { meta, session, actor: null });
      expect(() => x.logout()).toThrow();
      await expect(x.changePassword('a', 'b')).rejects.toThrow();
      expect(x.cookies).toEqual([]);
    }
  });

  it('login: Origin không thuộc allowlist ⇒ origin (không gọi AuthService); thiếu AccountService / phiên ⇒ ném', async () => {
    let called = 0;
    const acc: AccountService = {
      ...accounts('ga_sid=a'),
      login: async () => {
        called++;
        return { ok: false, code: 'invalid_credentials' };
      },
    };
    const x = createRequestExtras(deps(acc), {
      meta: { ...meta, origin: 'https://evil.example' },
      session: null,
      actor: null,
    });
    expect(await x.login('u', 'p')).toEqual({ ok: false, code: 'origin' });
    expect(called).toBe(0);
    const none = createRequestExtras(deps(null), { meta, session: null, actor: null });
    await expect(none.login('u', 'p')).rejects.toThrow();
    expect(() => none.logout()).toThrow();
    expect(() => none.subscribe(null)).toThrow();
  });
});
