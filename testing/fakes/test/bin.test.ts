// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { FAKES_DIR } from './helpers.ts';

it('bin/agy và bin/claude có quyền thực thi và chạy được qua PATH (driver `local`)', () => {
  for (const [bin, want] of [
    ['agy', '1.3.5\n'],
    ['claude', '2.1.299 (Claude Code)\n'],
  ] as const) {
    expect(statSync(join(FAKES_DIR, 'bin', bin)).mode & 0o111).not.toBe(0);
    const env = { PATH: `${join(FAKES_DIR, 'bin')}:${process.env.PATH}`, HOME: FAKES_DIR };
    expect(spawnSync(bin, ['--version'], { encoding: 'utf8', env }).stdout).toBe(want);
  }
});
