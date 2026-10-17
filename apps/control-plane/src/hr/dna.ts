// SYS-37…42 — bảng DNA, sửa một ô DNA (qua change set), xác nhận field AI suy ra, ký giấy khai sinh, timeline revision, diff.
// SYS-43 (khôi phục revision) CHƯA làm: repo chưa có khôi phục (snapshot IN chỉ giữ hash, không đủ nội dung) — xem báo cáo L-HR.
import type { DnaFieldDefRow, DnaFieldRow, ReadTx, RevisionRow } from '@ga/db/repos';
import { defineHandler, type Handler } from '../http/define-handler.ts';
import { ApiError, notFound } from '../http/errors.ts';
import { dnaTokens, validateDnaValue } from './dna-write.ts';
import {
  asBool,
  assertApproverIsNotProposer,
  assertMayApply,
  budgetOf,
  idOf,
  isViewerOnly,
  requireReasonForCore,
} from './shared.ts';

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function parseJson(s: string): Json {
  return JSON.parse(s) as Json;
}

function liveRole(tx: ReadTx, id: string) {
  const r = tx.roles.get(id);
  if (r === null || r.deleted_at !== null) throw notFound();
  return r;
}

function dnaRow(tx: ReadTx, f: DnaFieldRow, def: DnaFieldDefRow, masked: boolean) {
  const covered = f.covered_by_instruction_id === null ? null : tx.instructions.get(f.covered_by_instruction_id);
  return {
    id: f.id,
    displayId: f.display_id,
    group: def.field_group,
    key: def.key,
    itemIndex: f.item_index,
    // viewer: DN chưa phân loại độ nhạy ⇒ che MỌI giá trị (fail-closed); tokenCount / inPrompt vẫn hiện
    value: masked ? null : parseJson(f.value_json),
    valueType: def.value_type,
    source: f.source,
    confirmedAt: f.confirmed_at,
    tier: `tier${def.tier}`,
    inPrompt: f.is_in_prompt === 1,
    coveredBy: covered === null ? null : idOf(covered),
    tokenCount: f.token_count,
    version: f.version,
    isCore: def.is_core === 1,
    redacted: masked,
  };
}

function defsById(tx: ReadTx): Map<string, DnaFieldDefRow> {
  return new Map(tx.dna.defs().map((d) => [d.id, d]));
}

/**
 * Field AI suy ra CHƯA ai xác nhận = hàng DN `ai_inferred` còn ở trạng thái `proposed` (đang nằm trong change set mở). DB có CHECK:
 * `ai_inferred` đã `active` thì bắt buộc có `confirmed_at` ⇒ xác nhận = người duyệt áp change set chứa nó.
 */
const isPendingInferred = (f: DnaFieldRow) =>
  f.source === 'ai_inferred' && f.status === 'proposed' && f.deleted_at === null;

const REGISTRY_RE = /^GA-[A-Z0-9]{4}-(\d{4,})$/;

function progressOf(tx: ReadTx, roleId: string) {
  const defs = tx.dna.defs();
  const fields = tx.dna.fields(roleId, { status: 'active' });
  const groups = [...new Set(defs.map((d) => d.field_group))];
  const done = groups.filter((g) => {
    const inGroup = defs.filter((d) => d.field_group === g);
    const required = inGroup.filter((d) => d.is_required_for_birth === 1);
    return required.length > 0
      ? required.every((d) => fields.some((f) => f.def_id === d.id))
      : fields.some((f) => inGroup.some((d) => d.id === f.def_id));
  });
  return {
    groupsDone: done.length,
    groupsTotal: groups.length,
    inferredPending: tx.dna.fields(roleId, { status: 'proposed' }).filter(isPendingInferred).length,
  };
}

// -------------------------------------------------------------------- diff
interface SnapEntry {
  path: string;
  value: Json;
  isCore: boolean;
  dna: boolean;
}

