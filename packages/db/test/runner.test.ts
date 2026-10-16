// Runner migration (DATABASE §10.1, §10.4; BUILD-PLAN §C.4): baseline + R__*, checksum, chế độ tương thích, trôi trigger,
// và quy trình rebuild 9 bước (CNS-157: sau rebuild mọi trigger còn đủ vì R__triggers chạy lại).
import { copyFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type AppConnection, openScratch, openWriter } from '../src/connection.ts';
import { SYNC } from '../src/generated/sync.ts';
import {
  ChecksumMismatchError,
  IncompatibleSchemaError,
  MigrationError,
  MigrationFileError,
  migrate,
  parseVersioned,
  SQLITE_MIGRATIONS_DIR,
} from '../src/runner/index.ts';
import { count, FakeClock, SYS_ACTOR, SYS_WS, seedMinimal, TENANT_ACTOR, TENANT_WS, tempDir } from './helpers.ts';

const clock = () => new FakeClock('2026-10-14T08:00:00.000Z');
const objects = (c: AppConnection, type: string) => count(c, 'SELECT count(*) FROM sqlite_master WHERE type = ?', type);

function copyMigrations(dest: string): void {
  for (const f of readdirSync(SQLITE_MIGRATIONS_DIR)) copyFileSync(join(SQLITE_MIGRATIONS_DIR, f), join(dest, f));
}

describe('runner — DB rỗng → baseline + R__triggers + R__views', () => {
  it('áp 0001, dựng đủ bảng / trigger / view theo SYNC, ghi schema_migrations', () => {
    const conn = openScratch({ clock: clock() });
    try {
      const r = migrate(conn, { dir: SQLITE_MIGRATIONS_DIR, appVersion: '0.0.0' });
      expect(r.mode).toBe('normal');
      expect(r.applied.map((a) => [a.version, a.name, a.kind])).toEqual([[1, 'baseline', 'standard']]);
      expect(r.repeatables).toEqual({ triggers: 'rebuilt', views: 'rebuilt' });
      expect(objects(conn, 'trigger')).toBe(SYNC.counts.triggers);
      expect(objects(conn, 'view')).toBe(SYNC.counts.views);
      expect(
        count(
          conn,
          "SELECT count(*) FROM pragma_table_list WHERE schema = 'main' AND type = 'table' AND name NOT LIKE 'sqlite_%'",
        ),
      ).toBe(SYNC.counts.tables);
      const row = conn.db
        .prepare('SELECT version, kind, dialect, app_version, applied_at FROM schema_migrations')
        .get();
      expect(row).toEqual({
        version: 1,
        kind: 'standard',
        dialect: 'sqlite',
        app_version: '0.0.0',
        applied_at: '2026-10-14T08:00:00.000Z',
      });
      // hai cách đếm độc lập phải trùng: db-sync (Python sqlite3) ghi SYNC.json, db:gen (better-sqlite3) ghi sync.ts
      const json = JSON.parse(readFileSync(new URL('../../../db/spec/SYNC.json', import.meta.url), 'utf8'));
      expect(SYNC.rev).toBe(json.rev);
      expect(SYNC.counts).toEqual({
        tables: json.counts.tables,
        virtualTables: json.counts.virtual_tables,
        indexes: json.counts.indexes,
        triggers: json.counts.triggers,
        views: json.counts.views,
      });
    } finally {
      conn.close();
    }
  });

  it('lượt hai không làm gì; trigger bị xoá tay ⇒ R__triggers dựng lại', () => {
    const conn = openScratch({ clock: clock() });
    try {
      migrate(conn, { dir: SQLITE_MIGRATIONS_DIR, appVersion: '0.0.0' });
      const again = migrate(conn, { dir: SQLITE_MIGRATIONS_DIR, appVersion: '0.0.0' });
      expect(again.applied).toEqual([]);
      expect(again.repeatables).toEqual({ triggers: 'unchanged', views: 'unchanged' });
      conn.db.exec('DROP TRIGGER blobs_no_delete');
      expect(objects(conn, 'trigger')).toBe(SYNC.counts.triggers - 1);
      const healed = migrate(conn, { dir: SQLITE_MIGRATIONS_DIR, appVersion: '0.0.0' });
      expect(healed.repeatables.triggers).toBe('rebuilt');
      expect(objects(conn, 'trigger')).toBe(SYNC.counts.triggers);
    } finally {
      conn.close();
    }
  });

  it('DB lạ (có bảng, không có schema_migrations) ⇒ dừng', () => {
    const conn = openScratch({ clock: clock() });
    try {
      conn.db.exec('CREATE TABLE something_else (a)');
      expect(() => migrate(conn, { dir: SQLITE_MIGRATIONS_DIR, appVersion: '0.0.0' })).toThrow(MigrationError);
    } finally {
      conn.close();
    }
  });
});

