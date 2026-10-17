// Lối dựng workspace tenant (Gen giao L-DB 2026-10-17): hàng workspaces + seed perWorkspace + owner đầu tiên trong MỘT
// giao dịch bootstrap bằng actor system cấp trước của tenant, trên migration + seed tham chiếu THẬT. Ca âm: chạy lại không
// nhân đôi; actor không phải actor system của chính tenant ⇒ từ chối, không ghi gì; lỗi giữa chừng ⇒ rollback toàn bộ.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTOR_SYSTEM_KEYS, type SeedReference } from '@ga/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type AppConnection,
  applyGlobalSeed,
  applyWorkspaceSeedIn,
  ConnectionContractError,
  createInstallUser,
  createTenantWorkspace,
  migrate,
  openWriter,
  SeedReferenceError,
  SQLITE_MIGRATIONS_DIR,
  seedIdFor,
  type TenantWorkspaceInput,
  verifySeedReference,
} from '../src/index.ts';
import { count, FakeClock, tempDir } from './helpers.ts';

const SEED_FILE = fileURLToPath(new URL('../../../db/spec/seed_reference.json', import.meta.url));
/** ULID test dựng lúc chạy: tiền tố Crockford + đệm 0 tới 26 ký tự. */
const id = (head: string, tail: string) => head + tail.padStart(26 - head.length, '0');
const WS_A = id('01JTNA', 'W1');
const WS_B = id('01JTNB', 'W1');
const USER = id('01JTN', 'XS1');
const OWNER_A = id('01JTNA', 'WN1');

const actorIdsFor = (tag: 'A' | 'B') =>
  Object.fromEntries(
    ACTOR_SYSTEM_KEYS.map((k, i) => [k, `01JTN${tag}${'0'.repeat(18)}S${i.toString(32).toUpperCase()}`]),
  ) as TenantWorkspaceInput['actorIds'];

const inputA = (over: Partial<TenantWorkspaceInput> = {}): TenantWorkspaceInput => ({
  workspaceId: WS_A,
  slug: 'afi',
  name: 'Afi',
  shortCode: '7K2Q',
  actorIds: actorIdsFor('A'),
  owner: { userId: USER, actorId: OWNER_A },
  ...over,
});

