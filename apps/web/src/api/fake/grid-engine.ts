import {
  type ColumnDef,
  GRID_COLUMNS,
  GRID_KEYS,
  GRID_MIN_AUTH,
  GRID_PREFIX,
  GRID_WRITE_ROUTES,
  type GridKeyName,
  QUERY_OPS,
} from '@ga/contracts';
import { display, fakeUlid, iso } from './seed.ts';

// Lưới của backend giả: hàng sinh tất định theo whitelist cột THẬT của hợp đồng (GRID_COLUMNS), bộ lọc `q` / sắp xếp / nhóm /
// offset / cursor đủ dùng để chạy DataGrid thật. KHÔNG phải bộ biên dịch truy vấn (nguồn thật là L-DB): chỉ để demo + test giao diện.

export interface FakeGridRow {
  id: string;
  displayId: string;
  state: 'normal' | 'proposed' | 'superseded' | 'wounded';
  supersededBy: string | null;
  cells: Record<string, string | number | boolean | null>;
}

const ENUMS: Record<string, readonly string[]> = {
  status: ['active', 'archived', 'draft'],
  run: ['running', 'sleeping', 'stopped'],
  condition: ['normal', 'wounded'],
  color: ['teal', 'saffron', 'coral', 'azure'],
};
const DEFAULT_ENUM = ['alpha', 'beta', 'gamma'] as const;
export const enumValues = (col: ColumnDef): readonly string[] | null =>
  col.type === 'enum' ? (ENUMS[col.name] ?? DEFAULT_ENUM) : null;

const SIZES: Partial<Record<GridKeyName, number>> = { audit: 1200, events: 400, ledger: 250 };
const NAMES = ['Mai', 'Tùng', 'Lan', 'Hà'];

function cell(key: GridKeyName, col: ColumnDef, i: number): string | number | boolean | null {
  switch (col.type) {
    case 'int':
      return col.name === 'id' ? i + 1 : (i * 37) % 1000;
    case 'money':
      return ((i % 17) + 1) * 1000;
    case 'real':
      return Math.round((i * 13) % 100) / 10;
    case 'ts':
      return iso(i * 3);
    case 'bool':
      return i % 2 === 0;
    case 'enum': {
      const vs = enumValues(col) ?? DEFAULT_ENUM;
      return vs[i % vs.length] as string;
    }
    case 'json':
      return null;
    default:
      return col.name === 'name' && key === 'roles' ? (NAMES[i % NAMES.length] as string) : `${col.name} ${i + 1}`;
  }
}

const tables = new Map<GridKeyName, FakeGridRow[]>();
export function rowsOf(key: GridKeyName): FakeGridRow[] {
  const cached = tables.get(key);
  if (cached) return cached;
  const cols = GRID_COLUMNS[key];
  const n = key === 'roles' ? 4 : (SIZES[key] ?? 25);
  const prefix = GRID_PREFIX[key];
  const rows: FakeGridRow[] = Array.from({ length: n }, (_, i) => ({
    id: fakeUlid(prefix.charCodeAt(0) * 100_000 + i + 1),
    displayId: display(prefix, i + 1),
    state: i % 11 === 10 ? 'superseded' : i % 7 === 6 ? 'proposed' : 'normal',
    supersededBy: i % 11 === 10 ? display(prefix, i + 2) : null,
    cells: Object.fromEntries(cols.map((c) => [c.name, cell(key, c, i)])),
  }));
  tables.set(key, rows);
  return rows;
}

export function gridInfo(key: GridKeyName) {
  const cols = GRID_COLUMNS[key];
  const hasCreated = cols.some((c) => c.name === 'created' && c.sortable);
  const money = cols.filter((c) => c.type === 'money').map((c) => c.name);
  return {
    key,
    prefix: GRID_PREFIX[key],
    minAuth: GRID_MIN_AUTH[key],
    source: key,
    exportable: true,
    defaultSort: [hasCreated ? '-created' : 'id'],
    views: cols.some((c) => c.name === 'status')
      ? [{ key: 'active', q: 'status:active', sort: [] as string[], cols: [] as string[] }]
      : [],
    footerKeys: money.slice(0, 2),
    createRouteId: GRID_WRITE_ROUTES[key].create,
    columns: cols.map((c) => ({
      name: c.name,
      letter: letterOf(cols.indexOf(c)),
      type: c.type,
      editable: false,
      queryable: c.queryable,
      sortable: c.sortable,
      aliases: [...c.aliases],
      values: enumValues(c) ? [...(enumValues(c) as readonly string[])] : null,
      ops: c.queryable
        ? QUERY_OPS.filter((o) =>
            c.type === 'text' || c.type === 'enum' || c.type === 'bool' ? o === ':' || o === '=' || o === '!=' : true,
          )
        : [],
      editRouteId: null,
    })),
  };
}

const letterOf = (i: number): string => {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
};

export class QueryProblem extends Error {
  readonly reason: 'syntax' | 'unknown_field' | 'op_not_allowed' | 'bad_value';
  readonly position: number;
  constructor(reason: QueryProblem['reason'], position: number) {
    super(`query.invalid:${reason}@${position}`);
    this.reason = reason;
    this.position = position;
  }
}

