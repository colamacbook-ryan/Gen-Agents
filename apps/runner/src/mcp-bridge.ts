import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { Readable, Writable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { FIXED_ROOTS, isTurnTicket, RunnerError, type RunnerRoots } from './paths.ts';

// `ga-runner mcp-bridge --url <URL MCP của gateway> --ticket-file <đường>` (L-ENG mcpBridgeCommand; BUILD-PLAN §B.5 bước 4):
// cầu MCP stdio (JSON-RPC mỗi dòng một thông điệp) ⇄ Streamable HTTP tới MCP server `ga` của gateway. CLI chạy lệnh này làm
// MCP server stdio; cấu hình MCP của CLI KHÔNG chứa vé — bridge đọc vé từ TỆP tmpfs của lượt (/run/ga/<lượt>/ticket, 0400 /
// 0600, tệp thường, không symlink, đúng chủ), giữ trong RAM, gắn `Authorization: Bearer` cho mỗi yêu cầu, không bao giờ log vé.
// - Mỗi thông điệp stdin ≤ MAX_MESSAGE_BYTES; quá cỡ ⇒ trả lỗi JSON-RPC (id null) và bỏ qua dòng đó.
// - Phản hồi: 202 (notification) ⇒ không ghi; 200 application/json (object hoặc mảng) ⇒ mỗi thông điệp một dòng;
//   200 text/event-stream ⇒ mỗi sự kiện `data:` một dòng; khác ⇒ lỗi JSON-RPC cho yêu cầu có id. Phản hồi ≤ MAX_RESPONSE_BYTES.
// - Nhớ header `mcp-session-id` của gateway và gửi lại. Không qua proxy (gateway nằm trên mạng ga-roles).

export const MCP_BRIDGE_LIMITS = {
  maxMessageBytes: 1024 * 1024,
  maxResponseBytes: 16 * 1024 * 1024,
  timeoutMs: 120_000,
} as const;

const TICKET_PATH_RE = /^\/run\/ga\/[0-9A-HJKMNP-TV-Z]{26}\/ticket$/;

export interface BridgeArgs {
  url: URL;
  ticketFile: string;
}

export function parseBridgeArgs(args: readonly string[]): BridgeArgs {
  if (args.length !== 4 || args[0] !== '--url' || args[2] !== '--ticket-file') {
    throw new RunnerError('usage', 'cú pháp: mcp-bridge --url <URL> --ticket-file <đường>');
  }
  let url: URL;
  try {
    url = new URL(args[1] as string);
  } catch {
    throw new RunnerError('bad_url', 'URL MCP không hợp lệ');
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password || url.hash) {
    throw new RunnerError('bad_url', 'URL MCP phải là http(s), không thông tin đăng nhập');
  }
  return { url, ticketFile: args[3] as string };
}

/** Đọc vé: đúng đường tmpfs của lượt (theo gốc `roots.run`), tệp thường, không symlink, chủ = mình, không ai khác đọc được. */
export function readTicketFile(path: string, roots: RunnerRoots = FIXED_ROOTS): string {
  const rel = path.startsWith(`${roots.run}/`) ? `${FIXED_ROOTS.run}/${path.slice(roots.run.length + 1)}` : path;
  if (!TICKET_PATH_RE.test(rel)) throw new RunnerError('bad_ticket_file', 'tệp vé phải là /run/ga/<lượt>/ticket');
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    throw new RunnerError(
      'ticket_file_missing',
      code === 'ENOENT' ? 'không có tệp vé của lượt' : `không mở được tệp vé (${code})`,
    );
  }
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) throw new RunnerError('bad_ticket_file', 'tệp vé không phải tệp thường');
    if ((st.mode & 0o077) !== 0) throw new RunnerError('bad_ticket_file', 'tệp vé để người khác đọc được');
    if (typeof process.getuid === 'function' && st.uid !== process.getuid()) {
      throw new RunnerError('bad_ticket_file', 'tệp vé không thuộc tiến trình này');
    }
    if (st.size > 512) throw new RunnerError('bad_ticket', 'tệp vé quá lớn');
    const buf = Buffer.alloc(512);
    const n = readSync(fd, buf, 0, 512, 0);
    const ticket = buf.toString('utf8', 0, n).trim();
    if (!isTurnTicket(ticket)) throw new RunnerError('bad_ticket', 'vé lượt sai dạng');
    return ticket;
  } finally {
    closeSync(fd);
  }
}

function rpcError(id: unknown, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
}

function idOf(msg: string): unknown {
  try {
    const v = JSON.parse(msg) as { id?: unknown };
    return v && typeof v === 'object' && 'id' in v ? v.id : undefined;
  } catch {
    return undefined;
  }
}

interface PostResult {
  status: number;
  contentType: string;
  body: string;
  sessionId: string | null;
}

