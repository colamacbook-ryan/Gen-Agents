// Fake DataStore (RAM) — hợp đồng tối thiểu M2 dựa vào: phạm vi tenant theo actor, display_id, rollback khi lỗi, version
// lạc quan, outbox job (dedupe 'queued', claim / lease), audit tự nối, seed thật áp được. Fake KHÔNG ép guard DB.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sequentialIds } from '../../src/ids/index.ts';
import { createFakeStore } from '../../src/repos/fake/index.ts';
import { DbRuleError } from '../../src/repos/index.ts';
import { verifySeedReference } from '../../src/seed/reference.ts';
import { FakeClock } from '../helpers.ts';

const SEED = verifySeedReference(
  JSON.parse(readFileSync(fileURLToPath(new URL('../../../../db/spec/seed_reference.json', import.meta.url)), 'utf8')),
);

function setup() {
  const clock = new FakeClock('2026-10-17T08:00:00.000Z');
  const store = createFakeStore({ clock, newId: sequentialIds('FKE') });
  store.installGlobal(SEED);
  const user = store.createUser({ username: 'owner', displayName: 'Owner', passwordHash: 'argon2id$x' });
  const t = store.createTenant({ slug: 'afi', name: 'Afi', shortCode: '7K2Q', ownerUserId: user.id }, SEED);
  return { clock, store, user, t };
}

