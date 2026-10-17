// Ngữ cảnh giao dịch + bộ dựng câu lệnh cho repo SQLite. Một Ctx = một giao dịch (read hoặc write). Mọi câu lệnh:
//   - định danh (bảng, cột) chỉ từ code, kiểm SQL_IDENT_RE + tồn tại thật (PRAGMA table_info) rồi mới trích dẫn;
//   - giá trị luôn là tham số bind; boolean ⇒ 0 / 1;
//   - INSERT tự điền id (ULID), workspace_id (của giao dịch), display_id (id_counters), created_at (= app_now()),
//     created_by (stampInsert ⇒ actor giao dịch); UPDATE đi qua stampUpdate / stampSoftDelete (updated_by = actor,
//     updated_at = FRESH_UPDATED_AT) + version + 1 (cột nghiệp vụ) và luôn lọc workspace_id của giao dịch (tenant);
//   - ghi đi qua dml(w).write (kiểm lúc chạy đang trong giao dịch ghi).
import { createHash } from 'node:crypto';
import { type Clock, SQL_IDENT_RE, toDbTimestamp } from '@ga/contracts';
import { DummyDriver, Kysely, type RawBuilder, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } from 'kysely';
import type { StatementRunner, WriteContext } from '../../connection.ts';
import { allocateDisplayId, type IdGenerator, prefixOf } from '../../ids/index.ts';
import { stampInsert, stampSoftDelete, stampUpdate } from '../../stamp.ts';
import type { AuditEntryInput } from '../audit.ts';
import { DbRuleError, invalidInput, notFound } from '../errors.ts';
import { dml } from '../sql.ts';
import {
  type ActorRow,
  type AuditRow,
  PAGE_DEFAULT,
  PAGE_MAX,
  type Page,
  type PageRequest,
  type WriteOptions,
} from '../types.ts';
import { type AppendAuditDeps, appendAuditFromEntry } from './audit-entry.ts';

export type TxOptions = WriteOptions & { channel: NonNullable<WriteOptions['channel']>; requestId: string };

export interface Ctx {
  /** Workspace của giao dịch (tenant scope). */
  readonly ws: string;
  /** Đọc trong cùng giao dịch (kết nối đọc ở read, kết nối ghi ở write). */
  readonly r: StatementRunner;
  /** null ở giao dịch đọc. */
  readonly w: WriteContext | null;
  readonly actor: ActorRow | null;
  readonly clock: Clock;
  readonly newId: IdGenerator;
  readonly options: TxOptions;
  readonly auditDeps: AppendAuditDeps;
}

export function nowTs(ctx: Pick<Ctx, 'clock'>): string {
  return toDbTimestamp(ctx.clock.now());
}

export function requireW(ctx: Ctx): WriteContext {
  if (ctx.w === null) throw new DbRuleError('repo.invalid_input', 'ghi trong store.read() (giao dịch chỉ đọc)');
  return ctx.w;
}

export function actorOf(ctx: Ctx): ActorRow {
  if (ctx.actor === null) throw new DbRuleError('repo.invalid_input', 'giao dịch chỉ đọc không có actor');
  return ctx.actor;
}

// ------------------------------------------------------------------ định danh
export function q(ident: string): string {
  if (!SQL_IDENT_RE.test(ident)) throw invalidInput(`định danh SQL không hợp lệ: ${ident}`);
  return `"${ident}"`;
}

const columnCache = new Map<string, ReadonlySet<string>>();

/** Cột thật của bảng (PRAGMA table_info), cache theo tên (schema cố định trong một tiến trình). */
export function columnsOf(r: StatementRunner, table: string): ReadonlySet<string> {
  let cols = columnCache.get(table);
  if (cols === undefined) {
    const rows = r.all<{ name: string }>('SELECT name FROM pragma_table_info(?)', [table]);
    if (rows.length === 0) throw invalidInput(`bảng không tồn tại: ${table}`);
    cols = new Set(rows.map((x) => x.name));
    columnCache.set(table, cols);
  }
  return cols;
}

// ------------------------------------------------------------------ biểu thức SQL thô (FRESH_UPDATED_AT của stamp.ts)
const compiler = new Kysely<Record<string, never>>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

function isRaw(v: unknown): v is RawBuilder<unknown> {
  return typeof v === 'object' && v !== null && typeof (v as { compile?: unknown }).compile === 'function';
}

