// server.ts: cấu hình (không bí mật qua env), mở cổng thật (@hono/node-server) — trần thân qua socket thật (chunked).
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate, openWriter, SQLITE_MIGRATIONS_DIR } from '@ga/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PRODUCTION_HANDLERS } from '../../src/http/handlers.ts';
import {
  buildProductionApp,
  loadServerConfig,
  type RunningServer,
  ServerConfigError,
  startServer,
} from '../../src/server.ts';
import { DEMO_HANDLERS } from './demo-handlers.ts';
import { makeTestApp, type TestApp } from './harness.ts';

describe('loadServerConfig', () => {
  it('mặc định 0.0.0.0:7401, cookie không Secure, đường DB / khoá mặc định của compose', () => {
    const c = loadServerConfig({});
    expect([c.host, c.port, c.secureCookies, c.dbPath, c.masterKeyFile]).toEqual([
      '0.0.0.0',
      7401,
      false,
      '/data/db/gen.sqlite',
      '/run/secrets/ga_master_key',
    ]);
  });
  it('khoá THÔ trong env ⇒ từ chối khởi động (chỉ *_FILE)', () => {
    expect(() => loadServerConfig({ GENAGENTS_MASTER_KEY: 'x'.repeat(64) })).toThrow(ServerConfigError);
    expect(loadServerConfig({ GENAGENTS_MASTER_KEY_FILE: '/run/secrets/k' }).masterKeyFile).toBe('/run/secrets/k');
  });
  it('giá trị sai dạng ⇒ ServerConfigError', () => {
    for (const env of [
      { GA_CONTROL_PLANE_LISTEN: 'nope' },
      { GA_CONTROL_PLANE_LISTEN: '0.0.0.0:99999' },
      { GA_ALLOWED_ORIGINS: 'javascript:alert(1)' },
      { GA_DB_PATH: 'relative.sqlite' },
      { GA_DB_PATH: '/data/$(rm -rf)' },
      { GA_SECURE_COOKIES: 'yes' },
    ]) {
      expect(() => loadServerConfig(env), JSON.stringify(env)).toThrow(ServerConfigError);
    }
    expect(loadServerConfig({ GA_ALLOWED_ORIGINS: 'http://localhost:7400, https://a.example' }).allowedOrigins).toEqual(
      ['http://localhost:7400', 'https://a.example'],
    );
  });
});

describe('startServer — socket thật', () => {
  let t: TestApp;
  let srv: RunningServer;
  beforeAll(async () => {
    t = makeTestApp({ handlers: DEMO_HANDLERS });
    srv = await startServer(t.app, { host: '127.0.0.1', port: 0 });
  });
  afterAll(async () => {
    await srv.close();
    t.close();
  });

  const send = (method: string, path: string, headers: Record<string, string>, chunks: Buffer[]) =>
    new Promise<{ status: number; body: string; headers: Record<string, unknown> }>((resolve, reject) => {
      const req = httpRequest({ host: '127.0.0.1', port: srv.port, method, path, headers }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (d) => {
          body += d;
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
      });
      req.on('error', (e: NodeJS.ErrnoException) => {
        // server có thể đóng kết nối sau khi trả 413 — chấp nhận EPIPE / ECONNRESET nếu đã có response
        if (e.code === 'EPIPE' || e.code === 'ECONNRESET') return;
        reject(e);
      });
      for (const c of chunks) req.write(c);
      req.end();
    });

  it('GET /api/v1/health (public) ⇒ 200 + header bảo mật', async () => {
    const r = await send('GET', '/api/v1/health', {}, []);
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toMatchObject({ status: 'ok' });
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });

  it('POST chunked > 1 MiB (không Content-Length) ⇒ 413 qua socket thật', async () => {
    const u = t.world.user('A.owner');
    const chunks = Array.from({ length: 20 }, () => Buffer.alloc(64 * 1024, 0x61));
    const r = await send(
      'POST',
      '/api/v1/roles/RL-0001/clone',
      {
        cookie: u.cookie,
        'x-ga-csrf': u.csrf,
        'content-type': 'application/json',
        'transfer-encoding': 'chunked',
        origin: t.world.origin,
      },
      chunks,
    );
    expect(r.status).toBe(413);
    expect(JSON.parse(r.body).error.code).toBe('upload.too_large');
    expect(t.calls.get('SYS-34') ?? 0).toBe(0);
  });

  it('Content-Length khai > trần ⇒ 413 trước khi đọc thân', async () => {
    const r = await send('POST', '/api/v1/roles/RL-0001/clone', { 'content-length': String(2 * 1024 * 1024) }, []);
    expect(r.status).toBe(413);
  });
});

describe('buildProductionApp — dây nối production (khoá từ TỆP; route chưa có handler production ⇒ 404)', () => {
  it('mở DB + keyring từ tệp 0600, mount đúng PRODUCTION_HANDLERS, 404 có header bảo mật', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ga-cp-prod-'));
    try {
      const dbPath = join(dir, 'gen.sqlite');
      const w = openWriter(dbPath, { clock: { now: () => new Date() } });
      migrate(w, { dir: SQLITE_MIGRATIONS_DIR, appVersion: '0.0.0' });
      w.close();
      const keyFile = join(dir, 'master.key');
      writeFileSync(keyFile, `${randomBytes(32).toString('hex')}\n`, { mode: 0o600 });
      const cfg = loadServerConfig({ GA_DB_PATH: dbPath, GENAGENTS_MASTER_KEY_FILE: keyFile });
      const logs: string[] = [];
      const app = buildProductionApp(cfg, { logger: { log: (_l, e) => void logs.push(e) } });
      expect(app.mounted).toHaveLength(PRODUCTION_HANDLERS.length);
      const res = await app.fetch(new Request('http://x/api/v1/health'));
      expect(res.status).toBe(404);
      expect(res.headers.get('cache-control')).toBe('no-store');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