function post(url: URL, body: string, headers: Record<string, string>): Promise<PostResult> {
  const req = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const r = req(
      url,
      {
        method: 'POST',
        agent: false,
        timeout: MCP_BRIDGE_LIMITS.timeoutMs,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), ...headers },
      },
      (res: IncomingMessage) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > MCP_BRIDGE_LIMITS.maxResponseBytes) {
            res.destroy();
            reject(new RunnerError('response_too_large', 'phản hồi MCP quá lớn'));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            contentType: String(res.headers['content-type'] ?? ''),
            body: Buffer.concat(chunks).toString('utf8'),
            sessionId: typeof res.headers['mcp-session-id'] === 'string' ? res.headers['mcp-session-id'] : null,
          }),
        );
        res.on('error', () => reject(new RunnerError('network', 'lỗi mạng tới gateway')));
      },
    );
    r.on('timeout', () => r.destroy(new RunnerError('timeout', 'gateway không trả lời')));
    r.on('error', (e) => reject(e instanceof RunnerError ? e : new RunnerError('network', 'lỗi mạng tới gateway')));
    r.end(body);
  });
}

/** Tách luồng SSE thành dữ liệu từng sự kiện (nối các dòng `data:`). */
export function sseData(text: string): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line === '') {
      if (cur.length) out.push(cur.join('\n'));
      cur = [];
    } else if (line.startsWith('data:')) {
      cur.push(line.slice(5).startsWith(' ') ? line.slice(6) : line.slice(5));
    }
  }
  if (cur.length) out.push(cur.join('\n'));
  return out;
}

/** Viết một thông điệp JSON-RPC ra stdout dưới dạng MỘT dòng (thông điệp không phải JSON ⇒ bỏ). */
function emitMessage(out: Writable, data: string): void {
  let v: unknown;
  try {
    v = JSON.parse(data);
  } catch {
    return;
  }
  const items = Array.isArray(v) ? v : [v];
  for (const m of items) out.write(`${JSON.stringify(m)}\n`);
}

export async function runMcpBridge(
  args: BridgeArgs,
  io: { stdin: Readable; stdout: Writable; stderr: Writable },
  roots: RunnerRoots = FIXED_ROOTS,
): Promise<number> {
  const ticket = readTicketFile(args.ticketFile, roots);
  let sessionId: string | null = null;
  const queue: string[] = [];
  let busy = false;
  let ended = false;
  let resolveDone: (code: number) => void = () => {};
  const done = new Promise<number>((r) => {
    resolveDone = r;
  });

  const handle = async (msg: string) => {
    const id = idOf(msg);
    const headers: Record<string, string> = {
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${ticket}`,
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;
    try {
      const r = await post(args.url, msg, headers);
      if (r.sessionId && /^[\x21-\x7e]{1,256}$/.test(r.sessionId)) sessionId = r.sessionId;
      if (r.status === 202 || (r.status >= 200 && r.status < 300 && r.body.length === 0)) return;
      if (r.status < 200 || r.status >= 300) {
        if (id !== undefined) io.stdout.write(`${rpcError(id, -32001, `gateway trả ${r.status}`)}\n`);
        return;
      }
      if (r.contentType.startsWith('text/event-stream')) for (const d of sseData(r.body)) emitMessage(io.stdout, d);
      else emitMessage(io.stdout, r.body);
    } catch (e) {
      if (id !== undefined) io.stdout.write(`${rpcError(id, -32002, e instanceof RunnerError ? e.code : 'network')}\n`);
    }
  };

  const pump = async () => {
    if (busy) return;
    busy = true;
    while (queue.length > 0) await handle(queue.shift() as string);
    busy = false;
    if (ended) resolveDone(0);
  };

  const dec = new StringDecoder('utf8');
  let buf = '';
  let dropping = false;
  const onText = (text: string) => {
    let start = 0;
    for (;;) {
      const nl = text.indexOf('\n', start);
      const part = nl < 0 ? text.slice(start) : text.slice(start, nl);
      if (!dropping) {
        if (Buffer.byteLength(buf) + Buffer.byteLength(part) > MCP_BRIDGE_LIMITS.maxMessageBytes) {
          dropping = true;
          buf = '';
        } else buf += part;
      }
      if (nl < 0) break;
      if (dropping) io.stdout.write(`${rpcError(null, -32600, 'thông điệp vượt trần kích thước')}\n`);
      else if (buf.trim().length > 0) queue.push(buf);
      buf = '';
      dropping = false;
      start = nl + 1;
    }
    void pump();
  };
  io.stdin.on('data', (c: Buffer) => onText(dec.write(c)));
  io.stdin.on('end', () => {
    onText(`${dec.end()}\n`);
    ended = true;
    void pump();
  });
  io.stdin.on('error', () => {
    ended = true;
    void pump();
  });
  return done;
}
