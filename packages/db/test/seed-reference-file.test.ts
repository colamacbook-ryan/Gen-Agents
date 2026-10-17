// Seed tham chiếu THẬT (db/spec/seed_reference.json — bộ sinh của lane DB, DB v2.3.4; CNS-170): qua schema + sha256 của contracts, áp bằng
// applyGlobalSeed / applyWorkspaceSeed lên migration thật (mọi guard của DB), id tất định seedRowId = seed_row_id của gen_seed.py (vector
// tính bằng Python), chạy lại không nhân đôi. Hàng workspaces của tenant do app ghi ở Onboarding (seed không chứa — slug / tên / short_code là dữ liệu nhập).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTOR_SYSTEM_KEYS, SYSTEM_WORKSPACE_ID } from '@ga/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type AppConnection,
  applyGlobalSeed,
  applyWorkspaceSeed,
  migrate,
  openWriter,
  SQLITE_MIGRATIONS_DIR,
  SYNC,
  seedIdFor,
  seedRowId,
  verifySeedReference,
} from '../src/index.ts';
import { count, FakeClock, TENANT_WS, tempDir } from './helpers.ts';

const SEED_FILE = fileURLToPath(new URL('../../../db/spec/seed_reference.json', import.meta.url));
const raw = () => JSON.parse(readFileSync(SEED_FILE, 'utf8')) as unknown;
const rowsOf = (tables: ReadonlyArray<{ rows: readonly unknown[] }>) => tables.reduce((n, t) => n + t.rows.length, 0);

describe('seed_reference.json (lane DB)', () => {
  it('qua schema + sha256 của contracts; cùng phiên bản DB với migration', () => {
    const seed = verifySeedReference(raw());
    expect(seed.databaseVersion).toBe(SYNC.databaseVersion);
    expect(seed.source.generator).toBe('db/spec/gen_seed.py');
  });

  it('seedRowId = seed_row_id của gen_seed.py (vector Python) — global ghi sẵn cùng hàm', () => {
    expect(seedRowId(TENANT_WS, 'settings:st-0017')).toBe('000000000062HQZAPH8FST1894');
    expect(seedRowId(SYSTEM_WORKSPACE_ID, 'actors:system')).toBe('0000000000JY3Q219GT5VRY2MR');
    const seed = verifySeedReference(raw());
    const sysActor = seed.global.find((t) => t.table === 'actors')?.rows.find((r) => r.system_key === 'system');
    expect(sysActor?.id).toBe(seedRowId(SYSTEM_WORKSPACE_ID, 'actors:system'));
    expect(seedRowId('01JWS00000000000000000ZTH1', 'settings:st-0017')).not.toBe(
      seedRowId(TENANT_WS, 'settings:st-0017'),
    );
  });
});

describe('áp seed_reference.json thật lên migration thật', () => {
  let tmp: ReturnType<typeof tempDir>;
  let conn: AppConnection;
  beforeEach(() => {
    tmp = tempDir('ga-seedref-');
    conn = openWriter(join(tmp.dir, 'gen.sqlite'), { clock: new FakeClock('2026-10-16T08:00:00.000Z') });
    migrate(conn, { dir: SQLITE_MIGRATIONS_DIR, appVersion: '0.0.0' });
  });
  afterEach(() => {
    conn.close();
    tmp.cleanup();
  });

  it('global + perWorkspace qua mọi guard; chạy lại không nhân đôi; created_by = actor system của tenant', () => {
    const seed = verifySeedReference(raw());
    const nG = rowsOf(seed.global);
    const nW = rowsOf(seed.perWorkspace);
    expect(applyGlobalSeed(conn, seed)).toEqual({ inserted: nG, skipped: 0 });
    expect(applyGlobalSeed(conn, seed)).toEqual({ inserted: 0, skipped: nG });
    // app (Onboarding) ghi hàng workspaces của tenant trước khi seed
    conn.db
      .prepare("INSERT INTO workspaces (id, kind, slug, name, short_code) VALUES (?, 'tenant', 'afi', 'Afi', '7K2Q')")
      .run(TENANT_WS);
    const actorIds = Object.fromEntries(
      ACTOR_SYSTEM_KEYS.map((k, i) => [k, `01JWSACT${'0'.repeat(17)}${i}`]),
    ) as Record<(typeof ACTOR_SYSTEM_KEYS)[number], string> & { system: string };
    const target = { workspaceId: TENANT_WS, actorIds, idFor: seedIdFor(TENANT_WS) };
    expect(applyWorkspaceSeed(conn, seed, target)).toEqual({ inserted: nW, skipped: 0 });
    expect(applyWorkspaceSeed(conn, seed, target)).toEqual({ inserted: 0, skipped: nW });
    expect(
      conn.db
        .prepare("SELECT id, created_by FROM settings WHERE workspace_id = ? AND display_id = 'ST-0017'")
        .get(TENANT_WS),
    ).toEqual({ id: seedRowId(TENANT_WS, 'settings:st-0017'), created_by: actorIds.system });
    expect(count(conn, 'SELECT count(*) FROM tools WHERE workspace_id = ? AND is_builtin = 1', TENANT_WS)).toBe(5);
    expect(count(conn, "SELECT last_seq FROM id_counters WHERE workspace_id = ? AND prefix = 'ST'", TENANT_WS)).toBe(
      18,
    );
  });
});
