// Phép kiểm CHÉO TENANT của meta-test phải tự ĐỎ đúng lúc (không thì meta-test xanh giả):
//   - prefix chưa có seeder ⇒ đỏ "chưa chứng minh chống IDOR cho <prefix>";
//   - handler tra ref KHÔNG lọc workspace ⇒ đỏ;
//   - handler luôn 404 (không thực sự tra) ⇒ đối chứng đỏ;
//   - handler đúng (ctx.ref) ⇒ xanh.
import { type Route, routeById } from '@ga/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defineHandler, type Handler } from '../../src/http/define-handler.ts';
import { ApiError } from '../../src/http/errors.ts';
import { DEMO_HANDLERS } from '../http/demo-handlers.ts';
import { makeTestApp, type TestWorld, tk } from '../http/harness.ts';
import { makeProbe } from './probe.ts';

let world: TestWorld;
beforeAll(() => {
  world = tk.makeWorld();
});
afterAll(() => world.close());

const route = (id: string) => routeById(id) as Route;
const field = (id: string, path: string) => {
  const f = tk.refFieldsOf(route(id)).find((x) => x.path === path);
  if (!f) throw new Error(`${id} ${path}`);
  return f;
};
const probeWith = (handlers: readonly Handler[]) => makeProbe(makeTestApp({ handlers, world }));

describe('checkCrossTenant đỏ / xanh đúng', () => {
  it('prefix chưa có seeder (SYS-55 body.attachmentRefs[] — AT) ⇒ đỏ đúng thông điệp', async () => {
    const p = probeWith([
      defineHandler('SYS-55', () => ({ knowledge: [], job: { jobDisplayId: 'JB-0001', state: 'queued' } }) as never),
    ]);
    await expect(p.checkCrossTenant(route('SYS-55'), field('SYS-55', 'body.attachmentRefs[]'))).rejects.toThrow(
      /chưa chứng minh chống IDOR cho AT/,
    );
  });

  it('handler tra Role KHÔNG lọc workspace (IDOR) ⇒ đỏ', async () => {
    const leaky = defineHandler('SYS-41', ({ params }) => {
      const row = world.reader.db
        .prepare('SELECT id FROM roles WHERE id = ? OR display_id = ? LIMIT 1')
        .get(params.roleRef, params.roleRef);
      if (row === undefined) throw new ApiError('not_found');
      return [];
    });
    await expect(
      probeWith([leaky]).checkCrossTenant(route('SYS-41'), field('SYS-41', 'params.roleRef')),
    ).rejects.toThrow();
  });

  it('handler bỏ qua Ref trong body (không tra) ⇒ đỏ (WRK-43 body.roleRef)', async () => {
    const ignores = defineHandler('WRK-43', () => ({ job: { jobDisplayId: 'JB-0001', state: 'queued' } }));
    await expect(
      probeWith([ignores]).checkCrossTenant(route('WRK-43'), field('WRK-43', 'body.roleRef')),
    ).rejects.toThrow();
  });

  it('handler luôn 404 (không thật sự tra) ⇒ đối chứng đỏ', async () => {
    const always404 = defineHandler('SYS-41', () => {
      throw new ApiError('not_found');
    });
    await expect(
      probeWith([always404]).checkCrossTenant(route('SYS-41'), field('SYS-41', 'params.roleRef')),
    ).rejects.toThrow(/đối chứng/);
  });

  it('handler đúng (ctx.ref) ⇒ xanh — path, query trong union (GW-05), body (WRK-43)', async () => {
    const demo = (id: string) => DEMO_HANDLERS.find((h) => h.route.id === id) as Handler;
    await probeWith([demo('SYS-41')]).checkCrossTenant(route('SYS-41'), field('SYS-41', 'params.roleRef'));
    await probeWith([demo('GW-05')]).checkCrossTenant(route('GW-05'), field('GW-05', 'query.consumer|1'));
    await probeWith([demo('WRK-43')]).checkCrossTenant(route('WRK-43'), field('WRK-43', 'body.roleRef'));
  });
});
