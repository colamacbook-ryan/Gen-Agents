// Chuỗi middleware cố định (src/http/pipeline.ts): từng rào có ca âm riêng + đối chứng dương.
import { API_LIMITS, isSettingKey, routeById, SETTINGS, settingWritableBy, TurnRejectedError } from '@ga/contracts';
import { DbRuleError } from '@ga/db/repos';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AuthenticateResult } from '../../src/auth/index.ts';
import { defineHandler, type Handler } from '../../src/http/define-handler.ts';
import { ApiError } from '../../src/http/errors.ts';
import { DEMO_HANDLERS, demoLedger } from './demo-handlers.ts';
import { type CallInput, makeTestApp, type TestApp, type TestWorld, tk } from './harness.ts';

let world: TestWorld;
beforeAll(() => {
  world = tk.makeWorld();
});
afterAll(() => world.close());

const demo = (id: string): Handler => {
  const h = DEMO_HANDLERS.find((x) => x.route.id === id);
  if (!h) throw new Error(id);
  return h;
};
const roleOf = (tenant: 'A' | 'B') => {
  const seed = tk.CROSS_TENANT_SEEDERS.RL;
  if (!seed) throw new Error('RL');
  return seed({ world, tenant: world.tenants[tenant], seeded: new Map() });
};

describe('validate response (bước 13) — mọi chế độ, không lộ giá trị', () => {
  it('handler trả thừa trường (password_hash) ⇒ 500 internal; log có route + đường dẫn, KHÔNG có giá trị', async () => {
    const leakValue = `argon2id$v=19$${'x'.repeat(30)}`;
    const leaky = defineHandler('SYS-10', () => [
      {
        engineSlug: 'x',
        selectable: true,
        reenableBinding: null,
        needsConsent: false,
        blockedReason: null,
        password_hash: leakValue,
      } as never,
    ]);
    const t = makeTestApp({ handlers: [leaky], world });
    const res = await t.as('A.owner').call('SYS-10');
    expect(res.status).toBe(500);
    expect(res.code).toBe('internal');
    expect(res.text).not.toContain(leakValue);
    expect(res.text).not.toContain('password_hash');
    const log = t.logger.entries.find((e) => e.event === 'http.response_invalid');
    expect(log?.fields.routeId).toBe('SYS-10');
    expect(log?.fields.issue).toBe('unrecognized_keys');
    expect(t.logger.entries.map((e) => e.line).join('\n')).not.toContain(leakValue);
  });

  it('sai kiểu trường ⇒ 500, log đường dẫn zod', async () => {
    const bad = defineHandler('OPS-01', () => ({ status: 'nope', version: '1', components: {} }) as never);
    const t = makeTestApp({ handlers: [bad], world });
    const res = await t.as('anon').call('OPS-01');
    expect(res.status).toBe(500);
    expect(t.logger.entries.find((e) => e.event === 'http.response_invalid')?.fields.path).toBe('status');
  });

  it('route 204 trả thân ⇒ 500; route JSON trả đúng ⇒ đúng status của hợp đồng (202 của WRK-43)', async () => {
    const bad = defineHandler('SYS-05', () => ({ x: 1 }) as never);
    const t = makeTestApp({ handlers: [bad, demo('WRK-43')], world });
    t.recovery.setSetup();
    expect((await t.as('A.owner').call('SYS-05')).status).toBe(500);
    const ok = await t.as('A.owner').call('WRK-43', { body: {} });
    expect(ok.status).toBe(202);
    expect(ok.json).toEqual({ job: { jobDisplayId: 'JB-0001', state: 'queued' } });
  });
});

