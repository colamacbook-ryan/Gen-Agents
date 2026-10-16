import type { Writable } from 'node:stream';
import { RunnerError } from './paths.ts';

// Dòng trạng thái của chính ga-runner: JSON một dòng trên STDERR, khoá gốc `ga_runner` (stdout dành cho output CLI đã che).
// Không bao giờ chứa nội dung credential, vé hay output CLI.

export function emit(err: Writable, event: string, fields: Record<string, unknown>): void {
  err.write(`${JSON.stringify({ ga_runner: { event, ...fields } })}\n`);
}

export function emitError(err: Writable, e: unknown): void {
  if (e instanceof RunnerError) emit(err, 'error', { code: e.code, message: e.message });
  else emit(err, 'error', { code: 'internal', message: 'lỗi nội bộ ga-runner' });
}

/** Mã thoát của ga-runner khi lỗi trước / ngoài CLI (125 giống quy ước `docker run`). */
export const EXIT_RUNNER_ERROR = 125;
export const EXIT_TIMEOUT = 124;

export function exitCodeOf(r: { exitCode: number | null; signal: string | null; timedOut: boolean }): number {
  if (r.timedOut) return EXIT_TIMEOUT;
  if (r.exitCode !== null) return r.exitCode;
  return 128 + 9;
}
