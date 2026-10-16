import { createHash, type Hash } from 'node:crypto';
import { type ClientRequest, request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { Socket } from 'node:net';
import { connect as tlsConnect } from 'node:tls';

// GET qua ga-egress (proxy CONNECT cho https, absolute-form cho http) — container không có route ra Internet nên mọi lần tải
// PHẢI đi qua egress, và egress ép allowlist domain ở từng bước (kể cả mỗi lần redirect).
// Phân loại lỗi theo lý do cài của contracts (ENGINE_INSTALL_FAILURE_REASONS):
//   egress từ chối (403 + header x-ga-egress: denied) ⇒ domain_blocked · DNS / kết nối / timeout / 5xx ⇒ network.

export type FetchFailure = 'domain_blocked' | 'network' | 'http_status' | 'too_large' | 'bad_url';

export class FetchError extends Error {
  readonly kind: FetchFailure;
  readonly status: number | null;
  constructor(kind: FetchFailure, message: string, status: number | null = null) {
    super(message);
    this.name = 'FetchError';
    this.kind = kind;
    this.status = status;
  }
}

export const EGRESS_DENIED_HEADER = 'x-ga-egress';

export interface FetchOptions {
  proxy: URL | null;
  timeoutMs: number;
  maxBytes: number;
  /** Gọi mỗi khi có dữ liệu: số byte đã nhận, tổng (null nếu không có Content-Length). */
  onProgress?(received: number, total: number | null): void;
  /** Băm trong lúc tải (sha256 / sha512). */
  hash?: Hash;
  /** Nhận từng khúc (ghi ra tệp). */
  onChunk?(chunk: Buffer): void;
  maxRedirects?: number;
  /** Nguồn official: mọi bước (kể cả redirect) phải là https. */
  httpsOnly?: boolean;
}

function deniedByEgress(res: IncomingMessage): boolean {
  return res.statusCode === 403 && String(res.headers[EGRESS_DENIED_HEADER] ?? '').toLowerCase() === 'denied';
}

function netError(e: unknown): FetchError {
  if (e instanceof FetchError) return e;
  const code = (e as NodeJS.ErrnoException).code ?? 'lỗi';
  return new FetchError('network', `lỗi mạng (${code})`);
}

/** Mở kết nối tới đích: qua CONNECT (https có proxy), absolute-form (http có proxy), hoặc thẳng. */
function openRequest(u: URL, opts: FetchOptions, onResponse: (res: IncomingMessage) => void): Promise<ClientRequest> {
  const port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
  const common = {
    method: 'GET',
    timeout: opts.timeoutMs,
    headers: { 'user-agent': 'ga-engine-install', accept: '*/*' },
  };
  if (u.protocol === 'http:') {
    if (opts.proxy) {
      return Promise.resolve(
        httpRequest(
          {
            ...common,
            host: opts.proxy.hostname,
            port: Number(opts.proxy.port || 80),
            path: u.toString(),
            headers: { ...common.headers, host: u.host },
          },
          onResponse,
        ),
      );
    }
    return Promise.resolve(httpRequest(u, common, onResponse));
  }
  if (!opts.proxy) return Promise.resolve(httpsRequest(u, { ...common, agent: false }, onResponse));
  const proxy = opts.proxy;
  return new Promise((resolve, reject) => {
    const connectReq = httpRequest({
      host: proxy.hostname,
      port: Number(proxy.port || 80),
      method: 'CONNECT',
      path: `${u.hostname}:${port}`,
      headers: { host: `${u.hostname}:${port}` },
      timeout: opts.timeoutMs,
    });
    connectReq.on('connect', (res: IncomingMessage, socket: Socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        if (deniedByEgress(res)) reject(new FetchError('domain_blocked', `egress chặn ${u.hostname}`, 403));
        else reject(new FetchError('network', `proxy trả ${res.statusCode} cho CONNECT`, res.statusCode ?? null));
        return;
      }
      const req = httpsRequest(
        {
          ...common,
          host: u.hostname,
          port,
          path: `${u.pathname}${u.search}`,
          agent: false,
          createConnection: () => tlsConnect({ socket, servername: u.hostname, ALPNProtocols: ['http/1.1'] }),
        },
        onResponse,
      );
      resolve(req);
    });
    connectReq.on('timeout', () => connectReq.destroy(new FetchError('network', 'hết giờ kết nối proxy')));
    connectReq.on('error', (e) => reject(netError(e)));
    connectReq.end();
  });
}

/** GET `url`; theo redirect (≤ maxRedirects), trả status cuối cùng 2xx. Lỗi ⇒ FetchError đã phân loại. */
export async function fetchVia(url: string, opts: FetchOptions): Promise<{ status: number; bytes: number }> {
  let current: URL;
  try {
    current = new URL(url);
  } catch {
    throw new FetchError('bad_url', 'URL không hợp lệ');
  }
  const maxRedirects = opts.maxRedirects ?? 5;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (current.protocol !== 'https:' && current.protocol !== 'http:') throw new FetchError('bad_url', 'chỉ http(s)');
    if (opts.httpsOnly && current.protocol !== 'https:')
      throw new FetchError('bad_url', 'nguồn chính chủ phải là https');
    if (current.username || current.password) throw new FetchError('bad_url', 'URL chứa thông tin đăng nhập');
    const result = await new Promise<{ status: number; bytes: number; location: string | null }>((resolve, reject) => {
      let settled = false;
      const fail = (e: unknown) => {
        if (!settled) {
          settled = true;
          reject(netError(e));
        }
      };
      openRequest(current, opts, (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          settled = true;
          resolve({ status, bytes: 0, location: res.headers.location });
          return;
        }
        if (deniedByEgress(res)) {
          res.resume();
          return fail(new FetchError('domain_blocked', `egress chặn ${current.hostname}`, 403));
        }
        if (status >= 500) {
          res.resume();
          return fail(new FetchError('network', `máy chủ trả ${status}`, status));
        }
        if (status < 200 || status >= 300) {
          res.resume();
          return fail(new FetchError('http_status', `máy chủ trả ${status}`, status));
        }
        const lenHeader = Number(res.headers['content-length']);
        const total = Number.isFinite(lenHeader) && lenHeader >= 0 ? lenHeader : null;
        if (total !== null && total > opts.maxBytes) {
          res.destroy();
          return fail(new FetchError('too_large', 'tệp vượt trần kích thước'));
        }
        let bytes = 0;
        res.on('data', (c: Buffer) => {
          bytes += c.length;
          if (bytes > opts.maxBytes) {
            res.destroy();
            return fail(new FetchError('too_large', 'tệp vượt trần kích thước'));
          }
          opts.hash?.update(c);
          opts.onChunk?.(c);
          opts.onProgress?.(bytes, total);
        });
        res.on('end', () => {
          if (settled) return;
          if (total !== null && bytes !== total) return fail(new FetchError('network', 'tải thiếu dữ liệu'));
          settled = true;
          resolve({ status, bytes, location: null });
        });
        res.on('error', fail);
      })
        .then((req) => {
          req.on('timeout', () => req.destroy(new FetchError('network', 'hết giờ tải')));
          req.on('error', fail);
          req.end();
        })
        .catch(fail);
    });
    if (result.location === null) return { status: result.status, bytes: result.bytes };
    try {
      current = new URL(result.location, current);
    } catch {
      throw new FetchError('bad_url', 'redirect không hợp lệ');
    }
  }
  throw new FetchError('network', 'quá nhiều redirect');
}

export function newHash(algorithm: 'sha256' | 'sha512'): Hash {
  return createHash(algorithm);
}
