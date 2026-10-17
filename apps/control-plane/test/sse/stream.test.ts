// SYS-85 luồng SSE: workspace + khán giả + người nhận theo PHIÊN; Last-Event-ID phát lại có lọc; khung không chèn được.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sysHandlers } from '../../src/onboarding/sys-handlers.ts';
import { sseFrame } from '../../src/sse/handlers.ts';
import { makeTestApp, type TestApp, type Who } from '../http/harness.ts';

let t: TestApp;
beforeAll(() => {
  t = makeTestApp({ handlers: sysHandlers, sse: { keepAliveMs: 30, maxDurationMs: 250 } });
});
afterAll(() => t.close());

const wsA = () => t.world.tenants.A.workspaceId;
const wsB = () => t.world.tenants.B.workspaceId;
const ULID_X = '01J8AAAAAAAAAAAAAAAAAAAAAA';

/** Mở luồng, chờ subscriber gắn vào bus, chạy `during`, đọc tới khi server đóng (tuổi tối đa). */
async function stream(who: Who, during: () => void, headers: Record<string, string> = {}) {
  const p = t.as(who).call('SYS-85', { headers });
  await new Promise((r) => setTimeout(r, 40));
  during();
  return p;
}

const events = (text: string) =>
  text
    .split('\n\n')
    .filter((f) => f.includes('data: '))
    .map((f) => JSON.parse(f.slice(f.indexOf('data: ') + 6)) as { id: string; type: string; workspaceId: string });

describe('SYS-85', () => {
  it('viewer A: nhận sự kiện V của A + thông báo của chính mình; KHÔNG nhận sự kiện A-level, của B, thông báo người khác', async () => {
    const viewer = t.world.user('A.viewer');
    const owner = t.world.user('A.owner');
    const res = await stream('A.viewer', () => {
      t.events.publish(wsA(), { type: 'attention.changed', count: 1, maxSeverity: 'warn' });
      t.events.publish(wsA(), {
        type: 'chat.turn',
        threadId: ULID_X,
        state: 'running',
        sessionDisplayId: null,
        rejection: null,
      });
      t.events.publish(wsB(), { type: 'attention.changed', count: 9, maxSeverity: 'danger' });
      t.events.publish(
        wsA(),
        { type: 'notification', notificationDisplayId: 'NT-0001', severity: 'info', kind: 'k' },
        { recipientUserId: viewer.userId },
      );
      t.events.publish(
        wsA(),
        { type: 'notification', notificationDisplayId: 'NT-0002', severity: 'info', kind: 'k' },
        { recipientUserId: owner.userId },
      );
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/event-stream/);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const got = events(res.text);
    expect(got.map((e) => e.type)).toEqual(['attention.changed', 'notification']);
    expect(got.every((e) => e.workspaceId === wsA())).toBe(true);
    expect(res.text).not.toContain('NT-0002');
    expect(res.text).toMatch(/^: open\n\n/);
  });

  it('owner A nhận chat.turn (A-level); Last-Event-ID phát lại phần sau id, lọc theo phiên đang nối', async () => {
    const first = t.events.publish(wsA(), { type: 'attention.changed', count: 2, maxSeverity: 'info' });
    t.events.publish(wsA(), {
      type: 'chat.turn',
      threadId: ULID_X,
      state: 'done',
      sessionDisplayId: null,
      rejection: null,
    });
    t.events.publish(wsA(), { type: 'attention.changed', count: 3, maxSeverity: 'info' });
    const owner = await stream('A.owner', () => {}, { 'last-event-id': first.id });
    expect(events(owner.text).map((e) => e.type)).toEqual(['chat.turn', 'attention.changed']);
    const viewer = await stream('A.viewer', () => {}, { 'last-event-id': first.id });
    expect(events(viewer.text).map((e) => e.type)).toEqual(['attention.changed']);
  });

  it('Last-Event-ID lạ (lần chạy khác) ⇒ resync', async () => {
    const res = await stream('A.viewer', () => {}, { 'last-event-id': 'abcdefabcdef.5' });
    expect(events(res.text).map((e) => e.type)).toEqual(['resync']);
  });

  it('khung SSE: id / type có xuống dòng ⇒ ném (không chèn được khung giả)', () => {
    const ev = t.events.publish(wsA(), { type: 'attention.changed', count: 0, maxSeverity: null });
    expect(sseFrame(ev)).toMatch(/^id: [0-9a-f]{12}\.\d+\nevent: attention\.changed\ndata: \{.*\}\n\n$/);
    expect(() => sseFrame({ ...ev, id: 'x\ndata: {}' })).toThrow();
  });
});
