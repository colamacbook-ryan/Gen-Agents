// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
//
// engine-source: "trình cài CLI chính chủ" giả (CNS-137). Bắt chước cách script cài chính thức của agy làm (install-notes Spike 1b):
// GET manifest `/<slug>/manifests/<platform>.json` → {version, url, sha512}, rồi tải `url`. Artefact là một launcher shell 0755 chạy CLI
// giả (đệm cho đủ dung lượng để có thanh %). Kịch bản lỗi: ok · domain_blocked · unsupported_arch · network · checksum_mismatch.
//   POST /_test/scenario {name, chunkDelayMs?, chunkSize?, sizeBytes?, failAfterBytes?, failAt?: 'manifest'|'download'}
//   GET  /_test/requests · POST /_test/reset
// Dấu hiệu "domain bị chặn" = HTTP 403 + header `x-ga-egress: blocked` (ASSUMPTIONS ES-1: chốt lại với ga-egress của L-RT).
import { createHash } from 'node:crypto';
import http from 'node:http';
import { sleep } from '../lib/common.ts';
import { HttpError, listen, type Running, readBody, sendJson } from '../lib/http.ts';

export const INSTALL_SCENARIOS = ['ok', 'domain_blocked', 'unsupported_arch', 'network', 'checksum_mismatch'] as const;
export type InstallScenarioName = (typeof INSTALL_SCENARIOS)[number];

export interface InstallScenario {
  name: InstallScenarioName;
  chunkDelayMs: number;
  chunkSize: number;
  sizeBytes: number;
  /** network: ngắt kết nối sau chừng này byte (mặc định nửa artefact). */
  failAfterBytes?: number;
  failAt: 'manifest' | 'download';
}

export interface EngineSpec {
  slug: string;
  bin: string;
  /** đường tới main.ts của CLI giả, tương đối `fakesRoot`. */
  entry: string;
  version: string;
}

export const DEFAULT_ENGINES: readonly EngineSpec[] = [
  { slug: 'agy', bin: 'agy', entry: 'agy/main.ts', version: '1.3.5' },
  { slug: 'claude', bin: 'claude', entry: 'claude/main.ts', version: '2.1.299' },
];

export const SUPPORTED_PLATFORMS = ['linux_amd64', 'linux_arm64'] as const;

/** Launcher + đệm đến `size` byte. Phần sau `exec` không bao giờ được shell đọc tới. */
/**
 * Launcher: KHÔNG phụ thuộc PATH (runner dựng env từ adapter nên có thể không có PATH) — thử `node` trên PATH rồi các chỗ thường gặp
 * (hoặc `nodeBin` do harness chỉ định). Đặt GA_FAKE_LAUNCHER = đường của chính nó để CLI giả biết thư mục đã cài (/opt/engines/…).
 */
export function buildArtifact(e: EngineSpec, fakesRoot: string, size: number, nodeBin?: string): Buffer {
  const nodes = nodeBin
    ? `"${nodeBin}"`
    : '"$(command -v node 2>/dev/null)" /usr/local/bin/node /usr/bin/node /opt/node22/bin/node';
  const head = Buffer.from(
    `#!/bin/sh\n# GA-FAKES-TEST-ONLY: CLI giả ${e.slug} ${e.version}; không bao giờ vào image phát hành\n` +
      `GA_FAKE_LAUNCHER="$0"; export GA_FAKE_LAUNCHER\n` +
      `for n in ${nodes}; do\n  if [ -n "$n" ] && [ -x "$n" ]; then exec "$n" "${fakesRoot}/${e.entry}" "$@"; fi\ndone\n` +
      `echo "fake ${e.slug}: không tìm thấy node" >&2\nexit 127\n`,
  );
  const pad = Math.max(0, size - head.length);
  const line = `# ${'0123456789abcdef'.repeat(4)}\n`;
  return Buffer.concat([head, Buffer.from(line.repeat(Math.ceil(pad / line.length)).slice(0, pad))]);
}

const defaults = (): InstallScenario => ({
  name: 'ok',
  chunkDelayMs: 0,
  chunkSize: 32 * 1024,
  sizeBytes: 512 * 1024,
  failAt: 'download',
});

function parseInstallScenario(x: unknown): InstallScenario {
  const o = (typeof x === 'object' && x !== null ? x : {}) as Record<string, unknown>;
  if (typeof o.name !== 'string' || !(INSTALL_SCENARIOS as readonly string[]).includes(o.name)) {
    throw new HttpError(400, `kịch bản cài lạ: ${String(o.name)} (hợp lệ: ${INSTALL_SCENARIOS.join(', ')})`);
  }
  const num = (k: string, d: number, min: number, max: number) => {
    const v = o[k] === undefined ? d : Number(o[k]);
    if (!Number.isInteger(v) || v < min || v > max)
      throw new HttpError(400, `${k} phải là số nguyên trong [${min}, ${max}]`);
    return v;
  };
  const s = defaults();
  return {
    name: o.name as InstallScenarioName,
    chunkDelayMs: num('chunkDelayMs', s.chunkDelayMs, 0, 10_000),
    chunkSize: num('chunkSize', s.chunkSize, 1, 8 * 1024 * 1024),
    sizeBytes: num('sizeBytes', s.sizeBytes, 512, 64 * 1024 * 1024),
    ...(o.failAfterBytes !== undefined ? { failAfterBytes: num('failAfterBytes', 0, 0, 64 * 1024 * 1024) } : {}),
    failAt: o.failAt === 'manifest' ? 'manifest' : 'download',
  };
}

