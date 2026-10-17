import { defineConfig } from 'vitest/config';

// chạy riêng gói: pnpm --filter <gói> test [-- <bộ lọc tên tệp>]
// fileParallelism: false — test hiệu năng bộ quét (1 MB < 50 ms) không chạy cùng lúc với test argon2id (băm 46 MiB song song).
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
