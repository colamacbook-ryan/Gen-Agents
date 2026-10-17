// Idempotency store (2 review bảo mật MEDIUM 2026-10-17 + Gen quyết): KHÔNG evict mục còn hiệu lực; trần theo workspace và
// (workspace, actor) — một tenant flood không chặn tenant khác; pending có hạn cứng; dọn hết hạn từ đầu hàng đợi (O(1)).
import { describe, expect, it } from 'vitest';
import { defineHandler } from '../../src/http/define-handler.ts';
import {
  IDEMPOTENCY_DEFAULTS,
  type IdempotencyKeyRef,
  InMemoryIdempotencyStore,
  idempotencyKeyRef,
} from '../../src/http/idempotency.ts';
import { makeTestApp, tk } from './harness.ts';

const WS_A = '01JAAAAAAAAAAAAAAAAAAAAAAA';
const WS_B = '01JBBBBBBBBBBBBBBBBBBBBBBB';
const clock = () => {
  let t = Date.parse('2026-10-17T08:00:00.000Z');
  return {
    now: () => new Date(t),
    advance: (ms: number) => {
      t += ms;
    },
  };
};
const ref = (ws: string, actor: string, key: string): IdempotencyKeyRef =>
  idempotencyKeyRef({ workspaceId: ws, actorId: actor, routeId: 'WRK-24', key });
const RESULT = { status: 200, body: { ok: 1 } };

function done(s: InMemoryIdempotencyStore, k: IdempotencyKeyRef, fp = 'fp'): void {
  const r = s.begin(k, fp);
  if (r.kind !== 'new') throw new Error(`begin ${r.kind}`);
  s.complete(k, r.ticket, RESULT);
}

describe('InMemoryIdempotencyStore', () => {
  it('mặc định: done giữ 10 phút, pending hạn cứng 120 s, trần 1 000 / actor, 10 000 / workspace', () => {
    expect(IDEMPOTENCY_DEFAULTS).toEqual({
      doneTtlMs: 600_000,
      pendingTimeoutMs: 120_000,
      maxPerActor: 1_000,
      maxPerWorkspace: 10_000,
    });
  });

  it('tenant B flood 10 000 khoá (nhiều actor) tới trần ⇒ tenant A vẫn begin bình thường, khoá cũ của A phát lại đúng', () => {
    const s = new InMemoryIdempotencyStore({ clock: clock(), maxPerWorkspace: 5_000 });
    done(s, ref(WS_A, 'a1', 'victim'), 'fp-a');
    const kinds = new Map<string, number>();
    for (let i = 0; i < 10_000; i++) {
      const k = ref(WS_B, `b${i % 20}`, `flood-${i}`);
      const r = s.begin(k, 'fp');
      const label = r.kind === 'full' ? `full:${r.reason}` : r.kind;
      kinds.set(label, (kinds.get(label) ?? 0) + 1);
      if (r.kind === 'new') s.complete(k, r.ticket, RESULT);
    }
    expect(kinds.get('new')).toBe(5_000);
    expect(kinds.get('full:workspace')).toBe(5_000);
    expect(s.begin(ref(WS_A, 'a1', 'victim'), 'fp-a')).toEqual({ kind: 'replay', result: RESULT });
    expect(s.begin(ref(WS_A, 'a2', 'fresh'), 'fp').kind).toBe('new');
  });

  it('actor khác CÙNG tenant flood tới trần actor ⇒ khoá của nạn nhân vẫn còn (không evict), nạn nhân vẫn begin được', () => {
    const s = new InMemoryIdempotencyStore({ clock: clock() });
    done(s, ref(WS_A, 'victim', 'k'), 'fp-v');
    let full = 0;
    for (let i = 0; i < 10_000; i++) {
      const k = ref(WS_A, 'attacker', `flood-${i}`);
      const r = s.begin(k, 'fp');
      if (r.kind === 'new') s.complete(k, r.ticket, RESULT);
      else if (r.kind === 'full') full++;
    }
    expect(full).toBe(9_000);
    expect(s.begin(ref(WS_A, 'victim', 'k'), 'fp-v')).toEqual({ kind: 'replay', result: RESULT });
    expect(s.begin(ref(WS_A, 'victim', 'k2'), 'fp').kind).toBe('new');
  });

  it('pending không bị flood đẩy ra; handler treo quá hạn ⇒ nhả khoá; complete muộn của lượt cũ bị bỏ qua', () => {
    const c = clock();
    const s = new InMemoryIdempotencyStore({ clock: c, maxPerActor: 3, pendingTimeoutMs: 5_000 });
    const k = ref(WS_A, 'a', 'hang');
    const first = s.begin(k, 'fp');
    if (first.kind !== 'new') throw new Error('new');
    for (let i = 0; i < 50; i++) s.begin(ref(WS_A, 'a', `x${i}`), 'fp');
    expect(s.begin(k, 'fp')).toEqual({ kind: 'conflict', reason: 'in_flight' });
    c.advance(4_999);
    expect(s.begin(k, 'fp')).toEqual({ kind: 'conflict', reason: 'in_flight' });
    c.advance(2);
    const second = s.begin(k, 'fp');
    expect(second.kind).toBe('new');
    s.complete(k, first.ticket, { status: 200, body: { stale: true } });
    expect(s.begin(k, 'fp')).toEqual({ kind: 'conflict', reason: 'in_flight' });
    if (second.kind === 'new') s.complete(k, second.ticket, RESULT);
    expect(s.begin(k, 'fp')).toEqual({ kind: 'replay', result: RESULT });
  });

  it('done hết hạn (TTL) ⇒ dọn, trần được giải phóng, khoá chạy như mới', () => {
    const c = clock();
    const s = new InMemoryIdempotencyStore({ clock: c, doneTtlMs: 1_000, maxPerActor: 2 });
    done(s, ref(WS_A, 'a', 'k1'));
    done(s, ref(WS_A, 'a', 'k2'));
    expect(s.begin(ref(WS_A, 'a', 'k3'), 'fp')).toEqual({ kind: 'full', reason: 'actor' });
    c.advance(1_000);
    expect(s.begin(ref(WS_A, 'a', 'k3'), 'fp').kind).toBe('new');
    expect(s.size()).toBe(1);
    expect(s.begin(ref(WS_A, 'a', 'k1'), 'fp').kind).toBe('new');
  });

  it('cùng khoá + khác dấu vân tay ⇒ conflict, không phát lại', () => {
    const s = new InMemoryIdempotencyStore({ clock: clock() });
    done(s, ref(WS_A, 'a', 'k'), 'fp1');
    expect(s.begin(ref(WS_A, 'a', 'k'), 'fp2')).toEqual({ kind: 'conflict', reason: 'fingerprint' });
  });

  it('chi phí mỗi begin KHÔNG tăng theo số mục đang giữ (1k vs 100k: tỉ lệ trung vị 3 lần < 8)', () => {
    const run = (n: number): number => {
      const c = clock();
      const s = new InMemoryIdempotencyStore({ clock: c, maxPerWorkspace: 1_000 });
      for (let i = 0; i < n; i++) done(s, ref(`W${Math.floor(i / 1000)}`, `a${Math.floor(i / 1000)}`, `k${i}`));
      // kẻ flood: actor đã đầy (bị từ chối) + workspace mới chèn liên tục — trước đây mỗi lần bị từ chối quét O(n)
      for (let i = 0; i < 1_000; i++) done(s, ref('FLOOD', 'f', `pre${i}`));
      const t0 = performance.now();
      for (let i = 0; i < 4_000; i++) {
        s.begin(ref('FLOOD', 'f', `rej${i}`), 'fp');
        const k = ref(`NEW${i % 50}`, 'n', `ins${i}`);
        const r = s.begin(k, 'fp');
        if (r.kind === 'new') s.complete(k, r.ticket, RESULT);
      }
      return performance.now() - t0;
    };
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[1] as number;
    const small = median([run(1_000), run(1_000), run(1_000)]);
    const big = median([run(100_000), run(100_000), run(100_000)]);
    expect(big / Math.max(small, 1)).toBeLessThan(8);
    expect(big).toBeLessThan(2_000);
  });
});

