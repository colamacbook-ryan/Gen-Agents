// Máy chủ tĩnh tối thiểu cho test trình duyệt: phục vụ trang thử (test/browser/*.html) + bundle trong bộ nhớ (/bundle/*).
// Chỉ lắng nghe 127.0.0.1, cổng ngẫu nhiên, chỉ đọc; tên tệp đi qua whitelist (không ghép đường dẫn từ URL).
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Bundle } from './bundle.ts';

const BROWSER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'browser');

/** CSP chặt dùng trong test: không 'unsafe-inline' cho style, không script nội tuyến */
export const STRICT_CSP = "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:";

export interface TestServer {
  url: string;
  close(): Promise<void>;
}

const PAGE_RE = /^\/([a-z][a-z0-9-]{0,40})\.html$/;
const BUNDLE_RE = /^\/bundle\/([A-Za-z0-9_.-]{1,80})$/;

export async function startServer(files: Bundle): Promise<TestServer> {
  const server: Server = createServer(async (req, res) => {
    try {
      const u = new URL(req.url ?? '/', 'http://x');
      const headers: Record<string, string> = { 'cache-control': 'no-store' };
      const page = PAGE_RE.exec(u.pathname);
      if (page) {
        const html = await readFile(join(BROWSER_DIR, `${page[1]}.html`), 'utf8');
        headers['content-type'] = 'text/html; charset=utf-8';
        // ?csp=off chỉ dành cho ca âm (chứng minh bộ bắt vi phạm còn sống); mặc định LUÔN gửi CSP chặt
        if (u.searchParams.get('csp') !== 'off') headers['content-security-policy'] = STRICT_CSP;
        res.writeHead(200, headers).end(html);
        return;
      }
      const name = BUNDLE_RE.exec(u.pathname)?.[1];
      const body = name === undefined ? undefined : files.get(name);
      if (name === undefined || body === undefined) {
        res.writeHead(404).end('not found');
        return;
      }
      headers['content-type'] = name.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'application/octet-stream';
      res.writeHead(200, headers).end(body);
    } catch (e) {
      res.writeHead(500).end(String((e as Error).message));
    }
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('không lấy được cổng');
  return {
    url: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise<void>((ok, bad) => server.close((e) => (e ? bad(e) : ok()))),
  };
}
