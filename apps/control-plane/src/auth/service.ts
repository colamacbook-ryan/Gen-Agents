// Đăng nhập owner (BUILD-PLAN §B.4 `auth/`, §B.9 "mật khẩu lần đầu"; FS Chương 1 G1; STD-06):
//   - mật khẩu lần đầu = vài từ dễ đọc, chỉ lưu argon2id; bản rõ ghi /data/run/first-password (0600) cho install.sh in ra,
//     xoá sau lần đổi mật khẩu đầu; đăng nhập lần đầu BẮT đổi mật khẩu (must_change_password);
//   - phiên cookie ngẫu nhiên (DB giữ token_hash), CSRF gắn phiên + kiểm Origin cho mọi method không an toàn;
//   - giới hạn tần suất 3 tầng (IP, tài khoản, toàn cục) + khoá tạm tài khoản có đếm ngược; user lạ tốn đúng một lần băm
//     như user thật; lỗi không nói "sai user hay sai pass";
//   - đổi mật khẩu ⇒ thu hồi MỌI phiên cũ + cấp phiên mới (chống cố định phiên).
// Không phụ thuộc framework HTTP: http.ts bọc thành handler Request → Response (Hono gọi qua `c.req.raw`).
import { randomBytes } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import type { Clock } from '@ga/contracts';
import {
  ACCOUNT_LOCKOUT,
  type AccountLockoutPolicy,
  accountLockSeconds,
  boundedNfc,
  checkRequestOrigin,
  csrfTokenFor,
  generateFirstPassword,
  hashPassword,
  hashSessionToken,
  isSafeMethod,
  needsRehash,
  newSessionToken,
  PASSWORD_RULES,
  PasswordHasherBusyError,
  type PasswordPolicyViolation,
  prepareDummyHash,
  readSessionCookie,
  SESSION,
  SlidingWindowLimiter,
  serializeClearSessionCookie,
  serializeSessionCookie,
  USERNAME_RAW_MAX,
  validateNewPassword,
  verifyAgainstDummy,
  verifyCsrfToken,
  verifyPassword,
} from '@ga/security';
import type { AuthStore, AuthUser } from './store.ts';

/** [Gen duyệt 2026-10-16] Giới hạn tần suất đăng nhập / đổi mật khẩu. */
export const LOGIN_LIMITS = {
  perIp: { limit: 10, windowMs: 15 * 60_000 },
  perAccount: { limit: 10, windowMs: 15 * 60_000 },
  global: { limit: 120, windowMs: 60_000 },
} as const;

/**
 * Chính sách đăng nhập [Gen duyệt 2026-10-16]. Là THAM SỐ (không đóng cứng trong luồng): DB / contracts hiện chưa có khoá
 * setting tương ứng; khi lane DB thêm khoá `auth.*`, tầng dựng app đọc setting rồi truyền vào `AuthServiceOptions.policy`.
 */
export interface AuthPolicy {
  limits: { [K in keyof typeof LOGIN_LIMITS]: { limit: number; windowMs: number } };
  lockout: AccountLockoutPolicy;
  sessionAbsoluteTtlSeconds: number;
  sessionIdleTtlSeconds: number;
  passwordMinChars: number;
}

export const DEFAULT_AUTH_POLICY: AuthPolicy = {
  limits: LOGIN_LIMITS,
  lockout: ACCOUNT_LOCKOUT,
  sessionAbsoluteTtlSeconds: SESSION.absoluteTtlSeconds,
  sessionIdleTtlSeconds: SESSION.idleTtlSeconds,
  passwordMinChars: PASSWORD_RULES.minChars,
};

export const OWNER_USERNAME = 'admin';
export const FIRST_PASSWORD_PATH = '/data/run/first-password';
const USERNAME_MAX = 64;
const USER_AGENT_MAX = 256;

// ---------------------------------------------------------------- ULID (26 ký tự Crockford, 48 bit thời gian + 80 bit ngẫu nhiên)
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function newUlid(clock: Clock): string {
  let t = clock.now().getTime();
  let time = '';
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const rnd = randomBytes(16);
  let rand = '';
  for (let i = 0; i < 16; i++) rand += CROCKFORD[(rnd[i] as number) % 32];
  return time + rand;
}

// ---------------------------------------------------------------- tệp mật khẩu lần đầu
export interface FirstPasswordSink {
  write(password: string): void;
  remove(): void;
}

