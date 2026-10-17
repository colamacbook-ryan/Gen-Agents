// LUẬT QUYỀN ÁP THAY ĐỔI (INTENT): chạm lõi (giá trị / tính cách / DN is_core) hoặc Nội quy (house_rules) CHỈ owner áp, tính từ
// TRẠNG THÁI ĐÃ LƯU; lý do bắt buộc khi lõi; ô DNA phải thuộc đúng Role; người duyệt ≠ người đề xuất.

import { DbRuleError } from '@ga/db/repos';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertApproverIsNotProposer, assertMayApply, withPermissionMapping } from '../../src/hr/shared.ts';
import { ApiError } from '../../src/http/errors.ts';
import type { TestApp } from '../http/harness.ts';
import { addDna, addInstruction, makeHrApp, mkRole, ownerWrite, uniq } from './helpers.ts';

let t: TestApp;
beforeAll(() => {
  t = makeHrApp();
});
afterAll(() => t.close());
const as = (w: Parameters<TestApp['as']>[0]) => t.as(w);

const revisionsOf = async (roleRef: string) =>
  (await as('A.viewer').call('SYS-41', { params: { roleRef } })).json as { version: string; isMajor: boolean }[];

describe('SYS-38 — sửa ô DNA qua change set', () => {
  it('admin sửa DN KHÔNG lõi: áp ngay, revision minor + 1, giá trị đổi', async () => {
    const role = mkRole(t);
    const f = addDna(t, role.id, 'style.tone', 'trang trọng');
    const before = (await revisionsOf(role.id)).length;
    const res = await as('A.admin').call('SYS-38', {
      params: { roleRef: role.id, dnaRef: f.display_id },
      body: { value: 'thân mật' },
    });
    expect(res.status).toBe(200);
    const out = res.json as { field: { value: unknown; version: number; isCore: boolean }; revision: { id: string } };
    expect(out.field.value).toBe('thân mật');
    expect(out.field.isCore).toBe(false);
    expect((await revisionsOf(role.id)).length).toBe(before + 1);
  });

  it('admin sửa DN LÕI ⇒ 403 (kể cả có lý do), không đổi gì, không thêm revision', async () => {
    const role = mkRole(t);
    const f = addDna(t, role.id, 'values.honesty', 'luôn trung thực');
    const before = (await revisionsOf(role.id)).length;
    const res = await as('A.admin').call('SYS-38', {
      params: { roleRef: role.id, dnaRef: f.display_id },
      body: { value: 'thỉnh thoảng nói dối', reason: 'admin muốn sửa' },
    });
    expect(res.status).toBe(403);
    expect(res.code).toBe('auth.forbidden');
    expect((await revisionsOf(role.id)).length).toBe(before);
    const dna = await as('A.admin').call('SYS-37', { params: { roleRef: role.id } });
    const row = (dna.json as { rows: { key: string; value: unknown }[] }).rows.find((r) => r.key === 'values.honesty');
    expect(row?.value).toBe('luôn trung thực');
  });

  it('owner sửa DN lõi: thiếu lý do ⇒ 400; có lý do ⇒ 200, revision LỚN (major + 1)', async () => {
    const role = mkRole(t);
    const f = addDna(t, role.id, 'values.privacy', 'giữ kín');
    const path = { roleRef: role.id, dnaRef: f.display_id };
    const noReason = await as('A.owner').call('SYS-38', { params: path, body: { value: 'giữ kín hơn' } });
    expect(noReason.status).toBe(400);
    expect(noReason.detail).toMatchObject({ field: 'reason' });
    const before = await revisionsOf(role.id);
    const ok = await as('A.owner').call('SYS-38', {
      params: path,
      body: { value: 'giữ kín hơn', reason: 'chủ sở hữu duyệt nâng chuẩn riêng tư' },
    });
    expect(ok.status).toBe(200);
    const after = await revisionsOf(role.id);
    expect(after.length).toBe(before.length + 1);
    expect(after[after.length - 1]?.isMajor).toBe(true);
  });

  it('ô DNA phải thuộc Role trên đường dẫn: Role khác ⇒ 404, không đổi gì', async () => {
    const mine = mkRole(t);
    const other = mkRole(t);
    const f = addDna(t, other.id, 'style.tone', 'x');
    const res = await as('A.owner').call('SYS-38', {
      params: { roleRef: mine.id, dnaRef: f.display_id },
      body: { value: 'y' },
    });
    expect(res.status).toBe(404);
    const dna = await as('A.owner').call('SYS-37', { params: { roleRef: other.id } });
    expect((dna.json as { rows: { value: unknown }[] }).rows[0]?.value).toBe('x');
  });

  it('giá trị sai kiểu theo định nghĩa ⇒ 400 validation.failed (field=value)', async () => {
    const role = mkRole(t);
    const f = addDna(t, role.id, 'style.tone', 'x');
    const res = await as('A.owner').call('SYS-38', {
      params: { roleRef: role.id, dnaRef: f.display_id },
      body: { value: 123 },
    });
    expect(res.status).toBe(400);
    expect(res.detail).toMatchObject({ field: 'value' });
  });

  it('trường định danh khoá (identity.gender) không sửa được sau khi Role ra đời', async () => {
    const role = mkRole(t);
    const f = addDna(t, role.id, 'identity.gender', 'female');
    ownerWrite(t, (tx) => tx.roles.setLifecycle(role.id, 'born'));
    const res = await as('A.owner').call('SYS-38', {
      params: { roleRef: role.id, dnaRef: f.display_id },
      body: { value: 'male' },
    });
    expect(res.status).toBe(409);
    expect(res.code).toBe('db.immutable_identity');
  });
});

