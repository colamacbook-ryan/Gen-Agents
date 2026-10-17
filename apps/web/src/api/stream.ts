import { API_AUTH, routeById, SSE_KEEPALIVE_SECONDS, type StreamEvent } from '@ga/contracts';
import type { QueryClient } from '@tanstack/react-query';
import { buildPath, defaultValidate, serializeQuery } from './client.ts';
import { ApiError, apiErrorFromResponse } from './error.ts';
import type { ClientEvents } from './events.ts';
import { applyStreamEvent } from './invalidation.ts';
import type { StreamId } from './routes.ts';

// Máy khách SSE cho luồng của hợp đồng (SYS-85 `/stream`, OPS-24 `/logs/stream`).
// Dùng fetch + bộ đọc `text/event-stream` thay vì `EventSource`, vì EventSource (1) không đặt được header `Last-Event-ID` khi MÌNH tạo kết nối
// lại, (2) không thấy mã HTTP (401 / 423) nên không phân biệt "hết phiên" với "rớt mạng", (3) không có trần backoff.
//   - Cookie phiên đi theo `credentials: 'same-origin'`; URL KHÔNG mang token / vé / secret nào (chỉ đường dẫn của route).
//   - Rớt kết nối / 5xx / im lặng quá 3 chu kỳ keepalive ⇒ nối lại, backoff luỹ thừa có trần + jitter, gửi `Last-Event-ID` lần cuối.
//   - 401 ⇒ sự kiện `unauthorized`, dừng. Lỗi 4xx khác ⇒ báo `onError`, dừng. `resync` ⇒ `connectStream` đọc lại TẤT CẢ.

export type StreamState = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface EventStreamOptions {
  /** mặc định 'SYS-85' */
  route?: StreamId;
  query?: Record<string, unknown>;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  /** để phát `unauthorized` khi 401 */
  events?: ClientEvents;
  validate?: boolean;
  onEvent?: (event: StreamEvent) => void;
  onState?: (state: StreamState) => void;
  onError?: (error: unknown) => void;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** 0..1: biên độ ngẫu nhiên ± so với độ trễ */
  jitter?: number;
  random?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  /** im lặng quá ngần này thì coi là chết (mặc định 3 × SSE_KEEPALIVE_SECONDS) */
  idleTimeoutMs?: number;
  /** mở liên tục ngần này thì coi là ổn định và đặt lại backoff (mặc định 10 s) */
  stableMs?: number;
}

export interface EventStream {
  close(): void;
  readonly state: StreamState;
  /** id của sự kiện cuối đã nhận (null nếu chưa có) */
  readonly lastEventId: string | null;
  /** nghe thêm sự kiện đã gõ kiểu (màn chat nhận `chat.delta` ở đây); trả hàm huỷ */
  subscribe(listener: (event: StreamEvent) => void): () => void;
}

const defaultSleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const t = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
    function done() {
      clearTimeout(t);
      signal.removeEventListener('abort', done);
      resolve();
    }
  });

interface RawFrame {
  id: string | null;
  data: string;
}

/** Bộ phân tích `text/event-stream` (WHATWG HTML §9.2.6): dòng `field: value`, dòng trống = phát, `:` = chú thích. */
export function createSseParser(onFrame: (f: RawFrame) => void) {
  let buffer = '';
  let data: string[] = [];
  let id: string | null = null;
  let skipLf = false;

  const line = (l: string) => {
    if (l === '') {
      if (data.length > 0) onFrame({ id, data: data.join('\n') });
      data = [];
      id = null;
      return;
    }
    if (l.startsWith(':')) return;
    const i = l.indexOf(':');
    const field = i === -1 ? l : l.slice(0, i);
    let value = i === -1 ? '' : l.slice(i + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') data.push(value);
    else if (field === 'id' && !value.includes('\0')) id = value;
    // `event:` bỏ qua: loại sự kiện nằm trong thân JSON (`type`); `retry:` không dùng (backoff của máy khách có trần)
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      let start = 0;
      for (let i = 0; i < buffer.length; i++) {
        const c = buffer[i];
        if (skipLf && i === start && c === '\n') {
          skipLf = false;
          start = i + 1;
          continue;
        }
        skipLf = false;
        if (c === '\n' || c === '\r') {
          line(buffer.slice(start, i));
          start = i + 1;
          if (c === '\r') {
            if (buffer[i + 1] === '\n') {
              i++;
              start = i + 1;
            } else if (i + 1 >= buffer.length) skipLf = true;
          }
        }
      }
      buffer = buffer.slice(start);
    },
  };
}

