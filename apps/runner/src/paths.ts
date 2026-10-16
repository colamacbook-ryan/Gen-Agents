import { ENGINE_SLUG_RE, isForbiddenArgv0Name } from '@ga/contracts';

// Hằng số đường dẫn + bộ kiểm tên của ga-runner (BUILD-PLAN §B.5, §B.6; contracts TURN_EXEC).
// Image runtime mang kèm @ga/contracts + @ga/engines (Gen quyết: runner tự dựng argv từ adapter) ⇒ luật dùng chung
// (slug, argv[0] cấm, env) lấy thẳng từ contracts. Test `paths.test.ts` bảo đảm hằng đường ở đây trùng TURN_EXEC.

/** Gốc các thư mục mà ga-runner được phép đụng tới. CLI thật luôn dùng FIXED_ROOTS; test truyền thư mục tạm. */
export interface RunnerRoots {
  /** tmpfs của container: /run/ga/<lượt>/ (vé, cấu hình, HOME native), /run/ga/pty/ (pid PTY). */
  readonly run: string;
  /** Volume credential: /auth/<EN-xxxx>/ (mỗi tài khoản một volume ga-auth-en-*). */
  readonly auth: string;
  /** Volume ga-engines: /opt/engines/<slug>/<version>/<bin>, /opt/engines/bin/<bin> → bản hiện hành. */
  readonly engines: string;
}

export const FIXED_ROOTS: RunnerRoots = { run: '/run/ga', auth: '/auth', engines: '/opt/engines' };

export const TURN_ENV = { turnId: 'GA_TURN_ID', gatewayUrl: 'GA_GATEWAY_URL' } as const;
export const TICKET_FILE_MODE = 0o400;
/** Marker gắn vào env của tiến trình PTY để `pty-kill` tìm cả tiến trình đã tự tách nhóm (setsid). */
export const PTY_MARKER_ENV = 'GA_PTY_ID';

/** Thư mục bản hiện hành của một loại CLI: /opt/engines/<slug>/current → <version> (ga-engine-install giữ liên kết). */
export function engineCurrentDir(roots: RunnerRoots, slug: string): string {
  return `${roots.engines}/${slug}/current`;
}

/** PATH đưa cho CLI: bản hiện hành của đúng loại CLI đang chạy, rồi thư mục hệ thống. */
export function cliPath(roots: RunnerRoots, slug: string): string {
  return `${engineCurrentDir(roots, slug)}:/usr/local/bin:/usr/bin:/bin`;
}

/** = contracts ENGINE_SLUG_RE (một nguồn luật). */
export const isEngineSlug = (s: string): boolean => ENGINE_SLUG_RE.test(s);

// ---------------------------------------------------------------- bộ kiểm (regex một lớp ký tự, không lồng ⇒ tuyến tính)
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const ACCOUNT_RE = /^EN-[0-9]{4,12}$/;
const TICKET_RE = /^[A-Za-z0-9_-]{43,256}$/;
const PTY_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const BIN_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SEGMENT_RE = /^[A-Za-z0-9._@+-]{1,128}$/;

export const isTurnId = (s: string): boolean => ULID_RE.test(s);
export const isAccount = (s: string): boolean => ACCOUNT_RE.test(s);
export const isTurnTicket = (s: string): boolean => TICKET_RE.test(s);
export const isPtyId = (s: string): boolean => PTY_ID_RE.test(s);

/** Tên binary CLI: tên trần, không '/', không bắt đầu bằng 'ga-', không phải shell / trình thông dịch. */
export function isCliBinName(s: string): boolean {
  return BIN_RE.test(s) && !s.startsWith('ga-') && s !== '.' && s !== '..' && !isForbiddenArgv0Name(s);
}

/**
 * Đường tương đối an toàn (tệp allowlist /auth, tệp của plan): không rỗng, không tuyệt đối, không '.', '..', không đoạn rỗng,
 * mỗi đoạn chỉ ký tự an toàn, tối đa 16 đoạn / 512 ký tự.
 */
export function isSafeRelPath(p: string): boolean {
  if (p.length === 0 || p.length > 512 || p.startsWith('/') || p.endsWith('/')) return false;
  const parts = p.split('/');
  if (parts.length > 16) return false;
  return parts.every((seg) => seg !== '.' && seg !== '..' && SEGMENT_RE.test(seg));
}

export class RunnerError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'RunnerError';
    this.code = code;
  }
}
