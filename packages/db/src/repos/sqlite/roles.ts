// Họ Role + DNA + instructions + revision + change set (DATABASE §5.2–5.4, §7.2–7.3) trên SQLite.
// Một cửa cho mọi thứ chạm prompt: propose (T1) → apply (T2: toàn bộ hoặc không gì).
import { createHash } from 'node:crypto';
import { canonicalJson } from '@ga/contracts';
import { displaySeqFor } from '../../ids/index.ts';
import { markSearchDocumentDead, upsertSearchDocument } from '../../search/index.ts';
import { foldVi } from '../../search/normalize.ts';
import { DbRuleError, invalidInput, permissionDenied } from '../errors.ts';
import type {
  ApplyChangeSetInput,
  ApplyChangeSetResult,
  ChangeItemInput,
  ChangeSetRepo,
  DnaReads,
  InstructionReads,
  ProposeChangeSetInput,
  RevisionReads,
  RoleRepo,
} from '../roles.ts';
import { assertDnaInScope, assertLayerInScope } from '../scope.ts';
import type {
  ActorRow,
  ChangeSetItemRow,
  ChangeSetRow,
  DnaFieldDefRow,
  DnaFieldRow,
  DnaFieldVersionRow,
  DnaSheetView,
  InstructionRow,
  InstructionVersionRow,
  PolarisCheckRow,
  PositionRow,
  RevisionKind,
  RevisionRow,
  RolePromptBudgetView,
  RoleRow,
  RoleView,
} from '../types.ts';
import {
  accessOf,
  actorOf,
  allow,
  audited,
  type Ctx,
  getByDisplayId,
  getRow,
  insertRow,
  mustGetRow,
  nowTs,
  OWNER_ADMIN,
  pageOf,
  ref,
  refEngine,
  requireW,
  selectAll,
  selectOne,
  softDeleteRow,
  updateRow,
  Where,
} from './ctx.ts';
import { insertPolarisCheck } from './polaris.ts';
import { enqueueJob } from './work.ts';

const ROLE_NAME_MAX = 120;

