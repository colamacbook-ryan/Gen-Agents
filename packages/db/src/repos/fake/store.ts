// Fake DataStore trong RAM (tối thiểu) — để M2 viết test trước khi repo SQLite xong. Cùng interface với store thật.
// GIỚI HẠN (đọc trước khi dùng):
//   - KHÔNG ép trigger / CHECK / FK của DB (Core agent, ví, cổng người ghi, append-only…). Test về guard / luật DB phải
//     chạy trên store SQLite thật (createSqliteStore / fixture testing/fixtures/seed).
//   - View (v_*) trả mảng rỗng / null trừ khi test tự đặt qua `fake.views`.
//   - Audit: row_hash = sha256 (không HMAC) — chỉ để giữ hình dạng chuỗi.
//   - Phạm vi tenant, cấp display_id, version lạc quan, rollback khi lỗi: CÓ (giống store thật).
import { createHash } from 'node:crypto';
import {
  type ActorSystemKey,
  type Clock,
  canonicalJson,
  type EntityPrefix,
  isSettingKey,
  parseDisplayId,
  parseSettingValue,
  SETTINGS,
  type SeedRef,
  type SeedReference,
  type SeedTable,
  type SettingKey,
  SYSTEM_WORKSPACE_ID,
  systemClock,
  toDbTimestamp,
} from '@ga/contracts';
import { counterWorkspace, formatDisplayId, type IdGenerator, prefixOf, ulidGenerator } from '../../ids/index.ts';
import { seedIdFor } from '../../seed/ids.ts';
import type { SeedApplyResult } from '../../seed/reference.ts';
import { stampInsert, stampSoftDelete, stampUpdate } from '../../stamp.ts';
import type { AuditEntryInput, AuditRepo } from '../audit.ts';
import type { AvatarRepo } from '../avatar.ts';
import type { EngineRepo } from '../engines.ts';
import { DbRuleError, invalidInput, notFound } from '../errors.ts';
import type { ChangeItemInput, ChangeSetRepo, DnaReads, InstructionReads, RevisionReads, RoleRepo } from '../roles.ts';
import type { ChatRepo, SessionRepo } from '../sessions.ts';
import type { CreatedTenant, CreateTenantInput, CreateUserInput, DataStore, ReadTx, WriteTx } from '../store.ts';
import type { TelegramRepo } from '../telegram.ts';
import {
  type ActorRow,
  PAGE_DEFAULT,
  PAGE_MAX,
  type Page,
  type PageRequest,
  type UserRow,
  type WorkspaceRow,
  type WriteOptions,
} from '../types.ts';
import type { WalletRepo } from '../wallet.ts';
import type { JobRepo, TaskRepo } from '../work.ts';
import type { AuthSessionRepo, SecretRepo, SettingsRepo, UserRepo, WorkspaceRepo } from '../workspace.ts';
import { baselineSchema, MemDb, type MemRow } from './mem.ts';

export interface FakeViews {
  coreAgentStatus: Record<string, unknown> | null;
  coreAgentAccounts: Record<string, unknown>[];
  roleAvatarStates: Record<string, unknown>[];
  leaderboard: Record<string, unknown>[];
}

export interface FakeStore extends DataStore {
  readonly db: MemDb;
  /** Hàng view do test tự đặt (fake không tính view). */
  readonly views: FakeViews;
}

const cast = <T>(r: unknown): T => r as T;

function pageOf<T>(rows: MemRow[], page: PageRequest | undefined): Page<T> {
  const limit = Math.min(Math.max(page?.limit ?? PAGE_DEFAULT, 1), PAGE_MAX);
  const desc = page?.order === 'desc';
  const seq = (r: MemRow) => Number(r.display_seq);
  let sorted = [...rows].sort((a, b) => (desc ? seq(b) - seq(a) : seq(a) - seq(b)));
  if (page?.after !== undefined) {
    const after = page.after;
    sorted = sorted.filter((r) => (desc ? seq(r) < after : seq(r) > after));
  }
  const items = sorted.slice(0, limit);
  const last = items[items.length - 1];
  return {
    items: items as unknown as T[],
    nextAfter: sorted.length > limit && last !== undefined ? seq(last) : null,
  };
}

