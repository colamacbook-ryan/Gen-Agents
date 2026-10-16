import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import type { EngineInstallStatus } from '@ga/contracts';
import { EngineInstallStatus as StatusSchema } from '@ga/contracts';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fakeRecipe } from '../src/engine-install/fake-source.ts';
import { installEngine, pickPlatform, readInstallStatus } from '../src/engine-install/install.ts';
import type { InstallRecipe } from '../src/engine-install/recipe.ts';
import type { RunnerRoots } from '../src/paths.ts';
import { type Sandbox, sandbox } from './helpers.ts';

// Máy chủ "hãng" giả + proxy giả (đóng vai ga-egress: absolute-form cho http, CONNECT, từ chối = 403 + x-ga-egress: denied).

const BINARY = Buffer.from(`#!/bin/sh\necho fake ${'x'.repeat(200_000)}\n`);
const sha512 = (b: Buffer) => createHash('sha512').update(b).digest('hex');
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

let vendor: Server;
let proxy: Server;
let vendorUrl = '';
let proxyUrl: URL;
let tgz: Buffer;
const proxied: string[] = [];
const routes = new Map<string, { status: number; body: Buffer | string; type?: string }>();

beforeAll(async () => {
  // gói tar.gz có member ở thư mục con
  const sb = sandbox();
  mkdirSync(join(sb.base, 'pkg', 'bin'), { recursive: true });
  writeFileSync(join(sb.base, 'pkg', 'bin', 'fakecli'), BINARY);
  writeFileSync(join(sb.base, 'pkg', 'README'), 'readme');
  execFileSync('tar', ['-czf', join(sb.base, 'p.tgz'), '-C', join(sb.base, 'pkg'), '.']);
  tgz = readFileSync(join(sb.base, 'p.tgz'));
  sb.cleanup();

  vendor = createServer((req, res) => {
    const r = routes.get(req.url ?? '');
    if (!r) {
      res.writeHead(404).end();
      return;
    }
    const body = typeof r.body === 'string' ? Buffer.from(r.body) : r.body;
    res.writeHead(r.status, { 'content-length': body.length, 'content-type': r.type ?? 'application/octet-stream' });
    res.end(body);
  });
  await new Promise<void>((r) => vendor.listen(0, '127.0.0.1', r));
  vendorUrl = `http://127.0.0.1:${(vendor.address() as AddressInfo).port}`;

  proxy = createServer((req, res) => {
    const target = new URL(req.url ?? '');
    proxied.push(target.host + target.pathname);
    if (target.pathname.startsWith('/blocked/')) {
      res.writeHead(403, { 'x-ga-egress': 'denied' }).end();
      return;
    }
    const up = request(target, { method: req.method, headers: { host: target.host } }, (ur) => {
      res.writeHead(ur.statusCode ?? 502, ur.headers);
      ur.pipe(res);
    });
    up.on('error', () => res.writeHead(502).end());
    req.pipe(up);
  });
  proxy.on('connect', (req, socket) => {
    proxied.push(`CONNECT ${req.url}`);
    socket.end('HTTP/1.1 403 Forbidden\r\nx-ga-egress: denied\r\ncontent-length: 0\r\n\r\n');
  });
  await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', r));
  proxyUrl = new URL(`http://127.0.0.1:${(proxy.address() as AddressInfo).port}`);
});

afterAll(async () => {
  await new Promise((r) => vendor.close(r));
  await new Promise((r) => proxy.close(r));
});

let sb: Sandbox;
let roots: RunnerRoots;
beforeEach(() => {
  sb = sandbox();
  roots = sb.roots;
  routes.clear();
  proxied.length = 0;
});
afterEach(() => sb.cleanup());

const PLATFORM = { arch: 'x64', libc: 'glibc', key: 'linux-x64' } as const;

function perPlatform(over: Partial<InstallRecipe> = {}): InstallRecipe {
  return {
    binaryName: 'fakecli',
    platforms: [PLATFORM],
    manifest: {
      kind: 'per-platform',
      urlTemplate: `${vendorUrl}/manifests/{platform}.json`,
      fields: { version: 'version', url: 'url', checksum: 'sha512' },
    },
    payload: { kind: 'raw' },
    verifiedAt: 'test',
    ...over,
  };
}

async function run(recipe: InstallRecipe, opts: { proxy?: URL | null; httpsOnly?: boolean; slug?: string } = {}) {
  const events: EngineInstallStatus[] = [];
  const result = await installEngine(
    roots,
    { slug: opts.slug ?? 'fake', recipe, httpsOnly: opts.httpsOnly ?? false, proxy: opts.proxy ?? null },
    { emit: (s) => events.push(s), now: () => new Date('2026-10-16T10:00:00.000Z'), platform: PLATFORM },
  );
  for (const e of events) expect(() => StatusSchema.parse(e)).not.toThrow();
  return { result, events };
}