export function roleRepo(ctx: Ctx): RoleRepo {
  const view = <T>(sql: string, ...params: unknown[]) => ctx.r.get<T>(sql, params) ?? null;
  return {
    get: (id) => getRow<RoleRow>(ctx, 'roles', id),
    getByDisplayId: (d) => getByDisplayId<RoleRow>(ctx, 'roles', displaySeqFor('roles', d)),
    list: (f) =>
      selectAll<RoleRow>(
        ctx,
        'roles',
        new Where(ctx, { live: f?.includeDeleted !== true }).in('lifecycle_status', f?.lifecycle),
      ),
    view: (id) => view<RoleView>('SELECT * FROM v_roles WHERE workspace_id = ? AND role_id = ?', ctx.ws, id),
    promptBudget: (id) =>
      view<RolePromptBudgetView>(
        'SELECT * FROM v_role_prompt_budget WHERE workspace_id = ? AND role_id = ? ORDER BY engine_account_id LIMIT 1',
        ctx.ws,
        id,
      ),
    positions: () => selectAll<PositionRow>(ctx, 'positions', new Where(ctx, { live: true })),
    polarisChecks: (roleId, page) =>
      pageOf<PolarisCheckRow>(ctx, 'polaris_checks', new Where(ctx).eq('role_id', roleId), page),
    defaultPosition: () =>
      selectOne<PositionRow>(ctx, 'positions', new Where(ctx, { live: true }).add('is_default = 1')),
    create: (i) => {
      allow(ctx, 'roles.create', OWNER_ADMIN);
      const name = i.name.trim();
      if (name.length === 0 || name.length > ROLE_NAME_MAX) throw invalidInput('tên Role rỗng / quá dài');
      const row = insertRow<RoleRow>(ctx, 'roles', {
        name,
        name_norm: foldVi(name),
        color: i.color,
        description: i.description ?? null,
        prompt_budget_tokens: i.promptBudgetTokens,
      });
      insertRow<ActorRow>(ctx, 'actors', { kind: 'role', role_id: row.id, label: name });
      indexRole(ctx, row);
      return audited(ctx, { action: 'role.create', table: 'roles', row, roleId: row.id });
    },
    update: (id, p, expectedVersion) => {
      allow(ctx, 'roles.update', OWNER_ADMIN);
      const before = mustGetRow<RoleRow>(ctx, 'roles', id);
      const name = p.name?.trim();
      if (name !== undefined && (name.length === 0 || name.length > ROLE_NAME_MAX))
        throw invalidInput('tên Role rỗng / quá dài');
      const row = updateRow<RoleRow>(
        ctx,
        'roles',
        id,
        {
          name,
          name_norm: name === undefined ? undefined : foldVi(name),
          color: p.color,
          description: p.description,
          prompt_budget_tokens: p.promptBudgetTokens,
        },
        { expectedVersion },
      );
      indexRole(ctx, row);
      return audited(ctx, { action: 'role.update', table: 'roles', row, before, roleId: id });
    },
    setLifecycle: (id, to, o) => {
      allow(ctx, 'roles.setLifecycle', OWNER_ADMIN);
      const before = mustGetRow<RoleRow>(ctx, 'roles', id);
      const born = to !== 'draft' && before.born_at === null;
      const row = updateRow<RoleRow>(ctx, 'roles', id, {
        lifecycle_status: to,
        born_at: born ? nowTs(ctx) : undefined,
        registry_no: born ? (o?.registryNo ?? before.display_id) : undefined,
      });
      indexRole(ctx, row);
      return audited(ctx, { action: 'role.lifecycle', table: 'roles', row, before, roleId: id });
    },
    setRuntimeState: (id, state, detail) => {
      allow(ctx, 'roles.setRuntimeState', ['system']);
      return updateRow<RoleRow>(
        ctx,
        'roles',
        id,
        { runtime_state: state, runtime_detail: detail ?? null, runtime_state_at: nowTs(ctx) },
        { bumpVersion: false },
      );
    },
    touchActive: (id) => {
      allow(ctx, 'roles.touchActive', ['system']);
      updateRow<RoleRow>(ctx, 'roles', id, { last_active_at: nowTs(ctx) }, { bumpVersion: false });
    },
    softDelete: (id) => {
      allow(ctx, 'roles.softDelete', OWNER_ADMIN);
      const before = mustGetRow<RoleRow>(ctx, 'roles', id);
      const row = softDeleteRow<RoleRow>(ctx, 'roles', id);
      markSearchDocumentDead(requireW(ctx), ctx.ws, 'RL', id);
      audited(ctx, { action: 'role.delete', table: 'roles', row, before, roleId: id });
    },
  };
}

function indexRole(ctx: Ctx, row: RoleRow): void {
  upsertSearchDocument(requireW(ctx), ctx.ws, {
    entityType: 'RL',
    entityId: row.id,
    displayId: row.display_id,
    roleId: row.id,
    status: row.lifecycle_status,
    title: row.name,
    body: row.description,
  });
}

export function dnaReads(ctx: Ctx): DnaReads {
  return {
    defs: () =>
      ctx.r.all<DnaFieldDefRow>(
        "SELECT * FROM dna_field_defs WHERE workspace_id IN (?, '00000000000000000000000000') AND deprecated_at IS NULL " +
          'ORDER BY ordinal, key',
        [ctx.ws],
      ),
    fields: (roleId, f) =>
      selectAll<DnaFieldRow>(
        ctx,
        'dna_fields',
        new Where(ctx, { live: true }).eq('role_id', roleId).eq('status', f?.status),
      ),
    field: (id) => getRow<DnaFieldRow>(ctx, 'dna_fields', id),
    versions: (id) =>
      ctx.r.all<DnaFieldVersionRow>(
        'SELECT * FROM dna_field_versions WHERE workspace_id = ? AND dna_field_id = ? ORDER BY created_at, id',
        [ctx.ws, id],
      ),
    sheet: (roleId) =>
      ctx.r.all<DnaSheetView>('SELECT * FROM v_dna_sheet WHERE workspace_id = ? AND role_id = ?', [ctx.ws, roleId]),
  };
}

