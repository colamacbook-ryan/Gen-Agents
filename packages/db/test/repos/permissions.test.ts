// Rào quyền ở tầng repo (nhiều lớp với cổng người ghi của DB v2.3.5) — review bảo mật 2026-10-17:
//   - setProactivePolicy: actor Role bị từ chối; maxPerDay số nguyên 0–20;
//   - admin không tự nâng lên owner, không đổi owner; chỉ owner đổi thành viên;
//   - actor Role không ghi tool_grants / egress_rules / settings / ví / bí mật / cấu hình engine…;
//   - viewer không ghi gì; operator giao việc được nhưng không sửa cấu hình;
//   - Polaris: số dư / hạng do server tính (input có balanceMinorAt ⇒ từ chối), session / audit phải thuộc workspace;
//   - audit.*: chỉ actor system ghi (mốc niêm phong retention).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFixture, type Fixture } from '../../src/repos/fixture/index.ts';
import { DbRuleError, type RoleRow, type WriteTx } from '../../src/repos/index.ts';

let f: Fixture;
let role: RoleRow;
let roleActor: string;
let adminActor: string;
let adminUser: string;
let operatorActor: string;
let viewerActor: string;

const denied = expect.objectContaining({ rule: 'permission.denied' });
const invalid = expect.objectContaining({ rule: 'repo.invalid_input' });

function member(username: string, level: 'admin' | 'operator' | 'viewer'): { actorId: string; userId: string } {
  const u = f.store.createUser({ username, displayName: username, passwordHash: 'argon2id$x' });
  const { actor } = f.store.write(f.ownerActorId, (tx) => tx.workspace.addMember({ userId: u.id, accessLevel: level }));
  return { actorId: actor.id, userId: u.id };
}

beforeAll(() => {
  f = createFixture({ roles: 1 });
  role = f.roles[0] as RoleRow;
  roleActor = f.store.read(f.workspaceId, (tx) => tx.workspace.actorForRole(role.id)?.id as string);
  ({ actorId: adminActor, userId: adminUser } = member('admin1', 'admin'));
  operatorActor = member('op1', 'operator').actorId;
  viewerActor = member('view1', 'viewer').actorId;
});
afterAll(() => f?.close());

const as = <T>(actor: string, fn: (tx: WriteTx) => T) => f.store.write(actor, fn);

describe('setProactivePolicy (review MEDIUM)', () => {
  it('actor Role tự sửa hợp đồng giờ làm ⇒ permission.denied; owner / admin được', () => {
    const p = { maxPerDay: 20, quietStartMin: 0, quietEndMin: 1, timezone: 'UTC' };
    expect(() => as(roleActor, (tx) => tx.telegram.setProactivePolicy(role.id, p))).toThrow(denied);
    expect(() => as(viewerActor, (tx) => tx.telegram.setProactivePolicy(role.id, p))).toThrow(denied);
    expect(() => as(f.systemActorId, (tx) => tx.telegram.setProactivePolicy(role.id, p))).toThrow(denied);
    expect(as(adminActor, (tx) => tx.telegram.setProactivePolicy(role.id, p)).max_per_day).toBe(20);
  });

  it('maxPerDay âm / quá trần / không nguyên ⇒ repo.invalid_input (trước khi chạm DB)', () => {
    for (const bad of [-1, 21, 1.5, Number.NaN, 2 ** 60]) {
      expect(
        () => as(f.ownerActorId, (tx) => tx.telegram.setProactivePolicy(role.id, { maxPerDay: bad })),
        String(bad),
      ).toThrow(invalid);
    }
    expect(as(f.ownerActorId, (tx) => tx.telegram.setProactivePolicy(role.id, { maxPerDay: 0 })).max_per_day).toBe(0);
  });
});

describe('thành viên workspace', () => {
  it('admin không tự nâng lên owner, không đổi quyền ai; owner không thêm / nâng owner thứ hai', () => {
    expect(() => as(adminActor, (tx) => tx.workspace.setAccessLevel(adminUser, 'owner'))).toThrow(denied);
    expect(() => as(adminActor, (tx) => tx.workspace.setAccessLevel(f.ownerUserId, 'viewer'))).toThrow(denied);
    expect(() => as(f.ownerActorId, (tx) => tx.workspace.setAccessLevel(adminUser, 'owner'))).toThrow(denied);
    expect(() => as(f.ownerActorId, (tx) => tx.workspace.setAccessLevel(f.ownerUserId, 'admin'))).toThrow(denied);
    expect(() => as(f.ownerActorId, (tx) => tx.workspace.removeMember(f.ownerUserId))).toThrow(denied);
    const u = f.store.createUser({ username: 'x2', displayName: 'x2', passwordHash: 'h' });
    expect(() => as(f.ownerActorId, (tx) => tx.workspace.addMember({ userId: u.id, accessLevel: 'owner' }))).toThrow(
      denied,
    );
    expect(() => as(adminActor, (tx) => tx.workspace.addMember({ userId: u.id, accessLevel: 'admin' }))).toThrow(
      denied,
    );
    expect(as(f.ownerActorId, (tx) => tx.workspace.setAccessLevel(adminUser, 'operator')).access_level).toBe(
      'operator',
    );
    as(f.ownerActorId, (tx) => tx.workspace.setAccessLevel(adminUser, 'admin'));
  });
});

