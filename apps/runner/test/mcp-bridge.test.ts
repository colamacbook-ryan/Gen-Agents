import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MCP_BRIDGE_LIMITS, parseBridgeArgs, readTicketFile, runMcpBridge, sseData } from '../src/mcp-bridge.ts';
import { Capture, type Sandbox, sandbox, stdinOf, TICKET, TURN_ID } from './helpers.ts';

// ga-runner mcp-bridge: stdio JSON-RPC ⇄ HTTP gateway; vé đọc từ TỆP tmpfs của lượt, không argv / env, không log.

let gw: Server;
let gwUrl = '';
const seen: { auth: string | undefined; session: string | undefined; body: string }[] = [];

beforeAll(async () => {
  gw = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', () => {
      seen.push({
        auth: req.headers.authorization,
        session: req.headers['mcp-session-id'] as string | undefined,
        body,
      });
      if (req.headers.authorization !== `Bearer ${TICKET}`) {
        res.writeHead(401).end();
        return;
      }
      const msg = JSON.parse(body) as { id?: number; method: string };
      if (msg.id === undefined) {
        res.writeHead(202).end();
        return;
      }
      if (msg.method === 'tools/list') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'mcp-session-id': 'sess-1' });
        res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { tools: [] } })}\n\n`);
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 'sess-1' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { ok: msg.method } }));
    });
  });
  await new Promise<void>((r) => gw.listen(0, '127.0.0.1', r));
  gwUrl = `http://127.0.0.1:${(gw.address() as AddressInfo).port}/mcp`;
});
afterAll(async () => {
  await new Promise((r) => gw.close(r));
});

let sb: Sandbox;
let ticketPath = '';
beforeEach(() => {
  sb = sandbox();
  seen.length = 0;
  mkdirSync(join(sb.roots.run, TURN_ID), { mode: 0o700 });
  ticketPath = join(sb.roots.run, TURN_ID, 'ticket');
  writeFileSync(ticketPath, TICKET, { mode: 0o400 });
});
afterEach(() => sb.cleanup());

async function bridge(input: string, ticket = ticketPath) {
  const stdout = new Capture();
  const stderr = new Capture();
  const code = await runMcpBridge(
    parseBridgeArgs(['--url', gwUrl, '--ticket-file', ticket]),
    { stdin: stdinOf(input), stdout, stderr },
    sb.roots,
  );
  return { code, stdout, stderr };
}

describe('mcp-bridge — chuyển JSON-RPC, gắn vé từ tệp', () => {
  it('request ⇒ phản hồi JSON / SSE thành từng dòng; notification ⇒ không ghi; nhớ mcp-session-id; vé không ra stdout / stderr', async () => {
    const input = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ]
      .map((m) => JSON.stringify(m))
      .join('\n');
    const r = await bridge(`${input}\n`);
    expect(r.code).toBe(0);
    expect(r.stdout.json()).toEqual([
      { jsonrpc: '2.0', id: 1, result: { ok: 'initialize' } },
      { jsonrpc: '2.0', id: 2, result: { tools: [] } },
    ]);
    expect(seen.map((s) => s.auth)).toEqual(Array(3).fill(`Bearer ${TICKET}`));
    expect(seen.map((s) => s.session)).toEqual([undefined, 'sess-1', 'sess-1']);
    expect(r.stdout.data + r.stderr.data).not.toContain(TICKET);
  });

  it('thông điệp quá cỡ ⇒ lỗi JSON-RPC, bỏ dòng đó, thông điệp sau vẫn đi', async () => {
    const big = JSON.stringify({
      jsonrpc: '2.0',
      id: 9,
      method: 'x',
      params: { p: 'a'.repeat(MCP_BRIDGE_LIMITS.maxMessageBytes) },
    });
    const r = await bridge(`${big}\n${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'ping' })}\n`);
    const out = r.stdout.json();
    expect(out[0]).toMatchObject({ id: null, error: { code: -32600 } });
    expect(out[1]).toMatchObject({ id: 3, result: { ok: 'ping' } });
    expect(seen).toHaveLength(1);
  });

  it('gateway từ chối vé (401) ⇒ lỗi JSON-RPC cho đúng id', async () => {
    // tệp vé đã có ở mode 0400: mở quyền ghi trước (user thường không ghi đè được tệp 0400; root thì được)
    chmodSync(ticketPath, 0o600);
    writeFileSync(ticketPath, 'S'.repeat(43));
    chmodSync(ticketPath, 0o400);
    const r = await bridge(`${JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'ping' })}\n`);
    expect(r.stdout.json()[0]).toMatchObject({ id: 7, error: { code: -32001, message: 'gateway trả 401' } });
  });
});

describe('mcp-bridge — tệp vé: chỉ tệp tmpfs của lượt, chặt', () => {
  const code = (f: () => unknown) => {
    try {
      f();
      return 'ok';
    } catch (e) {
      return (e as { code?: string }).code ?? 'other';
    }
  };
  it('vé sai dạng ⇒ bad_ticket', () => {
    chmodSync(ticketPath, 0o600);
    writeFileSync(ticketPath, 'ngắn');
    expect(code(() => readTicketFile(ticketPath, sb.roots))).toBe('bad_ticket');
  });
  it('thiếu tệp vé ⇒ bad_ticket_file (thoát kèm lỗi rõ)', async () => {
    const missing = join(sb.roots.run, '01JABCDEFGHJKMNPQRSTVWXYZ5', 'ticket');
    expect(code(() => readTicketFile(missing, sb.roots))).toBe('bad_ticket_file');
    await expect(bridge('', missing)).rejects.toMatchObject({
      code: 'bad_ticket_file',
      message: 'không có tệp vé của lượt',
    });
  });
  it('người khác đọc được (0644) ⇒ bad_ticket_file', () => {
    chmodSync(ticketPath, 0o644);
    expect(code(() => readTicketFile(ticketPath, sb.roots))).toBe('bad_ticket_file');
  });
  it('symlink ⇒ từ chối (không đi theo)', () => {
    const d = join(sb.roots.run, '01JABCDEFGHJKMNPQRSTVWXYZ6');
    mkdirSync(d);
    symlinkSync(ticketPath, join(d, 'ticket'));
    expect(code(() => readTicketFile(join(d, 'ticket'), sb.roots))).not.toBe('ok');
  });
  it.each(['/etc/passwd', '/auth/EN-0001/.cfg/.credentials.json', '/run/ga/x/ticket', '/run/ga/../ticket'])(
    'đường ngoài /run/ga/<lượt>/ticket ⇒ bad_ticket_file: %s',
    (p) => {
      expect(code(() => readTicketFile(p, sb.roots))).toBe('bad_ticket_file');
    },
  );
  it('cú pháp: vé không bao giờ qua argv; URL phải http(s) không thông tin đăng nhập', () => {
    expect(() => parseBridgeArgs(['--url', gwUrl, '--ticket', TICKET])).toThrow();
    expect(() => parseBridgeArgs(['--url', 'http://u:p@ga-app:7410/mcp', '--ticket-file', ticketPath])).toThrow();
    expect(() => parseBridgeArgs(['--url', 'file:///etc/passwd', '--ticket-file', ticketPath])).toThrow();
  });
  it('sseData nối dòng data: theo sự kiện', () => {
    expect(sseData('event: m\ndata: {"a":1}\n\ndata: {"b"\ndata: :2}\n\n')).toEqual(['{"a":1}', '{"b"\n:2}']);
  });
});