export function instructionReads(ctx: Ctx): InstructionReads {
  return {
    list: (f) =>
      selectAll<InstructionRow>(
        ctx,
        'instructions',
        new Where(ctx, { live: true })
          .eq('role_id', f.roleId)
          .eq('position_id', f.positionId)
          .eq('layer', f.layer)
          .eq('status', f.status),
        'layer, ordinal, display_seq',
      ),
    get: (id) => getRow<InstructionRow>(ctx, 'instructions', id),
    versions: (id) =>
      ctx.r.all<InstructionVersionRow>(
        'SELECT * FROM instruction_versions WHERE workspace_id = ? AND instruction_id = ? ORDER BY created_at, id',
        [ctx.ws, id],
      ),
  };
}

type RevScope = { roleId: string } | { positionId: string } | { workspace: true };

function scopeWhere(ctx: Ctx, s: RevScope): Where {
  const w = new Where(ctx);
  if ('roleId' in s) return w.add("scope = 'role'").eq('role_id', s.roleId);
  if ('positionId' in s) return w.add("scope = 'position'").eq('position_id', s.positionId);
  return w.add("scope = 'workspace'");
}

export function revisionReads(ctx: Ctx): RevisionReads {
  return {
    get: (id) => getRow<RevisionRow>(ctx, 'revisions', id),
    list: (s) => selectAll<RevisionRow>(ctx, 'revisions', scopeWhere(ctx, s), 'seq'),
    latest: (s) => selectOne<RevisionRow>(ctx, 'revisions', scopeWhere(ctx, s), 'seq DESC'),
  };
}

// ------------------------------------------------------------------ change set
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

/** Ảnh nội dung của hàng DN (= data của version). */
function dnaData(r: Pick<DnaFieldRow, 'value_json' | 'value_num' | 'prose' | 'is_in_prompt' | 'source'>) {
  return {
    value_json: r.value_json,
    value_num: r.value_num,
    prose: r.prose,
    is_in_prompt: r.is_in_prompt,
    source: r.source,
  };
}

const IN_CONTENT = [
  'name',
  'content',
  'ordinal',
  'condition_kind',
  'condition_value',
  'engine_scope',
  'is_enabled',
] as const satisfies readonly (keyof InstructionRow)[];
type InContent = Pick<InstructionRow, (typeof IN_CONTENT)[number]>;

function inData(r: InContent): InContent {
  const out = {} as Record<string, unknown>;
  for (const k of IN_CONTENT) out[k] = r[k];
  return out as InContent;
}

const b01 = (v: boolean | undefined, dflt: 0 | 1): 0 | 1 => (v === undefined ? dflt : v ? 1 : 0);

