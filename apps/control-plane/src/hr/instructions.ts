// SYS-46…48 — Instructions (khối văn bản vào prompt). Mọi ghi đi qua change set (propose → apply trong một giao dịch).
// Luật quyền (INTENT): lớp values / persona (lõi) và house_rules (Nội quy) CHỈ owner áp, tính từ TRẠNG THÁI ĐÃ LƯU / lớp ở
// request (lớp là thứ được tạo, không phải cờ client tự khai quyền).
import type { InstructionRow, ReadTx, WriteTx } from '@ga/db/repos';
import { defineHandler, type Handler } from '../http/define-handler.ts';
import { ApiError, notFound } from '../http/errors.ts';
import { positionOfRole } from './positions.ts';
import {
  asNum,
  assertMayApply,
  budgetOf,
  estimateTokens,
  idOf,
  requireReasonForCore,
  TOKENIZER_LABEL,
  withPermissionMapping,
} from './shared.ts';

const ROLE_LAYERS: readonly string[] = ['values', 'persona', 'style', 'drive'];
const CORE_LAYERS: readonly string[] = ['values', 'persona'];

type Condition = { kind: InstructionRow['condition_kind']; value: string };

function conditionOf(row: InstructionRow): Condition | null {
  return row.condition_kind === 'always' ? null : { kind: row.condition_kind, value: row.condition_value ?? '' };
}

/** DB lưu MỘT slug engine (FK `engines`); hợp đồng là mảng ⇒ nhận ≤ 1 phần tử. */
function engineScopeIn(scope: readonly string[] | null | undefined): string | null | undefined {
  if (scope === undefined) return undefined;
  if (scope === null || scope.length === 0) return null;
  if (scope.length > 1) throw new ApiError('validation.failed', { field: 'engineScope', reason: 'single_engine_only' });
  return scope[0] ?? null;
}

function instructionRowOf(row: InstructionRow) {
  return {
    id: row.id,
    displayId: row.display_id,
    ordinal: row.ordinal,
    layer: row.layer,
    name: row.name,
    content: row.content,
    condition: conditionOf(row),
    engineScope: row.engine_scope === null ? null : [row.engine_scope],
    enabled: row.is_enabled === 1,
    tokenCount: row.token_count,
    source: row.source,
    updatedAt: row.updated_at,
    isCore: row.is_core === 1,
    proposed: row.status === 'proposed',
  };
}

const RANK = new Map(['values', 'persona', 'style', 'drive', 'position', 'house_rules'].map((l, i) => [l, i] as const));

/** Budget khi thay đổi KHÔNG xác định đúng một Role (Position / Nội quy): 0 + nhãn ước lượng — client gọi GW-22 để lấy số thật. */
function zeroBudget() {
  return {
    totalDefault: 0,
    worst: 0,
    budget: 0,
    state: 'green' as const,
    promptLabel: 'estimated' as const,
    overheadLabel: 'overhead.estimated',
    signOk: false,
    cardOk: false,
    cardBlockReason: 'not_compiled' as string | null,
    breakdown: { dn: 0, in: 0, houseRules: 0, position: 0, skillIndex: 0, frame: 0, polaris: 0, runtime: 0 },
    pendingDelta: 0,
    ifApplyAll: { worst: 0, state: 'green' as const },
  };
}

function budgetFor(tx: ReadTx, roleId: string | null) {
  if (roleId === null) return zeroBudget();
  const role = tx.roles.get(roleId);
  return role === null ? zeroBudget() : budgetOf(tx, role);
}

/** Tạo / sửa xong: lấy hàng IN mới nhất của phạm vi (ghi đơn một writer ⇒ hàng có display_seq lớn nhất là hàng vừa tạo). */
function newestIn(tx: WriteTx, filter: { roleId?: string; positionId?: string; layer: InstructionRow['layer'] }) {
  const rows = tx.instructions.list(filter).sort((a, b) => b.display_seq - a.display_seq);
  const row = rows[0];
  if (row === undefined) throw new ApiError('internal');
  return row;
}

