import { lookup } from 'node:dns/promises';
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { connect, isIP, type Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import { isPrivateAddress, matchRule, normalizeHost, type RuleSet } from './rules.ts';

// ga-egress: proxy CONNECT (https) + absolute-form (http) có allowlist domain. Container Role / hệ thống ở mạng ga-roles
// (internal: true) chỉ ra Internet qua đây; CLI bỏ qua HTTPS_PROXY thì gọi mạng thất bại (fail-closed).
// - Từ chối = HTTP 403 + header `x-ga-egress: blocked` (chốt với L-FAKE / ga-engine-install — ASSUMPTIONS ES-1).
// - Phân giải DNS MỘT lần rồi nối thẳng tới IP đã kiểm (không phân giải lại ⇒ không DNS rebinding giữa kiểm và nối).
// - Địa chỉ nội mạng bị chặn trừ khi luật bật allowPrivate VÀ hook test cho phép (image test).
// - Chỉ log METADATA (nguồn, host, cổng, quyết định, số byte, thời gian) — không path, query, header, body.

export const BLOCK_HEADER = 'x-ga-egress';
export const BLOCK_VALUE = 'blocked';

export interface EgressLogger {
  log(level: 'info' | 'warn' | 'error', event: string, fields: Record<string, string | number | boolean | null>): void;
}

export interface ProxyOptions {
  getRules(): RuleSet;
  /** Hook test (image test): cho phép luật allowPrivate có hiệu lực. Image phát hành: luôn false. */
  allowPrivateHonored: boolean;
  /** "Chế độ học" (CHỈ image test): yêu cầu bị chặn vẫn cho đi + ghi `learn`. Image phát hành: luôn false. */
  learnMode: boolean;
  log: EgressLogger;
  maxConnections?: number;
  idleTimeoutMs?: number;
  resolve?(host: string): Promise<string[]>;
}

type Decision =
  | { ok: true; ip: string; port: number; host: string }
  | { ok: false; why: string; host: string; port: number };

async function defaultResolve(host: string): Promise<string[]> {
  const r = await lookup(host, { all: true, verbatim: true });
  return r.map((a) => a.address);
}

export function createEgressProxy(opts: ProxyOptions): Server {
  const resolve = opts.resolve ?? defaultResolve;
  const maxConn = opts.maxConnections ?? 512;
  const idle = opts.idleTimeoutMs ?? 300_000;
  let active = 0;

  async function decide(rawHost: string, port: number): Promise<Decision> {
    const host = normalizeHost(rawHost);
    if (!host || !Number.isInteger(port) || port <= 0 || port > 65535)
      return { ok: false, why: 'bad_target', host: rawHost.slice(0, 100), port };
    const rule = matchRule(opts.getRules(), host, port);
    if (!rule) return { ok: false, why: 'not_allowlisted', host, port };
    let ips: string[];
    try {
      ips = isIP(host) ? [host] : await resolve(host);
    } catch {
      return { ok: false, why: 'dns_failed', host, port };
    }
    const allowPrivate = rule.allowPrivate && opts.allowPrivateHonored;
    if (ips.length === 0) return { ok: false, why: 'dns_failed', host, port };
    // MỘT địa chỉ nội mạng cũng đủ chặn (không chọn địa chỉ "đẹp" để lách)
    if (!allowPrivate && ips.some(isPrivateAddress)) return { ok: false, why: 'private_address', host, port };
    return { ok: true, ip: ips[0] as string, port, host };
  }

  function learnOrBlock(d: Decision & { ok: false }): boolean {
    if (opts.learnMode && d.why === 'not_allowlisted') {
      opts.log.log('warn', 'learn', { host: d.host, port: d.port });
      return true;
    }
    return false;
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const started = Date.now();
    const src = req.socket.remoteAddress ?? null;
    let target: URL;
    try {
      target = new URL(req.url ?? '');
    } catch {
      res.writeHead(400, { [BLOCK_HEADER]: BLOCK_VALUE }).end();
      return;
    }
    if (target.protocol !== 'http:' || target.username || target.password) {
      res.writeHead(400, { [BLOCK_HEADER]: BLOCK_VALUE }).end();
      return;
    }
    const port = Number(target.port || 80);
    let d = await decide(target.hostname, port);
    if (!d.ok && learnOrBlock(d)) {
      try {
        const ips = await resolve(d.host);
        d = { ok: true, ip: ips[0] as string, port, host: d.host };
      } catch {
        // giữ quyết định chặn
      }
    }
    if (!d.ok) {
      opts.log.log('info', 'deny', { src, host: d.host, port, why: d.why, method: 'http' });
      res.writeHead(403, { [BLOCK_HEADER]: BLOCK_VALUE, 'content-type': 'application/json' });
      res.end('{"error":"domain_blocked","message":"Blocked by egress policy"}');
      return;
    }
    const headers: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      const lk = k.toLowerCase();
      if (
        v === undefined ||
        ['proxy-authorization', 'proxy-connection', 'connection', 'keep-alive', 'te', 'trailer', 'upgrade'].includes(lk)
      )
        continue;
      headers[k] = v;
    }
    headers.host = target.host;
    const ok = d;
    const up = httpRequest(
      {
        host: ok.ip,
        port: ok.port,
        method: req.method,
        path: `${target.pathname}${target.search}`,
        headers,
        timeout: idle,
      },
      (ur) => {
        res.writeHead(ur.statusCode ?? 502, ur.headers);
        let bytes = 0;
        ur.on('data', (c: Buffer) => {
          bytes += c.length;
        });
        ur.on('end', () =>
          opts.log.log('info', 'allow', {
            src,
            host: ok.host,
            port: ok.port,
            method: 'http',
            status: ur.statusCode ?? 0,
            bytes,
            ms: Date.now() - started,
          }),
        );
        ur.pipe(res);
      },
    );
    up.on('timeout', () => up.destroy());
    up.on('error', () => {
      if (!res.headersSent) res.writeHead(502).end();
      else res.destroy();
    });
    req.pipe(up);
  });

  server.on('connect', async (req: IncomingMessage, client: Duplex, head: Buffer) => {
    const started = Date.now();
    const src = req.socket.remoteAddress ?? null;
    if (active >= maxConn) {
      client.end(`HTTP/1.1 503 Service Unavailable\r\n${BLOCK_HEADER}: busy\r\ncontent-length: 0\r\n\r\n`);
      return;
    }
    active++;
    client.on('close', () => {
      active--;
    });
    client.on('error', () => client.destroy());
    const m = /^(\[[0-9a-fA-F:.]{2,45}\]|[^:\s/]{1,253}):([0-9]{1,5})$/.exec(req.url ?? '');
    let d: Decision = m
      ? await decide(m[1] as string, Number(m[2]))
      : { ok: false, why: 'bad_target', host: '?', port: 0 };
    if (!d.ok && learnOrBlock(d)) {
      try {
        const ips = await resolve(d.host);
        d = { ok: true, ip: ips[0] as string, port: d.port, host: d.host };
      } catch {
        // giữ quyết định chặn
      }
    }
    if (!d.ok) {
      opts.log.log('info', 'deny', { src, host: d.host, port: d.port, why: d.why, method: 'connect' });
      client.end(`HTTP/1.1 403 Forbidden\r\n${BLOCK_HEADER}: ${BLOCK_VALUE}\r\ncontent-length: 0\r\n\r\n`);
      return;
    }
    const ok = d;
    const upstream: Socket = connect(ok.port, ok.ip);
    let up = 0;
    let down = 0;
    upstream.setTimeout(idle, () => upstream.destroy());
    client.on('data', (c: Buffer) => {
      up += c.length;
    });
    upstream.on('data', (c: Buffer) => {
      down += c.length;
    });
    upstream.once('connect', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on('error', () => {
      if (client.writable) client.end('HTTP/1.1 502 Bad Gateway\r\ncontent-length: 0\r\n\r\n');
      client.destroy();
    });
    upstream.on('close', () => {
      client.destroy();
      opts.log.log('info', 'allow', {
        src,
        host: ok.host,
        port: ok.port,
        method: 'connect',
        up,
        down,
        ms: Date.now() - started,
      });
    });
    client.on('close', () => upstream.destroy());
  });

  server.headersTimeout = 15_000;
  server.requestTimeout = 0;
  return server;
}
