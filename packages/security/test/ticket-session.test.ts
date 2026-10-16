// Vé terminal (BUILD-PLAN §B.3, §B.6; DATABASE §9.5 bước 3), phiên cookie + CSRF + Origin, giới hạn tần suất.
import { createHmac, randomBytes } from 'node:crypto';
import { buildTermWebSocketInit, extractTermTicket, PTY } from '@ga/contracts';
import { describe, expect, it } from 'vitest';
import {
  accountLockSeconds,
  b64urlEncode,
  checkRequestOrigin,
  csrfTokenFor,
  deriveSubkey,
  hashSessionToken,
  isSafeMethod,
  issueTermTicket,
  MAX_TICKET_CHARS,
  newSessionToken,
  readSessionCookie,
  SESSION,
  SlidingWindowLimiter,
  serializeClearSessionCookie,
  serializeSessionCookie,
  TicketReplayCache,
  verifyCsrfToken,
  verifyTermTicket,
} from '../src/index.ts';
import { FakeClock } from './helpers.ts';

const INPUT = {
  acc: 'EN-0001',
  container: 'ga-sys-7K2Q',
  argvLogin: ['login-cmd', 'auth', 'login'],
  guiSessionHash: 'a'.repeat(64),
};

/** Ký vé "tay" với nội dung tuỳ ý — giả lập bên ký có lỗi / kẻ có khoá, để chứng minh bên kiểm tự chặn. */
function forge(key: Buffer, claims: unknown): string {
  const payload = b64urlEncode(Buffer.from(JSON.stringify(claims)));
  const mac = createHmac('sha256', key).update('ga-term.v1.').update(payload).digest();
  return `${payload}.${b64urlEncode(mac)}`;
}

