// Tìm kiếm toàn văn (DATABASE §8.5): search_documents (INTEGER PK, external content) + search_fts (FTS5 unicode61), đồng bộ
// bằng trigger. Bảng gốc ghi search_documents TRONG CÙNG giao dịch (repo gọi upsertSearchDocument). title_norm / body_norm =
// foldVi (bỏ dấu, đ→d) — truy vấn chuẩn hoá y hệt. Chuỗi người dùng KHÔNG bao giờ đi thẳng vào MATCH: tách thành từ, mỗi từ
// trích dẫn "…" (+ * tiền tố cho gõ dở) ⇒ không tiêm được cú pháp FTS (OR / NEAR / cột / ngoặc).
import type { EntityPrefix } from '@ga/contracts';
import type { AppConnection, MaintenanceContext, StatementRunner, WriteContext } from '../connection.ts';
import { dml } from '../repos/sql.ts';
import { foldVi } from './normalize.ts';

export { FOLD_MAX_CHARS, foldVi } from './normalize.ts';

/** Trần độ dài văn bản đưa vào index (body cắt bớt — index không cần toàn bộ tài liệu dài). */
export const SEARCH_BODY_MAX = 32_768;
export const SEARCH_TITLE_MAX = 512;
/** Trần truy vấn: số từ + độ dài mỗi từ + độ dài chuỗi thô (chặn trước khi chuẩn hoá). */
export const SEARCH_QUERY_MAX_CHARS = 512;
export const SEARCH_QUERY_MAX_TERMS = 16;
const TERM_MAX = 64;

export interface SearchDocInput {
  entityType: EntityPrefix;
  entityId: string;
  displayId?: string | null;
  chunkId?: string | null;
  roleId?: string | null;
  positionId?: string | null;
  scope?: string | null;
  status?: string | null;
  isLive?: boolean;
  title?: string | null;
  body?: string | null;
  excerpt?: string | null;
  lang?: string | null;
  weight?: number;
  sourceUpdatedAt?: string | null;
}

const clip = (s: string | null | undefined, max: number) => (s === null || s === undefined ? null : s.slice(0, max));

/**
 * Ghi / cập nhật tài liệu của một thực thể (khoá: entity_type + entity_id + chunk_id). Không dùng ON CONFLICT (trigger chống
 * REPLACE chạy trước bước giải xung đột) ⇒ UPDATE trước, không có hàng thì INSERT.
 */
export function upsertSearchDocument(
  w: WriteContext | MaintenanceContext,
  workspaceId: string,
  d: SearchDocInput,
): void {
  const title = clip(d.title, SEARCH_TITLE_MAX);
  const body = clip(d.body, SEARCH_BODY_MAX);
  const values = [
    d.displayId ?? null,
    d.roleId ?? null,
    d.positionId ?? null,
    d.scope ?? null,
    d.status ?? null,
    d.isLive === false ? 0 : 1,
    title,
    clip(d.excerpt ?? body, 280),
    title === null ? null : foldVi(title),
    body === null ? null : foldVi(body),
    d.lang ?? null,
    d.weight ?? 1,
    d.sourceUpdatedAt ?? null,
  ];
  // khoá luôn kèm workspace_id: tài liệu không bao giờ "chuyển" sang tenant khác dù id thực thể có trùng
  const key = [workspaceId, d.entityType, d.entityId, d.chunkId ?? ''];
  const updated = dml(w).write(
    'UPDATE search_documents SET display_id = ?, role_id = ?, position_id = ?, scope = ?, status = ?, ' +
      'is_live = ?, title = ?, excerpt = ?, title_norm = ?, body_norm = ?, lang = ?, weight = ?, source_updated_at = ? ' +
      "WHERE workspace_id = ? AND entity_type = ? AND entity_id = ? AND COALESCE(chunk_id, '') = ?",
    [...values, ...key],
  ).changes;
  if (updated > 0) return;
  dml(w).write(
    'INSERT INTO search_documents (display_id, role_id, position_id, scope, status, is_live, title, excerpt, ' +
      'title_norm, body_norm, lang, weight, source_updated_at, workspace_id, entity_type, entity_id, chunk_id) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [...values, workspaceId, d.entityType, d.entityId, d.chunkId ?? null],
  );
}

