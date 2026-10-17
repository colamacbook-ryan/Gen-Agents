// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
//
// CLI giả "làm việc như tác tử": đọc cấu hình MCP mà adapter viết, gọi tool theo kịch bản (BUILD-PLAN §C.2).
// Máy khách MCP tối thiểu: Streamable HTTP (JSON-RPC qua POST; phản hồi JSON hoặc SSE) và stdio (spawn lệnh khai trong cấu
// hình, JSON-RPC từng dòng qua stdin / stdout — như CLI thật làm với máy chủ `type:"stdio"`).
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { credentialPath, type Engine } from './creds.ts';
import { postJson } from './http.ts';
import type { ToolScript } from './scenario.ts';

export type McpServer =
  | { kind: 'http'; name: string; url: string; headers: Record<string, string> }
  | { kind: 'stdio'; name: string; command: string; args: string[]; env: Record<string, string> };

export interface ToolOutcome {
  tool: string;
  callId: string;
  isError: boolean;
  /** Văn bản kết quả (đã cắt 500 ký tự). Gateway từ chối ⇒ chứa mã (vd credential_like_payload). */
  text: string;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

const expandEnv = (v: string, env: NodeJS.ProcessEnv): string =>
  v.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_m, n: string) => env[n] ?? '');

/**
 * Chọn máy chủ MCP trong `servers` (khoá = tên máy chủ; `GA_FAKE_MCP_SERVER` chọn theo tên; mục `disabled` bị bỏ).
 * - `type:"stdio"` (hoặc có `command`, không `url`): spawn `command args…` với `env`, nói MCP qua stdin / stdout. Đây là dạng
 *   adapter ghi: cầu `ga-runner mcp-bridge --url … --ticket-file …` (vé không nằm trong cấu hình — Gen duyệt 2026-10-16).
 * - `type:"http"` / có `url`: hỗ trợ `headers` (có `${VAR}`) và phần mở rộng CHỈ-CÓ-Ở-FAKE `ticketFile`.
 * Không có máy chủ phù hợp ⇒ null: CLI giả KHÔNG gọi gì (không spawn, không kết nối).
 * Định dạng thật do adapter chốt (L-ENG): ASSUMPTIONS CL-MCP-1 / AG-MCP-1.
 */
export function pickMcpServer(servers: unknown, env: NodeJS.ProcessEnv = process.env): McpServer | null {
  if (!isObj(servers)) return null;
  const want = env.GA_FAKE_MCP_SERVER;
  const usable = (s: unknown): s is Record<string, unknown> =>
    isObj(s) && s.disabled !== true && (typeof s.url === 'string' || typeof s.command === 'string');
  const first = Object.entries(servers).find(([n, s]) => usable(s) && (!want || n === want));
  if (!first) return null;
  const [name, s] = first as [string, Record<string, unknown>];
  if (s.type === 'stdio' || typeof s.url !== 'string') {
    const args = Array.isArray(s.args) ? s.args : [];
    if (!args.every((a) => typeof a === 'string')) throw new Error(`máy chủ MCP ${name}: args phải là mảng chuỗi`);
    const senv: Record<string, string> = {};
    if (isObj(s.env)) for (const [k, v] of Object.entries(s.env)) senv[k] = String(v);
    return { kind: 'stdio', name, command: String(s.command), args: args as string[], env: senv };
  }
  const headers: Record<string, string> = {};
  if (isObj(s.headers)) for (const [k, v] of Object.entries(s.headers)) headers[k] = expandEnv(String(v), env);
  if (typeof s.ticketFile === 'string') headers.authorization = `Bearer ${readFileSync(s.ticketFile, 'utf8').trim()}`;
  const hasAuth = Object.keys(headers).some((k) => k.toLowerCase() === 'authorization');
  const ticket = hasAuth ? null : defaultTicketFile(env);
  if (ticket) headers.authorization = `Bearer ${readFileSync(ticket, 'utf8').trim()}`;
  return { kind: 'http', name, url: expandEnv(s.url as string, env), headers };
}

/**
 * Bố cục lượt của contracts (TURN_EXEC): HOME = /run/ga/<lượt>/home, vé = /run/ga/<lượt>/ticket (0400). Cấu hình MCP không nêu
 * Authorization ⇒ lấy vé ở đó, như runner nối vé vào cấu hình. `GA_FAKE_TICKET_FILE` ép đường khác. Không có tệp ⇒ null.
 */
