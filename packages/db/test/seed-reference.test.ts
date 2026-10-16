// Seed tham chiếu máy đọc được (CNS-170): kiểm sha + schema, áp bằng conn.bootstrap (actor system của chính workspace),
// created_by điền bằng actor giao dịch, chạy lại không nhân đôi, lỗi ⇒ rollback toàn bộ.
import { join } from 'node:path';
import { type SeedReference, SYSTEM_WORKSPACE_ID } from '@ga/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type AppConnection,
  applyGlobalSeed,
  applyWorkspaceSeed,
  migrate,
  openWriter,
  SeedReferenceError,
  SQLITE_MIGRATIONS_DIR,
  seedReferenceSha256,
  verifySeedReference,
} from '../src/index.ts';
import { count, FakeClock, SYS_ACTOR, TENANT_ACTOR, TENANT_WS, tempDir } from './helpers.ts';

const SCHED = '0000000000000000000000SCH1';
const POS_ID = '01JPS00000000000000000PS01';

function makeSeed(over: Partial<Omit<SeedReference, 'sha256'>> = {}): SeedReference {
  const body: Omit<SeedReference, 'sha256'> = {
    format: 'ga.seed-reference.v1',
    databaseVersion: '2.3.2',
    source: { repo: 'example/gen-agents', rev: 'a'.repeat(40), generator: 'db/spec/gen_seed.py' },
    global: [
      {
        table: 'workspaces',
        conflictKey: ['id'],
        rows: [{ id: SYSTEM_WORKSPACE_ID, kind: 'system', slug: 'system', name: 'System', short_code: 'SYS0' }],
      },
      {
        table: 'actors',
        conflictKey: ['id'],
        rows: [
          { id: SYS_ACTOR, workspace_id: SYSTEM_WORKSPACE_ID, kind: 'system', system_key: 'system', label: 'System' },
          { id: SCHED, workspace_id: SYSTEM_WORKSPACE_ID, kind: 'system', system_key: 'scheduler', label: 'Scheduler' },
        ],
      },
      {
        table: 'engines',
        conflictKey: ['slug'],
        rows: [
          {
            slug: 'alpha',
            name: 'Alpha',
            vendor: 'v',
            cli_binary: 'alpha',
            adapter_status: 'ready',
            priority_order: 1,
            tos_risk: 'ok',
            tos_notice_key: 'k',
            tos_notice_version: '1',
          },
        ],
      },
    ],
    perWorkspace: [
      {
        table: 'workspaces',
        conflictKey: ['id'],
        rows: [{ id: { $ref: 'workspace' }, kind: 'tenant', slug: 'afi', name: 'Afi', short_code: '7K2Q' }],
      },
      {
        table: 'actors',
        conflictKey: ['id'],
        rows: [
          {
            id: { $ref: 'actor', key: 'system' },
            workspace_id: { $ref: 'workspace' },
            kind: 'system',
            system_key: 'system',
            label: 'System',
          },
        ],
      },
      {
        table: 'positions',
        conflictKey: ['workspace_id', 'display_seq'],
        rows: [
          {
            id: { $ref: 'id', key: 'positions:ps-0001' },
            workspace_id: { $ref: 'workspace' },
            display_id: 'PS-0001',
            display_seq: 1,
            title: 'Trợ lý',
          },
        ],
      },
    ],
    ...over,
  };
  return { ...body, sha256: seedReferenceSha256(body) };
}

const tenant = (idFor = (k: string) => (k === 'positions:ps-0001' ? POS_ID : 'X')) => ({
  workspaceId: TENANT_WS,
  actorIds: { system: TENANT_ACTOR },
  idFor,
});

describe('verifySeedReference: schema + sha256', () => {
  it('seed hợp lệ qua; sửa một giá trị mà không tính lại sha ⇒ từ chối', () => {
    const seed = makeSeed();
    expect(verifySeedReference(JSON.parse(JSON.stringify(seed))).sha256).toBe(seed.sha256);
    const tampered = structuredClone(seed);
    (tampered.global[2]?.rows[0] as Record<string, unknown>).tos_risk = 'high';
    expect(() => verifySeedReference(tampered)).toThrow(/sha256/);
    // thứ tự khoá không đổi sha (JSON chuẩn hoá)
    const reordered = Object.fromEntries(Object.entries(structuredClone(seed)).reverse());
    expect(verifySeedReference(reordered).sha256).toBe(seed.sha256);
  });

  it('created_by trong seed / $ref trong global / thiếu cột khoá / tên bảng lạ / format lạ ⇒ từ chối', () => {
    const bad = [
      makeSeed({
        global: [{ table: 'engines', conflictKey: ['slug'], rows: [{ slug: 'x', created_by: SYS_ACTOR }] }],
      }),
      makeSeed({ global: [{ table: 'positions', conflictKey: ['id'], rows: [{ id: { $ref: 'workspace' } }] }] }),
      makeSeed({ global: [{ table: 'engines', conflictKey: ['slug'], rows: [{ name: 'x' }] }] }),
      makeSeed({ global: [{ table: 'Engines; DROP', conflictKey: ['slug'], rows: [{ slug: 'x' }] }] }),
      { ...makeSeed(), format: 'ga.seed-reference.v0' },
    ];
    for (const s of bad) expect(() => verifySeedReference(s)).toThrow(SeedReferenceError);
  });
});

