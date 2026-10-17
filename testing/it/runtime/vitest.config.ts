import { defineConfig } from 'vitest/config';

// IT runtime (Docker thật) — KHÔNG chạy trong `pnpm test` (root chỉ gom packages/*, apps/*, scripts/test).
// Chạy: pnpm --filter @ga/supervisor test:it:runtime  (đề xuất INT thêm `pnpm test:it:runtime` ở package.json gốc).
export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ['**/*.it.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 600_000,
    fileParallelism: false,
    pool: 'forks',
  },
});
