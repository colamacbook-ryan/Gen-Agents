import type { AuthError } from './types.ts';

/**
 * Phân loại lỗi đăng nhập để giao diện chọn hành vi (đếm ngược, nhắc mật khẩu…). Chữ hiển thị luôn lấy từ i18n theo `i18nKey`.
 * Nhận cả hai dạng mà L-SEC / contracts có thể trả: mã riêng (`auth.locked`, `auth.weak_password`) hoặc mã chung kèm khoá i18n
 * (`auth.rate_limited` + `errors.auth.locked`; `validation.failed` + `errors.auth.password.<reason>`), nên không phụ thuộc
 * lane L-SEC chọn dạng nào.
 */
export type AuthFailureKind =
  | 'invalid_credentials'
  | 'locked'
  | 'rate_limited'
  | 'weak_password'
  | 'csrf'
  | 'session_expired'
  | 'network'
  | 'other';

const PASSWORD_KEY_PREFIX = 'errors.auth.password.';

export function classifyAuthError(e: AuthError): AuthFailureKind {
  if (e.code === 'network') return 'network';
  if (e.code === 'auth.locked' || e.i18nKey === 'errors.auth.locked') return 'locked';
  if (e.code === 'auth.weak_password' || e.i18nKey.startsWith(PASSWORD_KEY_PREFIX)) return 'weak_password';
  if (e.code === 'auth.rate_limited') return 'rate_limited';
  if (e.code === 'auth.invalid_credentials' || e.i18nKey === 'errors.auth.invalid_credentials')
    return 'invalid_credentials';
  if (e.code === 'auth.csrf') return 'csrf';
  if (e.code === 'auth.required') return 'session_expired';
  return 'other';
}
