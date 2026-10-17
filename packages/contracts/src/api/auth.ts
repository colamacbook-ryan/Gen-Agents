import { z } from 'zod';
import { PtyClientMessage, PtyServerMessage } from '../supervisor.ts';
import { IanaTimezone, idShape, Lang, SecretInput, str, Ulid } from './common.ts';
import { defineLane, noContent, okNoStore, ws } from './define.ts';
import { ShortCode } from './shapes.ts';

// EXT-01…05 (BACKEND-TRIAL §3.2): đã có chủ ở M1 — liệt kê để hợp đồng đủ. EXT-01…04 = L-SEC (`src/auth/`), EXT-05 = L-RT.
// Phiên = cookie `ga_session` (HttpOnly, SameSite=Strict) lấy từ EXT-01; mọi method ghi gửi `X-GA-CSRF` (trừ EXT-01).

const sec = defineLane('L-SEC');
const rt = defineLane('L-RT');

export const ACCESS_LEVELS = ['owner', 'admin', 'viewer'] as const;

export const UserView = z.strictObject({
  ...idShape('US'),
  name: str(60, 1),
  accessLevel: z.enum(ACCESS_LEVELS),
});

/** Workspace chưa có prefix display_id trong ENTITY_TYPES ⇒ chỉ `id` (ULID) + mã ngắn. */
export const WorkspaceView = z.strictObject({
  id: Ulid,
  name: str(80, 1),
  shortCode: ShortCode,
  lang: Lang,
  timezone: IanaTimezone,
});

export const EXT_01 = sec({
  id: 'EXT-01',
  method: 'POST',
  path: '/auth/login',
  auth: 'public',
  userPassword: true,
  o4: 'open',
  request: { body: z.strictObject({ username: str(64, 1), password: SecretInput('password') }) },
  // Set-Cookie: ga_session. Mang csrfToken ⇒ no-store.
  response: okNoStore(z.strictObject({ user: UserView, csrfToken: str(128, 16), mustChangePassword: z.boolean() })),
  // `auth.locked`: detail.retryAfterS (số giây).
  errors: ['auth.invalid_credentials', 'auth.locked'],
  cli: ['auth login'],
});

export const EXT_02 = sec({
  id: 'EXT-02',
  method: 'POST',
  path: '/auth/logout',
  auth: 'V',
  o4: 'open',
  response: noContent(),
  cli: ['auth logout'],
});

export const EXT_03 = sec({
  id: 'EXT-03',
  method: 'GET',
  path: '/auth/me',
  auth: 'V',
  o4: 'open',
  response: okNoStore(
    z.strictObject({ user: UserView, workspace: WorkspaceView, csrfToken: str(128, 16), onboardingDone: z.boolean() }),
  ),
  cli: ['auth whoami'],
});

export const EXT_04 = sec({
  id: 'EXT-04',
  method: 'POST',
  path: '/auth/password',
  auth: 'V',
  userPassword: true,
  o4: 'open',
  request: {
    body: z.strictObject({ currentPassword: SecretInput('password'), newPassword: SecretInput('password') }),
  },
  response: noContent(),
  errors: ['auth.weak_password', 'auth.invalid_credentials'],
  cli: ['auth passwd', 'auth login'],
});

/** Mã đóng WebSocket khi vé sai / hết hạn / dùng lại: đóng 4401, không mở exec (EXT-05). */
export const TERM_WS_CLOSE_UNAUTHORIZED = 4401 as const;

/**
 * WS `/term` (gốc edge, không dưới `/api/v1`): subprotocol `ga-term.v1` + `ga-ticket.<vé>` (vé ở GW-14, KHÔNG trong URL).
 * Khung text = `PtyClientMessage`, khung binary = byte PTY. Quyền theo vé: chỉ owner xin được vé ⇒ `O` + cổng `pty`.
 */
export const EXT_05 = rt({
  id: 'EXT-05',
  method: 'WS',
  path: '/term',
  mount: 'edge',
  auth: 'O',
  touchesCredential: true,
  o4: 'core',
  response: ws(PtyClientMessage, PtyServerMessage),
  cli: ['login'],
});

export const AUTH_ROUTES = [EXT_01, EXT_02, EXT_03, EXT_04, EXT_05] as const;
