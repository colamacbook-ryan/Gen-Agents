import { describe, expect, it } from 'vitest';
import { createKysely, migrate, openScratch, SQLITE_MIGRATIONS_DIR } from '../src/index.ts';
import { FakeClock, SYS_WS, seedMinimal } from './helpers.ts';

describe('Kysely trên kết nối đã qua hợp đồng', () => {
  it('truy vấn có kiểu sinh từ DB (bảng + view)', async () => {
    const conn = openScratch({ clock: new FakeClock('2026-10-14T08:00:00.000Z') });
    try {
      migrate(conn, { dir: SQLITE_MIGRATIONS_DIR, appVersion: '0.0.0' });
      seedMinimal(conn);
      const k = createKysely(conn);
      const rows = await k
        .selectFrom('workspaces')
        .select(['id', 'kind', 'short_code'])
        .where('kind', '=', 'system')
        .execute();
      expect(rows).toEqual([{ id: SYS_WS, kind: 'system', short_code: 'SYS0' }]);
      const status = await k.selectFrom('v_core_agent_status').selectAll().execute();
      expect(Array.isArray(status)).toBe(true);
    } finally {
      conn.close();
    }
  });
});