function setClause(values: Record<string, unknown>): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  for (const [k, v] of Object.entries(values)) {
    if (isRaw(v)) {
      const c = v.compile(compiler);
      parts.push(`${q(k)} = ${c.sql}`);
      params.push(...c.parameters);
    } else {
      parts.push(`${q(k)} = ?`);
      params.push(v);
    }
  }
  return { sql: parts.join(', '), params };
}

function defined(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) if (v !== undefined) out[k] = v;
  return out;
}

// ------------------------------------------------------------------ ghi
/** INSERT một hàng (tự điền id / workspace / display_id / created_at / created_by) và trả hàng đã ghi. */
export function insertRow<T>(ctx: Ctx, table: string, values: Record<string, unknown>): T {
  const w = requireW(ctx);
  const cols = columnsOf(ctx.r, table);
  let row = defined(values);
  if (cols.has('id') && row.id === undefined) row.id = ctx.newId();
  if (cols.has('workspace_id') && row.workspace_id === undefined) row.workspace_id = ctx.ws;
  const prefix = prefixOf(table);
  if (prefix !== null && cols.has('display_seq') && row.display_seq === undefined) {
    const d = allocateDisplayId(w, String(row.workspace_id ?? ctx.ws), prefix);
    row.display_seq = d.displaySeq;
    row.display_id = d.displayId;
  }
  if (cols.has('created_at') && row.created_at === undefined) row.created_at = nowTs(ctx);
  if (cols.has('created_by')) row = stampInsert(w, row as Parameters<typeof stampInsert>[1]);
  const keys = Object.keys(row);
  const unknown = keys.filter((k) => !cols.has(k));
  if (unknown.length > 0) throw invalidInput(`${table}: cột không tồn tại ${unknown.join(', ')}`);
  const [out] = dml(w).write(
    `INSERT INTO ${q(table)} (${keys.map(q).join(', ')}) VALUES (${keys.map(() => '?').join(', ')}) RETURNING *`,
    keys.map((k) => row[k]),
  ).rows;
  if (out === undefined) throw new DbRuleError('repo.not_found', `${table}: INSERT không trả hàng`);
  return out as T;
}

export interface UpdateOptions {
  /** Optimistic concurrency: lệch ⇒ 'repo.version_conflict'. */
  expectedVersion?: number;
  /** Mặc định true: cột nghiệp vụ ⇒ version + 1. false cho cột vận hành / cache (DATABASE §2.3). */
  bumpVersion?: boolean;
  /** Điều kiện thêm (SQL hằng do code viết + tham số) — vd chặn chuyển trạng thái đua. */
  extraWhere?: { sql: string; params: readonly unknown[] };
}

/** UPDATE theo id trong workspace của giao dịch; trả hàng mới. Không thấy ⇒ not_found / version_conflict. */
export function updateRow<T>(
  ctx: Ctx,
  table: string,
  id: string,
  patch: Record<string, unknown>,
  opts: UpdateOptions = {},
): T {
  return updateWhere<T>(ctx, table, id, patch, opts, false);
}

/** Xoá mềm (deleted_at = app_now(), deleted_by = actor). */
export function softDeleteRow<T>(ctx: Ctx, table: string, id: string, opts: UpdateOptions = {}): T {
  return updateWhere<T>(ctx, table, id, { deleted_at: nowTs(ctx) }, opts, true);
}

