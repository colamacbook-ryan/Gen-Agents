// EXT-01…04 (L-SEC, BACKEND-TRIAL §3.2) mount qua registry — logic xác thực vẫn là AuthService của L-SEC; ở đây chỉ nối
// với hợp đồng (`/api/v1/auth/*`, UserView, 204, Set-Cookie qua request-extras, IP / Origin của edge).
//   - EXT-01 public: kiểm Origin (login CSRF) → AuthService.login → membership ⇒ UserView. Lỗi đúng mã hợp đồng; user lạ,
//     sai mật khẩu, bị khoá không phân biệt được (AuthService — HANDLER-OBLIGATIONS / task 3).
//   - EXT-02 / 04: phiên của request (pipeline đã kiểm cookie + CSRF + Origin).

import { defineHandler, type Handler } from '../http/define-handler.ts';
import { ApiError } from '../http/errors.ts';
import { requestExtras } from '../http/request-extras.ts';
import { langOf, onboardingDone } from './views.ts';

function retryHeaders(s: number): { headers: Record<string, string> } {
  return { headers: { 'retry-after': String(s) } };
}

/** Lỗi chung của AuthService ⇒ ApiError (một chỗ cho EXT-01 / 04). */
function authFailure(f: { code: string; retryAfterSeconds?: number }): ApiError {
  switch (f.code) {
    case 'invalid_credentials':
      return new ApiError('auth.invalid_credentials');
    case 'locked':
      return new ApiError(
        'auth.locked',
        { retryAfterS: f.retryAfterSeconds ?? 0 },
        retryHeaders(f.retryAfterSeconds ?? 0),
      );
    case 'rate_limited':
      return new ApiError(
        'auth.rate_limited',
        { retryAfterS: f.retryAfterSeconds ?? 0 },
        retryHeaders(f.retryAfterSeconds ?? 0),
      );
    case 'origin':
      return new ApiError('auth.csrf');
    case 'no_membership':
      return new ApiError('auth.forbidden', { reason: 'no_workspace' });
    default:
      return new ApiError('validation.failed');
  }
}

export const authHandlers: readonly Handler[] = [
  defineHandler('EXT-01', async ({ body }, ctx) => {
    const r = await requestExtras(ctx).login(body.username, body.password);
    if (!r.ok) throw authFailure(r);
    return { user: r.user, csrfToken: r.csrfToken, mustChangePassword: r.mustChangePassword };
  }),

  defineHandler('EXT-02', (_input, ctx) => {
    requestExtras(ctx).logout();
  }),

  defineHandler('EXT-03', (_input, ctx) => {
    const x = requestExtras(ctx);
    if (x.session === null) throw new ApiError('auth.required');
    const csrfToken = x.session.csrfToken;
    return ctx.read((tx) => {
      const user = tx.users.get(ctx.actor.userId);
      if (user === null) throw new ApiError('auth.required');
      const ws = tx.workspace.get();
      return {
        user: {
          id: user.id,
          displayId: user.display_id,
          name: user.display_name.slice(0, 60) || user.username.slice(0, 60),
          accessLevel: ctx.actor.accessLevel,
        },
        workspace: {
          id: ws.id,
          name: ws.name.slice(0, 80),
          shortCode: ws.short_code,
          lang: langOf(ws.locale),
          timezone: ws.timezone,
        },
        csrfToken,
        onboardingDone: onboardingDone(tx.workspace.setupChecklist()),
      };
    });
  }),

  defineHandler('EXT-04', async ({ body }, ctx) => {
    const r = await requestExtras(ctx).changePassword(body.currentPassword, body.newPassword);
    if (r.ok) return;
    if (r.code === 'weak_password') throw new ApiError('auth.weak_password', { reason: r.reason });
    throw authFailure(r);
  }),
];
