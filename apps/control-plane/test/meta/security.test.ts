// META-TEST BẢO MẬT — chạy trên MỌI route đã mount (handler PRODUCTION của các lane + handler demo cho id chưa có bản
// thật). Lane thêm handler ⇒ tự được kiểm, không phải viết lại. Mỗi ca chặn còn khẳng định handler KHÔNG chạy.
//   - không phiên ⇒ 401 · operator ⇒ 403 · viewer ở route A/O ⇒ 403 · admin ở route O / ownerWhen đúng điều kiện ⇒ 403
//   - method ghi thiếu / sai CSRF ⇒ 403
//   - từng lý do O4: route blocked / setup ⇒ 423; open ⇒ qua guard; core ⇒ chỉ khi đích là Core agent
//   - khoá lạ ở body / query, body ở route không nhận body ⇒ 400; body > trần (khai báo / nói dối / chunked) ⇒ 413
//   - CHÉO TENANT: mọi trường Ref (params / query / body) mang ref của tenant B ⇒ 404 (body / query: 404 hoặc 400), không
//     bao giờ 2xx; đối chứng: ref của chính tenant A ⇒ không 404 / 400 / 500. Prefix chưa có seeder ⇒ ĐỎ.
//   - mọi response JSON qua findCredentialLike (client testkit) + header bảo mật.
import {
  API_LIMITS,
  ApiErrorEnvelope,
  ENTITY_TYPES,
  type EntityPrefix,
  isSettingKey,
  type Route,
  requiresCsrf,
  SETTINGS,
  settingWritableBy,
} from '@ga/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Handler } from '../../src/http/define-handler.ts';
import { PRODUCTION_HANDLERS } from '../../src/http/handlers.ts';
import { DEMO_HANDLERS } from '../http/demo-handlers.ts';
import { type CallInput, type CallResult, makeTestApp, type TestApp, tk, type Who } from '../http/harness.ts';

const prodIds = new Set(PRODUCTION_HANDLERS.map((h) => h.route.id));
const HANDLERS: readonly Handler[] = [...PRODUCTION_HANDLERS, ...DEMO_HANDLERS.filter((h) => !prodIds.has(h.route.id))];
const ROUTES: readonly Route[] = HANDLERS.map((h) => h.route);
const each = ROUTES.map((r) => [r.id, r] as const);
const nonPublic = each.filter(([, r]) => r.auth !== 'public');

let t: TestApp;
beforeAll(() => {
  t = makeTestApp({ handlers: HANDLERS });
});
afterAll(() => t.close());

// ---------------------------------------------------------------- dữ liệu seed theo tenant
type Seeded = import('@ga/testkit').Seeded;
const seedCache = new Map<string, Seeded>();
function seedFor(tenant: 'A' | 'B', prefix: EntityPrefix, fresh = false): Seeded | null {
  const key = `${tenant}:${prefix}`;
  const cached = seedCache.get(key);
  if (cached && !fresh) return cached;
  const seeder = tk.CROSS_TENANT_SEEDERS[prefix];
  if (!seeder) return null;
  const s = seeder({ world: t.world, tenant: t.world.tenants[tenant], seeded: new Map() });
  if (!fresh) seedCache.set(key, s);
  return s;
}
/** Hàng mới của tenant B mà display_id KHÔNG trùng hàng nào của A (display_id đánh số theo workspace — trùng thì "RL-0001"
 *  hợp lệ trỏ tới hàng của CHÍNH A, không phải rò chéo tenant). */
function seedTheirs(prefix: EntityPrefix): Seeded {
  const table = ENTITY_TYPES[prefix];
  for (let i = 0; i < 64; i++) {
    const s = seedFor('B', prefix, true) as Seeded;
    const clash = t.world.reader.db
      .prepare(`SELECT 1 AS x FROM "${table}" WHERE workspace_id = ? AND display_id = ?`)
      .get(t.world.tenants.A.workspaceId, s.displayId);
    if (clash === undefined) return s;
  }
  throw new Error(`không seed được hàng ${prefix} của B có display_id khác A`);
}

const refForTenant =
  (tenant: 'A' | 'B') =>
  (prefixes: readonly EntityPrefix[] | '*'): string | undefined => {
    for (const p of tk.proofPrefixes(prefixes)) {
      const s = seedFor(tenant, p);
      if (s) return s.displayId;
    }
    return undefined;
  };

