// Đọc mã nguồn của @ga/ui + apps/web cho các test "bảo vệ" (guard) quét tĩnh.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
export const UI_SRC = join(REPO, 'packages', 'ui', 'src');
export const WEB_SRC = join(REPO, 'apps', 'web', 'src');
const SKIP = new Set(['node_modules', 'dist', 'fonts']);

export function listFiles(dir: string, pattern: RegExp): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...listFiles(abs, pattern));
    else if (pattern.test(name)) out.push(abs);
  }
  return out.sort();
}

export const rel = (abs: string): string => relative(REPO, abs).split(sep).join('/');
export const read = (abs: string): string => readFileSync(abs, 'utf8');
