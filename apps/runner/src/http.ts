import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { RunnerError } from './paths.ts';

// GET nhỏ có trần kích thước + timeout, KHÔNG qua proxy (gateway nằm ngay trên mạng ga-roles).

export interface GetResult {
  status: number;
  body: string;
}

export function getText(
  url: string,
  headers: Record<string, string>,
  opts: { timeoutMs: number; maxBytes: number },
): Promise<GetResult> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return Promise.reject(new RunnerError('bad_url', 'URL không hợp lệ'));
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return Promise.reject(new RunnerError('bad_url', 'URL phải là http(s)'));
  }
  if (u.username || u.password)
    return Promise.reject(new RunnerError('bad_url', 'URL không được chứa thông tin đăng nhập'));
  const req = u.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const r = req(u, { method: 'GET', headers, timeout: opts.timeoutMs }, (res: IncomingMessage) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (c: Buffer) => {
        size += c.length;
        if (size > opts.maxBytes) {
          res.destroy();
          reject(new RunnerError('response_too_large', 'phản hồi quá lớn'));
          return;
        }
        chunks.push(c);
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', (e) =>
        reject(new RunnerError('network', `lỗi mạng: ${(e as NodeJS.ErrnoException).code ?? ''}`)),
      );
    });
    r.on('timeout', () => r.destroy(new RunnerError('timeout', 'hết thời gian chờ')));
    r.on('error', (e) =>
      reject(
        e instanceof RunnerError
          ? e
          : new RunnerError('network', `lỗi mạng: ${(e as NodeJS.ErrnoException).code ?? ''}`),
      ),
    );
    r.end();
  });
}
