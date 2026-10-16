// Phiên đăng nhập owner: cookie ngẫu nhiên (DB chỉ giữ token_hash), CSRF gắn phiên, kiểm Origin (BUILD-PLAN §A.1, §B.3).
//
// - Token phiên 256 bit (base64url 43 ký tự). DB (`auth_sessions.token_hash`) chỉ giữ SHA-256 hex của token.
// - Cookie: HttpOnly, SameSite=Strict, Path=/. Kết nối HTTPS (sau Caddy TLS) ⇒ thêm Secure + tiền tố `__Host-` (trình duyệt
//   cấm subdomain / HTTP ghi đè). HTTP thường (cài mặc định :7400, G1 có dải `warn`) ⇒ tên `ga_sid`, không Secure.
// - CSRF: header `x-ga-csrf` = HMAC-SHA256(K_csrf, token_hash) — không trạng thái, đổi theo phiên; bắt buộc ở mọi method
//   không an toàn. K_csrf dẫn xuất từ master key (HKDF, keys.ts). Thêm lớp Origin / Sec-Fetch-Site.
// - Cookie trùng tên trong một header (cookie tossing) ⇒ coi như không có phiên.
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { b64urlDecodeStrict, b64urlEncode, constantTimeEqual } from './encoding.ts';

export const SESSION = {
  tokenBytes: 32,
  cookieSecure: '__Host-ga_sid',
  cookieInsecure: 'ga_sid',
  /** Hạn tuyệt đối của phiên. [ĐỀ XUẤT — L-SEC] */
  absoluteTtlSeconds: 7 * 24 * 3600,
  /** Không hoạt động quá lâu ⇒ phiên hết hạn. [ĐỀ XUẤT — L-SEC] */
  idleTtlSeconds: 12 * 3600,
  /** Ghi last_seen_at tối đa mỗi ngần này giây (không ghi DB ở mọi request). */
  touchEverySeconds: 60,
} as const;

export const CSRF_HEADER = 'x-ga-csrf';

/** Trần header Cookie đọc vào (trình duyệt gửi ≤ ~8 KB). */
const MAX_COOKIE_HEADER = 8192;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function newSessionToken(): { token: string; tokenHash: string } {
  const token = b64urlEncode(randomBytes(SESSION.tokenBytes));
  return { token, tokenHash: hashSessionToken(token) };
}

/** SHA-256 hex của token (giá trị lưu ở auth_sessions.token_hash). Token sai dạng ⇒ RangeError (không tra DB). */
export function hashSessionToken(token: string): string {
  if (!TOKEN_RE.test(token) || !b64urlDecodeStrict(token)) throw new RangeError('token phiên sai dạng');
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function sessionCookieName(secure: boolean): string {
  return secure ? SESSION.cookieSecure : SESSION.cookieInsecure;
}

/** Set-Cookie cho phiên mới. `maxAgeSeconds` mặc định = hạn tuyệt đối. */
export function serializeSessionCookie(token: string, opts: { secure: boolean; maxAgeSeconds?: number }): string {
  if (!TOKEN_RE.test(token)) throw new RangeError('token phiên sai dạng');
  const maxAge = Math.max(0, Math.floor(opts.maxAgeSeconds ?? SESSION.absoluteTtlSeconds));
  const parts = [
    `${sessionCookieName(opts.secure)}=${token}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Strict',
  ];
  if (opts.secure) parts.push('Secure');
  return parts.join('; ');
}

/** Set-Cookie xoá phiên (đăng xuất / hết hạn). */
export function serializeClearSessionCookie(opts: { secure: boolean }): string {
  const parts = [`${sessionCookieName(opts.secure)}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Strict'];
  if (opts.secure) parts.push('Secure');
  return parts.join('; ');
}

/**
 * Lấy token phiên từ header Cookie. null nếu: không có, header quá dài, giá trị sai dạng, hoặc tên cookie xuất hiện > 1 lần
 * (cookie tossing: kẻ khác ghi thêm cookie cùng tên để ép phiên — không đoán cái nào là thật).
 */
export function readSessionCookie(cookieHeader: string | null | undefined, opts: { secure: boolean }): string | null {
  if (!cookieHeader || cookieHeader.length > MAX_COOKIE_HEADER) return null;
  const name = sessionCookieName(opts.secure);
  let found: string | null = null;
  let count = 0;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    count++;
    found = part.slice(eq + 1).trim();
  }
  // token phải là base64url CHUẨN của đúng 32 byte — giá trị 43 ký tự "gần đúng" (bit thừa ở ký tự cuối) trả null ở đây
  // thay vì để hashSessionToken ném lỗi ở tầng trên (review adversarial L-SEC: cookie giả làm request lỗi 500)
  if (count !== 1 || found === null || !TOKEN_RE.test(found) || !b64urlDecodeStrict(found)) return null;
  return found;
}

// ---------------------------------------------------------------- CSRF
/** Token CSRF của một phiên: base64url(HMAC-SHA256(K_csrf, "ga-csrf.v1:" ‖ token_hash)). */
export function csrfTokenFor(csrfKey: Uint8Array, tokenHash: string): string {
  if (csrfKey.byteLength < 32) throw new RangeError('khoá CSRF phải ≥ 32 byte');
  return createHmac('sha256', csrfKey).update(`ga-csrf.v1:${tokenHash}`).digest('base64url');
}

export function verifyCsrfToken(csrfKey: Uint8Array, tokenHash: string, presented: string | null | undefined): boolean {
  if (typeof presented !== 'string' || presented.length !== 43) return false;
  const got = b64urlDecodeStrict(presented);
  if (!got) return false;
  const want = Buffer.from(csrfTokenFor(csrfKey, tokenHash), 'base64url');
  return constantTimeEqual(got, want);
}

export function isSafeMethod(method: string): boolean {
  const m = method.toUpperCase();
  return m === 'GET' || m === 'HEAD' || m === 'OPTIONS';
}

export type OriginCheck = { ok: true } | { ok: false; reason: 'cross_site' | 'origin_mismatch' };

/**
 * Lớp phòng thủ thêm cho request không an toàn (kể cả đăng nhập — chống login CSRF): `Sec-Fetch-Site` (nếu trình duyệt gửi)
 * phải là same-origin / none; `Origin` (nếu có) phải thuộc danh sách origin của app. Thiếu cả hai (client không phải trình
 * duyệt, vd test / CLI) ⇒ dựa vào CSRF token / JSON body.
 */
export function checkRequestOrigin(req: {
  method: string;
  origin: string | null | undefined;
  secFetchSite: string | null | undefined;
  allowedOrigins: readonly string[];
}): OriginCheck {
  if (isSafeMethod(req.method)) return { ok: true };
  const site = req.secFetchSite?.toLowerCase();
  if (site !== undefined && site !== 'same-origin' && site !== 'none') return { ok: false, reason: 'cross_site' };
  if (req.origin !== null && req.origin !== undefined) {
    if (req.origin === 'null' || !req.allowedOrigins.includes(req.origin))
      return { ok: false, reason: 'origin_mismatch' };
  }
  return { ok: true };
}
