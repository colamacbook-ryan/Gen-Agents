import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { connect, createServer as createNetServer, type Server as NetServer } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BLOCK_HEADER, BLOCK_VALUE, createEgressProxy } from '../src/proxy.ts';
import { isPrivateAddress, matchRule, normalizeHost, parseRules, type RuleSet } from '../src/rules.ts';
import { testHooks } from '../src/test-hooks.ts';

describe('luật allowlist', () => {
  const set = parseRules(
    JSON.stringify({
      rules: [
        { host: 'api.vendor.example' },
        { host: '.cdn.example', ports: [443, 8443] },
        { host: '203.0.113.7', ports: [443] },
      ],
    }),
  );
  it.each([
    ['api.vendor.example', 443, true],
    ['API.Vendor.Example.', 443, true],
    ['api.vendor.example', 80, false],
    ['evil-api.vendor.example', 443, false],
    ['vendor.example', 443, false],
    ['a.cdn.example', 8443, true],
    ['cdn.example', 443, false],
    ['a.cdn.example.evil.io', 443, false],
    ['203.0.113.7', 443, true],
    ['203.0.113.8', 443, false],
    ['example.com', 443, false],
  ] as const)('%s:%i ⇒ %s', (h, p, want) => {
    const host = normalizeHost(h);
    expect(host !== null && matchRule(set, host, p) !== null).toBe(want);
  });
  it.each([
    ['khoá lạ', { rules: [{ host: 'a.b', x: 1 }] }],
    ['host một nhãn', { rules: [{ host: 'localhost' }] }],
    ['host có đường dẫn', { rules: [{ host: 'a.b/c' }] }],
    ['wildcard *', { rules: [{ host: '*.b.c' }] }],
    ['cổng 0', { rules: [{ host: 'a.b', ports: [0] }] }],
    ['không có rules', {}],
  ])('tệp luật sai: %s', (_n, v) => {
    expect(() => parseRules(JSON.stringify(v))).toThrow();
  });
  it.each([
    ['10.1.2.3', true],
    ['172.20.0.5', true],
    ['192.168.1.1', true],
    ['127.0.0.1', true],
    ['169.254.169.254', true],
    ['100.64.0.1', true],
    ['::1', true],
    ['fd00::1', true],
    ['fe80::1', true],
    ['::ffff:10.0.0.1', true],
    ['8.8.8.8', false],
    ['2001:4860:4860::8888', false],
    ['không-phải-ip', true],
  ] as const)('isPrivateAddress(%s) = %s', (ip, want) => {
    expect(isPrivateAddress(ip)).toBe(want);
  });
  it('hook test đọc đúng biến; mặc định tắt', () => {
    expect(testHooks({})).toEqual({ learnMode: false, allowPrivateHonored: false });
    expect(testHooks({ GA_EGRESS_LEARN: '1', GA_EGRESS_TEST_ALLOW_PRIVATE: '1' })).toEqual({
      learnMode: true,
      allowPrivateHonored: true,
    });
  });
});

// ---------------------------------------------------------------- proxy thật trên loopback
let upstream: Server;
let echo: NetServer;
let upPort = 0;
let echoPort = 0;
const seenHeaders: Record<string, unknown>[] = [];

beforeAll(async () => {
  upstream = createServer((req, res) => {
    seenHeaders.push({ ...req.headers });
    res.writeHead(200, { 'content-type': 'text/plain' }).end(`ok ${req.url}`);
  });
  await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
  upPort = (upstream.address() as AddressInfo).port;
  echo = createNetServer((s) => s.pipe(s));
  await new Promise<void>((r) => echo.listen(0, '127.0.0.1', r));
  echoPort = (echo.address() as AddressInfo).port;
});
afterAll(async () => {
  await new Promise((r) => upstream.close(r));
  await new Promise((r) => echo.close(r));
});