function updateWhere<T>(
  ctx: Ctx,
  table: string,
  id: string,
  patch: Record<string, unknown>,
  opts: UpdateOptions,
  softDelete: boolean,
): T {
  const w = requireW(ctx);
  const cols = columnsOf(ctx.r, table);
  const body = defined(patch);
  const unknown = Object.keys(body).filter((k) => !cols.has(k));
  if (unknown.length > 0) throw invalidInput(`${table}: cột không tồn tại ${unknown.join(', ')}`);
  let values: Record<string, unknown>;
  if (cols.has('updated_by')) {
    values = softDelete
      ? stampSoftDelete(w, body as Record<string, unknown> & { updated_at?: never })
      : stampUpdate(w, body as Record<string, unknown> & { updated_at?: never });
  } else {
    values = { ...body };
    if (cols.has('updated_at')) values.updated_at = nowTs(ctx);
  }
  const set = setClause(values);
  const bump = (opts.bumpVersion ?? true) && cols.has('version');
  const where = ['id = ?'];
  const params: unknown[] = [...set.params, id];
  if (cols.has('workspace_id')) {
    where.push('workspace_id = ?');
    params.push(ctx.ws);
  }
  if (opts.expectedVersion !== undefined) {
    where.push('version = ?');
    params.push(opts.expectedVersion);
  }
  if (opts.extraWhere) {
    where.push(`(${opts.extraWhere.sql})`);
    params.push(...opts.extraWhere.params);
  }
  const [out] = dml(w).write(
    `UPDATE ${q(table)} SET ${set.sql}${bump ? ', "version" = "version" + 1' : ''} WHERE ${where.join(' AND ')} RETURNING *`,
    params,
  ).rows;
  if (out !== undefined) return out as T;
  const exists = getRow<Record<string, unknown>>(ctx, table, id);
  if (exists === null) throw notFound(`${table} ${id}`);
  if (opts.expectedVersion !== undefined && exists.version !== opts.expectedVersion) {
    throw new DbRuleError(
      'repo.version_conflict',
      `${table} ${id}: version ${String(exists.version)} ≠ ${opts.expectedVersion}`,
    );
  }
  throw new DbRuleError(
    'repo.version_conflict',
    `${table} ${id}: trạng thái đã đổi (điều kiện cập nhật không còn đúng)`,
  );
}

// ------------------------------------------------------------------ đọc
/** Hàng theo id trong workspace của giao dịch (bảng có workspace_id), null nếu không có / thuộc tenant khác. */
export function getRow<T>(ctx: Ctx, table: string, id: string): T | null {
  const cols = columnsOf(ctx.r, table);
  const row = cols.has('workspace_id')
    ? ctx.r.get<T>(`SELECT * FROM ${q(table)} WHERE id = ? AND workspace_id = ?`, [id, ctx.ws])
    : ctx.r.get<T>(`SELECT * FROM ${q(table)} WHERE id = ?`, [id]);
  return row ?? null;
}

export function mustGetRow<T>(ctx: Ctx, table: string, id: string): T {
  const row = getRow<T>(ctx, table, id);
  if (row === null) throw notFound(`${table} ${id}`);
  return row;
}

/** Điều kiện WHERE dựng từ code: mảng mệnh đề SQL hằng + tham số. */
export class Where {
  readonly parts: string[] = [];
  readonly params: unknown[] = [];
  constructor(ctx: Ctx, opts: { live?: boolean; alias?: string } = {}) {
    const a = opts.alias ? `${opts.alias}.` : '';
    this.parts.push(`${a}workspace_id = ?`);
    this.params.push(ctx.ws);
    if (opts.live) this.parts.push(`${a}deleted_at IS NULL`);
  }
  add(sql: string, ...params: unknown[]): this {
    this.parts.push(sql);
    this.params.push(...params);
    return this;
  }
  /** Thêm điều kiện khi giá trị khác undefined. */
  eq(col: string, v: unknown): this {
    return v === undefined ? this : this.add(`${col} IS ?`, v);
  }
  in(col: string, vs: readonly unknown[] | undefined): this {
    if (vs === undefined) return this;
    if (vs.length === 0) return this.add('0');
    return this.add(`${col} IN (${vs.map(() => '?').join(', ')})`, ...vs);
  }
  sql(): string {
    return this.parts.join(' AND ');
  }
}

export function selectAll<T>(ctx: Ctx, table: string, where: Where, orderBy = 'display_seq'): T[] {
  return ctx.r.all<T>(`SELECT * FROM ${q(table)} WHERE ${where.sql()} ORDER BY ${orderBy}`, where.params);
}

export function selectOne<T>(ctx: Ctx, table: string, where: Where, orderBy = 'display_seq'): T | null {
  return (
    ctx.r.get<T>(`SELECT * FROM ${q(table)} WHERE ${where.sql()} ORDER BY ${orderBy} LIMIT 1`, where.params) ?? null
  );
}

