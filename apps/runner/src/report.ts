import type { Writable } from 'node:stream';
import { type RunnerErrorCode, type RunnerReport, runnerReportLine } from '@ga/contracts';
import { RunnerError } from './paths.ts';
import { credentialInLine } from './redact.ts';

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

export type ErrorReport = Extract<RunnerReport, { command: 'error' }>;

/**
 * Report `error` (contracts RunnerReport): `code` thuộc RUNNER_ERROR_CODES (lỗi không phải RunnerError ⇒ `internal`);
 * `message` do runner viết, cắt ≤ 500 ký tự; trông như credential ⇒ thay hẳn (không bao giờ mang vé / output CLI).
 */
export function errorReport(e: unknown): ErrorReport {
  const code: RunnerErrorCode = e instanceof RunnerError ? e.code : 'internal';
  let message = e instanceof RunnerError ? e.message : 'lỗi nội bộ ga-runner';
  if (credentialInLine(message) !== null) message = 'thông điệp lỗi bị ẩn (giống credential)';
  return { $ga: 'report', command: 'error', code, message: message.slice(0, 500) };
}

/**
 * MỌI đường lỗi của lệnh có giao thức stdout (turn, login-check, probe, auth-gc, login, lỗi cú pháp ga-runner): sự kiện
 * `ga_runner` trên stderr (log) + report `error` là DÒNG CUỐI của stdout (sau nó không ghi gì nữa) ⇒ bên đọc thấy lỗi có mã
 * thay vì "thiếu report". Trả mã thoát 125.
 */
export function failWith(io: { stdout: Writable; stderr: Writable }, e: unknown): number {
  emitError(io.stderr, e);
  io.stdout.write(`${runnerReportLine(errorReport(e))}\n`);
  return EXIT_RUNNER_ERROR;
}

export function exitCodeOf(r: { exitCode: number | null; signal: string | null; timedOut: boolean }): number {
  if (r.timedOut) return EXIT_TIMEOUT;
  if (r.exitCode !== null) return r.exitCode;
  return 128 + 9;
}
