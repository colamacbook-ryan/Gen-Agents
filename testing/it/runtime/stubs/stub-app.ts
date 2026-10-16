// IT runtime: đóng vai ga-app tối thiểu (KHÔNG phải ga-app thật).
//  - :7410 trên IP mạng roles: gateway — GET /turn/bundle (Bearer vé lượt) trả bundle harness đã đăng ký; POST /mcp = MCP
//    Streamable HTTP tối thiểu (Bearer phải là vé đã đăng ký, sai ⇒ 401): initialize (JSON + mcp-session-id), notification ⇒ 202,
//    tools/call `echo` (trả qua SSE), ping ⇒ {}; ghi lại mọi thông điệp MCP (GET /_test/mcp, POST /_test/mcp-reset).
//  - :7401 (control plane) + :7499 (điều khiển của harness) CHỈ trên IP mạng hostlink ⇒ container Role không có đường tới
//    (roles là internal, không nối hostlink) và 7401 trên IP roles bị từ chối kết nối — đúng hình dạng §B.3.
//    :7499: POST /_test/bundle {ticket, bundle} · GET /_test/requests.
// IP roles = giao diện cùng subnet với ga-egress (chỉ có trên mạng roles).
import { lookup } from 'node:dns/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';

const bundles = new Map<string, unknown>();
const requests: { port: number; path: string; auth: boolean; at: string }[] = [];
const mcpLog: { method: string; tool: string | null; args: unknown; session: string | null; bytes: number }[] = [];
const MCP_SESSION = 'stub-sess-1';

function body(req: IncomingMessage): Promise<string> {
  return new Promise((r) => {
    let s = '';
    req.on('data', (c) => {
      s += c;
    });
    req.on('end', () => r(s));
  });
}

const toInt = (ip: string) => ip.split('.').reduce((n, p) => (n << 8) + Number(p), 0) >>> 0;
function inCidr(ip: string, cidr: string): boolean {
  const [net, bits] = cidr.split('/');
  const mask = Number(bits) === 0 ? 0 : (0xffffffff << (32 - Number(bits))) >>> 0;
  return (toInt(ip) & mask) === (toInt(net as string) & mask);
}

async function egressIp(): Promise<string> {
  for (let i = 0; i < 60; i++) {
    try {
      return (await lookup('ga-egress', { family: 4 })).address;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error('không phân giải được ga-egress');
}

const ifaces = Object.values(networkInterfaces())
  .flat()
  .filter((a): a is NonNullable<typeof a> => !!a && a.family === 'IPv4' && !a.internal && !!a.cidr);
const eg = await egressIp();
const rolesIps = ifaces.filter((a) => inCidr(eg, a.cidr as string)).map((a) => a.address);
const hostlinkIps = ifaces.filter((a) => !inCidr(eg, a.cidr as string)).map((a) => a.address);

function gateway(req: IncomingMessage, res: ServerResponse) {
  const auth = String(req.headers.authorization ?? '');
  requests.push({ port: 7410, path: String(req.url), auth: auth.length > 0, at: new Date().toISOString() });
  if (req.method === 'GET' && req.url === '/turn/bundle') {
    const b = bundles.get(auth.startsWith('Bearer ') ? auth.slice(7) : '');
    if (!b) return void res.writeHead(401).end();
    return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(b));
  }
  if (req.method === 'POST' && req.url === '/mcp') {
    void body(req).then((raw) => mcp(auth, raw, req, res));
    return;
  }
  res.writeHead(404).end();
}

function mcp(auth: string, raw: string, req: IncomingMessage, res: ServerResponse) {
  if (!bundles.has(auth.startsWith('Bearer ') ? auth.slice(7) : '')) return void res.writeHead(401).end();
  let msg: { id?: unknown; method?: unknown; params?: { name?: unknown; arguments?: unknown } };
  try {
    msg = JSON.parse(raw) as typeof msg;
  } catch {
    return void res.writeHead(400).end();
  }
  const sid = req.headers['mcp-session-id'];
  mcpLog.push({
    method: String(msg.method),
    tool: typeof msg.params?.name === 'string' ? msg.params.name : null,
    args: msg.params?.arguments ?? null,
    session: typeof sid === 'string' ? sid : null,
    bytes: raw.length,
  });
  if (msg.id === undefined) return void res.writeHead(202).end();
  const reply = (o: Record<string, unknown>) => JSON.stringify({ jsonrpc: '2.0', id: msg.id, ...o });
  const json = { 'content-type': 'application/json', 'mcp-session-id': MCP_SESSION };
  if (msg.method === 'initialize') {
    const result = {
      protocolVersion: '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: { name: 'ga-stub', version: '0' },
    };
    return void res.writeHead(200, json).end(reply({ result }));
  }
  if (msg.method === 'ping') return void res.writeHead(200, json).end(reply({ result: {} }));
  if (msg.method === 'tools/call' && msg.params?.name === 'echo') {
    const text = `echo:${JSON.stringify(msg.params.arguments ?? {})}`;
    res.writeHead(200, { 'content-type': 'text/event-stream', 'mcp-session-id': MCP_SESSION });
    return void res.end(`event: message\ndata: ${reply({ result: { content: [{ type: 'text', text }] } })}\n\n`);
  }
  res.writeHead(200, json).end(reply({ error: { code: -32601, message: 'method not found' } }));
}

async function control(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'POST' && req.url === '/_test/bundle') {
    const { ticket, bundle } = JSON.parse(await body(req)) as { ticket: string; bundle: unknown };
    bundles.set(ticket, bundle);
    return void res.writeHead(200).end('{}');
  }
  if (req.method === 'GET' && req.url === '/_test/requests') {
    return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(requests));
  }
  if (req.method === 'GET' && req.url === '/_test/mcp') {
    return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(mcpLog));
  }
  if (req.method === 'POST' && req.url === '/_test/mcp-reset') {
    mcpLog.length = 0;
    return void res.writeHead(200).end('{}');
  }
  if (req.method === 'GET' && req.url === '/_test/ips') {
    return void res
      .writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify({ rolesIps, hostlinkIps }));
  }
  res.writeHead(404).end();
}

for (const ip of rolesIps) createServer(gateway).listen(7410, ip);
for (const ip of hostlinkIps) {
  createServer((_q, r) => r.writeHead(200).end('control-plane')).listen(7401, ip);
  createServer((q, r) => void control(q, r)).listen(7499, ip);
}
process.stdout.write(`stub-app ready roles=${rolesIps.join(',')} hostlink=${hostlinkIps.join(',')}\n`);