async function proxyWith(rules: RuleSet, o: { allowPrivateHonored?: boolean; learnMode?: boolean } = {}) {
  const logs: { event: string; fields: Record<string, unknown> }[] = [];
  const server = createEgressProxy({
    getRules: () => rules,
    allowPrivateHonored: o.allowPrivateHonored ?? true,
    learnMode: o.learnMode ?? false,
    log: { log: (_l, event, fields) => logs.push({ event, fields }) },
    // mọi tên ⇒ loopback (máy chủ giả); example.com ⇒ địa chỉ công cộng giả để thử đường "không trong allowlist"
    resolve: async (h) => (h === 'public.example' ? ['93.184.216.34'] : ['127.0.0.1']),
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return { server, port, logs, close: () => new Promise((r) => server.close(r)) };
}

function viaProxy(proxyPort: number, url: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: Record<string, unknown>; body: string }>((resolve, reject) => {
    const r = request({ host: '127.0.0.1', port: proxyPort, method: 'GET', path: url, headers }, (res) => {
      let body = '';
      res.on('data', (c) => {
        body += c;
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    r.on('error', reject);
    r.end();
  });
}

function connectVia(proxyPort: number, target: string) {
  return new Promise<{ status: string; header: string; sock: ReturnType<typeof connect> }>((resolve, reject) => {
    const s = connect(proxyPort, '127.0.0.1', () => s.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`));
    let buf = '';
    s.on('data', function onData(c) {
      buf += c.toString('latin1');
      const end = buf.indexOf('\r\n\r\n');
      if (end >= 0) {
        s.off('data', onData);
        resolve({ status: buf.split('\r\n')[0] ?? '', header: buf.slice(0, end), sock: s });
      }
    });
    s.on('error', reject);
  });
}

const rulesFor = (extra: object[] = []) =>
  parseRules(
    JSON.stringify({ rules: [{ host: 'fake-vendor.test', ports: [upPort, echoPort], allowPrivate: true }, ...extra] }),
  );

describe('proxy HTTP / CONNECT', () => {
  it('host trong allowlist (máy chủ giả, allowPrivate + hook test) ⇒ đi được; Proxy-Authorization bị bỏ', async () => {
    const p = await proxyWith(rulesFor());
    const r = await viaProxy(p.port, `http://fake-vendor.test:${upPort}/v1/turn`, {
      'proxy-authorization': 'Basic eA==',
    });
    expect(r.status).toBe(200);
    expect(r.body).toBe('ok /v1/turn');
    expect(seenHeaders.at(-1)?.['proxy-authorization']).toBeUndefined();
    await p.close();
  });
  it('example.com (ngoài allowlist) ⇒ 403 + x-ga-egress: blocked, cả HTTP lẫn CONNECT', async () => {
    const p = await proxyWith(rulesFor());
    const r = await viaProxy(p.port, 'http://example.com/');
    expect(r.status).toBe(403);
    expect(r.headers[BLOCK_HEADER]).toBe(BLOCK_VALUE);
    const c = await connectVia(p.port, 'example.com:443');
    expect(c.status).toContain('403');
    expect(c.header.toLowerCase()).toContain(`${BLOCK_HEADER}: ${BLOCK_VALUE}`);
    c.sock.destroy();
    await p.close();
  });
  it('CONNECT tới host trong allowlist ⇒ 200 + đường hầm hai chiều', async () => {
    const p = await proxyWith(rulesFor());
    const c = await connectVia(p.port, `fake-vendor.test:${echoPort}`);
    expect(c.status).toContain('200');
    const got = await new Promise<string>((r) => {
      c.sock.once('data', (d) => r(d.toString()));
      c.sock.write('ping');
    });
    expect(got).toBe('ping');
    c.sock.destroy();
    await p.close();
  });
  it.each([
    ['cổng ngoài luật', () => rulesFor(), 'fake-vendor.test:22'],
    ['ga-app (control plane)', () => rulesFor(), 'ga-app:7401'],
    ['IP literal không có trong luật', () => rulesFor(), '10.0.0.5:443'],
    ['metadata cloud', () => rulesFor(), '169.254.169.254:80'],
    [
      'allowlist nhưng phân giải ra nội mạng, luật không bật allowPrivate',
      () => parseRules(JSON.stringify({ rules: [{ host: 'api.vendor.test', ports: [443] }] })),
      'api.vendor.test:443',
    ],
  ])('CONNECT %s ⇒ 403', async (_n, rules, target) => {
    const p = await proxyWith(rules());
    const c = await connectVia(p.port, target);
    expect(c.status).toContain('403');
    c.sock.destroy();
    await p.close();
  });
  it('image phát hành (hook test tắt): allowPrivate trong luật KHÔNG có hiệu lực ⇒ 403', async () => {
    const p = await proxyWith(rulesFor(), { allowPrivateHonored: false });
    const r = await viaProxy(p.port, `http://fake-vendor.test:${upPort}/`);
    expect(r.status).toBe(403);
    await p.close();
  });
  it('chế độ học (chỉ image test): ngoài allowlist vẫn đi + ghi learn', async () => {
    const p = await proxyWith(rulesFor(), { learnMode: true });
    const c = await connectVia(p.port, `other.test:${echoPort}`);
    expect(c.status).toContain('200');
    c.sock.destroy();
    expect(p.logs.some((l) => l.event === 'learn' && l.fields.host === 'other.test')).toBe(true);
    await p.close();
  });
  it('log chỉ metadata: không path / query / header', async () => {
    const p = await proxyWith(rulesFor());
    await viaProxy(p.port, `http://fake-vendor.test:${upPort}/x?token=BI-MAT-123`, {
      authorization: 'Bearer BI-MAT-456',
    });
    await viaProxy(p.port, 'http://example.com/y?token=BI-MAT-789');
    await new Promise((r) => setTimeout(r, 50));
    const all = JSON.stringify(p.logs);
    expect(all).not.toContain('BI-MAT');
    expect(all).not.toContain('/x');
    expect(p.logs.map((l) => l.event).sort()).toEqual(['allow', 'deny']);
    await p.close();
  });
  it('URL không phải absolute-form http ⇒ 400', async () => {
    const p = await proxyWith(rulesFor());
    expect((await viaProxy(p.port, '/relative')).status).toBe(400);
    expect((await viaProxy(p.port, 'ftp://fake-vendor.test/')).status).toBe(400);
    await p.close();
  });
});

describe('hiệu năng bộ parse dữ liệu từ container (regex tuyến tính / có trần)', () => {
  it('normalizeHost + parseRules trên chuỗi đối kháng < 50 ms', () => {
    const attacks = ['a-'.repeat(126), `${'a'.repeat(63)}.`.repeat(4), `${'-a'.repeat(200)}!`, 'x'.repeat(1_000_000)];
    const t0 = performance.now();
    for (const a of attacks) normalizeHost(a);
    expect(performance.now() - t0).toBeLessThan(50);
  });
});