export const instructionHandlers: readonly Handler[] = [
  defineHandler('SYS-46', ({ params, query }, ctx) => {
    const ref = ctx.ref('RL', params.roleRef);
    return ctx.read((tx) => {
      const role = tx.roles.get(ref.id);
      if (role === null || role.deleted_at !== null) throw notFound();
      const position = positionOfRole(tx, role.id);
      const rows: InstructionRow[] = [
        ...tx.instructions.list({ roleId: role.id }),
        ...(position === null ? [] : tx.instructions.list({ positionId: position.id, layer: 'position' })),
        ...(query.includeHouseRules === true ? tx.instructions.list({ layer: 'house_rules' }) : []),
      ]
        // list({layer}) có thể trả IN của Role khác khi chỉ lọc theo layer: giữ đúng IN của workspace (không gắn Role)
        .filter((r) => r.layer !== 'house_rules' || r.role_id === null)
        .sort(
          (a, b) =>
            (RANK.get(a.layer) ?? 9) - (RANK.get(b.layer) ?? 9) ||
            a.ordinal - b.ordinal ||
            a.display_seq - b.display_seq,
        );
      const b = tx.roles.promptBudget(role.id);
      return {
        rows: rows.map(instructionRowOf),
        footer: {
          alwaysTokens: b ? asNum(b.instruction_tokens) : 0,
          positionTokens: b ? asNum(b.position_tokens) : 0,
          houseRulesTokens: b ? asNum(b.house_rules_tokens) : 0,
          conditionalWorstExtra: b ? asNum(b.conditional_worst_extra) : 0,
          pendingDelta: b ? asNum(b.pending_delta) : 0,
        },
      };
    });
  }),

  defineHandler('SYS-47', ({ body }, ctx) => {
    // khớp scope ↔ layer ↔ ref (mơ hồ ⇒ 400 trước khi chạm DB)
    const bad = (field: string, reason: string): never => {
      throw new ApiError('validation.failed', { field, reason });
    };
    if (body.scope === 'role') {
      if (body.roleRef === undefined) bad('roleRef', 'required');
      if (body.positionRef !== undefined) bad('positionRef', 'not_allowed');
      if (!ROLE_LAYERS.includes(body.layer)) bad('layer', 'layer_scope_mismatch');
    } else if (body.scope === 'position') {
      if (body.positionRef === undefined) bad('positionRef', 'required');
      if (body.roleRef !== undefined) bad('roleRef', 'not_allowed');
      if (body.layer !== 'position') bad('layer', 'layer_scope_mismatch');
    } else {
      if (body.roleRef !== undefined) bad('roleRef', 'not_allowed');
      if (body.positionRef !== undefined) bad('positionRef', 'not_allowed');
      if (body.layer !== 'house_rules') bad('layer', 'layer_scope_mismatch');
    }
    const roleRef = body.roleRef === undefined ? null : ctx.ref('RL', body.roleRef);
    const positionRef = body.positionRef === undefined ? null : ctx.ref('PS', body.positionRef);
    const engine = engineScopeIn(body.engineScope);
    const core = CORE_LAYERS.includes(body.layer);
    const houseRules = body.layer === 'house_rules';
    // quyền kiểm TRƯỚC mọi ghi (lớp của IN sắp tạo quyết định, không phải gì client khai về "quyền")
    assertMayApply(ctx, { core, houseRules });
    const reason = requireReasonForCore(core, body.reason);
    return withPermissionMapping(() =>
      ctx.write(
        (tx) => {
          const filter =
            roleRef !== null
              ? { roleId: roleRef.id, layer: body.layer }
              : positionRef !== null
                ? { positionId: positionRef.id, layer: body.layer }
                : { layer: body.layer };
          const siblings = tx.instructions.list(filter).filter((r) => (houseRules ? r.role_id === null : true));
          const ordinal = siblings.reduce((m, r) => Math.max(m, r.ordinal), 0) + 1;
          const { changeSet } = tx.changeSets.propose({
            scope: body.scope,
            ...(roleRef === null ? {} : { roleId: roleRef.id }),
            ...(positionRef === null ? {} : { positionId: positionRef.id }),
            title: `Thêm khối ${body.name}`,
            items: [
              {
                target: 'instruction',
                op: 'create',
                layer: body.layer,
                ordinal,
                name: body.name,
                content: body.content,
                ...(body.condition === undefined
                  ? {}
                  : { conditionKind: body.condition.kind, conditionValue: body.condition.value }),
                ...(engine === undefined ? {} : { engineScope: engine }),
                ...(body.enabled === undefined ? {} : { isEnabled: body.enabled }),
                tokenCount: estimateTokens(body.content),
                tokenizer: TOKENIZER_LABEL,
                source: 'owner',
                ...(reason === undefined ? {} : { reason }),
              },
            ],
          });
          const applied = tx.changeSets.apply(changeSet.id, reason === undefined ? {} : { note: reason });
          const created = newestIn(tx, { ...filter, layer: body.layer });
          return {
            instruction: idOf(created),
            changeSet: idOf(applied.changeSet),
            revision: idOf(applied.revision),
            budget: budgetFor(tx, roleRef?.id ?? null),
          };
        },
        { reason: 'instruction.create' },
      ),
    );
  }),

  defineHandler('SYS-48', ({ params, body }, ctx) => {
    const ref = ctx.ref('IN', params.instructionRef);
    const engine = engineScopeIn(body.engineScope);
    if (Object.keys(body).filter((k) => k !== 'reason').length === 0) {
      throw new ApiError('validation.failed', { field: 'name', reason: 'nothing_to_change' });
    }
    return withPermissionMapping(() =>
      ctx.write(
        (tx) => {
          const row = tx.instructions.get(ref.id);
          if (row === null || row.deleted_at !== null) throw notFound();
          // lõi / Nội quy tính từ HÀNG ĐÃ LƯU (lớp + is_core), không từ request
          const core = row.is_core === 1;
          const houseRules = row.layer === 'house_rules';
          assertMayApply(ctx, { core, houseRules });
          const reason = requireReasonForCore(core, body.reason);
          if (row.status !== 'active') throw new ApiError('conflict', { reason: 'pending_proposal' });
          const content = body.content ?? row.content;
          const scope = houseRules ? 'workspace' : row.layer === 'position' ? 'position' : 'role';
          const { changeSet } = tx.changeSets.propose({
            scope,
            ...(scope === 'role' && row.role_id !== null ? { roleId: row.role_id } : {}),
            ...(scope === 'position' && row.position_id !== null ? { positionId: row.position_id } : {}),
            title: `Sửa khối ${row.name}`,
            items: [
              {
                target: 'instruction',
                op: 'update',
                instructionId: row.id,
                baseVersion: row.version,
                patch: {
                  ...(body.name === undefined ? {} : { name: body.name }),
                  ...(body.content === undefined ? {} : { content: body.content }),
                  ...(body.ordinal === undefined ? {} : { ordinal: body.ordinal }),
                  ...(body.condition === undefined
                    ? {}
                    : body.condition === null
                      ? { conditionKind: 'always' as const, conditionValue: null }
                      : { conditionKind: body.condition.kind, conditionValue: body.condition.value }),
                  ...(engine === undefined ? {} : { engineScope: engine }),
                  ...(body.enabled === undefined ? {} : { isEnabled: body.enabled }),
                },
                tokenCount: estimateTokens(content),
                ...(reason === undefined ? {} : { reason }),
              },
            ],
          });
          const applied = tx.changeSets.apply(changeSet.id, reason === undefined ? {} : { note: reason });
          return {
            instruction: idOf(row),
            changeSet: idOf(applied.changeSet),
            revision: idOf(applied.revision),
            budget: budgetFor(tx, scope === 'role' ? row.role_id : null),
          };
        },
        { reason: 'instruction.update' },
      ),
    );
  }),
];