export function defaultTicketFile(env: NodeJS.ProcessEnv, runRoot = '/run/ga'): string | null {
  const explicit = env.GA_FAKE_TICKET_FILE;
  if (explicit) return existsSync(explicit) ? explicit : null;
  const home = env.HOME?.replace(/\/+$/, '');
  if (!home?.startsWith(`${runRoot}/`) || !home.endsWith('/home')) return null;
  const turn = home.slice(runRoot.length + 1, -'/home'.length);
  if (!turn || turn.includes('/')) return null;
  const t = join(runRoot, turn, 'ticket');
  return existsSync(t) ? t : null;
}

/** Nội dung mọi tệp (cấp 1) trong thư mục credential — nguồn của placeholder "$AUTH". */
export function readAuthDirContents(engine: Engine, env: NodeJS.ProcessEnv = process.env): string {
  const dir = dirname(credentialPath(engine, env));
  if (!existsSync(dir)) return '';
  return readdirSync(dir)
    .filter((n) => statSync(join(dir, n)).isFile())
    .map((n) => readFileSync(join(dir, n), 'utf8'))
    .join('\n');
}

function substitute(v: unknown, auth: () => string): unknown {
  if (v === '$AUTH') return auth();
  if (Array.isArray(v)) return v.map((x) => substitute(x, auth));
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, substitute(x, auth)]));
  return v;
}

/** Lấy thông điệp JSON-RPC (có `id`) từ phản hồi JSON thường hoặc SSE (`data:` từng dòng). */
function parseRpc(body: string, contentType: string, id: number): Record<string, unknown> | null {
  const msgs: unknown[] = [];
  if (contentType.includes('text/event-stream')) {
    for (const line of body.split('\n')) {
      if (!line.startsWith('data:')) continue;
      try {
        msgs.push(JSON.parse(line.slice(5).trim()));
      } catch {
        // dòng SSE không phải JSON-RPC: bỏ qua
      }
    }
  } else if (body.trim()) {
    msgs.push(JSON.parse(body));
  }
  return (msgs.find((m) => isObj(m) && m.id === id) as Record<string, unknown> | undefined) ?? null;
}

interface RpcReply {
  status: number;
  msg: Record<string, unknown> | null;
}

/** Một phiên MCP với máy chủ đã chọn (HTTP hoặc stdio). */
interface McpSession {
  request(id: number, method: string, params: unknown): Promise<RpcReply>;
  notify(method: string): Promise<void>;
  close(): void;
}

function httpSession(server: Extract<McpServer, { kind: 'http' }>, env: NodeJS.ProcessEnv): McpSession {
  let sessionId: string | null = null;
  const headers = () => ({ ...server.headers, ...(sessionId ? { 'mcp-session-id': sessionId } : {}) });
  return {
    async request(id, method, params) {
      const r = await postJson(
        server.url,
        { jsonrpc: '2.0', id, method, params },
        { headers: headers(), timeoutMs: 30_000, env },
      );
      const sid = r.headers['mcp-session-id'];
      if (typeof sid === 'string') sessionId = sid;
      return { status: r.status, msg: parseRpc(r.body, String(r.headers['content-type'] ?? ''), id) };
    },
    async notify(method) {
      await postJson(server.url, { jsonrpc: '2.0', method }, { headers: headers(), timeoutMs: 30_000, env });
    },
    close() {},
  };
}