describe('fake store', () => {
  it('cài global + tenant từ seed thật; owner; settings đọc qua schema contracts', () => {
    const { store, user, t } = setup();
    expect(user.display_id).toBe('US-0001');
    expect(store.tenants().map((w) => w.slug)).toEqual(['afi']);
    store.read(t.workspace.id, (tx) => {
      expect(tx.workspace.owner()?.user.id).toBe(user.id);
      expect(tx.settings.get('economy.initial_grant_minor')).toBe(100_000);
      const seeded = SEED.perWorkspace
        .find((x) => x.table === 'settings')
        ?.rows.find((r) => r.key === 'system.core_agent_engine')?.value_json;
      expect(tx.settings.get('system.core_agent_engine')).toBe(JSON.parse(String(seeded)));
      expect(tx.wallet.treasury().display_id).toBe('WL-0001');
      expect(tx.workspace.systemActor('scheduler').kind).toBe('system');
    });
    // seed lần hai không nhân đôi
    expect(store.ensureWorkspaceSeed(t.workspace.id, SEED).inserted).toBe(0);
  });

  it('ghi qua write(actor): display_id theo bộ đếm, *_by = actor, audit nối chuỗi', () => {
    const { store, t } = setup();
    const role = store.write(t.ownerActorId, (tx) => tx.roles.create({ name: 'Mai', color: 'jade' }), {
      channel: 'web',
      requestId: 'req-1',
    });
    expect(role.display_id).toBe('RL-0001');
    expect(role.created_by).toBe(t.ownerActorId);
    const settingRow = store.write(t.ownerActorId, (tx) => tx.settings.set('avatar.transient_seconds', 30));
    expect(settingRow.display_id).toBe('ST-0019');
    store.read(t.workspace.id, (tx) => {
      const audit = tx.audit.list().items;
      expect(audit.map((a) => a.action)).toEqual(['role.create', 'settings.set']);
      expect(audit[0]?.request_id).toBe('req-1');
      expect(audit[1]?.prev_hash).toBe(audit[0]?.row_hash);
      expect(tx.workspace.actorForRole(role.id)?.kind).toBe('role');
    });
  });

  it('lỗi giữa giao dịch ⇒ rollback toàn bộ (kể cả bộ đếm)', () => {
    const { store, t } = setup();
    expect(() =>
      store.write(t.ownerActorId, (tx) => {
        tx.roles.create({ name: 'A', color: 'jade' });
        throw new Error('boom');
      }),
    ).toThrow('boom');
    const r = store.write(t.ownerActorId, (tx) => tx.roles.create({ name: 'B', color: 'jade' }));
    expect(r.display_id).toBe('RL-0001');
  });

  it('phạm vi tenant: id của workspace khác ⇒ repo.not_found; actor lạ ⇒ repo.unknown_actor', () => {
    const { store, t, user } = setup();
    const role = store.write(t.ownerActorId, (tx) => tx.roles.create({ name: 'Mai', color: 'jade' }));
    const other = store.createTenant({ slug: 'b', name: 'B', shortCode: 'BBBB', ownerUserId: user.id }, SEED);
    store.read(other.workspace.id, (tx) => expect(tx.roles.get(role.id)).toBeNull());
    expect(() => store.write(other.ownerActorId, (tx) => tx.roles.update(role.id, { name: 'x' }))).toThrow(
      expect.objectContaining({ rule: 'repo.not_found' }),
    );
    expect(() => store.write('01JFKE0000000000000000ZZZZ', () => 1)).toThrow(
      expect.objectContaining({ rule: 'repo.unknown_actor' }),
    );
  });

  it('version lạc quan lệch ⇒ repo.version_conflict', () => {
    const { store, t } = setup();
    const role = store.write(t.ownerActorId, (tx) => tx.roles.create({ name: 'Mai', color: 'jade' }));
    store.write(t.ownerActorId, (tx) => tx.roles.update(role.id, { color: 'teal' }, role.version));
    expect(() =>
      store.write(t.ownerActorId, (tx) => tx.roles.update(role.id, { color: 'rose' }, role.version)),
    ).toThrow(DbRuleError);
  });

  it('jobs: dedupe trên queued, claim theo hạn + lease, fail → queued rồi dead', () => {
    const { store, t, clock } = setup();
    const sys = t.systemActorId;
    const a = store.write(sys, (tx) =>
      tx.jobs.enqueue({ kind: 'brain_sync', payload: { r: 1 }, dedupeKey: 'b:1', maxAttempts: 2 }),
    );
    const b = store.write(sys, (tx) => tx.jobs.enqueue({ kind: 'brain_sync', payload: { r: 1 }, dedupeKey: 'b:1' }));
    expect(b.deduped).toBe(true);
    expect(b.job.id).toBe(a.job.id);
    const [claimed] = store.write(sys, (tx) => tx.jobs.claim({ leaseOwner: 'w1', leaseMs: 1000 }));
    expect(claimed?.status).toBe('running');
    expect(store.write(sys, (tx) => tx.jobs.claim({ leaseOwner: 'w2', leaseMs: 1000 }))).toEqual([]);
    const failed = store.write(sys, (tx) => tx.jobs.fail(a.job.id, 'w1', { error: 'x', retryAfterMs: 500 }));
    expect(failed.status).toBe('queued');
    clock.advance(600);
    store.write(sys, (tx) => tx.jobs.claim({ leaseOwner: 'w1', leaseMs: 1000 }));
    clock.advance(2000);
    expect(store.write(sys, (tx) => tx.jobs.reapExpiredLeases())).toBe(1);
    expect(store.read(t.workspace.id, (tx) => tx.jobs.get(a.job.id)?.status)).toBe('dead');
  });

  it('ví: sổ kép cập nhật số dư; ví Role không âm', () => {
    const { store, t } = setup();
    const { role, w } = store.write(t.ownerActorId, (tx) => {
      const role = tx.roles.create({ name: 'Mai', color: 'jade' });
      return { role, w: tx.wallet.openRoleWallet(role.id) };
    });
    store.write(t.ownerActorId, (tx) =>
      tx.wallet.post({
        entryType: 'grant',
        debitWalletId: tx.wallet.treasury().id,
        creditWalletId: w.id,
        amountMinor: 500,
        reason: 'cấp',
        roleId: role.id,
      }),
    );
    expect(store.read(t.workspace.id, (tx) => tx.wallet.forRole(role.id)?.balance_minor)).toBe(500);
    expect(() =>
      store.write(t.ownerActorId, (tx) =>
        tx.wallet.post({
          entryType: 'penalty',
          debitWalletId: w.id,
          creditWalletId: tx.wallet.sink().id,
          amountMinor: 501,
          reason: 'phạt',
        }),
      ),
    ).toThrow(expect.objectContaining({ rule: 'ledger.insufficient_funds' }));
  });

  it('Telegram: hàng chủ sở hữu cuối không gỡ được', () => {
    const { store, t } = setup();
    const { owner } = store.write(t.ownerActorId, (tx) => {
      const role = tx.roles.create({ name: 'Mai', color: 'jade' });
      const bot = tx.telegram.createBot({
        roleId: role.id,
        botUsername: 'mai_bot',
        secretId: '01JFKE0000000000000000SEC1',
      });
      return { owner: tx.telegram.captureOwner(bot.id, { tgUserId: 42, displayName: 'Owner' }) };
    });
    expect(() => store.write(t.ownerActorId, (tx) => tx.telegram.removeAllowed(owner.id))).toThrow(
      expect.objectContaining({ rule: 'telegram.owner_invariant' }),
    );
  });

  it('read() không ghi được', () => {
    const { store, t } = setup();
    expect(() =>
      store.read(t.workspace.id, (tx) =>
        (tx as unknown as { roles: { create(i: unknown): unknown } }).roles.create({ name: 'x', color: 'jade' }),
      ),
    ).toThrow(/store.read/);
  });
});
