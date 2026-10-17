// META-TEST BẢO MẬT — chạy trên MỌI route đã mount (handler PRODUCTION của các lane + handler demo cho id chưa có bản
// thật). Lane thêm handler ⇒ tự được kiểm, không phải viết lại. Mỗi ca chặn còn khẳng định handler KHÔNG chạy.
//   - không phiên ⇒ 401 · operator ⇒ 403 · viewer ở route A/O ⇒ 403 · admin ở route O / ownerWhen đúng điều kiện ⇒ 403
//   - method ghi thiếu / sai CSRF ⇒ 403
//   - từng lý do O4: route blocked / setup ⇒ 423; open ⇒ qua guard; core ⇒ chỉ khi đích là Core agent
//   - khoá lạ ở body / query, body ở route không nhận body ⇒ 400; body > trần (khai báo / nói dối / chunked) ⇒ 413
//   - CHÉO TENANT: mọi trường Ref (params / query / body) mang ref của tenant B ⇒ 404 (body / query: 404 hoặc 400), không
//     bao giờ 2xx; đối chứng: ref của chính tenant A ⇒ không 404 / 400 / 500. Prefix chưa có seeder ⇒ ĐỎ.
//   - mọi response JSON qua findCredentialLike (client testkit) + header bảo mật.
import { API_LIMITS, isSettingKey, type Route, requiresCsrf, SETTINGS, settingWritableBy } from '@ga/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Handler } from '../../src/http/define-handler.ts';
import { PRODUCTION_HANDLERS } from '../../src/http/handlers.ts';
import { DEMO_HANDLERS } from '../http/demo-handlers.ts';
import { type CallInput, makeTestApp, type TestApp, tk, type Who } from '../http/harness.ts';
import { expectError, makeProbe, type Probe } from './probe.ts';

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

const p = () => probe;
let probe: Probe;
beforeAll(() => {
  probe = makeProbe(t);
});
const validInput = (r: Route, extra: Partial<CallInput> = {}) => p().validInput(r, extra);
const callCounted = (r: Route, who: Who, input: CallInput) => p().callCounted(r, who, input);

it('meta-test không rỗng: có route public / V / A / O / ownerWhen / Ref path / Ref query / Ref body / core / idempotent', () => {
  const has = (p: (r: Route) => boolean) => ROUTES.some(p);
  expect(has((r) => r.auth === 'public')).toBe(true);
  for (const a of ['V', 'A', 'O'] as const) expect(has((r) => r.auth === a)).toBe(true);
  expect(has((r) => r.ownerWhen.some((w) => 'rule' in w))).toBe(true);
  expect(has((r) => r.ownerWhen.some((w) => 'in' in w))).toBe(true);
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

  const ownerWhenCases = HANDLERS.flatMap((h) =>
    h.route.ownerWhen.map((w, i) => [`${h.route.id} ownerWhen[${i}]`, h, w] as const),
  );
  it.each(ownerWhenCases)('%s: điều kiện đúng ⇒ admin 403, owner qua quyền', async (_label, h, w) => {
    const r = h.route;
    const input = validInput(r);
    if ('rule' in w) {
      if (w.rule === 'setting_writers') {
        const ownerOnly = Object.keys(SETTINGS).find((k) => isSettingKey(k) && !settingWritableBy(k, 'admin'));
        if (!ownerOnly) throw new Error('registry SETTINGS không có khoá chỉ owner');
        input.params = { ...input.params, settingKey: ownerOnly };
      } else if (h.stored) {
        return; // trạng thái đã lưu do handler tra (hook `stored`) — lane tự có ca âm (HANDLER-OBLIGATIONS §3)
      }
      // egress_loosen không hook `stored` ⇒ edge coi như khớp ⇒ O (fail-closed)
    } else {
      const value = 'equals' in w ? w.equals : 'equalsAny' in w ? w.equalsAny[0] : null;
      if (w.in === 'body') input.body = { ...(input.body as Record<string, unknown>), [w.field]: value };
      else input.query = { ...input.query, [w.field]: String(value) };
    }
    const admin = await callCounted(r, 'A.admin', input);
    expectError(admin.res, 403, 'auth.forbidden');
    expect(admin.ran).toBe(0);
    const owner = await callCounted(r, 'A.owner', input);
    expect(owner.res.code).not.toBe('auth.forbidden');
  });

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
    await p().checkCrossTenant(r, field);
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
