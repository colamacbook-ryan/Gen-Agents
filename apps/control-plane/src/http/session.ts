// Phiên → actor (BACKEND-TRIAL §3.0 "Quyền"). Phiên do L-SEC kiểm (`AuthService.authenticate`: cookie, hạn, Origin, CSRF
// cho method ghi); ở đây CHỈ từ user của phiên suy ra workspace + mức quyền + actor:
//   - workspace = membership ĐANG hoạt động của user trong workspace tenant đang `active` (MVP: một user ↔ một tenant — repo
//     `addMember` chặn kéo user sang tenant khác). Không có ⇒ 403; >1 (dữ liệu lệch) ⇒ 403 (fail-closed, không đoán).
//   - KHÔNG BAO GIỜ lấy workspace / mức quyền từ body / query / header của request.
//   - `access_level` → mức của registry qua `accessLevelToAuth` (owner→O, admin→A, viewer→V; khác ⇒ null ⇒ 403).
import type { AuthLevel } from '@ga/contracts';
import type { AppConnection } from '@ga/db';
import type { AuthenticateResult, AuthRequestMeta } from '../auth/index.ts';

/** Phần AuthService mà edge cần (inject được — test dùng AuthService thật trên DB thật). */
export interface SessionAuthenticator {
  authenticate(req: AuthRequestMeta): AuthenticateResult;
}

export type MemberAccessLevel = 'owner' | 'admin' | 'viewer';
export type ActorAuthLevel = Exclude<AuthLevel, 'public'>;

/**
 * `workspace_members.access_level` → mức quyền của registry. CỤC BỘ, fail-closed — L-API đang thêm `accessLevelToAuth` vào
 * contracts (feat/m2-api); khi merge, thay hàm này bằng bản của contracts. `operator` (DB có, hợp đồng chưa định nghĩa) và
 * mọi giá trị lạ ⇒ null ⇒ 403.
 */
export function accessLevelToAuth(level: string): ActorAuthLevel | null {
  switch (level) {
    case 'owner':
      return 'O';
    case 'admin':
      return 'A';
    case 'viewer':
      return 'V';
    default:
      return null;
  }
}

/** Người gọi của một request (đóng băng). `id` = actor ULID (= app_actor() khi ghi). */
export interface Actor {
  readonly id: string;
  readonly userId: string;
  readonly workspaceId: string;
  readonly accessLevel: MemberAccessLevel;
  readonly authLevel: ActorAuthLevel;
  readonly sessionId: string;
}

export type MembershipFailure = 'no_workspace' | 'workspace_ambiguous' | 'no_actor' | 'access_level';

export type MembershipResult =
  | { ok: true; workspaceId: string; actorId: string; accessLevel: MemberAccessLevel; authLevel: ActorAuthLevel }
  | { ok: false; reason: MembershipFailure };

interface MembershipRow {
  workspace_id: string;
  access_level: string;
  actor_id: string | null;
}

const MEMBERSHIP_SQL = `
  SELECT m.workspace_id AS workspace_id, m.access_level AS access_level, a.id AS actor_id
    FROM workspace_members m
    JOIN workspaces w ON w.id = m.workspace_id
    LEFT JOIN actors a ON a.workspace_id = m.workspace_id AND a.kind = 'user' AND a.user_id = m.user_id
                      AND a.purged_at IS NULL
   WHERE m.user_id = ? AND m.removed_at IS NULL AND w.kind = 'tenant' AND w.status = 'active'
   LIMIT 2`;

/** Membership của user (kết nối CHỈ ĐỌC). */
export function resolveMembership(reader: AppConnection, userId: string): MembershipResult {
  const rows = reader.db.prepare(MEMBERSHIP_SQL).all(userId) as MembershipRow[];
  if (rows.length === 0) return { ok: false, reason: 'no_workspace' };
  if (rows.length > 1) return { ok: false, reason: 'workspace_ambiguous' };
  const r = rows[0] as MembershipRow;
  const authLevel = accessLevelToAuth(r.access_level);
  if (authLevel === null) return { ok: false, reason: 'access_level' };
  if (r.actor_id === null) return { ok: false, reason: 'no_actor' };
  return {
    ok: true,
    workspaceId: r.workspace_id,
    actorId: r.actor_id,
    accessLevel: r.access_level as MemberAccessLevel,
    authLevel,
  };
}
