// Hợp đồng kết nối ⑥-05 (BUILD-PLAN §D.4, §E.1 DoD): pragma §10.7 · app_now() = Clock giả · kết nối đọc không ghi được ·
// thiếu app_maint() thì bị chặn (fail-closed) · ngữ cảnh bảo trì / khởi tạo (CNS-170).
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type AppConnection,
  appLocalTime,
  ConnectionContractError,
  openReader,
  openScratch,
  openWriter,
  REQUIRED_PRAGMAS,
  registeredAppFunctions,
} from '../src/connection.ts';
import { SYNC } from '../src/generated/sync.ts';
import { migrate, SQLITE_MIGRATIONS_DIR } from '../src/runner/index.ts';
import { count, FakeClock, SYS_ACTOR, SYS_WS, seedMinimal, tempDir } from './helpers.ts';

const BLOB_SHA = 'ab'.repeat(32);

describe('connection — pragma DATABASE §10.7', () => {
  let tmp: ReturnType<typeof tempDir>;
  let writer: AppConnection;
  beforeEach(() => {
    tmp = tempDir('ga-conn-');
    writer = openWriter(join(tmp.dir, 'gen.sqlite'), { clock: new FakeClock('2026-10-14T08:00:00.000Z') });
  });
  afterEach(() => {
    writer.close();
    tmp.cleanup();
  });

  it('đủ 9 pragma của §10.7 và đọc lại đúng giá trị', () => {
    expect(REQUIRED_PRAGMAS.map((p) => p.name).sort()).toEqual(
      [
        'busy_timeout',
        'cache_size',
        'foreign_keys',
        'journal_mode',
        'mmap_size',
        'recursive_triggers',
        'synchronous',
        'temp_store',
        'wal_autocheckpoint',
      ].sort(),
    );
    const read = (n: string) => writer.db.pragma(n, { simple: true });
    expect(read('journal_mode')).toBe('wal');
    expect(read('synchronous')).toBe(2); // FULL
    expect(read('foreign_keys')).toBe(1);
    expect(read('recursive_triggers')).toBe(1);
    expect(read('busy_timeout')).toBe(5000);
    expect(read('cache_size')).toBe(-65536);
    expect(read('temp_store')).toBe(2); // MEMORY
    expect(read('mmap_size')).toBe(268435456);
    expect(read('wal_autocheckpoint')).toBe(1000);
  });

  it('kết nối đọc cũng đủ pragma (+ query_only), DB ở WAL', () => {
    const reader = openReader(join(tmp.dir, 'gen.sqlite'), { clock: new FakeClock('2026-10-14T08:00:00.000Z') });
    try {
      const read = (n: string) => reader.db.pragma(n, { simple: true });
      expect(read('journal_mode')).toBe('wal');
      expect(read('foreign_keys')).toBe(1);
      expect(read('recursive_triggers')).toBe(1);
      expect(read('query_only')).toBe(1);
    } finally {
      reader.close();
    }
  });

  it('DB trong RAM không được mở làm kết nối app', () => {
    expect(() => openWriter(':memory:', { clock: new FakeClock('2026-10-14T08:00:00.000Z') })).toThrow(
      ConnectionContractError,
    );
  });
});