export interface FakeEngineSource extends Running {
  requests: Array<{ method: string; path: string; at: string }>;
  setScenario(s: unknown): void;
}

export async function startEngineSource(
  opts: {
    host?: string;
    port?: number;
    engines?: readonly EngineSpec[];
    fakesRoot?: string;
    nodeBin?: string;
    scenario?: unknown;
  } = {},
): Promise<FakeEngineSource> {
  const engines = opts.engines ?? DEFAULT_ENGINES;
  const fakesRoot = opts.fakesRoot ?? '/opt/ga-fakes';
  let sc: InstallScenario = opts.scenario ? parseInstallScenario(opts.scenario) : defaults();
  const requests: FakeEngineSource['requests'] = [];

  const blocked = (res: http.ServerResponse) =>
    sendJson(res, 403, { error: 'domain_blocked', message: 'Blocked by egress policy' }, { 'x-ga-egress': 'blocked' });

  const server = http.createServer(async (req, res) => {
    try {
      const path = new URL(req.url ?? '/', 'http://x').pathname;
      if (path.startsWith('/_test/')) {
        if (req.method === 'GET' && path === '/_test/requests') return sendJson(res, 200, requests);
        if (req.method === 'POST' && path === '/_test/scenario') {
          sc = parseInstallScenario(JSON.parse(await readBody(req)));
          return sendJson(res, 200, { ok: true });
        }
        if (req.method === 'POST' && path === '/_test/reset') {
          sc = defaults();
          requests.length = 0;
          return sendJson(res, 200, { ok: true });
        }
        return sendJson(res, 404, { error: 'not found' });
      }
      requests.push({ method: req.method ?? '?', path, at: new Date().toISOString() });
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' });

      const mm = /^\/([^/]+)\/manifests\/([^/]+)\.json$/.exec(path);
      if (mm) {
        const eng = engines.find((e) => e.slug === mm[1]);
        if (!eng) return sendJson(res, 404, { error: 'unknown engine' });
        if (sc.name === 'domain_blocked') return blocked(res);
        if (sc.name === 'network' && sc.failAt === 'manifest') return void req.socket.destroy();
        const platform = mm[2] as string;
        if (sc.name === 'unsupported_arch' || !(SUPPORTED_PLATFORMS as readonly string[]).includes(platform)) {
          return sendJson(res, 404, { error: 'unsupported platform', platform });
        }
        const sha512 = createHash('sha512')
          .update(buildArtifact(eng, fakesRoot, sc.sizeBytes, opts.nodeBin))
          .digest('hex');
        return sendJson(res, 200, {
          version: eng.version,
          url: `http://${req.headers.host}/${eng.slug}/dl/${eng.version}/${platform}/${eng.bin}`,
          sha512,
        });
      }

      const dm = /^\/([^/]+)\/dl\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(path);
      if (dm) {
        const eng = engines.find((e) => e.slug === dm[1] && e.version === dm[2] && e.bin === dm[4]);
        if (!eng || !(SUPPORTED_PLATFORMS as readonly string[]).includes(dm[3] as string))
          return sendJson(res, 404, { error: 'not found' });
        if (sc.name === 'domain_blocked') return blocked(res);
        const art = buildArtifact(eng, fakesRoot, sc.sizeBytes, opts.nodeBin);
        if (sc.name === 'checksum_mismatch') art[art.length - 2] = (art[art.length - 2] as number) ^ 0x01;
        res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': art.length });
        const cutoff = sc.name === 'network' ? (sc.failAfterBytes ?? Math.floor(art.length / 2)) : art.length;
        for (let off = 0; off < cutoff; off += sc.chunkSize) {
          res.write(art.subarray(off, Math.min(off + sc.chunkSize, cutoff)));
          if (sc.chunkDelayMs) await sleep(sc.chunkDelayMs);
          if (res.destroyed) return;
        }
        if (sc.name === 'network') return void req.socket.destroy(); // đứt giữa chừng, Content-Length chưa đủ
        return void res.end();
      }
      sendJson(res, 404, { error: 'not found' });
    } catch (e) {
      sendJson(res, e instanceof HttpError ? e.status : e instanceof SyntaxError ? 400 : 500, {
        error: (e as Error).message,
      });
    }
  });

  const running = await listen(server, opts);
  return { ...running, requests, setScenario: (s) => (sc = parseInstallScenario(s)) };
}