describe('phong bì lỗi', () => {
  const thrower = (err: () => unknown) =>
    defineHandler('SYS-10', () => {
      throw err();
    });
  it('lỗi lạ ⇒ 500 internal, KHÔNG lộ message / stack; log đã che chuỗi giống credential', async () => {
    const secretish = ['sk', 'ant', 'api03', 'Z'.repeat(40)].join('-');
    const t = makeTestApp({ handlers: [thrower(() => new Error(`boom ${secretish} /etc/passwd`))], world });
    const res = await t.as('A.owner').call('SYS-10');
    expect(res.status).toBe(500);
    expect(res.json).toEqual({
      error: { code: 'internal', i18nKey: 'errors.internal', requestId: expect.any(String) },
    });
    expect(res.text).not.toContain('boom');
    expect(res.text).not.toContain('/etc/passwd');
    const { formatLogLine } = await import('../../src/http/logger.ts');
    const entry = t.logger.entries.find((e) => e.event === 'http.unhandled_error');
    expect(entry).toBeDefined();
    expect(formatLogLine('error', 'x', entry?.fields)).not.toContain(secretish);
  });

  it('DbRuleError ⇒ mã ổn định + HTTP của contracts; detail.reason = rule; chuỗi DB không ra client', async () => {
    const t = makeTestApp({
      handlers: [
        thrower(() => new DbRuleError('role.wounded', 'x', { dbMessage: 'Role đang Trọng thương: chi tiết DB' })),
      ],
      world,
    });
    const res = await t.as('A.owner').call('SYS-10');
    expect(res.status).toBe(409);
    expect(res.code).toBe('db.wounded');
    expect(res.detail).toEqual({ reason: 'role.wounded' });
    expect(res.text).not.toContain('Trọng thương');
  });

  it('repo not_found ⇒ 404 không detail (không oracle tồn tại)', async () => {
    const t = makeTestApp({
      handlers: [thrower(() => new DbRuleError('repo.invalid_ref', 'roles X thuộc tenant khác'))],
      world,
    });
    const res = await t.as('A.owner').call('SYS-10');
    expect(res.status).toBe(404);
    expect(res.detail).toBeNull();
    expect(res.text).not.toContain('tenant');
  });

  it('ApiError giữ mã + detail; TurnRejectedError ⇒ 409 turn.rejected + reason', async () => {
    const t1 = makeTestApp({
      handlers: [thrower(() => new ApiError('gate.card_blocked', { reason: 'no_card' }))],
      world,
    });
    const r1 = await t1.as('A.owner').call('SYS-10');
    expect([r1.status, r1.code, r1.detail]).toEqual([409, 'gate.card_blocked', { reason: 'no_card' }]);
    const t2 = makeTestApp({ handlers: [thrower(() => new TurnRejectedError('wounded'))], world });
    const r2 = await t2.as('A.owner').call('SYS-10');
    expect([r2.status, r2.code, r2.detail]).toEqual([409, 'turn.rejected', { reason: 'wounded' }]);
  });

  it('lỗi validate: chỉ phần + khoá ĐÃ KHAI, không lặp giá trị', async () => {
    const t = makeTestApp({ handlers: [demo('SYS-34')], world });
    const role = roleOf('A');
    const res = await t.as('A.owner').call('SYS-34', { params: { roleRef: role.displayId }, body: { name: 7 } });
    expect(res.status).toBe(400);
    expect(res.detail).toEqual({ reason: 'invalid_type', field: 'body.name' });
    const bad = await t.as('A.owner').call('SYS-34', { params: { roleRef: 'not-a-ref<script>' }, body: { name: 'x' } });
    expect(bad.status).toBe(400);
    expect(bad.text).not.toContain('script');
  });
});

describe('route chưa mount / method lạ / OPTIONS ⇒ 404, không CORS', () => {
  it('404 phong bì not_found + header bảo mật', async () => {
    const t = makeTestApp({ handlers: [demo('OPS-01')], world });
    for (const [m, p] of [
      ['GET', '/api/v1/roles'],
      ['POST', '/api/v1/health'],
      ['OPTIONS', '/api/v1/health'],
      ['GET', '/api/v1/nope'],
      ['GET', '/'],
    ] as const) {
      const res = await t.raw(new Request(`${t.base}${p}`, { method: m, headers: { origin: 'https://evil.example' } }));
      expect(res.status, `${m} ${p}`).toBe(404);
      expect(res.code).toBe('not_found');
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    }
  });
});