/** Request HỢP LỆ (mẫu từ hợp đồng, Ref = hàng thật của tenant A). */
function validInput(route: Route, extra: Partial<CallInput> = {}): CallInput {
  const s = tk.sampleRequest(route, { refFor: refForTenant('A') });
  const headers = { ...(s.headers ?? {}) };
  delete headers['idempotency-key']; // client tự sinh khoá mới mỗi lần
  return {
    ...(s.params ? { params: s.params } : {}),
    ...(s.query ? { query: s.query } : {}),
    ...(s.body !== undefined ? { body: s.body } : {}),
    headers,
    ...extra,
  };
}

async function callCounted(route: Route, who: Who, input: CallInput): Promise<{ res: CallResult; ran: number }> {
  const before = t.calls.get(route.id) ?? 0;
  const res = await t.as(who).call(route.id, input);
  return { res, ran: (t.calls.get(route.id) ?? 0) - before };
}

function expectError(res: CallResult, status: number, code: string): void {
  expect(res.status, `${res.status} ${res.text.slice(0, 200)}`).toBe(status);
  expect(res.code).toBe(code);
  expect(ApiErrorEnvelope.safeParse(res.json).success).toBe(true);
}

it('meta-test không rỗng: có route public / V / A / O / ownerWhen / Ref path / Ref query / Ref body / core / idempotent', () => {
  const has = (p: (r: Route) => boolean) => ROUTES.some(p);
  expect(has((r) => r.auth === 'public')).toBe(true);
  for (const a of ['V', 'A', 'O'] as const) expect(has((r) => r.auth === a)).toBe(true);
  expect(has((r) => r.ownerWhen !== undefined && 'rule' in r.ownerWhen)).toBe(true);
  expect(has((r) => r.ownerWhen !== undefined && 'in' in r.ownerWhen)).toBe(true);
  for (const part of ['params', 'query', 'body'] as const) {
    expect(has((r) => tk.refFieldsOf(r).some((f) => f.part === part))).toBe(true);
  }
  expect(has((r) => r.o4 === 'core')).toBe(true);
  expect(has((r) => r.o4 === 'setup')).toBe(true);
  expect(has((r) => r.idempotent)).toBe(true);
  expect(has((r) => r.method === 'PATCH')).toBe(true);
});

describe('phiên + quyền', () => {
  it.each(nonPublic)('%s: không phiên ⇒ 401, handler không chạy', async (_id, r) => {
    const { res, ran } = await callCounted(r, 'anon', validInput(r));
    expectError(res, 401, 'auth.required');
    expect(ran).toBe(0);
  });

  it.each(nonPublic)('%s: cookie giả ⇒ 401', async (_id, r) => {
    const fakeCookie = `ga_sid=${'A'.repeat(43)}`;
    const { res, ran } = await callCounted(r, 'anon', validInput(r, { cookie: fakeCookie }));
    expectError(res, 401, 'auth.required');
    expect(ran).toBe(0);
  });

  it.each(nonPublic)('%s: access_level operator (chưa định nghĩa ở hợp đồng) ⇒ 403', async (_id, r) => {
    const { res, ran } = await callCounted(r, 'A.operator', validInput(r));
    expectError(res, 403, 'auth.forbidden');
    expect(ran).toBe(0);
  });

  it.each(each.filter(([, r]) => r.auth === 'A' || r.auth === 'O'))('%s: viewer ⇒ 403', async (_id, r) => {
    const { res, ran } = await callCounted(r, 'A.viewer', validInput(r));
    expectError(res, 403, 'auth.forbidden');
    expect(ran).toBe(0);
  });

  it.each(each.filter(([, r]) => r.auth === 'O'))('%s: admin ở route O ⇒ 403', async (_id, r) => {
    const { res, ran } = await callCounted(r, 'A.admin', validInput(r));
    expectError(res, 403, 'auth.forbidden');
    expect(ran).toBe(0);
  });

  it.each(each.filter(([, r]) => r.ownerWhen !== undefined))(
    '%s: ownerWhen đúng điều kiện ⇒ admin 403, owner qua quyền',
    async (_id, r) => {
      const w = r.ownerWhen;
      if (!w) throw new Error('unreachable');
      const input = validInput(r);
      if ('rule' in w) {
        const ownerOnly = Object.keys(SETTINGS).find((k) => isSettingKey(k) && !settingWritableBy(k, 'admin'));
        if (!ownerOnly) throw new Error('registry SETTINGS không có khoá chỉ owner');
        input.params = { ...input.params, settingKey: ownerOnly };
      } else if (w.in === 'body') {
        input.body = { ...(input.body as Record<string, unknown>), [w.field]: w.equals };
      } else {
        input.query = { ...input.query, [w.field]: String(w.equals) };
      }
      const admin = await callCounted(r, 'A.admin', input);
      expectError(admin.res, 403, 'auth.forbidden');
      expect(admin.ran).toBe(0);
      const owner = await callCounted(r, 'A.owner', input);
      expect(owner.res.code).not.toBe('auth.forbidden');
    },
  );

  it.each(each.filter(([, r]) => r.auth === 'V'))('%s: viewer qua được cổng quyền', async (_id, r) => {
    const { res } = await callCounted(r, 'A.viewer', validInput(r));
    expect(res.code).not.toBe('auth.forbidden');
    expect(res.status).not.toBe(401);
  });
});

