// Cột người ghi lấy từ actor của giao dịch, không từ tham số (CNS-176): stampInsert / stampUpdate / stampSoftDelete.
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type AppConnection,
  ConnectionContractError,
  createKysely,
  migrate,
  openWriter,
  SQLITE_MIGRATIONS_DIR,
  stampInsert,
  stampSoftDelete,
  stampUpdate,
} from '../src/index.ts';
import { FakeClock, seedMinimal, TENANT_ACTOR, TENANT_WS, tempDir } from './helpers.ts';

const POS = '01JPS00000000000000000PS07';

describe('stamp*: *_by = actor của giao dịch', () => {
  let tmp: ReturnType<typeof tempDir>;
  let conn: AppConnection;
  beforeEach(() => {
    tmp = tempDir('ga-stamp-');
    conn = openWriter(join(tmp.dir, 'gen.sqlite'), { clock: new FakeClock('2026-10-14T08:00:00.000Z') });
    migrate(conn, { dir: SQLITE_MIGRATIONS_DIR, appVersion: '0.0.0' });
    seedMinimal(conn);
  });
  afterEach(() => {
    conn.close();
    tmp.cleanup();
  });

  it('INSERT / UPDATE / xoá mềm qua Kysely: created_by / updated_by / deleted_by = actor giao dịch', () => {
    const k = createKysely(conn);
    conn.write(TENANT_ACTOR, (w) => {
      w.run(
        k.insertInto('positions').values(
          stampInsert(w, {
            id: POS,
            workspace_id: TENANT_WS,
            display_id: 'PS-0007',
            display_seq: 7,
            title: 'Vị trí',
          }),
        ),
      );
      w.run(
        k
          .updateTable('positions')
          .set(stampUpdate(w, { title: 'Vị trí mới' }))
          .where('id', '=', POS),
      );
    });
    expect(conn.db.prepare('SELECT created_by, updated_by, title FROM positions WHERE id = ?').get(POS)).toEqual({
      created_by: TENANT_ACTOR,
      updated_by: TENANT_ACTOR,
      title: 'Vị trí mới',
    });
    conn.write(TENANT_ACTOR, (w) =>
      w.run(
        k
          .updateTable('positions')
          .set(stampSoftDelete(w, { deleted_at: '2026-10-14T08:00:00.000Z' }))
          .where('id', '=', POS),
      ),
    );
    expect(conn.db.prepare('SELECT deleted_by FROM positions WHERE id = ?').get(POS)).toEqual({
      deleted_by: TENANT_ACTOR,
    });
  });

  it('người gọi truyền *_by ⇒ throw (không giả danh người ghi)', () => {
    const w = { actorId: TENANT_ACTOR };
    const spoof = (v: object) => v as Record<string, never>;
    expect(() => stampInsert(w, spoof({ id: 'x', created_by: 'KHAC' }))).toThrow(ConnectionContractError);
    expect(() => stampUpdate(w, spoof({ title: 'x', updated_by: 'KHAC' }))).toThrow(/updated_by/);
    expect(() => stampSoftDelete(w, spoof({ deleted_by: 'KHAC' }))).toThrow(/deleted_by/);
    expect(() => stampUpdate(w, spoof({ created_by: 'KHAC' }))).toThrow(/created_by/);
    expect(stampInsert(w, { id: 'x' })).toEqual({ id: 'x', created_by: TENANT_ACTOR });
  });
});
