import type { ApiClient } from '../api/client.ts';
import { type ApiError, isApiError } from '../api/error.ts';
import { type AuthClient, AuthError, type ChangePasswordInput, type LoginInput, type SessionInfo } from './types.ts';

// Máy khách đăng nhập theo HỢP ĐỒNG (EXT-01…04 ở /api/v1/auth/*) trên client API gõ kiểu. Song song với `http-client.ts` (L-SEC: /api/auth/*)
// cho tới khi máy chủ chuyển sang đường dẫn của hợp đồng; chọn bản nào ở main.tsx.
//   - login (EXT-01): lưu csrfToken; trả mustChangePassword
//   - session (EXT-03): lưu csrfToken; KHÔNG có mustChangePassword trong response ⇒ phiên đang bị buộc đổi mật khẩu sẽ bị máy chủ từ chối
//     `403 auth.must_change_password`; ta coi là "chưa có phiên" để người dùng đăng nhập lại (đăng nhập mới trả csrfToken + cờ buộc đổi)
//   - changePassword (EXT-04, 204): phiên có thể xoay ⇒ đọc lại EXT-03 để lấy csrfToken mới
//   - logout (EXT-02): 401 = phiên đã hết sẵn ⇒ mục tiêu đã đạt

const WEAK_REASONS: ReadonlySet<string> = new Set([
  'too_short',
  'too_long',
  'too_repetitive',
  'contains_username',
  'same_as_current',
]);

export function toAuthError(e: ApiError): AuthError {
  const reason = typeof e.detailParams.reason === 'string' ? e.detailParams.reason : undefined;
  const retry = e.detailParams.retryAfterS;
  // mật khẩu yếu: mỗi lý do có chuỗi riêng (errors.auth.password.<lý do>)
  const i18nKey =
    e.code === 'auth.weak_password' && reason && WEAK_REASONS.has(reason)
      ? `errors.auth.password.${reason}`
      : e.i18nKey;
  return new AuthError(
    {
      status: e.httpStatus,
      code: e.code,
      i18nKey,
      retryAfterSeconds: typeof retry === 'number' ? retry : undefined,
      reason,
      requestId: e.requestId,
    },
    { cause: e },
  );
}

async function wrap<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    throw isApiError(e) ? toAuthError(e) : e;
  }
}

export function createContractAuthClient(api: ApiClient): AuthClient {
  const me = async (): Promise<SessionInfo | null> => {
    try {
      const r = await api.call('EXT-03');
      api.csrf.set(r.csrfToken);
      return { username: r.user.name, mustChangePassword: false, csrfToken: r.csrfToken };
    } catch (e) {
      if (isApiError(e) && (e.httpStatus === 401 || e.code === 'auth.must_change_password')) {
        api.csrf.set(null);
        return null;
      }
      throw isApiError(e) ? toAuthError(e) : e;
    }
  };

  return {
    async login(input: LoginInput) {
      const r = await wrap(api.call('EXT-01', { body: { username: input.username, password: input.password } }));
      api.csrf.set(r.csrfToken);
      return { mustChangePassword: r.mustChangePassword };
    },
    session: me,
    async changePassword(input: ChangePasswordInput) {
      await wrap(
        api.call('EXT-04', { body: { currentPassword: input.currentPassword, newPassword: input.newPassword } }),
      );
      await me();
    },
    async logout() {
      try {
        await api.call('EXT-02');
      } catch (e) {
        if (!(isApiError(e) && e.httpStatus === 401)) throw isApiError(e) ? toAuthError(e) : e;
      }
      api.csrf.set(null);
    },
  };
}