export function openEventStream(opts: EventStreamOptions): EventStream {
  const routeId = opts.route ?? 'SYS-85';
  const route = routeById(routeId);
  const response = route?.response;
  if (!route || response?.kind !== 'sse') throw new Error(`${routeId} không phải route SSE`);
  const eventsSchema = response.events;
  const validate = opts.validate ?? defaultValidate();
  const qs = new URLSearchParams(serializeQuery(opts.query)).toString();
  const url = `${opts.baseUrl ?? ''}${buildPath(route)}${qs ? `?${qs}` : ''}`;
  const doFetch = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;
  const base = opts.baseDelayMs ?? 500;
  const ceiling = opts.maxDelayMs ?? 30_000;
  const jitter = opts.jitter ?? 0.2;
  const idleMs = opts.idleTimeoutMs ?? SSE_KEEPALIVE_SECONDS * 3 * 1000;
  const stableMs = opts.stableMs ?? 10_000;
  const listeners = new Set<(e: StreamEvent) => void>();
  const outer = new AbortController();

  let attempt = 0;
  let openedAt = 0;
  let gotEvent = false;
  let state: StreamState = 'connecting';
  let lastEventId: string | null = null;
  const setState = (s: StreamState) => {
    if (state === s) return;
    state = s;
    opts.onState?.(s);
  };
  const fail = (e: unknown) => opts.onError?.(e);

  function dispatch(frame: RawFrame) {
    let value: unknown;
    try {
      value = JSON.parse(frame.data);
    } catch (cause) {
      fail(new ApiError({ code: 'bad_response', httpStatus: 200, i18nKey: 'errors.bad_response', routeId }, { cause }));
      return;
    }
    if (validate) {
      const r = eventsSchema.safeParse(value);
      if (!r.success) {
        fail(
          new ApiError(
            { code: 'bad_response', httpStatus: 200, i18nKey: 'errors.bad_response', routeId },
            { cause: r.error },
          ),
        );
        return;
      }
      value = r.data;
    }
    const payloadId = (value as { id?: unknown }).id;
    const id = frame.id ?? (typeof payloadId === 'string' ? payloadId : null);
    gotEvent = true;
    if (id !== null) lastEventId = id;
    const event = value as StreamEvent;
    opts.onEvent?.(event);
    for (const l of [...listeners]) l(event);
  }

  /** Một kết nối: trả về khi luồng kết thúc / im lặng quá lâu. Ném lỗi mạng. */
  async function connectOnce(): Promise<'ended' | 'stop'> {
    const conn = new AbortController();
    const abort = () => conn.abort();
    outer.signal.addEventListener('abort', abort, { once: true });
    const headers: Record<string, string> = { accept: 'text/event-stream' };
    if (lastEventId !== null) headers[API_AUTH.lastEventIdHeader] = lastEventId;
    try {
      const res = await doFetch(url, {
        method: 'GET',
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: conn.signal,
      });
      if (!res.ok) {
        const err = await apiErrorFromResponse(res, routeId);
        if (res.status === 401) opts.events?.emit({ type: 'unauthorized', routeId });
        else if (err.code === 'recovery.blocked')
          opts.events?.emit({ type: 'recovery_blocked', routeId, requestId: err.requestId });
        if (res.status >= 500 || res.status === 408 || res.status === 429) throw err;
        fail(err);
        return 'stop';
      }
      if (!res.body) throw new Error('phản hồi SSE không có thân');
      setState('open');
      openedAt = Date.now();
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      const parser = createSseParser(dispatch);
      const aborted = new Promise<'aborted'>((resolve) => {
        conn.signal.addEventListener('abort', () => resolve('aborted'), { once: true });
      });
      for (;;) {
        let idle: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<'idle'>((resolve) => {
          idle = setTimeout(() => resolve('idle'), idleMs);
        });
        const r = await Promise.race([reader.read(), timeout, aborted]);
        clearTimeout(idle);
        if (r === 'idle' || r === 'aborted') {
          void reader.cancel().catch(() => {});
          return 'ended';
        }
        if (r.done) return 'ended';
        parser.push(decoder.decode(r.value, { stream: true }));
      }
    } finally {
      outer.signal.removeEventListener('abort', abort);
      conn.abort();
    }
  }

  async function run() {
    while (!outer.signal.aborted) {
      openedAt = 0;
      gotEvent = false;
      try {
        if ((await connectOnce()) === 'stop') break;
      } catch (e) {
        if (outer.signal.aborted) break;
        fail(e);
      }
      // backoff chỉ về đầu khi kết nối ĐÃ ổn định (nhận được sự kiện, hoặc mở đủ lâu); máy chủ mở rồi đóng ngay không được nối lại liên tục
      if (gotEvent || (openedAt > 0 && Date.now() - openedAt >= stableMs)) attempt = 0;
      if (outer.signal.aborted) break;
      setState('reconnecting');
      const raw = Math.min(ceiling, base * 2 ** attempt);
      attempt++;
      const delay = Math.min(ceiling, Math.max(0, raw * (1 + jitter * (2 * random() - 1))));
      await sleep(delay, outer.signal);
    }
    setState('closed');
  }
  void run();

  return {
    close() {
      outer.abort();
    },
    get state() {
      return state;
    },
    get lastEventId() {
      return lastEventId;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export interface ConnectStreamOptions extends Omit<EventStreamOptions, 'onEvent'> {
  queryClient: QueryClient;
  onEvent?: (event: StreamEvent) => void;
}

/** Nối luồng `/stream` vào cache: mỗi sự kiện làm hết đúng các truy vấn liên quan; `resync` đọc lại tất cả. */
export function connectStream(opts: ConnectStreamOptions): EventStream {
  const { queryClient, onEvent, ...rest } = opts;
  return openEventStream({
    ...rest,
    onEvent: (event) => {
      void applyStreamEvent(queryClient, event).catch((e: unknown) => opts.onError?.(e));
      onEvent?.(event);
    },
  });
}
