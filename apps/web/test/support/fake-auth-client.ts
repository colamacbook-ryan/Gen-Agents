// Máy khách đăng nhập giả ở tầng INTERFACE (AuthClient): test component không cần HTTP. Mặc định hành xử như một máy chủ ngoan
// (đăng nhập đúng mật khẩu thì có phiên); mỗi thao tác có thể thay bằng hàm / lỗi tuỳ ý để dựng ca lỗi.
import { type ApiErrorCode, i18nKeyFor } from '@ga/contracts';
import {
  type AuthClient,
  AuthError,
  type ChangePasswordInput,
  type LoginInput,
  type LoginResult,
  type SessionInfo,
} from '../../src/auth/types.ts';
import { GOOD_PASSWORD } from './secrets.ts';

export function authError(
  code: ApiErrorCode | 'network' | 'bad_response',
  extra: { status?: number; i18nKey?: string; retryAfterSeconds?: number; reason?: string } = {},
): AuthError {
  return new AuthError({
    status: extra.status ?? (code === 'network' ? 0 : 400),
    code,
    i18nKey:
      extra.i18nKey ??
      (code === 'network' ? 'errors.network' : code === 'bad_response' ? 'errors.bad_response' : i18nKeyFor(code)),
    retryAfterSeconds: extra.retryAfterSeconds,
    reason: extra.reason,
  });
}

export interface FakeAuthClientOptions {
  /** phiên có sẵn lúc đầu (null = chưa đăng nhập) */
  session?: SessionInfo | null;
  /** mật khẩu đúng của lần đăng nhập mặc định */
  password?: string;
  username?: string;
  mustChangePasswordOnLogin?: boolean;
  login?: (input: LoginInput) => Promise<LoginResult> | LoginResult;
  changePassword?: (input: ChangePasswordInput) => Promise<void> | void;
  logout?: () => Promise<void> | void;
}

export class FakeAuthClient implements AuthClient {
  readonly calls = {
    login: [] as LoginInput[],
    changePassword: [] as ChangePasswordInput[],
    logout: 0,
    session: 0,
  };
  private current: SessionInfo | null;
  private readonly opts: FakeAuthClientOptions;

  constructor(opts: FakeAuthClientOptions = {}) {
    this.opts = opts;
    this.current = opts.session === undefined ? null : opts.session;
  }

  async login(input: LoginInput): Promise<LoginResult> {
    this.calls.login.push(input);
    if (this.opts.login) {
      const r = await this.opts.login(input);
      this.current = { username: input.username, mustChangePassword: r.mustChangePassword, csrfToken: 'csrf-fake' };
      return r;
    }
    if (input.password !== (this.opts.password ?? GOOD_PASSWORD)) {
      throw authError('auth.required', { status: 401, i18nKey: 'errors.auth.invalid_credentials' });
    }
    const mustChangePassword = this.opts.mustChangePasswordOnLogin ?? false;
    this.current = { username: this.opts.username ?? input.username, mustChangePassword, csrfToken: 'csrf-fake' };
    return { mustChangePassword };
  }

  async session(): Promise<SessionInfo | null> {
    this.calls.session += 1;
    return this.current;
  }

  async changePassword(input: ChangePasswordInput): Promise<void> {
    this.calls.changePassword.push(input);
    if (this.opts.changePassword) await this.opts.changePassword(input);
    if (this.current) this.current = { ...this.current, mustChangePassword: false };
  }

  async logout(): Promise<void> {
    this.calls.logout += 1;
    if (this.opts.logout) await this.opts.logout();
    this.current = null;
  }
}

export const SAMPLE_SESSION: SessionInfo = { username: 'admin', mustChangePassword: false, csrfToken: 'csrf-sample' };
