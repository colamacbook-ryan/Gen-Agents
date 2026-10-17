import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { routeById, TurnRejectedError } from '@ga/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildPath,
  CROSS_TENANT_SEEDERS,
  CredentialLeakError,
  coverageReport,
  FakeRecoveryProvider,
  FakeSessionsService,
  formatCoverage,
  makeClient,
  makeWorld,
  missingSeederPrefixes,
  O4_REASONS,
  type TestWorld,
} from '../src/index.ts';

const route = (id: string) => {
  const r = routeById(id);
  if (!r) throw new Error(id);
  return r;
};

describe('O4_REASONS = mọi lý do của v_core_agent_status (DB)', () => {
  it('parity với db/spec/views_v2_2.sql (CASE reason_text)', () => {
    const sql = readFileSync(fileURLToPath(new URL('../../../db/spec/views_v2_2.sql', import.meta.url)), 'utf8');
    const start = sql.indexOf('CREATE VIEW v_core_agent_status');
    const block = sql.slice(start, sql.indexOf('END AS reason_text', start));
    const fromDb = [...block.matchAll(/WHEN '([a-z_]+)' THEN/g)].map((m) => m[1]);
    expect(new Set(fromDb)).toEqual(new Set(O4_REASONS));
  });
});

describe('FakeRecoveryProvider', () => {
  it('mặc định ok; setRecovery(lý do) toàn cục hoặc theo workspace; throwOnState', () => {
    const p = new FakeRecoveryProvider();
    expect(p.state('W1')).toEqual({ mode: 'ok', reason: null });
    p.setRecovery('outage');
    expect(p.state('W1')).toEqual({ mode: 'recovery', reason: 'outage' });
    p.setOk().setRecovery('quota_exhausted', 'W2');
    expect(p.state('W1').mode).toBe('ok');
    expect(p.state('W2')).toEqual({ mode: 'recovery', reason: 'quota_exhausted' });
    p.throwOnState = true;
    expect(() => p.state('W1')).toThrow();
  });
});

describe('FakeSessionsService (contracts/sessions.ts)', () => {
  const req = {
    workspaceId: '01JABCDEFGHJKMNPQRSTVWXYZ0',
    agentKind: 'interviewer' as const,
    trigger: 'chat' as const,
    roleId: null,
    taskId: null,
    threadId: null,
    sourceMessageId: null,
    idempotencyKey: 'k1',
    timeoutMs: null,
    measure: null,
  };
  it('lượt mặc định ok + ghi lại request; kịch bản từ chối ném TurnRejectedError; request sai ⇒ ném', async () => {
    const s = new FakeSessionsService().script({ reject: 'recovery_mode' });
    await expect(s.runTurn(req)).rejects.toBeInstanceOf(TurnRejectedError);
    const h = await s.runTurn(req);
    expect((await h.result).status).toBe('ok');
    const evs = [];
    for await (const e of h.events) evs.push(e);
    expect(evs).toEqual([]);
    expect(s.calls).toHaveLength(2);
    await expect(s.runTurn({ ...req, trigger: 'baseline' })).rejects.toThrow();
  });
});

describe('client + seeder + coverage', () => {
  let w: TestWorld;
  beforeAll(() => {
    w = makeWorld();
  });
  afterAll(() => w.close());

  it('buildPath: /api/v1 + params (encode); thiếu param ⇒ ném', () => {
    expect(buildPath(route('SYS-34'), { roleRef: 'RL-0001' })).toBe('/api/v1/roles/RL-0001/clone');
    expect(buildPath(route('SYS-34'), { roleRef: 'a/b' })).toBe('/api/v1/roles/a%2Fb/clone');
    expect(() => buildPath(route('SYS-34'))).toThrow(/roleRef/);
  });

  it('gắn cookie + CSRF + Origin cho method ghi của người đã đăng nhập; anon không gắn gì', async () => {
    const seen: Request[] = [];
    const c = makeClient(w, (req) => {
      seen.push(req);
      return new Response('{}', { headers: { 'content-type': 'application/json' } });
    });
    await c.as('A.admin').call('SYS-34', { params: { roleRef: 'RL-0001' }, body: { name: 'x' } });
    await c.as('anon').call('OPS-01');
    const [a, b] = seen as [Request, Request];
    expect(a.method).toBe('POST');
    expect(a.headers.get('cookie')).toBe(w.user('A.admin').cookie);
    expect(a.headers.get('x-ga-csrf')).toBe(w.user('A.admin').csrf);
    expect(a.headers.get('origin')).toBe(w.origin);
    expect(b.headers.get('cookie')).toBeNull();
    expect(b.headers.get('x-ga-csrf')).toBeNull();
  });

  it('route idempotent: tự sinh Idempotency-Key khác nhau mỗi lần', async () => {
    const keys: Array<string | null> = [];
    const c = makeClient(w, (req) => {
      keys.push(req.headers.get('idempotency-key'));
      return new Response(null, { status: 204 });
    });
    const body = { amountMinor: 1, reason: 'x' };
    await c.as('A.owner').call('WRK-24', { params: { roleRef: 'RL-0001' }, body });
    await c.as('A.owner').call('WRK-24', { params: { roleRef: 'RL-0001' }, body });
    expect(keys[0]).toMatch(/^idem-[0-9a-f]{16}$/);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('response JSON chứa chuỗi giống credential ⇒ CredentialLeakError (ca dương dựng lúc chạy)', async () => {
    const fake = ['sk', 'ant', 'api03', 'Q'.repeat(40)].join('-');
    const c = makeClient(
      w,
      () => new Response(JSON.stringify({ x: fake }), { headers: { 'content-type': 'application/json' } }),
    );
    await expect(c.as('anon').call('OPS-01')).rejects.toBeInstanceOf(CredentialLeakError);
    const c2 = makeClient(
      w,
      () =>
        new Response(JSON.stringify({ ['pass' + 'word']: 'x' }), { headers: { 'content-type': 'application/json' } }),
    );
    await expect(c2.as('anon').call('OPS-01')).rejects.toBeInstanceOf(CredentialLeakError);
  });

  it('seeder RL tạo Role THẬT trong đúng tenant (không thấy được từ tenant kia)', () => {
    const seed = CROSS_TENANT_SEEDERS.RL;
    if (!seed) throw new Error('thiếu seeder RL');
    const s = seed({ world: w, tenant: w.tenants.B, seeded: new Map() });
    expect(s.displayId).toMatch(/^RL-\d{4,}$/);
    const inB = w.store.read(w.tenants.B.workspaceId, (tx) => tx.roles.get(s.id));
    expect(inB?.id).toBe(s.id);
    expect(w.store.read(w.tenants.A.workspaceId, (tx) => tx.roles.get(s.id))).toBeNull();
  });

  it('coverage: đếm theo lane + liệt kê route đã mount mà thiếu seeder', () => {
    expect(missingSeederPrefixes(['RL'])).toEqual([]);
    expect(missingSeederPrefixes(['AT'])).toEqual(['AT']);
    const rep = coverageReport([route('SYS-34'), route('SYS-55'), route('OPS-01')]);
    expect(rep.total).toBe(201);
    expect(rep.implemented).toBe(3);
    expect(rep.lanes.find((l) => l.lane === 'L-HR')?.implemented).toBe(2);
    expect(rep.missingSeeders.some((m) => m.routeId === 'SYS-55' && m.prefixes.includes('AT'))).toBe(true);
    expect(rep.missingSeeders.some((m) => m.routeId === 'SYS-34')).toBe(false);
    expect(formatCoverage(rep)).toContain('3/201');
  });
});
