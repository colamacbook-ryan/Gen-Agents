// Biên dịch ô truy vấn → SQL tham số hoá (DATABASE §8.3):
//   1. AST (parser.ts) → SQL; tên cột CHỈ từ whitelist (grids.ts); giá trị luôn là tham số bind sau khi kiểm kiểu;
//      LIKE escape % _ \; enum nhận alias vi / en rồi đổi về slug của DB.
//   2. Luôn tự thêm `workspace_id = ? [AND deleted_at IS NULL]`; hàng superseded / obsolete vẫn hiện trừ khi lọc bỏ.
//   3. Phân trang keyset `(sort_col, display_seq) > (?, ?)` — không OFFSET; ≤ 500 hàng / trang.
//   4. Chạy trên kết nối CHỈ ĐỌC (runGridQuery nhận kết nối của người gọi — API dùng kết nối đọc + giới hạn thời gian ở
//      worker; better-sqlite3 không ngắt được câu lệnh đang chạy, nên mọi trường phải có index — test EXPLAIN QUERY PLAN).
//   5. Text tự do ⇒ FTS5 qua search_documents (chuỗi người dùng không vào MATCH thô — mỗi từ được trích dẫn).
import { appLocalTime } from '../connection.ts';
import { PAGE_DEFAULT, PAGE_MAX } from '../repos/types.ts';
import { foldVi } from '../search/normalize.ts';
import { type FieldDef, findField, GRIDS, type GridDef, prefixOfTable } from './grids.ts';
import { type Atom, type Clause, parseQuery, QueryBoxError } from './parser.ts';

export interface QueryContext {
  workspaceId: string;
  /** IANA của workspace — ngày người dùng gõ là ngày theo múi giờ này. */
  timezone: string;
  /** Đồng hồ của app (reldate -7d tính từ đây). */
  now: Date;
}

export interface GridCursor {
  /** Giá trị cột sắp xếp của hàng cuối trang trước (bỏ qua khi sắp theo display_seq). */
  value?: string | number;
  seq: number;
}

export interface GridPage {
  limit?: number;
  order?: 'asc' | 'desc';
  /** Tên trường sortable (mặc định id = display_seq). */
  sort?: string;
  after?: GridCursor;
}

export interface CompiledQuery {
  sql: string;
  params: unknown[];
  limit: number;
  /** Biểu thức cột sắp xếp. */
  sortSql: string;
  /** Tên cột sắp xếp trong hàng kết quả (dựng con trỏ trang kế); null = display_seq. */
  sortKey: string | null;
}

const SORT_COLUMN_RE = /^t\.([a-z_]+)$/;

const TRUE_WORDS = new Set(['1', 'true', 'yes', 'co', 'bat', 'on']);
const FALSE_WORDS = new Set(['0', 'false', 'no', 'khong', 'tat', 'off']);
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const likeEscape = (s: string) => s.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');

class Builder {
  readonly parts: string[] = [];
  readonly params: unknown[] = [];
  add(sql: string, ...params: unknown[]): void {
    this.parts.push(sql);
    this.params.push(...params);
  }
}

/** Mốc UTC của 00:00 ngày (y-m-d) theo múi giờ tz (dò lệch bằng app_local_time — cùng hàm với DB). */
function zonedDayStart(y: number, m: number, d: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d);
  let t = guess;
  for (let i = 0; i < 3; i++) {
    const local = appLocalTime(new Date(t).toISOString(), tz);
    if (local === null) throw new QueryBoxError('bad_value', tz, 0, 'múi giờ lạ');
    const [date, time] = local.split(' ') as [string, string];
    const [ly, lm, ld] = date.split('-').map(Number) as [number, number, number];
    const [lh, lmin, ls] = time.split(':').map(Number) as [number, number, number];
    const localAsUtc = Date.UTC(ly, lm - 1, ld, lh, lmin, ls);
    const offset = localAsUtc - t;
    const next = guess - offset;
    if (next === t) break;
    t = next;
  }
  return t;
}

const iso = (ms: number) => new Date(ms).toISOString();

interface TimePoint {
  /** Mốc bắt đầu (ngày) hoặc thời điểm (reldate). */
  start: number;
  /** Mốc kết thúc (ngày kế tiếp) — reldate = start. */
  end: number;
}

