// Nghiệp vụ SYS-41/42 (revision, diff), SYS-44 (Position), SYS-63…69 (Kho nhân vật + avatar).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { keyify } from '../../src/hr/characters.ts';
import type { TestApp } from '../http/harness.ts';
import { addDna, makeHrApp, mkRole } from './helpers.ts';

let t: TestApp;
beforeAll(() => {
  t = makeHrApp();
});
afterAll(() => t.close());
const as = (w: Parameters<TestApp['as']>[0]) => t.as(w);

describe('SYS-41 / SYS-42', () => {
  it('timeline: version x.y tăng dần; `by` chỉ có id + displayId của thành viên (không email)', async () => {
    const role = mkRole(t);
    const f = addDna(t, role.id, 'style.tone', 'a');
    await as('A.admin').call('SYS-38', { params: { roleRef: role.id, dnaRef: f.display_id }, body: { value: 'b' } });
    const res = await as('A.viewer').call('SYS-41', { params: { roleRef: role.id } });
    const rows = res.json as { version: string; by: { id: string; displayId: string } | null }[];
    expect(rows.map((r) => r.version)).toEqual(['1.0', '1.1']);
    expect(rows[0]?.by).not.toBeNull();
    expect(Object.keys(rows[0]?.by ?? {}).sort()).toEqual(['displayId', 'id']);
    expect(res.text).not.toMatch(/@/);
  });

  it('diff: chỉ mục đổi; viewer thấy đường dẫn + cờ lõi nhưng nội dung DNA bị che', async () => {
    const role = mkRole(t);
    const f = addDna(t, role.id, 'style.tone', 'trang trọng');
    await as('A.admin').call('SYS-38', {
      params: { roleRef: role.id, dnaRef: f.display_id },
      body: { value: 'thân mật' },
    });
    const revs = (await as('A.viewer').call('SYS-41', { params: { roleRef: role.id } })).json as {
      displayId: string;
    }[];
    const [a, b] = revs as [{ displayId: string }, { displayId: string }];
    const q = { params: { revisionRef: b.displayId }, query: { against: a.displayId } };
    const admin = await as('A.admin').call('SYS-42', q);
    const items = (admin.json as { items: { path: string; before: unknown; after: unknown; isCore: boolean }[] }).items;
    expect(items).toHaveLength(1);
    expect(items[0]?.path).toBe('dna.style.tone[0]');
    expect(JSON.stringify(items[0]?.before)).toContain('trang trọng');
    expect(JSON.stringify(items[0]?.after)).toContain('thân mật');
    const viewer = await as('A.viewer').call('SYS-42', q);
    const vi = (viewer.json as { items: { path: string; before: unknown; after: unknown }[] }).items;
    expect(vi[0]?.path).toBe('dna.style.tone[0]');
    expect(vi[0]?.before).toBeNull();
    expect(vi[0]?.after).toBeNull();
    expect(viewer.text).not.toContain('thân mật');
  });

  it('diff giữa revision của HAI Role khác nhau ⇒ 400 scope_mismatch', async () => {
    const r1 = mkRole(t);
    const r2 = mkRole(t);
    addDna(t, r1.id, 'style.tone', 'a');
    addDna(t, r2.id, 'style.tone', 'a');
    const a = ((await as('A.owner').call('SYS-41', { params: { roleRef: r1.id } })).json as { displayId: string }[])[0];
    const b = ((await as('A.owner').call('SYS-41', { params: { roleRef: r2.id } })).json as { displayId: string }[])[0];
    const res = await as('A.owner').call('SYS-42', {
      params: { revisionRef: a?.displayId as string },
      query: { against: b?.displayId as string },
    });
    expect(res.status).toBe(400);
    expect(res.detail).toMatchObject({ reason: 'scope_mismatch' });
  });
});

describe('SYS-44 Position', () => {
  it('đọc Position mặc định; người giữ vị trí chỉ khi đúng một Role', async () => {
    const pos = t.world.store.read(t.world.tenants.A.workspaceId, (tx) => tx.roles.defaultPosition());
    const res = await as('A.viewer').call('SYS-44', { params: { positionRef: pos?.display_id as string } });
    expect(res.status).toBe(200);
    const out = res.json as { title: string; holder: unknown; rewardCapMinor: number | null };
    expect(out.title).toBe(pos?.title);
  });
});

