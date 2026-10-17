// SYS-37, 38, 41, 42 — bảng DNA, sửa một ô DNA (qua change set), timeline revision, diff.
// SYS-39 (xác nhận), SYS-40 (ký), SYS-43 (khôi phục) CHƯA làm: repo chưa có hàm tương ứng (xem báo cáo L-HR).
import type { DnaFieldDefRow, DnaFieldRow, ReadTx, RevisionRow } from '@ga/db/repos';
import { defineHandler, type Handler } from '../http/define-handler.ts';
import { ApiError, notFound } from '../http/errors.ts';
import { dnaTokens, validateDnaValue } from './dna-write.ts';
import { assertMayApply, budgetOf, idOf, isViewerOnly, requireReasonForCore } from './shared.ts';

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

function progressOf(tx: ReadTx, roleId: string) {
  const defs = tx.dna.defs();
  const fields = tx.dna.fields(roleId, { status: 'active' });
  const groups = [...new Set(defs.map((d) => d.field_group))];
  const confirmed = (f: DnaFieldRow) => !(f.source === 'ai_inferred' && f.confirmed_at === null);
  const done = groups.filter((g) => {
    const inGroup = defs.filter((d) => d.field_group === g);
    const required = inGroup.filter((d) => d.is_required_for_birth === 1);
    const have = (d: DnaFieldDefRow) => fields.some((f) => f.def_id === d.id && confirmed(f));
    return required.length > 0
      ? required.every(have)
      : fields.some((f) => inGroup.some((d) => d.id === f.def_id) && confirmed(f));
  });
  return {
    groupsDone: done.length,
    groupsTotal: groups.length,
    inferredPending: fields.filter((f) => !confirmed(f)).length,
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
