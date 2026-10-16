#!/usr/bin/env node
// CLI giả TỐI THIỂU cho unit test của ga-runner (không mang tên CLI thật — lint no-model-cli-names áp cho apps/).
// Hành vi theo argv[2]:
//   turn     ghi transcript native vào $HOME/.native/, xoay credential bằng rename (thay symlink), in env + quyền tệp vé, in canary
//   print    in nguyên văn các argv còn lại (mỗi cái một dòng)
//   sleep    ngủ mãi (kiểm timeout), bỏ qua SIGTERM
//   exit N   thoát với mã N
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [, , mode, ...rest] = process.argv;
const home = process.env.HOME;
const out = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);

if (mode === 'turn') {
  mkdirSync(join(home, '.native', 'projects'), { recursive: true });
  writeFileSync(join(home, '.native', 'projects', 'conv.jsonl'), '{"role":"user","text":"bí mật hội thoại"}\n');
  const cred = join(home, 'cred.json');
  const credBefore = existsSync(cred) ? readFileSync(cred, 'utf8') : null;
  // xoay token kiểu nguyên tử: ghi tệp tạm rồi rename đè lên đường credential (symlink bị thay bằng tệp thường)
  writeFileSync(join(home, 'cred.json.tmp'), '{"token":"rotated-v2"}');
  renameSync(join(home, 'cred.json.tmp'), cred);
  const ticketPath = join(process.cwd(), 'ticket');
  // ghi ra NGOÀI thư mục lượt (thư mục cha = /run/ga) để test đọc sau khi runner dọn; stdout có thể bị che cả dòng
  writeFileSync(
    join(process.cwd(), '..', 'env-dump.json'),
    JSON.stringify({
      names: Object.keys(process.env).sort(),
      values: Object.values(process.env),
      cwd: process.cwd(),
      ticketMode: existsSync(ticketPath) ? (statSync(ticketPath).mode & 0o777).toString(8) : null,
      credBefore,
    }),
  );
  out({ type: 'env' });
  out({ type: 'text', text: `canary GA-CANARY-${'0123abcd'}-ffff lọt?` });
  process.stderr.write('stderr line\n');
  process.exit(Number(rest[0] ?? 0));
} else if (mode === 'print') {
  for (const a of rest) out({ arg: a });
} else if (mode === 'sleep') {
  process.on('SIGTERM', () => {});
  setInterval(() => {}, 1000);
} else if (mode === 'exit') {
  process.exit(Number(rest[0] ?? 0));
} else {
  process.exit(2);
}
