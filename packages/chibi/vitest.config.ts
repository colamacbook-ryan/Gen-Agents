import { defineConfig } from 'vitest/config';

// chạy riêng gói: pnpm --filter @ga/chibi test [-- <bộ lọc tên tệp>]
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
