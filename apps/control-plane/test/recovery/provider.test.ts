// RecoveryProvider THẬT (v_core_agent_status) + SYS-08: O4 tính từ DB, mặc định fail-closed, đích Core agent tra theo ref.
import { routeById } from '@ga/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defineHandler } from '../../src/http/define-handler.ts';
import { sysHandlers } from '../../src/onboarding/sys-handlers.ts';
import { createDbRecoveryProvider } from '../../src/recovery/provider.ts';
import { makeTestApp, type TestApp } from '../http/harness.ts';

let t: TestApp;
let provider: ReturnType<typeof createDbRecoveryProvider>;
const route = (id: string) => {
  const r = routeById(id);
  if (!r) throw new Error(id);
  return r;
};

// Handler tối thiểu cho một route `o4 = core` (GW-15) — chỉ để kiểm guard với provider thật; SYS-16 (blocked) là handler thật.
const probeHandlers = [
  defineHandler('GW-15', () => ({ probe: { id: '01J00000000000000000000000', displayId: 'PB-0001' } }) as never),
];

beforeAll(() => {
  t = makeTestApp({ handlers: [...sysHandlers, ...probeHandlers], recovery: null });
  provider = createDbRecoveryProvider({ store: t.world.store, reader: t.world.reader });
});
afterAll(() => t.close());

const A = () => t.world.tenants.A;
const coreAccount = () => {
  const acc = A().handle.coreAccount;
  if (!acc) throw new Error('fixture: tenant A không có tài khoản Core agent');
  return acc;
};

describe('state()', () => {
  it('Core agent sẵn sàng ⇒ ok', () => {
    expect(provider.state(A().workspaceId)).toEqual({ mode: 'ok', reason: null });
  });

  it('workspace không có hàng view ⇒ recovery (fail-closed), không ném ra ngoài', () => {
    expect(provider.state('01J9ZZZZZZZZZZZZZZZZZZZZZZ')).toEqual({ mode: 'recovery', reason: 'status_error' });
  });
});

describe('isCoreAgentTarget()', () => {
  const ws = () => A().workspaceId;
  it('accountRef = tài khoản Core agent (ULID hoặc display_id) ⇒ true', () => {
    const acc = coreAccount();
    for (const ref of [acc.id, acc.display_id]) {
      expect(
        provider.isCoreAgentTarget({
          workspaceId: ws(),
          route: route('GW-15'),
          params: { accountRef: ref },
          query: undefined,
          body: undefined,
        }),
      ).toBe(true);
    }
  });

  it('tài khoản KHÔNG có binding Hệ thống ⇒ false; tài khoản của tenant B ⇒ ném (guard coi là chặn)', () => {
    const other = t.world.store.write(
      A().users.owner.actorId,
      (tx) => {
        const engine = tx.engines.engine(A().handle.coreEngine);
        if (engine === null) throw new Error('engine');
        const consent =
          engine.requires_consent === 1
            ? tx.engines.grantConsent({
                userId: A().users.owner.userId,
                consentKind: 'engine_tos_risk',
                subject: engine.slug,
                noticeVersion: engine.tos_notice_version,
                noticeHash: 'sha256:test-notice',
              })
            : null;
        return tx.engines.createAccount({
          engineSlug: engine.slug,
          label: 'Phụ',
          authMethod: 'subscription',
          authVolume: 'ga-auth-test-extra',
          consentId: consent?.id ?? null,
        });
      },
      { channel: 'web' },
    );
    const input = (accountRef: string) => ({
      workspaceId: ws(),
      route: route('GW-15'),
      params: { accountRef },
      query: undefined,
      body: undefined,
    });
    expect(provider.isCoreAgentTarget(input(other.id))).toBe(false);
    const bAcc = t.world.tenants.B.handle.coreAccount;
    if (!bAcc) throw new Error('fixture B');
    expect(() => provider.isCoreAgentTarget(input(bAcc.id))).toThrow();
  });

  it('route core không có accountRef: chỉ route danh sách tự lọc (GW-05) ⇒ true; route khác ⇒ false', () => {
    const base = { workspaceId: ws(), params: {}, query: {}, body: undefined };
    expect(provider.isCoreAgentTarget({ ...base, route: route('GW-05') })).toBe(true);
    expect(provider.isCoreAgentTarget({ ...base, route: route('GW-15') })).toBe(false);
  });
});

describe('qua edge với provider thật (sự cố hãng ⇒ recovery)', () => {
  it('ok ⇒ SYS-16 chạy; outage ⇒ SYS-16 423, SYS-08 mode recovery + reason outage, GW-15 chỉ mở cho tài khoản Core agent', async () => {
    const app = makeTestApp({
      handlers: [...sysHandlers, ...probeHandlers],
      world: t.world,
      recovery: provider,
    });
    expect((await app.as('A.owner').call('SYS-16', { query: {} })).status).toBe(200);
    const acc = coreAccount();
    t.world.store.write(A().systemActorId, (tx) => tx.engines.recordOutage(acc.id, t.world.clock.now().toISOString()));
    try {
      const blocked = await app.as('A.owner').call('SYS-16', { query: {} });
      expect(blocked.status).toBe(423);
      expect(blocked.code).toBe('recovery.blocked');
      const st = await app.as('A.viewer').call('SYS-08');
      expect(st.status, st.text).toBe(200);
      const body = st.json as {
        mode: string;
        reason: string | null;
        isIncident: boolean;
        account: { id: string } | null;
      };
      expect(body.mode).toBe('recovery');
      expect(body.reason).toBe('outage');
      expect(body.isIncident).toBe(true);
      expect(body.account?.id).toBe(acc.id);
      expect(JSON.stringify(st.json)).not.toMatch(/reason_text|overlay_text|Chờ hãng/);
      // tenant B vẫn ok (O4 theo workspace của phiên)
      expect((await app.as('B.owner').call('SYS-16', { query: {} })).status).toBe(200);
    } finally {
      t.world.store.write(A().systemActorId, (tx) => tx.engines.recordOutage(acc.id, null));
    }
  });
});
