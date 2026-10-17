import { defineConfig } from 'vitest/config';

// chạy riêng gói: pnpm --filter @ga/web test [-- <bộ lọc tên tệp>]
// Test component dùng `// @vitest-environment jsdom` ở đầu tệp; test Chromium (test/browser) chạy môi trường node.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
