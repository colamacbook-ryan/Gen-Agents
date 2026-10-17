// Idempotency store (review bảo mật MEDIUM 2026-10-17): KHÔNG evict mục còn hiệu lực — flood khoá của actor khác không đẩy
// được khoá của nạn nhân; `pending` không bao giờ bị xoá; trần theo namespace (ws, actor) + trần toàn cục ⇒ từ chối khoá mới.
import { describe, expect, it } from 'vitest';
import { defineHandler } from '../../src/http/define-handler.ts';
import { type IdempotencyKeyRef, InMemoryIdempotencyStore, idempotencyKeyRef } from '../../src/http/idempotency.ts';
import { makeTestApp, tk } from './harness.ts';

const WS = '01JAAAAAAAAAAAAAAAAAAAAAAA';
const clock = () => {
  let t = Date.parse('2026-10-17T08:00:00.000Z');
  return {
    now: () => new Date(t),
    advance: (ms: number) => {
      t += ms;
    },
  };
};
const ref = (actor: string, key: string): IdempotencyKeyRef =>
  idempotencyKeyRef({ workspaceId: WS, actorId: actor, routeId: 'WRK-24', key });
const RESULT = { status: 200, body: { ok: 1 } };

describe('InMemoryIdempotencyStore — không evict', () => {
  it('actor B flood 10 000 khoá (trần mặc định) ⇒ khoá của actor A vẫn phát lại đúng; B bị từ chối, không ai bị evict', () => {
    const s = new InMemoryIdempotencyStore({ clock: clock() });
    expect(s.begin(ref('A', 'victim'), 'fp-a').kind).toBe('new');
    s.complete(ref('A', 'victim'), 'fp-a', RESULT);
    let full = 0;
    for (let i = 0; i < 10_000; i++) {
      const k = ref('B', `flood-${i}`);
      const r = s.begin(k, 'fp');
      if (r.kind === 'new') s.complete(k, 'fp', RESULT);
      else if (r.kind === 'full') full++;
    }
    expect(full).toBe(9_000);
    expect(s.begin(ref('A', 'victim'), 'fp-a')).toEqual({ kind: 'replay', result: RESULT });
  });

  it('trần TOÀN CỤC đầy ⇒ từ chối khoá mới, KHÔNG evict khoá cũ nhất của actor khác', () => {
    const s = new InMemoryIdempotencyStore({ clock: clock(), maxEntries: 500, maxPerNamespace: 20_000 });
    s.begin(ref('A', 'victim'), 'fp-a');
    s.complete(ref('A', 'victim'), 'fp-a', RESULT);
    const kinds = new Map<string, number>();
    for (let i = 0; i < 10_000; i++) {
      const k = ref('B', `flood-${i}`);
      const r = s.begin(k, 'fp');
      kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + 1);
      if (r.kind === 'new') s.complete(k, 'fp', RESULT);
    }
    expect(kinds.get('new')).toBe(499);
    expect(s.size()).toBe(500);
    expect(s.begin(ref('A', 'victim'), 'fp-a')).toEqual({ kind: 'replay', result: RESULT });
    // A (khoá mới) cũng bị từ chối khi kho đầy — không đẩy ai ra
    expect(s.begin(ref('A', 'new-one'), 'fp')).toEqual({ kind: 'full', reason: 'global' });
  });

  it('`pending` không bao giờ bị xoá — kể cả sau TTL và khi kho đầy', () => {
    const c = clock();
    const s = new InMemoryIdempotencyStore({ clock: c, ttlMs: 1000, maxEntries: 3, maxPerNamespace: 3 });
    expect(s.begin(ref('A', 'p'), 'fp').kind).toBe('new');
    c.advance(10_000);
    for (let i = 0; i < 10; i++) s.begin(ref('B', `x${i}`), 'fp');
    expect(s.begin(ref('A', 'p'), 'fp')).toEqual({ kind: 'conflict', reason: 'in_flight' });
    expect(s.begin(ref('A', 'p'), 'other')).toEqual({ kind: 'conflict', reason: 'fingerprint' });
  });

  it('mục `done` HẾT HẠN được dọn ⇒ namespace đầy mở lại sau TTL; khoá hết hạn chạy như mới', () => {
    const c = clock();
    const s = new InMemoryIdempotencyStore({ clock: c, ttlMs: 1000, maxPerNamespace: 2 });
    for (const k of ['a', 'b']) {
      s.begin(ref('A', k), 'fp');
      s.complete(ref('A', k), 'fp', RESULT);
    }
    expect(s.begin(ref('A', 'c'), 'fp')).toEqual({ kind: 'full', reason: 'namespace' });
    expect(s.begin(ref('B', 'c'), 'fp').kind).toBe('new');
    c.advance(1001);
    expect(s.begin(ref('A', 'c'), 'fp').kind).toBe('new');
    expect(s.begin(ref('A', 'a'), 'fp').kind).toBe('new');
  });

  it('cùng khoá + khác dấu vân tay ⇒ conflict, không phát lại', () => {
    const s = new InMemoryIdempotencyStore({ clock: clock() });
    s.begin(ref('A', 'k'), 'fp1');
    s.complete(ref('A', 'k'), 'fp1', RESULT);
    expect(s.begin(ref('A', 'k'), 'fp2')).toEqual({ kind: 'conflict', reason: 'fingerprint' });
  });
});

