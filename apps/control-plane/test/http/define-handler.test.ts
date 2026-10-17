// defineHandler + kiểm lúc khởi động của createApp: kiểu suy từ hợp đồng, id lạ, handler trùng, route giả, route không mount được.
import * as C from '@ga/contracts';
import { defineLane, ok, ROUTES, routeById } from '@ga/contracts';
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { checkHandlers, honoPath } from '../../src/app.ts';
import { defineHandler, type Handler, type HandlerInput, type RouteId } from '../../src/http/define-handler.ts';
import { DEMO_HANDLERS } from './demo-handlers.ts';
import { makeTestApp, type TestWorld, tk } from './harness.ts';

describe('RouteId suy từ tên export của contracts', () => {
  it('mọi route của registry có export `XXX_nn` cùng id (nền của kiểu RouteId / RouteSpec)', () => {
    const exportsById = C as unknown as Record<string, { id?: unknown }>;
    for (const r of ROUTES) {
      const name = r.id.replace('-', '_');
      expect(exportsById[name]?.id, name).toBe(r.id);
    }
  });

  it('kiểu input / output lấy từ hợp đồng (kiểm lúc biên dịch)', () => {
    expectTypeOf<HandlerInput<'SYS-34'>['params']>().toEqualTypeOf<{ roleRef: string }>();
    expectTypeOf<HandlerInput<'SYS-34'>['body']>().toEqualTypeOf<{ name: string }>();
    expectTypeOf<HandlerInput<'SYS-10'>['body']>().toEqualTypeOf<undefined>();
    expectTypeOf<'SYS-34'>().toMatchTypeOf<RouteId>();
    // @ts-expect-error — id không có trong registry
    expectTypeOf<'SYS-99'>().toMatchTypeOf<RouteId>();
    // @ts-expect-error — id không có trong registry ⇒ lỗi biên dịch
    expect(() => defineHandler('SYS-99', () => [])).toThrow(/không có trong registry/);
    // @ts-expect-error — sai kiểu trường response (engineSlug là chuỗi)
    defineHandler('SYS-10', () => [{ engineSlug: 1 }]);
    defineHandler('SYS-34', ({ body }) => {
      // @ts-expect-error — trường không khai trong body của SYS-34
      void body.nope;
      return { role: { id: 'x', displayId: 'RL-0001' } };
    });
  });
});

describe('createApp — kiểm lúc khởi động (fail-closed)', () => {
  const h = (id: string): Handler => {
    const x = DEMO_HANDLERS.find((d) => d.route.id === id);
    if (!x) throw new Error(id);
    return x;
  };
  it('hai handler cùng route ⇒ throw', () => {
    expect(() =>
      checkHandlers([h('SYS-34'), defineHandler('SYS-34', () => ({ role: { id: 'x', displayId: 'RL-0001' } }))]),
    ).toThrow(/hai handler/);
  });
  it('route không phải object của registry (route tự chế) ⇒ throw', () => {
    const fake = { ...routeById('SYS-34'), path: '/__test/backdoor' } as C.Route;
    expect(() => checkHandlers([{ route: fake, run: async () => undefined }])).toThrow(/registry/);
    const synthetic = defineLane('L-SYS')({
      id: 'SYS-34',
      method: 'GET',
      path: '/x',
      auth: 'public',
      o4: 'open',
      response: ok(z.strictObject({})),
    });
    expect(() => checkHandlers([{ route: { ...synthetic, fs: [] }, run: async () => ({}) }])).toThrow(/registry/);
  });
  it('route edge / WS (EXT-05) và multipart (SYS-21) ⇒ throw', () => {
    expect(() => checkHandlers([defineHandler('EXT-05', () => ({}) as never)])).toThrow(/không mount/);
    expect(() => checkHandlers([defineHandler('SYS-21', () => ({}) as never)])).toThrow(/multipart/);
  });
  it('handler demo hợp lệ ⇒ không throw; đường Hono đúng', () => {
    expect(() => checkHandlers(DEMO_HANDLERS)).not.toThrow();
    expect(honoPath(routeById('SYS-38') as C.Route)).toBe('/api/v1/roles/:roleRef/dna/:dnaRef');
  });
});

describe('định tuyến: MỌI route mount được của registry tới ĐÚNG handler của nó', () => {
  let world: TestWorld;
  beforeAll(() => {
    world = tk.makeWorld();
  });
  afterAll(() => world.close());
  it('mọi route (202, trừ edge / multipart): request mẫu của route X chạy handler X', async () => {
    const hit: string[] = [];
    const mountable = ROUTES.filter(
      (r) => r.mount === 'api' && r.method !== 'WS' && r.request.bodyKind !== 'multipart',
    );
    const handlers = mountable.map((r) => ({ route: r, run: async () => void hit.push(r.id) }) satisfies Handler);
    const t = makeTestApp({ handlers, world });
    t.recovery.coreTarget = true;
    let checked = 0;
    for (const r of mountable) {
      const s = tk.sampleRequest(r);
      const headers = { ...(s.headers ?? {}) };
      delete headers['idempotency-key'];
      hit.length = 0;
      t.recovery.setOk();
      if (r.o4 === 'setup') t.recovery.setSetup();
      const res = await t.as(r.auth === 'public' ? 'anon' : 'A.owner').call(r.id, {
        ...(s.params ? { params: s.params } : {}),
        ...(s.query ? { query: s.query } : {}),
        ...(s.body !== undefined ? { body: s.body } : {}),
        headers,
      });
      expect(hit, `${r.id} ${r.method} ${r.path} ⇒ ${res.status} ${res.text.slice(100, 260)}`).toEqual([r.id]);
      checked++;
    }
    expect(checked).toBe(mountable.length);
    expect(checked).toBeGreaterThanOrEqual(199);
  });
});
