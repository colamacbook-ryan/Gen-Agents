// Data Console (OPS-33 / 34 / 37 — DATABASE §8.3): biên dịch TRANG HÀNG + COUNT + nhóm + footer Σ + định vị hàng, cùng một
// bộ lọc (compileGridFilter). Bổ sung cho compileGridQuery (một khoá sắp xếp, `SELECT t.*`):
//   - Chiếu cột: CHỈ cột của whitelist hợp đồng (`GRID_COLUMNS`) — biểu thức hiển thị là hằng số ở đây (GRID_DISPLAY) hoặc suy từ
//     FieldDef của grids.ts; module nạp mà thiếu biểu thức cho một cột của hợp đồng ⇒ throw (không bao giờ "SELECT t.*" ra API).
//   - Sắp xếp tối đa 3 khoá sortable + khoá hoà `display_seq`; keyset sau / trước một hàng (cùng chiều ⇒ so sánh bộ giá trị, khác
//     chiều ⇒ chuỗi OR); hoặc OFFSET (≤ GRID_OFFSET_MAX, người gọi chặn trần).
//   - Lưới tự-phạm-vi (`GRID_SELF_SCOPED`, vd notifications): BẮT BUỘC `selfUserId` (thiếu ⇒ throw — fail-closed).
//   - Hàng `confidential` (memories / knowledge): người gọi xin `hideConfidentialText` (viewer) ⇒ bộ lọc chữ tự do không bao giờ
//     khớp trên các hàng đó (nội dung bị che thì không được làm oracle tìm kiếm).
// Giá trị luôn là tham số bind; định danh chỉ từ hằng số trong code.
import { GRID_COLUMNS, GRID_OFFSET_MAX, GRID_PREFIX, GRID_SELF_SCOPED, type GridKeyName } from '@ga/contracts';
import { DB_ENUMS } from '../generated/enums.ts';
import { compileGridFilter, gridDefOf, type QueryContext } from './compile.ts';
import { type FieldDef, findField, GRIDS, type GridDef } from './grids.ts';
import { type Clause, QueryBoxError } from './parser.ts';

/** Biểu thức hiển thị riêng (cột chỉ-hiển-thị `~`, hoặc khi cột lọc khác cột hiển thị — vd name_norm ⇒ name). */
const skillVersion = (col: string) => `(SELECT v.${col} FROM skill_versions v WHERE v.id = t.current_version_id)`;
export const GRID_DISPLAY: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  RL: { name: 't.name' },
  TX: { name: 't.name' },
  DN: { value: 't.value_json' },
  IN: { name: 't.name', content: 't.content', ordinal: 't.ordinal' },
  SK: {
    role:
      "(SELECT group_concat(r.display_id, ',') FROM role_skills j JOIN roles r ON r.id = j.role_id " +
      'WHERE j.skill_id = t.id AND j.deleted_at IS NULL)',
    engine:
      "(SELECT group_concat(s.engine_slug, ',') FROM skill_engine_support s WHERE s.skill_version_id = t.current_version_id)",
    description: skillVersion('description'),
    content: skillVersion('content_md'),
  },
  MM: { content: 't.content' },
  TG: { error: 't.error' },
  PN: { reason: 't.reason' },
  UR: { error: 't.error' },
  SN: { name: 't.name_vi' },
  PM: { reason: 't.reason', note: 't.decision_note' },
  GR: { note: 't.note' },
};

/** Ô Σ của footer (khoá = `GridInfo.footerKeys`), tính trên TOÀN tập khớp. Tiền ₲ ⇒ đơn vị chính (minor / 100). */
export const GRID_FOOTERS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  LG: { amount_sum: 'COALESCE(SUM(t.amount_minor), 0) / 100.0' },
  PC: { gain_sum: 'COALESCE(SUM(t.expected_gain_minor), 0) / 100.0' },
  SS: {
    tokens_in_sum: 'COALESCE(SUM(t.tokens_input), 0)',
    tokens_out_sum: 'COALESCE(SUM(t.tokens_output), 0)',
    cost_micro_sum: 'COALESCE(SUM(t.cost_micro_usd), 0)',
  },
  DN: { tokens_sum: 'COALESCE(SUM(t.token_count), 0)' },
  IN: { tokens_sum: 'COALESCE(SUM(t.token_count), 0)' },
  CD: { tokens_sum: 'COALESCE(SUM(t.prompt_tokens), 0)' },
};