/** stdio: JSON-RPC mỗi thông điệp một dòng (MCP stdio transport). stderr của máy chủ bỏ qua; máy chủ chết ⇒ lỗi từng yêu cầu. */
function stdioSession(server: Extract<McpServer, { kind: 'stdio' }>, env: NodeJS.ProcessEnv): McpSession {
  const child = spawn(server.command, server.args, {
    env: { ...env, ...server.env },
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  const pending = new Map<number, (r: RpcReply) => void>();
  let buf = '';
  let dead: string | null = null;
  const failAll = (why: string) => {
    dead = why;
    for (const [, resolve] of pending) resolve({ status: 0, msg: { error: { message: why } } });
    pending.clear();
  };
  child.on('error', (e) => failAll(`không chạy được máy chủ MCP stdio: ${e.message}`));
  child.on('exit', (code) => failAll(`máy chủ MCP stdio đã thoát (${code})`));
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buf += chunk;
    if (buf.length > 4 * 1024 * 1024) return child.kill();
    let nl = buf.indexOf('\n');
    while (nl >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      nl = buf.indexOf('\n');
      if (!line) continue;
      let m: unknown;
      try {
        m = JSON.parse(line);
      } catch {
        continue;
      }
      if (isObj(m) && typeof m.id === 'number') {
        pending.get(m.id)?.({ status: 200, msg: m });
        pending.delete(m.id);
      }
    }
  });
  const write = (o: unknown) => child.stdin.write(`${JSON.stringify(o)}\n`);
  return {
    request(id, method, params) {
      if (dead) return Promise.resolve({ status: 0, msg: { error: { message: dead } } });
      return new Promise<RpcReply>((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          resolve({ status: 0, msg: { error: { message: 'máy chủ MCP stdio không trả lời trong 30 s' } } });
        }, 30_000);
        pending.set(id, (r) => {
          clearTimeout(timer);
          resolve(r);
        });
        write({ jsonrpc: '2.0', id, method, params });
      });
    },
    async notify(method) {
      if (!dead) write({ jsonrpc: '2.0', method });
    },
    close() {
      child.stdin.end();
      setTimeout(() => child.kill(), 2000).unref();
    },
  };
}

function outcomeText(msg: Record<string, unknown> | null, status: number): { isError: boolean; text: string } {
  if (!msg) return { isError: true, text: `HTTP ${status}: không có phản hồi JSON-RPC` };
  if (isObj(msg.error)) return { isError: true, text: String(msg.error.message ?? 'lỗi JSON-RPC').slice(0, 500) };
  const res = isObj(msg.result) ? msg.result : {};
  const content = Array.isArray(res.content) ? res.content : [];
  const text = content.map((c) => (isObj(c) && typeof c.text === 'string' ? c.text : '')).join('\n');
  return { isError: res.isError === true, text: text.slice(0, 500) };
}

/**
 * Chạy kịch bản: initialize → từng tools/call. Lỗi mạng / từ chối ⇒ ghi vào kết quả từng bước, KHÔNG làm chết lượt.
 * `allow(fullName)` (tên đầy đủ `mcp__<máy chủ>__<tool>`): công cụ không được phép ⇒ không gọi, kết quả lỗi.
 */
export async function runToolScript(
  script: ToolScript,
  server: McpServer | null,
  engine: Engine,
  env: NodeJS.ProcessEnv = process.env,
  allow: (fullName: string) => boolean = () => true,
): Promise<ToolOutcome[]> {
  const calls = script.calls ?? [];
  if (!calls.length) return [];
  const out: ToolOutcome[] = [];
  const failAll = (text: string): ToolOutcome[] =>
    calls.map((c, i) => ({ tool: c.tool, callId: `toolu_fake_${i}`, isError: true, text }));
  if (!server) return failAll('không có máy chủ MCP trong cấu hình');
  if (!calls.some((c) => allow(`mcp__${server.name}__${c.tool}`))) {
    return failAll('công cụ không được phép (--allowed-tools)');
  }
  const session = server.kind === 'http' ? httpSession(server, env) : stdioSession(server, env);
  try {
    try {
      const init = await session.request(1, 'initialize', {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'ga-fake-cli', version: '0.0.0' },
      });
      if (!init.msg || isObj(init.msg.error)) throw new Error(outcomeText(init.msg, init.status).text);
      await session.notify('notifications/initialized');
    } catch (e) {
      return failAll(`MCP initialize lỗi: ${(e as Error).message}`);
    }
    let auth: string | null = null;
    const readAuth = () => (auth ??= readAuthDirContents(engine, env));
    for (const [i, c] of calls.entries()) {
      if (!allow(`mcp__${server.name}__${c.tool}`)) {
        out.push({
          tool: c.tool,
          callId: `toolu_fake_${i}`,
          isError: true,
          text: 'công cụ không được phép (--allowed-tools)',
        });
        continue;
      }
      try {
        const r = await session.request(i + 2, 'tools/call', { name: c.tool, arguments: substitute(c.args, readAuth) });
        out.push({ tool: c.tool, callId: `toolu_fake_${i}`, ...outcomeText(r.msg, r.status) });
      } catch (e) {
        out.push({
          tool: c.tool,
          callId: `toolu_fake_${i}`,
          isError: true,
          text: `MCP tools/call lỗi: ${(e as Error).message}`,
        });
      }
    }
    return out;
  } finally {
    session.close();
  }
}
