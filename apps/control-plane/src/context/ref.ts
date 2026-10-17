// `ctx.ref(prefix, value)` — rào IDOR dùng chung (HANDLER-OBLIGATIONS §1): ULID hoặc display_id ⇒ id, CHỈ trong workspace
// của actor. Không có / workspace khác / ULID thuộc bảng khác prefix / prefix sai / chuỗi rác ⇒ 404 `not_found` (cùng một mã —
// không lộ sự tồn tại của hàng tenant khác).
//   - L-DB có `ref()` nội bộ (repos/sqlite/ctx.ts) nhưng không xuất ra ngoài và chỉ nhận ULID ⇒ tra ở đây trên kết nối CHỈ
//     ĐỌC; repo khi ghi vẫn kiểm lại (`repo.invalid_ref`) — DB là chốt cuối.
//   - Bảng lấy từ `ENTITY_TYPES[prefix]` (hằng của contracts), định danh SQL kiểm `SQL_IDENT_RE` rồi mới trích dẫn.
//   - `users` không có workspace_id: chỉ tới được qua `workspace_members` của workspace (thành viên đang hoạt động).
//   - Hàng đã xoá mềm (`deleted_at`) ⇒ 404, trừ khi handler xin `includeDeleted` (vd khôi phục).
import { classifyRef, ENTITY_TYPES, type EntityPrefix, parseDisplayId, SQL_IDENT_RE } from '@ga/contracts';
import type { AppConnection } from '@ga/db';
import { notFound } from '../http/errors.ts';

export interface ResolvedRef {
  readonly prefix: EntityPrefix;
  readonly id: string;
  readonly displayId: string;
}

export interface RefOptions {
  includeDeleted?: boolean;
}

const columnCache = new Map<string, ReadonlySet<string>>();

function columnsOf(conn: AppConnection, table: string): ReadonlySet<string> {
  let cols = columnCache.get(table);
  if (cols === undefined) {
    const rows = conn.db.prepare('SELECT name FROM pragma_table_info(?)').all(table) as Array<{ name: string }>;
    cols = new Set(rows.map((r) => r.name));
    columnCache.set(table, cols);
  }
  return cols;
}

function quoteIdent(ident: string): string {
  if (!SQL_IDENT_RE.test(ident)) throw new Error(`định danh SQL không hợp lệ: ${ident}`);
  return `"${ident}"`;
}

function lookup(
  conn: AppConnection,
  workspaceId: string,
  prefix: EntityPrefix,
  by: 'id' | 'display_id',
  value: string,
  opts: RefOptions,
): ResolvedRef | null {
  const table = ENTITY_TYPES[prefix];
  const cols = columnsOf(conn, table);
  if (!cols.has('display_id')) throw new Error(`ctx.ref: bảng ${table} không có display_id`);
  let row: { id: string; display_id: string } | undefined;
  if (table === 'users') {
    row = conn.db
      .prepare(
        `SELECT u.id AS id, u.display_id AS display_id FROM users u
           JOIN workspace_members m ON m.user_id = u.id AND m.workspace_id = ? AND m.removed_at IS NULL
          WHERE u.${by} = ?`,
      )
      .get(workspaceId, value) as typeof row;
  } else {
    if (!cols.has('workspace_id')) throw new Error(`ctx.ref: bảng ${table} không có workspace_id`);
    const live = cols.has('deleted_at') && opts.includeDeleted !== true ? ' AND deleted_at IS NULL' : '';
    row = conn.db
      .prepare(`SELECT id, display_id FROM ${quoteIdent(table)} WHERE ${by} = ? AND workspace_id = ?${live}`)
      .get(value, workspaceId) as typeof row;
  }
  return row === undefined ? null : { prefix, id: row.id, displayId: row.display_id };
}

/**
 * Tra một Ref trong workspace. `prefixes` = prefix route chấp nhận (một hoặc nhiều). Không thấy ⇒ ném ApiError
 * `not_found` (404).
 */
export function resolveRef(
  conn: AppConnection,
  workspaceId: string,
  prefixes: EntityPrefix | readonly EntityPrefix[],
  value: unknown,
  opts: RefOptions = {},
): ResolvedRef {
  const list: readonly EntityPrefix[] = typeof prefixes === 'string' ? [prefixes] : prefixes;
  if (typeof value !== 'string' || value.length === 0 || value.length > 26 || list.length === 0) throw notFound();
  const kind = classifyRef(list, value);
  if (kind === 'ulid') {
    for (const p of list) {
      const hit = lookup(conn, workspaceId, p, 'id', value, opts);
      if (hit) return hit;
    }
    throw notFound();
  }
  if (kind === 'display_id') {
    const parsed = parseDisplayId(value);
    if (parsed === null || !list.includes(parsed.prefix)) throw notFound();
    const hit = lookup(conn, workspaceId, parsed.prefix, 'display_id', value, opts);
    if (hit) return hit;
  }
  throw notFound();
}
