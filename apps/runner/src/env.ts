import { type EngineFlagTable, engineEnvViolations } from '@ga/contracts';
import { RunnerError } from './paths.ts';

// Env của tiến trình CLI trong container (CNS-142; review bảo mật MEDIUM code-execution — Gen quyết, STD-11 1.14.0).
// MỘT NGUỒN LUẬT: contracts `engineEnvViolations` —
//   1. ALLOWLIST: chỉ tên có trong bảng ĐÓNG của adapter (`flagTable.env`); bundle không mang env tự do (schema contracts);
//   2. CHẶN CỨNG kể cả khi adapter khai nhầm: LD_* / DYLD_* / NODE_* / PYTHON* / PERL* / RUBY* / BASH_ENV / ENV / SHELLOPTS /
//      PS4 / GIT_* / CA (SSL_CERT_*…) / *_PROXY / HOME / PATH / TMPDIR / TERM… + tên bí mật (SESSION, *_OAUTH_TOKEN, khoá).
// Runner gọi hàm này cho MỌI env của plan trước khi spawn; vi phạm ⇒ không chạy.

export function assertPlanEnv(env: Readonly<Record<string, string>>, table: EngineFlagTable): Record<string, string> {
  const v = engineEnvViolations(env, table);
  if (v.length > 0) throw new RunnerError('forbidden_env', `env của plan bị từ chối: ${v.slice(0, 3).join('; ')}`);
  return { ...env };
}