describe('runner — checksum + chế độ tương thích (§10.4)', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => {
    tmp = tempDir('ga-mig-');
    copyMigrations(tmp.dir);
  });
  afterEach(() => tmp.cleanup());

  it('tệp đã áp bị sửa ⇒ ChecksumMismatchError (dừng khởi động)', () => {
    const conn = openScratch({ clock: clock() });
    try {
      migrate(conn, { dir: tmp.dir, appVersion: '0.0.0' });
      const f = join(tmp.dir, '0001_baseline.sql');
      writeFileSync(f, `${readFileSync(f, 'utf8')}\n-- sửa tay\n`);
      expect(() => migrate(conn, { dir: tmp.dir, appVersion: '0.0.0' })).toThrow(ChecksumMismatchError);
    } finally {
      conn.close();
    }
  });

  it('hàng lạ mới hơn bản app: app < sàn ⇒ từ chối; app ≥ sàn ⇒ chạy ở chế độ tương thích', () => {
    const conn = openScratch({ clock: clock() });
    try {
      migrate(conn, { dir: tmp.dir, appVersion: '0.0.0' });
      const ins = conn.db.prepare(
        `INSERT INTO schema_migrations (version, name, kind, checksum, dialect, compat_min_app_version, is_expand_only, app_version)
         VALUES (?, 'from_newer_app', 'standard', 'x', 'sqlite', ?, 1, '0.3.0')`,
      );
      ins.run(9001, '0.3.0');
      expect(() => migrate(conn, { dir: tmp.dir, appVersion: '0.2.9' })).toThrow(IncompatibleSchemaError);
      const ok = migrate(conn, { dir: tmp.dir, appVersion: '0.3.0' });
      expect(ok.mode).toBe('compat');
      expect(ok.compatFloor).toBe('0.3.0');
    } finally {
      conn.close();
    }
  });

  it('lint header §10.1: expand_only không được DROP / RENAME / CREATE TRIGGER / rebuild', () => {
    const head = (kind: string, expand: string) =>
      `-- kind: ${kind}\n-- compat_min_app_version: 0.1.0\n-- expand_only: ${expand}\n-- breaking: none\n`;
    expect(() =>
      parseVersioned('0002_x.sql', `${head('standard', 'true')}-- @ga:object table t\nDROP TABLE roles;\n`),
    ).toThrow(MigrationFileError);
    expect(() =>
      parseVersioned(
        '0002_x.sql',
        `${head('standard', 'true')}-- @ga:object trigger t\nCREATE TRIGGER t AFTER INSERT ON a BEGIN SELECT 1; END;\n`,
      ),
    ).toThrow(MigrationFileError);
    expect(() =>
      parseVersioned(
        '0002_x.sql',
        `${head('rebuild', 'true')}-- rebuild_table: t\n-- @ga:object table t\nCREATE TABLE t (a);\n`,
      ),
    ).toThrow(MigrationFileError);
    expect(() => parseVersioned('0002_x.sql', '-- kind: standard\n')).toThrow(/compat_min_app_version/);
    const ok = parseVersioned('0002_x.sql', `${head('standard', 'true')}-- @ga:object table t\nCREATE TABLE t (a);\n`);
    expect(ok.expandOnly).toBe(true);
  });
});

// ---------------------------------------------------------------- rebuild
function positionsDdl(conn: AppConnection): { table: string; indexes: Array<{ name: string; sql: string }> } {
  const table = (
    conn.db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'positions'").get() as {
      sql: string;
    }
  ).sql;
  const indexes = conn.db
    .prepare(
      "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'positions' AND sql IS NOT NULL ORDER BY rowid",
    )
    .all() as Array<{ name: string; sql: string }>;
  return { table, indexes };
}

function rebuildFile(table: string, indexes: Array<{ name: string; sql: string }>): string {
  return [
    '-- kind: rebuild',
    '-- compat_min_app_version: 0.0.0',
    '-- expand_only: false',
    '-- breaking: none (test)',
    '-- rebuild_table: positions',
    '-- @ga:object table positions',
    `${table};`,
    ...indexes.map((ix) => `-- @ga:object index ${ix.name}\n${ix.sql};`),
    '',
  ].join('\n');
}