function flatten(rev: RevisionRow, coreKeys: ReadonlySet<string>): Map<string, SnapEntry> {
  const out = new Map<string, SnapEntry>();
  const snap = parseJson(rev.snapshot_json);
  if (snap === null || typeof snap !== 'object' || Array.isArray(snap)) return out;
  const arr = (k: string): Json[] => {
    const v = snap[k];
    return Array.isArray(v) ? v : [];
  };
  for (const e of arr('dna')) {
    if (e === null || typeof e !== 'object' || Array.isArray(e)) continue;
    const key = String(e.key ?? '');
    const path = `dna.${key}[${Number(e.item_index ?? 0)}]`;
    out.set(path, {
      path,
      value: { value: e.value_json ?? null, prose: e.prose ?? null, in_prompt: e.is_in_prompt ?? null },
      isCore: coreKeys.has(key),
      dna: true,
    });
  }
  for (const e of arr('instructions')) {
    if (e === null || typeof e !== 'object' || Array.isArray(e)) continue;
    const path = `instructions.${String(e.display_id ?? '')}`;
    const { display_id: _omit, ...rest } = e;
    out.set(path, { path, value: rest, isCore: e.layer === 'values' || e.layer === 'persona', dna: false });
  }
  for (const e of arr('skills')) {
    if (e === null || typeof e !== 'object' || Array.isArray(e)) continue;
    const path = `skills.${String(e.skill_id ?? '')}`;
    out.set(path, {
      path,
      value: { version: e.skill_version_id ?? null, status: e.status ?? null },
      isCore: false,
      dna: false,
    });
  }
  return out;
}

