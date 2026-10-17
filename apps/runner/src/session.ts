import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { EngineFlagTable } from '@ga/contracts';
import { type AuthAllowlist, type AuthGcResult, authDirOf, authGc, validateAllowlist } from './auth-gc.ts';
import { assertPlanEnv } from './env.ts';
import { mkdirInside, writeNewFileInside } from './fsutil.ts';
import { type HomeLink, linkAllowlist, syncBack } from './home.ts';
import { cliPath, type RunnerRoots } from './paths.ts';

// Thư mục tmpfs của một lần chạy CLI (lượt hoặc probe): /run/ga/<tên>/{ticket, <tệp plan>, home/, tmp/}.
// allowlist biết ⇒ HOME = tmpfs (trạng thái native bị xoá sau lượt), credential nối từng tệp từ /auth/<en>.
// allowlist 'unknown' (GEN-04, Gen quyết) ⇒ KHÔNG nối credential nào (fail-closed): HOME = tmpfs trống, CLI chạy như chưa
// đăng nhập; auth-gc không xoá gì; báo nativeMemory = 'unknown' (DATABASE D18). Riêng PTY đăng nhập (`login`) với allowlist
// 'unknown': HOME = /auth/<en> — cách DUY NHẤT để credential chính chủ được ghi vào volume (đề xuất L-RT, Gen duyệt).

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
  opts: { unknownAllowlistHome?: 'tmpfs' | 'auth' } = {},
): Session {
  validateAllowlist(allowlist);
  const authDir = authDirOf(roots, account);
  // tệp plan ghi TRƯỚC khi nối credential ⇒ plan không thể ghi xuyên symlink vào /auth (O_EXCL | O_NOFOLLOW)
  for (const f of files) writeNewFileInside(dir, f.path, f.content, f.mode);
  const home = mkdirInside(dir, 'home');
  const tmp = mkdirInside(dir, 'tmp');
  if (allowlist === 'unknown') {
    const cliHome = opts.unknownAllowlistHome === 'auth' ? authDir : home;
    return { dir, home, tmp, authDir, cliHome, links: [], allowlist, account };
  }
  const links = linkAllowlist(home, authDir, allowlist);
  return { dir, home, tmp, authDir, cliHome: home, links, allowlist, account };
}

/** Proxy do supervisor đặt trong env của CONTAINER (ga-egress) — runner chuyển cho CLI; plan không đặt được (*_PROXY bị chặn). */
const CONTAINER_PROXY_VARS = ['HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy'];

/**
 * Env của tiến trình CLI = biến cơ bản (LANG) + proxy của container + env của plan đã kiểm theo bảng ĐÓNG của adapter
 * (`assertPlanEnv` = contracts engineEnvViolations: allowlist + chặn cứng) + PATH / HOME / TMPDIR do runner đặt. Không mang biến GA_*, không kế thừa env
 * khác của tiến trình cha.
 */
export function buildCliEnv(
  roots: RunnerRoots,
  slug: string,
  cliHome: string,
  tmp: string,
  containerEnv: NodeJS.ProcessEnv,
  planEnv: Readonly<Record<string, string>>,
  table: EngineFlagTable,
): Record<string, string> {
  const env: Record<string, string> = { LANG: 'C.UTF-8' };
  for (const k of CONTAINER_PROXY_VARS) {
    const v = containerEnv[k];
    if (typeof v === 'string' && /^[A-Za-z0-9.:/,_-]{1,512}$/.test(v)) env[k] = v;
  }
  Object.assign(env, assertPlanEnv(planEnv, table));
  env.PATH = cliPath(roots, slug);
  env.HOME = cliHome;
  env.TMPDIR = tmp;
  return env;
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
