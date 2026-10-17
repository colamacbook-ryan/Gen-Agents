// Hằng số trùng lặp giữa @ga/security (nguồn thực thi) và @ga/contracts (web không được import security).
// Một trong hai đổi mà bên kia không đổi theo ⇒ test này đỏ.
import { API_AUTH, CSRF_HEADER as CONTRACT_CSRF_HEADER, SESSION_COOKIE_NAMES } from '@ga/contracts';
import { describe, expect, it } from 'vitest';
import { CSRF_HEADER, SESSION } from '../src/index.ts';

describe('hằng số security ⇄ contracts không lệch', () => {
  it('CSRF_HEADER: security = contracts = API_AUTH.csrfHeader', () => {
    expect(CSRF_HEADER).toBe(CONTRACT_CSRF_HEADER);
    expect(API_AUTH.csrfHeader).toBe(CSRF_HEADER);
  });

  it('tên cookie phiên: SESSION.cookieSecure / cookieInsecure = SESSION_COOKIE_NAMES', () => {
    expect(SESSION.cookieSecure).toBe(SESSION_COOKIE_NAMES.secure);
    expect(SESSION.cookieInsecure).toBe(SESSION_COOKIE_NAMES.insecure);
    expect(API_AUTH.sessionCookieSecure).toBe(SESSION.cookieSecure);
    expect(API_AUTH.sessionCookieInsecure).toBe(SESSION.cookieInsecure);
  });
});
