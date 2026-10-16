// Máy chủ tĩnh tối thiểu cho test trình duyệt: phục vụ src/*.ts (bỏ kiểu bằng Node, không bundler), contracts, zod, skins.
// Chỉ lắng nghe 127.0.0.1, cổng ngẫu nhiên, chỉ đọc; đường dẫn đi qua whitelist thư mục gốc (chống ../).
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO = resolve(PKG, '..', '..');
const ZOD = dirname(createRequire(join(PKG, 'package.json')).resolve('zod/package.json'));

const ROOTS: Record<string, string> = {
  '/src/': join(PKG, 'src'),
  '/test/': join(PKG, 'test'),
  '/contracts/': join(REPO, 'packages', 'contracts', 'src'),
  '/zod/': ZOD,
  '/skins/': join(REPO, 'skins'),
};
const MIME: Record<string, string> = {
  '.ts': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

/** CSP chặt dùng trong test */
export const STRICT_CSP = "default-src 'self'; style-src 'self'";

/** thay bare specifier bằng đường dẫn tuyệt đối trên máy chủ này (không cần import map, tức không cần script nội tuyến) */
const rewriteBare = (code: string): string =>
  code
    .replace(/from (['"])zod\1/g, "from '/zod/index.js'")
    .replace(/from (['"])@ga\/contracts\1/g, "from '/contracts/index.ts'");

export interface TestServer {
  url: string;
  close(): Promise<void>;
}

export async function startServer(): Promise<TestServer> {
  const server: Server = createServer(async (req, res) => {
    try {
      const u = new URL(req.url ?? '/', 'http://x');
      const prefix = Object.keys(ROOTS).find((p) => u.pathname.startsWith(p));
      if (!prefix) {
        res.writeHead(404).end('not found');
        return;
      }
      const base = ROOTS[prefix] as string;
      const file = normalize(join(base, decodeURIComponent(u.pathname.slice(prefix.length))));
      if (file !== base && !file.startsWith(base + sep)) {
        res.writeHead(403).end('forbidden');
        return;
      }
      let body: string | Buffer = await readFile(file);
      const ext = extname(file);
      if (ext === '.ts') body = rewriteBare(stripTypeScriptTypes(body.toString('utf8'), { mode: 'strip' }));
      const headers: Record<string, string> = {
        'content-type': MIME[ext] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      };
      // ?csp=strict: trang tài liệu chạy dưới CSP chặt (không 'unsafe-inline' cho style, không script nội tuyến)
      if (ext === '.html' && u.searchParams.get('csp') === 'strict') headers['content-security-policy'] = STRICT_CSP;
      res.writeHead(200, headers).end(body);
    } catch (e) {
      res.writeHead(404).end(String((e as Error).message));
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
