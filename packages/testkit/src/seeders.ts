// Registry seeder CHỐNG IDOR theo prefix (CHỈ TEST). Meta-test của control-plane (test/meta/) duyệt MỌI route đã mount: mỗi
// trường Ref (params / query / body) ⇒ cần seeder cho prefix của nó, tạo một hàng THẬT trong tenant chỉ định; thiếu seeder ⇒
// test ĐỎ "chưa chứng minh chống IDOR cho <prefix>". Lane thêm route có Ref mới ⇒ thêm seeder vào đây (một hàm / prefix).
//   - Seeder dựng dữ liệu qua repo thật (DataStore) bằng actor owner của tenant — không SQL tay.
//   - `seeded`: hàng đã seed TRƯỚC trong cùng request (theo tên trường) — cho quan hệ cha–con (vd DNA thuộc Role).
import type { EntityPrefix } from '@ga/contracts';
import type { RefPrefixes } from './sample.ts';
import { HR_SEEDERS } from './seeders-hr.ts';
import type { TestTenant, TestWorld } from './world.ts';

export { SEEDER_PARENTS } from './seeders-hr.ts';

export interface Seeded {
  readonly id: string;
  readonly displayId: string;
}

export interface SeedContext {
  readonly world: TestWorld;
  readonly tenant: TestTenant;
  /** Hàng đã seed trước trong cùng request, theo prefix (Role trước DNA…). */
  readonly seeded: ReadonlyMap<EntityPrefix, Seeded>;
}

export type CrossTenantSeeder = (ctx: SeedContext) => Seeded;

let seq = 0;

const seedRole: CrossTenantSeeder = ({ world, tenant }) => {
  const n = ++seq;
  const row = world.store.write(
    tenant.users.owner.actorId,
    (tx) => tx.roles.create({ name: `Seed ${tenant.key} ${n}`, color: 'jade' }),
    { channel: 'web' },
  );
  return { id: row.id, displayId: row.display_id };
};

/** prefix → seeder. Thêm ở đây (một dòng / prefix) khi route có Ref của prefix mới được mount. */
export const CROSS_TENANT_SEEDERS: Readonly<Partial<Record<EntityPrefix, CrossTenantSeeder>>> = Object.freeze({
  RL: seedRole,
  ...HR_SEEDERS,
});

/** Prefix dùng để chứng minh cho Ref `'*'` (OPS-35 recordRef: mọi prefix) — prefix đầu có seeder. */
export const WILDCARD_PROOF_PREFIXES: readonly EntityPrefix[] = ['RL'];

/** Prefix cần seeder cho một trường Ref (mỗi prefix của danh sách; `'*'` ⇒ các prefix chứng minh của wildcard). */
export function proofPrefixes(prefixes: RefPrefixes): readonly EntityPrefix[] {
  return prefixes === '*' ? WILDCARD_PROOF_PREFIXES : prefixes;
}

export function missingSeederPrefixes(prefixes: RefPrefixes): EntityPrefix[] {
  return proofPrefixes(prefixes).filter((p) => CROSS_TENANT_SEEDERS[p] === undefined);
}
