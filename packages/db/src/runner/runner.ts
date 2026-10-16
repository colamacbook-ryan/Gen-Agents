// Runner migration riêng của app (DATABASE §10.1, §10.4; BUILD-PLAN §A.1, §D.4; CNS-157).
// - Forward-only; mỗi tệp standard/data một transaction; mỗi lần áp ghi một hàng `schema_migrations` (bảng của chính schema).
// - Tệp đã áp mà checksum đổi ⇒ DỪNG (throw).
// - Gặp hàng lạ (migration mới hơn bản app) ⇒ chế độ tương thích: app ≥ sàn thì chạy tiếp, < sàn thì từ chối.
// - Trigger (R__triggers) và view (R__views) là script repeatable: sau MỖI tệp migration (trong cùng transaction) ⇒ DROP rồi
//   CREATE lại toàn bộ + kiểm schema; lượt không có gì mới ⇒ so từng đối tượng với sqlite_master, lệch (bị sửa / mất) thì dựng lại.
// - kind: rebuild ⇒ quy trình 9 bước §10.1 (foreign_keys OFF ngoài transaction, app_maint() = 1, đếm dòng, foreign_key_check).

import type { AppConnection } from '../connection.ts';
import {
  compareSemver,
  loadMigrations,
  type MigrationSet,
  type RepeatableScript,
  type SqlObject,
  type VersionedMigration,
} from './files.ts';

export class MigrationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'MigrationError';
  }
}
export class ChecksumMismatchError extends MigrationError {}
export class IncompatibleSchemaError extends MigrationError {}

export interface MigrateOptions {
  /** Thư mục migrations/sqlite. */
  dir: string;
  /** Phiên bản app đang chạy (so với sàn tương thích). */
  appVersion: string;
  log?: (line: string) => void;
}

export interface MigrateResult {
  mode: 'normal' | 'compat';
  applied: Array<{ version: number; name: string; kind: string; durationMs: number }>;
  repeatables: { triggers: 'unchanged' | 'rebuilt'; views: 'unchanged' | 'rebuilt' };
  compatFloor: string | null;
}

interface AppliedRow {
  version: number;
  name: string;
  checksum: string;
  compat_min_app_version: string;
}

function tableExists(conn: AppConnection, name: string): boolean {
  return conn.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
}

function userTableCount(conn: AppConnection): number {
  return (
    conn.db
      .prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .get() as {
      n: number;
    }
  ).n;
}

function nowTs(conn: AppConnection): string {
  return conn.clock.now().toISOString();
}

