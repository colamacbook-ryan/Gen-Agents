// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
//
// Cầu MCP GIẢ TỐI THIỂU `ga-runner mcp-bridge --url <gateway> --ticket-file <tệp>` — đứng thay cho cầu thật của L-RT
// (Gen duyệt 2026-10-16: adapter khai máy chủ MCP `stdio` = cầu này, vé lượt KHÔNG nằm trong cấu hình / argv / env của CLI).
// stdin / stdout: JSON-RPC mỗi thông điệp một dòng (MCP stdio). Mỗi thông điệp ⇒ POST Streamable HTTP tới gateway với
// `Authorization: Bearer <vé đọc từ tệp>`; phản hồi (JSON hoặc SSE) có `id` ⇒ ghi lại một dòng. Lỗi ⇒ JSON-RPC error, không im lặng.
// Chạy qua launcher `bridge-bin/ga-runner` (test tự đặt thư mục đó lên PATH, không bao giờ cạnh ga-runner thật).
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { postJson } from './lib/http.ts';

function die(msg: string): never {
  process.stderr.write(`fake mcp-bridge: ${msg}\n`);
  process.exit(2);
}

const [sub, ...rest] = process.argv.slice(2);
if (sub !== 'mcp-bridge') die(`chỉ hỗ trợ lệnh con mcp-bridge (nhận: ${sub ?? '—'})`);
let url: string | null = null;
let ticketFile: string | null = null;
for (let i = 0; i < rest.length; i += 2) {
  const [k, v] = [rest[i], rest[i + 1]];
  if (v === undefined) die(`thiếu giá trị cho ${k}`);
  if (k === '--url') url = v;
  else if (k === '--ticket-file') ticketFile = v;
  else die(`cờ lạ: ${k}`);
}
if (!url || !/^https?:\/\//.test(url)) die('--url phải là http(s)');
if (!ticketFile) die('thiếu --ticket-file');
const ticket = readFileSync(ticketFile, 'utf8').trim();
if (!ticket) die('tệp vé rỗng');

let sessionId: string | null = null;
const write = (o: unknown) => process.stdout.write(`${JSON.stringify(o)}\n`);

function pickReply(body: string, contentType: string, id: unknown): unknown {
  const msgs: unknown[] = [];
  if (contentType.includes('text/event-stream')) {
    for (const line of body.split('\n')) {
      if (!line.startsWith('data:')) continue;
      try {
        msgs.push(JSON.parse(line.slice(5).trim()));
      } catch {
        // dòng SSE không phải JSON-RPC
      }
    }
  } else if (body.trim()) {
    msgs.push(JSON.parse(body));
  }
  return msgs.find((m) => typeof m === 'object' && m !== null && (m as { id?: unknown }).id === id) ?? null;
}

const rl = createInterface({ input: process.stdin });
let chain = Promise.resolve();
rl.on('line', (line) => {
  chain = chain.then(async () => {
    if (!line.trim()) return;
    let msg: { id?: unknown };
    try {
      msg = JSON.parse(line) as { id?: unknown };
    } catch {
      write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } });
      return;
    }
    try {
      const headers: Record<string, string> = { authorization: `Bearer ${ticket}` };
      if (sessionId) headers['mcp-session-id'] = sessionId;
      const r = await postJson(url as string, msg, { headers, timeoutMs: 30_000 });
      const sid = r.headers['mcp-session-id'];
      if (typeof sid === 'string') sessionId = sid;
      if (msg.id === undefined) return;
      const reply = pickReply(r.body, String(r.headers['content-type'] ?? ''), msg.id);
      write(reply ?? { jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: `gateway HTTP ${r.status}` } });
    } catch (e) {
      if (msg.id !== undefined)
        write({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: (e as Error).message } });
    }
  });
});
rl.on('close', () => {
  chain.then(() => process.exit(0));
});
