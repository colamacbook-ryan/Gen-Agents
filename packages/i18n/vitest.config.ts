import { defineConfig } from 'vitest/config';

// chạy riêng gói: pnpm --filter @ga/i18n test [-- <bộ lọc tên tệp>]
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
