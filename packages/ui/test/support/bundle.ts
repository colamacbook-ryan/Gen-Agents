// Đóng gói trang thử (harness.tsx: React + DataGrid) bằng Vite TRONG BỘ NHỚ (write: false) — không ghi tệp tạm, không bundler ngoài.
// Kết quả là bản build production thật: <script type="module" src> cùng origin, không có script / style nội tuyến ⇒ chạy được dưới
// CSP chặt. React bản development để cảnh báo của React hiện thành lỗi console (test đếm lỗi console = 0).
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Rolldown } from 'vite';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export type Bundle = Map<string, string | Uint8Array>;

/** build `test/browser/<entry>.tsx` → Map tên tệp → nội dung (entry luôn ra `<entry>.js`) */
export async function bundle(entry: string): Promise<Bundle> {
  const out = await build({
    configFile: false,
    root: PKG,
    logLevel: 'silent',
    mode: 'development',
    define: { 'process.env.NODE_ENV': JSON.stringify('development') },
    oxc: { jsx: { runtime: 'automatic', development: false } },
    build: {
      write: false,
      minify: false,
      sourcemap: false,
      modulePreload: false,
      emptyOutDir: false,
      reportCompressedSize: false,
      rollupOptions: {
        input: join(PKG, 'test', 'browser', `${entry}.tsx`),
        output: { format: 'es', entryFileNames: '[name].js', chunkFileNames: '[name]-[hash].js' },
      },
    },
  });
  const results = (Array.isArray(out) ? out : [out]) as Rolldown.RolldownOutput[];
  const files: Bundle = new Map();
  for (const r of results) {
    for (const item of r.output) {
      files.set(item.fileName, item.type === 'chunk' ? item.code : item.source);
    }
  }
  if (!files.has(`${entry}.js`)) throw new Error(`build không ra ${entry}.js (có: ${[...files.keys()].join(', ')})`);
  return files;
}