describe('runner — rebuild 9 bước (bảng có view + trigger phụ thuộc)', () => {
  let tmp: ReturnType<typeof tempDir>;
  let conn: AppConnection;
  beforeEach(() => {
    tmp = tempDir('ga-rebuild-');
    copyMigrations(tmp.dir);
    conn = openWriter(join(tmp.dir, 'gen.sqlite'), { clock: clock() });
    migrate(conn, { dir: tmp.dir, appVersion: '0.0.0' });
    seedMinimal(conn);
    const ins = conn.db.prepare(
      'INSERT INTO positions (id, workspace_id, display_id, display_seq, created_by, title, title_template, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    ins.run(
      '01JPOS00000000000000000001',
      TENANT_WS,
      'PS-0001',
      1,
      TENANT_ACTOR,
      'Trợ lý',
      'Trợ lý của {owner_name}',
      1,
    );
    ins.run('01JPOS00000000000000000002', TENANT_WS, 'PS-0002', 2, TENANT_ACTOR, 'Kế toán', null, 0);
    ins.run('01JPOS00000000000000000003', SYS_WS, 'PS-0001', 1, SYS_ACTOR, 'Hệ thống', null, 0);
  });
  afterEach(() => {
    conn.close();
    tmp.cleanup();
  });

  it('thêm cột: giữ số dòng, trigger + view còn đủ, FK bật lại, ghi row_counts_json', () => {
    const views = count(conn, "SELECT count(*) FROM sqlite_master WHERE type = 'view' AND sql LIKE '%positions%'");
    expect(views).toBeGreaterThan(0); // có view phụ thuộc thật
    const { table, indexes } = positionsDdl(conn);
    const widened = table.replace('description TEXT,', 'description TEXT, nickname TEXT,');
    expect(widened).not.toBe(table);
    writeFileSync(join(tmp.dir, '0002_positions_nickname.sql'), rebuildFile(widened, indexes));

    const r = migrate(conn, { dir: tmp.dir, appVersion: '0.0.0' });
    expect(r.applied.map((a) => [a.version, a.kind])).toEqual([[2, 'rebuild']]);
    expect(objects(conn, 'trigger')).toBe(SYNC.counts.triggers);
    expect(objects(conn, 'view')).toBe(SYNC.counts.views);
    expect(count(conn, 'SELECT count(*) FROM positions')).toBe(3);
    expect(count(conn, "SELECT count(*) FROM pragma_table_info('positions') WHERE name = 'nickname'")).toBe(1);
    expect(conn.db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect((conn.db.pragma('foreign_key_check') as unknown[]).length).toBe(0);
    const rc = JSON.parse(
      (conn.db.prepare('SELECT row_counts_json AS j FROM schema_migrations WHERE version = 2').get() as { j: string })
        .j,
    );
    expect(rc.positions).toBe(3);
    // guard của bảng vẫn sống sau rebuild (trigger dựng lại): đổi cột danh tính bị chặn
    expect(() => conn.db.exec("UPDATE positions SET display_seq = 9 WHERE display_id = 'PS-0002'")).toThrow(
      /immutable|identity|danh tính/i,
    );
    // view đọc được
    expect(() => conn.db.prepare('SELECT count(*) FROM v_core_agent_status').get()).not.toThrow();
  });

  it('rebuild làm hỏng view (bỏ cột view cần) ⇒ ROLLBACK, DB như cũ, FK vẫn bật', () => {
    const { table, indexes } = positionsDdl(conn);
    const broken = table.replace(/\n\s*title TEXT NOT NULL,/, '');
    expect(broken).not.toBe(table);
    writeFileSync(join(tmp.dir, '0002_positions_broken.sql'), rebuildFile(broken, indexes));
    expect(() => migrate(conn, { dir: tmp.dir, appVersion: '0.0.0' })).toThrow(MigrationError);
    expect(objects(conn, 'trigger')).toBe(SYNC.counts.triggers);
    expect(objects(conn, 'view')).toBe(SYNC.counts.views);
    expect(count(conn, "SELECT count(*) FROM pragma_table_info('positions') WHERE name = 'title'")).toBe(1);
    expect(count(conn, 'SELECT count(*) FROM schema_migrations WHERE version = 2')).toBe(0);
    expect(count(conn, 'SELECT count(*) FROM positions')).toBe(3);
    expect(conn.db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(conn.inMaintenance()).toBe(false);
  });
});
