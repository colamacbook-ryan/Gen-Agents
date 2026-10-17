// Nguồn dữ liệu trong bộ nhớ cho DataGrid: test, harness, bảng nhỏ phía client. Áp đúng hợp đồng GridDataSource
// (lọc bằng ô truy vấn đã kiểm theo whitelist, sắp xếp ổn định, anchor, nhóm, Σ, sửa ô, xuất theo luồng).
// Truy vấn sai ⇒ ném GridQueryError (như máy chủ trả `query.invalid`), không lọc nửa vời.
import type { Clock } from '@ga/contracts';
import { compileQuery, type EvalContext } from '../query-box/evaluate.ts';
import { resolveQuery } from '../query-box/fields.ts';
import { foldVi } from '../query-box/fold.ts';
import { columnOfField, queryFields } from './columns.ts';
import {
  type CellValue,
  type GridColumn,
  type GridDataSource,
  type GridGroup,
  type GridQuery,
  GridQueryError,
  type GridRange,
} from './types.ts';

export interface MemorySourceOptions<R> {
  columns: readonly GridColumn<R>[];
  getId: (row: R) => string;
  /** prefix display_id của lưới (từ trần `SK-0004` ⇒ điều kiện id) */
  idPrefix?: string;
  /** đồng hồ cho mốc tương đối (`created>-7d`) — mặc định đồng hồ hệ thống */
  clock?: Clock;
  /** ghi một ô: trả hàng MỚI (không sửa tại chỗ). Không có ⇒ nguồn chỉ đọc */
  update?: (row: R, column: string, value: CellValue) => R;
  /** tạo hàng mới */
  create?: (rows: readonly R[]) => R;
  /** trễ giả lập (ms) — test trạng thái đang tải */
  latencyMs?: number;
}

export interface MemorySource<R> extends GridDataSource<R> {
  /** toàn bộ hàng hiện có */
  all(): readonly R[];
  /** thay toàn bộ dữ liệu */
  setRows(rows: readonly R[]): void;
  /** số lần fetchRange đã gọi (test ảo hoá: không tải cả 10k hàng một lúc) */
  readonly fetchCount: number;
}

const collator = new Intl.Collator('vi', { sensitivity: 'base', numeric: true });

function compareCells(a: CellValue, b: CellValue): number {
  if (a === b) return 0;
  if (a === null) return 1; // NULL cuối
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return a ? 1 : -1;
  return collator.compare(String(a), String(b));
}

const aborted = (signal: AbortSignal): Error =>
  signal.reason instanceof Error ? signal.reason : new DOMException('aborted', 'AbortError');

