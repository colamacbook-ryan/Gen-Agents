// Dev server, bản build và preview của apps/web dựng bằng API của Vite, dùng đúng vite.config.ts (header CSP chặt đi cùng cấu hình).
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer as createHttpServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, createServer, preview } from 'vite';
import { CSP_VALUE } from '../../csp.ts';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONFIG = join(WEB, 'vite.config.ts');

export interface Started {
  url: string;
  origin: string;
  close(): Promise<void>;
}

const originOf = (url: string): string => new URL(url).origin;

export async function startDevServer(): Promise<Started> {
  const server = await createServer({
    configFile: CONFIG,
    root: WEB,
    logLevel: 'error',
    server: { port: 0, strictPort: false, host: '127.0.0.1' },
  });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('dev server không có URL');
  return { url, origin: originOf(url), close: () => server.close() };
}

/**
 * Build sản phẩm vào thư mục tạm. Mặc định bật bộ component (VITE_GA_UIKIT=1) để test dùng; bản phát hành thật KHÔNG có chunk này.
 * `defines` ghi đè hoàn toàn bộ cờ (vd `{ 'import.meta.env.VITE_GA_FAKE': '"1"' }` cho backend giả, `{}` cho bản phát hành).
 */
export async function buildForTest(
  defines: Record<string, string> = { 'import.meta.env.VITE_GA_UIKIT': JSON.stringify('1') },
): Promise<{ outDir: string; cleanup(): void }> {
  const outDir = mkdtempSync(join(tmpdir(), 'ga-web-'));
  await build({
    configFile: CONFIG,
    root: WEB,
    logLevel: 'warn',
    define: defines,
    build: { outDir, emptyOutDir: true },
  });
  return { outDir, cleanup: () => rmSync(outDir, { recursive: true, force: true }) };
}

export async function startPreview(outDir: string): Promise<Started> {
  const server = await preview({
    configFile: CONFIG,
    root: WEB,
    logLevel: 'error',
    build: { outDir },
    preview: { port: 0, strictPort: false, host: '127.0.0.1' },
  });
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('preview không có URL');
  return { url, origin: originOf(url), close: () => server.close() };
}

/** Trang mồi: cùng CSP nhưng CÓ <style> và style="" nội tuyến + script nội tuyến — dùng để chứng minh bộ bắt vi phạm còn sống. */
export async function startBaitServer(): Promise<Started> {
  const html = `<!doctype html><html><head><style>body{color:red}</style></head><body style="margin:0"><p id="p">bait</p><script>window.__inline = 1</script></body></html>`;
  const server: Server = createHttpServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': CSP_VALUE });
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('bait server không có cổng');
  const url = `http://127.0.0.1:${addr.port}/`;
  return {
    url,
    origin: originOf(url),
    close: () => new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}
