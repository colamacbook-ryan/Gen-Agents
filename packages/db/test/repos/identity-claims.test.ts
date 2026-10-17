// Review bảo mật MEDIUM (lớp "tin danh tính / phê duyệt nhận từ tham số"):
//   1. actor Role chỉ có quyền khi Role còn sống, cùng workspace, không lưu trữ / tạm ngưng;
//   2. chat.append: ngoài actor system, author_kind / author_actor_id lấy theo actor giao dịch — không ghi thay người khác;
//   3. wallet.post không nhận approvedBy (người duyệt thứ hai không được khai qua tham số).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFixture, type Fixture } from '../../src/repos/fixture/index.ts';
import type { RoleRow, WriteTx } from '../../src/repos/index.ts';

let f: Fixture;
beforeEach(() => {
  f = createFixture({ roles: 3 });
});
afterEach(() => f.close());

const denied = expect.objectContaining({ rule: 'permission.denied' });
const as = <T>(actor: string, fn: (tx: WriteTx) => T) => f.store.write(actor, fn);
const actorOfRole = (r: RoleRow) => f.store.read(f.workspaceId, (tx) => tx.workspace.actorForRole(r.id)?.id as string);

describe('actor Role: quyền theo trạng thái thật của Role', () => {
  it('Role còn sống ghi được; tạm ngưng / lưu trữ / xoá mềm ⇒ permission.denied', () => {
    const [a, b, c] = f.roles as [RoleRow, RoleRow, RoleRow];
    const ping = (r: RoleRow) => () => as(actorOfRole(r), (tx) => tx.audit.append({ action: 'test.ping' }));
    for (const r of [a, b, c]) expect(ping(r)).not.toThrow();
    as(f.ownerActorId, (tx) => tx.roles.setLifecycle(a.id, 'suspended'));
    as(f.ownerActorId, (tx) => tx.roles.setLifecycle(b.id, 'archived'));
    as(f.ownerActorId, (tx) => tx.roles.softDelete(c.id));
    for (const r of [a, b, c]) expect(ping(r), r.name).toThrow(denied);
  });
});

describe('chat.append: danh tính tác giả = actor giao dịch', () => {
  it('owner chỉ ghi author_kind owner của chính mình; Role chỉ role; actor system ghi thay được', () => {
    const role = f.roles[0] as RoleRow;
    const roleActor = actorOfRole(role);
    const thread = as(f.ownerActorId, (tx) =>
      tx.chat.openThread({ kind: 'workspace', agent: 'role', roleId: role.id }),
    );
    const msg = (actor: string, over: Record<string, unknown>) => () =>
      as(actor, (tx) =>
        tx.chat.append({ threadId: thread.id, authorKind: 'owner', channel: 'web', content: 'x', ...over } as never),
      );
    for (const kind of ['user', 'role', 'system', 'assistant', 'external']) {
      expect(msg(f.ownerActorId, { authorKind: kind }), kind).toThrow(denied);
    }
    expect(msg(f.ownerActorId, { authorActorId: roleActor }), 'mượn actor Role').toThrow(denied);
    expect(msg(f.ownerActorId, { authorActorId: null }), 'giấu tác giả').toThrow(denied);
    expect(msg(f.ownerActorId, {})().author_actor_id).toBe(f.ownerActorId);
    expect(msg(roleActor, { authorKind: 'owner' }), 'Role giả owner').toThrow(denied);
    expect(msg(roleActor, { authorKind: 'role', authorActorId: f.ownerActorId }), 'Role mượn owner').toThrow(denied);
    expect(msg(roleActor, { authorKind: 'role' })().author_actor_id).toBe(roleActor);
    expect(msg(f.systemActorId, { authorKind: 'role', authorActorId: roleActor })().author_actor_id).toBe(roleActor);
  });
});

describe('wallet.post: không khai người duyệt qua tham số', () => {
  it('approvedBy truyền lậu (ép kiểu) bị bỏ qua — approved_by luôn NULL ở M1', () => {
    const role = f.roles[0] as RoleRow;
    // khai người duyệt là admin hợp lệ (DB sẽ nhận) ⇒ nếu repo còn chuyển tham số thì lộ ra ở dòng assert, không ở trigger
    const u = f.store.createUser({ username: 'quantri', displayName: 'QT', passwordHash: 'argon2id$x' });
    const admin = as(f.ownerActorId, (tx) => tx.workspace.addMember({ userId: u.id, accessLevel: 'admin' })).actor.id;
    const { w, ev } = as(f.ownerActorId, (tx) => ({
      w: tx.wallet.openRoleWallet(role.id),
      ev: tx.audit.append({ action: 'wallet.grant_request', entity: { type: 'roles', id: role.id } }),
    }));
    const e = as(f.ownerActorId, (tx) =>
      tx.wallet.post({
        entryType: 'grant',
        debitWalletId: tx.wallet.treasury().id,
        creditWalletId: w.id,
        amountMinor: 5000,
        reason: 'cấp vốn',
        evidenceAuditId: ev.id,
        approvedBy: admin,
      } as never),
    );
    expect(e.approved_by).toBeNull();
    expect(e.recorded_by).toBe(f.ownerActorId);
  });
});
