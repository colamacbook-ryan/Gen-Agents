// Cửa ghi duy nhất `conn.write(actorId, fn)` + app_actor() (hợp đồng kết nối ⑥-05; DB v2.3.3 báo trước: guard chung buộc
// *_by = app_actor(), app_actor() NULL ⇒ từ chối ghi). Actor phải được XOÁ sau giao dịch, kể cả khi lỗi.
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type AppConnection,
  ConnectionContractError,
  createKysely,
  migrate,
  openReader,
  openWriter,
  SQLITE_MIGRATIONS_DIR,
  SYNC,
  systemActorId,
} from '../src/index.ts';
import { count, FakeClock, SYS_ACTOR, SYS_WS, seedMinimal, TENANT_ACTOR, TENANT_WS, tempDir } from './helpers.ts';

const actorNow = (c: AppConnection) => (c.db.prepare('SELECT app_actor() AS a').get() as { a: string | null }).a;
const POS = (id: string, seq: number, by: string) => ({
  sql: 'INSERT INTO positions (id, workspace_id, display_id, display_seq, created_by, title) VALUES (?, ?, ?, ?, ?, ?)',
  parameters: [id, TENANT_WS, `PS-${String(seq).padStart(4, '0')}`, seq, by, `Vị trí ${seq}`],
});

describe('write(actor, fn)', () => {
  let tmp: ReturnType<typeof tempDir>;
  let conn: AppConnection;
  beforeEach(() => {
    tmp = tempDir('ga-write-');
    conn = openWriter(join(tmp.dir, 'gen.sqlite'), { clock: new FakeClock('2026-10-14T08:00:00.000Z') });
    migrate(conn, { dir: SQLITE_MIGRATIONS_DIR, appVersion: '0.0.0' });
    seedMinimal(conn);
  });
  afterEach(() => {
    conn.close();
    tmp.cleanup();
  });

  it('app_actor() = actor trong giao dịch, NULL ngoài giao dịch', () => {
    expect(actorNow(conn)).toBeNull();
    const seen = conn.write(TENANT_ACTOR, (w) => {
      w.run(POS('01JP0S00000000000000000001', 1, TENANT_ACTOR));
      return w.get<{ a: string }>('SELECT app_actor() AS a')?.a;
    });
    expect(seen).toBe(TENANT_ACTOR);
    expect(actorNow(conn)).toBeNull();
    expect(conn.currentActor()).toBeNull();
    expect(count(conn, 'SELECT count(*) FROM positions')).toBe(1);
  });

  it('lỗi giữa giao dịch ⇒ rollback + actor bị xoá', () => {
    expect(() =>
      conn.write(TENANT_ACTOR, (w) => {
        w.run(POS('01JP0S00000000000000000001', 1, TENANT_ACTOR));
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(count(conn, 'SELECT count(*) FROM positions')).toBe(0);
    expect(actorNow(conn)).toBeNull();
    // lỗi do DB (vi phạm UNIQUE) cũng vậy
    conn.write(TENANT_ACTOR, (w) => w.run(POS('01JP0S00000000000000000001', 1, TENANT_ACTOR)));
    expect(() => conn.write(TENANT_ACTOR, (w) => w.run(POS('01JP0S00000000000000000002', 1, TENANT_ACTOR)))).toThrow();
    expect(actorNow(conn)).toBeNull();
    expect(count(conn, 'SELECT count(*) FROM positions')).toBe(1);
  });

  it('không lồng nhau; không nhận hàm async; actorId phải là ULID; actor vẫn bị xoá', () => {
    expect(() => conn.write(TENANT_ACTOR, () => conn.write(SYS_ACTOR, () => 1))).toThrow(/lồng/);
    expect(actorNow(conn)).toBeNull();
    expect(() =>
      conn.write(TENANT_ACTOR, async (w) => {
        w.run(POS('01JP0S00000000000000000003', 3, TENANT_ACTOR));
      }),
    ).toThrow(/đồng bộ/);
    expect(count(conn, 'SELECT count(*) FROM positions')).toBe(0);
    expect(actorNow(conn)).toBeNull();
    for (const bad of ['', 'x', 'khong-phai-ulid', 'a'.repeat(26)]) {
      expect(() => conn.write(bad, () => 1), bad).toThrow(ConnectionContractError);
    }
  });

  it('query Kysely đã biên dịch chạy được trong giao dịch ghi (không execute() async)', () => {
    const k = createKysely(conn);
    conn.write(TENANT_ACTOR, (w) => {
      w.run(
        k.insertInto('positions').values({
          id: '01JP0S00000000000000000009',
          workspace_id: TENANT_WS,
          display_id: 'PS-0009',
          display_seq: 9,
          created_by: TENANT_ACTOR,
          title: 'Từ Kysely',
        }),
      );
    });
    expect(count(conn, "SELECT count(*) FROM positions WHERE title = 'Từ Kysely'")).toBe(1);
  });

  it('kết nối đọc: không có app_actor(), không có write()', () => {
    const reader = openReader(join(tmp.dir, 'gen.sqlite'), { clock: new FakeClock('2026-10-14T08:00:00.000Z') });
    try {
      expect(() => reader.db.prepare('SELECT app_actor()').get()).toThrow(/no such function: app_actor/);
      expect(() => reader.write(TENANT_ACTOR, () => 1)).toThrow(ConnectionContractError);
    } finally {
      reader.close();
    }
  });

  it('job hệ thống dùng actor system của workspace', () => {
    expect(systemActorId(conn, SYS_WS)).toBe(SYS_ACTOR);
    expect(systemActorId(conn, TENANT_WS, 'system')).toBe(TENANT_ACTOR);
    expect(() => systemActorId(conn, TENANT_WS, 'scheduler')).toThrow(ConnectionContractError);
  });

  // DB ≥ v2.3.3 (nay v2.3.4, nguồn = repo): guard chung chặn ghi không qua write() và *_by lệch actor — luôn chạy (không còn runIf).
  it('DB ≥ v2.3.3: ghi không qua write() hoặc *_by lệch actor ⇒ bị chặn', () => {
    expect(SYNC.appFunctions).toContain('app_actor');
    expect(() =>
      conn.db
        .prepare(POS('01JP0S00000000000000000005', 5, TENANT_ACTOR).sql)
        .run(...POS('01JP0S00000000000000000005', 5, TENANT_ACTOR).parameters),
    ).toThrow();
    expect(() => conn.write(SYS_ACTOR, (w) => w.run(POS('01JP0S00000000000000000006', 6, TENANT_ACTOR)))).toThrow();
    conn.write(TENANT_ACTOR, (w) => w.run(POS('01JP0S00000000000000000007', 7, TENANT_ACTOR)));
    expect(count(conn, 'SELECT count(*) FROM positions')).toBe(1);
  });
});
