import { chmodSync, constants, copyFileSync, renameSync, symlinkSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { lstatOrNull, mkdirInside } from './fsutil.ts';
import { RunnerError } from './paths.ts';

// HOME native của mỗi lượt nằm ở tmpfs /run/ga/<lượt>/home (CNS-132). Tệp credential trong allowlist được NỐI vào HOME
// bằng symlink TỪNG TỆP (không nối cả thư mục, để transcript / trạng thái native không lọt vào /auth).
// Quyết định M1 (BUILD-PLAN §B.5 bước 4 "symlink hay biến môi trường — chọn ở M1 bằng IT"): symlink từng tệp + chép ngược.
// Rủi ro R10: CLI xoay refresh token bằng rename nguyên tử ⇒ symlink bị thay bằng tệp thường trong tmpfs ⇒ token mới sẽ mất
// khi xoá tmpfs. Giảm thiểu: sau lượt, mục allowlist nào đã thành tệp thường được CHÉP NGƯỢC về /auth (nguyên tử, 0600).
// ga-runner không parse / log nội dung credential; chép bằng copyFile của kernel. Hành vi CLI thật: kiểm ở M6 (Spike 1c).

export interface HomeLink {
  rel: string;
  linkPath: string;
  target: string;
}

/** Tạo symlink HOME/<rel> → /auth/<en>/<rel> cho từng tệp allowlist. Mục đã tồn tại trong HOME (vd tệp của plan) ⇒ lỗi. */
export function linkAllowlist(home: string, authDir: string, allowlist: readonly string[]): HomeLink[] {
  const links: HomeLink[] = [];
  for (const rel of allowlist) {
    const parent = dirname(rel);
    if (parent !== '.') mkdirInside(home, parent);
    const linkPath = join(home, rel);
    if (lstatOrNull(linkPath) !== null) {
      throw new RunnerError('plan_conflicts_auth', 'tệp của plan trùng đường với tệp credential trong allowlist');
    }
    const target = join(authDir, rel);
    symlinkSync(target, linkPath);
    links.push({ rel, linkPath, target });
  }
  return links;
}

const MAX_SYNC_BYTES = 1024 * 1024;

/** Chép ngược các mục allowlist mà CLI đã thay symlink bằng tệp thường. Trả số tệp đã chép. */
export function syncBack(authDir: string, links: readonly HomeLink[]): number {
  let synced = 0;
  for (const l of links) {
    const st = lstatOrNull(l.linkPath);
    if (st === null) continue; // CLI xoá mục (vd đăng xuất): không đụng /auth
    // vẫn là symlink (của ta ⇒ ghi đã đi thẳng vào /auth; của CLI ⇒ không đi theo): không chép
    if (st.isSymbolicLink()) continue;
    if (!st.isFile() || st.size > MAX_SYNC_BYTES) continue;
    const parent = dirname(l.rel);
    const destDir = parent === '.' ? authDir : mkdirInside(authDir, parent);
    const tmp = join(destDir, `.ga-sync-${process.pid}-${Math.random().toString(36).slice(2)}`);
    copyFileSync(l.linkPath, tmp, constants.COPYFILE_EXCL);
    try {
      chmodSync(tmp, 0o600);
      renameSync(tmp, l.target);
    } catch (e) {
      try {
        unlinkSync(tmp);
      } catch {
        // tệp tạm đã không còn
      }
      throw e;
    }
    synced++;
  }
  return synced;
}
