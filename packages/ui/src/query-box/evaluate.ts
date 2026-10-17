// Đánh giá truy vấn đã giải trên hàng trong bộ nhớ (nguồn dữ liệu bộ nhớ của DataGrid: test, bảng nhỏ phía client).
// Ngữ nghĩa bám SQL mà L-DB biên dịch (DATABASE §8.3–§8.4): NULL không khớp so sánh nào (kể cả `!=`), nhiều giá trị = IN,
// `-` = NOT. Ngày so theo chuỗi ISO UTC (máy chủ đổi ngày theo múi giờ workspace — bộ nhớ coi ngày là UTC).
import type { QueryField, ResolvedClause, ResolvedValue } from './fields.ts';
import { foldVi } from './fold.ts';

export type Scalar = string | number | boolean | null;

export interface EvalContext<R> {
  /** giá trị của trường trên hàng (null = NULL) */
  value(field: QueryField, row: R): Scalar;
  /** văn bản toàn văn của hàng, ĐÃ foldVi (gộp các cột chữ) */
  text(row: R): string;
  /** display_id của hàng */
  id(row: R): string;
  /** mốc "bây giờ" (ms) — từ Clock tiêm vào, không gọi Date.now() trực tiếp */
  now(): number;
}

const cmpNum = (a: number, b: number): number => (a < b ? -1 : a > b ? 1 : 0);
const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function compare(field: QueryField, cell: Scalar, ref: string | number): number | null {
  if (cell === null) return null;
  if (field.type === 'number') {
    const n = typeof cell === 'number' ? cell : Number(cell);
    return Number.isNaN(n) ? null : cmpNum(n, Number(ref));
  }
  if (field.type === 'date') {
    const s = String(cell);
    const r = String(ref);
    // ngày không giờ: so phần đầu cùng độ dài (`2026-10-15T09:00Z` "bằng" `2026-10-15`)
    return cmpStr(r.length < s.length ? s.slice(0, r.length) : s, r);
  }
  return cmpStr(foldVi(String(cell)), foldVi(String(ref)));
}

function matchesEq(field: QueryField, op: ':' | '=', cell: Scalar, v: ResolvedValue, now: number): boolean {
  if (cell === null) return false;
  switch (v.kind) {
    case 'prefix':
      return foldVi(String(cell)).startsWith(foldVi(v.value));
    case 'range': {
      const lo = compare(field, cell, v.from);
      const hi = compare(field, cell, v.to);
      return lo !== null && hi !== null && lo >= 0 && hi <= 0;
    }
    case 'reldate': {
      const c = compare(field, cell, new Date(now - v.ms).toISOString());
      return c !== null && c >= 0;
    }
    case 'eq': {
      if (field.type === 'text' && op === ':') return foldVi(String(cell)).includes(foldVi(String(v.value)));
      if (typeof v.value === 'boolean') return cell === v.value || String(cell) === String(v.value);
      if (field.type === 'enum' || field.type === 'id') return String(cell) === String(v.value);
      return compare(field, cell, v.value) === 0;
    }
  }
}

function matchesCmp<R>(c: Extract<ResolvedClause, { kind: 'cmp' }>, row: R, ctx: EvalContext<R>): boolean {
  const cell = ctx.value(c.field, row);
  if (cell === null) return false;
  const op = c.op;
  if (op === ':' || op === '=') return c.values.some((v) => matchesEq(c.field, op, cell, v, ctx.now()));
  if (op === '!=') return !c.values.some((v) => matchesEq(c.field, '=', cell, v, ctx.now()));
  const v = c.values[0];
  if (!v) return false;
  const ref = v.kind === 'reldate' ? new Date(ctx.now() - v.ms).toISOString() : v.kind === 'eq' ? v.value : null;
  if (ref === null || typeof ref === 'boolean') return false;
  const r = compare(c.field, cell, ref);
  if (r === null) return false;
  switch (c.op) {
    case '>':
      return r > 0;
    case '>=':
      return r >= 0;
    case '<':
      return r < 0;
    default:
      return r <= 0;
  }
}

/** biên dịch các mệnh đề (nối AND) thành vị từ trên hàng */
export function compileQuery<R>(clauses: readonly ResolvedClause[], ctx: EvalContext<R>): (row: R) => boolean {
  const tests = clauses.map((c): ((row: R) => boolean) => {
    let t: (row: R) => boolean;
    if (c.kind === 'text') {
      const needle = foldVi(c.text);
      t = (row) => ctx.text(row).includes(needle);
    } else if (c.kind === 'id') {
      const ids = new Set(c.ids);
      t = (row) => ids.has(ctx.id(row));
    } else {
      t = (row) => matchesCmp(c, row, ctx);
    }
    return c.negated ? (row) => !t(row) : t;
  });
  return (row) => tests.every((t) => t(row));
}