/** Tệp 0600 tạo độc quyền (wx); còn sót từ lần khởi động hỏng trước ⇒ ghi đè (user chưa được tạo nên mật khẩu cũ vô dụng). */
export function firstPasswordFile(path = FIRST_PASSWORD_PATH): FirstPasswordSink {
  return {
    write(password) {
      rmSync(path, { force: true });
      writeFileSync(path, `${password}\n`, { mode: 0o600, flag: 'wx' });
    },
    remove() {
      rmSync(path, { force: true });
    },
  };
}

// ---------------------------------------------------------------- kết quả
export type AuthFailure =
  | { ok: false; code: 'invalid_credentials' }
  | { ok: false; code: 'rate_limited'; retryAfterSeconds: number }
  | { ok: false; code: 'locked'; retryAfterSeconds: number }
  | { ok: false; code: 'bad_request' };

export type LoginResult =
  | { ok: true; setCookie: string; csrfToken: string; mustChangePassword: boolean; userId: string }
  | AuthFailure;

export interface AuthContext {
  userId: string;
  sessionId: string;
  tokenHash: string;
  username: string;
  mustChangePassword: boolean;
  csrfToken: string;
}

export type AuthenticateResult =
  | { ok: true; ctx: AuthContext }
  | { ok: false; code: 'auth.required'; clearCookie: string | null }
  | { ok: false; code: 'auth.csrf' };

export type ChangePasswordResult =
  | { ok: true; setCookie: string; csrfToken: string }
  | AuthFailure
  | { ok: false; code: 'weak_password'; reason: PasswordPolicyViolation };

export interface AuthRequestMeta {
  method: string;
  cookieHeader: string | null;
  csrfHeader: string | null;
  origin: string | null;
  secFetchSite: string | null;
}

export interface AuthServiceOptions {
  store: AuthStore;
  clock: Clock;
  /** K_csrf = deriveSubkey(master, 'csrf') — ổn định qua khởi động lại (phiên trong DB vẫn dùng được). */
  csrfKey: Uint8Array;
  /** true khi app đứng sau HTTPS (Caddy TLS) ⇒ cookie Secure + __Host-. */
  secureCookies: boolean;
  /** Origin hợp lệ của GUI (vd `http://localhost:7400`, `https://agents.example.com`). */
  allowedOrigins: readonly string[];
  firstPassword?: FirstPasswordSink;
  /** Mặc định DEFAULT_AUTH_POLICY; từng trường ghi đè được (nguồn: setting khi DB có khoá). */
  policy?: Partial<AuthPolicy>;
}

/**
 * Tên đăng nhập: kiểm trần THÔ (USERNAME_RAW_MAX code unit) TRƯỚC khi NFC (rào L-36 — không chuẩn hoá chuỗi dài tuỳ ý),
 * rồi NFC, bỏ khoảng trắng hai đầu, chữ thường, kiểm lại trần trên kết quả; rỗng / dài / ký tự điều khiển ⇒ null.
 */
export function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const nfc = boundedNfc(raw, USERNAME_RAW_MAX);
  if (nfc === null) return null;
  const u = nfc.trim().toLowerCase();
  if (u.length === 0 || u.length > USERNAME_MAX || /[\p{Cc}\p{Cf}\s]/u.test(u)) return null;
  return u;
}

export class AuthService {
  private readonly o: AuthServiceOptions;
  private readonly policy: AuthPolicy;
  private readonly ipLimiter: SlidingWindowLimiter;
  private readonly accountLimiter: SlidingWindowLimiter;
  private readonly globalLimiter: SlidingWindowLimiter;

  constructor(opts: AuthServiceOptions) {
    this.o = opts;
    this.policy = { ...DEFAULT_AUTH_POLICY, ...opts.policy };
    const l = this.policy.limits;
    this.ipLimiter = new SlidingWindowLimiter({ ...l.perIp, clock: opts.clock });
    this.accountLimiter = new SlidingWindowLimiter({ ...l.perAccount, clock: opts.clock });
    this.globalLimiter = new SlidingWindowLimiter({ ...l.global, clock: opts.clock });
  }

  private now(): Date {
    return this.o.clock.now();
  }

  /**
   * Khởi động lần đầu: chưa có user nào ⇒ sinh mật khẩu lần đầu (vài từ dễ đọc), lưu argon2id, ghi bản rõ ra tệp 0600.
   * Đã có user ⇒ không làm gì. Đồng thời tính sẵn chuỗi băm "giả" cho user lạ (thời gian đăng nhập đều ngay lần đầu).
   */
  async bootstrapOwner(opts: { displayName: string }): Promise<{ created: boolean }> {
    await prepareDummyHash();
    if (this.o.store.countUsers() > 0) return { created: false };
    const password = generateFirstPassword();
    const passwordHash = await hashPassword(password);
    const sink = this.o.firstPassword;
    sink?.write(password);
    try {
      this.o.store.createOwner({
        id: newUlid(this.o.clock),
        username: OWNER_USERNAME,
        displayName: opts.displayName,
        passwordHash,
        at: this.now(),
      });
    } catch (e) {
      sink?.remove();
      throw e;
    }
    return { created: true };
  }

