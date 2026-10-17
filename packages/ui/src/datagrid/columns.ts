// Chữ cột kiểu Excel + anchor STD-08 §1 + whitelist ô truy vấn suy từ khai báo cột.
// Chữ cột theo VỊ TRÍ KHAI BÁO (A = cột dữ liệu đầu tiên; cột 0 là checkbox + ID, không có chữ — FRONTEND-SPEC §5), KHÔNG theo
// cột đang hiện: ẩn cột B thì C vẫn là C ⇒ anchor `…/col:C` sống sót khi ẩn / hiện cột.
import { Anchor, ENTITY_TYPES, type EntityTable, parseDisplayId } from '@ga/contracts';
import { ID_FIELD, type QueryField, type QueryFieldType } from '../query-box/fields.ts';
import type { CellValue, ColumnKind, GridColumn } from './types.ts';

/** 0 → A, 25 → Z, 26 → AA … (tối đa 3 chữ như ngữ pháp anchor `col:[A-Z]{1,3}`) */
export function columnLetter(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= 18_278)
    throw new RangeError(`chỉ số cột ngoài phạm vi: ${index}`);
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** A → 0, AA → 26; không hợp lệ → -1 */
export function columnIndex(letter: string): number {
  if (!/^[A-Z]{1,3}$/.test(letter)) return -1;
  let n = 0;
  for (const ch of letter) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** prefix display_id của bảng (vd 'skills' → 'SK') */
export function prefixOf(table: EntityTable): string {
  for (const [prefix, t] of Object.entries(ENTITY_TYPES)) if (t === table) return prefix;
  throw new Error(`bảng không có prefix: ${table}`);
}

/**
 * Dựng anchor KHÔNG kiểm — chỉ dùng khi display_id đã được kiểm đúng bảng lúc nạp hàng (RowCache.validate) và chữ cột lấy từ
 * columnLetter(): đường nóng khi dựng ô (không chạy regex của hợp đồng cho từng ô mỗi lần cuộn).
 */
export const anchorOf = (table: EntityTable, id: string, letter?: string | null): string =>
  letter ? `grid:${table}/row:${id}/col:${letter}` : `grid:${table}/row:${id}`;

/** anchor của hàng / ô; ném lỗi nếu không đúng ngữ pháp đóng của hợp đồng (không bao giờ dựng anchor sai) */
export function cellAnchor(table: EntityTable, id: string, letter?: string | null): string {
  const a = anchorOf(table, id, letter);
  if (!Anchor.safeParse(a).success) throw new Error(`anchor không hợp lệ: ${a}`);
  return a;
}

/** display_id đúng prefix của bảng? */
export function isRowIdOf(table: EntityTable, id: string): boolean {
  const p = parseDisplayId(id);
  return p !== null && p.table === table;
}

const FIELD_TYPE: Readonly<Record<ColumnKind, QueryFieldType>> = {
  text: 'text',
  longtext: 'text',
  enum: 'enum',
  number: 'number',
  bool: 'bool',
  date: 'date',
  id: 'id',
};

/** whitelist ô truy vấn của lưới: trường `id` dựng sẵn + mỗi cột có `query` khác false */
export function queryFields<R>(columns: readonly GridColumn<R>[]): QueryField[] {
  const out: QueryField[] = [ID_FIELD];
  for (const c of columns) {
    if (c.query === false) continue;
    const field: QueryField = { name: c.query?.field ?? c.id, type: FIELD_TYPE[c.kind] };
    if (c.query?.aliases) field.aliases = c.query.aliases;
    if (c.options) field.values = c.options;
    out.push(field);
  }
  return out;
}

/** cột ứng với trường của ô truy vấn */
export function columnOfField<R>(columns: readonly GridColumn<R>[], field: QueryField): GridColumn<R> | undefined {
  return columns.find((c) => c.query !== false && (c.query?.field ?? c.id) === field.name);
}

/** chữ hiển thị của ô (văn bản thuần) */
export function displayText<R>(column: GridColumn<R>, row: R): string {
  const v: CellValue = column.value(row);
  if (column.format) return column.format(v, row);
  if (v === null) return '';
  if (column.kind === 'enum' && column.options) {
    const hit = column.options.find((o) => o.value === String(v));
    if (hit) return hit.label;
  }
  return String(v);
}

export const isEditable = <R>(column: GridColumn<R>, row: R): boolean =>
  typeof column.editable === 'function' ? column.editable(row) : column.editable === true;
