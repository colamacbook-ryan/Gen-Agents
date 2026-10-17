import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { lstatOrNull } from './fsutil.ts';
import { isAccount, isSafeRelPath, RunnerError, type RunnerRoots } from './paths.ts';

// auth-gc (BUILD-PLAN §B.5 bước 8, CNS-132): /auth/<en> CHỈ giữ tệp trong authAllowlist của adapter.
// - Chỉ liệt kê TÊN và loại mục (lstat), không bao giờ đọc nội dung tệp, không đi theo symlink.
// - Mục trong allowlist phải là tệp thường; thư mục / symlink / FIFO trùng tên allowlist cũng bị xoá.
// - allowlist 'unknown' (adapter chưa khai, vd loại CLI chưa có Spike 1c) ⇒ KHÔNG xoá gì, nativeMemory = 'unknown' (DATABASE D18).

export interface AuthGcResult {
  removed: number;
  nativeMemory: 'off' | 'unknown';
}

export type AuthAllowlist = readonly string[] | 'unknown';

const MAX_ENTRIES = 200_000;

export function validateAllowlist(allowlist: AuthAllowlist): void {
  if (allowlist === 'unknown') return;
  if (allowlist.length > 64) throw new RunnerError('bad_allowlist', 'allowlist quá dài');
  for (const p of allowlist) {
    if (!isSafeRelPath(p)) throw new RunnerError('bad_allowlist', 'allowlist có đường không an toàn');
  }
}

export function authDirOf(roots: RunnerRoots, account: string): string {
  if (!isAccount(account)) throw new RunnerError('bad_account', 'mã tài khoản không hợp lệ');
  const dir = join(roots.auth, account);
  const st = lstatOrNull(dir);
  if (st === null || !st.isDirectory() || st.isSymbolicLink()) {
    throw new RunnerError('auth_dir_missing', 'thư mục credential của tài khoản không có trong container');
  }
  return dir;
}

export function authGc(roots: RunnerRoots, account: string, allowlist: AuthAllowlist): AuthGcResult {
  const authDir = authDirOf(roots, account);
  validateAllowlist(allowlist);
  if (allowlist === 'unknown') return { removed: 0, nativeMemory: 'unknown' };

  const keepFiles = new Set(allowlist);
  const keepDirs = new Set<string>();
  for (const p of allowlist) {
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i++) keepDirs.add(parts.slice(0, i).join('/'));
  }

  let removed = 0;
  let visited = 0;
  const stack: string[] = [''];
  while (stack.length > 0) {
    const relDir = stack.pop() as string;
    const absDir = relDir === '' ? authDir : join(authDir, relDir);
    for (const ent of readdirSync(absDir, { withFileTypes: true })) {
      if (++visited > MAX_ENTRIES) throw new RunnerError('too_many_entries', 'thư mục credential có quá nhiều mục');
      const rel = relDir === '' ? ent.name : `${relDir}/${ent.name}`;
      const abs = join(absDir, ent.name);
      if (keepFiles.has(rel) && ent.isFile()) continue;
      if (keepDirs.has(rel) && ent.isDirectory()) {
        stack.push(rel);
        continue;
      }
      // rmSync không đi theo symlink: xoá chính symlink, không xoá đích.
      rmSync(abs, { recursive: true, force: true });
      removed++;
    }
  }
  return { removed, nativeMemory: 'off' };
}