describe('SYS-47 / SYS-48 — Instruction: lõi + Nội quy chỉ owner', () => {
  const body = (extra: Record<string, unknown>) => ({
    scope: 'role',
    layer: 'style',
    name: uniq('IN'),
    content: 'nội dung',
    ...extra,
  });

  it('admin thêm khối phong cách ⇒ 200; revision mới', async () => {
    const role = mkRole(t);
    const res = await as('A.admin').call('SYS-47', { body: body({ roleRef: role.id }) });
    expect(res.status).toBe(200);
    const out = res.json as { instruction: { displayId: string }; budget: { budget: number } };
    expect(out.instruction.displayId).toMatch(/^IN-/);
    expect(out.budget.budget).toBeGreaterThan(0);
    const list = await as('A.viewer').call('SYS-46', { params: { roleRef: role.id } });
    expect((list.json as { rows: { name: string }[] }).rows.length).toBe(1);
  });

  it.each(['values', 'persona'])('admin thêm khối lớp lõi %s ⇒ 403, không tạo gì', async (layer) => {
    const role = mkRole(t);
    const res = await as('A.admin').call('SYS-47', {
      body: body({ roleRef: role.id, layer, reason: 'admin tự ý' }),
    });
    expect(res.status).toBe(403);
    const list = await as('A.viewer').call('SYS-46', { params: { roleRef: role.id } });
    expect((list.json as { rows: unknown[] }).rows).toHaveLength(0);
  });

  it('admin thêm Nội quy (house_rules) ⇒ 403; owner thêm ⇒ 200 và hiện khi includeHouseRules', async () => {
    const name = uniq('Nội quy');
    const denied = await as('A.admin').call('SYS-47', {
      body: body({ scope: 'workspace', layer: 'house_rules', name }),
    });
    expect(denied.status).toBe(403);
    const ok = await as('A.owner').call('SYS-47', { body: body({ scope: 'workspace', layer: 'house_rules', name }) });
    expect(ok.status).toBe(200);
    const role = mkRole(t);
    const shown = await as('A.viewer').call('SYS-46', {
      params: { roleRef: role.id },
      query: { includeHouseRules: 'true' },
    });
    expect((shown.json as { rows: { name: string }[] }).rows.map((r) => r.name)).toContain(name);
    const hidden = await as('A.viewer').call('SYS-46', { params: { roleRef: role.id } });
    expect((hidden.json as { rows: { name: string }[] }).rows.map((r) => r.name)).not.toContain(name);
  });

  it('owner thêm khối lõi: thiếu lý do ⇒ 400; có lý do ⇒ 200 (revision lớn)', async () => {
    const role = mkRole(t);
    const no = await as('A.owner').call('SYS-47', { body: body({ roleRef: role.id, layer: 'values' }) });
    expect(no.status).toBe(400);
    const ok = await as('A.owner').call('SYS-47', {
      body: body({ roleRef: role.id, layer: 'values', reason: 'giá trị cốt lõi' }),
    });
    expect(ok.status).toBe(200);
  });

  it('scope ↔ layer ↔ ref lệch nhau ⇒ 400 (không chạm DB)', async () => {
    const role = mkRole(t);
    for (const b of [
      body({ scope: 'role' }), // thiếu roleRef
      body({ roleRef: role.id, layer: 'house_rules' }), // lớp không thuộc scope role
      body({ scope: 'workspace', layer: 'style' }), // workspace chỉ house_rules
      body({ scope: 'workspace', layer: 'house_rules', roleRef: role.id }), // ref thừa
    ]) {
      const res = await as('A.owner').call('SYS-47', { body: b });
      expect(res.status, JSON.stringify(b)).toBe(400);
    }
  });

  it('SYS-48: quyền tính từ HÀNG ĐÃ LƯU — admin sửa Nội quy / khối persona có sẵn ⇒ 403, nội dung không đổi', async () => {
    const role = mkRole(t);
    const rule = addInstruction(t, { workspace: true }, 'house_rules');
    const persona = addInstruction(t, { roleId: role.id }, 'persona');
    for (const row of [rule, persona]) {
      const res = await as('A.admin').call('SYS-48', {
        params: { instructionRef: row.display_id },
        body: { content: 'bị admin sửa', reason: 'thử' },
      });
      expect(res.status, row.layer).toBe(403);
    }
    const fresh = ownerWrite(t, (tx) => tx.instructions.get(rule.id));
    expect(fresh?.content).toBe('nội dung seed');
    // owner sửa Nội quy ⇒ được
    const ok = await as('A.owner').call('SYS-48', {
      params: { instructionRef: rule.display_id },
      body: { content: 'owner sửa' },
    });
    expect(ok.status).toBe(200);
  });

  it('SYS-48: admin sửa khối không lõi ⇒ 200; cờ lõi KHÔNG lấy từ request (strict body từ chối)', async () => {
    const role = mkRole(t);
    const row = addInstruction(t, { roleId: role.id }, 'style');
    const ok = await as('A.admin').call('SYS-48', {
      params: { instructionRef: row.display_id },
      body: { name: uniq('Đổi tên'), enabled: false },
    });
    expect(ok.status).toBe(200);
    const smuggle = await as('A.admin').call('SYS-48', {
      params: { instructionRef: row.display_id },
      body: { isCore: false, content: 'x' },
    });
    expect(smuggle.status).toBe(400);
  });
});

