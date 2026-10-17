// Họ workspace / users / auth_sessions / settings / secrets trên SQLite.
import {
  type ActorSystemKey,
  isSettingKey,
  parseSettingValue,
  SETTINGS,
  type SettingKey,
  SYSTEM_WORKSPACE_ID,
} from '@ga/contracts';
import { DbRuleError, invalidInput, notFound } from '../errors.ts';
import { dml } from '../sql.ts';
import type {
  ActorRow,
  AuthSessionRow,
  MemberRow,
  SecretRow,
  SettingRow,
  SetupChecklistView,
  UserRow,
  WorkspaceRow,
} from '../types.ts';
import type { AuthSessionRepo, SecretRepo, SettingsRepo, SettingValue, UserRepo, WorkspaceRepo } from '../workspace.ts';
import {
  audited,
  type Ctx,
  getRow,
  insertRow,
  mustGetRow,
  nowTs,
  requireW,
  selectAll,
  selectOne,
  softDeleteRow,
  updateRow,
  Where,
} from './ctx.ts';

export function workspaceRepo(ctx: Ctx): WorkspaceRepo {
  const actorWhere = () => new Where(ctx);
  return {
    get: () => {
      const w = ctx.r.get<WorkspaceRow>('SELECT * FROM workspaces WHERE id = ?', [ctx.ws]);
      if (w === undefined) throw notFound(`workspace ${ctx.ws}`);
      return w;
    },
    members: () =>
      ctx.r.all<MemberRow>('SELECT * FROM workspace_members WHERE workspace_id = ? ORDER BY created_at, user_id', [
        ctx.ws,
      ]),
    member: (userId) =>
      ctx.r.get<MemberRow>('SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?', [
        ctx.ws,
        userId,
      ]) ?? null,
    owner: () => {
      const m = ctx.r.get<MemberRow>(
        "SELECT * FROM workspace_members WHERE workspace_id = ? AND access_level = 'owner' AND removed_at IS NULL " +
          'ORDER BY created_at, user_id LIMIT 1',
        [ctx.ws],
      );
      if (m === undefined) return null;
      const user = ctx.r.get<UserRow>('SELECT * FROM users WHERE id = ?', [m.user_id]);
      const actor = selectOne<ActorRow>(
        ctx,
        'actors',
        actorWhere().add("kind = 'user'").eq('user_id', m.user_id),
        'id',
      );
      return user && actor ? { user, member: m, actor } : null;
    },
    actor: (id) => getRow<ActorRow>(ctx, 'actors', id),
    systemActor: (key: ActorSystemKey = 'system') => {
      const a = selectOne<ActorRow>(
        ctx,
        'actors',
        actorWhere().add("kind = 'system'").eq('system_key', key).add('purged_at IS NULL'),
        'id',
      );
      if (a === null) throw notFound(`actor system '${key}' của workspace ${ctx.ws}`);
      return a;
    },
    actorForUser: (userId) =>
      selectOne<ActorRow>(ctx, 'actors', actorWhere().add("kind = 'user'").eq('user_id', userId), 'id'),
    actorForRole: (roleId) =>
      selectOne<ActorRow>(ctx, 'actors', actorWhere().add("kind = 'role'").eq('role_id', roleId), 'id'),
    setupChecklist: () =>
      ctx.r.all<SetupChecklistView>('SELECT * FROM v_setup_checklist WHERE workspace_id = ?', [ctx.ws]),
    update: (patch) => {
      const w = requireW(ctx);
      const before = ctx.r.get<WorkspaceRow>('SELECT * FROM workspaces WHERE id = ?', [ctx.ws]);
      if (before === undefined) throw notFound(`workspace ${ctx.ws}`);
      const [row] = dml(w).write(
        'UPDATE workspaces SET name = COALESCE(?, name), locale = COALESCE(?, locale), timezone = COALESCE(?, timezone), ' +
          'updated_at = ? WHERE id = ? RETURNING *',
        [patch.name, patch.locale, patch.timezone, nowTs(ctx), ctx.ws],
      ).rows as WorkspaceRow[];
      if (row === undefined) throw notFound(`workspace ${ctx.ws}`);
      return audited(ctx, { action: 'workspace.update', table: 'workspaces', row, before });
    },
    addMember: ({ userId, accessLevel }) => {
      const w = requireW(ctx);
      const user = ctx.r.get<UserRow>('SELECT * FROM users WHERE id = ?', [userId]);
      if (user === undefined) throw notFound(`user ${userId}`);
      const [member] = dml(w).write(
        'INSERT INTO workspace_members (workspace_id, user_id, access_level, created_at) VALUES (?, ?, ?, ?) RETURNING *',
        [ctx.ws, userId, accessLevel, nowTs(ctx)],
      ).rows as MemberRow[];
      const existing = selectOne<ActorRow>(
        ctx,
        'actors',
        actorWhere().add("kind = 'user'").eq('user_id', userId),
        'id',
      );
      const actor =
        existing ??
        (dml(w).write(
          "INSERT INTO actors (id, workspace_id, kind, user_id, label, created_at) VALUES (?, ?, 'user', ?, ?, ?) RETURNING *",
          [ctx.newId(), ctx.ws, userId, user.display_name, nowTs(ctx)],
        ).rows[0] as ActorRow);
      if (member === undefined) throw notFound('workspace_members: INSERT không trả hàng');
      audited(ctx, {
        action: 'workspace_member.add',
        table: 'workspace_members',
        row: { id: userId, ...member },
        detail: { access_level: accessLevel },
      });
      return { member, actor };
    },
    setAccessLevel: (userId, accessLevel) =>
      memberUpdate(ctx, userId, 'access_level = ?', [accessLevel], 'workspace_member.access'),
    removeMember: (userId) => memberUpdate(ctx, userId, 'removed_at = ?', [nowTs(ctx)], 'workspace_member.remove'),
  };
}

