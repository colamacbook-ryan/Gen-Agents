// Ô truy vấn của Data Console (DATABASE §8): parser → whitelist lưới → SQL tham số hoá → chạy + con trỏ keyset trang kế.
import type { AppConnection, StatementRunner } from '../connection.ts';
import { type CompiledQuery, compileGridQuery, type GridCursor, type GridPage, type QueryContext } from './compile.ts';

export {
  type CompiledFilter,
  type CompiledQuery,
  compileGridFilter,
  compileGridQuery,
  type GridCursor,
  type GridPage,
  gridDefOf,
  type QueryContext,
} from './compile.ts';
export { type FieldDef, type FieldType, findField, GRIDS, type GridDef, type GridKey, prefixOfTable } from './grids.ts';
export {
  type Atom,
  type Clause,
  parseQuery,
  QUERY_MAX_CHARS,
  QUERY_MAX_CLAUSES,
  QUERY_MAX_VALUES,
  QueryBoxError,
  type QueryBoxErrorCode,
  type QueryOp,
} from './parser.ts';
export {
  type CompiledLocate,
  type CompiledSelect,
  compileAliasHints,
  compileGridLocate,
  compileGridSelect,
  displaySqlOf,
  GRID_CONFIDENTIAL,
  GRID_DISPLAY,
  GRID_FOOTERS,
  GRID_SELF_COLUMN,
  type SelectOptions,
  type SelectScope,
  type SortSpec,
  type Stmt,
} from './select.ts';

export interface GridResult<T = Record<string, unknown>> {
  items: T[];
  /** null = hết dữ liệu. */
  nextAfter: GridCursor | null;
}

type Source = Pick<AppConnection, 'db'> | Pick<StatementRunner, 'all'>;

function runAll(source: Source, q: CompiledQuery): Record<string, unknown>[] {
  return 'db' in source
    ? (source.db.prepare(q.sql).all(...q.params) as Record<string, unknown>[])
    : source.all<Record<string, unknown>>(q.sql, q.params);
}

/**
 * Biên dịch + chạy một trang của lưới. Người gọi truyền kết nối CHỈ ĐỌC (API: kết nối reader trong worker có hạn giờ).
 * Lấy limit + 1 hàng để biết còn trang sau mà không cần COUNT.
 */
export function runGridQuery(
  source: Source,
  gridKey: string,
  input: string,
  ctx: QueryContext,
  page: GridPage = {},
): GridResult {
  const q = compileGridQuery(gridKey, input, ctx, page);
  const rows = runAll(source, q);
  const more = rows.length > q.limit;
  const items = more ? rows.slice(0, q.limit) : rows;
  const last = items[items.length - 1];
  if (!more || last === undefined) return { items, nextAfter: null };
  const seq = last.display_seq as number;
  if (q.sortKey === null) return { items, nextAfter: { seq } };
  return { items, nextAfter: { seq, value: last[q.sortKey] as string | number } };
}