/** Hàng `confidential` (V_MASKED_FIELDS OPS-33/34/35): cột nội dung bị che với viewer. */
export const GRID_CONFIDENTIAL: Readonly<Record<string, string>> = {
  MM: "t.sensitivity = 'confidential'",
  KN: "t.sensitivity = 'confidential'",
};

/** Lưới tự-phạm-vi: cột người dùng sở hữu hàng. */
export const GRID_SELF_COLUMN: Readonly<Record<string, string>> = { NT: 't.user_id' };

const SUPERSEDED_BY: Readonly<Record<string, string>> = {
  MM: '(SELECT x.display_id FROM memories x WHERE x.id = t.superseded_by_id)',
  KN: '(SELECT x.display_id FROM knowledge_items x WHERE x.id = t.superseded_by_id)',
  CD: '(SELECT x.display_id FROM employee_cards x WHERE x.id = t.superseded_by_id)',
};

const contractKeyOf = new Map<string, GridKeyName>(
  (Object.keys(GRID_PREFIX) as GridKeyName[]).map((k) => [GRID_PREFIX[k], k] as const),
);

function derivedDisplay(f: FieldDef): string {
  switch (f.type) {
    case 'seq':
      return 't.display_seq';
    case 'role':
      return `(SELECT r.display_id FROM roles r WHERE r.id = ${f.sql})`;
    case 'ref':
      return `(SELECT x.display_id FROM "${f.refTable}" x WHERE x.id = ${f.sql})`;
    case 'money':
      return `(${f.sql}) / 100.0`;
    default:
      if (f.eqSql !== undefined || f.roleSql !== undefined || f.sql === 't.name_norm')
        throw new Error(`select.ts: trường ${f.names[0]} cần biểu thức hiển thị riêng (GRID_DISPLAY)`);
      return f.sql;
  }
}

/** Biểu thức hiển thị của một cột hợp đồng trên một lưới (prefix). Cột lạ ⇒ null. */
export function displaySqlOf(prefix: string, column: string): string | null {
  const key = contractKeyOf.get(prefix);
  if (key === undefined || !GRID_COLUMNS[key].some((c) => c.name === column)) return null;
  const own = GRID_DISPLAY[prefix];
  if (own !== undefined && Object.hasOwn(own, column)) return own[column] as string;
  const grid = GRIDS[prefix] as GridDef;
  const f = grid.fields.find((x) => x.names[0] === column);
  return f === undefined ? null : derivedDisplay(f);
}

// Kiểm lúc nạp: mọi cột của hợp đồng có biểu thức hiển thị (thiếu = lỗi khai báo, không đợi tới lúc chạy).
for (const key of Object.keys(GRID_PREFIX) as GridKeyName[]) {
  const prefix = GRID_PREFIX[key];
  if (!Object.hasOwn(GRIDS, prefix)) throw new Error(`select.ts: lưới ${key} (${prefix}) không có trong GRIDS`);
  for (const c of GRID_COLUMNS[key])
    if (displaySqlOf(prefix, c.name) === null) throw new Error(`select.ts: ${key}.${c.name} thiếu biểu thức hiển thị`);
}

function stateSql(grid: GridDef): string {
  const whens: string[] = [];
  const status = (DB_ENUMS as Record<string, readonly (string | number)[]>)[`${grid.table}.status`] ?? [];
  if (grid.prefix === 'RL') whens.push("WHEN t.condition = 'wounded' THEN 'wounded'");
  if (status.includes('proposed')) whens.push("WHEN t.status = 'proposed' THEN 'proposed'");
  if (status.includes('superseded')) whens.push("WHEN t.status = 'superseded' THEN 'superseded'");
  return whens.length === 0 ? "'normal'" : `CASE ${whens.join(' ')} ELSE 'normal' END`;
}