describe('connection — hàm app_*', () => {
  it('đăng ký đủ mọi hàm app_* mà schema đã vendor gọi (SYNC.json)', () => {
    expect(SYNC.appFunctions.length).toBeGreaterThan(0);
    for (const fn of SYNC.appFunctions) expect(registeredAppFunctions()).toContain(fn);
  });

  it('app_now() = Clock giả (đúng dạng ts 24 ký tự), đi theo đồng hồ', () => {
    const clock = new FakeClock('2026-10-14T08:00:00.000Z');
    const conn = openScratch({ clock });
    try {
      const now = () => (conn.db.prepare('SELECT app_now() AS t').get() as { t: string }).t;
      expect(now()).toBe('2026-10-14T08:00:00.000Z');
      clock.advance(15 * 60_000 + 1);
      expect(now()).toBe('2026-10-14T08:15:00.001Z');
      clock.set('2026-09-27T14:00:05.000Z');
      expect(now()).toBe('2026-09-27T14:00:05.000Z');
    } finally {
      conn.close();
    }
  });

  it('app_maint() trả INTEGER 0/1', () => {
    const conn = openScratch({ clock: new FakeClock('2026-10-14T08:00:00.000Z') });
    try {
      const q = () => conn.db.prepare('SELECT app_maint() AS m, typeof(app_maint()) AS t').get();
      expect(q()).toEqual({ m: 0, t: 'integer' });
      expect(conn.maintenance('kiểm', () => q())).toEqual({ m: 1, t: 'integer' });
      expect(q()).toEqual({ m: 0, t: 'integer' });
    } finally {
      conn.close();
    }
  });

  it('app_local_time(ts, tz) khớp bản Python của bộ test DB (zoneinfo)', () => {
    const cases: Array<[string | null, string | null]> = [
      ['2026-10-14T08:00:00.000Z', 'Asia/Ho_Chi_Minh'],
      ['2026-03-08T07:30:00.000Z', 'America/New_York'],
      ['2026-11-01T05:30:00.000Z', 'America/New_York'],
      ['2026-12-31T23:59:59.999Z', 'Pacific/Kiritimati'],
      ['2026-02-30T08:00:00.000Z', 'UTC'],
      ['khong-phai-ts', 'UTC'],
      ['2026-10-14T08:00:00.000Z', 'Mars/Olympus'],
      [null, 'UTC'],
      ['2026-10-14T08:00:00.000Z', null],
    ];
    const py = `
import datetime, json, sys, zoneinfo
def app_local_time(ts, tz):
    try:
        t = datetime.datetime.strptime(ts[:19], '%Y-%m-%dT%H:%M:%S').replace(tzinfo=datetime.timezone.utc)
        return t.astimezone(zoneinfo.ZoneInfo(tz)).strftime('%Y-%m-%d %H:%M:%S')
    except (ValueError, TypeError, KeyError):
        return None
print(json.dumps([app_local_time(a, b) for a, b in json.loads(sys.argv[1])]))`;
    const expected = JSON.parse(execFileSync('python3', ['-I', '-c', py, JSON.stringify(cases)], { encoding: 'utf8' }));
    expect(cases.map(([ts, tz]) => appLocalTime(ts, tz))).toEqual(expected);
    expect(expected[0]).toBe('2026-10-14 15:00:00');
  });
});

