import { ENV_NAME_RE, isForbiddenEnvName, isForbiddenRuntimeEnvName } from '@ga/contracts';

// Bảng đóng biến môi trường của adapter (review bảo mật bên runner, Gen quyết 2026-10-16): ga-runner CHỈ đặt env có
// trong bảng, giá trị phải khớp mẫu chặt; bundle không mang env. Không bao giờ khai biến điều khiển loader / interpreter
// (LD_*, NODE_OPTIONS, PYTHON*, BASH_ENV, GIT_*…) hay HOME / PATH / *_PROXY (runner và egress tự đặt).

export interface EnvSpec {
  readonly name: string;
  /** Mẫu chặt cho giá trị: phải neo `^…$`, không cờ `m` (chặn xuống dòng lọt qua `$`). */
  readonly pattern: RegExp;
  /** `plan`: giá trị cố định adapter đặt trong plan. `secret`: runner đọc từ tệp bí mật mount 0400 — KHÔNG nằm trong plan. */
  readonly source: 'plan' | 'secret';
  readonly purpose: string;
}

export class EnvTableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvTableError';
  }
}

/**
 * Tên cấm khai: loader / interpreter / shell / git, biến runner + egress tự đặt, và mọi tên contracts đã cấm
 * (isForbiddenRuntimeEnvName, isForbiddenEnvName). Danh sách dưới đây là phần CHẶT HƠN contracts (BUN_, DENO_, LC_, SSL_,
 * mọi *_PROXY, *CA_CERT* / *CA_BUNDLE*…).
 */
const FORBIDDEN_PREFIXES = [
  'LD_',
  'DYLD_',
  'NODE_',
  'NPM_',
  'BUN_',
  'DENO_',
  'PYTHON',
  'PERL',
  'RUBY',
  'JAVA_',
  '_JAVA_',
  'GIT_',
  'BASH_',
  'GCONV_',
  'MALLOC_',
  'GLIBC_',
  'LC_',
  'SSL_',
];
const FORBIDDEN_EXACT = new Set([
  'HOME',
  'PATH',
  'SHELL',
  'ENV',
  'IFS',
  'CDPATH',
  'PS4',
  'TMPDIR',
  'LOCPATH',
  'NLSPATH',
  'HOSTALIASES',
  'RESOLV_HOST_CONF',
  'LANG',
  'LANGUAGE',
  'TZ',
  'USER',
  'LOGNAME',
  'PWD',
  'OLDPWD',
  'TERM',
]);

export function isForbiddenAdapterEnvName(name: string): boolean {
  const upper = name.toUpperCase();
  if (FORBIDDEN_EXACT.has(upper) || upper.endsWith('_PROXY')) return true;
  if (FORBIDDEN_PREFIXES.some((p) => upper.startsWith(p))) return true;
  if (upper.includes('CA_CERT') || upper.includes('CA_BUNDLE')) return true;
  return isForbiddenRuntimeEnvName(name) || isForbiddenEnvName(name);
}

/** Kiểm bảng env của adapter; sai ⇒ ném EnvTableError (adapter không được nạp). */
export function assertEnvTable(table: readonly EnvSpec[]): void {
  const seen = new Set<string>();
  for (const spec of table) {
    if (!ENV_NAME_RE.test(spec.name)) throw new EnvTableError(`tên env không hợp lệ: ${spec.name}`);
    if (isForbiddenAdapterEnvName(spec.name)) throw new EnvTableError(`env bị cấm khai: ${spec.name}`);
    if (seen.has(spec.name)) throw new EnvTableError(`env khai trùng: ${spec.name}`);
    seen.add(spec.name);
    const src = spec.pattern.source;
    if (!src.startsWith('^') || !src.endsWith('$') || src.endsWith('\\$')) {
      throw new EnvTableError(`mẫu giá trị phải neo ^…$: ${spec.name}`);
    }
    if (spec.pattern.flags.includes('m') || spec.pattern.flags.includes('s')) {
      throw new EnvTableError(`mẫu giá trị không được dùng cờ m / s: ${spec.name}`);
    }
    if (spec.pattern.test('') || spec.pattern.test('\n') || spec.pattern.test('a\nb')) {
      throw new EnvTableError(`mẫu giá trị quá lỏng (nhận chuỗi rỗng / xuống dòng): ${spec.name}`);
    }
  }
}

/** Kiểm env của một plan theo bảng: chỉ tên `source: 'plan'`, giá trị khớp mẫu. Bí mật không bao giờ nằm trong plan. */
export function assertPlanEnv(table: readonly EnvSpec[], env: Readonly<Record<string, string>>): void {
  for (const [name, value] of Object.entries(env)) {
    const spec = table.find((s) => s.name === name);
    if (spec === undefined) throw new EnvTableError(`env ngoài bảng của adapter: ${name}`);
    if (spec.source !== 'plan') throw new EnvTableError(`env bí mật không được nằm trong plan: ${name}`);
    if (value.length > 4096 || !spec.pattern.test(value)) throw new EnvTableError(`giá trị env sai mẫu: ${name}`);
  }
}

/** Runner dùng: kiểm một giá trị bí mật trước khi đặt env cho tiến trình con (không log giá trị). */
export function assertSecretEnvValue(table: readonly EnvSpec[], name: string, value: string): void {
  const spec = table.find((s) => s.name === name);
  if (spec === undefined || spec.source !== 'secret') throw new EnvTableError(`env bí mật ngoài bảng: ${name}`);
  if (value.length > 4096 || !spec.pattern.test(value)) throw new EnvTableError(`giá trị bí mật sai mẫu: ${name}`);
}

/** Mẫu chung cho API key (chỉ ký tự an toàn, không khoảng trắng / xuống dòng / ký tự shell). */
export const API_KEY_VALUE_RE = /^[A-Za-z0-9_-]{16,256}$/;
