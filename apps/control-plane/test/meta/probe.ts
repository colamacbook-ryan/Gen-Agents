// Công cụ dùng chung của meta-test (CHỈ TEST): dữ liệu seed theo tenant, request hợp lệ từ hợp đồng, và phép kiểm CHÉO
// TENANT cho một trường Ref — tách ra để chính phép kiểm có test đỏ / xanh (test/meta/probe.test.ts).
import { ApiErrorEnvelope, ENTITY_TYPES, type EntityPrefix, type Route } from '@ga/contracts';
import { expect } from 'vitest';
import type { CallInput, CallResult, TestApp, Who } from '../http/harness.ts';
import { tk } from '../http/harness.ts';

type Seeded = import('@ga/testkit').Seeded;
type RefField = import('@ga/testkit').RefField;

export interface Probe {
  seedFor(tenant: 'A' | 'B', prefix: EntityPrefix, fresh?: boolean): Seeded | null;
  /** Hàng mới của B có display_id KHÔNG trùng hàng nào của A (display_id đánh số theo workspace). */
  seedTheirs(prefix: EntityPrefix): Seeded;
  refForTenant(tenant: 'A' | 'B'): (prefixes: readonly EntityPrefix[] | '*') => string | undefined;
  /** Request HỢP LỆ (mẫu từ hợp đồng, mọi Ref = hàng thật của tenant A). */
  validInput(route: Route, extra?: Partial<CallInput>): CallInput;
  callCounted(route: Route, who: Who, input: CallInput): Promise<{ res: CallResult; ran: number }>;
  /** Ref của B ở `field` ⇒ không bao giờ 2xx (path ⇒ 404; body / query ⇒ 404 hoặc 400); đối chứng ref của A ⇒ không 404/400/500. */
  checkCrossTenant(route: Route, field: RefField): Promise<void>;
}

export function expectError(res: CallResult, status: number, code: string): void {
  expect(res.status, `${res.status} ${res.text.slice(0, 200)}`).toBe(status);
  expect(res.code).toBe(code);
  expect(ApiErrorEnvelope.safeParse(res.json).success).toBe(true);
}

export function makeProbe(t: TestApp): Probe {
  const cache = new Map<string, Seeded>();
  const seedFor: Probe['seedFor'] = (tenant, prefix, fresh = false) => {
    const key = `${tenant}:${prefix}`;
    const cached = cache.get(key);
    if (cached && !fresh) return cached;
    const seeder = tk.CROSS_TENANT_SEEDERS[prefix];
    if (!seeder) return null;
    // quan hệ cha–con: gieo cha TRƯỚC (đã cache) rồi truyền qua `seeded` — DN / IN / RV / AV thuộc đúng Role mà bộ kiểm
    // dùng cho các trường Ref còn lại của cùng tenant (HANDLER-OBLIGATIONS #2)
    const seeded = new Map<EntityPrefix, Seeded>();
    if (!fresh) {
      const parent = tk.SEEDER_PARENTS[prefix];
      if (parent !== undefined) {
        const p = seedFor(tenant, parent);
        if (p) seeded.set(parent, p);
      }
    }
    const s = seeder({ world: t.world, tenant: t.world.tenants[tenant], seeded });
    if (!fresh) cache.set(key, s);
    return s;
  };
  const seedTheirs: Probe['seedTheirs'] = (prefix) => {
    const table = ENTITY_TYPES[prefix];
    for (let i = 0; i < 64; i++) {
      const s = seedFor('B', prefix, true) as Seeded;
      const clash = t.world.reader.db
        .prepare(`SELECT 1 AS x FROM "${table}" WHERE workspace_id = ? AND display_id = ?`)
        .get(t.world.tenants.A.workspaceId, s.displayId);
      if (clash === undefined) return s;
    }
    throw new Error(`không seed được hàng ${prefix} của B có display_id khác A`);
  };
  const refForTenant: Probe['refForTenant'] = (tenant) => (prefixes) => {
    for (const p of tk.proofPrefixes(prefixes)) {
      const s = seedFor(tenant, p);
      if (s) return s.displayId;
    }
    return undefined;
  };
  const toInput = (s: ReturnType<typeof tk.sampleRequest>): CallInput => ({
    ...(s.params ? { params: s.params } : {}),
    ...(s.query ? { query: s.query } : {}),
    ...(s.body !== undefined ? { body: s.body } : {}),
  });
  const validInput: Probe['validInput'] = (route, extra = {}) => {
    const s = tk.sampleRequest(route, { refFor: refForTenant('A') });
    const headers = { ...(s.headers ?? {}) };
    delete headers['idempotency-key']; // client tự sinh khoá mới mỗi lần
    return { ...toInput(s), headers, ...extra };
  };
  const callCounted: Probe['callCounted'] = async (route, who, input) => {
    const before = t.calls.get(route.id) ?? 0;
    const res = await t.as(who).call(route.id, input);
    return { res, ran: (t.calls.get(route.id) ?? 0) - before };
  };
  const checkCrossTenant: Probe['checkCrossTenant'] = async (r, field) => {
    const missing = tk.missingSeederPrefixes(field.prefixes);
    if (missing.length > 0) {
      throw new Error(
        `chưa chứng minh chống IDOR cho ${missing.join(', ')} (${r.id} ${field.path}) — thêm seeder vào @ga/testkit`,
      );
    }
    const who: Who = r.auth === 'public' ? 'anon' : 'A.owner';
    for (const prefix of tk.proofPrefixes(field.prefixes)) {
      const theirs = seedTheirs(prefix);
      for (const value of [theirs.displayId, theirs.id]) {
        const s = tk.sampleRequest(r, { refFor: refForTenant('A'), targetField: field, targetValue: value });
        // gợi ý workspace từ client PHẢI bị bỏ qua (workspace chỉ từ phiên)
        const input: CallInput = { ...toInput(s), headers: { 'x-ga-workspace-id': t.world.tenants.B.workspaceId } };
        const { res } = await callCounted(r, who, input);
        expect(res.status, `${r.id} ${field.path}=${value}: ${res.text.slice(0, 160)}`).toBeGreaterThanOrEqual(400);
        if (field.part === 'params') expectError(res, 404, 'not_found');
        else expect(['not_found', 'validation.failed'], res.text.slice(0, 160)).toContain(res.code);
        expect(res.text).not.toContain(theirs.id === value ? theirs.displayId : theirs.id);
      }
      // đối chứng: cùng request với ref của CHÍNH tenant A ⇒ không bị coi là "không thấy" (phép kiểm không rỗng nghĩa)
      const mine = seedFor('A', prefix) as Seeded;
      const s = tk.sampleRequest(r, { refFor: refForTenant('A'), targetField: field, targetValue: mine.displayId });
      const ctl = await t.as(who).call(r.id, toInput(s));
      // `confirm.mismatch` (400) chỉ ném SAU khi ref đã tra ra hàng của A ⇒ chính là bằng chứng "thấy được" (route ConfirmName
      // không thể khớp tên Role seed bằng mẫu tối thiểu; khớp thật còn xoá luôn hàng dùng chung của các ca khác)
      if (ctl.code === 'confirm.mismatch') continue;
      expect([404, 400, 500], `đối chứng ${r.id} ${field.path}: ${ctl.text.slice(0, 160)}`).not.toContain(ctl.status);
    }
  };
  return { seedFor, seedTheirs, refForTenant, validInput, callCounted, checkCrossTenant };
}
