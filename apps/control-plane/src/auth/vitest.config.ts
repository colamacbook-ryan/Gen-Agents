import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Module auth/ của control plane chưa có package.json riêng (khung apps/control-plane thuộc L0 / INT): test chạy bằng
// `npx vitest run --config apps/control-plane/src/auth/vitest.config.ts`, gói @ga/* trỏ thẳng tới nguồn trong packages/.
// Khi INT dựng apps/control-plane/package.json (+ "@ga/security", "@ga/db", "@ga/contracts": workspace:*), bỏ alias này.
const src = (pkg: string) => fileURLToPath(new URL(`../../../../packages/${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: {
    alias: { '@ga/security': src('security'), '@ga/db': src('db'), '@ga/contracts': src('contracts') },
  },
  test: { include: ['test/**/*.test.ts'], testTimeout: 60_000, hookTimeout: 60_000 },
});