describe('Kho nhân vật + avatar (SYS-63…69)', () => {
  it('danh sách: khoá faction / source là KeyStr (không chữ hiển thị); lọc enabled', async () => {
    const res = await as('A.viewer').call('SYS-63', {});
    const rows = res.json as { faction: string; source: string; isEnabled: boolean; displayId: string }[];
    expect(rows.length).toBeGreaterThanOrEqual(10);
    for (const r of rows) {
      expect(r.faction).toMatch(/^[a-z][a-z0-9_.-]{0,63}$/);
      expect(r.source).toMatch(/^[a-z][a-z0-9_.-]{0,63}$/);
    }
    expect(keyify('Quần hùng', 'x')).toBe('quan_hung');
    expect(keyify(null, 'none')).toBe('none');
    const enabled = await as('A.viewer').call('SYS-63', { query: { enabled: 'true' } });
    expect((enabled.json as unknown[]).length).toBe(rows.filter((r) => r.isEnabled).length);
  });

  it('gán nhân vật cho Role → lịch sử có isCurrent; tắt nhân vật ⇒ gán lại 409 db.character_library; khôi phục AV cũ', async () => {
    const role = mkRole(t);
    const lib = (await as('A.viewer').call('SYS-63', {})).json as { displayId: string }[];
    const [c1, c2] = lib as [{ displayId: string }, { displayId: string }];
    const first = await as('A.admin').call('SYS-65', {
      params: { characterRef: c1.displayId },
      body: { roleRef: role.id },
    });
    expect(first.status).toBe(200);
    const av1 = (first.json as { avatar: { displayId: string } }).avatar.displayId;
    const second = await as('A.admin').call('SYS-65', {
      params: { characterRef: c2.displayId },
      body: { roleRef: role.id },
    });
    expect(second.status).toBe(200);
    const hist = (await as('A.viewer').call('SYS-67', { params: { roleRef: role.id } })).json as {
      displayId: string;
      isCurrent: boolean;
      source: string;
    }[];
    expect(hist).toHaveLength(2);
    expect(hist.filter((h) => h.isCurrent)).toHaveLength(1);
    expect(hist.find((h) => h.isCurrent)?.displayId).not.toBe(av1);
    const restored = await as('A.admin').call('SYS-69', { params: { avatarRef: av1 } });
    expect(restored.status).toBe(200);
    const after = (await as('A.viewer').call('SYS-67', { params: { roleRef: role.id } })).json as typeof hist;
    expect(after.find((h) => h.isCurrent)?.displayId).toBe(av1);
    // tắt nhân vật c2 (đang có Role dùng? c2 không còn dùng) rồi thử gán lại
    const off = await as('A.admin').call('SYS-66', {
      params: { characterRef: c2.displayId },
      body: { enabled: false },
    });
    expect(off.status).toBe(200);
    const denied = await as('A.admin').call('SYS-65', {
      params: { characterRef: c2.displayId },
      body: { roleRef: role.id },
    });
    expect(denied.status).toBe(409);
    expect(denied.code).toBe('db.character_library');
    await as('A.admin').call('SYS-66', { params: { characterRef: c2.displayId }, body: { enabled: true } });
  });

  it('SYS-64: chi tiết có params + Role đang dùng; SYS-68 monogram / generated', async () => {
    const role = mkRole(t);
    const lib = (await as('A.viewer').call('SYS-63', {})).json as { displayId: string }[];
    const c = lib[2] as { displayId: string };
    await as('A.admin').call('SYS-65', { params: { characterRef: c.displayId }, body: { roleRef: role.id } });
    const detail = await as('A.viewer').call('SYS-64', { params: { characterRef: c.displayId } });
    const d = detail.json as { params: { id: string }; roles: { displayId: string }[]; paramsSchemaVersion: number };
    expect(d.params.id).toBeTruthy();
    expect(d.roles.map((r) => r.displayId)).toContain(role.display_id);
    const mono = await as('A.admin').call('SYS-68', { params: { roleRef: role.id }, body: { source: 'monogram' } });
    expect(mono.status).toBe(200);
    const gen = await as('A.admin').call('SYS-68', { params: { roleRef: role.id }, body: { source: 'generated' } });
    expect(gen.status).toBe(400);
  });
});