describe('quy tắc quyền dùng chung (đơn vị)', () => {
  it('withPermissionMapping: permission.* của repo ⇒ auth.forbidden; lỗi khác đi qua nguyên vẹn', () => {
    const denied = new DbRuleError('permission.denied', 'x');
    expect(() =>
      withPermissionMapping(() => {
        throw denied;
      }),
    ).toThrow(expect.objectContaining({ code: 'auth.forbidden' }));
    const other = new DbRuleError('repo.not_found', 'x');
    expect(() =>
      withPermissionMapping(() => {
        throw other;
      }),
    ).toThrow(other);
  });

  const ctxOf = (authLevel: 'V' | 'A' | 'O') => ({ actor: { authLevel } }) as never;

  it('assertMayApply: lõi / Nội quy chỉ owner; việc thường admin được', () => {
    expect(() => assertMayApply(ctxOf('A'), { core: false, houseRules: false })).not.toThrow();
    expect(() => assertMayApply(ctxOf('O'), { core: true, houseRules: true })).not.toThrow();
    for (const touches of [
      { core: true, houseRules: false },
      { core: false, houseRules: true },
    ]) {
      expect(() => assertMayApply(ctxOf('A'), touches)).toThrow(ApiError);
    }
  });

  it('assertApproverIsNotProposer: tự duyệt đề xuất của chính mình ⇒ từ chối', () => {
    expect(() => assertApproverIsNotProposer('actor-1', 'actor-2')).not.toThrow();
    expect(() => assertApproverIsNotProposer('actor-1', 'actor-1')).toThrow(ApiError);
  });
});