describe('ma trận quyền theo actor', () => {
  const ROLE_DENIED: [string, (tx: WriteTx) => unknown][] = [
    ['workspace.update', (tx) => tx.workspace.update({ name: 'x' })],
    ['settings.set', (tx) => tx.settings.set('avatar.transient_seconds', 30)],
    [
      'secrets.create',
      (tx) =>
        tx.secrets.create({
          kind: 'integration_token',
          label: 'x',
          ciphertext: Buffer.from([1]),
          nonce: Buffer.from([1]),
          wrappedDek: Buffer.from([1]),
          dekNonce: Buffer.from([1]),
          kekId: 'k',
          fingerprint: 'f',
        }),
    ],
    ['roles.create', (tx) => tx.roles.create({ name: 'x', color: 'jade' })],
    ['roles.update', (tx) => tx.roles.update(role.id, { name: 'x' })],
    [
      'engines.createAccount',
      (tx) => tx.engines.createAccount({ engineSlug: f.coreEngine, label: 'x', authMethod: 'subscription' }),
    ],
    [
      'engines.recordLoginResult',
      (tx) => tx.engines.recordLoginResult(f.coreAccount?.id as string, { loginStatus: 'expired' }),
    ],
    ['wallet.openRoleWallet', (tx) => tx.wallet.openRoleWallet(role.id)],
    [
      'wallet.post',
      (tx) =>
        tx.wallet.post({
          entryType: 'grant',
          debitWalletId: tx.wallet.treasury().id,
          creditWalletId: tx.wallet.sink().id,
          amountMinor: 1,
          reason: 'x',
        }),
    ],
    [
      'tools.grant',
      (tx) => tx.tools.grant({ toolId: tx.tools.list()[0]?.id as string, roleId: role.id, mode: 'allow' }),
    ],
    ['tools.addEgressRule', (tx) => tx.tools.addEgressRule({ domainPattern: 'evil.example', appliesTo: 'all_roles' })],
    ['telegram.createBot', (tx) => tx.telegram.createBot({ roleId: role.id, botUsername: 'x', secretId: 'x' })],
    ['telegram.addAllowed', (tx) => tx.telegram.addAllowed('x', { tgUserId: 1, displayName: 'x', addedVia: 'manual' })],
    ['tasks.verify', (tx) => tx.tasks.verify('x', 'verified')],
    ['jobs.enqueue', (tx) => tx.jobs.enqueue({ kind: 'probe', payload: {} })],
    ['sessions.start', (tx) => tx.sessions.start({ agentKind: 'role', trigger: 'chat', roleId: role.id })],
    ['avatar.assignMonogram', (tx) => tx.avatar.assignMonogram(role.id)],
    ['changeSets.apply', (tx) => tx.changeSets.apply('x')],
    ['audit.append audit.*', (tx) => tx.audit.append({ action: 'audit.sealed', detail: { deleted_through_seq: 1 } })],
  ];

  it.each(ROLE_DENIED)('actor Role: %s ⇒ permission.denied', (_n, call) => {
    expect(() => as(roleActor, call)).toThrow(denied);
  });

  it('viewer không ghi gì; operator giao việc nhưng không sửa cấu hình / quyền tool', () => {
    expect(() => as(viewerActor, (tx) => tx.tasks.create({ title: 'x', source: 'web' }))).toThrow(denied);
    expect(() => as(viewerActor, (tx) => tx.audit.append({ action: 'test.viewer' }))).toThrow(denied);
    expect(as(operatorActor, (tx) => tx.tasks.create({ title: 'x', source: 'web' })).requested_by).toBe(operatorActor);
    expect(() => as(operatorActor, (tx) => tx.settings.set('avatar.transient_seconds', 30))).toThrow(denied);
    expect(() =>
      as(operatorActor, (tx) =>
        tx.tools.grant({ toolId: tx.tools.list()[0]?.id as string, roleId: role.id, mode: 'allow' }),
      ),
    ).toThrow(denied);
  });

  it('khoá settings theo registry: backup.remote_anchor chỉ owner / system — admin bị từ chối', () => {
    expect(() =>
      as(adminActor, (tx) =>
        tx.settings.set('backup.remote_anchor', { url: 'https://a.example/x', secret_id: 'x' } as never),
      ),
    ).toThrow(denied);
  });

  it('owner ghi được tool_grants / egress_rules; Role chỉ đọc quyền hiệu lực', () => {
    const tool = f.store.read(f.workspaceId, (tx) => tx.tools.list()[0]);
    as(f.ownerActorId, (tx) => tx.tools.grant({ toolId: tool?.id as string, roleId: role.id, mode: 'deny' }));
    expect(f.store.read(f.workspaceId, (tx) => tx.tools.effectiveMode(role.id, tool?.id as string))).toBe('deny');
    const rule = as(f.ownerActorId, (tx) =>
      tx.tools.addEgressRule({ domainPattern: '*.example.com', appliesTo: 'all_roles' }),
    );
    expect(rule.domain_pattern).toBe('*.example.com');
    expect(() =>
      as(f.ownerActorId, (tx) => tx.tools.addEgressRule({ domainPattern: 'a..b', appliesTo: 'all_roles' })),
    ).toThrow(invalid);
  });
});