function recordMigration(
  conn: AppConnection,
  m: VersionedMigration,
  appVersion: string,
  durationMs: number,
  rowCounts: unknown,
) {
  conn.db
    .prepare(
      `INSERT INTO schema_migrations (version, name, kind, checksum, dialect, compat_min_app_version, is_expand_only,
         applied_at, app_version, duration_ms, row_counts_json)
       VALUES (?, ?, ?, ?, 'sqlite', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      m.version,
      m.name,
      m.kind,
      m.checksum,
      m.compatMinAppVersion,
      m.expandOnly ? 1 : 0,
      nowTs(conn),
      appVersion,
      durationMs,
      rowCounts === null ? null : JSON.stringify(rowCounts),
    );
}

function inTxn<T>(conn: AppConnection, fn: () => T): T {
  const db = conn.db;
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    if (db.inTransaction) db.exec('ROLLBACK');
    throw e;
  }
}

// ---------------------------------------------------------------- repeatable
function currentObjects(conn: AppConnection, type: 'trigger' | 'view'): SqlObject[] {
  return (
    conn.db.prepare('SELECT name, sql FROM sqlite_master WHERE type = ? ORDER BY rowid').all(type) as Array<{
      name: string;
      sql: string;
    }>
  ).map((r) => ({ type, name: r.name, sql: r.sql }));
}

function sameObjects(a: SqlObject[], b: SqlObject[]): boolean {
  return a.length === b.length && a.every((o, i) => o.name === b[i]?.name && o.sql === b[i]?.sql);
}

function dropAll(conn: AppConnection, type: 'trigger' | 'view'): void {
  for (const o of currentObjects(conn, type)) {
    conn.db.exec(`DROP ${type.toUpperCase()} IF EXISTS "${o.name}"`);
  }
}

function createAll(conn: AppConnection, script: RepeatableScript): void {
  for (const o of script.objects) {
    try {
      conn.db.exec(`${o.sql};`);
    } catch (e) {
      throw new MigrationError(`${script.file}: tạo ${o.type} ${o.name} lỗi: ${(e as Error).message}`, { cause: e });
    }
  }
}

/**
 * SQLite KHÔNG kiểm tham chiếu khi CREATE VIEW / CREATE TRIGGER — view trỏ cột đã mất vẫn tạo được.
 * Nên sau khi dựng lại repeatable, ép kiểm:
 *  (1) RENAME một bảng nháp ⇒ SQLite phân giải lại MỌI view + trigger (bắt cột / bảng không tồn tại trong view, WHEN, SELECT);
 *  (2) prepare từng view ⇒ bắt cả hàm không tồn tại.
 * Còn sót (không kiểm tĩnh được): danh sách cột của INSERT trong thân trigger — lộ ra khi trigger chạy (bộ test DB bắt).
 */
function validateSchema(conn: AppConnection): void {
  const db = conn.db;
  if (db.pragma('legacy_alter_table', { simple: true }) !== 0) {
    throw new MigrationError('legacy_alter_table đang bật — không kiểm được schema');
  }
  try {
    db.exec(
      'CREATE TABLE "__ga_schema_check" (x); ALTER TABLE "__ga_schema_check" RENAME TO "__ga_schema_check2"; DROP TABLE "__ga_schema_check2";',
    );
  } catch (e) {
    throw new MigrationError(`schema sau migration không hợp lệ: ${(e as Error).message}`, { cause: e });
  }
  for (const v of currentObjects(conn, 'view')) {
    try {
      db.prepare(`SELECT * FROM "${v.name}" LIMIT 0`).all();
    } catch (e) {
      throw new MigrationError(`view ${v.name} không chạy được: ${(e as Error).message}`, { cause: e });
    }
  }
}

/** DROP rồi CREATE lại view + trigger theo R__*, rồi kiểm schema. Phải gọi TRONG transaction của người gọi. */
function rebuildRepeatables(conn: AppConnection, set: MigrationSet): void {
  dropAll(conn, 'view');
  dropAll(conn, 'trigger');
  createAll(conn, set.triggers);
  createAll(conn, set.views);
  validateSchema(conn);
}

function repeatablesInSync(conn: AppConnection, set: MigrationSet): { triggers: boolean; views: boolean } {
  return {
    triggers: sameObjects(currentObjects(conn, 'trigger'), set.triggers.objects),
    views: sameObjects(currentObjects(conn, 'view'), set.views.objects),
  };
}

// ---------------------------------------------------------------- rebuild (§10.1, 9 bước)
function rowCount(conn: AppConnection, table: string): number {
  return (conn.db.prepare(`SELECT count(*) AS n FROM "${table}"`).get() as { n: number }).n;
}

function referencingTables(conn: AppConnection, table: string): string[] {
  return (
    conn.db
      .prepare(
        `SELECT DISTINCT m.name AS name FROM sqlite_master m, pragma_foreign_key_list(m.name) f
         WHERE m.type = 'table' AND f."table" = ? ORDER BY m.name`,
      )
      .all(table) as Array<{ name: string }>
  ).map((r) => r.name);
}

function columns(conn: AppConnection, table: string): string[] {
  return (conn.db.prepare(`SELECT name FROM pragma_table_info(?)`).all(table) as Array<{ name: string }>).map(
    (r) => r.name,
  );
}

/** Bước 9: bật lại foreign_keys và ĐỌC LẠI — không bao giờ để kết nối ở trạng thái FK tắt. */
function restoreForeignKeys(conn: AppConnection, failure: unknown): void {
  conn.db.pragma('foreign_keys = ON');
  if (conn.db.pragma('foreign_keys', { simple: true }) !== 1) {
    throw new MigrationError('không bật lại được foreign_keys sau rebuild', failure ? { cause: failure } : undefined);
  }
}

function applyRebuild(conn: AppConnection, m: VersionedMigration, set: MigrationSet, appVersion: string): number {
  const db = conn.db;
  const table = m.rebuildTable as string;
  const def = m.objects.find((o) => o.type === 'table') as SqlObject;
  const indexes = m.objects.filter((o) => o.type === 'index');
  // 1. chế độ bảo trì: không kết nối nào khác đang ghi (updater bảo đảm); không đang trong transaction
  if (db.inTransaction) throw new MigrationError(`${m.file}: rebuild phải bắt đầu ngoài transaction`);
  if (!tableExists(conn, table)) throw new MigrationError(`${m.file}: không có bảng ${table}`);
  // 2. foreign_keys OFF TRƯỚC BEGIN (đặt trong transaction không có tác dụng — DATABASE §10.1, M2)
  db.pragma('foreign_keys = OFF');
  if (db.pragma('foreign_keys', { simple: true }) !== 0)
    throw new MigrationError('không tắt được foreign_keys trước rebuild');
  const started = performance.now();
  try {
    // 3. BEGIN IMMEDIATE + app_maint() = 1
    db.exec('BEGIN IMMEDIATE');
    try {
      conn.withMaintenance(
        `migration ${m.file}: rebuild ${table}`,
        () => {
          // 4. bỏ mọi view + trigger (R__* dựng lại đủ ở bước 7; index của bảng đích đi theo DROP TABLE)
          dropAll(conn, 'view');
          dropAll(conn, 'trigger');
          // 5. đếm dòng bảng đích + mọi bảng có FK trỏ vào nó
          const counted = [table, ...referencingTables(conn, table).filter((t) => t !== table)];
          const before = Object.fromEntries(counted.map((t) => [t, rowCount(conn, t)]));
          // 6. bảng mới → chép cột chung → bỏ bảng cũ → đổi tên
          const tmp = `${table}__new`;
          const createSql = def.sql.replace(new RegExp(`^CREATE TABLE\\s+"?${table}"?`), `CREATE TABLE "${tmp}"`);
          if (createSql === def.sql)
            throw new MigrationError(`${m.file}: định nghĩa bảng phải bắt đầu bằng CREATE TABLE ${table}`);
          db.exec(createSql);
          const newCols = new Set(columns(conn, tmp));
          const common = columns(conn, table)
            .filter((c) => newCols.has(c))
            .map((c) => `"${c}"`)
            .join(', ');
          db.exec(`INSERT INTO "${tmp}" (${common}) SELECT ${common} FROM "${table}"`);
          db.exec(`DROP TABLE "${table}"`);
          db.exec(`ALTER TABLE "${tmp}" RENAME TO "${table}"`);
          // 7. index theo định nghĩa mới, rồi chạy lại repeatable trigger + view
          for (const ix of indexes) db.exec(`${ix.sql};`);
          createAll(conn, set.triggers);
          createAll(conn, set.views);
          validateSchema(conn);
          // 8. số dòng phải bằng; foreign_key_check phải rỗng
          const after = Object.fromEntries(counted.map((t) => [t, rowCount(conn, t)]));
          const lost = counted.filter((t) => before[t] !== after[t]);
          const fk = db.pragma('foreign_key_check') as unknown[];
          if (lost.length > 0 || fk.length > 0) {
            throw new MigrationError(
              `${m.file}: rebuild ${table} lệch số dòng ${JSON.stringify(lost.map((t) => [t, before[t], after[t]]))} hoặc foreign_key_check ${fk.length} lỗi`,
            );
          }
          // 9. ghi schema_migrations trong cùng transaction
          recordMigration(conn, m, appVersion, Math.round(performance.now() - started), before);
        },
        { transaction: 'caller' },
      );
      db.exec('COMMIT');
    } catch (e) {
      if (db.inTransaction) db.exec('ROLLBACK');
      throw e;
    }
  } catch (e) {
    restoreForeignKeys(conn, e);
    throw e;
  }
  restoreForeignKeys(conn, null);
  return Math.round(performance.now() - started);
}

// ---------------------------------------------------------------- lượt migration
export function migrate(
  conn: AppConnection,
  opts: MigrateOptions,
  set: MigrationSet = loadMigrations(opts.dir),
): MigrateResult {
  const log = opts.log ?? (() => {});
  if (conn.role === 'reader') throw new MigrationError('runner cần kết nối ghi');
  if (conn.db.inTransaction) throw new MigrationError('runner phải chạy ngoài transaction');

  const hasHistory = tableExists(conn, 'schema_migrations');
  if (!hasHistory && userTableCount(conn) > 0) {
    throw new MigrationError('DB có bảng nhưng không có schema_migrations — không phải DB của Gen-Agents, dừng');
  }
  const applied: AppliedRow[] = hasHistory
    ? (conn.db
        .prepare('SELECT version, name, checksum, compat_min_app_version FROM schema_migrations ORDER BY version')
        .all() as AppliedRow[])
    : [];
  const known = new Map(set.versioned.map((m) => [m.version, m]));

  for (const row of applied) {
    const f = known.get(row.version);
    if (f && f.checksum !== row.checksum) {
      throw new ChecksumMismatchError(
        `migration ${f.file} đã áp nhưng nội dung đã đổi (checksum ${row.checksum.slice(0, 12)}… → ${f.checksum.slice(0, 12)}…) — dừng khởi động`,
      );
    }
  }
  const compatFloor = applied.reduce<string | null>(
    (acc, r) => (acc === null || compareSemver(r.compat_min_app_version, acc) > 0 ? r.compat_min_app_version : acc),
    null,
  );
  const unknownNewer = applied.filter((r) => !known.has(r.version));
  if (unknownNewer.length > 0) {
    if (compatFloor !== null && compareSemver(opts.appVersion, compatFloor) < 0) {
      throw new IncompatibleSchemaError(
        `DB có migration mới hơn bản app (${unknownNewer.map((r) => r.version).join(', ')}) và sàn tương thích ${compatFloor} > app ${opts.appVersion} — restore bản backup pre_update`,
      );
    }
    log(
      `⚠ đang chạy bản cũ (${opts.appVersion}) trên schema mới hơn (expand-only, sàn ${compatFloor}) — chế độ tương thích`,
    );
    return { mode: 'compat', applied: [], repeatables: { triggers: 'unchanged', views: 'unchanged' }, compatFloor };
  }

  const appliedSet = new Set(applied.map((r) => r.version));
  const pending = set.versioned.filter((m) => !appliedSet.has(m.version));
  const done: MigrateResult['applied'] = [];

  // Mỗi tệp một transaction GỒM CẢ việc dựng lại R__* + kiểm schema: tệp lỗi ⇒ rollback trọn, DB không bao giờ ở trạng thái
  // "đã áp bảng nhưng mất view / trigger".
  for (const m of pending) {
    log(`◐ áp ${m.file} (${m.kind})`);
    if (m.kind === 'rebuild') {
      const ms = applyRebuild(conn, m, set, opts.appVersion);
      done.push({ version: m.version, name: m.name, kind: m.kind, durationMs: ms });
      continue;
    }
    const t0 = performance.now();
    // migration = thao tác bảo trì của hệ thống (DATABASE §10.4 bước 2): app_maint() = 1, không có actor người dùng
    inTxn(conn, () =>
      conn.withMaintenance(
        `migration ${m.file}`,
        () => {
          dropAll(conn, 'view'); // view có thể làm ALTER … RENAME lỗi (DATABASE §10.1); dựng lại ngay sau tệp
          try {
            conn.db.exec(m.sql);
          } catch (e) {
            throw new MigrationError(`${m.file}: ${(e as Error).message}`, { cause: e });
          }
          rebuildRepeatables(conn, set);
          recordMigration(conn, m, opts.appVersion, Math.round(performance.now() - t0), null);
        },
        { transaction: 'caller' },
      ),
    );
    done.push({ version: m.version, name: m.name, kind: m.kind, durationMs: Math.round(performance.now() - t0) });
  }

  let repeatables: MigrateResult['repeatables'] = { triggers: 'unchanged', views: 'unchanged' };
  if (pending.length > 0) {
    repeatables = { triggers: 'rebuilt', views: 'rebuilt' };
  } else {
    const sync = repeatablesInSync(conn, set);
    if (!sync.triggers || !sync.views) {
      log('⚠ trigger / view lệch R__* (bị sửa tay hoặc mất) — dựng lại');
      inTxn(conn, () => rebuildRepeatables(conn, set));
      repeatables = { triggers: 'rebuilt', views: 'rebuilt' };
    }
  }
  const finalFloor = (
    conn.db.prepare('SELECT compat_min_app_version AS v FROM schema_migrations').all() as Array<{ v: string }>
  ).reduce<string | null>((acc, r) => (acc === null || compareSemver(r.v, acc) > 0 ? r.v : acc), null);
  return { mode: 'normal', applied: done, repeatables, compatFloor: finalFloor };
}