  /** Tiêu một lượt ở cả ba tầng giới hạn; hết lượt tầng nào ⇒ rate_limited (Retry-After lớn nhất). */
  private consume(ip: string, account: string | null): AuthFailure | null {
    const keys: Array<[SlidingWindowLimiter, string]> = [
      [this.globalLimiter, '*'],
      [this.ipLimiter, ip],
    ];
    if (account) keys.push([this.accountLimiter, account]);
    const denied = keys.map(([l, k]) => l.check(k)).filter((d) => !d.allowed);
    if (denied.length > 0) {
      const ms = Math.max(...denied.map((d) => d.retryAfterMs));
      return { ok: false, code: 'rate_limited', retryAfterSeconds: Math.ceil(ms / 1000) };
    }
    for (const [l, k] of keys) l.hit(k);
    return null;
  }

  private lockedFor(user: AuthUser): number {
    if (!user.lockedUntil) return 0;
    const ms = Date.parse(user.lockedUntil) - this.now().getTime();
    return ms > 0 ? Math.ceil(ms / 1000) : 0;
  }

  private newSession(
    user: AuthUser,
    ip: string | null,
    userAgent: string | null,
  ): { setCookie: string; csrfToken: string } {
    const { token, tokenHash } = newSessionToken();
    const at = this.now();
    this.o.store.createSession({
      id: newUlid(this.o.clock),
      userId: user.id,
      tokenHash,
      at,
      expiresAt: new Date(at.getTime() + this.policy.sessionAbsoluteTtlSeconds * 1000),
      ip,
      userAgent: userAgent ? userAgent.slice(0, USER_AGENT_MAX) : null,
    });
    return {
      setCookie: serializeSessionCookie(token, {
        secure: this.o.secureCookies,
        maxAgeSeconds: this.policy.sessionAbsoluteTtlSeconds,
      }),
      csrfToken: csrfTokenFor(this.o.csrfKey, tokenHash),
    };
  }

