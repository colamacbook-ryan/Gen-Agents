// Hợp đồng phía giao diện với API đăng nhập owner của L-SEC (feat/m1-sec, apps/control-plane/src/auth/http.ts):
//   POST /api/auth/login     {username, password}            → 200 {mustChangePassword, csrfToken} + Set-Cookie
//   GET  /api/auth/session                                    → 200 {username, mustChangePassword, csrfToken} | 401
//   POST /api/auth/password  {currentPassword, newPassword}   → 200 {csrfToken} + Set-Cookie (phiên mới)
//   POST /api/auth/logout                                     → 204 + Set-Cookie xoá
// Lỗi: { error: { code, i18nKey, requestId }, retryAfterSeconds?, reason? }. Giao diện KHÔNG đọc chữ từ API: chỉ dùng `i18nKey`.
import type { ApiErrorCode } from '@ga/contracts';

export interface SessionInfo {
  username: string;
  mustChangePassword: boolean;
  csrfToken: string;
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface LoginResult {
  mustChangePassword: boolean;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

/**
 * Máy khách đăng nhập: một interface, hai bản (HTTP thật ở http-client.ts, giả ở test). Không giữ mật khẩu sau khi gọi.
 * Ném `AuthError` cho mọi lỗi; `session()` trả `null` khi chưa đăng nhập (401), không ném.
 */
export interface AuthClient {
  login(input: LoginInput): Promise<LoginResult>;
  session(): Promise<SessionInfo | null>;
  changePassword(input: ChangePasswordInput): Promise<void>;
  logout(): Promise<void>;
}

/** Mã lỗi phía máy khách ngoài các mã API. */
export type ClientErrorCode = 'network' | 'bad_response';

export interface AuthErrorInit {
  status: number;
  code: ApiErrorCode | ClientErrorCode;
  /** khoá i18n để dịch (từ API hoặc suy ra) */
  i18nKey: string;
  retryAfterSeconds?: number;
  /** lý do chính sách mật khẩu (`too_short`…): chỉ để máy đọc, chữ lấy từ i18nKey */
  reason?: string;
  requestId?: string;
}

export class AuthError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | ClientErrorCode;
  readonly i18nKey: string;
  readonly retryAfterSeconds?: number;
  readonly reason?: string;
  readonly requestId?: string;

  constructor(init: AuthErrorInit, options?: ErrorOptions) {
    // thông điệp chỉ cho log, không hiện ra giao diện
    super(`auth:${init.code}`, options);
    this.name = 'AuthError';
    this.status = init.status;
    this.code = init.code;
    this.i18nKey = init.i18nKey;
    this.retryAfterSeconds = init.retryAfterSeconds;
    this.reason = init.reason;
    this.requestId = init.requestId;
  }
}

export const isAuthError = (e: unknown): e is AuthError => e instanceof AuthError;
