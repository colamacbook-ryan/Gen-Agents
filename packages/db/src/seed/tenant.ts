// Dựng workspace tenant (Onboarding) — Gen giao L-DB 2026-10-17: lối ghi hàng `workspaces` của tenant TRƯỚC seed
// perWorkspace. Seed tham chiếu không chứa hàng này (slug / tên / short_code là dữ liệu owner nhập), còn conn.bootstrap đòi
// actor system của workspace tồn tại cuối giao dịch ⇒ MỘT giao dịch bootstrap (actor = actor system cấp trước của tenant):
//   1. hàng workspaces (owner_user_id = owner đầu tiên);
//   2. seed perWorkspace (applyWorkspaceSeedIn: 10 actor hệ thống, settings, PS-0001, ví, tác tử, tool, skin, bộ đếm);
//   3. owner đầu tiên: workspace_members (owner) + actor kind 'user'.
// Toàn bộ hoặc không gì (lỗi ⇒ rollback). Chạy lại cùng tham số = không nhân đôi (mọi bước WHERE NOT EXISTS).
// Fail-closed: id actor system truyền vào đã là actor khác (người / Role / workspace khác) ⇒ từ chối trước khi ghi.
// User (US-, bộ đếm ở workspace hệ thống) tạo bằng createInstallUser (conn.write bằng actor system của workspace hệ thống).
import { type SeedReference, SYSTEM_WORKSPACE_ID, ULID_RE } from '@ga/contracts';
import { type AppConnection, systemActorId } from '../connection.ts';
import { allocateDisplayId } from '../ids/index.ts';
import { dml } from '../repos/sql.ts';
import type { UserRow, WorkspaceRow } from '../repos/types.ts';
import { seedIdFor } from './ids.ts';
import {
  applyWorkspaceSeedIn,
  type SeedApplyResult,
  SeedReferenceError,
  type WorkspaceSeedTarget,
} from './reference.ts';

export interface TenantWorkspaceInput {
  /** ULID cấp trước của workspace tenant. */
  workspaceId: string;
  slug: string;
  name: string;
  /** 4 ký tự (CHECK) — tên container ga-sys-<short_code>. */
  shortCode: string;
  locale?: string;
  timezone?: string;
  /** ULID cấp trước cho actor hệ thống của tenant (seed tạo đủ 10 khoá; thiếu khoá nào seed dùng ⇒ lỗi). */
  actorIds: WorkspaceSeedTarget['actorIds'];
  /** Owner đầu tiên: user đã có (createInstallUser) + ULID cấp trước cho actor kind 'user' của họ trong tenant. */
  owner: { userId: string; actorId: string };
}

export interface TenantWorkspaceResult {
  workspace: WorkspaceRow;
  /** false = workspace đã có từ lần chạy trước (chạy lại idempotent). */
  created: boolean;
  seed: SeedApplyResult;
  /** Actor user của owner (id đã có nếu chạy lại). */
  ownerActorId: string;
}

function assertUlid(id: string, what: string): void {
  if (typeof id !== 'string' || !ULID_RE.test(id)) throw new SeedReferenceError(`${what} phải là ULID`);
}

/**
 * Actor system của tenant: nếu id đã tồn tại thì PHẢI là actor kind 'system', system_key 'system' của chính workspace này
 * (chạy lại). Id của người / Role / workspace khác ⇒ từ chối (không mượn danh tính để bootstrap).
 */
function assertSystemActorSlot(conn: AppConnection, workspaceId: string, actorId: string): void {
  const row = conn.db.prepare('SELECT workspace_id, kind, system_key FROM actors WHERE id = ?').get(actorId) as
    | { workspace_id: string; kind: string; system_key: string | null }
    | undefined;
  if (row === undefined) return;
  if (row.workspace_id !== workspaceId || row.kind !== 'system' || row.system_key !== 'system') {
    throw new SeedReferenceError(
      `actor ${actorId} đã tồn tại và không phải actor system của workspace ${workspaceId} — không dựng tenant bằng actor này`,
    );
  }
}

