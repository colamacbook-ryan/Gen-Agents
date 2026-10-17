// Phạm vi của change set (dùng chung repo SQLite + fake để hai bản không lệch nhau).
import { invalidInput } from './errors.ts';
import type { ChangeSetRow, DnaFieldRow, InstructionLayer, InstructionRow } from './types.ts';

export type CsScope = Pick<ChangeSetRow, 'scope' | 'role_id' | 'position_id'>;

/**
 * Khối IN có thuộc phạm vi change set không — MỘT luật cho mọi nhánh (đề xuất create / update, và lúc apply) để các nhánh
 * không lệch nhau (review bảo mật: nhánh create từng bỏ qua kiểm phạm vi — cùng lớp lỗi L-39):
 *   house_rules ⇒ scope workspace (khối không gắn Role / vị trí);
 *   position    ⇒ scope position, đúng vị trí của change set;
 *   lớp khác    ⇒ scope role, đúng Role của change set.
 * `ins` = khối đã có (update / apply); create chỉ có lớp. Ngoài phạm vi ⇒ repo.invalid_input.
 */
export function assertLayerInScope(
  cs: CsScope,
  layer: InstructionLayer,
  ins?: Pick<InstructionRow, 'role_id' | 'position_id'>,
): void {
  let ok: boolean;
  if (layer === 'house_rules') {
    ok = cs.scope === 'workspace' && (ins === undefined || (ins.role_id === null && ins.position_id === null));
  } else if (layer === 'position') {
    ok =
      cs.scope === 'position' && cs.position_id !== null && (ins === undefined || ins.position_id === cs.position_id);
  } else {
    ok = cs.scope === 'role' && cs.role_id !== null && (ins === undefined || ins.role_id === cs.role_id);
  }
  if (!ok) throw invalidInput(`khối IN lớp ${layer} nằm ngoài phạm vi của change set (scope ${cs.scope})`);
}

/** Trường DN chỉ thuộc change set scope role của đúng Role đó (create / update / apply dùng chung). */
export function assertDnaInScope(cs: CsScope, field?: Pick<DnaFieldRow, 'role_id'>): void {
  const ok = cs.scope === 'role' && cs.role_id !== null && (field === undefined || field.role_id === cs.role_id);
  if (!ok)
    throw invalidInput(
      `mục DN nằm ngoài phạm vi của change set (scope ${cs.scope}) — DN chỉ thuộc change set của đúng Role`,
    );
}
