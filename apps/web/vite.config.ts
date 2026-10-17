import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { cspHeaders } from './csp.ts';
import { cspSafeDevStyles } from './vite-csp-dev-styles.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Dev server và preview gửi CSP chặt như bản phát hành (csp.ts); test Chromium thật kiểm 0 vi phạm (test/browser/csp.test.ts).
//   - assetsInlineLimit: 0 → không nhúng tài nguyên thành data: URL (CSP `default-src 'self'` chặn data:)
//   - cspSafeDevStyles: client của Vite nạp CSS bằng thẻ <style> (bị style-src chặn) ⇒ dev dùng constructable stylesheet; hmr.overlay tắt vì lớp phủ lỗi cũng dựng <style>
//   - không dùng @vitejs/plugin-react: bản tiêm đoạn script nội tuyến (react-refresh preamble) vi phạm CSP; JSX do bộ biên dịch của Vite xử lý
//   - GA_API_ORIGIN: control plane (edge Caddy :7400 theo BUILD-PLAN §A.1) mà dev server chuyển tiếp /api tới
export default defineConfig({
  root,
  plugins: [cspSafeDevStyles()],
  define: {
    'import.meta.env.VITE_GA_VERSION': JSON.stringify(pkg.version),
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    headers: cspHeaders,
    hmr: { overlay: false },
    proxy: { '/api': { target: process.env.GA_API_ORIGIN ?? 'http://127.0.0.1:7400', changeOrigin: false } },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    headers: cspHeaders,
    proxy: { '/api': { target: process.env.GA_API_ORIGIN ?? 'http://127.0.0.1:7400', changeOrigin: false } },
  },
  build: {
    target: 'es2023',
    outDir: 'dist',
    assetsInlineLimit: 0,
    sourcemap: false,
    // gói chính ~570 kB (React + router + query + i18next + zod/contracts); màn nghiệp vụ M4 tách chunk theo tuyến
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        // zod phải được cấu hình jitless (src/bootstrap/zod.ts) TRƯỚC khi @ga/contracts dựng schema, nếu không zod dò `new Function` và CSP
        // báo vi phạm script-src. Khi tách chunk (màn lazy, trang dò), rolldown gom zod + contracts vào chunk dùng chung được nạp TRƯỚC chunk
        // chính chứa bootstrap ⇒ thứ tự đảo. Ép bootstrap vào CÙNG chunk với zod: ESM giữ thứ tự (zod → bootstrap) và mọi chunk dùng contracts
        // phụ thuộc chunk này nên chạy sau. test/browser/fake-api.test.ts (bản build có chunk lazy dùng contracts) giữ điều đó.
        codeSplitting: {
          groups: [
            {
              name: 'zod-jitless',
              test: /node_modules[\\/](?:\.pnpm[\\/])?zod|src[\\/]bootstrap[\\/]zod\.ts/,
              priority: 100,
            },
          ],
        },
      },
      // "use client" trong thư viện React là chỉ thị cho RSC, vô nghĩa ở SPA: bỏ cảnh báo ồn, giữ mọi cảnh báo khác
      onLog(level, log, handler) {
        if (log.code === 'MODULE_LEVEL_DIRECTIVE') return;
        handler(level, log);
      },
    },
  },
});
