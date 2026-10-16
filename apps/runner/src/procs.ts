import { readdirSync, readFileSync } from 'node:fs';

// Quét /proc (trong PID namespace của container) — không cần `ps`. Chỉ đọc environ / cmdline của tiến trình cùng uid.

function readProc(pid: number, file: 'environ' | 'cmdline', procRoot: string): string | null {
  try {
    return readFileSync(`${procRoot}/${pid}/${file}`, 'latin1');
  } catch {
    return null; // tiến trình đã thoát, hoặc khác uid
  }
}

export function listPids(procRoot = '/proc'): number[] {
  const out: number[] = [];
  for (const name of readdirSync(procRoot)) {
    if (/^[0-9]{1,10}$/.test(name)) out.push(Number(name));
  }
  return out;
}

/** PID có biến `name=value` đúng nguyên văn trong environ (ngăn cách bằng NUL). */
export function pidsWithEnv(name: string, value: string, procRoot = '/proc'): number[] {
  const needle = `${name}=${value}`;
  const self = process.pid;
  return listPids(procRoot).filter((pid) => {
    if (pid === self) return false;
    const env = readProc(pid, 'environ', procRoot);
    return env?.split('\0').includes(needle);
  });
}

export function cmdlineOf(pid: number, procRoot = '/proc'): string[] | null {
  const c = readProc(pid, 'cmdline', procRoot);
  return c === null ? null : c.split('\0').filter((s) => s.length > 0);
}

/** Tiến trình còn chạy (zombie chờ reap coi như đã chết). */
export function isAlive(pid: number, procRoot = '/proc'): boolean {
  try {
    process.kill(pid, 0);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EPERM') return false;
  }
  try {
    const stat = readFileSync(`${procRoot}/${pid}/stat`, 'latin1');
    const state = stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3);
    return state !== 'Z' && state !== 'X';
  } catch {
    return false;
  }
}