const same = (a: Json | undefined, b: Json | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export const dnaHandlers: readonly Handler[] = [
  defineHandler('SYS-37', ({ params, query }, ctx) => {
    const ref = ctx.ref('RL', params.roleRef);
    const masked = isViewerOnly(ctx);
    return ctx.read((tx) => {
      const role = liveRole(tx, ref.id);
      const defs = defsById(tx);
      const rows = tx.dna
        .fields(role.id, { status: 'active' })
        .flatMap((f) => {
          const def = defs.get(f.def_id);
          return def === undefined ? [] : [{ f, def }];
        })
        .sort(
          (a, b) =>
            a.def.ordinal - b.def.ordinal || a.f.item_index - b.f.item_index || a.f.display_seq - b.f.display_seq,
        )
        .map(({ f, def }) => dnaRow(tx, f, def, masked));
      let paper: {
        sections: { group: string; items: { key: string; itemIndex: number; value: Json; redacted: boolean }[] }[];
      } | null = null;
      if (query.view === 'paper') {
        const sections = new Map<string, { key: string; itemIndex: number; value: Json; redacted: boolean }[]>();
        for (const s of tx.dna.sheet(role.id)) {
          if (s.status !== 'active' || s.field_group === null || s.key === null) continue;
          const items = sections.get(s.field_group) ?? [];
          items.push({
            key: s.key,
            itemIndex: s.item_index ?? 0,
            value: masked || s.value_json === null ? null : parseJson(s.value_json),
            redacted: masked,
          });
          sections.set(s.field_group, items);
        }
        paper = { sections: [...sections].map(([group, items]) => ({ group, items })) };
      }
      return {
        rows,
        progress: progressOf(tx, role.id),
        paper,
        signed:
          role.registry_no !== null && role.born_at !== null
            ? { registryNo: role.registry_no, signedAt: role.born_at }
            : null,
      };
    });
  }),

  defineHandler('SYS-38', ({ params, body }, ctx) => {
    const roleRef = ctx.ref('RL', params.roleRef);
    const dnaRef = ctx.ref('DN', params.dnaRef);
    if (body.value === undefined && body.inPrompt === undefined) {
      throw new ApiError('validation.failed', { field: 'value', reason: 'nothing_to_change' });
    }
    return ctx.write(
      (tx) => {
        const role = liveRole(tx, roleRef.id);
        const field = tx.dna.field(dnaRef.id);
        // quan hệ cha–con: ô DNA phải thuộc đúng Role trên đường dẫn (HANDLER-OBLIGATIONS #2)
        if (field === null || field.role_id !== role.id || field.deleted_at !== null) throw notFound();
        const def = tx.dna.defs().find((d) => d.id === field.def_id);
        if (def === undefined) throw new ApiError('internal');
        // lõi tính từ ĐỊNH NGHĨA ĐÃ LƯU của trường — không từ request
        const core = def.is_core === 1;
        assertMayApply(ctx, { core, houseRules: false });
        const reason = requireReasonForCore(core, body.reason);
        if (field.status !== 'active') throw new ApiError('conflict', { reason: 'pending_proposal' });
        if (def.is_identity_locked === 1 && role.lifecycle_status !== 'draft' && body.value !== undefined) {
          throw new ApiError('db.immutable_identity');
        }
        const next = body.value === undefined ? null : validateDnaValue(def, body.value);
        const valueJson = next?.valueJson ?? field.value_json;
        const { changeSet } = tx.changeSets.propose({
          scope: 'role',
          roleId: role.id,
          title: `Sửa ${def.key}`,
          items: [
            {
              target: 'dna',
              op: 'update',
              dnaFieldId: field.id,
              baseVersion: field.version,
              valueJson,
              ...(next === null ? {} : { valueNum: next.valueNum }),
              ...(body.inPrompt === undefined ? {} : { isInPrompt: body.inPrompt }),
              tokenCount: dnaTokens(valueJson),
              ...(reason === undefined ? {} : { reason }),
            },
          ],
        });
        const applied = tx.changeSets.apply(changeSet.id, reason === undefined ? {} : { note: reason });
        const fresh = tx.dna.field(field.id);
        if (fresh === null) throw new ApiError('internal');
        return {
          changeSet: idOf(applied.changeSet),
          revision: idOf(applied.revision),
          field: dnaRow(tx, fresh, def, false),
          budget: budgetOf(tx, role),
        };
      },
      { reason: 'dna.update' },
    );
  }),

  defineHandler('SYS-39', ({ params, body }, ctx) => {
    const roleRef = ctx.ref('RL', params.roleRef);
    const refs = 'refs' in body ? body.refs.map((r) => ctx.ref('DN', r)) : null;
    return ctx.write(
      (tx) => {
        const role = liveRole(tx, roleRef.id);
        const defs = defsById(tx);
        const pending = tx.dna.fields(role.id, { status: 'proposed' }).filter(isPendingInferred);
        if (refs !== null) {
          for (const r of refs) {
            const f = tx.dna.field(r.id);
            // quan hệ cha–con: ô DNA phải thuộc Role trên đường dẫn
            if (f === null || f.role_id !== role.id || f.deleted_at !== null) throw notFound();
          }
        }
        const wanted = refs === null ? null : new Set(refs.map((r) => r.id));
        const targets = pending.filter((f) => wanted === null || wanted.has(f.id));
        // gom theo change set chứa đề xuất; chỉ áp change set mà MỌI mục đang chờ đều nằm trong tập xác nhận (áp = từ chối
        // phần còn lại ⇒ không áp lẫn mục không được hỏi tới; change set lẫn thì duyệt từng mục ở luồng đề xuất)
        const groups = new Map<string, { csId: string; versionIds: Set<string>; core: boolean; count: number }>();
        for (const f of targets) {
          const v = tx.dna.versions(f.id).find((x) => x.status === 'proposed' && x.change_set_id !== null);
          if (v === undefined || v.change_set_id === null) continue;
          const g = groups.get(v.change_set_id) ?? {
            csId: v.change_set_id,
            versionIds: new Set<string>(),
            core: false,
            count: 0,
          };
          g.versionIds.add(v.id);
          g.core ||= defs.get(f.def_id)?.is_core === 1;
          g.count++;
          groups.set(g.csId, g);
        }
        let confirmed = 0;
        for (const g of groups.values()) {
          const cs = tx.changeSets.get(g.csId);
          if (cs === null || cs.status !== 'open' || cs.role_id !== role.id) continue;
          const items = tx.changeSets.items(cs.id).filter((i) => i.status === 'pending');
          if (items.some((i) => i.dna_field_version_id === null || !g.versionIds.has(i.dna_field_version_id))) continue;
          // quyền theo hàng đã lưu: lõi chỉ owner; người duyệt ≠ người đề xuất
          assertMayApply(ctx, { core: g.core, houseRules: false });
          assertApproverIsNotProposer(cs.proposed_by, tx.actorId);
          tx.changeSets.apply(cs.id, g.core ? { note: 'Chủ sở hữu xác nhận giá trị AI suy ra' } : {});
          confirmed += g.count;
        }
        return { confirmed, inferredPending: progressOf(tx, role.id).inferredPending };
      },
      { reason: 'dna.confirm' },
    );
  }),

  defineHandler('SYS-40', ({ params }, ctx) => {
    const roleRef = ctx.ref('RL', params.roleRef);
    return ctx.write(
      (tx) => {
        const role = liveRole(tx, roleRef.id);
        if (role.lifecycle_status !== 'draft' || role.registry_no !== null) {
          throw new ApiError('conflict', { reason: 'already_signed' });
        }
        const blocked = (reason: 'unconfirmed_inferred' | 'budget_exceeded'): never => {
          throw new ApiError('gate.sign_blocked', { reason });
        };
        const defs = tx.dna.defs();
        const active = tx.dna.fields(role.id, { status: 'active' });
        const needed = defs.filter((d) => d.is_required_for_birth === 1);
        // chưa xác nhận: còn field AI suy ra chưa duyệt, hoặc field bắt buộc khi khai sinh còn thiếu
        const revision = tx.revisions.latest({ roleId: role.id });
        const inferredPending = tx.dna.fields(role.id, { status: 'proposed' }).some(isPendingInferred);
        if (revision === null || inferredPending || needed.some((d) => !active.some((f) => f.def_id === d.id))) {
          blocked('unconfirmed_inferred');
        }
        const b = tx.roles.promptBudget(role.id);
        if (b === null || !asBool(b.sign_ok)) blocked('budget_exceeded');
        const last = tx.roles
          .list({ includeDeleted: true })
          .map((r) => REGISTRY_RE.exec(r.registry_no ?? ''))
          .reduce((m, x) => Math.max(m, x === null ? 0 : Number(x[1])), 0);
        const registryNo = `GA-${tx.workspace.get().short_code}-${String(last + 1).padStart(4, '0')}`;
        const signed = tx.roles.setLifecycle(role.id, 'born', { registryNo });
        const audit = tx.audit.list({ action: 'role.lifecycle', roleId: role.id, page: { order: 'desc', limit: 1 } })
          .items[0];
        if (signed.born_at === null || signed.registry_no === null || audit === undefined || revision === null) {
          throw new ApiError('internal');
        }
        return {
          registryNo: signed.registry_no,
          signedAt: signed.born_at,
          audit: idOf(audit),
          revision: idOf(revision),
        };
      },
      { reason: 'role.sign' },
    );
  }),

  defineHandler('SYS-41', ({ params }, ctx) => {
    const ref = ctx.ref('RL', params.roleRef);
    return ctx.read((tx) => {
      const role = liveRole(tx, ref.id);
      return tx.revisions.list({ roleId: role.id }).map((r) => {
        const actor = tx.workspace.actor(r.created_by);
        const userId = actor?.kind === 'user' ? actor.user_id : null;
        const member = userId === null ? null : tx.workspace.member(userId);
        const user = member !== null && member.removed_at === null && userId !== null ? tx.users.get(userId) : null;
        return {
          id: r.id,
          displayId: r.display_id,
          version: `${r.major}.${r.minor}`,
          isMajor: r.minor === 0,
          note: r.note ?? '',
          // chỉ id + display_id của thành viên (không email / username)
          by: user === null ? null : { id: user.id, displayId: user.display_id },
          at: r.created_at,
        };
      });
    });
  }),

  defineHandler('SYS-42', ({ params, query }, ctx) => {
    const afterRef = ctx.ref('RV', params.revisionRef);
    const beforeRef = ctx.ref('RV', query.against);
    const masked = isViewerOnly(ctx);
    return ctx.read((tx) => {
      const after = tx.revisions.get(afterRef.id);
      const before = tx.revisions.get(beforeRef.id);
      if (after === null || before === null) throw notFound();
      // hai revision phải cùng một phạm vi (cùng Role / Position / workspace)
      if (
        after.scope !== before.scope ||
        after.role_id !== before.role_id ||
        after.position_id !== before.position_id
      ) {
        throw new ApiError('validation.failed', { field: 'against', reason: 'scope_mismatch' });
      }
      const coreKeys = new Set(
        tx.dna
          .defs()
          .filter((d) => d.is_core === 1)
          .map((d) => d.key),
      );
      const a = flatten(after, coreKeys);
      const b = flatten(before, coreKeys);
      const items = [...new Set([...b.keys(), ...a.keys()])]
        .sort()
        .flatMap((path) => {
          const x = b.get(path);
          const y = a.get(path);
          if (same(x?.value, y?.value)) return [];
          const entry = (y ?? x) as SnapEntry;
          // nội dung DNA bị che với viewer (như SYS-37); đường dẫn + cờ lõi vẫn hiện
          const hide = masked && entry.dna;
          return [
            {
              path,
              before: hide ? null : (x?.value ?? null),
              after: hide ? null : (y?.value ?? null),
              isCore: entry.isCore,
            },
          ];
        })
        .slice(0, 500);
      return { items };
    });
  }),
];