describe('ga-engine-install — cài từ công thức của adapter, có %, đi qua egress', () => {
  it('per-platform + raw qua proxy: installed, % tăng dần, current → version, status đọc lại được', async () => {
    routes.set('/manifests/linux-x64.json', {
      status: 200,
      body: JSON.stringify({ version: '2.0.1', url: '/dl/fakecli-2.0.1', sha512: sha512(BINARY) }),
    });
    routes.set('/dl/fakecli-2.0.1', { status: 200, body: BINARY });
    const { result, events } = await run(perPlatform(), { proxy: proxyUrl });
    expect(result).toMatchObject({ state: 'installed', version: '2.0.1' });
    const pcts = events.filter((e) => e.state === 'installing').map((e) => (e as { progressPct: number }).progressPct);
    expect(pcts[0]).toBe(0);
    expect(pcts.length).toBeGreaterThan(3);
    expect([...pcts].sort((a, b) => a - b)).toEqual(pcts);
    expect(events.at(-1)?.state).toBe('installed');
    expect(proxied.some((p) => p.endsWith('/dl/fakecli-2.0.1'))).toBe(true);
    const bin = join(roots.engines, 'fake', '2.0.1', 'fakecli');
    expect(readFileSync(bin).equals(BINARY)).toBe(true);
    expect(lstatSync(bin).mode & 0o777).toBe(0o755);
    expect(readlinkSync(join(roots.engines, 'fake', 'current'))).toBe('2.0.1');
    expect(readInstallStatus(roots, 'fake', new Date())).toMatchObject({ state: 'installed', version: '2.0.1' });
  });

  it('versioned + tar.gz (member trong thư mục con, sha256)', async () => {
    routes.set('/latest', { status: 200, body: '3.1.0\n' });
    routes.set('/r/3.1.0/manifest.json', {
      status: 200,
      body: JSON.stringify({ platforms: { 'linux-x64': { checksum: sha256(tgz) } } }),
    });
    routes.set('/r/3.1.0/linux-x64/pkg.tgz', { status: 200, body: tgz });
    const recipe = perPlatform({
      manifest: {
        kind: 'versioned',
        latestUrl: `${vendorUrl}/latest`,
        urlTemplate: `${vendorUrl}/r/{version}/manifest.json`,
        checksumPath: ['platforms', '{platform}', 'checksum'],
        binaryUrlTemplate: `${vendorUrl}/r/{version}/{platform}/pkg.tgz`,
      },
      payload: { kind: 'tar.gz', member: 'bin/fakecli' },
    });
    const { result } = await run(recipe);
    expect(result).toMatchObject({ state: 'installed', version: '3.1.0' });
    expect(readFileSync(join(roots.engines, 'fake', '3.1.0', 'fakecli')).equals(BINARY)).toBe(true);
  });

  it('cài bản mới đổi current nguyên tử; status theo bản mới', async () => {
    for (const v of ['1.0.0', '1.1.0']) {
      routes.set('/manifests/linux-x64.json', {
        status: 200,
        body: JSON.stringify({ version: v, url: `/dl/${v}`, sha512: sha512(BINARY) }),
      });
      routes.set(`/dl/${v}`, { status: 200, body: BINARY });
      await run(perPlatform());
    }
    expect(readlinkSync(join(roots.engines, 'fake', 'current'))).toBe('1.1.0');
  });

  const failures: [string, () => void, Partial<{ proxy: boolean; httpsOnly: boolean }>, string][] = [
    [
      'checksum lệch ⇒ checksum_mismatch, không đặt current',
      () => {
        routes.set('/manifests/linux-x64.json', {
          status: 200,
          body: JSON.stringify({ version: '2.0.1', url: '/dl/x', sha512: sha512(Buffer.from('khác')) }),
        });
        routes.set('/dl/x', { status: 200, body: BINARY });
      },
      {},
      'checksum_mismatch',
    ],
    [
      'manifest không có checksum ⇒ checksum_mismatch (fail-closed)',
      () =>
        routes.set('/manifests/linux-x64.json', { status: 200, body: JSON.stringify({ version: '1', url: '/dl/x' }) }),
      {},
      'checksum_mismatch',
    ],
    ['manifest 404 cho nền tảng ⇒ unsupported_arch', () => {}, {}, 'unsupported_arch'],
    [
      'egress chặn domain tải (403 + x-ga-egress: denied) ⇒ domain_blocked',
      () => {
        routes.set('/manifests/linux-x64.json', {
          status: 200,
          body: JSON.stringify({ version: '1.0.0', url: '/blocked/x', sha512: sha512(BINARY) }),
        });
      },
      { proxy: true },
      'domain_blocked',
    ],
    [
      'máy chủ 5xx ⇒ network',
      () => routes.set('/manifests/linux-x64.json', { status: 503, body: 'down' }),
      {},
      'network',
    ],
    [
      'version có ký tự đường dẫn ⇒ từ chối',
      () =>
        routes.set('/manifests/linux-x64.json', {
          status: 200,
          body: JSON.stringify({ version: '../../bin', url: '/dl/x', sha512: sha512(BINARY) }),
        }),
      {},
      'unknown',
    ],
    ['nguồn official nhưng URL http ⇒ từ chối (https bắt buộc)', () => {}, { httpsOnly: true }, 'unknown'],
  ];
  it.each(failures)('%s', async (_n, setup, o, reason) => {
    setup();
    const { result } = await run(perPlatform(), {
      proxy: o.proxy ? proxyUrl : null,
      httpsOnly: o.httpsOnly,
      slug: 'demo',
    });
    expect(result).toMatchObject({ state: 'failed', reason });
    expect(existsSync(join(roots.engines, 'demo', 'current'))).toBe(false);
    expect(readInstallStatus(roots, 'demo', new Date())).toMatchObject({ state: 'failed', reason });
  });

  it('kết nối bị từ chối ⇒ network', async () => {
    const r = perPlatform({
      manifest: { kind: 'per-platform', urlTemplate: 'http://127.0.0.1:1/m.json', fields: perPlatformFields() },
    });
    expect((await run(r)).result).toMatchObject({ state: 'failed', reason: 'network' });
  });

  it('https qua egress bị chặn ở CONNECT ⇒ domain_blocked', async () => {
    const r = perPlatform({
      manifest: { kind: 'per-platform', urlTemplate: 'https://vendor.invalid/m.json', fields: perPlatformFields() },
    });
    expect((await run(r, { proxy: proxyUrl, httpsOnly: true })).result).toMatchObject({
      state: 'failed',
      reason: 'domain_blocked',
    });
    expect(proxied).toContain('CONNECT vendor.invalid:443');
  });

  it('nền tảng không có trong công thức ⇒ unsupported_arch', () => {
    expect(() => pickPlatform(perPlatform(), 'ia32', 'glibc')).toThrow();
    expect(() => pickPlatform(perPlatform(), 'x64', 'musl')).toThrow();
    expect(pickPlatform(perPlatform(), 'x64', 'glibc').key).toBe('linux-x64');
  });

  it('một lần cài đang chạy (khoá) ⇒ lần thứ hai failed', async () => {
    mkdirSync(join(roots.engines, 'fake'), { recursive: true });
    writeFileSync(join(roots.engines, 'fake', '.lock'), '');
    expect((await run(perPlatform())).result).toMatchObject({ state: 'failed', reason: 'unknown' });
  });

  it('tên binary trong công thức là shell ⇒ failed', async () => {
    expect((await run(perPlatform({ binaryName: 'sh' }))).result).toMatchObject({ state: 'failed' });
  });
});

