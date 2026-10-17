// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
import { defineConfig } from 'vitest/config';

// chạy riêng gói: pnpm --filter @ga/fakes test [-- <bộ lọc tên tệp>]
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