function memberUpdate(ctx: Ctx, userId: string, set: string, params: unknown[], action: string): MemberRow {
  const w = requireW(ctx);
  const before = ctx.r.get<MemberRow>('SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?', [
    ctx.ws,
    userId,
  ]);
  if (before === undefined) throw notFound(`thành viên ${userId}`);
  const [row] = dml(w).write(`UPDATE workspace_members SET ${set} WHERE workspace_id = ? AND user_id = ? RETURNING *`, [
    ...params,
    ctx.ws,
    userId,
  ]).rows as MemberRow[];
  if (row === undefined) throw notFound(`thành viên ${userId}`);
  audited(ctx, { action, table: 'workspace_members', row: { id: userId, ...row }, before: { id: userId, ...before } });
  return row;
}

/** users toàn cục: chỉ sửa user là thành viên của workspace giao dịch (hoặc giao dịch ở workspace hệ thống). */
function assertUserInScope(ctx: Ctx, userId: string): UserRow {
  const user = ctx.r.get<UserRow>('SELECT * FROM users WHERE id = ?', [userId]);
  if (user === undefined) throw notFound(`user ${userId}`);
  if (ctx.ws !== SYSTEM_WORKSPACE_ID) {
    const m = ctx.r.get('SELECT 1 AS ok FROM workspace_members WHERE workspace_id = ? AND user_id = ?', [
      ctx.ws,
      userId,
    ]);
    if (m === undefined) throw notFound(`user ${userId}`);
  }
  return user;
}

function userUpdate(ctx: Ctx, userId: string, sets: Record<string, unknown>, action: string, audit = true): UserRow {
  const w = requireW(ctx);
  const before = assertUserInScope(ctx, userId);
  const keys = Object.keys(sets).filter((k) => sets[k] !== undefined);
  const [row] = dml(w).write(
    `UPDATE users SET ${[...keys.map((k) => `${k} = ?`), 'updated_at = ?'].join(', ')} WHERE id = ? RETURNING *`,
    [...keys.map((k) => sets[k]), nowTs(ctx), userId],
  ).rows as UserRow[];
  if (row === undefined) throw notFound(`user ${userId}`);
  return audit ? audited(ctx, { action, table: 'users', row, before }) : row;
}