describe('thân request', () => {
  let t: TestApp;
  beforeAll(() => {
    t = makeTestApp({ handlers: [demo('SYS-34')], world });
  });
  const role = () => roleOf('A').displayId;
  it('sai content-type ⇒ 400; JSON hỏng ⇒ 400; UTF-8 hỏng ⇒ 400; __proto__ ⇒ 400 (strict)', async () => {
    const params = { roleRef: role() };
    const cases: Array<[string, string | Uint8Array, string]> = [
      ['text/plain', '{"name":"x"}', 'content_type'],
      ['application/x-www-form-urlencoded', 'name=x', 'content_type'],
      ['application/json', '{"name":', 'json'],
      ['application/json', new Uint8Array([0x7b, 0x22, 0xff, 0xfe, 0x22, 0x7d]), 'encoding'],
    ];
    for (const [ct, raw, reason] of cases) {
      const res = await t.as('A.owner').call('SYS-34', { params, rawBody: raw, headers: { 'content-type': ct } });
      expect(res.status, ct).toBe(400);
      expect(res.detail?.reason).toBe(reason);
    }
    const proto = await t.as('A.owner').call('SYS-34', {
      params,
      rawBody: '{"name":"x","__proto__":{"admin":true}}',
      headers: { 'content-type': 'application/json' },
    });
    expect(proto.status).toBe(400);
    expect(t.calls.get('SYS-34') ?? 0).toBe(0);
  });
  it('đúng trần (= bodyBytes) vẫn đọc được tới bước validate (400 vì sai schema, không phải 413)', async () => {
    const pad = 'a'.repeat(API_LIMITS.bodyBytes - 11);
    const raw = `{"name":"${pad}"}`;
    expect(new TextEncoder().encode(raw).byteLength).toBe(API_LIMITS.bodyBytes);
    const res = await t
      .as('A.owner')
      .call('SYS-34', { params: { roleRef: role() }, rawBody: raw, headers: { 'content-type': 'application/json' } });
    expect(res.status).toBe(400);
    expect(res.code).toBe('validation.failed');
    const over = await t.as('A.owner').call('SYS-34', {
      params: { roleRef: role() },
      rawBody: `${raw} `,
      headers: { 'content-type': 'application/json' },
    });
    expect(over.status).toBe(413);
  });
  it('tham số query trùng ⇒ 400', async () => {
    const t2 = makeTestApp({ handlers: [demo('SYS-16')], world });
    const res = await t2.raw(
      new Request(`${t2.base}/api/v1/threads?kind=interview&kind=training`, {
        headers: { cookie: world.user('A.owner').cookie },
      }),
    );
    expect(res.status).toBe(400);
    expect(res.detail?.reason).toBe('query_duplicate');
  });
});

describe('cổng đổi mật khẩu', () => {
  it('must_change_password ⇒ 403 ở route thường, handler không chạy', async () => {
    const t = makeTestApp({ handlers: [demo('SYS-81')], world });
    world.setMustChangePassword('A.viewer', true);
    try {
      const res = await t.as('A.viewer').call('SYS-81');
      expect(res.status).toBe(403);
      expect(res.code).toBe('auth.must_change_password');
      expect(t.calls.get('SYS-81') ?? 0).toBe(0);
    } finally {
      world.setMustChangePassword('A.viewer', false);
    }
    expect((await t.as('A.viewer').call('SYS-81')).status).toBe(200);
  });
});

describe('lớp CSRF RIÊNG của edge (không dựa vào L-SEC)', () => {
  // AuthService giả KHÔNG kiểm CSRF: chứng minh edge tự chặn theo registry (requiresCsrf) — rào kép.
  const lax = (who: 'A.owner' | 'A.admin') => ({
    authenticate: (): AuthenticateResult => {
      const u = world.user(who);
      return {
        ok: true,
        ctx: {
          userId: u.userId,
          sessionId: u.sessionId,
          tokenHash: u.tokenHash,
          username: u.username,
          mustChangePassword: false,
          csrfToken: u.csrf,
        },
      };
    },
  });
  it.each(['PATCH', 'POST', 'DELETE'] as const)('%s thiếu / sai CSRF ⇒ 403 dù phiên hợp lệ', async (method) => {
    const id = { PATCH: 'OPS-03', POST: 'SYS-34', DELETE: 'SYS-05' }[method];
    const t = makeTestApp({ handlers: [demo(id)], world, auth: lax('A.owner') });
    t.recovery.setSetup();
    const inputs: Record<string, CallInput> = {
      'OPS-03': { params: { settingKey: 'purge.grace_days' }, body: { value: 30 } },
      'SYS-34': { params: { roleRef: roleOf('A').displayId }, body: { name: 'x' } },
      'SYS-05': {},
    };
    const call = (csrf: false | string) => t.as('A.owner').call(id, { ...inputs[id], csrf });
    for (const bad of [false, 'x'.repeat(43), world.user('B.owner').csrf] as const) {
      const res = await call(bad);
      expect(res.status, `${method} ${String(bad).slice(0, 6)}`).toBe(403);
      expect(res.code).toBe('auth.csrf');
    }
    expect(t.calls.get(id) ?? 0).toBe(0);
    const ok = await call(world.user('A.owner').csrf);
    expect(ok.status, ok.text).toBeLessThan(300);
  });
});