/** Đánh dấu không còn sống (xoá mềm thực thể) — vẫn dựng lại được; tìm kiếm mặc định bỏ qua. */
export function markSearchDocumentDead(
  w: WriteContext | MaintenanceContext,
  workspaceId: string,
  entityType: EntityPrefix,
  entityId: string,
): void {
  dml(w).write('UPDATE search_documents SET is_live = 0 WHERE workspace_id = ? AND entity_type = ? AND entity_id = ?', [
    workspaceId,
    entityType,
    entityId,
  ]);
}

/**
 * Chuỗi người dùng → biểu thức MATCH an toàn: foldVi → tách từ (mọi ký tự không phải chữ / số là dấu phân cách) →
 * mỗi từ "…"* (tiền tố) nối bằng khoảng trắng (AND). Không có từ nào ⇒ null.
 */
export function ftsQuery(text: string): string | null {
  if (text.length > SEARCH_QUERY_MAX_CHARS) throw new RangeError(`truy vấn vượt ${SEARCH_QUERY_MAX_CHARS} ký tự`);
  const terms = foldVi(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0)
    .slice(0, SEARCH_QUERY_MAX_TERMS)
    .map((t) => t.slice(0, TERM_MAX));
  if (terms.length === 0) return null;
  return terms.map((t) => `"${t.replaceAll('"', '""')}"*`).join(' ');
}

export interface SearchHit {
  entityType: string;
  entityId: string;
  displayId: string | null;
  title: string | null;
  excerpt: string | null;
  roleId: string | null;
  /** bm25 có trọng số (tiêu đề × 5) — nhỏ hơn = khớp hơn. */
  score: number;
}

export interface SearchOptions {
  entityTypes?: readonly EntityPrefix[];
  roleId?: string;
  /** Mặc định chỉ tài liệu gốc (không chunk). */
  includeChunks?: boolean;
  includeDead?: boolean;
  /** Mặc định 30, trần 200. */
  limit?: number;
}

/** ⌘K / text tự do: tìm trong workspace, xếp theo bm25 (tiêu đề nặng gấp 5 lần thân). */
export function searchDocuments(
  source: Pick<AppConnection, 'db'> | Pick<StatementRunner, 'all'>,
  workspaceId: string,
  text: string,
  opts: SearchOptions = {},
): SearchHit[] {
  const q = ftsQuery(text);
  if (q === null) return [];
  const where = ['search_fts MATCH ?', 'd.workspace_id = ?'];
  const params: unknown[] = [q, workspaceId];
  if (opts.includeDead !== true) where.push('d.is_live = 1');
  if (opts.includeChunks !== true) where.push('d.chunk_id IS NULL');
  if (opts.roleId !== undefined) {
    where.push('d.role_id = ?');
    params.push(opts.roleId);
  }
  if (opts.entityTypes !== undefined) {
    if (opts.entityTypes.length === 0) return [];
    where.push(`d.entity_type IN (${opts.entityTypes.map(() => '?').join(', ')})`);
    params.push(...opts.entityTypes);
  }
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 30), 1), 200);
  params.push(limit);
  const sql =
    'SELECT d.entity_type AS entityType, d.entity_id AS entityId, d.display_id AS displayId, d.title AS title, ' +
    'd.excerpt AS excerpt, d.role_id AS roleId, bm25(search_fts, 5.0, 1.0) * d.weight AS score ' +
    `FROM search_fts JOIN search_documents d ON d.id = search_fts.rowid WHERE ${where.join(' AND ')} ` +
    'ORDER BY score LIMIT ?';
  return 'db' in source ? (source.db.prepare(sql).all(...params) as SearchHit[]) : source.all<SearchHit>(sql, params);
}
