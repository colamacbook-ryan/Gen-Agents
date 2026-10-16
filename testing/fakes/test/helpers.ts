// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach } from 'vitest';

export const FAKES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

const tmpDirs: string[] = [];
export function tmp(prefix = 'ga-fakes-'): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

export interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Môi trường sạch cho CLI giả: không thừa kế biến kịch bản của máy chủ chạy test. */
export function cliEnv(home: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { PATH: process.env.PATH ?? '', HOME: home, ...extra };
}

export function startCli(
  which: 'agy' | 'claude',
  args: string[],
  opts: { env: NodeJS.ProcessEnv; cwd?: string },
): ChildProcess & { out: () => string; err: () => string } {
  const child = spawn('node', [join(FAKES_DIR, which, 'main.ts'), ...args], {
    env: opts.env,
    cwd: opts.cwd ?? opts.env.HOME ?? FAKES_DIR,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let o = '';
  let e = '';
  child.stdout?.on('data', (c: Buffer) => {
    o += c.toString('utf8');
  });
  child.stderr?.on('data', (c: Buffer) => {
    e += c.toString('utf8');
  });
  return Object.assign(child, { out: () => o, err: () => e });
}

export function runCli(
  which: 'agy' | 'claude',
  args: string[],
  opts: { env: NodeJS.ProcessEnv; input?: string; cwd?: string; timeoutMs?: number },
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = startCli(which, args, opts);
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`CLI treo quá ${opts.timeoutMs ?? 15_000} ms: ${which} ${args.join(' ')}`));
    }, opts.timeoutMs ?? 15_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: child.out(), stderr: child.err() });
    });
    child.stdin?.end(opts.input ?? '');
  });
}

export const lines = (s: string): unknown[] =>
  s
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));

export async function waitFor(cond: () => boolean, ms = 5000, what = 'điều kiện'): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`hết ${ms} ms chờ ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** Gateway MCP giả tối giản: initialize / tools/call; tool có chuỗi canary trong args ⇒ từ chối như gateway thật phải làm (CNS-133). */
export interface MockMcp {
  url: string;
  calls: Array<{ name: string; args: unknown; authorization: string | undefined }>;
  close(): Promise<void>;
}
export async function startMockMcp(opts: { sse?: boolean } = {}): Promise<MockMcp> {
  const calls: MockMcp['calls'] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const msg = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        id?: number;
        method: string;
        params?: { name?: string; arguments?: unknown };
      };
      if (msg.id === undefined) {
        res.writeHead(202);
        return res.end();
      }
      let result: unknown;
      if (msg.method === 'initialize') {
        result = {
          protocolVersion: '2025-03-26',
          capabilities: { tools: {} },
          serverInfo: { name: 'mock-gw', version: '0' },
        };
      } else {
        const args = msg.params?.arguments;
        calls.push({ name: String(msg.params?.name), args, authorization: req.headers.authorization });
        const denied = JSON.stringify(args).includes('GA-CANARY-');
        result = {
          content: [{ type: 'text', text: denied ? 'denied: credential_like_payload' : 'ok' }],
          isError: denied,
        };
      }
      const body = JSON.stringify({ jsonrpc: '2.0', id: msg.id, result });
      const headers: Record<string, string> = { 'mcp-session-id': 'sess-1' };
      if (opts.sse) {
        res.writeHead(200, { ...headers, 'content-type': 'text/event-stream' });
        return res.end(`event: message\ndata: ${body}\n\n`);
      }
      res.writeHead(200, { ...headers, 'content-type': 'application/json' });
      res.end(body);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    calls,
    close: () =>
      new Promise<void>((r) => {
        server.close(() => r());
        server.closeAllConnections();
      }),
  };
}

export function mkdirp(p: string): string {
  mkdirSync(p, { recursive: true });
  return p;
}
