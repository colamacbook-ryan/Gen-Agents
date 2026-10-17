// EventBus (src/events/bus.ts): phạm vi workspace, khán giả theo quyền phiên, recipient, kiểm schema + credential,
// áp lực ngược (tràn ⇒ resync + đóng), phát lại Last-Event-ID (gap / restart), disconnect.
import { type Clock, LogLineEvent, StreamEvent } from '@ga/contracts';
import { describe, expect, it } from 'vitest';
import {
  type EventAudience,
  EventRejectedError,
  InMemoryEventBus,
  LOCAL_SSE_EVENT_AUDIENCE,
  type StreamEventType,
} from '../../src/events/bus.ts';

const WS_A = '01JAAAAAAAAAAAAAAAAAAAAAAA';
const WS_B = '01JBBBBBBBBBBBBBBBBBBBBBBB';
const clock = (): Clock & { advance(ms: number): void } => {
  let t = Date.parse('2026-10-17T08:00:00.000Z');
  return {
    now: () => new Date(t),
    advance: (ms) => {
      t += ms;
    },
  };
};
const attention = { type: 'attention.changed' as const, count: 2, maxSeverity: 'warn' as const };
const grid = { type: 'grid.changed' as const, grid: 'roles' as const, displayIds: ['RL-0001'], op: 'update' as const };
const notification = {
  type: 'notification' as const,
  notificationDisplayId: 'NT-0001',
  severity: 'info' as const,
  kind: 'card.issued',
};
const audience = (m: Partial<Record<StreamEventType, EventAudience>>) => (t: StreamEventType) =>
  m[t] ?? LOCAL_SSE_EVENT_AUDIENCE[t];

async function drain(sub: { next(): Promise<IteratorResult<unknown>> }, n: number): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let i = 0; i < n; i++) {
    const r = await Promise.race([sub.next(), new Promise<'timeout'>((res) => setTimeout(() => res('timeout'), 30))]);
    if (r === 'timeout' || r.done) break;
    out.push(r.value);
  }
  return out;
}

describe('phạm vi workspace + phong bì do bus điền', () => {
  it('subscriber chỉ nhận sự kiện của workspace mình; id / workspaceId / at do bus điền', async () => {
    const bus = new InMemoryEventBus({ clock: clock(), audienceOf: audience({ 'attention.changed': 'V' }) });
    const a = bus.subscribe(WS_A, { userId: 'u1', authLevel: 'O' });
    const b = bus.subscribe(WS_B, { userId: 'u2', authLevel: 'O' });
    const ev = bus.publish(WS_A, attention);
    expect(ev.workspaceId).toBe(WS_A);
    expect(StreamEvent.safeParse(ev).success).toBe(true);
    expect(await drain(a, 2)).toEqual([ev]);
    expect(await drain(b, 1)).toEqual([]);
  });
  it('người gọi truyền id / workspaceId / at ⇒ TypeError (không ghi đè được workspace)', () => {
    const bus = new InMemoryEventBus({ clock: clock() });
    expect(() => bus.publish(WS_A, { ...attention, workspaceId: WS_B } as never)).toThrow(TypeError);
    expect(() => bus.publish(WS_A, { ...attention, id: 'x' } as never)).toThrow(TypeError);
  });
  it('sai schema / giống credential / log.line (không thuộc /stream) ⇒ EventRejectedError', () => {
    const bus = new InMemoryEventBus({ clock: clock(), audienceOf: audience({ 'chat.delta': 'V' }) });
    expect(() => bus.publish(WS_A, { ...attention, count: -1 })).toThrow(EventRejectedError);
    const token = ['sk', 'ant', 'api03', 'K'.repeat(40)].join('-');
    expect(() =>
      bus.publish(WS_A, { type: 'chat.delta', threadId: WS_B, messageId: WS_B, text: `lộ ${token}` }),
    ).toThrow(EventRejectedError);
    expect(LogLineEvent.shape.type.value).toBe('log.line');
    expect(() => bus.publish(WS_A, { type: 'log.line' } as never)).toThrow(EventRejectedError);
  });
});

describe('khán giả theo quyền của phiên kết nối', () => {
  it('viewer KHÔNG nhận sự kiện A; admin nhận; owner nhận O', async () => {
    const bus = new InMemoryEventBus({
      clock: clock(),
      audienceOf: audience({ 'grid.changed': 'A', 'attention.changed': 'V', 'credential.blocked': 'O' }),
    });
    const viewer = bus.subscribe(WS_A, { userId: 'v', authLevel: 'V' });
    const admin = bus.subscribe(WS_A, { userId: 'a', authLevel: 'A' });
    const owner = bus.subscribe(WS_A, { userId: 'o', authLevel: 'O' });
    const g = bus.publish(WS_A, grid);
    const at = bus.publish(WS_A, attention);
    expect(await drain(viewer, 3)).toEqual([at]);
    expect(await drain(admin, 3)).toEqual([g, at]);
    expect(await drain(owner, 3)).toEqual([g, at]);
  });
  it('bảng cục bộ fail-closed: mọi loại O (trừ notification = recipient, resync = V) cho tới khi có SSE_EVENT_AUDIENCE', () => {
    for (const [type, aud] of Object.entries(LOCAL_SSE_EVENT_AUDIENCE)) {
      if (type === 'notification') expect(aud).toBe('recipient');
      else if (type === 'resync') expect(aud).toBe('V');
      else expect(aud, type).toBe('O');
    }
  });
  it('notification chỉ tới đúng user nhận (user X không nhận của user Y); thiếu recipient ⇒ từ chối', async () => {
    const bus = new InMemoryEventBus({ clock: clock() });
    const x = bus.subscribe(WS_A, { userId: 'user-x', authLevel: 'O' });
    const y = bus.subscribe(WS_A, { userId: 'user-y', authLevel: 'O' });
    expect(() => bus.publish(WS_A, notification)).toThrow(EventRejectedError);
    const ev = bus.publish(WS_A, notification, { recipientUserId: 'user-y' });
    expect(await drain(x, 2)).toEqual([]);
    expect(await drain(y, 2)).toEqual([ev]);
  });
  it('loại chưa có khán giả ⇒ từ chối (fail-closed)', () => {
    const bus = new InMemoryEventBus({ clock: clock(), audienceOf: () => undefined });
    expect(() => bus.publish(WS_A, attention)).toThrow(EventRejectedError);
  });
});

