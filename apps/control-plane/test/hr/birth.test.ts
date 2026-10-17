// Nghiệp vụ SYS-39 (xác nhận field AI suy ra) và SYS-40 (ký giấy khai sinh): cổng + quyền.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from '../http/harness.ts';
import { addDna, makeHrApp, mkRole, ownerWrite } from './helpers.ts';

let t: TestApp;
beforeAll(() => {
  t = makeHrApp();
});
afterAll(() => t.close());
const as = (w: Parameters<TestApp['as']>[0]) => t.as(w);

/** Interviewer (AI Hệ thống) đề xuất một field AI suy ra ⇒ hàng DN 'proposed' chờ người duyệt. Trả mã DN. */
function inferredProposal(roleId: string, key: string, value: string, extra: { also?: string } = {}) {
  const actorId = t.world.store.systemActorId(t.world.tenants.A.workspaceId, 'interviewer');
  return t.world.store.write(actorId, (tx) => {
    const item = (k: string, v: string) => {
      const def = tx.dna.defs().find((d) => d.key === k);
      if (def === undefined) throw new Error(k);
      return {
        target: 'dna' as const,
        op: 'create' as const,
        defId: def.id,
        valueJson: JSON.stringify(v),
        tokenCount: 2,
        tokenizer: 'test',
        source: 'ai_inferred' as const,
      };
    };
    tx.changeSets.propose({
      scope: 'role',
      roleId,
      title: 'AI suy ra',
      items: [item(key, value), ...(extra.also === undefined ? [] : [item(extra.also, 'khác')])],
    });
    const def = tx.dna.defs().find((d) => d.key === key);
    const f = tx.dna.fields(roleId, { status: 'proposed' }).find((x) => x.def_id === def?.id);
    if (f === undefined) throw new Error('không thấy field đề xuất');
    return f;
  });
}

describe('SYS-39 xác nhận field AI suy ra', () => {
  it('admin xác nhận (theo mã và `all`); mã không thuộc Role ⇒ 404; chạy lại ⇒ 0', async () => {
    const role = mkRole(t);
    const other = mkRole(t);
    const a = inferredProposal(role.id, 'style.tone', 'x');
    const b = inferredProposal(role.id, 'style.format', 'y');
    const foreign = inferredProposal(other.id, 'style.tone', 'z');
    const stray = await as('A.admin').call('SYS-39', {
      params: { roleRef: role.id },
      body: { refs: [foreign.display_id] },
    });
    expect(stray.status).toBe(404);
    const one = await as('A.admin').call('SYS-39', { params: { roleRef: role.id }, body: { refs: [a.display_id] } });
    expect(one.status).toBe(200);
    expect(one.json).toEqual({ confirmed: 1, inferredPending: 1 });
    const all = await as('A.admin').call('SYS-39', { params: { roleRef: role.id }, body: { all: true } });
    expect(all.json).toEqual({ confirmed: 1, inferredPending: 0 });
    expect((await as('A.admin').call('SYS-39', { params: { roleRef: role.id }, body: { all: true } })).json).toEqual({
      confirmed: 0,
      inferredPending: 0,
    });
    const dna = await as('A.owner').call('SYS-37', { params: { roleRef: role.id } });
    const rows = (dna.json as { rows: { displayId: string; confirmedAt: string | null }[] }).rows;
    expect(
      rows.filter((r) => [a.display_id, b.display_id].includes(r.displayId)).every((r) => r.confirmedAt !== null),
    ).toBe(true);
    // Role khác vẫn còn đề xuất chưa xác nhận
    const pend = await as('A.owner').call('SYS-37', { params: { roleRef: other.id } });
    expect((pend.json as { progress: { inferredPending: number } }).progress.inferredPending).toBe(1);
  });

  it('field LÕI do AI suy ra: admin ⇒ 403 (không đổi gì); owner ⇒ xác nhận được', async () => {
    const role = mkRole(t);
    const f = inferredProposal(role.id, 'values.honesty', 'trung thực');
    const denied = await as('A.admin').call('SYS-39', { params: { roleRef: role.id }, body: { all: true } });
    expect(denied.status).toBe(403);
    expect(ownerWrite(t, (tx) => tx.dna.field(f.id))?.status).toBe('proposed');
    const ok = await as('A.owner').call('SYS-39', { params: { roleRef: role.id }, body: { all: true } });
    expect(ok.json).toEqual({ confirmed: 1, inferredPending: 0 });
    expect(ownerWrite(t, (tx) => tx.dna.field(f.id))?.status).toBe('active');
  });

  it('change set LẪN (có mục không được hỏi tới) không bị áp lẫn: confirmed 0, mục vẫn chờ', async () => {
    const role = mkRole(t);
    const a = inferredProposal(role.id, 'style.tone', 'x', { also: 'style.format' });
    const res = await as('A.admin').call('SYS-39', { params: { roleRef: role.id }, body: { refs: [a.display_id] } });
    expect(res.json).toEqual({ confirmed: 0, inferredPending: 2 });
    expect(ownerWrite(t, (tx) => tx.dna.field(a.id))?.status).toBe('proposed');
  });
});

