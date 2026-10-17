#!/usr/bin/env node
// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
// Tạo trạng thái "đã đăng nhập" cho CLI giả không qua PTY (IT / E2E cần probe sau đăng nhập):
//   GA_FAKE_AUTH_DIR=/auth/en-0001 node seed-auth.ts <agy|claude> [account]
// In ra JSON {path, account, rotation}; KHÔNG in canary (canary chỉ nằm trong tệp credential).
import { seedCredentials } from './lib/creds.ts';

const [engine, account] = process.argv.slice(2);
if (engine !== 'agy' && engine !== 'claude') {
  process.stderr.write('dùng: seed-auth.ts <agy|claude> [account]\n');
  process.exit(2);
}
const c = seedCredentials(engine, process.env, account);
process.stdout.write(`${JSON.stringify({ path: c.path, account: c.account, rotation: c.rotation })}\n`);
