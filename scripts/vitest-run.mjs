#!/usr/bin/env node
// `pnpm --filter <gói> test -- <bộ lọc>`: pnpm chuyển nguyên dấu `--` cho script, còn Vitest bỏ qua mọi thứ sau `--`.
// Wrapper này bỏ các `--` rồi chạy `vitest run <bộ lọc…>` trong thư mục gói hiện tại.
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2).filter((a) => a !== '--');
const r = spawnSync('vitest', ['run', ...args], { stdio: 'inherit' });
if (r.error) throw r.error;
process.exitCode = r.status ?? 1;
