import type { StreamEvent } from '@ga/contracts';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { type ClientEvent, createClientEvents } from '../../src/api/events.ts';
import { routeKey } from '../../src/api/keys.ts';
import { connectStream, createSseParser, type EventStreamOptions, openEventStream } from '../../src/api/stream.ts';
import { errorBody, json, recordingFetch, ULID } from './support.ts';

const base = { workspaceId: ULID, at: '2026-10-17T00:00:00.000Z' };
const frame = (ev: Record<string, unknown>, sseId?: string) =>
  `${sseId ? `id: ${sseId}\n` : ''}data: ${JSON.stringify(ev)}\n\n`;
const resync = (id: string, reason: 'gap' | 'restart' = 'gap') => ({ ...base, id, type: 'resync', reason });
const gridChanged = (id: string, grid: string) => ({
  ...base,
  id,
  type: 'grid.changed',
  grid,
  displayIds: ['RL-0001'],
  op: 'update',
});

/** Thân SSE điều khiển được: `push` ghi khung, `end` đóng luồng (mô phỏng rớt kết nối). */
function sseBody() {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
    },
  });
  return {
    response: () => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    push: (s: string) => ctrl.enqueue(enc.encode(s)),
    end: () => ctrl.close(),
  };
}

async function until(cond: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`hết giờ chờ: ${what}`);
}

const fastOpts = (delays: number[]): Partial<EventStreamOptions> => ({
  validate: true,
  jitter: 0,
  // phải nhường vòng lặp sự kiện (setTimeout 0), nếu không vòng nối lại chỉ toàn microtask sẽ làm đói test
  sleep: (ms) => {
    delays.push(ms);
    return new Promise((r) => setTimeout(r, 0));
  },
});

describe('bộ phân tích text/event-stream', () => {
  it('CRLF / CR / LF, data nhiều dòng, chú thích keepalive, khung cắt đôi giữa các chunk', () => {
    const got: { id: string | null; data: string }[] = [];
    const p = createSseParser((f) => got.push(f));
    p.push(': ping\r\n\r\n');
    p.push('id: 7\r\ndata: {"a":\r\ndata: 1}\r\n\r');
    p.push('\ndata: x\r\rdata: y\n\n');
    expect(got).toEqual([
      { id: '7', data: '{"a":\n1}' },
      { id: null, data: 'x' },
      { id: null, data: 'y' },
    ]);
  });
});

