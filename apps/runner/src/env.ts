import { RunnerError } from './paths.ts';

// Luật tên biến môi trường cho tiến trình CLI trong container (CNS-142; contracts EnvMap / FORBIDDEN_ENV_NAME_PATTERNS).
// Lặp lại ở đây vì ga-runner không import giá trị contracts lúc chạy; test parity bảo đảm trùng.

/** = contracts FORBIDDEN_ENV_NAME_PATTERNS (test parity). */
export const FORBIDDEN_ENV_NAME_PATTERNS: readonly RegExp[] = [
  /SESSION/i,
  /_OAUTH_TOKEN/i,
  /^GENAGENTS_MASTER_KEY$/,
  /^GA_(SUPERVISOR|TERM_TICKET|UPDATER|EGRESS)_KEY$/,
];
const ENV_NAME_RE = /^[A-Z_][A-Z0-9_]*$/;
/** Biến do ga-runner tự đặt — plan không được ghi đè. */
const RESERVED_ENV = new Set(['HOME', 'PATH', 'TMPDIR', 'PWD', 'SHELL', 'USER', 'LOGNAME']);

export function checkEnvName(name: string): void {
  if (!ENV_NAME_RE.test(name)) throw new RunnerError('bad_env', 'tên env không hợp lệ');
  if (FORBIDDEN_ENV_NAME_PATTERNS.some((re) => re.test(name))) throw new RunnerError('forbidden_env', 'env bị cấm');
  if (RESERVED_ENV.has(name) || name.startsWith('GA_')) throw new RunnerError('reserved_env', 'env do ga-runner đặt');
}
