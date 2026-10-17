// Áp seed tham chiếu máy đọc được (contracts/seed.ts; DATABASE §11.1–11.2; CNS-170).
// - verifySeedReference: kiểm schema + sha256 (canonicalJson) — tệp bị sửa tay / lệch nguồn ⇒ throw.
// - applyGlobalSeed: một lần mỗi bản cài, bootstrap workspace hệ thống bằng actor system CÓ TRONG seed.
// - applyWorkspaceSeed: mỗi workspace tenant, bootstrap bằng actor system cấp trước của tenant đó.
// Bảng / cột đối chiếu với sqlite_master + PRAGMA table_info trước khi dựng SQL (định danh luôn được trích dẫn).
// created_by điền bằng actor của giao dịch (= app_actor()); seed không được tự khai (schema chặn).
import { createHash } from 'node:crypto';
import {
  type ActorSystemKey,
  type SeedRef,
  SeedReference,
  type SeedRow,
  type SeedScalar,
  type SeedTable,
  SYSTEM_WORKSPACE_ID,
  seedReferenceDigestInput,
} from '@ga/contracts';
import type { AppConnection, WriteContext } from '../connection.ts';
import { stampInsert } from '../stamp.ts';

export class SeedReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedReferenceError';
  }
}

export function seedReferenceSha256(seed: Parameters<typeof seedReferenceDigestInput>[0]): string {
  return createHash('sha256').update(seedReferenceDigestInput(seed), 'utf8').digest('hex');
}

/** Parse + kiểm sha256. Trả seed đã kiểm (chỉ dùng bản trả về, không dùng đầu vào thô). */
export function verifySeedReference(raw: unknown): SeedReference {
  const parsed = SeedReference.safeParse(raw);
  if (!parsed.success) throw new SeedReferenceError(`seed tham chiếu sai định dạng: ${parsed.error.message}`);
  const got = seedReferenceSha256(parsed.data);
  if (got !== parsed.data.sha256) {
    throw new SeedReferenceError(
      `sha256 seed tham chiếu ${got.slice(0, 12)}… ≠ khai ${parsed.data.sha256.slice(0, 12)}…`,
    );
  }
  return parsed.data;
}

export interface SeedApplyResult {
  inserted: number;
  /** Hàng đã có (trùng conflictKey) — chạy lại không nhân đôi. */
  skipped: number;
}

type Resolve = (ref: SeedRef) => string;

const quote = (ident: string) => `"${ident}"`;

/** Cột của bảng (PRAGMA table_info); bảng không tồn tại ⇒ throw. */
function tableColumns(w: WriteContext, table: string): Set<string> {
  const exists = w.get("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?", [table]);
  if (exists === undefined) throw new SeedReferenceError(`seed nhắc bảng không có trong DB: ${table}`);
  return new Set(w.all<{ name: string }>('SELECT name FROM pragma_table_info(?)', [table]).map((r) => r.name));
}

/**
 * Các bộ cột unique của bảng (PK + index UNIQUE không điều kiện). conflictKey phải trùng một bộ — chống "khoá" tuỳ tiện
 * làm bỏ sót hàng. (DB có trigger "chống REPLACE" RAISE trước khi ON CONFLICT kịp chạy ⇒ dùng WHERE NOT EXISTS.)
 */