describe('luồng SSE', () => {
  it('nối đúng route, KHÔNG có gì ngoài đường dẫn trong URL; cookie cùng origin; sự kiện gõ kiểu tới người nghe', async () => {
    const s = sseBody();
    const rec = recordingFetch(() => s.response());
    const seen: StreamEvent[] = [];
    const stream = openEventStream({ fetchImpl: rec.fetch, ...fastOpts([]) });
    stream.subscribe((e) => seen.push(e));
    s.push(frame(resync('ev-1')));
    await until(() => seen.length === 1, 'sự kiện đầu');
    expect(rec.calls[0]?.url).toBe('/api/v1/stream');
    expect(rec.calls[0]?.headers).toEqual({ accept: 'text/event-stream' });
    expect(seen[0]).toMatchObject({ type: 'resync', reason: 'gap' });
    expect(stream.state).toBe('open');
    stream.close();
    await until(() => stream.state === 'closed', 'đóng');
  });

  it('rớt kết nối ⇒ nối lại, gửi Last-Event-ID của sự kiện cuối; backoff luỹ thừa có trần; mở được thì đặt lại', async () => {
    const bodies = [sseBody(), sseBody(), sseBody(), sseBody()];
    let n = 0;
    const delays: number[] = [];
    const rec = recordingFetch(() => {
      const i = n++;
      // lần 2 và 3: máy chủ lỗi 503 (không mở được) ⇒ backoff tăng; lần 4 mở lại
      if (i === 1 || i === 2) return new Response('', { status: 503 });
      return (bodies[i === 0 ? 0 : 3] as ReturnType<typeof sseBody>).response();
    });
    const seen: StreamEvent[] = [];
    const errors: unknown[] = [];
    const stream = openEventStream({
      fetchImpl: rec.fetch,
      ...fastOpts(delays),
      baseDelayMs: 100,
      maxDelayMs: 300,
      onError: (e) => errors.push(e),
      onEvent: (e) => seen.push(e),
    });
    const b0 = bodies[0] as ReturnType<typeof sseBody>;
    b0.push(frame(gridChanged('ev-41', 'roles'), '41'));
    await until(() => seen.length === 1, 'sự kiện 41');
    b0.end();
    await until(() => rec.calls.length === 4, '4 lần nối');
    // 100 (sau khi luồng đầu kết thúc, vì đã mở nên attempt=0) → 200 → 300 (trần)
    expect(delays.slice(0, 3)).toEqual([100, 200, 300]);
    expect(rec.calls.map((c) => c.headers['last-event-id'])).toEqual([undefined, '41', '41', '41']);
    expect(stream.lastEventId).toBe('41');
    expect(errors).toHaveLength(2);
    // mở được ⇒ lần rớt tiếp theo bắt đầu lại từ base
    const b3 = bodies[3] as ReturnType<typeof sseBody>;
    await until(() => stream.state === 'open', 'mở lại');
    b3.end();
    await until(() => delays.length >= 4, 'backoff lần 4');
    expect(delays[3]).toBe(100);
    stream.close();
  });

  it('jitter nằm trong biên độ và không vượt trần', async () => {
    const delays: number[] = [];
    const rec = recordingFetch(() => new Response('', { status: 503 }));
    const stream = openEventStream({
      fetchImpl: rec.fetch,
      validate: true,
      baseDelayMs: 1000,
      maxDelayMs: 1000,
      jitter: 0.2,
      random: () => 1,
      sleep: (ms) => {
        delays.push(ms);
        return delays.length >= 3 ? new Promise(() => {}) : new Promise((r) => setTimeout(r, 0));
      },
      onError: () => {},
    });
    await until(() => delays.length >= 3, 'backoff');
    expect(delays.every((d) => d <= 1000 && d >= 800)).toBe(true);
    stream.close();
  });

  it('im lặng quá hạn keepalive ⇒ coi là chết, nối lại', async () => {
    const bodies = [sseBody(), sseBody()];
    let n = 0;
    const rec = recordingFetch(() => (bodies[n++] as ReturnType<typeof sseBody>).response());
    const stream = openEventStream({ fetchImpl: rec.fetch, ...fastOpts([]), idleTimeoutMs: 30 });
    await until(() => rec.calls.length === 2, 'nối lại sau im lặng');
    stream.close();
  });

  it('401 ⇒ phát unauthorized và DỪNG (không nối lại); 423 phát recovery_blocked', async () => {
    const events = createClientEvents();
    const seen: ClientEvent[] = [];
    events.subscribe((e) => seen.push(e));
    const rec = recordingFetch(() => json(errorBody('auth.required'), 401));
    const errors: unknown[] = [];
    const stream = openEventStream({ fetchImpl: rec.fetch, events, ...fastOpts([]), onError: (e) => errors.push(e) });
    await until(() => stream.state === 'closed', 'dừng');
    expect(rec.calls).toHaveLength(1);
    expect(seen).toEqual([{ type: 'unauthorized', routeId: 'SYS-85' }]);
    expect(errors).toHaveLength(1);
  });

  it('khung sai schema bị bỏ + báo lỗi, luồng vẫn sống; khung JSON hỏng cũng vậy', async () => {
    const s = sseBody();
    const rec = recordingFetch(() => s.response());
    const seen: StreamEvent[] = [];
    const errors: unknown[] = [];
    const stream = openEventStream({
      fetchImpl: rec.fetch,
      ...fastOpts([]),
      onEvent: (e) => seen.push(e),
      onError: (e) => errors.push(e),
    });
    s.push(frame({ ...resync('ev-2'), reason: 'khong-co' }));
    s.push('data: {hong\n\n');
    s.push(frame(resync('ev-3', 'restart')));
    await until(() => seen.length === 1, 'sự kiện hợp lệ');
    expect(errors).toHaveLength(2);
    expect(seen[0]).toMatchObject({ id: 'ev-3', reason: 'restart' });
    stream.close();
  });

  it('connectStream: grid.changed chỉ làm hết lưới đúng; resync làm hết mọi thứ', async () => {
    const s = sseBody();
    const rec = recordingFetch(() => s.response());
    const qc = new QueryClient();
    const roles = routeKey('OPS-33', { params: { gridKey: 'roles' } });
    const tasks = routeKey('OPS-33', { params: { gridKey: 'tasks' } });
    qc.setQueryData(roles, {});
    qc.setQueryData(tasks, {});
    const seen: StreamEvent[] = [];
    const stream = connectStream({
      queryClient: qc,
      fetchImpl: rec.fetch,
      ...fastOpts([]),
      onEvent: (e) => seen.push(e),
    });
    s.push(frame(gridChanged('ev-1', 'roles')));
    await until(() => seen.length === 1, 'grid.changed');
    await until(() => qc.getQueryState(roles)?.isInvalidated === true, 'roles hết đúng');
    expect(qc.getQueryState(tasks)?.isInvalidated).toBe(false);
    s.push(frame(resync('ev-2')));
    await until(() => qc.getQueryState(tasks)?.isInvalidated === true, 'resync');
    stream.close();
  });

  it('route không phải SSE bị từ chối ngay', () => {
    expect(() => openEventStream({ route: 'OPS-32' as never })).toThrow(/SSE/);
  });
});