describe('ownerWhen: thô + đã validate', () => {
  it('WRK-14 enabled=true ⇒ admin 403; false ⇒ admin qua; "true" (chuỗi) ⇒ 400 (không lách được)', async () => {
    const t = makeTestApp({ handlers: [demo('WRK-14')], world });
    const params = { roleRef: roleOf('A').displayId };
    expect((await t.as('A.admin').call('WRK-14', { params, body: { enabled: true } })).status).toBe(403);
    expect((await t.as('A.owner').call('WRK-14', { params, body: { enabled: true } })).status).toBe(200);
    expect((await t.as('A.admin').call('WRK-14', { params, body: { enabled: false } })).status).toBe(200);
    expect((await t.as('A.admin').call('WRK-14', { params, body: { enabled: 'true' } })).status).toBe(400);
  });
  it('OPS-08 egress_loosen (trạng thái ĐÃ LƯU): không hook ⇒ admin 403; hook allow ⇒ admin qua; hook deny ⇒ 403', async () => {
    const del = (stored?: 'allow' | 'deny') =>
      stored === undefined
        ? defineHandler('OPS-08', () => undefined)
        : defineHandler('OPS-08', () => undefined, { stored: () => ({ egressAction: stored }) });
    const call = (h: Handler, who: 'A.admin' | 'A.owner') =>
      makeTestApp({ handlers: [h], world })
        .as(who)
        .call('OPS-08', { params: { egressRef: 'EG-0001' } });
    expect((await call(del(), 'A.admin')).status).toBe(403);
    const ow = await call(del(), 'A.owner');
    expect(ow.status, ow.text).toBe(204);
    expect((await call(del('allow'), 'A.admin')).status).toBe(204);
    expect((await call(del('deny'), 'A.admin')).status).toBe(403);
  });
  it('OPS-03 khoá admin không ghi được ⇒ admin 403; khoá admin ghi được ⇒ qua; khoá lạ ⇒ chỉ owner', async () => {
    const t = makeTestApp({ handlers: [demo('OPS-03')], world });
    const call = (who: 'A.admin' | 'A.owner', settingKey: string) =>
      t.as(who).call('OPS-03', { params: { settingKey }, body: { value: 1 } });
    expect((await call('A.admin', 'backup.remote_anchor')).status).toBe(403);
    const adminKey = Object.keys(SETTINGS).find((k) => isSettingKey(k) && settingWritableBy(k, 'admin'));
    if (!adminKey) throw new Error('registry SETTINGS không có khoá admin ghi được');
    expect((await call('A.admin', adminKey)).status).toBe(200);
    expect((await call('A.admin', 'no.such_key')).status).toBe(403);
    expect((await call('A.owner', 'no.such_key')).status).toBe(200);
  });
});

describe('RecoveryGuard fail-closed', () => {
  it('KHÔNG có provider ⇒ coi như recovery: route blocked 423, route open qua', async () => {
    const t = makeTestApp({ handlers: [demo('SYS-34'), demo('SYS-81')], world, recovery: null });
    const blocked = await t
      .as('A.owner')
      .call('SYS-34', { params: { roleRef: roleOf('A').displayId }, body: { name: 'x' } });
    expect(blocked.status).toBe(423);
    expect(t.calls.get('SYS-34') ?? 0).toBe(0);
    expect((await t.as('A.owner').call('SYS-81')).status).toBe(200);
  });
  it('provider ném lỗi ⇒ recovery', async () => {
    const t = makeTestApp({ handlers: [demo('SYS-34')], world });
    t.recovery.throwOnState = true;
    const res = await t
      .as('A.owner')
      .call('SYS-34', { params: { roleRef: roleOf('A').displayId }, body: { name: 'x' } });
    expect(res.status).toBe(423);
  });
  it('route core: provider nhận input ĐÃ validate; false ⇒ 423, true ⇒ qua', async () => {
    const t = makeTestApp({ handlers: [demo('GW-05')], world });
    t.recovery.setRecovery('login_expired');
    const role = roleOf('A');
    expect((await t.as('A.owner').call('GW-05', { query: { consumer: role.displayId } })).status).toBe(423);
    expect(t.recovery.coreCalls.at(-1)).toMatchObject({ routeId: 'GW-05', workspaceId: world.tenants.A.workspaceId });
    t.recovery.coreTarget = true;
    expect((await t.as('A.owner').call('GW-05', { query: { consumer: role.displayId } })).status).toBe(200);
    // input sai ⇒ 400 trước khi hỏi provider
    const n = t.recovery.coreCalls.length;
    expect((await t.as('A.owner').call('GW-05', { query: { consumer: '<x>' } })).status).toBe(400);
    expect(t.recovery.coreCalls.length).toBe(n);
  });
  it('recovery theo workspace: A recovery không chặn B', async () => {
    const t = makeTestApp({ handlers: [demo('SYS-34')], world });
    t.recovery.setRecovery('outage', world.tenants.A.workspaceId);
    expect(
      (await t.as('A.owner').call('SYS-34', { params: { roleRef: roleOf('A').displayId }, body: { name: 'x' } }))
        .status,
    ).toBe(423);
    expect(
      (await t.as('B.owner').call('SYS-34', { params: { roleRef: roleOf('B').displayId }, body: { name: 'x' } }))
        .status,
    ).toBe(200);
  });
});