const USER_COLUMNS = new Set([
  'password_hash',
  'must_change_password',
  'password_changed_at',
  'failed_login_count',
  'locked_until',
  'last_login_at',
  'display_name',
  'email',
  'locale',
  'timezone',
]);

export function userRepo(ctx: Ctx): UserRepo {
  const upd = (id: string, sets: Record<string, unknown>, action: string) => {
    for (const k of Object.keys(sets)) if (!USER_COLUMNS.has(k)) throw invalidInput(`users: cột ${k}`);
    return userUpdate(ctx, id, sets, action);
  };
  return {
    get: (id) => {
      try {
        return assertUserInScope(ctx, id);
      } catch (e) {
        if (e instanceof DbRuleError && e.rule === 'repo.not_found') return null;
        throw e;
      }
    },
    byUsername: (username) => {
      const u = ctx.r.get<UserRow>('SELECT * FROM users WHERE username = ?', [username]);
      if (u === undefined) return null;
      if (ctx.ws === SYSTEM_WORKSPACE_ID) return u;
      const m = ctx.r.get('SELECT 1 AS ok FROM workspace_members WHERE workspace_id = ? AND user_id = ?', [
        ctx.ws,
        u.id,
      ]);
      return m === undefined ? null : u;
    },
    setPassword: (id, i) =>
      upd(
        id,
        {
          password_hash: i.passwordHash,
          must_change_password: i.mustChangePassword ? 1 : 0,
          password_changed_at: nowTs(ctx),
          failed_login_count: 0,
          locked_until: null,
        },
        'user.password_change',
      ),
    recordLoginSuccess: (id) =>
      upd(id, { last_login_at: nowTs(ctx), failed_login_count: 0, locked_until: null }, 'user.login_ok'),
    recordLoginFailure: (id, i) => {
      const u = assertUserInScope(ctx, id);
      return upd(
        id,
        {
          failed_login_count: u.failed_login_count + 1,
          locked_until: i.lockUntil === undefined ? u.locked_until : i.lockUntil,
        },
        'user.login_failed',
      );
    },
    updateProfile: (id, p) =>
      upd(id, { display_name: p.displayName, email: p.email, locale: p.locale, timezone: p.timezone }, 'user.update'),
  };
}

export function authSessionRepo(ctx: Ctx): AuthSessionRepo {
  const scoped = (row: AuthSessionRow | undefined): AuthSessionRow | null => {
    if (row === undefined) return null;
    if (ctx.ws === SYSTEM_WORKSPACE_ID) return row;
    const m = ctx.r.get('SELECT 1 AS ok FROM workspace_members WHERE workspace_id = ? AND user_id = ?', [
      ctx.ws,
      row.user_id,
    ]);
    return m === undefined ? null : row;
  };
  const mustGet = (id: string) => {
    const row = scoped(ctx.r.get<AuthSessionRow>('SELECT * FROM auth_sessions WHERE id = ?', [id]));
    if (row === null) throw notFound(`auth_session ${id}`);
    return row;
  };
  const set = (id: string, sql: string, params: unknown[]): AuthSessionRow => {
    mustGet(id);
    const [row] = dml(requireW(ctx)).write(`UPDATE auth_sessions SET ${sql} WHERE id = ? RETURNING *`, [...params, id])
      .rows as AuthSessionRow[];
    if (row === undefined) throw notFound(`auth_session ${id}`);
    return row;
  };
  return {
    byTokenHash: (h) => scoped(ctx.r.get<AuthSessionRow>('SELECT * FROM auth_sessions WHERE token_hash = ?', [h])),
    create: (i) => {
      assertUserInScope(ctx, i.userId);
      const [row] = dml(requireW(ctx)).write(
        'INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, last_seen_at, ip, user_agent, created_at) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *',
        [ctx.newId(), i.userId, i.tokenHash, i.expiresAt, nowTs(ctx), i.ip ?? null, i.userAgent ?? null, nowTs(ctx)],
      ).rows as AuthSessionRow[];
      if (row === undefined) throw notFound('auth_sessions: INSERT không trả hàng');
      return row;
    },
    touch: (id, i) =>
      set(id, 'last_seen_at = ?, expires_at = COALESCE(?, expires_at)', [nowTs(ctx), i?.expiresAt ?? null]),
    revoke: (id) => set(id, 'revoked_at = COALESCE(revoked_at, ?)', [nowTs(ctx)]),
    revokeAllForUser: (userId) => {
      assertUserInScope(ctx, userId);
      return dml(requireW(ctx)).write(
        'UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
        [nowTs(ctx), userId],
      ).changes;
    },
  };
}