describe('createTenantWorkspace: workspaces → seed → owner đầu tiên (một giao dịch)', () => {
  let tmp: ReturnType<typeof tempDir>;
  let conn: AppConnection;
  let seed: SeedReference;
  let nW: number;
  beforeEach(() => {
    tmp = tempDir('ga-tenant-');
    conn = openWriter(join(tmp.dir, 'gen.sqlite'), { clock: new FakeClock('2026-10-17T08:00:00.000Z') });
    migrate(conn, { dir: SQLITE_MIGRATIONS_DIR, appVersion: '0.0.0' });
    seed = verifySeedReference(JSON.parse(readFileSync(SEED_FILE, 'utf8')));
    nW = seed.perWorkspace.reduce((n, t) => n + t.rows.length, 0);
    applyGlobalSeed(conn, seed);
    createInstallUser(conn, { userId: USER, username: 'owner', displayName: 'Chủ', passwordHash: 'argon2id$test' });
  });
  afterEach(() => {
    conn.close();
    tmp.cleanup();
  });

  it('user US-0001 ở bộ đếm workspace hệ thống', () => {
    expect(conn.db.prepare('SELECT display_id FROM users WHERE id = ?').get(USER)).toEqual({ display_id: 'US-0001' });
  });

  it('tạo tenant mới: hàng workspaces + đủ seed + owner (thành viên + actor user) + owner_user_id', () => {
    const r = createTenantWorkspace(conn, seed, inputA());
    expect(r.created).toBe(true);
    expect(r.seed).toEqual({ inserted: nW, skipped: 0 });
    expect(r.ownerActorId).toBe(OWNER_A);
    expect(r.workspace).toMatchObject({ id: WS_A, kind: 'tenant', slug: 'afi', owner_user_id: USER });
    expect(count(conn, "SELECT count(*) FROM actors WHERE workspace_id = ? AND kind = 'system'", WS_A)).toBe(
      ACTOR_SYSTEM_KEYS.length,
    );
    expect(
      conn.db
        .prepare('SELECT access_level, removed_at FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
        .get(WS_A, USER),
    ).toEqual({ access_level: 'owner', removed_at: null });
    expect(conn.db.prepare('SELECT kind, user_id, label FROM actors WHERE id = ?').get(OWNER_A)).toEqual({
      kind: 'user',
      user_id: USER,
      label: 'Chủ',
    });
    // created_by của seed = actor system của tenant (app_actor() của bootstrap)
    expect(
      conn.db.prepare("SELECT created_by FROM settings WHERE workspace_id = ? AND display_id = 'ST-0017'").get(WS_A),
    ).toEqual({ created_by: actorIdsFor('A').system });
  });

  it('áp hai lần không nhân đôi (actor owner cũ được giữ dù truyền id mới)', () => {
    createTenantWorkspace(conn, seed, inputA());
    const before = count(conn, 'SELECT count(*) FROM actors') + count(conn, 'SELECT count(*) FROM settings');
    const again = createTenantWorkspace(conn, seed, inputA({ owner: { userId: USER, actorId: id('01JTNA', 'WN2') } }));
    expect(again.created).toBe(false);
    expect(again.seed).toEqual({ inserted: 0, skipped: nW });
    expect(again.ownerActorId).toBe(OWNER_A);
    expect(count(conn, 'SELECT count(*) FROM actors') + count(conn, 'SELECT count(*) FROM settings')).toBe(before);
    expect(count(conn, 'SELECT count(*) FROM workspace_members WHERE workspace_id = ?', WS_A)).toBe(1);
  });

  it('ca âm: actor không phải actor system (actor user của tenant khác) ⇒ từ chối, không ghi gì', () => {
    createTenantWorkspace(conn, seed, inputA());
    const ws0 = count(conn, 'SELECT count(*) FROM workspaces');
    const bad = { ...actorIdsFor('B'), system: OWNER_A };
    expect(() =>
      createTenantWorkspace(conn, seed, {
        ...inputA({ workspaceId: WS_B, slug: 'b', shortCode: 'BBBB', actorIds: bad }),
        owner: { userId: USER, actorId: id('01JTNB', 'WN1') },
      }),
    ).toThrow(SeedReferenceError);
    expect(count(conn, 'SELECT count(*) FROM workspaces')).toBe(ws0);
    expect(count(conn, 'SELECT count(*) FROM actors WHERE workspace_id = ?', WS_B)).toBe(0);
  });

  it('ca âm: actor system của tenant A dùng để dựng tenant B ⇒ từ chối', () => {
    createTenantWorkspace(conn, seed, inputA());
    expect(() =>
      createTenantWorkspace(conn, seed, {
        ...inputA({ workspaceId: WS_B, slug: 'b', shortCode: 'BBBB', actorIds: actorIdsFor('A') }),
        owner: { userId: USER, actorId: id('01JTNB', 'WN1') },
      }),
    ).toThrow(SeedReferenceError);
    expect(count(conn, 'SELECT count(*) FROM workspaces WHERE id = ?', WS_B)).toBe(0);
  });

  it('ca âm: chạy lại tenant A bằng id actor system KHÁC ⇒ bootstrap từ chối (không đổi actor system)', () => {
    createTenantWorkspace(conn, seed, inputA());
    expect(() => createTenantWorkspace(conn, seed, inputA({ actorIds: actorIdsFor('B') }))).toThrow(
      ConnectionContractError,
    );
  });

  it('ca âm: cùng id workspace nhưng slug khác ⇒ không ghi đè', () => {
    createTenantWorkspace(conn, seed, inputA());
    expect(() => createTenantWorkspace(conn, seed, inputA({ slug: 'khac' }))).toThrow(/kind \/ slug khác/);
  });

  it('owner chưa có trong users ⇒ lỗi và rollback toàn bộ (không còn hàng workspaces / seed)', () => {
    expect(() =>
      createTenantWorkspace(conn, seed, inputA({ owner: { userId: id('01JTN', 'XS9'), actorId: OWNER_A } })),
    ).toThrow(/chưa có trong users/);
    expect(count(conn, 'SELECT count(*) FROM workspaces WHERE id = ?', WS_A)).toBe(0);
    expect(count(conn, 'SELECT count(*) FROM settings WHERE workspace_id = ?', WS_A)).toBe(0);
  });

  it('applyWorkspaceSeedIn chỉ chạy trong giao dịch của chính actor system tenant', () => {
    createTenantWorkspace(conn, seed, inputA());
    expect(() =>
      conn.write(OWNER_A, (w) =>
        applyWorkspaceSeedIn(w, seed, { workspaceId: WS_A, actorIds: actorIdsFor('A'), idFor: seedIdFor(WS_A) }),
      ),
    ).toThrow(SeedReferenceError);
  });
});