export function changeSetRepo(ctx: Ctx): ChangeSetRepo {
  const items = (id: string) =>
    ctx.r.all<ChangeSetItemRow>(
      'SELECT * FROM change_set_items WHERE workspace_id = ? AND change_set_id = ? ORDER BY created_at, id',
      [ctx.ws, id],
    );

  function proposeItem(it: ChangeItemInput, cs: ChangeSetRow): ChangeSetItemRow {
    if (it.target === 'dna') {
      assertDnaInScope(cs);
      let field: DnaFieldRow;
      let data: Record<string, unknown>;
      let base: number | null = null;
      let tokenDelta = it.tokenCount;
      if (it.op === 'create') {
        const isInPrompt = b01(it.isInPrompt, 1);
        field = insertRow<DnaFieldRow>(ctx, 'dna_fields', {
          role_id: cs.role_id,
          def_id: ref(ctx, 'dna_field_defs', it.defId),
          item_index: it.itemIndex ?? 0,
          value_json: it.valueJson,
          value_num: it.valueNum ?? null,
          prose: it.prose ?? null,
          is_in_prompt: isInPrompt,
          token_count: it.tokenCount,
          tokenizer: it.tokenizer,
          source: it.source,
          status: 'proposed',
          source_message_id: ref(ctx, 'chat_messages', it.sourceMessageId) ?? null,
        });
        data = dnaData(field);
      } else {
        field = mustGetRow<DnaFieldRow>(ctx, 'dna_fields', it.dnaFieldId);
        assertDnaInScope(cs, field);
        base = it.baseVersion;
        tokenDelta = it.tokenCount - field.token_count;
        data = dnaData({
          value_json: it.valueJson,
          value_num: it.valueNum === undefined ? field.value_num : it.valueNum,
          prose: it.prose === undefined ? field.prose : it.prose,
          is_in_prompt: it.isInPrompt === undefined ? field.is_in_prompt : b01(it.isInPrompt, 1),
          source: field.source,
        });
      }
      const v = insertRow<DnaFieldVersionRow>(ctx, 'dna_field_versions', {
        dna_field_id: field.id,
        base_version: base,
        change_set_id: cs.id,
        data: canonicalJson(data),
        token_count: it.tokenCount,
        note: it.reason ?? null,
      });
      return insertRow<ChangeSetItemRow>(ctx, 'change_set_items', {
        change_set_id: cs.id,
        op: it.op,
        dna_field_version_id: v.id,
        reason: it.reason ?? null,
        token_delta: tokenDelta,
      });
    }
    let ins: InstructionRow;
    let data: InContent;
    let base: number | null = null;
    let tokenDelta = it.tokenCount;
    if (it.op === 'create') {
      const layer = it.layer;
      assertLayerInScope(cs, layer);
      const roleId = layer === 'position' || layer === 'house_rules' ? null : cs.role_id;
      const positionId = layer === 'position' ? cs.position_id : null;
      ins = insertRow<InstructionRow>(ctx, 'instructions', {
        role_id: roleId,
        position_id: positionId,
        layer,
        ordinal: it.ordinal,
        name: it.name,
        content: it.content,
        condition_kind: it.conditionKind ?? 'always',
        condition_value: it.conditionValue ?? null,
        engine_scope: it.engineScope ?? null,
        is_enabled: b01(it.isEnabled, 1),
        is_core: layer === 'values' || layer === 'persona' ? 1 : 0,
        token_count: it.tokenCount,
        tokenizer: it.tokenizer,
        source: it.source,
        status: 'proposed',
        lang: it.lang ?? 'vi',
        content_hash: sha256(it.content),
      });
      data = inData(ins);
    } else {
      ins = mustGetRow<InstructionRow>(ctx, 'instructions', it.instructionId);
      assertLayerInScope(cs, ins.layer, ins);
      base = it.baseVersion;
      tokenDelta = it.tokenCount - ins.token_count;
      const p = it.patch;
      data = inData({
        name: p.name ?? ins.name,
        content: p.content ?? ins.content,
        ordinal: p.ordinal ?? ins.ordinal,
        condition_kind: p.conditionKind ?? ins.condition_kind,
        condition_value: p.conditionValue === undefined ? ins.condition_value : p.conditionValue,
        engine_scope: p.engineScope === undefined ? ins.engine_scope : p.engineScope,
        is_enabled: p.isEnabled === undefined ? ins.is_enabled : b01(p.isEnabled, 1),
      });
    }
    const v = insertRow<InstructionVersionRow>(ctx, 'instruction_versions', {
      instruction_id: ins.id,
      base_version: base,
      change_set_id: cs.id,
      data: canonicalJson(data),
      token_count: it.tokenCount,
      note: it.reason ?? null,
    });
    return insertRow<ChangeSetItemRow>(ctx, 'change_set_items', {
      change_set_id: cs.id,
      op: it.op,
      instruction_version_id: v.id,
      reason: it.reason ?? null,
      token_delta: tokenDelta,
    });
  }

  interface Resolved {
    item: ChangeSetItemRow;
    kind: 'dna' | 'instruction';
    version: DnaFieldVersionRow | InstructionVersionRow;
    main: DnaFieldRow | InstructionRow;
    isCore: boolean;
    stale: boolean;
  }

  function resolve(item: ChangeSetItemRow): Resolved {
    if (item.dna_field_version_id !== null) {
      const version = mustGetRow<DnaFieldVersionRow>(ctx, 'dna_field_versions', item.dna_field_version_id);
      const main = mustGetRow<DnaFieldRow>(ctx, 'dna_fields', version.dna_field_id);
      const def = ctx.r.get<{ is_core: number }>('SELECT is_core FROM dna_field_defs WHERE id = ?', [main.def_id]);
      const stale = version.base_version === null ? main.status !== 'proposed' : version.base_version !== main.version;
      return { item, kind: 'dna', version, main, isCore: def?.is_core === 1, stale };
    }
    if (item.instruction_version_id !== null) {
      const version = mustGetRow<InstructionVersionRow>(ctx, 'instruction_versions', item.instruction_version_id);
      const main = mustGetRow<InstructionRow>(ctx, 'instructions', version.instruction_id);
      const stale = version.base_version === null ? main.status !== 'proposed' : version.base_version !== main.version;
      return { item, kind: 'instruction', version, main, isCore: main.is_core === 1, stale };
    }
    throw new DbRuleError('repo.not_implemented', 'apply: mục skill / tri thức / trí nhớ / cây chưa hỗ trợ ở M1');
  }

  function applyMain(r: Resolved, nextVersion: number): void {
    const data = JSON.parse(r.version.data) as Record<string, unknown>;
    if (r.kind === 'dna') {
      const main = r.main as DnaFieldRow;
      const confirm = main.source === 'ai_inferred' && main.confirmed_at === null;
      const def = ctx.r.get<{ key: string }>('SELECT key FROM dna_field_defs WHERE id = ?', [main.def_id]);
      upsertSearchDocument(requireW(ctx), ctx.ws, {
        entityType: 'DN',
        entityId: main.id,
        displayId: main.display_id,
        roleId: main.role_id,
        status: 'active',
        title: def?.key ?? null,
        body: typeof data.prose === 'string' ? data.prose : String(data.value_json ?? ''),
      });
      updateRow(
        ctx,
        'dna_fields',
        main.id,
        {
          value_json: data.value_json,
          value_num: data.value_num,
          prose: data.prose,
          is_in_prompt: data.is_in_prompt,
          token_count: r.version.token_count,
          status: 'active',
          version: nextVersion,
          // AI suy ra ⇒ người áp là người xác nhận (DB ép owner / admin = app_actor())
          confirmed_at: confirm ? nowTs(ctx) : undefined,
          confirmed_by: confirm ? actorOf(ctx).id : undefined,
        },
        { bumpVersion: false },
      );
      return;
    }
    const content = typeof data.content === 'string' ? data.content : (r.main as InstructionRow).content;
    const ins = r.main as InstructionRow;
    upsertSearchDocument(requireW(ctx), ctx.ws, {
      entityType: 'IN',
      entityId: ins.id,
      displayId: ins.display_id,
      roleId: ins.role_id,
      positionId: ins.position_id,
      status: 'active',
      title: typeof data.name === 'string' ? data.name : ins.name,
      body: content,
    });
    updateRow(
      ctx,
      'instructions',
      r.main.id,
      {
        name: data.name,
        content,
        ordinal: data.ordinal,
        condition_kind: data.condition_kind,
        condition_value: data.condition_value,
        engine_scope: data.engine_scope,
        is_enabled: data.is_enabled,
        token_count: r.version.token_count,
        content_hash: sha256(content),
        status: 'active',
        version: nextVersion,
      },
      { bumpVersion: false },
    );
  }

  function snapshotOf(cs: ChangeSetRow): { json: string; tokens: number } {
    if (cs.role_id !== null) {
      const dna = ctx.r.all(
        'SELECT f.display_id, d.key, f.item_index, f.value_json, f.prose, f.is_in_prompt, f.source, f.confirmed_at, f.version ' +
          "FROM dna_fields f JOIN dna_field_defs d ON d.id = f.def_id WHERE f.workspace_id = ? AND f.role_id = ? AND f.status = 'active' " +
          'AND f.deleted_at IS NULL ORDER BY f.display_seq',
        [ctx.ws, cs.role_id],
      );
      const instructions = ctx.r.all(
        'SELECT display_id, layer, ordinal, name, content_hash, condition_kind, condition_value, engine_scope, is_enabled, ' +
          "token_count, version FROM instructions WHERE workspace_id = ? AND role_id = ? AND status = 'active' AND deleted_at IS NULL " +
          'ORDER BY layer, ordinal, display_seq',
        [ctx.ws, cs.role_id],
      );
      const skills = ctx.r.all(
        "SELECT skill_id, skill_version_id, status FROM role_skills WHERE workspace_id = ? AND role_id = ? AND status = 'learned' " +
          'AND deleted_at IS NULL ORDER BY skill_id',
        [ctx.ws, cs.role_id],
      );
      const budget = ctx.r.get<{ t: number | null }>(
        'SELECT MAX(total_default) AS t FROM v_role_prompt_budget WHERE workspace_id = ? AND role_id = ?',
        [ctx.ws, cs.role_id],
      );
      const fallback = ctx.r.get<{ t: number }>(
        "SELECT COALESCE((SELECT SUM(token_count) FROM dna_fields WHERE role_id = ? AND status = 'active' AND is_in_prompt = 1 " +
          "AND deleted_at IS NULL), 0) + COALESCE((SELECT SUM(token_count) FROM instructions WHERE role_id = ? AND status = 'active' " +
          'AND is_enabled = 1 AND deleted_at IS NULL), 0) AS t',
        [cs.role_id, cs.role_id],
      );
      return {
        json: canonicalJson({ scope: 'role', dna, instructions, skills }),
        tokens: Number(budget?.t ?? fallback?.t ?? 0),
      };
    }
    const where =
      cs.position_id !== null ? "position_id = ? AND layer = 'position'" : "layer = 'house_rules' AND role_id IS NULL";
    const params = cs.position_id !== null ? [ctx.ws, cs.position_id] : [ctx.ws];
    const instructions = ctx.r.all<{ token_count: number; is_enabled: number }>(
      'SELECT display_id, layer, ordinal, name, content_hash, condition_kind, condition_value, engine_scope, is_enabled, ' +
        `token_count, version FROM instructions WHERE workspace_id = ? AND ${where} AND status = 'active' AND deleted_at IS NULL ` +
        'ORDER BY ordinal, display_seq',
      params,
    );
    return {
      json: canonicalJson({ scope: cs.position_id !== null ? 'position' : 'workspace', instructions }),
      tokens: instructions.reduce((n, r) => n + (r.is_enabled === 1 ? r.token_count : 0), 0),
    };
  }

  function decideVersion(r: Resolved, accepted: boolean, revisionId: string | null, version: number | null): void {
    updateRow(
      ctx,
      r.kind === 'dna' ? 'dna_field_versions' : 'instruction_versions',
      r.version.id,
      {
        status: accepted ? 'accepted' : 'rejected',
        version: accepted ? version : undefined,
        revision_id: accepted ? revisionId : undefined,
        decided_at: nowTs(ctx),
        decided_by: actorOf(ctx).id,
      },
      { bumpVersion: false },
    );
  }

  function rejectItem(r: Resolved): ChangeSetItemRow {
    decideVersion(r, false, null, null);
    // đề xuất tạo mới bị từ chối ⇒ hàng chính 'proposed' không còn ý nghĩa: xoá mềm
    if (r.main.status === 'proposed') softDeleteRow(ctx, r.kind === 'dna' ? 'dna_fields' : 'instructions', r.main.id);
    return updateRow<ChangeSetItemRow>(
      ctx,
      'change_set_items',
      r.item.id,
      { status: 'rejected' },
      { bumpVersion: false },
    );
  }

  const repo: ChangeSetRepo = {
    get: (id) => getRow<ChangeSetRow>(ctx, 'change_sets', id),
    items,
    listOpen: (f) =>
      selectAll<ChangeSetRow>(
        ctx,
        'change_sets',
        new Where(ctx, { live: true }).add("status = 'open'").eq('role_id', f?.roleId).eq('scope', f?.scope),
      ),
    propose: (i: ProposeChangeSetInput) => {
      const actor = allow(ctx, 'changeSets.propose', ['owner', 'admin', 'operator', 'system', 'role']);
      if (actor.kind === 'role' && i.roleId !== undefined && i.roleId !== actor.role_id) {
        throw permissionDenied('changeSets.propose: Role chỉ đề xuất cho chính mình');
      }
      ref(ctx, 'roles', i.roleId);
      ref(ctx, 'positions', i.positionId);
      ref(ctx, 'chat_threads', i.source?.threadId);
      ref(ctx, 'chat_messages', i.source?.messageId);
      ref(ctx, 'sessions', i.source?.sessionId);
      for (const it of i.items) if (it.target === 'instruction' && it.op === 'create') refEngine(ctx, it.engineScope);
      for (const it of i.items)
        if (it.target === 'instruction' && it.op === 'update') refEngine(ctx, it.patch.engineScope);
      if (i.items.length === 0) throw invalidInput('change set không có mục nào');
      if (i.title.trim().length === 0) throw invalidInput('change set cần tiêu đề');
      const csId = ctx.newId();
      if (i.polaris) {
        const polarisRole = actor.role_id ?? i.roleId ?? null;
        if (polarisRole === null)
          throw invalidInput('polaris của đề xuất cần Role (actor Role hoặc change set scope role)');
        insertPolarisCheck(ctx, polarisRole, { kind: 'proposal', changeSetId: csId }, i.polaris);
      }
      const cs = insertRow<ChangeSetRow>(ctx, 'change_sets', {
        id: csId,
        scope: i.scope,
        role_id: i.roleId ?? null,
        position_id: i.positionId ?? null,
        proposed_by: actor.id,
        title: i.title,
        source_thread_id: i.source?.threadId ?? null,
        source_message_id: i.source?.messageId ?? null,
        source_session_id: i.source?.sessionId ?? null,
      });
      const out = i.items.map((it) => proposeItem(it, cs));
      audited(ctx, {
        action: 'change_set.propose',
        table: 'change_sets',
        row: cs,
        roleId: cs.role_id,
        detail: { items: out.length, token_delta: out.reduce((n, x) => n + x.token_delta, 0) },
      });
      return { changeSet: cs, items: out };
    },
    apply: (id, input: ApplyChangeSetInput = {}): ApplyChangeSetResult => {
      const actor = allow(ctx, 'changeSets.apply', OWNER_ADMIN);
      const cs = mustGetRow<ChangeSetRow>(ctx, 'change_sets', id);
      if (cs.status !== 'open' || cs.deleted_at !== null) {
        throw new DbRuleError('repo.version_conflict', `change set ${cs.display_id} không còn mở (${cs.status})`);
      }
      if (cs.scope === 'library')
        throw new DbRuleError('repo.not_implemented', 'apply change set scope library chưa hỗ trợ ở M1');
      const pending = items(id).filter((x) => x.status === 'pending');
      const wanted = new Set(input.acceptItemIds ?? pending.map((x) => x.id));
      for (const w of wanted) {
        if (!pending.some((x) => x.id === w)) throw invalidInput(`mục ${w} không thuộc change set / không còn chờ`);
      }
      const resolved = pending.map(resolve);
      // phạm vi kiểm lại lúc áp (mục có thể không đi qua propose của repo) — cùng luật với lúc đề xuất
      for (const r of resolved) {
        if (r.kind === 'dna') assertDnaInScope(cs, r.main as DnaFieldRow);
        else assertLayerInScope(cs, (r.main as InstructionRow).layer, r.main as InstructionRow);
      }
      const accept = resolved.filter((r) => wanted.has(r.item.id) && !r.stale);
      const stale = resolved.filter((r) => wanted.has(r.item.id) && r.stale);
      const reject = resolved.filter((r) => !wanted.has(r.item.id));
      if (accept.length === 0)
        throw invalidInput('không có mục nào được áp (mọi mục bị từ chối / đã cũ) — dùng reject');
      const isCore = accept.some((r) => r.isCore);
      // Values > Nội quy > Polaris: đề xuất của AI / hệ thống chạm lõi (giá trị / tính cách) hoặc Nội quy ⇒ CHỈ owner áp.
      // DB chưa có trigger tương ứng (đề xuất gửi lane DB) — repo là rào duy nhất ở M1.
      const ownerGround = accept.some(
        (r) => r.isCore || (r.kind === 'instruction' && (r.main as InstructionRow).layer === 'house_rules'),
      );
      if (ownerGround && accessOf(ctx) !== 'owner') {
        const proposer = ctx.r.get<{ kind: string }>('SELECT kind FROM actors WHERE id = ?', [cs.proposed_by]);
        if (proposer?.kind !== 'user') {
          throw permissionDenied(
            `changeSets.apply: ${cs.display_id} do AI / hệ thống đề xuất chạm lõi hoặc Nội quy — chỉ owner được áp`,
          );
        }
      }
      const note = input.note?.trim() || null;
      if (isCore && note === null) throw invalidInput('chạm lõi (giá trị / tính cách) ⇒ bắt buộc lý do (note)');

      // 1. hàng chính = cache của version mới
      const versions = new Map<string, number>();
      for (const r of accept) {
        const next = r.main.status === 'proposed' ? r.main.version : r.main.version + 1;
        versions.set(r.item.id, next);
        applyMain(r, next);
      }
      // 2. revision (semver; lõi ⇒ major + 1) — trước khi gắn version (trigger "version lõi chỉ vào revision lõi")
      const scope =
        cs.role_id !== null
          ? { roleId: cs.role_id }
          : cs.position_id !== null
            ? { positionId: cs.position_id }
            : { workspace: true as const };
      const prev = selectOne<RevisionRow>(ctx, 'revisions', scopeWhere(ctx, scope), 'seq DESC');
      const seq = prev === null ? 1 : prev.seq + 1;
      const major = prev === null ? 1 : isCore ? prev.major + 1 : prev.major;
      const minor = prev === null ? 0 : isCore ? 0 : prev.minor + 1;
      const kind: RevisionKind = input.kind ?? (prev === null ? 'birth' : isCore ? 'core_edit' : 'edit');
      const snap = snapshotOf(cs);
      const revision = insertRow<RevisionRow>(ctx, 'revisions', {
        scope: cs.role_id !== null ? 'role' : cs.position_id !== null ? 'position' : 'workspace',
        role_id: cs.role_id,
        position_id: cs.position_id,
        seq,
        major,
        minor,
        kind,
        is_core: isCore ? 1 : 0,
        note,
        change_set_id: cs.id,
        snapshot_json: snap.json,
        snapshot_hash: `sha256:${sha256(snap.json)}`,
        prompt_tokens: snap.tokens,
      });
      // 3. version → accepted (ghi một lần) + mục
      const acceptedItems: ChangeSetItemRow[] = [];
      for (const r of accept) {
        decideVersion(r, true, revision.id, versions.get(r.item.id) ?? null);
        acceptedItems.push(
          updateRow(ctx, 'change_set_items', r.item.id, { status: 'accepted' }, { bumpVersion: false }),
        );
      }
      const rejectedItems = reject.map(rejectItem);
      const staleItems = stale.map(rejectItem);
      // 4. con trỏ revision hiện hành
      if (cs.role_id !== null) {
        const role = mustGetRow<RoleRow>(ctx, 'roles', cs.role_id);
        updateRow(ctx, 'roles', cs.role_id, {
          current_revision_id: revision.id,
          birth_revision_id: role.birth_revision_id === null ? revision.id : undefined,
        });
      } else if (cs.position_id !== null) {
        updateRow(ctx, 'positions', cs.position_id, { current_revision_id: revision.id });
      }
      // 5. change set
      const status = rejectedItems.length + staleItems.length === 0 ? 'applied' : 'partially_applied';
      const changeSet = updateRow<ChangeSetRow>(ctx, 'change_sets', cs.id, {
        status,
        decided_at: nowTs(ctx),
        decided_by: actor.id,
        revision_id: revision.id,
      });
      // 6. outbox brain_sync (DATABASE §7.2) — dedupe trên hàng đang chờ
      enqueueJob(ctx, {
        kind: 'brain_sync',
        payload: { revision_id: revision.id, role_id: cs.role_id, position_id: cs.position_id },
        dedupeKey: `brain_sync:${cs.role_id ?? cs.position_id ?? 'workspace'}`,
      });
      audited(ctx, {
        action: isCore ? 'change_set.apply_core' : 'change_set.apply',
        table: 'change_sets',
        row: changeSet,
        before: cs,
        roleId: cs.role_id,
        reason: note,
        detail: {
          revision: revision.display_id,
          accepted: acceptedItems.length,
          rejected: rejectedItems.length,
          stale: staleItems.length,
        },
      });
      return { changeSet, revision, accepted: acceptedItems, rejected: rejectedItems, stale: staleItems };
    },
    reject: (id, reason) => {
      const actor = allow(ctx, 'changeSets.reject', OWNER_ADMIN);
      const cs = mustGetRow<ChangeSetRow>(ctx, 'change_sets', id);
      if (cs.status !== 'open')
        throw new DbRuleError('repo.version_conflict', `change set ${cs.display_id} không còn mở`);
      for (const it of items(id)) if (it.status === 'pending') rejectItem(resolve(it));
      const row = updateRow<ChangeSetRow>(ctx, 'change_sets', id, {
        status: 'rejected',
        decided_at: nowTs(ctx),
        decided_by: actor.id,
      });
      return audited(ctx, {
        action: 'change_set.reject',
        table: 'change_sets',
        row,
        before: cs,
        reason: reason ?? null,
      });
    },
  };
  return repo;
}