describe('CSRF', () => {
  const writes = nonPublic.filter(([, r]) => requiresCsrf(r));
  it.each(writes)('%s: thiếu CSRF ⇒ 403 auth.csrf', async (_id, r) => {
    const { res, ran } = await callCounted(r, 'A.owner', validInput(r, { csrf: false }));
    expectError(res, 403, 'auth.csrf');
    expect(ran).toBe(0);
  });
  it.each(writes)('%s: CSRF của phiên khác ⇒ 403 auth.csrf', async (_id, r) => {
    const other = t.world.user('B.owner').csrf;
    const { res, ran } = await callCounted(r, 'A.owner', validInput(r, { csrf: other }));
    expectError(res, 403, 'auth.csrf');
    expect(ran).toBe(0);
  });
  it.each(writes)('%s: Origin lạ ⇒ 403', async (_id, r) => {
    const { res, ran } = await callCounted(r, 'A.owner', validInput(r, { origin: 'https://evil.example' }));
    expect(res.status).toBe(403);
    expect(ran).toBe(0);
  });
});

describe('RecoveryGuard O4 — mọi lý do', () => {
  it.each(each)('%s', async (_id, r) => {
    try {
      for (const reason of tk.O4_REASONS) {
        t.recovery.setRecovery(reason);
        t.recovery.coreTarget = false;
        const who: Who = r.auth === 'public' ? 'anon' : 'A.owner';
        const { res, ran } = await callCounted(r, who, validInput(r));
        if (r.o4 === 'open') {
          expect(res.code, `${reason}`).not.toBe('recovery.blocked');
        } else {
          expectError(res, 423, 'recovery.blocked');
          expect(ran, `${reason}`).toBe(0);
        }
        if (r.o4 === 'core') {
          t.recovery.coreTarget = true;
          const ok = await callCounted(r, who, validInput(r));
          expect(ok.res.code, `${reason} core`).not.toBe('recovery.blocked');
        }
      }
    } finally {
      t.recovery.setOk();
      t.recovery.coreTarget = false;
    }
  });
});

describe('validate request strict', () => {
  it.each(each.filter(([, r]) => r.request.body))('%s: khoá lạ trong body ⇒ 400', async (_id, r) => {
    const input = validInput(r);
    input.body = { ...(input.body as Record<string, unknown>), __unknown_field__: 1 };
    const { res, ran } = await callCounted(r, r.auth === 'public' ? 'anon' : 'A.owner', input);
    expectError(res, 400, 'validation.failed');
    expect(res.detail?.reason).toBe('unrecognized_keys');
    expect(res.text).not.toContain('__unknown_field__');
    expect(ran).toBe(0);
  });

  // (Request của undici không cho GET có thân ⇒ kiểm route không-GET; GET đi qua cùng nhánh validate)
  it.each(each.filter(([, r]) => !r.request.body && r.method !== 'GET'))(
    '%s: body ở route không nhận body ⇒ 400',
    async (_id, r) => {
      const input = validInput(r, { rawBody: '{}', headers: { 'content-type': 'application/json' } });
      const { res, ran } = await callCounted(r, r.auth === 'public' ? 'anon' : 'A.owner', input);
      expectError(res, 400, 'validation.failed');
      expect(ran).toBe(0);
    },
  );

  it.each(each)('%s: tham số query lạ ⇒ 400', async (_id, r) => {
    const input = validInput(r);
    input.query = { ...input.query, __unknown_q__: '1' };
    const { res, ran } = await callCounted(r, r.auth === 'public' ? 'anon' : 'A.owner', input);
    expectError(res, 400, 'validation.failed');
    expect(res.text).not.toContain('__unknown_q__');
    expect(ran).toBe(0);
  });
});