function timeOf(a: Atom, ctx: QueryContext, raw: string, at: number): TimePoint {
  if (a.kind === 'reldate') {
    const ms = a.amount * (a.unit === 'h' ? 3_600_000 : a.unit === 'd' ? 86_400_000 : 7 * 86_400_000);
    const t = ctx.now.getTime() - ms;
    return { start: t, end: t };
  }
  if (a.kind === 'word') {
    const m = DATE_RE.exec(a.value);
    if (m) {
      const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
      const probe = new Date(Date.UTC(y, mo - 1, d));
      if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
        throw new QueryBoxError('bad_value', raw, at, 'ngày không tồn tại');
      }
      const start = zonedDayStart(y, mo, d, ctx.timezone);
      const next = new Date(Date.UTC(y, mo - 1, d + 1));
      const end = zonedDayStart(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), ctx.timezone);
      return { start, end };
    }
  }
  throw new QueryBoxError('bad_value', raw, at, 'cần ngày YYYY-MM-DD hoặc -7d / -12h / -2w');
}

function wordOf(a: Atom, raw: string, at: number): string {
  if (a.kind === 'word' || a.kind === 'phrase') return a.value;
  throw new QueryBoxError('bad_value', raw, at);
}

function numberOf(a: Atom, raw: string, at: number, money: boolean, prefix?: string): number {
  const s = wordOf(a, raw, at);
  if (prefix !== undefined) {
    // trường id: nhận cả số trần (41) lẫn mã của lưới (MM-0041); mã của lưới khác ⇒ wrong_prefix
    const seq = displaySeq(s, prefix);
    if (seq !== null) return seq;
    const dash = s.indexOf('-');
    if (dash > 0 && s.slice(0, dash).toUpperCase() === s.slice(0, dash)) {
      throw new QueryBoxError('wrong_prefix', raw, at, `lưới ${prefix}`);
    }
  }
  if (s.length === 0 || s.length > 20) throw new QueryBoxError('bad_value', raw, at);
  const n = Number(s);
  if (!Number.isFinite(n)) throw new QueryBoxError('bad_value', raw, at, 'cần số');
  return money ? Math.round(n * 100) : n;
}

const EQUALITY_TYPES = new Set(['enum', 'bool', 'role', 'ref', 'text']);

