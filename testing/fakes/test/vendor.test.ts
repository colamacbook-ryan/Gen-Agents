// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
import http from 'node:http';
import { TURN_OUTCOMES } from '@ga/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { seedCredentials } from '../lib/creds.ts';
import { ERROR_CODES, VENDOR_SCENARIOS } from '../lib/scenario.ts';
import { type FakeVendor, startVendor } from '../vendor/server.ts';
import { cliEnv, lines, runCli, tmp, waitFor } from './helpers.ts';

let vendor: FakeVendor | undefined;
afterEach(async () => {
  await vendor?.close();
  vendor = undefined;
});

const turn = (
  v: FakeVendor,
  headers: Record<string, string> = {},
  body: unknown = { engine: 'claude', model: 'm', promptChars: 40 },
) =>
  fetch(`${v.url}/v1/turn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
const setScenario = (v: FakeVendor, body: unknown) =>
  fetch(`${v.url}/_test/scenario`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('fake-vendor: kịch bản', () => {
  it('mã lỗi của kịch bản khớp enum TurnOutcome của contracts (chống lệch hợp đồng)', () => {
    for (const code of ERROR_CODES) expect(TURN_OUTCOMES as readonly string[]).toContain(code);
    expect(VENDOR_SCENARIOS).toEqual([
      'ok',
      'quota_exhausted',
      'account_suspended',
      'login_expired',
      'outage',
      'hang',
      'malformed_json',
      'slow',
      'version_drift',
      'identity_changed',
    ]);
  });

  const TABLE: Array<[unknown, number, string | null]> = [
    [{ name: 'ok' }, 200, null],
    [{ name: 'quota_exhausted' }, 429, 'quota_exhausted'],
    [{ name: 'quota_exhausted', resetAt: '2026-10-16T19:00:00Z' }, 429, 'quota_exhausted'],
    [{ name: 'account_suspended' }, 403, 'account_suspended'],
    [{ name: 'login_expired' }, 401, 'login_expired'],
    [{ name: 'outage' }, 503, 'outage'],
    [{ name: 'outage', status: 500 }, 500, 'outage'],
    [{ name: 'outage', status: 504 }, 504, 'outage'],
  ];
  for (const [sc, status, code] of TABLE) {
    it(`${JSON.stringify(sc)} ⇒ HTTP ${status}`, async () => {
      vendor = await startVendor({ scenario: sc });
      const r = await turn(vendor);
      expect(r.status).toBe(status);
      const j = (await r.json()) as { ok?: boolean; error?: { code: string; resetAt: string | null } };
      if (code) expect(j.error?.code).toBe(code);
      else expect(j.ok).toBe(true);
      if ((sc as { resetAt?: string }).resetAt) expect(j.error?.resetAt).toBe((sc as { resetAt: string }).resetAt);
    });
  }

  it('malformed_json: 200 nhưng thân bị cắt (không parse được); slow: trễ đúng delayMs; version_drift: header; identity_changed: tài khoản B', async () => {
    vendor = await startVendor({ scenario: { name: 'malformed_json' } });
    const m = await turn(vendor);
    expect(m.status).toBe(200);
    const raw = await m.text();
    expect(() => JSON.parse(raw)).toThrow();
    await setScenario(vendor, { name: 'slow', delayMs: 300 });
    const t0 = Date.now();
    await (await turn(vendor)).json();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(280);
    await setScenario(vendor, { name: 'version_drift' });
    expect((await turn(vendor)).headers.get('x-fake-latest-cli-version')).toBe('9.9.9');
    await setScenario(vendor, { name: 'identity_changed' });
    expect(((await (await turn(vendor)).json()) as { account: string }).account).toBe('fake-account-b@example.invalid');
  });

  it('hang: không bao giờ trả lời; close() cắt kết nối treo ngay (không kẹt test)', async () => {
    vendor = await startVendor({ scenario: { name: 'hang' } });
    const p = turn(vendor).catch((e) => e);
    const raced = await Promise.race([p, new Promise((r) => setTimeout(() => r('still-hanging'), 400))]);
    expect(raced).toBe('still-hanging');
    const t0 = Date.now();
    await vendor.close();
    vendor = undefined;
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it('ưu tiên: header kịch bản > kịch bản riêng tài khoản > kịch bản chung; reset trả về ok', async () => {
    vendor = await startVendor();
    await setScenario(vendor, { name: 'outage' });
    await setScenario(vendor, { name: 'quota_exhausted', account: 'acc-b' });
    expect((await turn(vendor, { 'x-fake-account': 'acc-a' })).status).toBe(503);
    expect((await turn(vendor, { 'x-fake-account': 'acc-b' })).status).toBe(429);
    expect((await turn(vendor, { 'x-fake-account': 'acc-b', 'x-fake-scenario': '{"name":"ok"}' })).status).toBe(200);
    await fetch(`${vendor.url}/_test/reset`, { method: 'POST' });
    expect((await turn(vendor, { 'x-fake-account': 'acc-b' })).status).toBe(200);
    expect(vendor.log).toHaveLength(1); // reset xoá nhật ký; chỉ còn lượt vừa gọi sau reset
  });

  it('nhật ký lượt gọi KHÔNG chứa prompt (chỉ độ dài) — canary không rò qua /_test/requests', async () => {
    vendor = await startVendor();
    await turn(vendor, {}, { engine: 'agy', model: null, promptChars: 17, prompt: 'GA-CANARY-should-not-be-logged' });
    const log = await (await fetch(`${vendor.url}/_test/requests`)).text();
    expect(log).not.toContain('GA-CANARY');
    expect(JSON.parse(log)).toMatchObject([{ engine: 'agy', promptChars: 17, scenario: 'ok', status: 200 }]);
  });

  it('ca âm: kịch bản lạ / JSON hỏng / thân quá lớn / đường lạ ⇒ 400 / 400 / 413 / 404', async () => {
    vendor = await startVendor();
    expect((await setScenario(vendor, { name: 'no_such' })).status).toBe(400);
    expect((await setScenario(vendor, { name: 'outage', status: 200 })).status).toBe(400);
    const bad = await fetch(`${vendor.url}/v1/turn`, { method: 'POST', body: '{nope' });
    expect(bad.status).toBe(400);
    const big = await fetch(`${vendor.url}/v1/turn`, { method: 'POST', body: 'x'.repeat(2 * 1024 * 1024) }).catch(
      (e) => e,
    );
    expect(big instanceof Error || (big as Response).status === 413).toBe(true);
    expect((await fetch(`${vendor.url}/nope`)).status).toBe(404);
    expect((await fetch(`${vendor.url}/v1/turn`)).status).toBe(404);
  });
});

describe('CLI giả ↔ fake-vendor (GA_FAKE_VENDOR_URL)', () => {
  const claudeIn = (v: FakeVendor, extra: Record<string, string> = {}) => {
    const home = tmp();
    const env = cliEnv(home, { GA_FAKE_VENDOR_URL: v.url, ...extra });
    seedCredentials('claude', env);
    return { env, cwd: home };
  };
  const agyIn = (v: FakeVendor, extra: Record<string, string> = {}) => {
    const env = cliEnv(tmp(), { GA_FAKE_VENDOR_URL: v.url, ...extra });
    seedCredentials('agy', env);
    return env;
  };

  it('kịch bản đặt ở vendor ảnh hưởng cả hai CLI; đổi kịch bản giữa các lượt không cần dựng lại CLI', async () => {
    vendor = await startVendor();
    const { env, cwd } = claudeIn(vendor);
    const agy = agyIn(vendor);
    expect((await runCli('claude', ['-p', 'x'], { env, cwd })).code).toBe(0);
    expect((await runCli('agy', ['-p', 'x'], { env: agy })).code).toBe(0);
    await setScenario(vendor, { name: 'quota_exhausted' });
    expect((await runCli('claude', ['-p', 'x'], { env, cwd })).stdout).toMatch(/hit your limit/);
    expect((await runCli('agy', ['-p', 'x', '--output-format', 'json'], { env: agy })).code).toBe(3);
    await setScenario(vendor, { name: 'ok' });
    expect((await runCli('claude', ['-p', 'x'], { env, cwd })).code).toBe(0);
    expect(vendor.log.map((l) => [l.engine, l.status])).toEqual([
      ['claude', 200],
      ['agy', 200],
      ['claude', 429],
      ['agy', 429],
      ['claude', 200],
    ]);
  });

  it('kịch bản riêng từng tài khoản (failover-matrix): EN-A hết quota, EN-B ok', async () => {
    vendor = await startVendor();
    await setScenario(vendor, { name: 'quota_exhausted', account: 'fake-account-a@example.invalid' });
    const a = claudeIn(vendor);
    const b = { home: tmp(), cwd: tmp() };
    const envB = cliEnv(b.home, { GA_FAKE_VENDOR_URL: vendor.url });
    seedCredentials('claude', envB, 'fake-account-b@example.invalid');
    expect((await runCli('claude', ['-p', 'x'], { env: a.env, cwd: a.cwd })).code).toBe(1);
    expect((await runCli('claude', ['-p', 'x'], { env: envB, cwd: b.cwd })).code).toBe(0);
  });

  it('mất mạng: vendor không tới được (cổng đóng) ⇒ lỗi mạng của từng CLI', async () => {
    vendor = await startVendor();
    const url = vendor.url;
    const { env, cwd } = claudeIn(vendor);
    const agy = agyIn(vendor);
    await vendor.close();
    vendor = undefined;
    expect(url).toMatch(/^http/);
    const c = await runCli('claude', ['-p', 'x', '--output-format', 'json'], { env, cwd });
    expect(c.code).toBe(1);
    expect(JSON.parse(c.stdout).result).toMatch(/Unable to connect to API/);
    const a = await runCli('agy', ['-p', 'x', '--output-format', 'json'], { env: agy });
    expect(a.code).toBe(3);
    expect(a.stderr).toContain('"code_kind":"network"');
  });

  it('hang ở vendor: agy dừng nhờ --print-timeout; claude (không có timeout tự thân) bị kill từ ngoài', async () => {
    vendor = await startVendor({ scenario: { name: 'hang' } });
    const agy = agyIn(vendor);
    const r = await runCli('agy', ['-p', 'x', '--print-timeout', '300ms'], { env: agy });
    expect(r.code).toBe(3);
    expect(r.stderr).toContain('"code_kind":"timeout"');
    const { env, cwd } = claudeIn(vendor);
    await expect(runCli('claude', ['-p', 'x'], { env, cwd, timeoutMs: 500 })).rejects.toThrow(/treo quá/);
  });

  it('GA_FAKE_VENDOR_TIMEOUT_MS: CLI bỏ chờ vendor treo ⇒ coi như mất mạng', async () => {
    vendor = await startVendor({ scenario: { name: 'hang' } });
    const { env, cwd } = claudeIn(vendor, { GA_FAKE_VENDOR_TIMEOUT_MS: '250' });
    const r = await runCli('claude', ['-p', 'x'], { env, cwd });
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/Unable to connect to API/);
  });

  it('đi qua proxy HTTP (HTTP_PROXY) như container Role đi qua ga-egress; NO_PROXY thì đi thẳng', async () => {
    vendor = await startVendor();
    const seen: string[] = [];
    const proxy = http.createServer((req, res) => {
      seen.push(`${req.method} ${req.url} host=${req.headers.host}`);
      const u = new URL(req.url ?? '');
      const up = http.request(
        { host: u.hostname, port: u.port, path: u.pathname, method: req.method, headers: req.headers },
        (ur) => {
          res.writeHead(ur.statusCode ?? 502, ur.headers);
          ur.pipe(res);
        },
      );
      req.pipe(up);
    });
    await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', r));
    try {
      const proxyUrl = `http://127.0.0.1:${(proxy.address() as { port: number }).port}`;
      const { env, cwd } = claudeIn(vendor, { HTTP_PROXY: proxyUrl });
      expect((await runCli('claude', ['-p', 'x'], { env, cwd })).code).toBe(0);
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatch(new RegExp(`^POST ${vendor.url.replace(/[.]/g, '\\.')}/v1/turn host=`));
      const direct = claudeIn(vendor, { HTTP_PROXY: proxyUrl, NO_PROXY: '127.0.0.1' });
      expect((await runCli('claude', ['-p', 'x'], { env: direct.env, cwd: direct.cwd })).code).toBe(0);
      expect(seen).toHaveLength(1);
      // proxy chặn (egress từ chối) ⇒ lỗi mạng, không phải thành công
      const blocked = claudeIn(vendor, { HTTP_PROXY: 'http://127.0.0.1:9' });
      expect((await runCli('claude', ['-p', 'x'], { env: blocked.env, cwd: blocked.cwd })).code).toBe(1);
    } finally {
      proxy.closeAllConnections();
      await new Promise<void>((r) => proxy.close(() => r()));
    }
  });

  it('identity_changed ở vendor ⇒ `claude auth status` / `agy models` in danh tính khác (chỉ khi GA_FAKE_PRINT_IDENTITY=1)', async () => {
    vendor = await startVendor();
    const { env } = claudeIn(vendor, { GA_FAKE_PRINT_IDENTITY: '1' });
    const agy = agyIn(vendor, { GA_FAKE_PRINT_IDENTITY: '1' });
    expect(JSON.parse((await runCli('claude', ['auth', 'status'], { env })).stdout).email).toBe(
      'fake-account-a@example.invalid',
    );
    await setScenario(vendor, { name: 'identity_changed' });
    expect(JSON.parse((await runCli('claude', ['auth', 'status'], { env })).stdout).email).toBe(
      'fake-account-b@example.invalid',
    );
    expect((await runCli('agy', ['models'], { env: agy })).stderr).toBe(
      'Signed in as fake-account-b@example.invalid\n',
    );
  });

  it('version_drift ở vendor ⇒ claude -p (text) báo bản mới ở stderr; slow ⇒ lượt chậm nhưng thành công', async () => {
    vendor = await startVendor({ scenario: { name: 'version_drift' } });
    const { env, cwd } = claudeIn(vendor);
    const r = await runCli('claude', ['-p', 'x'], { env, cwd });
    expect(r.stderr).toBe('Update available: 9.9.9\n');
    await setScenario(vendor, { name: 'slow', delayMs: 300 });
    const t0 = Date.now();
    expect((await runCli('claude', ['-p', 'x'], { env, cwd })).code).toBe(0);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(300);
  });

  it('stream-json của claude nói chuyện với vendor vẫn đúng thứ tự sự kiện', async () => {
    vendor = await startVendor();
    const { env, cwd } = claudeIn(vendor);
    const r = await runCli('claude', ['-p', 'x', '--output-format', 'stream-json', '--verbose'], { env, cwd });
    expect((lines(r.stdout) as Array<{ type: string }>).map((e) => e.type)).toEqual([
      'system',
      'assistant',
      'rate_limit_event',
      'result',
    ]);
    await waitFor(() => vendor?.log.length === 1, 1000, 'nhật ký vendor');
  });
});
