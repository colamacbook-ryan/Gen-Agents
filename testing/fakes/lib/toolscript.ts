// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
//
// CLI giả "làm việc như tác tử": đọc cấu hình MCP mà adapter viết, gọi tool theo kịch bản (BUILD-PLAN §C.2).
// Máy khách MCP tối thiểu cho Streamable HTTP (JSON-RPC qua POST; phản hồi JSON hoặc SSE).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { credentialPath, type Engine } from './creds.ts';
import { postJson } from './http.ts';
import type { ToolScript } from './scenario.ts';

export interface McpServer {
  url: string;
  headers: Record<string, string>;
}

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
 * Chọn máy chủ MCP dạng http trong `servers` (khoá = tên máy chủ). Hỗ trợ `headers` (có `${VAR}`) và phần mở rộng CHỈ-CÓ-Ở-FAKE
 * `ticketFile`: đọc tệp rồi gửi `Authorization: Bearer <nội dung>` (vé lượt nằm ở tệp tmpfs 0400, không qua env — CNS-142).
 * Định dạng thật do adapter chốt (L-ENG): ASSUMPTIONS CL-MCP-1 / AG-MCP-1.
 */
export function pickMcpServer(servers: unknown, env: NodeJS.ProcessEnv = process.env): McpServer | null {
  if (!isObj(servers)) return null;
  const want = env.GA_FAKE_MCP_SERVER;
  const entries = Object.entries(servers).filter(
    ([n, s]) => isObj(s) && typeof s.url === 'string' && (!want || n === want),
  );
  const first = entries[0];
  if (!first) return null;
  const s = first[1] as Record<string, unknown>;
  const headers: Record<string, string> = {};
  if (isObj(s.headers)) for (const [k, v] of Object.entries(s.headers)) headers[k] = expandEnv(String(v), env);
  if (typeof s.ticketFile === 'string') headers.authorization = `Bearer ${readFileSync(s.ticketFile, 'utf8').trim()}`;
  const hasAuth = Object.keys(headers).some((k) => k.toLowerCase() === 'authorization');
  const ticket = hasAuth ? null : defaultTicketFile(env);
  if (ticket) headers.authorization = `Bearer ${readFileSync(ticket, 'utf8').trim()}`;
  return { url: expandEnv(s.url as string, env), headers };
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

async function rpc(
  server: McpServer,
  sessionId: string | null,
  id: number,
  method: string,
  params: unknown,
  env: NodeJS.ProcessEnv,
) {
  const headers = { ...server.headers, ...(sessionId ? { 'mcp-session-id': sessionId } : {}) };
  const r = await postJson(server.url, { jsonrpc: '2.0', id, method, params }, { headers, timeoutMs: 30_000, env });
  const sid = r.headers['mcp-session-id'];
  return {
    status: r.status,
    sessionId: typeof sid === 'string' ? sid : sessionId,
    msg: parseRpc(r.body, String(r.headers['content-type'] ?? ''), id),
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

/** Chạy kịch bản: initialize → từng tools/call. Lỗi mạng / từ chối ⇒ ghi vào kết quả từng bước, KHÔNG làm chết lượt. */
export async function runToolScript(
  script: ToolScript,
  server: McpServer | null,
  engine: Engine,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ToolOutcome[]> {
  const calls = script.calls ?? [];
  if (!calls.length) return [];
  const out: ToolOutcome[] = [];
  const failAll = (text: string): ToolOutcome[] =>
    calls.map((c, i) => ({ tool: c.tool, callId: `toolu_fake_${i}`, isError: true, text }));
  if (!server) return failAll('không có máy chủ MCP trong cấu hình');
  let sessionId: string | null = null;
  try {
    const init = await rpc(
      server,
      null,
      1,
      'initialize',
      {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'ga-fake-cli', version: '0.0.0' },
      },
      env,
    );
    sessionId = init.sessionId;
    if (!init.msg || isObj(init.msg.error)) throw new Error(outcomeText(init.msg, init.status).text);
    await postJson(
      server.url,
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { headers: { ...server.headers, ...(sessionId ? { 'mcp-session-id': sessionId } : {}) }, timeoutMs: 30_000, env },
    );
  } catch (e) {
    return failAll(`MCP initialize lỗi: ${(e as Error).message}`);
  }
  let auth: string | null = null;
  const readAuth = () => (auth ??= readAuthDirContents(engine, env));
  for (const [i, c] of calls.entries()) {
    try {
      const r = await rpc(
        server,
        sessionId,
        i + 2,
        'tools/call',
        { name: c.tool, arguments: substitute(c.args, readAuth) },
        env,
      );
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
}