function fieldCondition(
  b: Builder,
  grid: GridDef,
  f: FieldDef,
  c: Extract<Clause, { kind: 'field' }>,
  ctx: QueryContext,
): void {
  const { op, raw, start } = c;
  if (EQUALITY_TYPES.has(f.type) && op !== ':' && op !== '=' && op !== '!=') {
    throw new QueryBoxError('bad_operator', raw, start, `trường ${f.names[0]} chỉ nhận : = !=`);
  }
  const ors: string[] = [];
  const params: unknown[] = [];
  const push = (sql: string, ...p: unknown[]) => {
    ors.push(sql);
    params.push(...p);
  };
  for (const a of c.values) {
    switch (f.type) {
      case 'enum': {
        const v0 = wordOf(a, raw, start).toLowerCase();
        const v = Object.hasOwn(f.valueAliases ?? {}, v0) ? (f.valueAliases?.[v0] as string) : v0;
        // enum số (vd tier 1 / 2) so theo dạng chuỗi rồi bind đúng kiểu của DB
        const hit = (f.enumValues ?? []).find((x) => String(x) === v);
        if (hit === undefined) throw new QueryBoxError('bad_value', raw, start, `giá trị lạ: ${v0}`);
        push(`${f.sql} = ?`, hit);
        break;
      }
      case 'bool': {
        const v = wordOf(a, raw, start).toLowerCase();
        if (TRUE_WORDS.has(v)) push(`${f.sql} = 1`);
        else if (FALSE_WORDS.has(v)) push(`${f.sql} = 0`);
        else throw new QueryBoxError('bad_value', raw, start, 'cần có / không');
        break;
      }
      case 'text': {
        const v0 = wordOf(a, raw, start);
        const v = f.sql === 't.name_norm' ? foldVi(v0) : v0;
        // `*` cuối chỉ là cú pháp tiền tố khi giá trị KHÔNG trích dẫn; "a*" = so bằng nguyên văn
        if (a.kind === 'word' && v.endsWith('*')) push(`${f.sql} LIKE ? ESCAPE '\\'`, `${likeEscape(v.slice(0, -1))}%`);
        else push(f.eqSql ?? `${f.sql} = ?`, v);
        break;
      }
      case 'role': {
        const v = wordOf(a, raw, start);
        const seq = displaySeq(v, 'RL');
        const ids =
          seq !== null
            ? 'SELECT r.id FROM roles r WHERE r.workspace_id = ? AND r.display_seq = ?'
            : 'SELECT r.id FROM roles r WHERE r.workspace_id = ? AND r.name_norm = ? AND r.deleted_at IS NULL';
        const sql = f.roleSql === undefined ? `${f.sql} IN (${ids})` : f.roleSql.replace('{ROLE_IDS}', ids);
        push(sql, ctx.workspaceId, seq ?? foldVi(v));
        break;
      }
      case 'ref': {
        const v = wordOf(a, raw, start);
        const prefix = f.refTable === undefined ? null : prefixOfTable(f.refTable);
        const seq = prefix === null ? null : displaySeq(v, prefix);
        if (seq === null) throw new QueryBoxError('bad_value', raw, start, `cần mã ${prefix ?? ''}-xxxx`);
        push(
          `${f.sql} IN (SELECT x.id FROM "${f.refTable}" x WHERE x.workspace_id = ? AND x.display_seq = ?)`,
          ctx.workspaceId,
          seq,
        );
        break;
      }
      case 'seq':
      case 'number':
      case 'money': {
        const money = f.type === 'money';
        const prefix = f.type === 'seq' ? grid.prefix : undefined;
        if (a.kind === 'range') {
          if (op !== ':' && op !== '=') throw new QueryBoxError('bad_operator', raw, start, 'khoảng chỉ đi với :');
          push(
            `${f.sql} BETWEEN ? AND ?`,
            numberOf(a.from, raw, start, money, prefix),
            numberOf(a.to, raw, start, money, prefix),
          );
        } else {
          const n = numberOf(a, raw, start, money, prefix);
          push(`${f.sql} ${op === ':' ? '=' : op} ?`, n);
        }
        break;
      }
      case 'ts': {
        if (a.kind === 'range') {
          if (op !== ':' && op !== '=') throw new QueryBoxError('bad_operator', raw, start, 'khoảng chỉ đi với :');
          const from = timeOf(a.from, ctx, raw, start);
          const to = timeOf(a.to, ctx, raw, start);
          push(`(${f.sql} >= ? AND ${f.sql} < ?)`, iso(from.start), iso(to.end === to.start ? to.end + 1 : to.end));
          break;
        }
        const t = timeOf(a, ctx, raw, start);
        const point = t.start === t.end;
        if (op === ':' || op === '=') {
          if (point) push(`${f.sql} >= ?`, iso(t.start));
          else push(`(${f.sql} >= ? AND ${f.sql} < ?)`, iso(t.start), iso(t.end));
        } else if (op === '!=') {
          push(`(${f.sql} < ? OR ${f.sql} >= ?)`, iso(t.start), iso(point ? t.start + 1 : t.end));
        } else if (op === '>') push(`${f.sql} >= ?`, iso(point ? t.start + 1 : t.end));
        else if (op === '>=') push(`${f.sql} >= ?`, iso(t.start));
        else if (op === '<') push(`${f.sql} < ?`, iso(t.start));
        else push(`${f.sql} < ?`, iso(point ? t.start + 1 : t.end));
        break;
      }
    }
  }
  let sql = ors.length === 1 ? (ors[0] as string) : `(${ors.join(' OR ')})`;
  // != là phủ định của bằng (với number / ts đã xử lý toán tử ở trên)
  const negate = c.negate !== (op === '!=' && EQUALITY_TYPES.has(f.type));
  if (negate) sql = `((${sql}) IS NOT 1)`;
  b.add(sql, ...params);
}

function displaySeq(v: string, prefix: string): number | null {
  if (!v.startsWith(`${prefix}-`)) return null;
  const digits = v.slice(prefix.length + 1);
  if (digits.length < 4 || digits.length > 9) return null;
  for (const c of digits) if (c < '0' || c > '9') return null;
  const n = Number(digits);
  return n > 0 ? n : null;
}

/** Một từ / cụm từ ⇒ biểu thức FTS an toàn (mỗi từ trích dẫn; từ đơn có * tiền tố; cụm từ là phrase query). */
function ftsOf(text: string, phrase: boolean): string | null {
  const terms = foldVi(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0)
    .slice(0, 16)
    .map((t) => t.slice(0, 64).replaceAll('"', '""'));
  if (terms.length === 0) return null;
  return phrase ? `"${terms.join(' ')}"` : terms.map((t) => `"${t}"*`).join(' ');
}

