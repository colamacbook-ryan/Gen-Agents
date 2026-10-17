import { defineConfig } from 'vitest/config';

// chạy riêng gói: pnpm --filter @ga/ui test [-- <bộ lọc tên tệp>]
// Test component dùng `// @vitest-environment happy-dom` ở đầu tệp (để `pnpm test` gốc cũng chạy được: cấu hình gốc không có môi
// trường DOM). Test Chromium thật (test/browser/*) chạy ở môi trường node và tự khởi trình duyệt qua playwright-core.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
