// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
import http from 'node:http';
import https from 'node:https';
import type { AddressInfo } from 'node:net';

export interface HttpResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

const MAX_BODY = 4 * 1024 * 1024;

/** Proxy áp dụng cho URL (HTTP_PROXY / NO_PROXY), hoặc null. CLI thật trong container Role đi qua ga-egress. */
export function proxyFor(url: URL, env: NodeJS.ProcessEnv): URL | null {
  const raw = url.protocol === 'http:' ? (env.HTTP_PROXY ?? env.http_proxy) : (env.HTTPS_PROXY ?? env.https_proxy);
  if (!raw) return null;
  const no = (env.NO_PROXY ?? env.no_proxy ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const bypass = no.some(
    (p) => p === '*' || url.hostname === p || url.hostname.endsWith(p.startsWith('.') ? p : `.${p}`),
  );
  return bypass ? null : new URL(raw);
}

/** POST JSON, có proxy HTTP tuyệt đối-URI. HTTPS qua proxy (CONNECT) chưa hỗ trợ: fake vendor / gateway chạy HTTP. */
export function postJson(
  urlStr: string,
  payload: unknown,
  opts: { headers?: Record<string, string>; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<HttpResult> {
  const url = new URL(urlStr);
  const proxy = proxyFor(url, opts.env ?? process.env);
  if (proxy && url.protocol === 'https:') return Promise.reject(new Error('fake: HTTPS qua proxy chưa hỗ trợ'));
  const data = Buffer.from(JSON.stringify(payload));
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'content-length': String(data.length),
    ...opts.headers,
  };
  const target = proxy ?? url;
  const lib = target.protocol === 'https:' ? https : http;
  return new Promise<HttpResult>((resolve, reject) => {
    const req = lib.request(
      {
        host: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        method: 'POST',
        path: proxy ? url.href : `${url.pathname}${url.search}`,
        headers: proxy ? { ...headers, host: url.host } : headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > MAX_BODY) req.destroy(new Error('phản hồi quá lớn'));
          else chunks.push(c);
        });
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }),
        );
        res.on('error', reject);
      },
    );
    req.setTimeout(opts.timeoutMs ?? 120_000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(data);
  });
}

// ---------------------------------------------------------------- phía máy chủ
export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Đọc thân request, giới hạn kích thước (mặc định 1 MiB) — vượt ⇒ HttpError 413. */
export function readBody(req: http.IncomingMessage, limit = 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, 'body quá lớn'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), ...headers });
  res.end(data);
}

export interface Running {
  server: http.Server;
  url: string;
  port: number;
  close(): Promise<void>;
}

/** Mở máy chủ; `port: 0` ⇒ cổng ngẫu nhiên. close() cắt luôn kết nối đang treo (long-poll, hang). */
export function listen(server: http.Server, opts: { host?: string; port?: number } = {}): Promise<Running> {
  const host = opts.host ?? '127.0.0.1';
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? 0, host, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        server,
        port,
        url: `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`,
        close: () =>
          new Promise<void>((res) => {
            server.close(() => res());
            server.closeAllConnections();
          }),
      });
    });
  });
}