/** Phân trang keyset theo display_seq (DATABASE §8.3): không OFFSET, tối đa PAGE_MAX. */
export function pageOf<T extends { display_seq: number }>(
  ctx: Ctx,
  table: string,
  where: Where,
  page: PageRequest | undefined,
): Page<T> {
  const limit = Math.min(Math.max(Math.trunc(page?.limit ?? PAGE_DEFAULT), 1), PAGE_MAX);
  const desc = page?.order === 'desc';
  if (page?.after !== undefined) where.add(desc ? 'display_seq < ?' : 'display_seq > ?', page.after);
  const rows = ctx.r.all<T>(
    `SELECT * FROM ${q(table)} WHERE ${where.sql()} ORDER BY display_seq ${desc ? 'DESC' : 'ASC'} LIMIT ?`,
    [...where.params, limit + 1],
  );
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return { items, nextAfter: rows.length > limit && last !== undefined ? last.display_seq : null };
}

/** Tra theo display_id; prefix phải đúng bảng (MM-0041 ⇒ memories, seq 41). */
export function getByDisplayId<T>(ctx: Ctx, table: string, seq: number | null): T | null {
  if (seq === null) return null;
  return ctx.r.get<T>(`SELECT * FROM ${q(table)} WHERE workspace_id = ? AND display_seq = ?`, [ctx.ws, seq]) ?? null;
}

// ------------------------------------------------------------------ audit tự động
export function audit(ctx: Ctx, entry: AuditEntryInput): AuditRow {
  return appendAuditFromEntry(ctx, requireW(ctx), actorOf(ctx), entry);
}

/** Bảng nội dung cá nhân: audit chỉ ghi hash giá trị (DATABASE §9.6). */
const SENSITIVE_TABLES: ReadonlySet<string> = new Set([
  'chat_messages',
  'memories',
  'knowledge_items',
  'knowledge_chunks',
  'message_attachments',
]);
/** Cột không bao giờ vào audit (bí mật / băm mật khẩu / cột kỹ thuật lặp lại). */
const NEVER_AUDIT: ReadonlySet<string> = new Set([
  'id',
  'workspace_id',
  'display_id',
  'display_seq',
  'created_at',
  'created_by',
  'updated_at',
  'updated_by',
  'version',
  'ciphertext',
  'nonce',
  'wrapped_dek',
  'dek_nonce',
  'password_hash',
  'token_hash',
]);

/** Ảnh cột cho audit: bỏ cột kỹ thuật / bí mật; bảng nhạy cảm ⇒ hash. Chỉ cột trong `only` nếu có. */
export function auditImage(
  table: string,
  row: Record<string, unknown>,
  only?: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const sensitive = SENSITIVE_TABLES.has(table);
  for (const [k, v] of Object.entries(row)) {
    if (NEVER_AUDIT.has(k) || (only !== undefined && !only.includes(k))) continue;
    if (Buffer.isBuffer(v)) continue;
    out[k] = sensitive && v !== null ? `sha256:${hashValue(v)}` : v;
  }
  return out;
}

function hashValue(v: unknown): string {
  return createHash('sha256').update(JSON.stringify(v)).digest('hex');
}

/** Cột đổi giữa hai ảnh (cho before / after của UPDATE). */
export function changedColumns(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return Object.keys(after).filter((k) => !NEVER_AUDIT.has(k) && !Object.is(before[k], after[k]));
}

export interface AuditedTarget {
  action: string;
  table: string;
  row: Record<string, unknown>;
  before?: Record<string, unknown> | null;
  roleId?: string | null;
  reason?: string | null;
  detail?: Record<string, unknown> | null;
  result?: AuditEntryInput['result'];
}

/** Ghi audit cho một thay đổi hàng: INSERT ⇒ after đầy đủ (đã lọc), UPDATE ⇒ chỉ cột đổi. Trả `row` để nối chuỗi gọi. */
export function audited<T extends object>(ctx: Ctx, t: Omit<AuditedTarget, 'row'> & { row: T }): T {
  const row = t.row as unknown as Record<string, unknown>;
  const changed = t.before ? changedColumns(t.before, row) : undefined;
  audit(ctx, {
    action: t.action,
    result: t.result,
    roleId: t.roleId ?? (typeof row.role_id === 'string' ? row.role_id : null),
    entity: {
      type: t.table,
      id: String(row.id ?? ''),
      displayId: typeof row.display_id === 'string' ? row.display_id : null,
    },
    before: t.before && changed ? auditImage(t.table, t.before, changed) : null,
    after: auditImage(t.table, row, changed),
    detail: t.detail ?? null,
    reason: t.reason ?? null,
  });
  return t.row;
}