  async login(input: {
    username: unknown;
    password: unknown;
    ip: string;
    userAgent: string | null;
  }): Promise<LoginResult> {
    const username = normalizeUsername(input.username);
    const password = input.password;
    // vẫn tiêu lượt của IP / toàn cục khi đầu vào hỏng — không có đường thử miễn phí
    const limited = this.consume(input.ip, username);
    if (limited) return limited;
    if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > PASSWORD_RULES.maxBytes) {
      return { ok: false, code: 'bad_request' };
    }
    if (!username) {
      if (typeof input.username !== 'string') return { ok: false, code: 'bad_request' };
      // tên là chuỗi nhưng không hợp lệ (quá dài, rỗng, ký tự điều khiển): trả như user lạ, tốn đúng một lần băm giả
      try {
        await verifyAgainstDummy(password);
      } catch (e) {
        if (e instanceof PasswordHasherBusyError) return { ok: false, code: 'rate_limited', retryAfterSeconds: 5 };
        throw e;
      }
      return { ok: false, code: 'invalid_credentials' };
    }
    const user = this.o.store.findUserByUsername(username);
    if (user && !user.disabledAt) {
      const locked = this.lockedFor(user);
      if (locked > 0) return { ok: false, code: 'locked', retryAfterSeconds: locked };
    }
    let ok = false;
    try {
      ok =
        user && !user.disabledAt
          ? await verifyPassword(password, user.passwordHash)
          : await verifyAgainstDummy(password);
    } catch (e) {
      if (e instanceof PasswordHasherBusyError) return { ok: false, code: 'rate_limited', retryAfterSeconds: 5 };
      throw e;
    }
    if (!ok || !user) {
      if (user && !user.disabledAt) {
        const r = this.o.store.registerFailedLogin(user.id, this.now(), (n) =>
          accountLockSeconds(n, this.policy.lockout),
        );
        if (r.lockedUntil) return { ok: false, code: 'locked', retryAfterSeconds: this.lockedFor({ ...user, ...r }) };
      }
      return { ok: false, code: 'invalid_credentials' };
    }
    this.o.store.registerSuccessfulLogin(user.id, this.now());
    this.ipLimiter.reset(input.ip);
    this.accountLimiter.reset(username);
    if (needsRehash(user.passwordHash)) {
      this.o.store.setPasswordHash(user.id, await hashPassword(password), {
        mustChange: user.mustChangePassword,
        at: this.now(),
      });
    }
    const s = this.newSession(user, input.ip, input.userAgent);
    return { ok: true, ...s, mustChangePassword: user.mustChangePassword, userId: user.id };
  }

  /** Kiểm phiên cho MỌI request API. Method không an toàn ⇒ thêm Origin / Sec-Fetch-Site + header CSRF. */
  authenticate(req: AuthRequestMeta): AuthenticateResult {
    const secure = this.o.secureCookies;
    const token = readSessionCookie(req.cookieHeader, { secure });
    if (!token) return { ok: false, code: 'auth.required', clearCookie: null };
    const tokenHash = hashSessionToken(token);
    const session = this.o.store.findSessionByTokenHash(tokenHash);
    const now = this.now();
    const nowMs = now.getTime();
    const clear = serializeClearSessionCookie({ secure });
    if (
      !session ||
      session.revokedAt !== null ||
      Date.parse(session.expiresAt) <= nowMs ||
      (session.lastSeenAt !== null && nowMs - Date.parse(session.lastSeenAt) > this.policy.sessionIdleTtlSeconds * 1000)
    ) {
      return { ok: false, code: 'auth.required', clearCookie: clear };
    }
    const user = this.o.store.findUserById(session.userId);
    if (!user || user.disabledAt) return { ok: false, code: 'auth.required', clearCookie: clear };
    if (!isSafeMethod(req.method)) {
      const origin = checkRequestOrigin({
        method: req.method,
        origin: req.origin,
        secFetchSite: req.secFetchSite,
        allowedOrigins: this.o.allowedOrigins,
      });
      if (!origin.ok || !verifyCsrfToken(this.o.csrfKey, tokenHash, req.csrfHeader))
        return { ok: false, code: 'auth.csrf' };
    }
    if (session.lastSeenAt === null || nowMs - Date.parse(session.lastSeenAt) >= SESSION.touchEverySeconds * 1000) {
      this.o.store.touchSession(session.id, now);
    }
    return {
      ok: true,
      ctx: {
        userId: user.id,
        sessionId: session.id,
        tokenHash,
        username: user.username,
        mustChangePassword: user.mustChangePassword,
        csrfToken: csrfTokenFor(this.o.csrfKey, tokenHash),
      },
    };
  }

  /** Đổi mật khẩu (lần đầu bắt buộc). Thu hồi mọi phiên của user, cấp phiên mới; xoá tệp mật khẩu lần đầu. */
  async changePassword(
    ctx: AuthContext,
    input: { currentPassword: unknown; newPassword: unknown; ip: string; userAgent: string | null },
  ): Promise<ChangePasswordResult> {
    const limited = this.consume(input.ip, ctx.username);
    if (limited) return limited;
    const { currentPassword, newPassword } = input;
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string')
      return { ok: false, code: 'bad_request' };
    const user = this.o.store.findUserById(ctx.userId);
    if (!user || user.disabledAt) return { ok: false, code: 'invalid_credentials' };
    const locked = this.lockedFor(user);
    if (locked > 0) return { ok: false, code: 'locked', retryAfterSeconds: locked };
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      const r = this.o.store.registerFailedLogin(user.id, this.now(), (n) =>
        accountLockSeconds(n, this.policy.lockout),
      );
      if (r.lockedUntil) return { ok: false, code: 'locked', retryAfterSeconds: this.lockedFor({ ...user, ...r }) };
      return { ok: false, code: 'invalid_credentials' };
    }
    const policy = validateNewPassword(newPassword, {
      username: user.username,
      currentPassword,
      minChars: this.policy.passwordMinChars,
    });
    if (!policy.ok) return { ok: false, code: 'weak_password', reason: policy.reason };
    const at = this.now();
    this.o.store.setPasswordHash(user.id, await hashPassword(newPassword), { mustChange: false, at });
    this.o.store.registerSuccessfulLogin(user.id, at);
    this.o.store.revokeUserSessions(user.id, at);
    this.o.firstPassword?.remove();
    return { ok: true, ...this.newSession({ ...user, mustChangePassword: false }, input.ip, input.userAgent) };
  }

  logout(ctx: AuthContext): { setCookie: string } {
    this.o.store.revokeSession(ctx.sessionId, this.now());
    return { setCookie: serializeClearSessionCookie({ secure: this.o.secureCookies }) };
  }
}
