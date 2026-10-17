// tsconfig.json gốc phải tham chiếu mọi project TS của workspace (bài học: apps/* không được typecheck mà merge vẫn xanh).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatTsconfig, referencedProjects, workspaceProjects } from '../tsconfig-refs.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SCRIPT = fileURLToPath(new URL('../tsconfig-refs.mjs', import.meta.url));

describe('tsconfig-refs', () => {
  it('repo hiện tại: tham chiếu đúng bằng tập project workspace có tsconfig.json', () => {
    expect(referencedProjects(ROOT)).toEqual(workspaceProjects(ROOT));
  });

  it('thiếu project (vd apps/runner) ⇒ --check đỏ; --write sửa; project không có tsconfig / ngoài workspace không tính', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ga-tsrefs-'));
    try {
      writeFileSync(
        join(dir, 'pnpm-workspace.yaml'),
        'packages:\n  - packages/*\n  - apps/*\n  - testing/fakes\n\nx: 1\n',
      );
      for (const p of ['packages/contracts', 'apps/runner', 'apps/supervisor', 'testing/fakes', 'testing/it']) {
        mkdirSync(join(dir, p), { recursive: true });
        writeFileSync(join(dir, p, 'tsconfig.json'), '{}\n');
      }
      mkdirSync(join(dir, 'apps', 'web-no-ts'), { recursive: true });
      writeFileSync(
        join(dir, 'tsconfig.json'),
        formatTsconfig({ files: [], references: [{ path: 'packages/contracts' }] }),
      );
      const run = (flag) => {
        try {
          return { code: 0, out: execFileSync(process.execPath, [SCRIPT, flag, '--root', dir], { encoding: 'utf8' }) };
        } catch (e) {
          return { code: e.status, out: String(e.stdout) };
        }
      };
      const bad = run('--check');
      expect(bad.code).toBe(1);
      expect(bad.out).toContain('thiếu apps/runner');
      expect(bad.out).toContain('thiếu testing/fakes');
      expect(bad.out).not.toContain('testing/it');
      expect(bad.out).not.toContain('web-no-ts');
      expect(run('--write').code).toBe(0);
      expect(run('--check').code).toBe(0);
      expect(JSON.parse(readFileSync(join(dir, 'tsconfig.json'), 'utf8')).references).toEqual([
        { path: 'apps/runner' },
        { path: 'apps/supervisor' },
        { path: 'packages/contracts' },
        { path: 'testing/fakes' },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