export interface SortSpec {
  /** Tên trường sortable của lưới (hoặc `id` = display_seq). */
  field: string;
  desc: boolean;
}

export interface SelectScope {
  /** Người dùng của phiên — BẮT BUỘC với lưới tự-phạm-vi. */
  selfUserId?: string;
  /** Viewer: hàng confidential không bao giờ khớp mệnh đề chữ tự do. */
  hideConfidentialText?: boolean;
}

export interface SelectOptions extends SelectScope {
  /** Cột hiển thị (tên chuẩn của hợp đồng). */
  cols: readonly string[];
  sort: readonly SortSpec[];
  /** Cột nhóm (queryable): hàng sắp theo nhóm trước; `groups` = số hàng mỗi nhóm. */
  group?: string;
  limit: number;
  offset?: number;
  /** Keyset: giá trị của từng khoá sắp xếp + display_seq cuối (đúng thứ tự `sortKeys`). Không dùng cùng `group`. */
  after?: readonly (string | number)[];
}

export interface Stmt {
  sql: string;
  params: unknown[];
}

export interface CompiledSelect {
  rows: Stmt;
  count: Stmt;
  groups: Stmt | null;
  footer: Stmt | null;
  /** Số khoá keyset (khoá sắp xếp + display_seq) — `after` phải đúng độ dài này; giá trị lấy từ `__k0…` của hàng. */
  keyCount: number;
  clauses: Clause[];
  limit: number;
}

interface Key {
  sql: string;
  desc: boolean;
}

interface Base {
  grid: GridDef;
  where: string[];
  params: unknown[];
  clauses: Clause[];
}

function base(prefix: string, inputs: readonly string[], ctx: QueryContext, scope: SelectScope): Base {
  const key = contractKeyOf.get(prefix);
  const grid = gridDefOf(prefix);
  const f = compileGridFilter(prefix, inputs, ctx);
  const where = [...f.where];
  const params = [...f.params];
  if (key !== undefined && GRID_SELF_SCOPED.includes(key)) {
    const col = GRID_SELF_COLUMN[prefix];
    if (col === undefined || typeof scope.selfUserId !== 'string' || scope.selfUserId.length === 0)
      throw new Error(`select.ts: lưới ${key} tự-phạm-vi — thiếu selfUserId`);
    where.push(`${col} = ?`);
    params.push(scope.selfUserId);
  }
  const conf = GRID_CONFIDENTIAL[prefix];
  if (scope.hideConfidentialText === true && f.hasText && conf !== undefined) where.push(`NOT (${conf})`);
  return { grid, where, params, clauses: f.clauses };
}

function sortKeys(grid: GridDef, sort: readonly SortSpec[]): Key[] {
  if (sort.length > 3) throw new QueryBoxError('bad_value', 'sort', 0, 'tối đa 3 khoá sắp xếp');
  const keys: Key[] = [];
  const seen = new Set<string>();
  let seqDesc: boolean | null = null;
  for (const s of sort) {
    if (s.field === 'id') {
      seqDesc = s.desc;
      break; // display_seq là khoá hoà cuối — khoá sau nó vô nghĩa
    }
    const f = findField(grid, s.field);
    if (f === null || f.sortable !== true || f.names[0] !== s.field)
      throw new QueryBoxError('unknown_field', s.field, 0, 'không sắp xếp theo trường này');
    if (!/^t\.[a-z_]+$/.test(f.sql)) throw new Error(`grids.ts: trường sortable ${s.field} phải là cột t.<tên>`);
    if (seen.has(f.sql)) throw new QueryBoxError('bad_value', s.field, 0, 'khoá sắp xếp trùng');
    seen.add(f.sql);
    keys.push({ sql: f.sql, desc: s.desc });
  }
  const last = keys[keys.length - 1];
  keys.push({ sql: 't.display_seq', desc: seqDesc ?? last?.desc ?? false });
  return keys;
}

