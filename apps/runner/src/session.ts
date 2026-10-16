import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { type AuthAllowlist, type AuthGcResult, authDirOf, authGc, validateAllowlist } from './auth-gc.ts';
import { checkEnvName } from './env.ts';
import { mkdirInside, writeNewFileInside } from './fsutil.ts';
import { type HomeLink, linkAllowlist, syncBack } from './home.ts';
import { cliPath, type RunnerRoots } from './paths.ts';

// Thư mục tmpfs của một lần chạy CLI (lượt hoặc probe): /run/ga/<tên>/{ticket, <tệp plan>, home/, tmp/}.
// allowlist biết ⇒ HOME = tmpfs (trạng thái native bị xoá sau lượt), credential nối từng tệp từ /auth/<en>.
// allowlist 'unknown' ⇒ không biết tệp nào là credential ⇒ HOME = /auth/<en> (cách duy nhất CLI chạy được), không xoá gì,
// nativeMemory = 'unknown' để app báo owner (DATABASE D18). [Quyết định M1 của L-RT — Gen duyệt]

export interface Session {
  dir: string;
  home: string;
  tmp: string;
  authDir: string;
  /** HOME đưa cho CLI. */
  cliHome: string;
  links: HomeLink[];
  allowlist: AuthAllowlist;
  account: string;
}

export interface SessionFile {
  path: string;
  content: string;
  mode: number;
}

/** Tạo thư mục MỚI (không được tồn tại trước) cho lần chạy. */
export function createSessionDir(roots: RunnerRoots, name: string): string {
  const dir = join(roots.run, name);
  mkdirSync(dir, { mode: 0o700 });
  return dir;
}

export function prepareSession(
  roots: RunnerRoots,
  dir: string,
  account: string,
  allowlist: AuthAllowlist,
  files: readonly SessionFile[],
): Session {
  validateAllowlist(allowlist);
  const authDir = authDirOf(roots, account);
  // tệp plan ghi TRƯỚC khi nối credential ⇒ plan không thể ghi xuyên symlink vào /auth (O_EXCL | O_NOFOLLOW)
  for (const f of files) writeNewFileInside(dir, f.path, f.content, f.mode);
  const home = mkdirInside(dir, 'home');
  const tmp = mkdirInside(dir, 'tmp');
  if (allowlist === 'unknown') {
    return { dir, home, tmp, authDir, cliHome: authDir, links: [], allowlist, account };
  }
  const links = linkAllowlist(home, authDir, allowlist);
  return { dir, home, tmp, authDir, cliHome: home, links, allowlist, account };
}

const PASS_THROUGH = ['HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy', 'TZ', 'LANG'];

/** Env của tiến trình CLI: chỉ biến cơ bản + proxy của container + `extra` (đã kiểm tên). Không mang biến GA_*. */
export function buildCliEnv(
  roots: RunnerRoots,
  slug: string,
  cliHome: string,
  tmp: string,
  parentEnv: NodeJS.ProcessEnv,
  extra: Record<string, string>,
): Record<string, string> {
  const env: Record<string, string> = { LANG: 'C.UTF-8' };
  for (const k of PASS_THROUGH) {
    const v = parentEnv[k];
    if (typeof v === 'string') env[k] = v;
  }
  for (const [k, v] of Object.entries(extra)) {
    checkEnvName(k);
    env[k] = v;
  }
  env.PATH = cliPath(roots, slug);
  env.HOME = cliHome;
  env.TMPDIR = tmp;
  return env;
}

/** Env của tiến trình cha (exec env) đã lọc theo luật tên — dùng cho probe (plan env đi qua env của exec). */
export function filteredParentEnv(parentEnv: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parentEnv)) {
    if (typeof v !== 'string' || PASS_THROUGH.includes(k)) continue;
    try {
      checkEnvName(k);
    } catch {
      continue;
    }
    if (k === 'HOSTNAME' || k === 'NODE_VERSION' || k === 'YARN_VERSION') continue;
    out[k] = v;
  }
  return out;
}

export interface SessionEnd {
  syncedBack: number;
  gc: AuthGcResult;
}

/** Chép ngược credential bị thay, xoá cả thư mục tmpfs (vé, HOME native), rồi auth-gc. */
export function finishSession(roots: RunnerRoots, s: Session): SessionEnd {
  let syncedBack = 0;
  try {
    syncedBack = syncBack(s.authDir, s.links);
  } finally {
    rmSync(s.dir, { recursive: true, force: true });
  }
  const gc = authGc(roots, s.account, s.allowlist);
  return { syncedBack, gc };
}