function perPlatformFields() {
  return { version: 'version', url: 'url', checksum: 'sha512' };
}

describe('readInstallStatus — fail-closed', () => {
  it('chưa có status ⇒ not_installed; slug lạ ⇒ lỗi', () => {
    expect(readInstallStatus(roots, 'none', new Date())).toEqual({ state: 'not_installed' });
    expect(() => readInstallStatus(roots, '../x', new Date())).toThrow();
  });
  it('status nói installed nhưng current bị sửa / binary mất ⇒ not_installed', () => {
    const dir = join(roots.engines, 'other');
    mkdirSync(join(dir, '1.0.0'), { recursive: true });
    writeFileSync(
      join(dir, 'status.json'),
      JSON.stringify({ state: 'installed', version: '1.0.0', installedAt: 'x', bin: 'cli' }),
    );
    symlinkSync('9.9.9', join(dir, 'current'));
    expect(readInstallStatus(roots, 'other', new Date())).toEqual({ state: 'not_installed' });
  });
  it('installing quá 30 phút ⇒ failed (bị gián đoạn)', () => {
    const dir = join(roots.engines, 'other');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'status.json'),
      JSON.stringify({ state: 'installing', startedAt: '2026-10-16T09:00:00.000Z' }),
    );
    expect(readInstallStatus(roots, 'other', new Date('2026-10-16T10:00:00.000Z'))).toMatchObject({ state: 'failed' });
    expect(readInstallStatus(roots, 'other', new Date('2026-10-16T09:10:00.000Z'))).toMatchObject({
      state: 'installing',
    });
  });
});

describe('nguồn fake (chỉ image test)', () => {
  it('dựng công thức per-platform từ GA_FAKE_ENGINE_SOURCE_URL, giữ tên binary của adapter', () => {
    const r = fakeRecipe('demo', 'democli', { GA_FAKE_ENGINE_SOURCE_URL: 'http://fake-source:8080' });
    expect(r.binaryName).toBe('democli');
    expect(r.manifest).toMatchObject({ urlTemplate: 'http://fake-source:8080/manifests/demo/{platform}.json' });
  });
  it.each(['', 'file:///etc', 'http://x/path?q', 'http://a b'])('từ chối URL nguồn: %j', (u) => {
    expect(() => fakeRecipe('demo', 'democli', { GA_FAKE_ENGINE_SOURCE_URL: u })).toThrow();
  });
});