function uniqueKeys(w: WriteContext, table: string): string[][] {
  const pk = w
    .all<{ name: string; pk: number }>('SELECT name, pk FROM pragma_table_info(?) WHERE pk > 0 ORDER BY pk', [table])
    .map((r) => r.name);
  const keys = pk.length > 0 ? [pk] : [];
  for (const ix of w.all<{ name: string }>('SELECT name FROM pragma_index_list(?) WHERE "unique" = 1 AND partial = 0', [
    table,
  ])) {
    keys.push(
      w.all<{ name: string }>('SELECT name FROM pragma_index_info(?) ORDER BY seqno', [ix.name]).map((r) => r.name),
    );
  }
  return keys;
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

function resolveRow(row: SeedRow, resolve: Resolve): Record<string, SeedScalar> {
  const out: Record<string, SeedScalar> = {};
  for (const [col, v] of Object.entries(row)) out[col] = v !== null && typeof v === 'object' ? resolve(v) : v;
  return out;
}

function seedTables(
  conn: AppConnection,
  target: { workspaceId: string; systemActorId: string },
  tables: readonly SeedTable[],
  resolve: Resolve,
): SeedApplyResult {
  return conn.bootstrap(target, (w) => {
    const result: SeedApplyResult = { inserted: 0, skipped: 0 };
    for (const t of tables) {
      const columns = tableColumns(w, t.table);
      if (!uniqueKeys(w, t.table).some((k) => sameSet(k, t.conflictKey))) {
        throw new SeedReferenceError(
          `${t.table}: conflictKey (${t.conflictKey.join(', ')}) không phải PK / UNIQUE của bảng`,
        );
      }
      for (const raw of t.rows) {
        const resolved = resolveRow(raw, resolve);
        const row: Record<string, SeedScalar> = columns.has('created_by')
          ? stampInsert(w, resolved as Record<string, SeedScalar> & { created_by?: never })
          : resolved;
        const cols = Object.keys(row);
        const unknown = cols.filter((c) => !columns.has(c));
        if (unknown.length > 0) throw new SeedReferenceError(`${t.table}: cột không tồn tại ${unknown.join(', ')}`);
        const sql =
          `INSERT INTO ${quote(t.table)} (${cols.map(quote).join(', ')}) SELECT ${cols.map(() => '?').join(', ')} ` +
          `WHERE NOT EXISTS (SELECT 1 FROM ${quote(t.table)} WHERE ${t.conflictKey.map((k) => `${quote(k)} IS ?`).join(' AND ')})`;
        const changes = w.run(sql, [...cols.map((c) => row[c]), ...t.conflictKey.map((k) => row[k])]).changes;
        if (changes > 0) result.inserted += changes;
        else result.skipped++;
      }
    }
    return result;
  });
}

const noRefs: Resolve = () => {
  throw new SeedReferenceError('seed global không dùng $ref');
};

/** Actor system của workspace hệ thống khai trong phần global (hàng actors workspace_id = SYS, system_key = system). */
export function globalSystemActorId(seed: SeedReference): string {
  for (const t of seed.global) {
    if (t.table !== 'actors') continue;
    for (const row of t.rows) {
      if (row.workspace_id === SYSTEM_WORKSPACE_ID && row.kind === 'system' && row.system_key === 'system') {
        if (typeof row.id === 'string') return row.id;
      }
    }
  }
  throw new SeedReferenceError('seed global thiếu actor system của workspace hệ thống');
}

/** Seed một lần mỗi bản cài — bootstrap workspace hệ thống bằng actor system khai trong seed. */
export function applyGlobalSeed(conn: AppConnection, seed: SeedReference): SeedApplyResult {
  return seedTables(
    conn,
    { workspaceId: SYSTEM_WORKSPACE_ID, systemActorId: globalSystemActorId(seed) },
    seed.global,
    noRefs,
  );
}

export interface WorkspaceSeedTarget {
  workspaceId: string;
  /** ULID cấp trước cho actor hệ thống của tenant (ít nhất `system`); seed tạo các hàng actors này. */
  actorIds: Partial<Record<ActorSystemKey, string>> & { system: string };
  /** id tất định của hàng seed theo khoá ổn định (DATABASE §11.1) — lane DB định nghĩa cách suy ra. */
  idFor(key: string): string;
}

/** Seed khi tạo một workspace tenant — bootstrap bằng actor system cấp trước của tenant. */
export function applyWorkspaceSeed(
  conn: AppConnection,
  seed: SeedReference,
  target: WorkspaceSeedTarget,
): SeedApplyResult {
  if (target.workspaceId === SYSTEM_WORKSPACE_ID) {
    throw new SeedReferenceError('seed perWorkspace chỉ cho workspace tenant');
  }
  const resolve: Resolve = (ref) => {
    if (ref.$ref === 'workspace') return target.workspaceId;
    if (ref.$ref === 'actor') {
      const id = target.actorIds[ref.key];
      if (id === undefined) throw new SeedReferenceError(`thiếu id cấp trước cho actor hệ thống ${ref.key}`);
      return id;
    }
    return target.idFor(ref.key);
  };
  return seedTables(
    conn,
    { workspaceId: target.workspaceId, systemActorId: target.actorIds.system },
    seed.perWorkspace,
    resolve,
  );
}