describe('vé terminal', () => {
  it('ký → kiểm đạt; vé chỉ nằm trong Sec-WebSocket-Protocol, không trong URL', () => {
    const key = randomBytes(32);
    const clock = new FakeClock();
    const { ticket, claims } = issueTermTicket(INPUT, key, clock);
    expect(claims.exp).toBe(Math.floor(clock.now().getTime() / 1000) + PTY.ticketTtlSeconds);
    const init = buildTermWebSocketInit('http://localhost:7400', ticket);
    expect(init.url).toBe('ws://localhost:7400/term');
    expect(init.url).not.toContain(ticket);
    const fromHeader = extractTermTicket(init.protocols.join(', '));
    expect(fromHeader).toBe(ticket);
    const r = verifyTermTicket(fromHeader as string, key, clock, new TicketReplayCache());
    expect(r).toEqual({ ok: true, claims });
  });

  it('ca âm: phát lại (dùng một lần)', () => {
    const key = randomBytes(32);
    const clock = new FakeClock();
    const cache = new TicketReplayCache();
    const { ticket } = issueTermTicket(INPUT, key, clock);
    expect(verifyTermTicket(ticket, key, clock, cache).ok).toBe(true);
    expect(verifyTermTicket(ticket, key, clock, cache)).toEqual({ ok: false, reason: 'replayed' });
  });

  it('ca âm: hết hạn 60 s (đồng hồ giả +60 s) — kể cả vé chưa dùng', () => {
    const key = randomBytes(32);
    const clock = new FakeClock();
    const { ticket } = issueTermTicket(INPUT, key, clock);
    clock.advance(59_000);
    const early = issueTermTicket(INPUT, key, clock);
    expect(verifyTermTicket(early.ticket, key, clock, new TicketReplayCache()).ok).toBe(true);
    clock.advance(1_000);
    expect(verifyTermTicket(ticket, key, clock, new TicketReplayCache())).toEqual({ ok: false, reason: 'expired' });
  });

  it('ca âm: sai khoá — kể cả khoá dẫn xuất từ master key (khoá vé là khoá RIÊNG, G-04)', () => {
    const key = randomBytes(32);
    const clock = new FakeClock();
    const { ticket } = issueTermTicket(INPUT, key, clock);
    const cache = new TicketReplayCache();
    expect(verifyTermTicket(ticket, randomBytes(32), clock, cache)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(verifyTermTicket(ticket, deriveSubkey(key, 'csrf'), clock, cache)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
    // vé hỏng không tiêu nonce: vé thật vẫn dùng được sau đó
    expect(verifyTermTicket(ticket, key, clock, cache).ok).toBe(true);
  });

  it('ca âm: sửa claims (tài khoản / argv / exp) mà không có khoá ⇒ bad_signature', () => {
    const key = randomBytes(32);
    const clock = new FakeClock();
    const { ticket, claims } = issueTermTicket(INPUT, key, clock);
    const sig = ticket.split('.')[1] as string;
    for (const change of [{ acc: 'EN-0002' }, { argvLogin: ['sh', '-c', 'id'] }, { exp: claims.exp + 3600 }]) {
      const payload = b64urlEncode(Buffer.from(JSON.stringify({ ...claims, ...change })));
      expect(verifyTermTicket(`${payload}.${sig}`, key, clock, new TicketReplayCache()).ok).toBe(false);
    }
  });

  it('ca âm: bên ký lỗi đặt exp quá xa ⇒ bên kiểm vẫn từ chối (lifetime_too_long)', () => {
    const key = randomBytes(32);
    const clock = new FakeClock();
    const now = Math.floor(clock.now().getTime() / 1000);
    const t = forge(key, { v: 1, ...INPUT, exp: now + 3600, nonce: 'n'.repeat(24) });
    expect(verifyTermTicket(t, key, clock, new TicketReplayCache())).toEqual({
      ok: false,
      reason: 'lifetime_too_long',
    });
  });

  it('ca âm: claims sai schema chặt (trường thừa, argv rỗng, hash sai dạng, JSON hỏng) dù chữ ký đúng', () => {
    const key = randomBytes(32);
    const clock = new FakeClock();
    const exp = Math.floor(clock.now().getTime() / 1000) + 30;
    const base = { v: 1, ...INPUT, exp, nonce: 'n'.repeat(24) };
    for (const c of [
      { ...base, shell: true },
      { ...base, argvLogin: [] },
      { ...base, guiSessionHash: 'xyz' },
      { ...base, v: 2 },
      { ...base, nonce: 'short' },
      'không phải object',
    ]) {
      expect(verifyTermTicket(forge(key, c), key, clock, new TicketReplayCache())).toEqual({
        ok: false,
        reason: 'bad_claims',
      });
    }
    const notJson = `${b64urlEncode(Buffer.from('{không phải json'))}.`;
    const mac = createHmac('sha256', key).update('ga-term.v1.').update(notJson.slice(0, -1)).digest();
    expect(verifyTermTicket(notJson + b64urlEncode(mac), key, clock, new TicketReplayCache())).toEqual({
      ok: false,
      reason: 'bad_claims',
    });
  });

  it('ca âm: dạng hỏng / quá dài (kiểm trước mọi xử lý)', () => {
    const key = randomBytes(32);
    const clock = new FakeClock();
    const cache = new TicketReplayCache();
    for (const t of ['', 'abc', 'a.b.c', '.abc', 'abc.', 'a+b.c', 'YQ.YQ=']) {
      expect(verifyTermTicket(t, key, clock, cache)).toEqual({ ok: false, reason: 'malformed' });
    }
    expect(verifyTermTicket('a'.repeat(MAX_TICKET_CHARS + 1), key, clock, cache)).toEqual({
      ok: false,
      reason: 'too_large',
    });
    expect(() => issueTermTicket(INPUT, randomBytes(16), clock)).toThrow(/32 byte/);
    expect(() => issueTermTicket({ ...INPUT, argvLogin: ['x'.repeat(5000)] }, key, clock)).toThrow(/trần/);
  });

  it('bộ nhớ chống phát lại đầy ⇒ từ chối vé mới (fail-closed); vé hết hạn được dọn để nhường chỗ', () => {
    const key = randomBytes(32);
    const clock = new FakeClock();
    const cache = new TicketReplayCache(2);
    expect(verifyTermTicket(issueTermTicket(INPUT, key, clock).ticket, key, clock, cache).ok).toBe(true);
    expect(verifyTermTicket(issueTermTicket(INPUT, key, clock).ticket, key, clock, cache).ok).toBe(true);
    expect(verifyTermTicket(issueTermTicket(INPUT, key, clock).ticket, key, clock, cache)).toEqual({
      ok: false,
      reason: 'replay_cache_full',
    });
    clock.advance(120_000);
    expect(verifyTermTicket(issueTermTicket(INPUT, key, clock).ticket, key, clock, cache).ok).toBe(true);
    expect(cache.size()).toBe(1);
  });
});

describe('phiên cookie', () => {
  it('token 256 bit, DB chỉ giữ SHA-256', () => {
    const { token, tokenHash } = newSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(token)).toBe(tokenHash);
    expect(tokenHash).not.toContain(token);
    expect(() => hashSessionToken('ngắn')).toThrow(RangeError);
  });

  it('Set-Cookie: HttpOnly + SameSite=Strict; HTTPS ⇒ Secure + __Host-', () => {
    const { token } = newSessionToken();
    expect(serializeSessionCookie(token, { secure: true })).toBe(
      `__Host-ga_sid=${token}; Path=/; Max-Age=${SESSION.absoluteTtlSeconds}; HttpOnly; SameSite=Strict; Secure`,
    );
    expect(serializeSessionCookie(token, { secure: false, maxAgeSeconds: 10 })).toBe(
      `ga_sid=${token}; Path=/; Max-Age=10; HttpOnly; SameSite=Strict`,
    );
    expect(serializeClearSessionCookie({ secure: true })).toContain('Max-Age=0');
    expect(() => serializeSessionCookie('x; Domain=evil', { secure: false })).toThrow(RangeError);
  });

  it('đọc cookie: đúng tên theo chế độ; ca âm: trùng tên (cookie tossing), sai dạng, header quá dài', () => {
    const { token } = newSessionToken();
    const other = newSessionToken().token;
    expect(readSessionCookie(`theme=dark; ga_sid=${token}`, { secure: false })).toBe(token);
    expect(readSessionCookie(`__Host-ga_sid=${token}`, { secure: true })).toBe(token);
    expect(readSessionCookie(`ga_sid=${token}`, { secure: true })).toBeNull();
    expect(readSessionCookie(`ga_sid=${token}; ga_sid=${other}`, { secure: false })).toBeNull();
    expect(readSessionCookie('ga_sid=abc', { secure: false })).toBeNull();
    expect(readSessionCookie(`ga_sid=${token}; x=${'y'.repeat(9000)}`, { secure: false })).toBeNull();
    expect(readSessionCookie(null, { secure: false })).toBeNull();
  });

  it('CSRF gắn phiên: đúng ⇒ qua; ca âm: phiên khác, rác, độ dài sai, khoá ngắn', () => {
    const k = randomBytes(32);
    const h1 = newSessionToken().tokenHash;
    const h2 = newSessionToken().tokenHash;
    const t1 = csrfTokenFor(k, h1);
    expect(verifyCsrfToken(k, h1, t1)).toBe(true);
    expect(verifyCsrfToken(k, h2, t1)).toBe(false);
    expect(verifyCsrfToken(randomBytes(32), h1, t1)).toBe(false);
    for (const bad of [undefined, null, '', 'x', `${t1}x`, t1.replace(/.$/, '!')])
      expect(verifyCsrfToken(k, h1, bad)).toBe(false);
    expect(() => csrfTokenFor(randomBytes(16), h1)).toThrow(RangeError);
  });

  it('Origin / Sec-Fetch-Site cho method không an toàn', () => {
    const allowed = ['http://localhost:7400'];
    expect(isSafeMethod('get')).toBe(true);
    expect(isSafeMethod('POST')).toBe(false);
    const c = (method: string, origin: string | null, site: string | null) =>
      checkRequestOrigin({ method, origin, secFetchSite: site, allowedOrigins: allowed });
    expect(c('GET', 'https://evil.example', 'cross-site')).toEqual({ ok: true });
    expect(c('POST', 'http://localhost:7400', 'same-origin')).toEqual({ ok: true });
    expect(c('POST', null, null)).toEqual({ ok: true });
    expect(c('POST', 'http://localhost:7400', 'cross-site')).toEqual({ ok: false, reason: 'cross_site' });
    expect(c('POST', 'http://localhost:7400', 'same-site')).toEqual({ ok: false, reason: 'cross_site' });
    expect(c('POST', 'https://evil.example', null)).toEqual({ ok: false, reason: 'origin_mismatch' });
    expect(c('DELETE', 'null', 'none')).toEqual({ ok: false, reason: 'origin_mismatch' });
  });
});

describe('giới hạn tần suất', () => {
  it('cửa sổ trượt: hết lượt ⇒ chặn kèm retryAfter; qua cửa sổ ⇒ mở lại; reset', () => {
    const clock = new FakeClock();
    const l = new SlidingWindowLimiter({ limit: 3, windowMs: 60_000, clock });
    for (let i = 0; i < 3; i++) expect(l.consume('1.2.3.4').allowed).toBe(true);
    const d = l.consume('1.2.3.4');
    expect(d.allowed).toBe(false);
    expect(d.retryAfterMs).toBe(60_000);
    expect(l.check('5.6.7.8').allowed).toBe(true);
    clock.advance(30_000);
    expect(l.check('1.2.3.4').retryAfterMs).toBe(30_000);
    clock.advance(30_001);
    expect(l.consume('1.2.3.4').allowed).toBe(true);
    l.reset('1.2.3.4');
    expect(l.check('1.2.3.4')).toEqual({ allowed: true, retryAfterMs: 0 });
  });
  it('bộ nhớ có trần: nhiều khoá ⇒ không vượt maxKeys', () => {
    const clock = new FakeClock();
    const l = new SlidingWindowLimiter({ limit: 2, windowMs: 60_000, clock, maxKeys: 100 });
    for (let i = 0; i < 1000; i++) l.hit(`ip-${i}`);
    expect(l.size()).toBeLessThanOrEqual(100);
    expect(() => new SlidingWindowLimiter({ limit: 0, windowMs: 1, clock })).toThrow(RangeError);
  });
  it('khoá tạm tài khoản: 4 lần sai đầu không khoá, sau đó 30 s nhân đôi, trần 15 phút', () => {
    expect([0, 1, 4, 5, 6, 7, 10, 100].map(accountLockSeconds)).toEqual([0, 0, 0, 30, 60, 120, 900, 900]);
  });
});