describe('Polaris — bằng chứng do server tính', () => {
  const sendInput = (polaris: Record<string, unknown>, key: string) => ({
    roleId: role.id,
    triggerKind: 'task_done' as const,
    urgency: 'normal' as const,
    channel: 'telegram' as const,
    dayLocal: '2026-10-17',
    reservedUntil: '2026-10-17T09:00:00.000Z',
    idempotencyKey: key,
    polaris: polaris as never,
  });

  it('input có balanceMinorAt / rankAt ⇒ repo.invalid_input; sessionId lạ ⇒ repo.invalid_ref', () => {
    const base = { expectedGainMinor: 0, rulesApplied: 'P1' };
    expect(() =>
      as(f.systemActorId, (tx) => tx.telegram.reserveSend(sendInput({ ...base, balanceMinorAt: 999 }, 'a'))),
    ).toThrow(invalid);
    expect(() => as(f.systemActorId, (tx) => tx.telegram.reserveSend(sendInput({ ...base, rankAt: 1 }, 'b')))).toThrow(
      invalid,
    );
    expect(() =>
      as(f.systemActorId, (tx) =>
        tx.telegram.reserveSend(sendInput({ ...base, sessionId: '01JZZZZZZZZZZZZZZZZZZZZZZZ' }, 'c')),
      ),
    ).toThrow(expect.objectContaining({ rule: 'repo.invalid_ref' }));
  });

  it('balance_minor_at = số dư ví thật, audit_display_id chụp từ hàng audit', () => {
    const policy = as(f.ownerActorId, (tx) =>
      tx.telegram.setProactivePolicy(role.id, { maxPerDay: 5, quietStartMin: 0, quietEndMin: 1, timezone: 'UTC' }),
    );
    const { w, ev } = as(f.ownerActorId, (tx) => ({
      w: tx.wallet.forRole(role.id) ?? tx.wallet.openRoleWallet(role.id),
      ev: tx.audit.append({ action: 'wallet.grant_request', entity: { type: 'roles', id: role.id } }),
    }));
    as(f.ownerActorId, (tx) =>
      tx.wallet.post({
        entryType: 'grant',
        debitWalletId: tx.wallet.treasury().id,
        creditWalletId: w.id,
        amountMinor: 1234,
        reason: 'cấp',
        evidenceAuditId: ev.id,
      }),
    );
    const send = as(f.systemActorId, (tx) =>
      tx.telegram.reserveSend({
        ...sendInput({ expectedGainMinor: 0, rulesApplied: 'P1', auditId: ev.id }, 'd'),
        policyId: policy.id,
      }),
    );
    const pc = f.store.read(f.workspaceId, (tx) => tx.roles.polarisChecks(role.id, { order: 'desc' }).items[0]);
    expect(pc).toMatchObject({ proactive_send_id: send.id, balance_minor_at: 1234, audit_display_id: ev.display_id });
    // hạng = v_leaderboard của chính giao dịch (Role nháp chưa lên bảng ⇒ null) — không bao giờ lấy từ input
    const lb = f.store.read(f.workspaceId, (tx) => tx.wallet.leaderboard().find((r) => r.role_id === role.id));
    expect(pc?.rank_at ?? null).toBe((lb?.rank as number | undefined) ?? null);
  });
});

it('DbRuleError permission.denied có mã API ổn định (db.rule_violation)', () => {
  try {
    as(roleActor, (tx) => tx.settings.set('avatar.transient_seconds', 30));
  } catch (e) {
    expect(e).toBeInstanceOf(DbRuleError);
    expect((e as DbRuleError).code).toBe('db.rule_violation');
  }
});
