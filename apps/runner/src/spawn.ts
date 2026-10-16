import { spawn } from 'node:child_process';
import { accessSync, constants, realpathSync, statSync } from 'node:fs';
import { basename, join, sep } from 'node:path';
import { lstatOrNull } from './fsutil.ts';
import { FIXED_ROOTS, FORBIDDEN_ARGV0, isCliBinName, isEngineSlug, RunnerError, type RunnerRoots } from './paths.ts';

// Chạy CLI không tương tác (STD-10 §4): stdin đóng, không TTY, timeout tường minh, nhóm tiến trình riêng để giết cả cây.
// Binary CLI CHỈ được nằm dưới /opt/engines/<engineSlug>/ (volume chỉ đọc, ga-engine-install đặt) — không đi theo PATH của
// container. argv[0] do adapter dựng: `/opt/engines/<slug>/current/<bin>` (L-ENG engineBinaryPath) hoặc tên trần `<bin>`.
// Shell / trình thông dịch bị cấm làm argv[0] (kể cả qua symlink: kiểm cả basename của đường thật).

export function resolveCliBin(roots: RunnerRoots, slug: string, argv0: string): string {
  if (!isEngineSlug(slug)) throw new RunnerError('bad_engine', 'engineSlug không hợp lệ');
  const prefix = `${FIXED_ROOTS.engines}/${slug}/current/`;
  const name = argv0.startsWith(prefix) ? argv0.slice(prefix.length) : argv0;
  if (!isCliBinName(name)) throw new RunnerError('bad_cli', 'argv[0] không phải binary CLI hợp lệ');
  const slugDir = join(roots.engines, slug);
  const p = join(slugDir, 'current', name);
  if (lstatOrNull(p) === null) throw new RunnerError('cli_not_installed', 'CLI chưa được cài trong /opt/engines');
  const real = realpathSync(p);
  if (!real.startsWith(realpathSync(slugDir) + sep))
    throw new RunnerError('bad_cli', 'CLI trỏ ra ngoài /opt/engines/<slug>');
  if (FORBIDDEN_ARGV0.has(basename(real))) throw new RunnerError('bad_cli', 'argv[0] là shell / trình thông dịch');
  if (!statSync(real).isFile()) throw new RunnerError('bad_cli', 'CLI không phải tệp thường');
  accessSync(real, constants.X_OK);
  return real;
}

export function killGroup(pid: number | undefined, signal: NodeJS.Signals): void {
  if (!pid) return;
  try {
    process.kill(-pid, signal);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e;
  }
}

export interface RunCliOptions {
  binPath: string;
  argv: readonly string[];
  env: Record<string, string>;
  cwd: string;
  timeoutMs: number;
  onStdout(chunk: Buffer): void;
  onStderr(chunk: Buffer): void;
  onSpawn?(pid: number): void;
  /** Thời gian chờ sau SIGTERM trước SIGKILL. */
  killGraceMs?: number;
}

export interface RunCliResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  durationMs: number;
}

export function runCli(opts: RunCliOptions): Promise<RunCliResult> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(opts.binPath, opts.argv.slice(1), {
      argv0: opts.argv[0],
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    let timedOut = false;
    let killTimer: NodeJS.Timeout | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child.pid, 'SIGTERM');
      killTimer = setTimeout(() => killGroup(child.pid, 'SIGKILL'), opts.killGraceMs ?? 5000);
    }, opts.timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      reject(new RunnerError('spawn_failed', `không chạy được CLI: ${(e as NodeJS.ErrnoException).code ?? 'lỗi'}`));
    });
    if (child.pid) opts.onSpawn?.(child.pid);
    child.stdout.on('data', (c: Buffer) => opts.onStdout(c));
    child.stderr.on('data', (c: Buffer) => opts.onStderr(c));
    let done = false;
    const finish = (code: number | null, signal: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve({ exitCode: code, signal, timedOut, durationMs: Date.now() - started });
    };
    child.on('exit', (code, signal) => {
      // tiến trình nền CLI để lại (tự cập nhật, daemon…) không được sống tiếp sau lượt; giết nhóm để đóng pipe chúng giữ
      killGroup(child.pid, 'SIGKILL');
      // tiến trình đã tự tách nhóm vẫn giữ pipe ⇒ không chờ mãi: sau 2 s cắt luồng và kết thúc
      const t = setTimeout(() => {
        child.stdout.destroy();
        child.stderr.destroy();
        finish(code, signal);
      }, 2000);
      child.on('close', () => {
        clearTimeout(t);
        finish(code, signal);
      });
    });
  });
}