describe('idempotency (WRK-24)', () => {
  let t: TestApp;
  let roleRef: string;
  beforeEach(() => {
    t = makeTestApp({ handlers: [demo('WRK-24')], world });
    roleRef = roleOf('A').displayId;
  });
  const call = (who: 'A.owner' | 'A.admin', key: string, body: unknown, ref = roleRef) =>
    t.as(who).call('WRK-24', { params: { roleRef: ref }, body, headers: { 'idempotency-key': key } });

  it('cùng khoá + cùng body ⇒ phát lại ĐÚNG kết quả cũ, handler chỉ chạy một lần', async () => {
    const body = { amountMinor: 100, reason: 'thưởng' };
    const a = await call('A.owner', 'key-replay-0001', body);
    const b = await call('A.owner', 'key-replay-0001', { reason: 'thưởng', amountMinor: 100 });
    expect(a.status).toBe(200);
    expect(b.json).toEqual(a.json);
    expect(b.headers.get('idempotency-replayed')).toBe('true');
    expect(t.calls.get('WRK-24')).toBe(1);
  });
  it('cùng khoá + khác body ⇒ 409 idempotency.conflict, KHÔNG phát lại kết quả cũ', async () => {
    const a = await call('A.owner', 'key-conflict-01', { amountMinor: 100, reason: 'x' });
    const b = await call('A.owner', 'key-conflict-01', { amountMinor: 999, reason: 'x' });
    expect(b.status).toBe(409);
    expect(b.code).toBe('idempotency.conflict');
    expect(b.text).not.toContain(JSON.stringify(a.json));
  });
  it('cùng khoá + khác path param ⇒ 409', async () => {
    await call('A.owner', 'key-param-0001', { amountMinor: 1, reason: 'x' });
    const other = roleOf('A').displayId;
    expect((await call('A.owner', 'key-param-0001', { amountMinor: 1, reason: 'x' }, other)).status).toBe(409);
  });
  it('không gian khoá theo actor: actor khác dùng cùng khoá ⇒ chạy độc lập', async () => {
    const before = demoLedger.seq;
    await call('A.owner', 'key-actor-00001', { amountMinor: 1, reason: 'x' });
    const b = await call('A.admin', 'key-actor-00001', { amountMinor: 1, reason: 'x' });
    expect(b.status).toBe(200);
    expect(b.headers.get('idempotency-replayed')).toBeNull();
    expect(demoLedger.seq).toBe(before + 2);
  });
  it('thiếu khoá ⇒ 400; khoá có ":" (tiền tố dành riêng của DB) ⇒ 400', async () => {
    const r = routeById('WRK-24');
    expect(r?.idempotent).toBe(true);
    const none = await t.as('A.owner').call('WRK-24', {
      params: { roleRef },
      body: { amountMinor: 1, reason: 'x' },
      headers: { 'idempotency-key': '' },
    });
    expect(none.status).toBe(400);
    const reserved = await call('A.owner', `activate:${'0'.repeat(10)}`, { amountMinor: 1, reason: 'x' });
    expect(reserved.status).toBe(400);
    expect(t.calls.get('WRK-24') ?? 0).toBe(0);
  });
  it('handler lỗi ⇒ không lưu, thử lại cùng khoá chạy lại', async () => {
    const bad = makeTestApp({ handlers: [demo('WRK-24')], world });
    const missing = 'RL-9999';
    const r1 = await bad.as('A.owner').call('WRK-24', {
      params: { roleRef: missing },
      body: { amountMinor: 1, reason: 'x' },
      headers: { 'idempotency-key': 'key-retry-0001' },
    });
    expect(r1.status).toBe(404);
    const r2 = await bad.as('A.owner').call('WRK-24', {
      params: { roleRef: missing },
      body: { amountMinor: 1, reason: 'x' },
      headers: { 'idempotency-key': 'key-retry-0001' },
    });
    expect(r2.status).toBe(404);
    expect(bad.calls.get('WRK-24')).toBe(2);
  });
});