/** Hàng đứng SAU (`after`) / TRƯỚC (`before`) bộ giá trị khoá theo thứ tự sắp xếp. */
function keysetPredicate(keys: readonly Key[], values: readonly unknown[], dir: 'after' | 'before'): Stmt {
  if (values.length !== keys.length) throw new QueryBoxError('bad_value', 'cursor', 0, 'con trỏ trang hỏng');
  for (const [i, v] of values.entries()) {
    const isSeq = i === keys.length - 1;
    if (isSeq ? !Number.isSafeInteger(v) : typeof v !== 'string' && typeof v !== 'number')
      throw new QueryBoxError('bad_value', 'cursor', 0, 'con trỏ trang hỏng');
  }
  const cmpOf = (k: Key) => ((dir === 'after') !== k.desc ? '>' : '<');
  if (keys.every((k) => k.desc === keys[0]?.desc)) {
    const cols = keys.map((k) => k.sql).join(', ');
    const qs = keys.map(() => '?').join(', ');
    return { sql: `(${cols}) ${cmpOf(keys[0] as Key)} (${qs})`, params: [...values] };
  }
  const ors: string[] = [];
  const params: unknown[] = [];
  keys.forEach((k, i) => {
    const ands = keys.slice(0, i).map((p) => `${p.sql} = ?`);
    ands.push(`${k.sql} ${cmpOf(k)} ?`);
    ors.push(`(${ands.join(' AND ')})`);
    params.push(...values.slice(0, i), values[i]);
  });
  return { sql: `(${ors.join(' OR ')})`, params };
}

function columnList(grid: GridDef, cols: readonly string[]): string[] {
  const out: string[] = [];
  for (const c of cols) {
    const sql = displaySqlOf(grid.prefix, c);
    if (sql === null) throw new QueryBoxError('unknown_field', c, 0, 'cột ngoài whitelist');
    out.push(`${sql} AS "c_${c}"`);
  }
  return out;
}

function groupSql(grid: GridDef, group: string): string {
  const f = findField(grid, group);
  if (f === null || f.names[0] !== group) throw new QueryBoxError('unknown_field', group, 0, 'không nhóm theo trường này');
  return displaySqlOf(grid.prefix, group) as string;
}

/** Trang hàng + COUNT + nhóm + footer của cùng một bộ lọc (`inputs` = bộ lọc view + `q`). */
export function compileGridSelect(
  prefix: string,
  inputs: readonly string[],
  ctx: QueryContext,
  opts: SelectOptions,
): CompiledSelect {
  const b = base(prefix, inputs, ctx, opts);
  const { grid } = b;
  const keys = sortKeys(grid, opts.sort);
  const limit = Math.min(Math.max(Math.trunc(opts.limit), 1), 500);
  const from = `FROM "${grid.table}" t WHERE ${b.where.join(' AND ')}`;
  const g = opts.group === undefined ? null : groupSql(grid, opts.group);
  const conf = GRID_CONFIDENTIAL[prefix];
  const select = [
    't.id AS "__id"',
    't.display_id AS "__did"',
    `${stateSql(grid)} AS "__state"`,
    `${SUPERSEDED_BY[prefix] ?? 'NULL'} AS "__sup"`,
    `${conf === undefined ? '0' : `(${conf})`} AS "__conf"`,
    ...keys.map((k, i) => `${k.sql} AS "__k${i}"`),
    ...columnList(grid, opts.cols),
  ];
  const where = [...b.where];
  const params = [...b.params];
  if (opts.after !== undefined) {
    if (g !== null) throw new QueryBoxError('bad_value', 'cursor', 0, 'keyset không đi cùng group');
    const p = keysetPredicate(keys, opts.after, 'after');
    where.push(p.sql);
    params.push(...p.params);
  }
  const order = [
    ...(g === null ? [] : [`${g} ASC`]),
    ...keys.map((k) => `${k.sql} ${k.desc ? 'DESC' : 'ASC'}`),
  ].join(', ');
  let tail = 'LIMIT ?';
  const tailParams: unknown[] = [limit + 1];
  if (opts.offset !== undefined) {
    if (opts.after !== undefined) throw new QueryBoxError('bad_value', 'offset', 0, 'offset và cursor loại trừ nhau');
    if (!Number.isSafeInteger(opts.offset) || opts.offset < 0 || opts.offset > GRID_OFFSET_MAX)
      throw new QueryBoxError('bad_value', 'offset', 0, `offset 0…${GRID_OFFSET_MAX}`);
    tail = 'LIMIT ? OFFSET ?';
    tailParams.push(opts.offset);
  }
  const rows: Stmt = {
    sql: `SELECT ${select.join(', ')} FROM "${grid.table}" t WHERE ${where.join(' AND ')} ORDER BY ${order} ${tail}`,
    params: [...params, ...tailParams],
  };
  const count: Stmt = { sql: `SELECT COUNT(*) AS n ${from}`, params: [...b.params] };
  const groups: Stmt | null =
    g === null
      ? null
      : { sql: `SELECT ${g} AS g, COUNT(*) AS n ${from} GROUP BY 1 ORDER BY 1 LIMIT 500`, params: [...b.params] };
  const fdefs = GRID_FOOTERS[prefix];
  const footer: Stmt | null =
    fdefs === undefined
      ? null
      : {
          sql: `SELECT ${Object.entries(fdefs)
            .map(([k, sql]) => `${sql} AS "${k}"`)
            .join(', ')} ${from}`,
          params: [...b.params],
        };
  return { rows, count, groups, footer, keyCount: keys.length, clauses: b.clauses, limit };
}