describe('áp lực ngược', () => {
  it('hàng đợi đầy ⇒ xoá hàng đợi, giao resync{gap} rồi kết thúc; subscriber khác không ảnh hưởng', async () => {
    const bus = new InMemoryEventBus({
      clock: clock(),
      audienceOf: audience({ 'attention.changed': 'V' }),
      maxQueue: 3,
    });
    const slow = bus.subscribe(WS_A, { userId: 'slow', authLevel: 'V' });
    const fast = bus.subscribe(WS_A, { userId: 'fast', authLevel: 'V' }, { maxQueue: 100 });
    for (let i = 0; i < 5; i++) bus.publish(WS_A, { ...attention, count: i });
    expect(slow.closed).toBe(true);
    const got = await drain(slow, 10);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ type: 'resync', reason: 'gap', workspaceId: WS_A });
    expect((await slow.next()).done).toBe(true);
    expect(await drain(fast, 10)).toHaveLength(5);
    bus.publish(WS_A, attention);
    expect(await drain(slow, 1)).toEqual([]);
  });
});

describe('phát lại Last-Event-ID', () => {
  it('nối lại từ id ⇒ chỉ sự kiện sau id đó, VẪN lọc theo quyền của phiên đang nối', async () => {
    const bus = new InMemoryEventBus({
      clock: clock(),
      audienceOf: audience({ 'grid.changed': 'A', 'attention.changed': 'V' }),
    });
    const e1 = bus.publish(WS_A, attention);
    const e2 = bus.publish(WS_A, grid);
    const e3 = bus.publish(WS_A, { ...attention, count: 9 });
    bus.publish(WS_B, attention);
    const asAdmin = bus.subscribe(WS_A, { userId: 'a', authLevel: 'A' }, { lastEventId: e1.id });
    expect(await drain(asAdmin, 5)).toEqual([e2, e3]);
    const asViewer = bus.subscribe(WS_A, { userId: 'v', authLevel: 'V' }, { lastEventId: e1.id });
    expect(await drain(asViewer, 5)).toEqual([e3]);
  });
  it('id của lần chạy khác / rác ⇒ resync{restart}; rơi khỏi bộ đệm (số lượng / thời gian) ⇒ resync{gap}', async () => {
    const c = clock();
    const bus = new InMemoryEventBus({
      clock: c,
      audienceOf: audience({ 'attention.changed': 'V' }),
      replay: { events: 3, seconds: 60 },
    });
    const first = bus.publish(WS_A, attention);
    for (let i = 0; i < 5; i++) bus.publish(WS_A, attention);
    const gap = bus.subscribe(WS_A, { userId: 'v', authLevel: 'V' }, { lastEventId: first.id });
    expect((await drain(gap, 1))[0]).toMatchObject({ type: 'resync', reason: 'gap' });
    const other = new InMemoryEventBus({ clock: c, audienceOf: audience({ 'attention.changed': 'V' }) });
    const restart = other.subscribe(WS_A, { userId: 'v', authLevel: 'V' }, { lastEventId: first.id });
    expect((await drain(restart, 1))[0]).toMatchObject({ type: 'resync', reason: 'restart' });
    const junk = bus.subscribe(WS_A, { userId: 'v', authLevel: 'V' }, { lastEventId: '../../etc' });
    expect((await drain(junk, 1))[0]).toMatchObject({ type: 'resync', reason: 'restart' });
    const last = bus.publish(WS_A, attention);
    c.advance(61_000);
    const old = bus.subscribe(WS_A, { userId: 'v', authLevel: 'V' }, { lastEventId: last.id });
    expect(await drain(old, 1)).toEqual([]);
  });
});

describe('disconnect + async iterator', () => {
  it('disconnect(ws, user) đóng đúng kết nối của user đó', async () => {
    const bus = new InMemoryEventBus({ clock: clock(), audienceOf: audience({ 'attention.changed': 'V' }) });
    const u1 = bus.subscribe(WS_A, { userId: 'u1', authLevel: 'V' });
    const u2 = bus.subscribe(WS_A, { userId: 'u2', authLevel: 'V' });
    expect(bus.disconnect(WS_A, 'u1')).toBe(1);
    expect(u1.closed).toBe(true);
    bus.publish(WS_A, attention);
    expect(await drain(u2, 2)).toHaveLength(1);
  });
  it('for await … break ⇒ tự đóng subscriber', async () => {
    const bus = new InMemoryEventBus({ clock: clock(), audienceOf: audience({ 'attention.changed': 'V' }) });
    const sub = bus.subscribe(WS_A, { userId: 'u', authLevel: 'V' });
    bus.publish(WS_A, attention);
    for await (const ev of sub) {
      expect(ev.type).toBe('attention.changed');
      break;
    }
    expect(sub.closed).toBe(true);
  });
});