describe('trần thân request (API_LIMITS.bodyBytes) — chặn TRƯỚC JSON.parse', () => {
  const big = () => `{"x":"${'a'.repeat(API_LIMITS.bodyBytes)}"}`;
  it.each(each)('%s: Content-Length khai > trần ⇒ 413', async (_id, r) => {
    const who: Who = r.auth === 'public' ? 'anon' : 'A.owner';
    const { res, ran } = await callCounted(
      r,
      who,
      validInput(r, {
        ...(r.method !== 'GET' ? { rawBody: '{}' } : {}),
        headers: { 'content-type': 'application/json', 'content-length': String(API_LIMITS.bodyBytes + 1) },
      }),
    );
    expectError(res, 413, 'upload.too_large');
    expect(ran).toBe(0);
  });
  it.each(each.filter(([, r]) => r.method !== 'GET'))(
    '%s: Content-Length NÓI DỐI (nhỏ hơn thật) ⇒ 413 (đếm byte khi đọc)',
    async (_id, r) => {
      const { res, ran } = await callCounted(
        r,
        r.auth === 'public' ? 'anon' : 'A.owner',
        validInput(r, { rawBody: big(), headers: { 'content-type': 'application/json', 'content-length': '16' } }),
      );
      expectError(res, 413, 'upload.too_large');
      expect(ran).toBe(0);
    },
  );
  it.each(each.filter(([, r]) => r.method !== 'GET'))(
    '%s: chunked (không Content-Length) > trần ⇒ 413',
    async (_id, r) => {
      const bytes = new TextEncoder().encode(big());
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          for (let i = 0; i < bytes.length; i += 65_536) c.enqueue(bytes.subarray(i, i + 65_536));
          c.close();
        },
      });
      const { res, ran } = await callCounted(
        r,
        r.auth === 'public' ? 'anon' : 'A.owner',
        validInput(r, { rawBody: stream, headers: { 'content-type': 'application/json' } }),
      );
      expectError(res, 413, 'upload.too_large');
      expect(ran).toBe(0);
    },
  );
});

describe('CHÉO TENANT (IDOR) — mọi trường Ref ở params / query / body', () => {
  const cases = each.flatMap(([id, r]) => tk.refFieldsOf(r).map((f) => [`${id} ${f.path}`, r, f] as const));
  it('có ca để kiểm (không rỗng)', () => {
    expect(cases.length).toBeGreaterThan(0);
  });
  it.each(cases)('%s: ref của tenant B ⇒ không bao giờ 2xx; ref của A ⇒ đối chứng qua', async (_label, r, field) => {
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
        const input: CallInput = {
          ...(s.params ? { params: s.params } : {}),
          ...(s.query ? { query: s.query } : {}),
          ...(s.body !== undefined ? { body: s.body } : {}),
          // gợi ý workspace từ client PHẢI bị bỏ qua (workspace chỉ từ phiên)
          headers: { 'x-ga-workspace-id': t.world.tenants.B.workspaceId },
        };
        const { res } = await callCounted(r, who, input);
        expect(res.status, `${field.path}=${value}: ${res.text.slice(0, 160)}`).toBeGreaterThanOrEqual(400);
        if (field.part === 'params') expectError(res, 404, 'not_found');
        else expect(['not_found', 'validation.failed'], res.text.slice(0, 160)).toContain(res.code);
        expect(res.text).not.toContain(theirs.id === value ? theirs.displayId : theirs.id);
      }
      // đối chứng: cùng request với ref của CHÍNH tenant A ⇒ không bị coi là "không thấy" (test không rỗng nghĩa)
      const mine = seedFor('A', prefix) as Seeded;
      const s = tk.sampleRequest(r, { refFor: refForTenant('A'), targetField: field, targetValue: mine.displayId });
      const ctl = await t.as(who).call(r.id, {
        ...(s.params ? { params: s.params } : {}),
        ...(s.query ? { query: s.query } : {}),
        ...(s.body !== undefined ? { body: s.body } : {}),
      });
      expect([404, 400, 500], `đối chứng ${r.id} ${field.path}: ${ctl.text.slice(0, 160)}`).not.toContain(ctl.status);
    }
  });
});

describe('header bảo mật + không CORS', () => {
  it.each(each)('%s: no-store, nosniff, không Access-Control-*', async (_id, r) => {
    const res = await t.as(r.auth === 'public' ? 'anon' : 'A.owner').call(r.id, validInput(r));
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect([...res.headers.keys()].some((k) => k.startsWith('access-control-'))).toBe(false);
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});

describe('đường đi hợp lệ (owner, mode ok) — handler chạy, response qua schema', () => {
  it.each(each)('%s', async (_id, r) => {
    const who: Who = r.auth === 'public' ? 'anon' : 'A.owner';
    const { res, ran } = await callCounted(r, who, validInput(r));
    expect(ran, res.text.slice(0, 200)).toBe(1);
    expect(res.status, res.text.slice(0, 200)).toBeLessThan(500);
  });
});