/** Biên dịch chuỗi ô truy vấn trên một lưới. Lỗi cú pháp / trường ⇒ QueryBoxError (không chạy nửa vời). */
export function compileGridQuery(
  gridKey: string,
  input: string,
  ctx: QueryContext,
  page: GridPage = {},
): CompiledQuery {
  const grid = Object.hasOwn(GRIDS, gridKey) ? GRIDS[gridKey] : undefined;
  if (grid === undefined) throw new QueryBoxError('unknown_field', gridKey, 0, 'lưới không có trong whitelist');
  const clauses = parseQuery(input);
  const b = new Builder();
  b.add('t.workspace_id = ?', ctx.workspaceId);
  if (grid.softDelete) b.add('t.deleted_at IS NULL');
  const match: string[] = [];
  for (const c of clauses) {
    if (c.kind === 'field') {
      const f = findField(grid, c.field);
      if (f === null) throw new QueryBoxError('unknown_field', `${c.field}${c.op}`, c.start);
      fieldCondition(b, grid, f, c, ctx);
    } else if (c.kind === 'id') {
      if (c.prefix !== grid.prefix) throw new QueryBoxError('wrong_prefix', c.raw, c.start, `lưới ${grid.prefix}`);
      const sql =
        '(t.display_seq = ? OR t.id IN (SELECT a.entity_id FROM id_aliases a WHERE a.workspace_id = ? AND a.old_display_id = ?))';
      b.add(c.negate ? `((${sql}) IS NOT 1)` : sql, c.seq, ctx.workspaceId, c.displayId);
    } else {
      if (grid.textEntity === null)
        throw new QueryBoxError('unknown_field', c.raw, c.start, 'lưới này không tìm văn bản tự do');
      const q = ftsOf(c.text, c.phrase);
      if (q === null) continue;
      if (c.negate) {
        b.add(
          't.id NOT IN (SELECT d.entity_id FROM search_fts JOIN search_documents d ON d.id = search_fts.rowid ' +
            'WHERE search_fts MATCH ? AND d.workspace_id = ? AND d.entity_type = ? AND d.chunk_id IS NULL)',
          q,
          ctx.workspaceId,
          grid.textEntity,
        );
      } else match.push(q);
    }
  }
  if (match.length > 0 && grid.textEntity !== null) {
    b.add(
      't.id IN (SELECT d.entity_id FROM search_fts JOIN search_documents d ON d.id = search_fts.rowid ' +
        'WHERE search_fts MATCH ? AND d.workspace_id = ? AND d.entity_type = ? AND d.chunk_id IS NULL)',
      match.join(' '),
      ctx.workspaceId,
      grid.textEntity,
    );
  }
  const limit = Math.min(Math.max(Math.trunc(page.limit ?? PAGE_DEFAULT), 1), PAGE_MAX);
  const desc = page.order === 'desc';
  let sortSql = 't.display_seq';
  let sortKey: string | null = null;
  if (page.sort !== undefined && page.sort !== 'id') {
    const sf = findField(grid, page.sort);
    if (sf === null || sf.sortable !== true)
      throw new QueryBoxError('unknown_field', page.sort, 0, 'không sắp xếp theo trường này');
    // trường sortable phải là cột trần NOT NULL (keyset cần giá trị so được) — sai là lỗi khai báo grids.ts, không phải lỗi người dùng
    const col = SORT_COLUMN_RE.exec(sf.sql);
    if (col === null) throw new Error(`grids.ts: trường sortable ${sf.names[0]} phải là cột t.<tên>`);
    sortSql = sf.sql;
    sortKey = col[1] as string;
  }
  if (page.after !== undefined) {
    const cmp = desc ? '<' : '>';
    if (!Number.isSafeInteger(page.after.seq)) throw new QueryBoxError('bad_value', 'after', 0, 'con trỏ trang hỏng');
    if (sortKey === null) b.add(`t.display_seq ${cmp} ?`, page.after.seq);
    else {
      const v = page.after.value;
      if (typeof v !== 'string' && typeof v !== 'number')
        throw new QueryBoxError('bad_value', 'after', 0, 'con trỏ trang thiếu giá trị');
      b.add(`(${sortSql}, t.display_seq) ${cmp} (?, ?)`, v, page.after.seq);
    }
  }
  const dir = desc ? 'DESC' : 'ASC';
  const order = sortKey === null ? `t.display_seq ${dir}` : `${sortSql} ${dir}, t.display_seq ${dir}`;
  const sql = `SELECT t.* FROM "${grid.table}" t WHERE ${b.parts.join(' AND ')} ORDER BY ${order} LIMIT ?`;
  return { sql, params: [...b.params, limit + 1], limit, sortSql, sortKey };
}