describe('applyGlobalSeed / applyWorkspaceSeed qua conn.bootstrap', () => {
  let tmp: ReturnType<typeof tempDir>;
  let conn: AppConnection;
  beforeEach(() => {
    tmp = tempDir('ga-seed-');
    conn = openWriter(join(tmp.dir, 'gen.sqlite'), { clock: new FakeClock('2026-10-14T08:00:00.000Z') });
    migrate(conn, { dir: SQLITE_MIGRATIONS_DIR, appVersion: '0.0.0' });
  });
  afterEach(() => {
    conn.close();
    tmp.cleanup();
  });

  it('global: DB rỗng → workspace hệ thống + actor + engines; chạy lại không nhân đôi', () => {
    const seed = verifySeedReference(makeSeed());
    expect(applyGlobalSeed(conn, seed)).toEqual({ inserted: 4, skipped: 0 });
    expect(applyGlobalSeed(conn, seed)).toEqual({ inserted: 0, skipped: 4 });
    expect(count(conn, 'SELECT count(*) FROM actors')).toBe(2);
    expect(conn.maintenance('sau seed', (m) => m.actorId)).toBe(SYS_ACTOR);
  });

  it('perWorkspace: $ref → workspace / actor cấp trước / id tất định; created_by = actor system của tenant', () => {
    const seed = verifySeedReference(makeSeed());
    applyGlobalSeed(conn, seed);
    expect(applyWorkspaceSeed(conn, seed, tenant())).toEqual({ inserted: 3, skipped: 0 });
    const pos = conn.db.prepare('SELECT id, workspace_id, created_by FROM positions').get();
    expect(pos).toEqual({ id: POS_ID, workspace_id: TENANT_WS, created_by: TENANT_ACTOR });
    expect(applyWorkspaceSeed(conn, seed, tenant())).toEqual({ inserted: 0, skipped: 3 });
    expect(() => applyWorkspaceSeed(conn, seed, { ...tenant(), workspaceId: SYSTEM_WORKSPACE_ID })).toThrow(/tenant/);
  });

  it('lỗi giữa chừng (actor thiếu id / bảng lạ / cột lạ) ⇒ throw + rollback toàn bộ', () => {
    const seed = verifySeedReference(makeSeed());
    applyGlobalSeed(conn, seed);
    const missingActor = verifySeedReference(
      makeSeed({
        perWorkspace: [
          ...seed.perWorkspace,
          {
            table: 'actors',
            conflictKey: ['id'],
            rows: [
              {
                id: { $ref: 'actor', key: 'judge' },
                workspace_id: { $ref: 'workspace' },
                kind: 'system',
                system_key: 'judge',
                label: 'J',
              },
            ],
          },
        ],
      }),
    );
    expect(() => applyWorkspaceSeed(conn, missingActor, tenant())).toThrow(/judge/);
    expect(count(conn, "SELECT count(*) FROM workspaces WHERE kind = 'tenant'")).toBe(0);
    const ghostTable = verifySeedReference(
      makeSeed({
        perWorkspace: [...seed.perWorkspace, { table: 'no_such', conflictKey: ['id'], rows: [{ id: 'x' }] }],
      }),
    );
    expect(() => applyWorkspaceSeed(conn, ghostTable, tenant())).toThrow(/no_such/);
    const ghostCol = verifySeedReference(
      makeSeed({
        global: [...seed.global, { table: 'engines', conflictKey: ['slug'], rows: [{ slug: 'beta', evil_col: 1 }] }],
      }),
    );
    expect(() => applyGlobalSeed(conn, ghostCol)).toThrow(/evil_col/);
    expect(count(conn, "SELECT count(*) FROM engines WHERE slug = 'beta'")).toBe(0);
    // conflictKey không phải PK / UNIQUE (vd chỉ `name`) ⇒ từ chối, không bỏ sót hàng âm thầm
    const looseKey = verifySeedReference(
      makeSeed({ global: [...seed.global, { table: 'engines', conflictKey: ['name'], rows: [{ name: 'Alpha' }] }] }),
    );
    expect(() => applyGlobalSeed(conn, looseKey)).toThrow(/PK \/ UNIQUE/);
    expect(count(conn, 'SELECT count(*) FROM positions')).toBe(0);
    expect(conn.currentActor()).toBeNull();
  });
});