describe('connection — ghi qua kết nối đọc bị từ chối; thiếu app_maint() bị chặn', () => {
  let tmp: ReturnType<typeof tempDir>;
  let path: string;
  let writer: AppConnection;
  const clock = new FakeClock('2026-10-14T08:00:00.000Z');
  beforeEach(() => {
    tmp = tempDir('ga-conn-');
    path = join(tmp.dir, 'gen.sqlite');
    writer = openWriter(path, { clock });
    migrate(writer, { dir: SQLITE_MIGRATIONS_DIR, appVersion: '0.0.0' });
    seedMinimal(writer);
    writer.write(SYS_ACTOR, (w) =>
      w.run(
        'INSERT INTO blobs (id, workspace_id, created_by, sha256, size_bytes, storage_path) VALUES (?, ?, ?, ?, ?, ?)',
        ['01JB10B0000000000000000001', SYS_WS, SYS_ACTOR, BLOB_SHA, 10, `/data/blobs/${SYS_WS}/ab/ab/${BLOB_SHA}`],
      ),
    );
  });
  afterEach(() => {
    writer.close();
    tmp.cleanup();
  });

  it('kết nối đọc: INSERT / UPDATE / DELETE / DDL đều bị từ chối', () => {
    const reader = openReader(path, { clock });
    try {
      expect(count(reader, 'SELECT count(*) FROM blobs')).toBe(1);
      for (const sql of [
        "INSERT INTO workspaces (id, kind, slug, name, short_code) VALUES ('01JWS00000000000000000ZZZ9', 'tenant', 'x', 'X', 'ZZ99')",
        "UPDATE workspaces SET name = 'y'",
        'DELETE FROM blobs',
        'CREATE TABLE x (a)',
      ]) {
        // DB v2.3.5: workspaces có cổng người ghi (app_actor()) — kết nối đọc không có hàm này ⇒ câu lệnh không biên dịch được (cũng fail-closed)
        expect(() => reader.db.exec(sql), sql).toThrow(/readonly|query_only|read-only|no such function: app_actor/i);
      }
      expect(count(writer, 'SELECT count(*) FROM blobs')).toBe(1);
    } finally {
      reader.close();
    }
  });

  it('kết nối KHÔNG đăng ký hàm (vd sqlite3 CLI): UPDATE / DELETE bảng được bảo vệ lỗi no such function (fail-closed)', () => {
    const raw = new Database(path);
    try {
      raw.pragma('foreign_keys = ON');
      expect(() => raw.exec('UPDATE blobs SET size_bytes = 11')).toThrow(/no such function: app_maint/);
      expect(() => raw.exec('DELETE FROM blobs')).toThrow(/no such function: app_maint/);
    } finally {
      raw.close();
    }
    expect(count(writer, 'SELECT size_bytes FROM blobs')).toBe(10);
  });

  it('kết nối app ngoài bảo trì: guard append-only chặn; trong maintenance: được (đối chứng)', () => {
    expect(() => writer.db.exec('UPDATE blobs SET size_bytes = 11')).toThrow(/append-only/);
    expect(() => writer.db.exec('DELETE FROM blobs')).toThrow(/append-only/);
    writer.maintenance('test: dọn blob', (m) => {
      m.run('DELETE FROM blobs');
    });
    expect(count(writer, 'SELECT count(*) FROM blobs')).toBe(0);
    expect(writer.inMaintenance()).toBe(false);
  });

  it('maintenance: bắt buộc lý do, không lồng, tắt cờ cả khi lỗi, gọi onMaintenance', () => {
    const seen: string[] = [];
    const w2 = openWriter(path, { clock, onMaintenance: (e) => seen.push(e.reason) });
    try {
      expect(() => w2.maintenance('  ', () => 1)).toThrow(ConnectionContractError);
      expect(() => w2.maintenance('a', () => w2.maintenance('b', () => 1))).toThrow(/lồng/);
      expect(() => w2.maintenance('c', () => w2.write(SYS_ACTOR, () => 1))).toThrow(/lồng/);
      expect(() =>
        w2.maintenance('lỗi giữa chừng', () => {
          throw new Error('boom');
        }),
      ).toThrow('boom');
      expect(w2.inMaintenance()).toBe(false);
      expect(w2.currentActor()).toBeNull();
      expect(seen).toEqual(['a', 'c', 'lỗi giữa chừng']);
    } finally {
      w2.close();
    }
  });

  it('maintenance: app_maint()=1 + app_actor() = actor system của workspace hệ thống; xong thì xoá cả hai', () => {
    const probe = () =>
      writer.db.prepare('SELECT app_maint() AS m, app_actor() AS a').get() as { m: number; a: string | null };
    expect(probe()).toEqual({ m: 0, a: null });
    const inside = writer.maintenance('kiểm actor', (m) => ({ ...probe(), ctx: m.actorId }));
    expect(inside).toEqual({ m: 1, a: SYS_ACTOR, ctx: SYS_ACTOR });
    expect(probe()).toEqual({ m: 0, a: null });
    // actor chỉ định phải là actor kind system
    expect(writer.maintenance('chỉ định', () => probe().a, { actorId: SYS_ACTOR })).toBe(SYS_ACTOR);
    expect(() => writer.maintenance('lạ', () => 1, { actorId: '01JZZZZZZZZZZZZZZZZZZZZZZZ' })).toThrow(/kind system/);
    expect(() => writer.maintenance('sai dạng', () => 1, { actorId: 'x' })).toThrow(/ULID/);
  });

  it("maintenance: transaction riêng (rollback khi lỗi); 'caller' đòi transaction đang mở; không nhận hàm async", () => {
    expect(() =>
      writer.maintenance('rollback', (m) => {
        m.run('DELETE FROM blobs');
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(count(writer, 'SELECT count(*) FROM blobs')).toBe(1);
    expect(() => writer.maintenance('x', () => 1, { transaction: 'caller' })).toThrow(/transaction đang mở/);
    const inTx = writer.db.transaction(() => writer.maintenance('trong tx', () => 7, { transaction: 'caller' }));
    expect(inTx()).toBe(7);
    expect(() => writer.maintenance('async', async () => 1)).toThrow(/đồng bộ/);
    expect(writer.inMaintenance()).toBe(false);
    expect(writer.currentActor()).toBeNull();
  });

  it('kết nối đọc: write / bootstrap / maintenance đều bị từ chối', () => {
    const reader = openReader(path, { clock });
    try {
      expect(() => reader.write(SYS_ACTOR, () => 1)).toThrow(/đọc/);
      expect(() => reader.maintenance('x', () => 1)).toThrow(/đọc/);
      expect(() => reader.bootstrap({ workspaceId: SYS_WS, systemActorId: SYS_ACTOR }, () => 1)).toThrow(/đọc/);
    } finally {
      reader.close();
    }
  });
});

describe('bootstrap({workspaceId, systemActorId}, fn) — khởi tạo workspace bằng actor system của chính nó (CNS-170)', () => {
  let tmp: ReturnType<typeof tempDir>;
  let conn: AppConnection;
  const clock = new FakeClock('2026-10-14T08:00:00.000Z');
  const actorNow = () => (conn.db.prepare('SELECT app_actor() AS a').get() as { a: string | null }).a;
  const createSystemWorkspace = (w: { run(sql: string, p?: unknown[]): unknown }, actor = SYS_ACTOR) => {
    w.run(
      "INSERT INTO workspaces (id, kind, slug, name, short_code) VALUES (?, 'system', 'system', 'System', 'SYS0')",
      [SYS_WS],
    );
    w.run(
      "INSERT INTO actors (id, workspace_id, kind, system_key, label) VALUES (?, ?, 'system', 'system', 'System')",
      [actor, SYS_WS],
    );
  };
  beforeEach(() => {
    tmp = tempDir('ga-boot-');
    conn = openWriter(join(tmp.dir, 'gen.sqlite'), { clock });
    migrate(conn, { dir: SQLITE_MIGRATIONS_DIR, appVersion: '0.0.0' });
  });
  afterEach(() => {
    conn.close();
    tmp.cleanup();
  });

  it('DB rỗng: tạo workspace + actor system trong một giao dịch, app_actor() = systemActorId, xong thì NULL', () => {
    const seen = conn.bootstrap({ workspaceId: SYS_WS, systemActorId: SYS_ACTOR }, (w) => {
      createSystemWorkspace(w);
      return { actor: actorNow(), ctx: w.actorId };
    });
    expect(seen).toEqual({ actor: SYS_ACTOR, ctx: SYS_ACTOR });
    expect(actorNow()).toBeNull();
    expect(count(conn, "SELECT count(*) FROM actors WHERE kind = 'system'")).toBe(1);
    // sau khởi tạo, maintenance mặc định lấy đúng actor này
    expect(conn.maintenance('sau bootstrap', (m) => m.actorId)).toBe(SYS_ACTOR);
  });

  it('không tạo hàng actors đúng systemActorId ⇒ throw + rollback toàn bộ', () => {
    expect(() =>
      conn.bootstrap({ workspaceId: SYS_WS, systemActorId: SYS_ACTOR }, (w) => {
        w.run(
          "INSERT INTO workspaces (id, kind, slug, name, short_code) VALUES (?, 'system', 'system', 'System', 'SYS0')",
          [SYS_WS],
        );
      }),
    ).toThrow(/actors/);
    expect(count(conn, 'SELECT count(*) FROM workspaces')).toBe(0);
    expect(actorNow()).toBeNull();
    // tạo actor system với id KHÁC id đã khai ⇒ cũng throw + rollback
    expect(() =>
      conn.bootstrap({ workspaceId: SYS_WS, systemActorId: SYS_ACTOR }, (w) =>
        createSystemWorkspace(w, '01JQTHERACT000000000000000'),
      ),
    ).toThrow(/actors/);
    expect(count(conn, 'SELECT count(*) FROM actors')).toBe(0);
  });

  it('workspace đã có actor system khác ⇒ từ chối trước khi chạy fn; id sai dạng / lồng nhau ⇒ từ chối', () => {
    conn.bootstrap({ workspaceId: SYS_WS, systemActorId: SYS_ACTOR }, (w) => createSystemWorkspace(w));
    let ran = false;
    expect(() =>
      conn.bootstrap({ workspaceId: SYS_WS, systemActorId: '01JQTHERACT000000000000000' }, () => {
        ran = true;
      }),
    ).toThrow(/đã có actor system/);
    expect(ran).toBe(false);
    // chạy lại với đúng id: được (idempotent ở mức hợp đồng)
    expect(conn.bootstrap({ workspaceId: SYS_WS, systemActorId: SYS_ACTOR }, () => 'ok')).toBe('ok');
    expect(() => conn.bootstrap({ workspaceId: 'x', systemActorId: SYS_ACTOR }, () => 1)).toThrow(/ULID/);
    expect(() => conn.bootstrap({ workspaceId: SYS_WS, systemActorId: 'x' }, () => 1)).toThrow(/ULID/);
    expect(() =>
      conn.write(SYS_ACTOR, () => conn.bootstrap({ workspaceId: SYS_WS, systemActorId: SYS_ACTOR }, () => 1)),
    ).toThrow(/lồng/);
    expect(actorNow()).toBeNull();
  });

  it('maintenance trên DB chưa có actor nào (migrate DB rỗng): app_actor() NULL — hợp lệ vì bảo trì được miễn', () => {
    expect(conn.maintenance('migrate DB rỗng', (m) => [m.actorId, actorNow()])).toEqual([null, null]);
  });
});