describe('ctx: actor của phiên, ref trong workspace, write bằng actor của phiên, bus theo workspace', () => {
  it('ctx.ref: display_id / ULID của A ⇒ thấy; ULID của B ⇒ 404; ULID của bảng khác prefix ⇒ 404; prefix sai ⇒ 404', async () => {
    const t = makeTestApp({ handlers: [demo('SYS-34')], world });
    const mine = roleOf('A');
    const theirs = roleOf('B');
    const call = (roleRef: string) => t.as('A.owner').call('SYS-34', { params: { roleRef }, body: { name: 'x' } });
    expect((await call(mine.displayId)).json).toEqual({ role: { id: mine.id, displayId: mine.displayId } });
    expect((await call(mine.id)).status).toBe(200);
    expect((await call(theirs.id)).status).toBe(404);
    // ULID của workspace (bảng khác) / của actor A (bảng actors) — không phải hàng roles
    expect((await call(world.tenants.A.workspaceId)).status).toBe(404);
    expect((await call(world.user('A.owner').actorId)).status).toBe(404);
    // display_id hợp lệ nhưng prefix khác ⇒ 404 (không phải 400)
    const wrong = await call('TK-0001');
    expect([wrong.status, wrong.code]).toEqual([404, 'not_found']);
  });

  it('ctx.write ghi bằng actor của phiên (app_actor), ctx.read đúng workspace, events theo workspace của phiên', async () => {
    const seen: Array<{ actorId: string; ws: string; txActor: string }> = [];
    const h = defineHandler('SYS-34', ({ params }, ctx) => {
      const role = ctx.ref('RL', params.roleRef);
      const txActor = ctx.write((tx) => tx.actorId);
      const ws = ctx.read((tx) => tx.workspaceId);
      seen.push({ actorId: ctx.actor.id, ws, txActor });
      ctx.events.publish({ type: 'attention.changed', count: 1, maxSeverity: 'warn' });
      return { role: { id: role.id, displayId: role.displayId } };
    });
    const t = makeTestApp({ handlers: [h], world });
    const subA = t.events.subscribe(world.tenants.A.workspaceId, {
      userId: world.user('A.owner').userId,
      authLevel: 'O',
    });
    const subB = t.events.subscribe(world.tenants.B.workspaceId, {
      userId: world.user('B.owner').userId,
      authLevel: 'O',
    });
    const res = await t.as('A.admin').call('SYS-34', {
      params: { roleRef: roleOf('A').displayId },
      body: { name: 'x' },
      headers: { 'x-ga-workspace-id': world.tenants.B.workspaceId },
    });
    expect(res.status).toBe(200);
    expect(seen).toEqual([
      {
        actorId: world.user('A.admin').actorId,
        ws: world.tenants.A.workspaceId,
        txActor: world.user('A.admin').actorId,
      },
    ]);
    const ev = await subA.next();
    expect(ev.value?.workspaceId).toBe(world.tenants.A.workspaceId);
    subB.close();
    expect((await subB.next()).done).toBe(true);
    subA.close();
  });

  it('route public: ctx.actor / read / write / ref ném ⇒ 500 (không có actor rỗng)', async () => {
    const h = defineHandler('OPS-01', (_i, ctx) => {
      ctx.read(() => 1);
      return { status: 'ok', version: '1', components: { db: 'ok', supervisor: 'ok', updater: 'ok' } };
    });
    const t = makeTestApp({ handlers: [h], world });
    expect((await t.as('anon').call('OPS-01')).status).toBe(500);
  });
});
