// Nghiệp vụ SYS-30…36 (Role: danh sách, tạo, hồ sơ, sửa, nhân bản, lưu trữ, xoá).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from '../http/harness.ts';
import { makeHrApp, mkRole, ownerWrite, uniq } from './helpers.ts';

let t: TestApp;
beforeAll(() => {
  t = makeHrApp();
});
afterAll(() => t.close());

const call = (who: Parameters<TestApp['as']>[0], id: Parameters<ReturnType<TestApp['as']>['call']>[0], input = {}) =>
  t.as(who).call(id, input);

describe('SYS-31 tạo Role (khai sinh)', () => {
  it('tạo Role nháp + luồng phỏng vấn + avatar monogram; giới tính vào DNA; admin được', async () => {
    const name = uniq('Mai');
    const res = await call('A.admin', 'SYS-31', {
      body: { name, gender: 'female', description: 'Trợ lý báo cáo', avatar: { source: 'monogram' } },
    });
    expect(res.status).toBe(200);
    const out = res.json as {
      role: { id: string; lifecycle: string };
      interviewThread: { id: string };
      avatar: { id: string };
    };
    expect(out.role.lifecycle).toBe('draft');
    expect(out.interviewThread.id).toHaveLength(26);
    expect(out.avatar.id).toHaveLength(26);
    const dna = await call('A.viewer', 'SYS-37', { params: { roleRef: out.role.id } });
    const rows = (dna.json as { rows: { key: string; value: unknown; redacted: boolean }[] }).rows;
    const gender = rows.find((r) => r.key === 'identity.gender');
    expect(gender).toBeDefined();
    expect(gender?.redacted).toBe(true); // viewer: giá trị bị che
    const adminDna = await call('A.admin', 'SYS-37', { params: { roleRef: out.role.id } });
    const g = (adminDna.json as { rows: { key: string; value: unknown }[] }).rows.find(
      (r) => r.key === 'identity.gender',
    );
    expect(g?.value).toBe('female');
  });

  it('upload avatar: chưa kiểm được tệp sạch ⇒ fail-closed upload.not_clean (không tạo Role)', async () => {
    const at = t.world.tenants.A;
    const seeded = (await import('../http/harness.ts')).tk.CROSS_TENANT_SEEDERS.AT?.({
      world: t.world,
      tenant: at,
      seeded: new Map(),
    });
    expect(seeded).toBeDefined();
    const name = uniq('NoUpload');
    const res = await call('A.owner', 'SYS-31', {
      body: { name, gender: 'male', description: '', avatar: { source: 'upload', attachmentRef: seeded?.displayId } },
    });
    expect(res.status).toBe(422);
    expect(res.code).toBe('upload.not_clean');
    const list = await call('A.owner', 'SYS-30', { query: { name } });
    expect((list.json as { items: unknown[] }).items).toHaveLength(0);
  });

  it('ref ảnh thư viện của tenant B ⇒ 404 và không tạo Role', async () => {
    const theirs = (await import('../http/harness.ts')).tk.CROSS_TENANT_SEEDERS.SN?.({
      world: t.world,
      tenant: t.world.tenants.B,
      seeded: new Map(),
    });
    const name = uniq('Leak');
    const res = await call('A.owner', 'SYS-31', {
      body: { name, gender: 'male', description: '', avatar: { source: 'library', skinAssetRef: theirs?.displayId } },
    });
    expect(res.status).toBe(404);
    const list = await call('A.owner', 'SYS-30', { query: { name } });
    expect((list.json as { items: unknown[] }).items).toHaveLength(0);
  });
});

