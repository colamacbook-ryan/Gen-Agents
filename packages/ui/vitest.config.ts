import { defineConfig } from 'vitest/config';

// chạy riêng gói: pnpm --filter @ga/ui test [-- <bộ lọc tên tệp>]
// Test component dùng `// @vitest-environment jsdom` ở đầu tệp (để `pnpm test` gốc cũng chạy được: cấu hình gốc không có môi trường DOM).
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