/** Tạo (hoặc hoàn tất) workspace tenant + seed + owner đầu tiên trong MỘT giao dịch bootstrap. */
export function createTenantWorkspace(
  conn: AppConnection,
  seed: SeedReference,
  input: TenantWorkspaceInput,
): TenantWorkspaceResult {
  const ws = input.workspaceId;
  assertUlid(ws, 'workspaceId');
  assertUlid(input.actorIds.system, 'actorIds.system');
  assertUlid(input.owner.userId, 'owner.userId');
  assertUlid(input.owner.actorId, 'owner.actorId');
  if (ws === SYSTEM_WORKSPACE_ID) throw new SeedReferenceError('createTenantWorkspace chỉ cho workspace tenant');
  assertSystemActorSlot(conn, ws, input.actorIds.system);

  return conn.bootstrap({ workspaceId: ws, systemActorId: input.actorIds.system }, (w) => {
    // 1. hàng workspaces
    const existing = w.get<{ kind: string; slug: string; owner_user_id: string | null }>(
      'SELECT kind, slug, owner_user_id FROM workspaces WHERE id = ?',
      [ws],
    );
    if (existing !== undefined && (existing.kind !== 'tenant' || existing.slug !== input.slug)) {
      throw new SeedReferenceError(`workspace ${ws} đã có với kind / slug khác — không ghi đè`);
    }
    if (existing !== undefined && existing.owner_user_id !== null && existing.owner_user_id !== input.owner.userId) {
      throw new SeedReferenceError(`workspace ${ws} đã có owner khác — đổi owner không đi lối này`);
    }
    const user = w.get<{ display_name: string }>('SELECT display_name FROM users WHERE id = ?', [input.owner.userId]);
    if (user === undefined) throw new SeedReferenceError(`owner ${input.owner.userId} chưa có trong users`);
    const created =
      dml(w).write(
        'INSERT INTO workspaces (id, kind, slug, name, short_code, owner_user_id, locale, timezone) ' +
          "SELECT ?, 'tenant', ?, ?, ?, ?, COALESCE(?, 'vi'), COALESCE(?, 'Asia/Ho_Chi_Minh') " +
          'WHERE NOT EXISTS (SELECT 1 FROM workspaces WHERE id = ?)',
        [ws, input.slug, input.name, input.shortCode, input.owner.userId, input.locale, input.timezone, ws],
      ).changes > 0;

    // 2. seed perWorkspace (cùng giao dịch)
    const seedResult = applyWorkspaceSeedIn(w, seed, {
      workspaceId: ws,
      actorIds: input.actorIds,
      idFor: seedIdFor(ws),
    });

    // 3. owner đầu tiên: thành viên + actor user (UNIQUE (workspace_id, user_id) ⇒ giữ actor cũ khi chạy lại)
    dml(w).write(
      "INSERT INTO workspace_members (workspace_id, user_id, access_level) SELECT ?, ?, 'owner' " +
        'WHERE NOT EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?)',
      [ws, input.owner.userId, ws, input.owner.userId],
    );
    dml(w).write(
      "INSERT INTO actors (id, workspace_id, kind, user_id, label) SELECT ?, ?, 'user', ?, ? " +
        'WHERE NOT EXISTS (SELECT 1 FROM actors WHERE workspace_id = ? AND user_id = ?)',
      [input.owner.actorId, ws, input.owner.userId, user.display_name, ws, input.owner.userId],
    );
    const owner = w.get<{ id: string }>(
      "SELECT id FROM actors WHERE workspace_id = ? AND kind = 'user' AND user_id = ?",
      [ws, input.owner.userId],
    );
    const workspace = w.get<WorkspaceRow>('SELECT * FROM workspaces WHERE id = ?', [ws]);
    if (owner === undefined || workspace === undefined) {
      throw new SeedReferenceError('createTenantWorkspace: không đọc lại được workspace / owner vừa ghi');
    }
    return { workspace, created, seed: seedResult, ownerActorId: owner.id };
  });
}

export interface InstallUserInput {
  /** ULID cấp trước. */
  userId: string;
  username: string;
  displayName: string;
  /** argon2id (L-SEC) — mật khẩu thô không bao giờ tới DB. */
  passwordHash: string;
  mustChangePassword?: boolean;
  email?: string | null;
  locale?: string | null;
  timezone?: string | null;
}

/**
 * Tạo user (US-; bộ đếm ở workspace hệ thống) bằng conn.write với actor system của workspace hệ thống — cần seed global
 * đã áp. Dùng cho owner đầu tiên (boot đầu) trước Onboarding.
 */
export function createInstallUser(conn: AppConnection, input: InstallUserInput): UserRow {
  assertUlid(input.userId, 'userId');
  const sys = systemActorId(conn, SYSTEM_WORKSPACE_ID);
  return conn.write(sys, (w) => {
    const d = allocateDisplayId(w, SYSTEM_WORKSPACE_ID, 'US');
    const [row] = dml(w).write(
      'INSERT INTO users (id, display_id, display_seq, username, email, display_name, password_hash, ' +
        'must_change_password, locale, timezone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *',
      [
        input.userId,
        d.displayId,
        d.displaySeq,
        input.username,
        input.email ?? null,
        input.displayName,
        input.passwordHash,
        input.mustChangePassword ?? true,
        input.locale ?? null,
        input.timezone ?? null,
      ],
    ).rows as UserRow[];
    if (row === undefined) throw new SeedReferenceError('createInstallUser: INSERT không trả hàng');
    return row;
  });
}