describe('SYS-30 / 32 danh sách + hồ sơ', () => {
  it('lọc theo tên đúng + phân trang bằng cursor; Role của B không lẫn vào', async () => {
    const names = [uniq('Page'), uniq('Page'), uniq('Page')];
    for (const n of names) mkRole(t, n);
    const first = await call('A.viewer', 'SYS-30', { query: { limit: '2' } });
    const p1 = first.json as { items: { displayId: string }[]; nextCursor: string | null };
    expect(p1.items).toHaveLength(2);
    expect(p1.nextCursor).not.toBeNull();
    const second = await call('A.viewer', 'SYS-30', { query: { limit: '200', cursor: p1.nextCursor as string } });
    const p2 = second.json as { items: { displayId: string }[] };
    const ids1 = new Set(p1.items.map((i) => i.displayId));
    expect(p2.items.every((i) => !ids1.has(i.displayId))).toBe(true);
    const exact = await call('A.viewer', 'SYS-30', { query: { name: names[1] as string } });
    expect((exact.json as { items: { name: string }[] }).items.map((i) => i.name)).toEqual([names[1]]);
    const bad = await call('A.viewer', 'SYS-30', { query: { cursor: '!!!' } });
    expect(bad.status).toBe(400);
  });

  it('hồ sơ Role: có vị trí, ngân sách, DNA khai sinh; cuối cùng chưa có thẻ', async () => {
    const role = mkRole(t);
    const res = await call('A.viewer', 'SYS-32', { params: { roleRef: role.display_id } });
    expect(res.status).toBe(200);
    const body = res.json as {
      lifecycle: string;
      position: { title: string };
      card: unknown;
      budget: { budget: number };
    };
    expect(body.lifecycle).toBe('draft');
    expect(body.position.title.length).toBeGreaterThan(0);
    expect(body.card).toBeNull();
    expect(body.budget.budget).toBeGreaterThan(0);
  });
});

describe('SYS-33 / 34 / 35 / 36', () => {
  it('đổi tên chỉ khi còn nháp (trạng thái đã lưu), đổi màu luôn được', async () => {
    const role = mkRole(t);
    const ok = await call('A.admin', 'SYS-33', {
      params: { roleRef: role.id },
      body: { name: uniq('Renamed'), color: 'rose' },
    });
    expect(ok.status).toBe(200);
    expect((ok.json as { color: string }).color).toBe('rose');
    ownerWrite(t, (tx) => tx.roles.setLifecycle(role.id, 'born'));
    const locked = await call('A.admin', 'SYS-33', { params: { roleRef: role.id }, body: { name: uniq('Nope') } });
    expect(locked.status).toBe(409);
    expect(locked.code).toBe('db.immutable_identity');
    const color = await call('A.admin', 'SYS-33', { params: { roleRef: role.id }, body: { color: 'azure' } });
    expect(color.status).toBe(200);
  });

  it('nhân bản: Role nháp mới cùng màu / mô tả; trùng tên ⇒ 409', async () => {
    const role = mkRole(t);
    const name = uniq('Clone');
    const res = await call('A.admin', 'SYS-34', { params: { roleRef: role.id }, body: { name } });
    expect(res.status).toBe(200);
    const again = await call('A.admin', 'SYS-34', { params: { roleRef: role.id }, body: { name } });
    expect(again.status).toBe(409);
  });

  it('lưu trữ: Role còn thẻ hiệu lực ⇒ conflict; Role thường ⇒ archived (idempotent)', async () => {
    const carded = mkRole(t);
    ownerWrite(t, (tx) => tx.roles.setLifecycle(carded.id, 'carded'));
    const blocked = await call('A.admin', 'SYS-35', { params: { roleRef: carded.id } });
    expect(blocked.status).toBe(409);
    expect(blocked.code).toBe('conflict');
    const plain = mkRole(t);
    for (let i = 0; i < 2; i++) {
      const res = await call('A.admin', 'SYS-35', { params: { roleRef: plain.id } });
      expect(res.status).toBe(200);
      expect((res.json as { lifecycle: string }).lifecycle).toBe('archived');
    }
  });

  it('xoá: owner gõ đúng tên ⇒ 202 + job purge sau grace; sai tên ⇒ 400, Role còn nguyên; admin ⇒ 403', async () => {
    const role = mkRole(t);
    const wrong = await call('A.owner', 'SYS-36', { params: { roleRef: role.id }, body: { confirmName: 'sai tên' } });
    expect(wrong.status).toBe(400);
    expect(wrong.code).toBe('confirm.mismatch');
    expect((await call('A.viewer', 'SYS-32', { params: { roleRef: role.id } })).status).toBe(200);
    const admin = await call('A.admin', 'SYS-36', { params: { roleRef: role.id }, body: { confirmName: role.name } });
    expect(admin.status).toBe(403);
    const ok = await call('A.owner', 'SYS-36', { params: { roleRef: role.id }, body: { confirmName: role.name } });
    expect(ok.status).toBe(202);
    const out = ok.json as { purge: { jobDisplayId: string; state: string }; graceDays: number };
    expect(out.graceDays).toBeGreaterThan(0);
    expect(out.purge.state).toBe('queued');
    expect((await call('A.viewer', 'SYS-32', { params: { roleRef: role.id } })).status).toBe(404);
  });
});
