import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SUPERVISOR_RPC } from '@ga/contracts';
import { afterAll, describe, expect, it } from 'vitest';
import { OneTimeCache, signRpc, signTicketForTest, verifyRpc, verifyTicket } from '../src/auth.ts';
import { loadConfig, readKeyFile } from '../src/config.ts';
import { FakeClock } from './helpers.ts';

const KEY = randomBytes(32);
const PATH = '/rpc/v1/status';

describe('RPC ký HMAC — giờ, chữ ký, MỘT lần', () => {
  const clock = new FakeClock();
  const ts = () => String(Math.floor(clock.now().getTime() / 1000));
  it('chữ ký đúng ⇒ qua; phát lại cùng chữ ký ⇒ replayed', () => {
    const cache = new OneTimeCache();
    const t = ts();
    const sig = signRpc(KEY, t, 'POST', PATH, '{}');
    expect(verifyRpc(KEY, { ts: t, sig }, 'POST', PATH, Buffer.from('{}'), clock, cache)).toEqual({ ok: true });
    expect(verifyRpc(KEY, { ts: t, sig }, 'POST', PATH, Buffer.from('{}'), clock, cache)).toEqual({
      ok: false,
      reason: 'replayed',
    });
  });
  it.each([
    ['thiếu header', { ts: undefined, sig: undefined }, '{}', 'missing'],
    ['giờ sai dạng', { ts: '1e9', sig: 'a'.repeat(64) }, '{}', 'bad_timestamp'],
    ['lệch giờ > 30 s', { ts: 'OLD', sig: 'SIGN' }, '{}', 'skew'],
    ['body bị sửa', { ts: 'NOW', sig: 'SIGN' }, '{"x":1}', 'bad_signature'],
    ['khoá khác', { ts: 'NOW', sig: 'OTHER' }, '{}', 'bad_signature'],
  ] as const)('%s ⇒ %s', (_n, h, body, reason) => {
    const now = ts();
    const tsv = h.ts === 'NOW' ? now : h.ts === 'OLD' ? String(Number(now) - SUPERVISOR_RPC.maxSkewSeconds - 1) : h.ts;
    const sig =
      h.sig === 'SIGN'
        ? signRpc(KEY, tsv as string, 'POST', PATH, '{}')
        : h.sig === 'OTHER'
          ? signRpc(randomBytes(32), now, 'POST', PATH, '{}')
          : h.sig;
    expect(verifyRpc(KEY, { ts: tsv, sig }, 'POST', PATH, Buffer.from(body), clock, new OneTimeCache())).toEqual({
      ok: false,
      reason,
    });
  });
  it('đường khác (ký cho /status, gửi /exec) ⇒ bad_signature', () => {
    const t = ts();
    expect(
      verifyRpc(
        KEY,
        { ts: t, sig: signRpc(KEY, t, 'POST', PATH, '{}') },
        'POST',
        '/rpc/v1/exec',
        Buffer.from('{}'),
        clock,
        new OneTimeCache(),
      ),
    ).toEqual({ ok: false, reason: 'bad_signature' });
  });
  it('bộ nhớ chống phát lại đầy ⇒ từ chối (fail-closed)', () => {
    const cache = new OneTimeCache(1);
    const t = ts();
    verifyRpc(KEY, { ts: t, sig: signRpc(KEY, t, 'POST', PATH, '1') }, 'POST', PATH, Buffer.from('1'), clock, cache);
    expect(
      verifyRpc(KEY, { ts: t, sig: signRpc(KEY, t, 'POST', PATH, '2') }, 'POST', PATH, Buffer.from('2'), clock, cache),
    ).toEqual({
      ok: false,
      reason: 'replay_cache_full',
    });
  });
});