interface Clause {
  negated: boolean;
  kind: 'field' | 'phrase' | 'word' | 'id';
  field: string | null;
  op: ':' | '=' | '!=' | '>' | '>=' | '<' | '<=' | null;
  values: string[];
  position: number;
  test(row: FakeGridRow): boolean;
}

const TOKEN = /(-?)(?:([a-z][a-z0-9_-]*)(!=|>=|<=|:|=|>|<)("[^"]*"|\S*)|("[^"]*")|(\S+))/gy;

export function parseQuery(key: GridKeyName, q: string | undefined): Clause[] {
  if (!q) return [];
  const cols = GRID_COLUMNS[key];
  const byName = new Map<string, ColumnDef>();
  for (const c of cols) for (const n of [c.name, ...c.aliases]) byName.set(n, c);
  const out: Clause[] = [];
  let pos = 0;
  while (pos < q.length) {
    if (/\s/.test(q[pos] as string)) {
      pos++;
      continue;
    }
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(q);
    if (!m) throw new QueryProblem('syntax', pos);
    const negated = m[1] === '-';
    if (m[2] !== undefined) {
      const col = byName.get(m[2]);
      if (!col?.queryable) throw new QueryProblem('unknown_field', pos);
      const op = m[3] as Clause['op'];
      const raw = (m[4] ?? '').replace(/^"|"$/g, '');
      if (raw === '') throw new QueryProblem('syntax', pos);
      if (
        (col.type === 'text' || col.type === 'enum' || col.type === 'bool') &&
        op !== null &&
        ['>', '>=', '<', '<='].includes(op)
      )
        throw new QueryProblem('op_not_allowed', pos);
      const numeric = col.type === 'int' || col.type === 'money' || col.type === 'real';
      if (numeric && Number.isNaN(Number(raw))) throw new QueryProblem('bad_value', pos);
      out.push({
        negated,
        kind: 'field',
        field: col.name,
        op,
        values: [raw],
        position: pos,
        test(row) {
          const v = row.cells[col.name];
          if (v === null || v === undefined) return false;
          if (numeric) {
            const a = Number(v);
            const b = Number(raw);
            return op === '>'
              ? a > b
              : op === '>='
                ? a >= b
                : op === '<'
                  ? a < b
                  : op === '<='
                    ? a <= b
                    : op === '!='
                      ? a !== b
                      : a === b;
          }
          const a = String(v).toLowerCase();
          const b = raw.toLowerCase();
          return op === '!=' ? a !== b : op === '=' ? a === b : a.includes(b);
        },
      });
    } else {
      const text = (m[5] ?? m[6] ?? '').replace(/^"|"$/g, '');
      const isId = m[6] !== undefined && /^[A-Z]{2,3}-\d{4,12}$/.test(text);
      out.push({
        negated,
        kind: isId ? 'id' : m[5] !== undefined ? 'phrase' : 'word',
        field: null,
        op: null,
        values: [text],
        position: pos,
        test: (row) =>
          isId
            ? row.displayId === text
            : Object.values(row.cells).some(
                (v) => typeof v === 'string' && v.toLowerCase().includes(text.toLowerCase()),
              ),
      });
    }
    pos = TOKEN.lastIndex;
  }
  return out;
}

export interface GridSelection {
  q?: string | undefined;
  view?: string | undefined;
  sort?: readonly string[] | undefined;
}

/** Hàng khớp truy vấn, đã sắp xếp (khoá hoà: thứ tự sinh = display_seq). */
export function select(key: GridKeyName, sel: GridSelection) {
  const info = gridInfo(key);
  const view = sel.view ? info.views.find((v) => v.key === sel.view) : undefined;
  const clauses = [...parseQuery(key, view?.q ?? undefined), ...parseQuery(key, sel.q)];
  const sort = sel.sort && sel.sort.length > 0 ? sel.sort : info.defaultSort;
  const matched = rowsOf(key).filter((r) => clauses.every((c) => c.test(r) !== c.negated));
  const cmp = (a: FakeGridRow, b: FakeGridRow): number => {
    for (const k of sort) {
      const desc = k.startsWith('-');
      const col = desc ? k.slice(1) : k;
      const x = a.cells[col] ?? null;
      const y = b.cells[col] ?? null;
      if (x === y) continue;
      const r = x === null ? -1 : y === null ? 1 : x < y ? -1 : 1;
      return desc ? -r : r;
    }
    return 0;
  };
  const rows = matched
    .map((r, i) => ({ r, i }))
    .sort((p, q2) => cmp(p.r, q2.r) || p.i - q2.i)
    .map((p) => p.r);
  return { rows, clauses, info };
}

export const sumOf = (rows: readonly FakeGridRow[], col: string): number =>
  rows.reduce((s, r) => s + (typeof r.cells[col] === 'number' ? (r.cells[col] as number) : 0), 0);

export const ALL_GRID_KEYS = GRID_KEYS;