export function createMemorySource<R>(initial: readonly R[], opts: MemorySourceOptions<R>): MemorySource<R> {
  let rows: readonly R[] = initial.slice();
  let fetchCount = 0;
  const fields = queryFields(opts.columns);
  const textCols = opts.columns.filter((c) => c.kind === 'text' || c.kind === 'longtext' || c.kind === 'enum');
  const clock: Clock = opts.clock ?? { now: () => new Date() };
  const textCache = new WeakMap<object, string>();
  const ctx: EvalContext<R> = {
    value: (field, row) => {
      const col = columnOfField(opts.columns, field);
      return col ? col.value(row) : null;
    },
    text: (row) => {
      const key = row as unknown as object;
      const hit = typeof key === 'object' && key !== null ? textCache.get(key) : undefined;
      if (hit !== undefined) return hit;
      const t = foldVi([opts.getId(row), ...textCols.map((c) => String(c.value(row) ?? ''))].join('\n'));
      if (typeof key === 'object' && key !== null) textCache.set(key, t);
      return t;
    },
    id: opts.getId,
    now: () => clock.now().getTime(),
  };

  // kết quả lọc + sắp xếp theo khoá truy vấn (dữ liệu đổi ⇒ xoá)
  let memo: { key: string; list: readonly R[] } | null = null;
  const view = (query: GridQuery): readonly R[] => {
    const key = JSON.stringify([query.q, query.sort]);
    if (memo && memo.key === key) return memo.list;
    const resolved = resolveQuery(query.q, fields, opts.idPrefix === undefined ? {} : { idPrefix: opts.idPrefix });
    if (!resolved.ok) throw new GridQueryError(resolved.error.reason, resolved.error.position);
    const pred = compileQuery(resolved.clauses, ctx);
    const sorters = query.sort.map((s) => {
      const col = opts.columns.find((c) => c.id === s.column);
      if (!col) throw new GridQueryError('unknown_field', null);
      return { col, dir: s.desc ? -1 : 1 };
    });
    const list = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => pred(r))
      .sort((a, b) => {
        for (const { col, dir } of sorters) {
          const va = col.value(a.r);
          const vb = col.value(b.r);
          // NULL luôn cuối, bất kể chiều
          if (va === null || vb === null) {
            if (va !== vb) return va === null ? 1 : -1;
            continue;
          }
          const c = compareCells(va, vb);
          if (c !== 0) return c * dir;
        }
        // hoà: theo display_id (cùng prefix, đệm số ⇒ thứ tự display_seq) rồi thứ tự gốc
        const ia = opts.getId(a.r);
        const ib = opts.getId(b.r);
        return ia < ib ? -1 : ia > ib ? 1 : a.i - b.i;
      })
      .map(({ r }) => r);
    memo = { key, list };
    return list;
  };
  const delay = async (signal: AbortSignal): Promise<void> => {
    if (signal.aborted) throw aborted(signal);
    if (!opts.latencyMs) return;
    await new Promise<void>((ok, bad) => {
      const t = setTimeout(ok, opts.latencyMs);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(t);
          bad(aborted(signal));
        },
        { once: true },
      );
    });
  };
  const sumCols = opts.columns.filter((c) => c.sum);

  const source: MemorySource<R> = {
    get fetchCount() {
      return fetchCount;
    },
    all: () => rows,
    setRows(next) {
      rows = next.slice();
      memo = null;
    },
    async fetchRange({ query, start, limit, signal }): Promise<GridRange<R>> {
      fetchCount++;
      await delay(signal);
      const list = view(query);
      const aggregates: Record<string, number> = {};
      for (const c of sumCols) {
        let total = 0;
        for (const r of list) {
          const v = c.value(r);
          if (typeof v === 'number') total += v;
        }
        aggregates[c.id] = total;
      }
      return { start, rows: list.slice(start, start + limit), total: list.length, aggregates };
    },
    async locate({ query, id, signal }) {
      await delay(signal);
      const list = view(query);
      const index = list.findIndex((r) => opts.getId(r) === id);
      if (index >= 0) return { state: 'found', index };
      return rows.some((r) => opts.getId(r) === id) ? { state: 'filtered' } : { state: 'gone' };
    },
    async groups({ query, column, signal }) {
      await delay(signal);
      const col = opts.columns.find((c) => c.id === column);
      if (!col) throw new GridQueryError('unknown_field', null);
      const out: GridGroup[] = [];
      for (const r of view(query)) {
        const v = col.value(r);
        const last = out[out.length - 1];
        if (last && last.value === v) last.count++;
        else out.push({ value: v, count: 1 });
      }
      return out;
    },
    async *exportRows({ query, signal }) {
      const list = view(query);
      for (let i = 0; i < list.length; i += 500) {
        if (signal.aborted) throw aborted(signal);
        yield list.slice(i, i + 500);
      }
    },
  };
  if (opts.update) {
    const update = opts.update;
    source.updateCell = async ({ id, column, value }) => {
      const i = rows.findIndex((r) => opts.getId(r) === id);
      if (i < 0) throw new Error(`không còn hàng ${id}`);
      const next = update(rows[i] as R, column, value);
      const copy = rows.slice();
      copy[i] = next;
      rows = copy;
      memo = null;
      return next;
    };
  }
  if (opts.create) {
    const create = opts.create;
    source.createRow = async () => {
      const row = create(rows);
      rows = [...rows, row];
      memo = null;
      return row;
    };
  }
  return source;
}