describe('vé PTY — HMAC, hạn ≤ 60 s, nonce một lần, claims v2 (không argv)', () => {
  const clock = new FakeClock();
  const now = Math.floor(clock.now().getTime() / 1000);
  const claims = (over: Record<string, unknown> = {}) => ({
    v: 2,
    acc: 'EN-0001',
    container: 'ga-sys-AB12',
    engineSlug: 'demo',
    authMethod: 'subscription',
    guiSessionHash: 'a'.repeat(64),
    exp: now + 60,
    nonce: randomBytes(16).toString('base64url'),
    ...over,
  });
  it('vé đúng ⇒ claims; phát lại ⇒ replayed', () => {
    const nonces = new OneTimeCache();
    const t = signTicketForTest(claims(), KEY);
    expect(verifyTicket(t, KEY, clock, nonces).ok).toBe(true);
    expect(verifyTicket(t, KEY, clock, nonces)).toEqual({ ok: false, reason: 'replayed' });
  });
  const cases: [string, () => string, string][] = [
    ['hết hạn', () => signTicketForTest(claims({ exp: now }), KEY), 'expired'],
    ['hạn quá 60 s (+5 lệch)', () => signTicketForTest(claims({ exp: now + 66 }), KEY), 'lifetime_too_long'],
    ['khoá khác', () => signTicketForTest(claims(), randomBytes(32)), 'bad_signature'],
    ['claims v1 còn argvLogin', () => signTicketForTest(claims({ v: 1, argvLogin: ['/bin/sh'] }), KEY), 'bad_claims'],
    ['claims có trường lạ', () => signTicketForTest(claims({ argv: ['sh'] }), KEY), 'bad_claims'],
    ['slug dạng đường', () => signTicketForTest(claims({ engineSlug: '../x' }), KEY), 'bad_claims'],
    ['sai dạng (3 phần)', () => 'a.b.c', 'malformed'],
    ['quá dài', () => `${'a'.repeat(5000)}.b`, 'too_large'],
  ];
  it.each(cases)('%s ⇒ %s', (_n, make, reason) => {
    expect(verifyTicket(make(), KEY, clock, new OneTimeCache())).toEqual({ ok: false, reason });
  });
  it('sửa một ký tự claims ⇒ bad_signature', () => {
    const t = signTicketForTest(claims(), KEY);
    const tampered = `${t[0] === 'e' ? 'f' : 'e'}${t.slice(1)}`;
    expect(verifyTicket(tampered, KEY, clock, new OneTimeCache()).ok).toBe(false);
  });
});

describe('cấu hình — bí mật chỉ từ tệp, ảnh ghim digest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ga-sup-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const k1 = join(dir, 'k1');
  const k2 = join(dir, 'k2');
  writeFileSync(k1, `${randomBytes(32).toString('hex')}\n`);
  writeFileSync(k2, `${randomBytes(32).toString('base64')}\n`);
  const base = {
    GA_SUPERVISOR_KEY_FILE: k1,
    GA_TERM_TICKET_KEY_FILE: k2,
    GA_RUNTIME_IMAGE: `sha256:${'b'.repeat(64)}`,
  };
  it('hợp lệ (hex + base64)', () => {
    const c = loadConfig(base);
    expect(c.supervisorKey.length).toBe(32);
    expect(c.termTicketKey.length).toBe(32);
  });
  it.each(['GA_SUPERVISOR_KEY', 'GA_TERM_TICKET_KEY', 'GENAGENTS_MASTER_KEY', 'GA_EGRESS_KEY'])(
    'khoá %s trong env ⇒ từ chối khởi động',
    (n) => {
      expect(() => loadConfig({ ...base, [n]: 'x'.repeat(64) })).toThrow(/env/);
    },
  );
  it.each(['busybox:latest', 'ghcr.io/x/runtime:1.0', ''])('ảnh không ghim digest %j ⇒ từ chối', (img) => {
    expect(() => loadConfig({ ...base, GA_RUNTIME_IMAGE: img })).toThrow();
  });
  it('tệp khoá sai dạng / ngắn ⇒ từ chối, không in nội dung', () => {
    const bad = join(dir, 'bad');
    writeFileSync(bad, 'ngắn-quá');
    expect(() => readKeyFile(bad, 'K')).toThrow(/nội dung không in ra/);
  });
  it('trần PTY ngoài 2..600 ⇒ từ chối', () => {
    expect(() => loadConfig({ ...base, GA_PTY_MAX_DURATION_S: '601' })).toThrow();
  });
});