describe('idempotency qua HTTP', () => {
  it('2 request ĐỒNG THỜI cùng khoá ⇒ chỉ 1 handler chạy, request kia 409; xong ⇒ phát lại', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let runs = 0;
    const h = defineHandler('WRK-24', async ({ params }, ctx) => {
      ctx.ref('RL', params.roleRef);
      runs++;
      await gate;
      return {
        entry: { id: '01JDEM0DEM0DEM0DEM0DEM0DEM', displayId: 'LG-0001' },
        balanceAfterMinor: 1,
        revived: false,
        rankAfter: null,
      };
    });
    const t = makeTestApp({ handlers: [h] });
    try {
      const seed = tk.CROSS_TENANT_SEEDERS.RL;
      if (!seed) throw new Error('RL');
      const roleRef = seed({ world: t.world, tenant: t.world.tenants.A, seeded: new Map() }).displayId;
      const input = {
        params: { roleRef },
        body: { amountMinor: 1, reason: 'x' },
        headers: { 'idempotency-key': 'key-concurrent-1' },
      };
      const first = t.as('A.owner').call('WRK-24', input);
      await new Promise((r) => setTimeout(r, 20));
      const second = await t.as('A.owner').call('WRK-24', input);
      expect([second.status, second.code, second.detail?.reason]).toEqual([409, 'idempotency.conflict', 'in_flight']);
      release();
      expect((await first).status).toBe(200);
      const third = await t.as('A.owner').call('WRK-24', input);
      expect(third.headers.get('idempotency-replayed')).toBe('true');
      expect(runs).toBe(1);
    } finally {
      t.close();
    }
  });

  it('namespace của actor đầy ⇒ 429 cho actor đó; actor khác không ảnh hưởng', async () => {
    const t = makeTestApp({
      handlers: [
        defineHandler('WRK-24', ({ params }, ctx) => {
          ctx.ref('RL', params.roleRef);
          return {
            entry: { id: '01JDEM0DEM0DEM0DEM0DEM0DEM', displayId: 'LG-0001' },
            balanceAfterMinor: 1,
            revived: false,
            rankAfter: null,
          };
        }),
      ],
      idempotency: new InMemoryIdempotencyStore({ clock: { now: () => new Date() }, maxPerNamespace: 3 }),
    });
    try {
      const seed = tk.CROSS_TENANT_SEEDERS.RL;
      if (!seed) throw new Error('RL');
      const roleRef = seed({ world: t.world, tenant: t.world.tenants.A, seeded: new Map() }).displayId;
      const call = (who: 'A.owner' | 'A.admin', key: string) =>
        t.as(who).call('WRK-24', {
          params: { roleRef },
          body: { amountMinor: 1, reason: 'x' },
          headers: { 'idempotency-key': key },
        });
      for (const k of ['key-ns-00001', 'key-ns-00002', 'key-ns-00003'])
        expect((await call('A.owner', k)).status).toBe(200);
      const over = await call('A.owner', 'key-ns-00004');
      expect([over.status, over.code, over.detail?.reason]).toEqual([
        429,
        'auth.rate_limited',
        'idempotency_namespace_full',
      ]);
      expect(over.headers.get('retry-after')).toBe('60');
      expect((await call('A.owner', 'key-ns-00001')).headers.get('idempotency-replayed')).toBe('true');
      expect((await call('A.admin', 'key-ns-00004')).status).toBe(200);
    } finally {
      t.close();
    }
  });
});