export interface CompiledLocate {
  /** Hàng còn sống trong workspace (+ phạm vi người dùng), KHÔNG lọc theo `q`: trả `__k0…` (giá trị khoá). */
  probe: Stmt;
  /** Hàng có khớp bộ lọc không. */
  member: Stmt;
  /** COUNT số hàng đứng TRƯỚC bộ giá trị khoá (cùng bộ lọc). */
  countBefore(values: readonly (string | number)[]): Stmt;
  keyCount: number;
}

/** OPS-37: vị trí của hàng `seq` trong kết quả của cùng bộ lọc + thứ tự sắp xếp. */
export function compileGridLocate(
  prefix: string,
  inputs: readonly string[],
  ctx: QueryContext,
  opts: SelectScope & { sort: readonly SortSpec[] },
  seq: number,
): CompiledLocate {
  if (!Number.isSafeInteger(seq) || seq <= 0) throw new QueryBoxError('bad_value', 'displayId', 0);
  const b = base(prefix, inputs, ctx, opts);
  const { grid } = b;
  const keys = sortKeys(grid, opts.sort);
  // probe: chỉ phạm vi (workspace / xoá mềm / người dùng) — 2 hoặc 3 điều kiện đầu của bộ lọc không có q
  const scopeOnly = base(prefix, [], ctx, opts);
  const probe: Stmt = {
    sql: `SELECT ${keys.map((k, i) => `${k.sql} AS "__k${i}"`).join(', ')} FROM "${grid.table}" t WHERE ${scopeOnly.where.join(' AND ')} AND t.display_seq = ?`,
    params: [...scopeOnly.params, seq],
  };
  const member: Stmt = {
    sql: `SELECT 1 AS ok FROM "${grid.table}" t WHERE ${b.where.join(' AND ')} AND t.display_seq = ?`,
    params: [...b.params, seq],
  };
  return {
    probe,
    member,
    keyCount: keys.length,
    countBefore: (values) => {
      const p = keysetPredicate(keys, values, 'before');
      return {
        sql: `SELECT COUNT(*) AS n FROM "${grid.table}" t WHERE ${b.where.join(' AND ')} AND ${p.sql}`,
        params: [...b.params, ...p.params],
      };
    },
  };
}

/** "MM-0046 (mã cũ) → MM-0107" (`id_aliases`) cho các mã id trong ô truy vấn. */
export function compileAliasHints(ctx: QueryContext, displayIds: readonly string[]): Stmt | null {
  const ids = [...new Set(displayIds)].slice(0, 50);
  if (ids.length === 0) return null;
  return {
    sql: `SELECT a.old_display_id AS "from", a.new_display_id AS "to" FROM id_aliases a WHERE a.workspace_id = ? AND a.old_display_id IN (${ids.map(() => '?').join(', ')}) ORDER BY a.old_display_id LIMIT 50`,
    params: [ctx.workspaceId, ...ids],
  };
}