describe('idempotency qua HTTP', () => {
  const ledger = defineHandler('WRK-24', ({ params }, ctx) => {
    ctx.ref('RL', params.roleRef);
    return {
      entry: { id: '01JDEM0DEM0DEM0DEM0DEM0DEM', displayId: 'LG-0001' },
      balanceAfterMinor: 1,
      revived: false,
      rankAfter: null,
    };
  });
  const roleIn = (t: ReturnType<typeof makeTestApp>, tenant: 'A' | 'B') => {
    const seed = tk.CROSS_TENANT_SEEDERS.RL;
    if (!seed) throw new Error('RL');
    return seed({ world: t.world, tenant: t.world.tenants[tenant], seeded: new Map() }).displayId;
  };

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
      const input = {
        params: { roleRef: roleIn(t, 'A') },
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

  it('actor đầy ⇒ 429 cho actor đó; tenant B đầy ⇒ 429 cho B, tenant A KHÔNG bị ảnh hưởng', async () => {
    const t = makeTestApp({
      handlers: [ledger],
      idempotency: new InMemoryIdempotencyStore({
        clock: { now: () => new Date() },
        maxPerActor: 3,
        maxPerWorkspace: 4,
      }),
    });
    try {
      const refA = roleIn(t, 'A');
      const refB = roleIn(t, 'B');
      const call = (who: 'A.owner' | 'B.owner' | 'B.admin', roleRef: string, key: string) =>
        t.as(who).call('WRK-24', {
          params: { roleRef },
          body: { amountMinor: 1, reason: 'x' },
          headers: { 'idempotency-key': key },
        });
      for (const k of ['key-ns-00001', 'key-ns-00002', 'key-ns-00003']) {
        expect((await call('B.owner', refB, k)).status).toBe(200);
      }
      const actorFull = await call('B.owner', refB, 'key-ns-00004');
      expect([actorFull.status, actorFull.code, actorFull.detail?.reason]).toEqual([
        429,
        'auth.rate_limited',
        'idempotency_actor_full',
      ]);
      expect(actorFull.headers.get('retry-after')).toBe('60');
      expect((await call('B.admin', refB, 'key-ns-00004')).status).toBe(200);
      const wsFull = await call('B.admin', refB, 'key-ns-00005');
      expect([wsFull.status, wsFull.detail?.reason]).toEqual([429, 'idempotency_workspace_full']);
      // tenant A: không 429, không 503
      for (const k of ['key-ns-00001', 'key-ns-00002', 'key-ns-00003']) {
        expect((await call('A.owner', refA, k)).status).toBe(200);
      }
      expect((await call('B.owner', refB, 'key-ns-00001')).headers.get('idempotency-replayed')).toBe('true');
    } finally {
      t.close();
    }
  });
});