describe('SYS-40 ký giấy khai sinh', () => {
  it('đủ điều kiện ⇒ cấp số hồ sơ GA-xxxx-nnnn, Role "ra đời"; ký lại ⇒ 409; số hồ sơ tăng dần', async () => {
    const r1 = mkRole(t);
    const r2 = mkRole(t);
    addDna(t, r1.id, 'style.tone', 'x');
    addDna(t, r2.id, 'style.tone', 'x');
    const s1 = await as('A.admin').call('SYS-40', { params: { roleRef: r1.id } });
    expect(s1.status).toBe(200);
    const o1 = s1.json as {
      registryNo: string;
      signedAt: string;
      audit: { displayId: string };
      revision: { displayId: string };
    };
    expect(o1.registryNo).toMatch(/^GA-[A-Z0-9]{4}-\d{4}$/);
    expect(o1.audit.displayId).toMatch(/^AU-/);
    const role = await as('A.viewer').call('SYS-32', { params: { roleRef: r1.id } });
    expect((role.json as { lifecycle: string; registryNo: string }).lifecycle).toBe('born');
    expect((role.json as { registryNo: string }).registryNo).toBe(o1.registryNo);
    const again = await as('A.admin').call('SYS-40', { params: { roleRef: r1.id } });
    expect(again.status).toBe(409);
    const s2 = await as('A.admin').call('SYS-40', { params: { roleRef: r2.id } });
    const n = (s: string) => Number(s.slice(-4));
    expect(n((s2.json as { registryNo: string }).registryNo)).toBe(n(o1.registryNo) + 1);
    // bảng DNA phản ánh đã ký
    const dna = await as('A.viewer').call('SYS-37', { params: { roleRef: r1.id } });
    expect((dna.json as { signed: { registryNo: string } }).signed.registryNo).toBe(o1.registryNo);
  });

  it('chặn: chưa có hồ sơ nào / còn field AI chưa xác nhận ⇒ gate.sign_blocked (unconfirmed_inferred), không ký', async () => {
    const empty = mkRole(t);
    const blocked = await as('A.admin').call('SYS-40', { params: { roleRef: empty.id } });
    expect(blocked.status).toBe(409);
    expect(blocked.code).toBe('gate.sign_blocked');
    expect(blocked.detail).toMatchObject({ reason: 'unconfirmed_inferred' });
    const role = mkRole(t);
    inferredProposal(role.id, 'style.tone', 'x');
    addDna(t, role.id, 'style.format', 'y');
    const pending = await as('A.admin').call('SYS-40', { params: { roleRef: role.id } });
    expect(pending.code).toBe('gate.sign_blocked');
    expect((await as('A.viewer').call('SYS-32', { params: { roleRef: role.id } })).json).toMatchObject({
      lifecycle: 'draft',
      registryNo: null,
    });
    await as('A.admin').call('SYS-39', { params: { roleRef: role.id }, body: { all: true } });
    expect((await as('A.admin').call('SYS-40', { params: { roleRef: role.id } })).status).toBe(200);
  });

  it('chặn: vượt ngân sách prompt ⇒ gate.sign_blocked (budget_exceeded)', async () => {
    const role = mkRole(t);
    addDna(t, role.id, 'style.tone', 'x'.repeat(19_000));
    ownerWrite(t, (tx) => tx.roles.update(role.id, { promptBudgetTokens: 200 }));
    const res = await as('A.admin').call('SYS-40', { params: { roleRef: role.id } });
    expect(res.status).toBe(409);
    expect(res.detail).toMatchObject({ reason: 'budget_exceeded' });
  });
});
