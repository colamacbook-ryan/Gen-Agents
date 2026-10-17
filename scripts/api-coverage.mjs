#!/usr/bin/env node
// pnpm api:coverage — đồng hồ tiến độ API M2 (L-APP): số route có handler PRODUCTION / 201 theo lane + route đã mount mà
// CHƯA có seeder chống IDOR cho một trường Ref (meta-test chéo tenant sẽ đỏ ở đó).
//   node scripts/api-coverage.mjs            in báo cáo
//   node scripts/api-coverage.mjs --check    thêm: thiếu seeder ⇒ thoát 1
// Độ phủ màn hình FRONTEND-SPEC → route (L-API) là contract test riêng: packages/contracts/test/api/coverage.test.ts.
// Nguồn: apps/control-plane/src/http/handlers.ts (PRODUCTION_HANDLERS) + @ga/testkit (registry seeder) — chạy bằng type
// stripping của Node 22 (không build).
const { PRODUCTION_HANDLERS } = await import('../apps/control-plane/src/http/handlers.ts');
const { coverageReport, formatCoverage } = await import('../packages/testkit/src/coverage.ts');

const report = coverageReport(PRODUCTION_HANDLERS.map((h) => h.route));
console.log(formatCoverage(report));
if (process.argv.includes('--check') && report.missingSeeders.length > 0) process.exitCode = 1;