export function settingsRepo(ctx: Ctx): SettingsRepo {
  const live = (key: string) => selectOne<SettingRow>(ctx, 'settings', new Where(ctx, { live: true }).eq('key', key));
  return {
    get: <K extends SettingKey>(key: K): SettingValue<K> | null => {
      const row = live(key);
      if (row === null) {
        const d = SETTINGS[key].default;
        return d === 'seed' || d === 'absent' ? null : (d as SettingValue<K>);
      }
      try {
        return parseSettingValue(key, JSON.parse(row.value_json));
      } catch (e) {
        throw new DbRuleError(
          'repo.invalid_input',
          `settings ${key} (${row.display_id}): giá trị trong DB không qua schema`,
          {
            cause: e,
          },
        );
      }
    },
    row: (key) => live(key),
    list: () => selectAll<SettingRow>(ctx, 'settings', new Where(ctx, { live: true })),
    set: (key, value) => {
      if (!isSettingKey(key)) throw invalidInput(`khoá settings lạ: ${String(key)}`);
      let json: string;
      try {
        json = JSON.stringify(parseSettingValue(key, value));
      } catch (e) {
        throw new DbRuleError('repo.invalid_input', `settings ${key}: giá trị không qua schema`, { cause: e });
      }
      const before = live(key);
      const row =
        before === null
          ? insertRow<SettingRow>(ctx, 'settings', { key, value_json: json })
          : updateRow<SettingRow>(ctx, 'settings', before.id, { value_json: json });
      return audited(ctx, { action: 'settings.set', table: 'settings', row, before, detail: { key } });
    },
    remove: (key) => {
      const before = live(key);
      if (before === null) return;
      const row = softDeleteRow<SettingRow>(ctx, 'settings', before.id);
      audited(ctx, { action: 'settings.remove', table: 'settings', row, before, detail: { key } });
    },
  };
}

export function secretRepo(ctx: Ctx): SecretRepo {
  return {
    get: (id) => getRow<SecretRow>(ctx, 'secrets', id),
    list: (f) =>
      selectAll<SecretRow>(ctx, 'secrets', new Where(ctx, { live: true }).eq('kind', f?.kind).eq('status', f?.status)),
    create: (i) => {
      const row = insertRow<SecretRow>(ctx, 'secrets', {
        kind: i.kind,
        label: i.label,
        ciphertext: i.ciphertext,
        nonce: i.nonce,
        wrapped_dek: i.wrappedDek,
        dek_nonce: i.dekNonce,
        kek_id: i.kekId,
        alg: i.alg,
        last4: i.last4 ?? null,
        fingerprint: i.fingerprint,
        allowed_host: i.allowedHost ?? null,
        rotated_from_id: i.rotatedFromId ?? null,
      });
      return audited(ctx, { action: 'secret.create', table: 'secrets', row });
    },
    revoke: (id) => {
      const before = mustGetRow<SecretRow>(ctx, 'secrets', id);
      const row = updateRow<SecretRow>(ctx, 'secrets', id, { status: 'revoked' });
      return audited(ctx, { action: 'secret.revoke', table: 'secrets', row, before });
    },
    markUsed: (id) => {
      mustGetRow<SecretRow>(ctx, 'secrets', id);
      updateRow<SecretRow>(ctx, 'secrets', id, { last_used_at: nowTs(ctx) }, { bumpVersion: false });
    },
  };
}
