import { closeSync, constants, fsyncSync, lstatSync, mkdirSync, openSync, renameSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { RunnerError } from './paths.ts';

// Thao tác tệp KHÔNG đi theo symlink: mọi thư mục cha phải là thư mục thật nằm trong `base` (chống ghi xuyên symlink ra
// /auth hay ra ngoài tmpfs của lượt).

function lstatOrNull(p: string) {
  try {
    return lstatSync(p);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

/** mkdir -p cho `rel` dưới `base`; đoạn nào đã tồn tại phải là thư mục thật (không symlink). */
export function mkdirInside(base: string, rel: string, mode = 0o700): string {
  let cur = base;
  for (const seg of rel.split('/').filter(Boolean)) {
    cur = join(cur, seg);
    const st = lstatOrNull(cur);
    if (st === null) mkdirSync(cur, { mode });
    else if (!st.isDirectory() || st.isSymbolicLink()) {
      throw new RunnerError('unsafe_path', 'đường dẫn đi qua một mục không phải thư mục thật');
    }
  }
  return cur;
}

/** Ghi tệp mới (O_EXCL | O_NOFOLLOW): không ghi đè, không đi theo symlink. Thư mục cha được tạo an toàn trong `base`. */
export function writeNewFileInside(base: string, rel: string, content: string | Uint8Array, mode: number): string {
  const parent = dirname(rel);
  if (parent !== '.') mkdirInside(base, parent);
  const abs = join(base, rel);
  const fd = openSync(abs, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode);
  try {
    const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
    let off = 0;
    while (off < buf.length) off += writeSync(fd, buf, off, buf.length - off);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  return abs;
}

/** Ghi nguyên tử (tệp tạm cùng thư mục + rename). Thư mục đích phải là thư mục thật. */
export function writeFileAtomic(absPath: string, content: string | Uint8Array, mode: number): void {
  const dir = dirname(absPath);
  const st = lstatOrNull(dir);
  if (st === null || !st.isDirectory() || st.isSymbolicLink()) {
    throw new RunnerError('unsafe_path', 'thư mục đích không phải thư mục thật');
  }
  const tmp = join(dir, `.ga-tmp-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
  const fd = openSync(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode);
  try {
    const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
    let off = 0;
    while (off < buf.length) off += writeSync(fd, buf, off, buf.length - off);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, absPath);
}

export { lstatOrNull };