export function createFakeStore(opts: { clock?: Clock; newId?: IdGenerator } = {}): FakeStore {
  const clock = opts.clock ?? systemClock;
  const newId = opts.newId ?? ulidGenerator(clock);
  const db = new MemDb();
  const views: FakeViews = { coreAgentStatus: null, coreAgentAccounts: [], roleAvatarStates: [], leaderboard: [] };
  const now = () => toDbTimestamp(clock.now());
  const T = (name: string) => db.t(name);

  function transaction<R>(body: () => R): R {
    const snap = db.snapshot();
    try {
      const out = body();
      if (out instanceof Promise) throw new Error('fake: giao dịch chỉ nhận hàm đồng bộ');
      return out;
    } catch (e) {
      db.restore(snap);
      throw e;
    }
  }

  function nextSeq(ws: string, prefix: EntityPrefix): { display_seq: number; display_id: string } {
    const cws = counterWorkspace(prefix, ws);
    const key = `${cws}|${prefix}`;
    const c = T('id_counters').get(key);
    const seq = (c ? Number(c.last_seq) : 0) + 1;
    if (c) T('id_counters').update(key, { last_seq: seq });
    else T('id_counters').insert({ workspace_id: cws, prefix, last_seq: seq }, now());
    return { display_seq: seq, display_id: formatDisplayId(prefix, seq) };
  }

  // ------------------------------------------------------------------ một ngữ cảnh giao dịch
  function makeTx(ws: string, actorId: string | null, rawOptions: WriteOptions): WriteTx {
    const options = {
      ...rawOptions,
      channel: rawOptions.channel ?? 'system',
      requestId: rawOptions.requestId ?? newId(),
    };
    let actorRow: ActorRow | null = null;
    if (actorId !== null) {
      const a = T('actors').get(actorId);
      if (!a || a.purged_at !== null) throw new DbRuleError('repo.unknown_actor', `actor ${actorId} không tồn tại`);
      actorRow = cast<ActorRow>(a);
    }
    const requireWrite = (): string => {
      if (actorId === null) throw new Error('fake: ghi trong store.read()');
      return actorId;
    };
    const inWs = (r: MemRow | null): r is MemRow => r !== null && r.workspace_id === ws;
    const mustGet = (table: string, id: string): MemRow => {
      const r = T(table).get(id);
      if (!inWs(r)) throw notFound(`${table} ${id}`);
      return r;
    };
    const getOrNull = (table: string, id: string): MemRow | null => {
      const r = T(table).get(id);
      return inWs(r) ? r : null;
    };
    const live = (table: string, pred: (r: MemRow) => boolean = () => true) =>
      T(table).find((r) => r.workspace_id === ws && (r.deleted_at === undefined || r.deleted_at === null) && pred(r));
    const byDisplayId = (table: string, displayId: string): MemRow | null => {
      const p = parseDisplayId(displayId);
      if (p === null || p.table !== table) return null;
      return T(table).find((r) => r.workspace_id === ws && r.display_seq === p.seq)[0] ?? null;
    };
    const hasCol = (table: string, col: string) => columnsOf(table).has(col);
    const insertE = (table: string, values: Record<string, unknown>): MemRow => {
      const by = requireWrite();
      const prefix = prefixOf(table);
      const row: Record<string, unknown> = { id: newId(), workspace_id: ws, ...values };
      if (prefix !== null && hasCol(table, 'display_seq')) Object.assign(row, nextSeq(ws, prefix));
      if (hasCol(table, 'created_by')) row.created_by = by;
      if (hasCol(table, 'created_at')) row.created_at = now();
      return T(table).insert(row, now());
    };
    const updateE = (
      table: string,
      id: string,
      patch: Record<string, unknown>,
      o: { expectedVersion?: number; bump?: boolean } = {},
    ): MemRow => {
      const by = requireWrite();
      const cur = mustGet(table, id);
      if (o.expectedVersion !== undefined && cur.version !== o.expectedVersion) {
        throw new DbRuleError('repo.version_conflict', `${table} ${id}: version ${cur.version} ≠ ${o.expectedVersion}`);
      }
      const full: Record<string, unknown> = { ...patch };
      if (hasCol(table, 'updated_by')) full.updated_by = by;
      if (hasCol(table, 'updated_at')) full.updated_at = now();
      if (o.bump !== false && hasCol(table, 'version')) full.version = Number(cur.version) + 1;
      return T(table).update(id, full);
    };
    const softDelete = (table: string, id: string) =>
      updateE(
        table,
        id,
        hasCol(table, 'deleted_by')
          ? stampSoftDelete({ actorId: requireWrite() }, { deleted_at: now() })
          : { deleted_at: now() },
      );

    // ---------------------------------------------------------------- audit (chuỗi sha256 của fake)
    const auditHead = () => {
      const rows = T('audit_log').find((r) => r.workspace_id === ws);
      rows.sort((a, b) => Number(b.display_seq) - Number(a.display_seq));
      return rows[0] ?? null;
    };
    const appendAudit = (e: AuditEntryInput): MemRow => {
      const by = requireWrite();
      const head = auditHead();
      const actor = actorRow as ActorRow;
      const body = {
        action: e.action,
        result: e.result ?? 'ok',
        actor_id: by,
        actor_label: actor.label,
        actor_kind: actor.kind,
        role_id: e.roleId ?? null,
        entity_type: e.entity?.type ?? null,
        entity_id: e.entity?.id ?? null,
        entity_display_id: e.entity?.displayId ?? null,
        before_json: e.before ? canonicalJson(e.before) : null,
        after_json: e.after ? canonicalJson(e.after) : null,
        detail_json: e.detail ? canonicalJson(e.detail) : null,
        reason: e.reason ?? options.reason ?? null,
        tool: e.tool ?? options.tool ?? null,
        session_id: e.sessionId ?? options.sessionId ?? null,
        task_id: e.taskId ?? options.taskId ?? null,
        channel: e.channel ?? options.channel ?? 'system',
        request_id: options.requestId,
        ip_hash: options.ipHash ?? null,
        tokens_total: e.tokensTotal ?? null,
        cost_micro_usd: e.costMicroUsd ?? null,
      };
      const prev = head ? String(head.row_hash) : null;
      const rowHash = createHash('sha256')
        .update(`${prev ?? ''}|${canonicalJson(body)}`)
        .digest('hex');
      return insertE('audit_log', { ...body, hash_key_id: 'fake', prev_hash: prev, row_hash: rowHash });
    };
    const audited = <R extends MemRow>(action: string, table: string, row: R, after?: Record<string, unknown>): R => {
      appendAudit({
        action,
        entity: { type: table, id: String(row.id), displayId: (row.display_id as string | null) ?? null },
        after: after ?? null,
      });
      return row;
    };

    // ---------------------------------------------------------------- workspace / users / settings / secrets
    const workspace: WorkspaceRepo = {
      get: () => {
        const w = T('workspaces').get(ws);
        if (!w) throw notFound(`workspace ${ws}`);
        return cast(w);
      },
      members: () => cast(T('workspace_members').find((r) => r.workspace_id === ws)),
      member: (userId) => cast(T('workspace_members').get(`${ws}|${userId}`)),
      owner: () => {
        const m = T('workspace_members').find(
          (r) => r.workspace_id === ws && r.access_level === 'owner' && r.removed_at === null,
        )[0];
        if (!m) return null;
        const user = T('users').get(String(m.user_id));
        const actor = T('actors').find((a) => a.workspace_id === ws && a.user_id === m.user_id)[0];
        if (!user || !actor) return null;
        return { user: cast(user), member: cast(m), actor: cast(actor) };
      },
      actor: (id) => cast(getOrNull('actors', id)),
      systemActor: (key = 'system') => {
        const a = T('actors').find((r) => r.workspace_id === ws && r.kind === 'system' && r.system_key === key)[0];
        if (!a) throw notFound(`actor system '${key}' của workspace ${ws}`);
        return cast(a);
      },
      actorForUser: (userId) => cast(T('actors').find((r) => r.workspace_id === ws && r.user_id === userId)[0] ?? null),
      actorForRole: (roleId) => cast(T('actors').find((r) => r.workspace_id === ws && r.role_id === roleId)[0] ?? null),
      setupChecklist: () => [],
      update: (patch) => {
        requireWrite();
        return cast(T('workspaces').update(ws, { ...patch, updated_at: now() }));
      },
      addMember: ({ userId, accessLevel }) => {
        requireWrite();
        const user = T('users').get(userId);
        if (!user) throw notFound(`user ${userId}`);
        const member = T('workspace_members').insert(
          { workspace_id: ws, user_id: userId, access_level: accessLevel },
          now(),
        );
        const existing = T('actors').find((a) => a.workspace_id === ws && a.user_id === userId)[0];
        const actor =
          existing ??
          T('actors').insert(
            { id: newId(), workspace_id: ws, kind: 'user', user_id: userId, label: String(user.display_name) },
            now(),
          );
        appendAudit({ action: 'workspace_member.add', entity: { type: 'workspace_members', id: userId } });
        return { member: cast(member), actor: cast(actor) };
      },
      setAccessLevel: (userId, accessLevel) => {
        requireWrite();
        return cast(T('workspace_members').update(`${ws}|${userId}`, { access_level: accessLevel }));
      },
      removeMember: (userId) => {
        requireWrite();
        return cast(T('workspace_members').update(`${ws}|${userId}`, { removed_at: now() }));
      },
    };

    const users: UserRepo = {
      get: (id) => cast(T('users').get(id)),
      byUsername: (u) => cast(T('users').find((r) => r.username === u)[0] ?? null),
      setPassword: (id, i) => {
        requireWrite();
        return cast(
          T('users').update(id, {
            password_hash: i.passwordHash,
            must_change_password: i.mustChangePassword,
            password_changed_at: now(),
            failed_login_count: 0,
            locked_until: null,
            updated_at: now(),
          }),
        );
      },
      recordLoginSuccess: (id) => {
        requireWrite();
        return cast(T('users').update(id, { last_login_at: now(), failed_login_count: 0, locked_until: null }));
      },
      recordLoginFailure: (id, i) => {
        requireWrite();
        const u = T('users').get(id);
        if (!u) throw notFound(`user ${id}`);
        return cast(
          T('users').update(id, {
            failed_login_count: Number(u.failed_login_count) + 1,
            locked_until: i.lockUntil ?? u.locked_until,
          }),
        );
      },
      updateProfile: (id, p) => {
        requireWrite();
        return cast(
          T('users').update(id, {
            display_name: p.displayName,
            email: p.email,
            locale: p.locale,
            timezone: p.timezone,
            updated_at: now(),
          }),
        );
      },
    };

    const authSessions: AuthSessionRepo = {
      byTokenHash: (h) => cast(T('auth_sessions').find((r) => r.token_hash === h)[0] ?? null),
      create: (i) => {
        requireWrite();
        return cast(
          T('auth_sessions').insert(
            {
              id: newId(),
              user_id: i.userId,
              token_hash: i.tokenHash,
              expires_at: i.expiresAt,
              ip: i.ip ?? null,
              user_agent: i.userAgent ?? null,
              last_seen_at: now(),
            },
            now(),
          ),
        );
      },
      touch: (id, i) => {
        requireWrite();
        return cast(T('auth_sessions').update(id, { last_seen_at: now(), expires_at: i?.expiresAt }));
      },
      revoke: (id) => {
        requireWrite();
        return cast(T('auth_sessions').update(id, { revoked_at: now() }));
      },
      revokeAllForUser: (userId) => {
        requireWrite();
        const rows = T('auth_sessions').find((r) => r.user_id === userId && r.revoked_at === null);
        for (const r of rows) T('auth_sessions').update(String(r.id), { revoked_at: now() });
        return rows.length;
      },
    };

    const settingRow = (key: string) => live('settings', (r) => r.key === key)[0] ?? null;
    const settings: SettingsRepo = {
      get: <K extends SettingKey>(key: K) => {
        const r = settingRow(key);
        if (r === null) {
          const d = SETTINGS[key].default;
          return (d === 'seed' || d === 'absent' ? null : d) as ReturnType<typeof parseSettingValue<K>> | null;
        }
        try {
          return parseSettingValue(key, JSON.parse(String(r.value_json)));
        } catch (e) {
          throw new DbRuleError('repo.invalid_input', `settings ${key}: giá trị trong DB không qua schema`, {
            cause: e,
          });
        }
      },
      row: (key) => cast(settingRow(key)),
      list: () => cast(live('settings')),
      set: (key, value) => {
        if (!isSettingKey(key)) throw invalidInput(`khoá settings lạ: ${String(key)}`);
        const json = JSON.stringify(parseSettingValue(key, value));
        const cur = settingRow(key);
        const row = cur
          ? updateE('settings', String(cur.id), { value_json: json })
          : insertE('settings', { key, value_json: json });
        return cast(audited('settings.set', 'settings', row, { key }));
      },
      remove: (key) => {
        const cur = settingRow(key);
        if (cur) audited('settings.remove', 'settings', softDelete('settings', String(cur.id)));
      },
    };

    const secrets: SecretRepo = {
      get: (id) => cast(getOrNull('secrets', id)),
      list: (f) =>
        cast(live('secrets', (r) => (!f?.kind || r.kind === f.kind) && (!f?.status || r.status === f.status))),
      create: (i) =>
        cast(
          audited(
            'secret.create',
            'secrets',
            insertE('secrets', {
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
            }),
          ),
        ),
      revoke: (id) => cast(audited('secret.revoke', 'secrets', updateE('secrets', id, { status: 'revoked' }))),
      markUsed: (id) => {
        mustGet('secrets', id);
        T('secrets').update(id, { last_used_at: now() });
      },
    };

    // ---------------------------------------------------------------- roles / DNA / IN / change set
    const roles: RoleRepo = {
      get: (id) => cast(getOrNull('roles', id)),
      getByDisplayId: (d) => cast(byDisplayId('roles', d)),
      list: (f) =>
        cast(
          T('roles').find(
            (r) =>
              r.workspace_id === ws &&
              (f?.includeDeleted === true || r.deleted_at === null) &&
              (!f?.lifecycle || f.lifecycle.includes(r.lifecycle_status as never)),
          ),
        ),
      view: () => null,
      promptBudget: () => null,
      positions: () => cast(live('positions')),
      defaultPosition: () => cast(live('positions', (r) => r.is_default === 1)[0] ?? null),
      create: (i) => {
        const row = insertE('roles', {
          name: i.name,
          name_norm: i.name.toLowerCase(),
          color: i.color,
          description: i.description ?? null,
          prompt_budget_tokens: i.promptBudgetTokens,
        });
        T('actors').insert({ id: newId(), workspace_id: ws, kind: 'role', role_id: row.id, label: i.name }, now());
        return cast(audited('role.create', 'roles', row, { name: i.name }));
      },
      update: (id, p, v) =>
        cast(
          audited(
            'role.update',
            'roles',
            updateE(
              'roles',
              id,
              {
                name: p.name,
                name_norm: p.name?.toLowerCase(),
                color: p.color,
                description: p.description,
                prompt_budget_tokens: p.promptBudgetTokens,
              },
              { expectedVersion: v },
            ),
          ),
        ),
      setLifecycle: (id, to, o) => {
        const cur = mustGet('roles', id);
        const born = to !== 'draft' && cur.born_at === null;
        return cast(
          audited(
            'role.lifecycle',
            'roles',
            updateE('roles', id, {
              lifecycle_status: to,
              born_at: born ? now() : undefined,
              registry_no: born ? (o?.registryNo ?? String(cur.display_id)) : undefined,
            }),
            { to },
          ),
        );
      },
      setRuntimeState: (id, state, detail) =>
        cast(
          updateE(
            'roles',
            id,
            { runtime_state: state, runtime_detail: detail ?? null, runtime_state_at: now() },
            { bump: false },
          ),
        ),
      touchActive: (id) => {
        updateE('roles', id, { last_active_at: now() }, { bump: false });
      },
      softDelete: (id) => {
        audited('role.delete', 'roles', softDelete('roles', id));
      },
    };

    const dna: DnaReads = {
      defs: () =>
        cast(T('dna_field_defs').find((r) => r.workspace_id === ws || r.workspace_id === SYSTEM_WORKSPACE_ID)),
      fields: (roleId, f) =>
        cast(live('dna_fields', (r) => r.role_id === roleId && (!f?.status || r.status === f.status))),
      field: (id) => cast(getOrNull('dna_fields', id)),
      versions: (id) => cast(T('dna_field_versions').find((r) => r.dna_field_id === id && r.workspace_id === ws)),
      sheet: () => [],
    };
    const instructions: InstructionReads = {
      list: (f) =>
        cast(
          live(
            'instructions',
            (r) =>
              (!f.roleId || r.role_id === f.roleId) &&
              (!f.positionId || r.position_id === f.positionId) &&
              (!f.layer || r.layer === f.layer) &&
              (!f.status || r.status === f.status),
          ),
        ),
      get: (id) => cast(getOrNull('instructions', id)),
      versions: (id) => cast(T('instruction_versions').find((r) => r.instruction_id === id && r.workspace_id === ws)),
    };
    const scopeRows = (s: { roleId: string } | { positionId: string } | { workspace: true }) =>
      T('revisions')
        .find(
          (r) =>
            r.workspace_id === ws &&
            ('roleId' in s
              ? r.role_id === s.roleId
              : 'positionId' in s
                ? r.position_id === s.positionId
                : r.scope === 'workspace'),
        )
        .sort((a, b) => Number(a.seq) - Number(b.seq));
    const revisions: RevisionReads = {
      get: (id) => cast(getOrNull('revisions', id)),
      list: (s) => cast(scopeRows(s)),
      latest: (s) => cast(scopeRows(s).at(-1) ?? null),
    };

    const changeSets: ChangeSetRepo = {
      get: (id) => cast(getOrNull('change_sets', id)),
      items: (id) => cast(T('change_set_items').find((r) => r.change_set_id === id && r.workspace_id === ws)),
      listOpen: (f) =>
        cast(
          live(
            'change_sets',
            (r) => r.status === 'open' && (!f?.roleId || r.role_id === f.roleId) && (!f?.scope || r.scope === f.scope),
          ),
        ),
      propose: (i) => {
        const by = requireWrite();
        if (i.items.length === 0) throw invalidInput('change set không có mục nào');
        const cs = insertE('change_sets', {
          scope: i.scope,
          role_id: i.roleId ?? null,
          position_id: i.positionId ?? null,
          proposed_by: by,
          title: i.title,
          source_thread_id: i.source?.threadId ?? null,
          source_message_id: i.source?.messageId ?? null,
          source_session_id: i.source?.sessionId ?? null,
        });
        const items = i.items.map((it) => fakeProposeItem(it, String(cs.id), i.roleId ?? null, i.positionId ?? null));
        appendAudit({ action: 'change_set.propose', entity: { type: 'change_sets', id: String(cs.id) } });
        return { changeSet: cast(cs), items: cast(items) };
      },
      apply: (id, input) => {
        const by = requireWrite();
        const cs = mustGet('change_sets', id);
        if (cs.status !== 'open') throw new DbRuleError('repo.version_conflict', `change set ${id} không còn mở`);
        const all = T('change_set_items').find((r) => r.change_set_id === id && r.status === 'pending');
        const acceptIds = new Set(input?.acceptItemIds ?? all.map((r) => String(r.id)));
        const scope = cs.role_id
          ? { roleId: String(cs.role_id) }
          : cs.position_id
            ? { positionId: String(cs.position_id) }
            : { workspace: true as const };
        const prev = scopeRows(scope).at(-1);
        const seq = prev ? Number(prev.seq) + 1 : 1;
        const revision = insertE('revisions', {
          scope: cs.scope === 'library' ? 'workspace' : cs.scope,
          role_id: cs.role_id,
          position_id: cs.position_id,
          seq,
          major: prev ? Number(prev.major) : 1,
          minor: prev ? Number(prev.minor) + 1 : 0,
          kind: input?.kind ?? (seq === 1 ? 'birth' : 'edit'),
          note: input?.note ?? null,
          change_set_id: id,
          snapshot_json: '{}',
          snapshot_hash: createHash('sha256').update('{}').digest('hex'),
          prompt_tokens: 0,
        });
        const accepted: MemRow[] = [];
        const rejected: MemRow[] = [];
        for (const it of all) {
          const ok = acceptIds.has(String(it.id));
          (ok ? accepted : rejected).push(
            T('change_set_items').update(String(it.id), { status: ok ? 'accepted' : 'rejected' }),
          );
          if (ok) fakeApplyItem(it, String(revision.id), by);
        }
        const status = rejected.length === 0 ? 'applied' : accepted.length === 0 ? 'rejected' : 'partially_applied';
        const changeSet = updateE('change_sets', id, {
          status,
          decided_at: now(),
          decided_by: by,
          revision_id: revision.id,
        });
        if (cs.role_id) updateE('roles', String(cs.role_id), { current_revision_id: revision.id });
        appendAudit({ action: 'change_set.apply', entity: { type: 'change_sets', id } });
        return {
          changeSet: cast(changeSet),
          revision: cast(revision),
          accepted: cast(accepted),
          rejected: cast(rejected),
          stale: [],
        };
      },
      reject: (id, reason) => {
        const by = requireWrite();
        for (const it of T('change_set_items').find((r) => r.change_set_id === id && r.status === 'pending')) {
          T('change_set_items').update(String(it.id), { status: 'rejected' });
        }
        const row = updateE('change_sets', id, { status: 'rejected', decided_at: now(), decided_by: by });
        appendAudit({ action: 'change_set.reject', entity: { type: 'change_sets', id }, reason: reason ?? null });
        return cast(row);
      },
    };

    function fakeProposeItem(
      it: ChangeItemInput,
      csId: string,
      roleId: string | null,
      positionId: string | null,
    ): MemRow {
      const by = requireWrite();
      const base = { id: newId(), workspace_id: ws, change_set_id: csId, op: it.op, reason: it.reason ?? null };
      if (it.target === 'dna') {
        const fieldId =
          it.op === 'create'
            ? String(
                insertE('dna_fields', {
                  role_id: roleId,
                  def_id: it.defId,
                  item_index: it.itemIndex ?? 0,
                  value_json: it.valueJson,
                  value_num: it.valueNum ?? null,
                  prose: it.prose ?? null,
                  is_in_prompt: it.isInPrompt ?? true,
                  token_count: it.tokenCount,
                  tokenizer: it.tokenizer,
                  source: it.source,
                  status: 'proposed',
                }).id,
              )
            : String(mustGet('dna_fields', it.dnaFieldId).id);
        const v = T('dna_field_versions').insert(
          stampInsert(
            { actorId: by },
            {
              id: newId(),
              workspace_id: ws,
              dna_field_id: fieldId,
              base_version: it.op === 'update' ? it.baseVersion : null,
              change_set_id: csId,
              data: canonicalJson({ value_json: it.valueJson, prose: it.prose ?? null }),
              token_count: it.tokenCount,
            },
          ),
          now(),
        );
        return T('change_set_items').insert({ ...base, dna_field_version_id: v.id }, now());
      }
      const instructionId =
        it.op === 'create'
          ? String(
              insertE('instructions', {
                role_id: it.layer === 'position' || it.layer === 'house_rules' ? null : roleId,
                position_id: it.layer === 'position' ? positionId : null,
                layer: it.layer,
                ordinal: it.ordinal,
                name: it.name,
                content: it.content,
                condition_kind: it.conditionKind ?? 'always',
                condition_value: it.conditionValue ?? null,
                engine_scope: it.engineScope ?? null,
                is_enabled: it.isEnabled ?? true,
                is_core: it.layer === 'values' || it.layer === 'persona',
                token_count: it.tokenCount,
                tokenizer: it.tokenizer,
                source: it.source,
                status: 'proposed',
                lang: it.lang ?? 'vi',
                content_hash: createHash('sha256').update(it.content).digest('hex'),
              }).id,
            )
          : String(mustGet('instructions', it.instructionId).id);
      const v = T('instruction_versions').insert(
        stampInsert(
          { actorId: by },
          {
            id: newId(),
            workspace_id: ws,
            instruction_id: instructionId,
            base_version: it.op === 'update' ? it.baseVersion : null,
            change_set_id: csId,
            data: canonicalJson(it.op === 'update' ? it.patch : { name: it.name, content: it.content }),
            token_count: it.tokenCount,
          },
        ),
        now(),
      );
      return T('change_set_items').insert({ ...base, instruction_version_id: v.id }, now());
    }

    function fakeApplyItem(item: MemRow, revisionId: string, by: string): void {
      const vTable = item.dna_field_version_id ? 'dna_field_versions' : 'instruction_versions';
      const vId = String(item.dna_field_version_id ?? item.instruction_version_id);
      const v = T(vTable).get(vId);
      if (!v) return;
      const mainTable = vTable === 'dna_field_versions' ? 'dna_fields' : 'instructions';
      const mainId = String(v.dna_field_id ?? v.instruction_id);
      const main = mustGet(mainTable, mainId);
      const nextVersion = main.status === 'proposed' ? 1 : Number(main.version) + 1;
      T(vTable).update(vId, {
        status: 'accepted',
        version: nextVersion,
        revision_id: revisionId,
        decided_at: now(),
        decided_by: by,
      });
      const data = JSON.parse(String(v.data)) as Record<string, unknown>;
      const patch: Record<string, unknown> = { status: 'active', token_count: v.token_count, version: nextVersion };
      for (const [k, val] of Object.entries(data)) if (k in main) patch[k] = val;
      T(mainTable).update(mainId, { ...stampUpdate({ actorId: by }, patch), updated_at: now() });
    }

    // ---------------------------------------------------------------- engines
    const engines: EngineRepo = {
      catalog: () => cast(T('engines').find(() => true)),
      engine: (slug) => cast(T('engines').get(slug)),
      installs: () => cast(T('engine_installs').find((r) => r.workspace_id === ws)),
      install: (slug) => cast(T('engine_installs').get(`${ws}|${slug}`)),
      account: (id) => cast(getOrNull('engine_accounts', id)),
      accounts: (f) =>
        cast(
          live(
            'engine_accounts',
            (r) => (!f?.engineSlug || r.engine_slug === f.engineSlug) && (!f?.status || r.status === f.status),
          ),
        ),
      accountsView: () => [],
      binding: (id) => cast(getOrNull('engine_bindings', id)),
      bindingsForRole: (roleId) =>
        cast(
          live('engine_bindings', (r) => r.role_id === roleId).sort((a, b) => Number(a.priority) - Number(b.priority)),
        ),
      systemBindings: () =>
        cast(
          live('engine_bindings', (r) => r.consumer_kind === 'system').sort(
            (a, b) => Number(a.priority) - Number(b.priority),
          ),
        ),
      probeRun: (id) => cast(getOrNull('probe_runs', id)),
      latestLoginCheck: (accountId) =>
        cast(
          T('probe_runs')
            .find((r) => r.workspace_id === ws && r.engine_account_id === accountId && r.trigger === 'login_check')
            .sort((a, b) => Number(b.display_seq) - Number(a.display_seq))[0] ?? null,
        ),
      capabilities: (accountId, kind) =>
        cast(live('capabilities', (r) => r.engine_account_id === accountId && (!kind || r.kind === kind))),
      coreAgentStatus: () => cast(views.coreAgentStatus as MemRow | null),
      coreAgentAccounts: () => cast(views.coreAgentAccounts as unknown as MemRow),
      container: (id) => cast(getOrNull('containers', id)),
      containerForRole: (roleId) => cast(live('containers', (r) => r.role_id === roleId)[0] ?? null),
      systemContainer: () => cast(live('containers', (r) => r.kind === 'system')[0] ?? null),
      consent: (id) => cast(getOrNull('consents', id)),
      activeConsents: (subject) =>
        cast(
          T('consents').find(
            (r) => r.workspace_id === ws && r.revoked_at === null && (!subject || r.subject === subject),
          ),
        ),
      systemAgents: () => cast(live('system_agents')),
      setInstallState: (slug, i) => {
        requireWrite();
        const key = `${ws}|${slug}`;
        const values = {
          install_state: i.installState,
          installed_version: i.installedVersion ?? null,
          failure_reason: i.failureReason ?? null,
          detail: i.detail ?? null,
          tool_restriction_version: i.toolRestrictionVersion ?? null,
          checked_at: now(),
        };
        const cur = T('engine_installs').get(key);
        const row = cur
          ? T('engine_installs').update(key, { ...values, updated_at: now() })
          : T('engine_installs').insert(
              stampInsert({ actorId: requireWrite() }, { id: newId(), workspace_id: ws, engine_slug: slug, ...values }),
              now(),
            );
        return cast(row);
      },
      createAccount: (i) =>
        cast(
          audited(
            'engine_account.create',
            'engine_accounts',
            insertE('engine_accounts', {
              engine_slug: i.engineSlug,
              label: i.label,
              auth_method: i.authMethod,
              auth_volume: i.authVolume ?? null,
              secret_id: i.secretId ?? null,
              consent_id: i.consentId ?? null,
              cli_version_pinned: i.cliVersionPinned ?? null,
            }),
          ),
        ),
      updateAccount: (id, p, v) =>
        cast(
          audited(
            'engine_account.update',
            'engine_accounts',
            updateE(
              'engine_accounts',
              id,
              { label: p.label, status: p.status, consent_id: p.consentId },
              { expectedVersion: v },
            ),
          ),
        ),
      beginLogin: (id) =>
        cast(
          audited(
            'engine_account.login_start',
            'engine_accounts',
            updateE('engine_accounts', id, { login_status: 'in_progress', login_started_at: now() }),
          ),
        ),
      recordLoginResult: (id, i) =>
        cast(
          updateE('engine_accounts', id, {
            login_status: i.loginStatus,
            login_checked_at: now(),
            account_hint: i.accountHint,
            cli_version_current: i.cliVersion,
          }),
        ),
      recordQuota: (id, i) =>
        cast(
          updateE(
            'engine_accounts',
            id,
            {
              quota_state: i.quotaState,
              quota_remaining_pct: i.remainingPct ?? null,
              quota_reset_at: i.resetAt ?? null,
              quota_scanned_at: now(),
            },
            { bump: false },
          ),
        ),
      recordOutage: (id, since) => cast(updateE('engine_accounts', id, { outage_since: since }, { bump: false })),
      createBinding: (i) =>
        cast(
          audited(
            'engine_binding.create',
            'engine_bindings',
            insertE('engine_bindings', {
              consumer_kind: i.consumerKind,
              role_id: i.roleId ?? null,
              engine_account_id: i.engineAccountId,
              priority: i.priority,
              model_key: i.modelKey ?? null,
              effort: i.effort ?? null,
            }),
          ),
        ),
      updateBinding: (id, p, v) =>
        cast(
          audited(
            'engine_binding.update',
            'engine_bindings',
            updateE(
              'engine_bindings',
              id,
              { priority: p.priority, model_key: p.modelKey, effort: p.effort, is_enabled: p.isEnabled },
              { expectedVersion: v },
            ),
          ),
        ),
      recordSelection: (id, state) =>
        cast(updateE('engine_bindings', id, { selection_state: state, selection_checked_at: now() }, { bump: false })),
      removeBinding: (id) => {
        audited('engine_binding.remove', 'engine_bindings', softDelete('engine_bindings', id));
      },
      startProbe: (i) => {
        const acc = mustGet('engine_accounts', i.engineAccountId);
        return cast(
          insertE('probe_runs', {
            engine_account_id: i.engineAccountId,
            engine_slug: acc.engine_slug,
            trigger: i.trigger,
            auth_mode: i.authMode,
            container_id: i.containerId ?? null,
            cli_version: i.cliVersion ?? null,
            started_at: now(),
          }),
        );
      },
      finishProbe: (id, i) => {
        requireWrite();
        const cur = mustGet('probe_runs', id);
        return cast(
          T('probe_runs').update(id, {
            status: i.status,
            finished_at: now(),
            duration_ms: Date.parse(now()) - Date.parse(String(cur.started_at)),
            summary_json: i.summaryJson ?? null,
            error: i.error ?? null,
          }),
        );
      },
      upsertCapabilities: (i) => {
        requireWrite();
        let inserted = 0;
        let updated = 0;
        const seen = new Set<string>();
        for (const c of i.items) {
          seen.add(`${c.kind}|${c.itemKey}`);
          const cur = live(
            'capabilities',
            (r) => r.engine_account_id === i.engineAccountId && r.kind === c.kind && r.item_key === c.itemKey,
          )[0];
          const values = {
            value_state: c.valueState,
            value_text: c.valueText ?? null,
            value_json: c.valueJson ?? null,
            unknown_reason: c.unknownReason ?? null,
            source: c.source,
            confidence: c.confidence,
            auth_mode: i.authMode,
            cli_version: i.cliVersion ?? null,
            ordinal: c.ordinal ?? null,
            last_seen_at: now(),
            last_probe_run_id: i.probeRunId,
            missing_since: null,
          };
          if (cur) {
            updateE('capabilities', String(cur.id), values, { bump: false });
            updated++;
          } else {
            insertE('capabilities', {
              engine_account_id: i.engineAccountId,
              kind: c.kind,
              item_key: c.itemKey,
              first_seen_at: now(),
              ...values,
            });
            inserted++;
          }
        }
        let missing = 0;
        for (const r of live(
          'capabilities',
          (x) => x.engine_account_id === i.engineAccountId && x.missing_since === null,
        )) {
          if (!seen.has(`${r.kind}|${r.item_key}`)) {
            updateE('capabilities', String(r.id), { missing_since: now() }, { bump: false });
            missing++;
          }
        }
        return { inserted, updated, missing };
      },
      ensureContainer: (i) => {
        const cur = live('containers', (r) => (i.kind === 'system' ? r.kind === 'system' : r.role_id === i.roleId))[0];
        if (cur) return cast(cur);
        return cast(
          audited(
            'container.create',
            'containers',
            insertE('containers', {
              kind: i.kind,
              role_id: i.roleId ?? null,
              container_name: i.containerName,
              image_ref: i.imageRef ?? null,
              desired_state: i.desiredState,
              observed_state: 'unknown',
            }),
          ),
        );
      },
      updateContainer: (id, p) =>
        cast(
          updateE(
            'containers',
            id,
            {
              desired_state: p.desiredState,
              observed_state: p.observedState,
              state_detail: p.stateDetail,
              health: p.health,
              image_ref: p.imageRef,
              image_digest: p.imageDigest,
              last_started_at: p.lastStartedAt,
              last_stopped_at: p.lastStoppedAt,
            },
            { bump: false },
          ),
        ),
      grantConsent: (i) =>
        cast(
          audited(
            'consent.grant',
            'consents',
            insertE('consents', {
              user_id: i.userId,
              consent_kind: i.consentKind,
              subject: i.subject,
              notice_version: i.noticeVersion,
              notice_hash: i.noticeHash,
              lang: i.lang ?? null,
              accepted_at: now(),
            }),
          ),
        ),
      revokeConsent: (id) => {
        requireWrite();
        mustGet('consents', id);
        return cast(audited('consent.revoke', 'consents', T('consents').update(id, { revoked_at: now() })));
      },
      updateSystemAgent: (key, p) => {
        const cur = live('system_agents', (r) => r.system_key === key)[0];
        if (!cur) throw notFound(`system_agent ${key}`);
        return cast(
          audited(
            'system_agent.update',
            'system_agents',
            updateE('system_agents', String(cur.id), {
              model_key: p.modelKey,
              effort: p.effort,
              is_enabled: p.isEnabled,
            }),
          ),
        );
      },
      recordSystemAgentSelection: (key, state) => {
        const cur = live('system_agents', (r) => r.system_key === key)[0];
        if (!cur) throw notFound(`system_agent ${key}`);
        return cast(
          updateE(
            'system_agents',
            String(cur.id),
            { selection_state: state, selection_checked_at: now() },
            { bump: false },
          ),
        );
      },
    };

    // ---------------------------------------------------------------- sessions / chat
    const sessions: SessionRepo = {
      get: (id) => cast(getOrNull('sessions', id)),
      list: (f) =>
        pageOf(
          T('sessions').find(
            (r) =>
              r.workspace_id === ws &&
              (!f?.roleId || r.role_id === f.roleId) &&
              (!f?.threadId || r.thread_id === f.threadId) &&
              (!f?.taskId || r.task_id === f.taskId) &&
              (!f?.status || f.status.includes(r.status as never)),
          ),
          f?.page,
        ),
      running: (roleId) =>
        cast(
          T('sessions').find(
            (r) => r.workspace_id === ws && r.status === 'running' && (!roleId || r.role_id === roleId),
          ),
        ),
      start: (i) =>
        cast(
          insertE('sessions', {
            agent_kind: i.agentKind,
            trigger: i.trigger,
            role_id: i.roleId ?? null,
            position_id: i.positionId ?? null,
            task_id: i.taskId ?? null,
            thread_id: i.threadId ?? null,
            engine_account_id: i.engineAccountId ?? null,
            engine_slug: i.engineSlug ?? null,
            model_key: i.modelKey ?? null,
            effort: i.effort ?? null,
            cli_version: i.cliVersion ?? null,
            compiled_prompt_id: i.compiledPromptId ?? null,
            container_id: i.containerId ?? null,
            delivered_prompt_hash: i.deliveredPromptHash ?? null,
            polaris_json: i.polaris?.json ?? null,
            polaris_render_hash: i.polaris?.renderHash ?? null,
            polaris_tokens_rendered: i.polaris?.tokensRendered ?? null,
            native_memory: i.nativeMemory,
            title: i.title ?? null,
            started_at: now(),
          }),
        ),
      setPhase: (id, phase) => {
        requireWrite();
        mustGet('sessions', id);
        return cast(T('sessions').update(id, { phase, phase_at: now() }));
      },
      finish: (id, i) => {
        requireWrite();
        const cur = mustGet('sessions', id);
        if (cur.status !== 'running') throw new DbRuleError('repo.version_conflict', `phiên ${id} đã đóng`);
        return cast(
          T('sessions').update(id, {
            status: i.status,
            ended_at: now(),
            error_code: i.errorCode ?? null,
            exit_code: i.exitCode ?? null,
            duration_ms: i.durationMs ?? Date.parse(now()) - Date.parse(String(cur.started_at)),
            cold_start_ms: i.coldStartMs ?? null,
            tokens_input: i.usage?.tokensInput ?? null,
            tokens_output: i.usage?.tokensOutput ?? null,
            tokens_cache_read: i.usage?.tokensCacheRead ?? null,
            tokens_cache_write: i.usage?.tokensCacheWrite ?? null,
            tokens_thinking: i.usage?.tokensThinking ?? null,
            cost_micro_usd: i.usage?.costMicroUsd ?? null,
            failover_count: i.failoverCount ?? cur.failover_count,
            result_json: i.resultJson ?? null,
            native_memory: i.nativeMemory ?? cur.native_memory,
            cli_session_ref: i.cliSessionRef ?? null,
          }),
        );
      },
    };

    const chat: ChatRepo = {
      thread: (id) => cast(getOrNull('chat_threads', id)),
      threads: (f) =>
        cast(
          live(
            'chat_threads',
            (r) =>
              (!f?.kind || r.kind === f.kind) &&
              (!f?.roleId || r.role_id === f.roleId) &&
              (!f?.status || r.status === f.status),
          ),
        ),
      telegramThread: (botId, chatId) =>
        cast(
          live(
            'chat_threads',
            (r) => r.telegram_bot_id === botId && r.tg_chat_id === chatId && r.status !== 'archived',
          )[0] ?? null,
        ),
      message: (id) => cast(getOrNull('chat_messages', id)),
      messages: (threadId, page) =>
        pageOf(
          T('chat_messages').find((r) => r.workspace_id === ws && r.thread_id === threadId),
          page,
        ),
      openThread: (i) =>
        cast(
          insertE('chat_threads', {
            kind: i.kind,
            agent: i.agent,
            role_id: i.roleId ?? null,
            telegram_bot_id: i.telegramBotId ?? null,
            tg_chat_id: i.tgChatId ?? null,
            title: i.title ?? null,
            screen_route: i.screenRoute ?? null,
          }),
        ),
      updateThread: (id, p) =>
        cast(updateE('chat_threads', id, { status: p.status, title: p.title, state_json: p.stateJson })),
      append: (i) => {
        const by = requireWrite();
        const th = mustGet('chat_threads', i.threadId);
        const msg = insertE('chat_messages', {
          thread_id: i.threadId,
          author_kind: i.authorKind,
          author_actor_id: i.authorActorId === undefined ? (i.authorKind === 'external' ? null : by) : i.authorActorId,
          channel: i.channel,
          content: i.content,
          status: i.status ?? 'final',
          session_id: i.sessionId ?? null,
          reply_to_id: i.replyToId ?? null,
          external_id: i.externalId ?? null,
          lang: i.lang ?? null,
          certainty: i.certainty ?? null,
          context_tokens: i.contextTokens ?? null,
          tokens_in: i.tokensIn ?? null,
          tokens_out: i.tokensOut ?? null,
        });
        T('chat_threads').update(i.threadId, {
          message_count: Number(th.message_count) + 1,
          last_message_at: now(),
        });
        return cast(msg);
      },
      finalize: (id, i) => {
        requireWrite();
        const cur = mustGet('chat_messages', id);
        if (cur.status !== 'streaming') throw new DbRuleError('append_only', `tin ${id} không ở trạng thái streaming`);
        return cast(
          T('chat_messages').update(id, {
            status: i.status,
            content: i.content,
            tokens_in: i.tokensIn,
            tokens_out: i.tokensOut,
          }),
        );
      },
      redact: (id, reason) => {
        const by = requireWrite();
        const cur = mustGet('chat_messages', id);
        if (cur.status !== 'final' && cur.status !== 'failed') {
          throw new DbRuleError('append_only', `tin ${id} không redact được ở trạng thái ${cur.status}`);
        }
        return cast(
          audited(
            'chat_message.redact',
            'chat_messages',
            T('chat_messages').update(id, {
              status: 'redacted',
              content: '',
              redacted_at: now(),
              redacted_by: by,
              redact_reason: reason,
            }),
          ),
        );
      },
    };

    // ---------------------------------------------------------------- tasks / jobs
    const tasks: TaskRepo = {
      get: (id) => cast(getOrNull('tasks', id)),
      getByDisplayId: (d) => cast(byDisplayId('tasks', d)),
      list: (f) =>
        pageOf(
          T('tasks').find(
            (r) =>
              r.workspace_id === ws &&
              (f?.includeDeleted === true || r.deleted_at === null) &&
              (!f?.assigneeRoleId || r.assignee_role_id === f.assigneeRoleId) &&
              (!f?.status || f.status.includes(r.status as never)),
          ),
          f?.page,
        ),
      create: (i) =>
        cast(
          audited(
            'task.create',
            'tasks',
            insertE('tasks', {
              title: i.title,
              description: i.description ?? null,
              source: i.source,
              requested_by: i.requestedBy ?? requireWrite(),
              assignee_role_id: i.assigneeRoleId ?? null,
              position_id: i.positionId ?? null,
              priority: i.priority,
              due_at: i.dueAt ?? null,
              status: i.status,
              thread_id: i.threadId ?? null,
              commitment_id: i.commitmentId ?? null,
              parent_task_id: i.parentTaskId ?? null,
              source_message_id: i.sourceMessageId ?? null,
            }),
          ),
        ),
      update: (id, p, v) =>
        cast(
          audited(
            'task.update',
            'tasks',
            updateE(
              'tasks',
              id,
              {
                title: p.title,
                description: p.description,
                priority: p.priority,
                due_at: p.dueAt,
                assignee_role_id: p.assigneeRoleId,
              },
              { expectedVersion: v },
            ),
          ),
        ),
      transition: (id, to, o) => {
        const cur = mustGet('tasks', id);
        const done = to === 'done' || to === 'failed' || to === 'cancelled';
        return cast(
          audited(
            'task.transition',
            'tasks',
            updateE(
              'tasks',
              id,
              {
                status: to,
                status_detail: o?.detail ?? null,
                result_summary: o?.resultSummary,
                started_at: to === 'running' && cur.started_at === null ? now() : undefined,
                completed_at: done ? now() : undefined,
              },
              { expectedVersion: o?.expectedVersion },
            ),
            { to },
          ),
        );
      },
      verify: (id, verdict) =>
        cast(
          audited(
            'task.verify',
            'tasks',
            updateE('tasks', id, {
              verification: verdict,
              verified_by: verdict === 'verified' ? requireWrite() : null,
              verified_at: verdict === 'verified' ? now() : null,
            }),
            { verdict },
          ),
        ),
      recordFailureDisclosure: (id, i) =>
        cast(
          audited(
            'task.failure_disclosure',
            'tasks',
            updateE('tasks', id, {
              failure_disclosure: i.disclosure,
              failure_report_audit_id: i.auditId ?? null,
              failure_reported_at: now(),
            }),
          ),
        ),
      addUsage: (id, i) => {
        const cur = mustGet('tasks', id);
        return cast(
          updateE(
            'tasks',
            id,
            {
              tokens_total: Number(cur.tokens_total) + i.tokens,
              cost_micro_usd: Number(cur.cost_micro_usd) + i.costMicroUsd,
            },
            { bump: false },
          ),
        );
      },
      softDelete: (id) => {
        audited('task.delete', 'tasks', softDelete('tasks', id));
      },
    };

    const jobs: JobRepo = {
      get: (id) => cast(getOrNull('jobs', id)),
      list: (f) =>
        pageOf(
          T('jobs').find(
            (r) =>
              r.workspace_id === ws &&
              (!f?.kind || r.kind === f.kind) &&
              (!f?.status || f.status.includes(r.status as never)),
          ),
          f?.page,
        ),
      enqueue: (i) => {
        requireWrite();
        if (i.dedupeKey) {
          const dup = T('jobs').find(
            (r) => r.workspace_id === ws && r.status === 'queued' && r.dedupe_key === i.dedupeKey,
          )[0];
          if (dup) return { job: cast(dup), deduped: true };
        }
        const job = insertE('jobs', {
          kind: i.kind,
          payload_json: JSON.stringify(i.payload),
          run_after: i.runAfter ?? now(),
          priority: i.priority,
          max_attempts: i.maxAttempts,
          dedupe_key: i.dedupeKey ?? null,
        });
        return { job: cast(job), deduped: false };
      },
      claim: (i) => {
        requireWrite();
        const n = now();
        const ready = T('jobs')
          .find(
            (r) =>
              r.workspace_id === ws &&
              r.status === 'queued' &&
              String(r.run_after) <= n &&
              (!i.kinds || i.kinds.includes(r.kind as never)),
          )
          .sort(
            (a, b) => Number(b.priority) - Number(a.priority) || String(a.run_after).localeCompare(String(b.run_after)),
          )
          .slice(0, i.limit ?? 1);
        const until = toDbTimestamp(new Date(Date.parse(n) + i.leaseMs));
        return cast(
          ready.map((r) =>
            T('jobs').update(String(r.id), {
              status: 'running',
              lease_owner: i.leaseOwner,
              lease_until: until,
              attempts: Number(r.attempts) + 1,
              started_at: n,
              updated_at: n,
            }),
          ) as unknown as MemRow,
        );
      },
      heartbeat: (id, owner, leaseMs) => {
        requireWrite();
        const cur = mustGet('jobs', id);
        if (cur.lease_owner !== owner || cur.status !== 'running') {
          throw new DbRuleError('repo.version_conflict', `job ${id} không còn do ${owner} giữ`);
        }
        return cast(
          T('jobs').update(id, {
            lease_until: toDbTimestamp(new Date(Date.parse(now()) + leaseMs)),
            updated_at: now(),
          }),
        );
      },
      succeed: (id, owner, result) => {
        requireWrite();
        const cur = mustGet('jobs', id);
        if (cur.lease_owner !== owner)
          throw new DbRuleError('repo.version_conflict', `job ${id} không do ${owner} giữ`);
        return cast(
          T('jobs').update(id, {
            status: 'succeeded',
            result_json: result ? JSON.stringify(result) : null,
            finished_at: now(),
            lease_owner: null,
            lease_until: null,
            updated_at: now(),
          }),
        );
      },
      fail: (id, owner, i) => {
        requireWrite();
        const cur = mustGet('jobs', id);
        if (cur.lease_owner !== owner)
          throw new DbRuleError('repo.version_conflict', `job ${id} không do ${owner} giữ`);
        const dead = Number(cur.attempts) >= Number(cur.max_attempts);
        return cast(
          T('jobs').update(id, {
            status: dead ? 'dead' : 'queued',
            last_error: i.error,
            run_after: dead ? cur.run_after : toDbTimestamp(new Date(Date.parse(now()) + (i.retryAfterMs ?? 0))),
            finished_at: dead ? now() : null,
            lease_owner: null,
            lease_until: null,
            updated_at: now(),
          }),
        );
      },
      cancel: (id) => {
        requireWrite();
        mustGet('jobs', id);
        return cast(
          T('jobs').update(id, {
            status: 'cancelled',
            finished_at: now(),
            lease_owner: null,
            lease_until: null,
            updated_at: now(),
          }),
        );
      },
      reapExpiredLeases: () => {
        requireWrite();
        const n = now();
        const expired = T('jobs').find(
          (r) => r.workspace_id === ws && r.status === 'running' && r.lease_until !== null && String(r.lease_until) < n,
        );
        for (const r of expired) {
          const dead = Number(r.attempts) >= Number(r.max_attempts);
          T('jobs').update(String(r.id), {
            status: dead ? 'dead' : 'queued',
            lease_owner: null,
            lease_until: null,
            finished_at: dead ? n : null,
            last_error: 'lease hết hạn',
            updated_at: n,
          });
        }
        return expired.length;
      },
    };

    // ---------------------------------------------------------------- ví
    const walletOf = (kind: string) => {
      const w = live('wallets', (r) => r.owner_kind === kind)[0];
      if (!w) throw notFound(`ví ${kind}`);
      return w;
    };
    const wallet: WalletRepo = {
      get: (id) => cast(getOrNull('wallets', id)),
      forRole: (roleId) => cast(live('wallets', (r) => r.role_id === roleId && r.status !== 'closed')[0] ?? null),
      treasury: () => cast(walletOf('treasury')),
      sink: () => cast(walletOf('sink')),
      entry: (id) => cast(getOrNull('ledger_entries', id)),
      entryByIdempotencyKey: (k) =>
        cast(T('ledger_entries').find((r) => r.workspace_id === ws && r.idempotency_key === k)[0] ?? null),
      entries: (f) =>
        pageOf(
          T('ledger_entries').find(
            (r) =>
              r.workspace_id === ws &&
              (!f.walletId || r.debit_wallet_id === f.walletId || r.credit_wallet_id === f.walletId) &&
              (!f.roleId || r.role_id === f.roleId),
          ),
          f.page,
        ),
      leaderboard: () => cast(views.leaderboard as unknown as MemRow),
      openWound: (roleId) =>
        cast(
          T('role_wounds').find((r) => r.workspace_id === ws && r.role_id === roleId && r.ended_at === null)[0] ?? null,
        ),
      wounds: (roleId) => cast(T('role_wounds').find((r) => r.workspace_id === ws && r.role_id === roleId)),
      openRoleWallet: (roleId) => {
        mustGet('roles', roleId);
        return cast(audited('wallet.open', 'wallets', insertE('wallets', { owner_kind: 'role', role_id: roleId })));
      },
      post: (i) => {
        const by = requireWrite();
        if (!Number.isSafeInteger(i.amountMinor) || i.amountMinor <= 0) throw invalidInput('amountMinor phải > 0');
        const debit = mustGet('wallets', i.debitWalletId);
        const credit = mustGet('wallets', i.creditWalletId);
        const debitAfter = Number(debit.balance_minor) - i.amountMinor;
        if (debitAfter < 0 && debit.allow_negative !== 1) {
          throw new DbRuleError('ledger.insufficient_funds', 'fake: ví không cho âm');
        }
        const creditAfter = Number(credit.balance_minor) + i.amountMinor;
        const entry = insertE('ledger_entries', {
          entry_type: i.entryType,
          debit_wallet_id: i.debitWalletId,
          credit_wallet_id: i.creditWalletId,
          amount_minor: i.amountMinor,
          debit_balance_after: debitAfter,
          credit_balance_after: creditAfter,
          role_id: i.roleId ?? null,
          reason: i.reason,
          task_id: i.taskId ?? null,
          session_id: i.sessionId ?? null,
          commitment_id: i.commitmentId ?? null,
          skill_id: i.skillId ?? null,
          card_id: i.cardId ?? null,
          penalty_class: i.penalty?.penaltyClass ?? null,
          penalty_rate_bp: i.penalty?.rateBp ?? null,
          basis_balance_minor: i.penalty?.rateBp ? Number(debit.balance_minor) : null,
          evidence_audit_id: i.evidenceAuditId ?? null,
          reverses_entry_id: i.reversesEntryId ?? null,
          recorded_by: by,
          approved_by: i.approvedBy ?? null,
          idempotency_key: i.idempotencyKey ?? null,
        });
        for (const [w, bal] of [
          [debit, debitAfter],
          [credit, creditAfter],
        ] as const) {
          T('wallets').update(String(w.id), {
            balance_minor: bal,
            last_entry_id: entry.id,
            entry_count: Number(w.entry_count) + 1,
            last_entry_at: now(),
          });
        }
        return cast(audited('ledger.post', 'ledger_entries', entry, { amount_minor: i.amountMinor }));
      },
    };

    // ---------------------------------------------------------------- Telegram
    const telegram: TelegramRepo = {
      bot: (id) => cast(getOrNull('telegram_bots', id)),
      botForRole: (roleId) => cast(live('telegram_bots', (r) => r.role_id === roleId)[0] ?? null),
      bots: (f) => cast(live('telegram_bots', (r) => !f?.status || f.status.includes(r.status as never))),
      allowlist: (botId) => cast(live('telegram_allowlist', (r) => r.bot_id === botId)),
      allowed: (botId, uid) =>
        cast(
          live('telegram_allowlist', (r) => r.bot_id === botId && r.tg_user_id === uid && r.status === 'active')[0] ??
            null,
        ),
      owners: (botId) =>
        cast(live('telegram_allowlist', (r) => r.bot_id === botId && r.is_owner === 1 && r.status === 'active')),
      send: (id) => cast(getOrNull('proactive_sends', id)),
      sends: (f) =>
        pageOf(
          T('proactive_sends').find(
            (r) =>
              r.workspace_id === ws &&
              (!f?.roleId || r.role_id === f.roleId) &&
              (!f?.status || f.status.includes(r.status as never)),
          ),
          f?.page,
        ),
      sentCount: (roleId, day) =>
        T('proactive_sends').find(
          (r) =>
            r.workspace_id === ws &&
            r.role_id === roleId &&
            r.day_local === day &&
            (r.status === 'sent' || r.status === 'reserved'),
        ).length,
      createBot: (i) =>
        cast(
          audited(
            'telegram_bot.create',
            'telegram_bots',
            insertE('telegram_bots', {
              role_id: i.roleId,
              bot_username: i.botUsername,
              secret_id: i.secretId,
              token_last4: i.tokenLast4 ?? null,
            }),
          ),
        ),
      setBotStatus: (id, status) =>
        cast(audited('telegram_bot.status', 'telegram_bots', updateE('telegram_bots', id, { status }), { status })),
      recordGetMe: (id, i) =>
        cast(
          updateE(
            'telegram_bots',
            id,
            i.ok
              ? { status: 'active', bot_tg_id: i.botTgId, getme_ok_at: now(), error: null }
              : { status: 'error', error: i.error },
          ),
        ),
      advanceOffset: (id, offset) => {
        const cur = mustGet('telegram_bots', id);
        if (offset < Number(cur.poll_offset)) throw invalidInput('poll_offset chỉ tiến');
        return cast(updateE('telegram_bots', id, { poll_offset: offset, last_update_at: now() }, { bump: false }));
      },
      recordPollError: (id, error) => cast(updateE('telegram_bots', id, { status: 'error', error }, { bump: false })),
      softDeleteBot: (id) => {
        audited('telegram_bot.delete', 'telegram_bots', softDelete('telegram_bots', id));
      },
      restoreBot: (id) =>
        cast(audited('telegram_bot.restore', 'telegram_bots', updateE('telegram_bots', id, { deleted_at: null }))),
      captureOwner: (botId, i) =>
        cast(
          audited(
            'telegram_allowlist.capture_owner',
            'telegram_allowlist',
            insertE('telegram_allowlist', {
              bot_id: botId,
              tg_user_id: i.tgUserId,
              display_name: i.displayName,
              is_owner: 1,
              added_via: 'capture',
            }),
          ),
        ),
      addAllowed: (botId, i) =>
        cast(
          audited(
            'telegram_allowlist.add',
            'telegram_allowlist',
            insertE('telegram_allowlist', {
              bot_id: botId,
              tg_user_id: i.tgUserId,
              display_name: i.displayName,
              added_via: i.addedVia,
            }),
          ),
        ),
      removeAllowed: (id) => {
        const cur = mustGet('telegram_allowlist', id);
        if (cur.is_owner === 1) {
          const others = live(
            'telegram_allowlist',
            (r) => r.bot_id === cur.bot_id && r.is_owner === 1 && r.status === 'active' && r.id !== id,
          );
          if (others.length === 0) throw new DbRuleError('telegram.owner_invariant', 'fake: hàng chủ sở hữu cuối cùng');
        }
        return cast(
          audited(
            'telegram_allowlist.remove',
            'telegram_allowlist',
            updateE('telegram_allowlist', id, { status: 'removed' }),
          ),
        );
      },
      reserveSend: (i) =>
        cast(
          insertE('proactive_sends', {
            role_id: i.roleId,
            trigger_kind: i.triggerKind,
            urgency: i.urgency,
            channel: i.channel,
            day_local: i.dayLocal,
            status: 'reserved',
            reserved_until: i.reservedUntil,
            idempotency_key: i.idempotencyKey ?? null,
            policy_id: i.policyId ?? null,
            task_id: i.taskId ?? null,
            commitment_id: i.commitmentId ?? null,
            proactive_job_id: i.proactiveJobId ?? null,
          }),
        ),
      recordSuppressed: (i) =>
        cast(
          insertE('proactive_sends', {
            role_id: i.roleId,
            trigger_kind: i.triggerKind,
            urgency: i.urgency,
            channel: i.channel,
            day_local: i.dayLocal,
            status: i.status,
            reason: i.reason ?? null,
            policy_id: i.policyId ?? null,
          }),
        ),
      markSent: (id, i) => {
        requireWrite();
        mustGet('proactive_sends', id);
        return cast(
          T('proactive_sends').update(id, { status: 'sent', sent_at: now(), message_id: i?.messageId ?? null }),
        );
      },
      markFailed: (id, error) => {
        requireWrite();
        mustGet('proactive_sends', id);
        return cast(T('proactive_sends').update(id, { status: 'failed', error }));
      },
      expireReservations: () => {
        requireWrite();
        const n = now();
        const rows = T('proactive_sends').find(
          (r) => r.workspace_id === ws && r.status === 'reserved' && String(r.reserved_until) < n,
        );
        for (const r of rows) T('proactive_sends').update(String(r.id), { status: 'expired' });
        return rows.length;
      },
    };

    // ---------------------------------------------------------------- audit / avatar
    const audit: AuditRepo = {
      get: (id) => cast(getOrNull('audit_log', id)),
      getByDisplayId: (d) => cast(byDisplayId('audit_log', d)),
      list: (f) =>
        pageOf(
          T('audit_log').find(
            (r) =>
              r.workspace_id === ws &&
              (!f?.action || r.action === f.action) &&
              (!f?.roleId || r.role_id === f.roleId) &&
              (!f?.entityId || r.entity_id === f.entityId) &&
              (!f?.requestId || r.request_id === f.requestId),
          ),
          f?.page,
        ),
      head: () => {
        const h = auditHead();
        return h
          ? { displaySeq: Number(h.display_seq), rowHash: String(h.row_hash), createdAt: String(h.created_at) }
          : null;
      },
      append: (e) => cast(appendAudit(e)),
    };

    const assign = (roleId: string, values: Record<string, unknown>) => {
      mustGet('roles', roleId);
      const avatar = insertE('avatars', { role_id: roleId, ...values });
      const role = updateE('roles', roleId, { avatar_id: avatar.id });
      appendAudit({ action: 'avatar.assign', entity: { type: 'avatars', id: String(avatar.id) }, roleId });
      return { avatar: cast<never>(avatar), role: cast<never>(role) };
    };
    const avatar: AvatarRepo = {
      current: (roleId) => {
        const r = getOrNull('roles', roleId);
        return r?.avatar_id ? cast(getOrNull('avatars', String(r.avatar_id))) : null;
      },
      history: (roleId) => cast(T('avatars').find((r) => r.workspace_id === ws && r.role_id === roleId)),
      state: (roleId) => cast((views.roleAvatarStates.find((r) => r.role_id === roleId) as MemRow | undefined) ?? null),
      states: () => cast(views.roleAvatarStates as unknown as MemRow),
      library: () => [],
      skinAsset: (id) => cast(getOrNull('skin_assets', id)),
      assignLibrary: (roleId, skinId) => {
        const s = mustGet('skin_assets', skinId);
        return assign(roleId, {
          source: 'library',
          skin_asset_id: skinId,
          skin_pack_slug: s.pack_slug,
          skin_asset_code: s.asset_code,
          skin_license: s.license,
          skin_attribution: s.attribution,
          skin_sha256: s.sha256,
        });
      },
      assignUpload: (roleId, i) =>
        assign(roleId, {
          source: 'upload',
          blob_id: i.blobId,
          mime: i.mime,
          size_bytes: i.sizeBytes,
          width: i.width,
          height: i.height,
          crop_x: i.crop?.x ?? null,
          crop_y: i.crop?.y ?? null,
          crop_zoom: i.crop?.zoom ?? null,
        }),
      assignMonogram: (roleId) => assign(roleId, { source: 'monogram' }),
      restore: (roleId, avatarId) => {
        const a = mustGet('avatars', avatarId);
        if (a.role_id !== roleId) throw new DbRuleError('avatar.not_own', 'fake: AV không thuộc Role này');
        return cast(updateE('roles', roleId, { avatar_id: avatarId }));
      },
      setSkinEnabled: (id, enabled) =>
        cast(
          audited('skin_asset.enable', 'skin_assets', updateE('skin_assets', id, { is_enabled: enabled }), { enabled }),
        ),
    };

    return {
      workspaceId: ws,
      now,
      actorId: actorId as string,
      actor: actorRow as ActorRow,
      options,
      workspace,
      users,
      authSessions,
      settings,
      secrets,
      roles,
      dna,
      instructions,
      revisions,
      changeSets,
      engines,
      sessions,
      chat,
      tasks,
      jobs,
      wallet,
      telegram,
      audit,
      avatar,
    };
  }

  // ------------------------------------------------------------------ seed (áp nguyên dạng tệp seed, idempotent)
  function applySeedTables(tables: readonly SeedTable[], resolve: (ref: SeedRef) => string): SeedApplyResult {
    const result: SeedApplyResult = { inserted: 0, skipped: 0 };
    for (const t of tables) {
      const table = T(t.table);
      for (const raw of t.rows) {
        const row: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(raw)) row[k] = v !== null && typeof v === 'object' ? resolve(v) : v;
        const dup = table.find((r) => t.conflictKey.every((k) => r[k] === (row[k] ?? null)));
        if (dup.length > 0) {
          result.skipped++;
          continue;
        }
        if (columnsOf(t.table).has('created_by') && row.created_by === undefined) row.created_by = seedActor;
        table.insert(row, now());
        result.inserted++;
      }
    }
    return result;
  }
  let seedActor: string | null = null;

  const store: FakeStore = {
    db,
    views,
    clock,
    read: (workspaceId, fn) => {
      if (!T('workspaces').get(workspaceId)) throw notFound(`workspace ${workspaceId}`);
      db.readOnly = true;
      try {
        return fn(makeTx(workspaceId, null, {}) as ReadTx);
      } finally {
        db.readOnly = false;
      }
    },
    write: (actorId, fn, options = {}) =>
      transaction(() => {
        const a = T('actors').get(actorId);
        if (!a) throw new DbRuleError('repo.unknown_actor', `actor ${actorId} không tồn tại`);
        return fn(makeTx(String(a.workspace_id), actorId, options));
      }),
    systemActorId: (workspaceId, key: ActorSystemKey = 'system') => {
      const a = T('actors').find(
        (r) => r.workspace_id === workspaceId && r.kind === 'system' && r.system_key === key,
      )[0];
      if (!a) throw notFound(`actor system '${key}' của workspace ${workspaceId}`);
      return String(a.id);
    },
    installGlobal: (seed) =>
      transaction(() => {
        const sys = seed.global
          .find((t) => t.table === 'actors')
          ?.rows.find((r) => r.workspace_id === SYSTEM_WORKSPACE_ID && r.system_key === 'system');
        seedActor = sys && typeof sys.id === 'string' ? sys.id : null;
        return applySeedTables(seed.global, () => {
          throw invalidInput('seed global không dùng $ref');
        });
      }),
    createUser: (i: CreateUserInput) =>
      transaction(() => {
        if (T('users').find((r) => r.username === i.username).length > 0) {
          throw new DbRuleError('unique.duplicate', `fake: username ${i.username} đã có`);
        }
        const seq = nextSeq(SYSTEM_WORKSPACE_ID, 'US');
        return cast<UserRow>(
          T('users').insert(
            {
              id: newId(),
              ...seq,
              username: i.username,
              display_name: i.displayName,
              password_hash: i.passwordHash,
              must_change_password: i.mustChangePassword ?? true,
              email: i.email ?? null,
              locale: i.locale ?? null,
              timezone: i.timezone ?? null,
            },
            now(),
          ),
        );
      }),
    createTenant: (i: CreateTenantInput, seed: SeedReference): CreatedTenant => {
      const wsId = newId();
      const actorIds: Record<string, string> = {};
      for (const t of seed.perWorkspace) {
        if (t.table !== 'actors') continue;
        for (const r of t.rows) if (typeof r.system_key === 'string') actorIds[r.system_key] = newId();
      }
      if (actorIds.system === undefined) throw invalidInput('seed thiếu actor system của tenant');
      const ownerActorId = newId();
      const created = transaction(() => {
        const user = T('users').get(i.ownerUserId);
        if (!user) throw notFound(`user ${i.ownerUserId}`);
        const w = T('workspaces').insert(
          {
            id: wsId,
            kind: 'tenant',
            slug: i.slug,
            name: i.name,
            short_code: i.shortCode,
            owner_user_id: i.ownerUserId,
            locale: i.locale,
            timezone: i.timezone,
          },
          now(),
        );
        T('workspace_members').insert({ workspace_id: wsId, user_id: i.ownerUserId, access_level: 'owner' }, now());
        T('actors').insert(
          {
            id: ownerActorId,
            workspace_id: wsId,
            kind: 'user',
            user_id: i.ownerUserId,
            label: String(user.display_name),
          },
          now(),
        );
        return w;
      });
      const seedResult = seedWorkspace(wsId, seed, actorIds);
      return {
        workspace: cast<WorkspaceRow>(created),
        systemActorId: actorIds.system,
        ownerActorId,
        seed: seedResult,
      };
    },
    ensureWorkspaceSeed: (workspaceId: string, seed: SeedReference) => seedWorkspace(workspaceId, seed, {}),
    tenants: () => cast(T('workspaces').find((r) => r.kind === 'tenant')),
  } as FakeStore;

  function seedWorkspace(workspaceId: string, seed: SeedReference, preassigned: Record<string, string>) {
    return transaction(() => {
      const existing = T('actors').find((r) => r.workspace_id === workspaceId && r.kind === 'system');
      const ids: Record<string, string> = { ...preassigned };
      for (const a of existing) ids[String(a.system_key)] = String(a.id);
      const idFor = seedIdFor(workspaceId);
      seedActor = ids.system ?? null;
      return applySeedTables(seed.perWorkspace, (ref) => {
        if (ref.$ref === 'workspace') return workspaceId;
        if (ref.$ref === 'actor') {
          const id = ids[ref.key] ?? newId();
          ids[ref.key] = id;
          if (ref.key === 'system') seedActor = id;
          return id;
        }
        return idFor(ref.key);
      });
    });
  }
  return store;
}

const columnCache = new Map<string, Set<string>>();
function columnsOf(table: string): Set<string> {
  let s = columnCache.get(table);
  if (!s) {
    s = new Set((baselineSchema().get(table) ?? []).map((c) => c.name));
    columnCache.set(table, s);
  }
  return s;
}
