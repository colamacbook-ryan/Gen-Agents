// EventBus trong bộ nhớ cho SSE `GET /api/v1/stream` (BACKEND-TRIAL §3.7; contracts `sse.ts`). Endpoint `/stream` thuộc L-SYS;
// đây chỉ là bus + giao diện subscribe. Luật:
//   - Phạm vi workspace BẮT BUỘC: publish ghi đè phong bì `{id, workspaceId, at}` — người gọi không truyền được (có khoá đó ⇒
//     TypeError); subscriber chỉ nhận sự kiện của workspace mình.
//   - Khán giả (audience) mỗi loại sự kiện: 'V' | 'A' | 'O' (mức tối thiểu) hoặc 'recipient' (đúng một user — `notification`).
//     Subscriber lọc theo quyền của phiên kết nối. Bảng khán giả inject được (`audienceOf`) để dùng `SSE_EVENT_AUDIENCE`
//     của contracts khi L-API thêm; tới lúc đó bảng cục bộ FAIL-CLOSED: mọi loại 'O', `notification` = 'recipient'.
//   - Sự kiện kiểm schema `StreamEvent` (strict) + quét credential (`findCredentialLike`) TRƯỚC khi vào bộ đệm — sai ⇒ ném
//     (không phát rác, không phát token).
//   - Áp lực ngược: hàng đợi mỗi subscriber có trần; tràn ⇒ xoá hàng đợi, đẩy `resync {reason:'gap'}` rồi đóng subscriber
//     (client đọc lại bằng GET rồi nối lại).
//   - Bộ đệm phát lại RIÊNG mỗi workspace (SSE_REPLAY_BUFFER: số sự kiện + số giây) cho `Last-Event-ID`; phát lại vẫn lọc
//     theo quyền của phiên ĐANG nối (không theo lúc phát). Mất khoảng / id của lần chạy khác ⇒ `resync`.
import { randomBytes } from 'node:crypto';
import {
  authAtLeast,
  type Clock,
  findCredentialLike,
  SSE_REPLAY_BUFFER,
  StreamEvent,
  toDbTimestamp,
} from '@ga/contracts';

export type StreamEventType = StreamEvent['type'];
type EnvelopeKey = 'id' | 'workspaceId' | 'at';
/** Sự kiện handler phát: không có phong bì (bus tự điền). */
export type StreamEventInput = StreamEvent extends infer E ? (E extends unknown ? Omit<E, EnvelopeKey> : never) : never;

export type EventAudience = 'V' | 'A' | 'O' | 'recipient';
export type ViewerLevel = 'V' | 'A' | 'O';

/**
 * Bảng khán giả CỤC BỘ, fail-closed, dùng cho tới khi contracts có `SSE_EVENT_AUDIENCE` (L-API, feat/m2-api) — khi đó
 * truyền bảng của contracts vào `audienceOf` và xoá bảng này. Không tự "đoán" mức thấp hơn cho loại nào.
 */
export const LOCAL_SSE_EVENT_AUDIENCE: Readonly<Record<StreamEventType, EventAudience>> = {
  'role.state': 'O',
  'avatar.state': 'O',
  'chat.delta': 'O',
  'chat.tool': 'O',
  'ui.action': 'O',
  notification: 'recipient',
  'core_agent.status': 'O',
  'job.progress': 'O',
  'update.step': 'O',
  'probe.result': 'O',
  'engine.install': 'O',
  'pty.closed': 'O',
  'credential.blocked': 'O',
  'chat.message': 'O',
  'chat.turn': 'O',
  'changeset.state': 'O',
  'grid.changed': 'O',
  'attention.changed': 'O',
  'card.step': 'O',
  'trial.progress': 'O',
  'knowledge.progress': 'O',
  'telegram.capture': 'O',
  'wallet.changed': 'O',
  'engine.failover': 'O',
  resync: 'V',
};

export interface EventViewer {
  readonly userId: string;
  readonly authLevel: ViewerLevel;
}

export interface PublishOptions {
  /** Bắt buộc với loại có khán giả 'recipient' (vd `notification` = user nhận). */
  recipientUserId?: string;
}

export interface SubscribeOptions {
  /** Header `Last-Event-ID` của client (nối lại). */
  lastEventId?: string | null;
  /** Trần hàng đợi riêng (mặc định của bus). */
  maxQueue?: number;
}

export interface EventSubscription extends AsyncIterable<StreamEvent> {
  next(): Promise<IteratorResult<StreamEvent, undefined>>;
  close(): void;
  readonly closed: boolean;
}

export interface EventBus {
  publish(workspaceId: string, event: StreamEventInput, opts?: PublishOptions): StreamEvent;
  subscribe(workspaceId: string, viewer: EventViewer, opts?: SubscribeOptions): EventSubscription;
  /** Đóng mọi kết nối của một user trong workspace (bị gỡ / hạ quyền — L-SYS gọi). Trả số kết nối đã đóng. */
  disconnect(workspaceId: string, userId: string): number;
}

export class EventRejectedError extends Error {
  constructor(reason: string) {
    super(`event bus: từ chối sự kiện (${reason})`);
    this.name = 'EventRejectedError';
  }
}

interface Stored {
  seq: number;
  atMs: number;
  event: StreamEvent;
  audience: EventAudience;
  recipient: string | null;
}

export interface InMemoryEventBusOptions {
  clock: Clock;
  audienceOf?: (type: StreamEventType) => EventAudience | undefined;
  maxQueue?: number;
  replay?: { events: number; seconds: number };
}

const ID_RE = /^([0-9a-f]{12})\.(\d{1,15})$/;

export class InMemoryEventBus implements EventBus {
  private readonly clock: Clock;
  private readonly audienceOf: (type: StreamEventType) => EventAudience | undefined;
  private readonly maxQueue: number;
  private readonly replay: { events: number; seconds: number };
  private readonly bootId = randomBytes(6).toString('hex');
  private seq = 0;
  private readonly buffers = new Map<string, Stored[]>();
  private readonly subs = new Map<string, Set<Sub>>();

  constructor(opts: InMemoryEventBusOptions) {
    this.clock = opts.clock;
    this.audienceOf = opts.audienceOf ?? ((t) => LOCAL_SSE_EVENT_AUDIENCE[t]);
    this.maxQueue = opts.maxQueue ?? 256;
    this.replay = opts.replay ?? SSE_REPLAY_BUFFER;
  }

  private idOf(seq: number): string {
    return `${this.bootId}.${seq}`;
  }

  publish(workspaceId: string, event: StreamEventInput, opts: PublishOptions = {}): StreamEvent {
    for (const k of ['id', 'workspaceId', 'at'] as const) {
      if (Object.hasOwn(event as object, k))
        throw new TypeError(`event bus: không truyền "${k}" — bus tự điền phong bì`);
    }
    const type = (event as { type: StreamEventType }).type;
    const audience = this.audienceOf(type);
    if (audience === undefined) throw new EventRejectedError(`loại ${String(type)} chưa có khán giả`);
    if (audience === 'recipient' && !opts.recipientUserId) throw new EventRejectedError(`${type} cần recipientUserId`);
    const now = this.clock.now();
    const seq = this.seq + 1;
    const parsed = StreamEvent.safeParse({ ...event, id: this.idOf(seq), workspaceId, at: toDbTimestamp(now) });
    if (!parsed.success) throw new EventRejectedError(`sai schema (${type})`);
    if (findCredentialLike(parsed.data) !== null) throw new EventRejectedError(`giống credential (${type})`);
    this.seq = seq;
    const stored: Stored = {
      seq,
      atMs: now.getTime(),
      event: parsed.data,
      audience,
      recipient: audience === 'recipient' ? (opts.recipientUserId ?? null) : null,
    };
    const buf = this.buffers.get(workspaceId) ?? [];
    buf.push(stored);
    this.trim(buf, now.getTime());
    this.buffers.set(workspaceId, buf);
    for (const s of [...(this.subs.get(workspaceId) ?? [])]) {
      if (canSee(s.viewer, stored)) s.push(stored.event);
    }
    return parsed.data;
  }

  private trim(buf: Stored[], nowMs: number): void {
    const minAt = nowMs - this.replay.seconds * 1000;
    let drop = 0;
    while (drop < buf.length && (buf.length - drop > this.replay.events || (buf[drop] as Stored).atMs < minAt)) drop++;
    if (drop > 0) buf.splice(0, drop);
  }

  subscribe(workspaceId: string, viewer: EventViewer, opts: SubscribeOptions = {}): EventSubscription {
    const frozenViewer = Object.freeze({ userId: viewer.userId, authLevel: viewer.authLevel });
    const sub = new Sub(
      frozenViewer,
      opts.maxQueue ?? this.maxQueue,
      (s) => this.subs.get(workspaceId)?.delete(s),
      () => this.resyncEvent(workspaceId, 'gap'),
    );
    if (opts.lastEventId) {
      const buf = this.buffers.get(workspaceId) ?? [];
      this.trim(buf, this.clock.now().getTime());
      const m = ID_RE.exec(opts.lastEventId);
      const lastSeq = m ? Number(m[2]) : Number.NaN;
      if (!m || m[1] !== this.bootId || lastSeq > this.seq) {
        sub.push(this.resyncEvent(workspaceId, 'restart'));
      } else {
        const oldest = buf[0]?.seq ?? this.seq + 1;
        if (lastSeq < oldest - 1) sub.push(this.resyncEvent(workspaceId, 'gap'));
        else for (const st of buf) if (st.seq > lastSeq && canSee(frozenViewer, st)) sub.push(st.event);
      }
    }
    if (!sub.closed) {
      let set = this.subs.get(workspaceId);
      if (!set) {
        set = new Set();
        this.subs.set(workspaceId, set);
      }
      set.add(sub);
    }
    return sub;
  }

  disconnect(workspaceId: string, userId: string): number {
    let n = 0;
    for (const s of [...(this.subs.get(workspaceId) ?? [])]) {
      if (s.viewer.userId === userId) {
        s.close();
        n++;
      }
    }
    return n;
  }

  /** `resync` riêng cho một subscriber: id = sự kiện mới nhất hiện có (nối lại từ đó chỉ nhận sự kiện mới hơn). */
  private resyncEvent(workspaceId: string, reason: 'gap' | 'restart'): StreamEvent {
    return StreamEvent.parse({
      type: 'resync',
      reason,
      id: this.idOf(this.seq),
      workspaceId,
      at: toDbTimestamp(this.clock.now()),
    });
  }
}

function canSee(viewer: EventViewer, st: Stored): boolean {
  if (st.audience === 'recipient') return st.recipient !== null && st.recipient === viewer.userId;
  return authAtLeast(viewer.authLevel, st.audience);
}

class Sub implements EventSubscription {
  readonly viewer: EventViewer;
  private readonly maxQueue: number;
  private readonly onClose: (s: Sub) => void;
  private readonly overflowEvent: () => StreamEvent;
  private queue: StreamEvent[] = [];
  private waiter: ((r: IteratorResult<StreamEvent, undefined>) => void) | null = null;
  private ended = false;
  /** Đã tràn: còn giao nốt hàng đợi (chỉ có resync) rồi kết thúc. */
  private draining = false;

  constructor(viewer: EventViewer, maxQueue: number, onClose: (s: Sub) => void, overflowEvent: () => StreamEvent) {
    this.viewer = viewer;
    this.maxQueue = Math.max(1, maxQueue);
    this.onClose = onClose;
    this.overflowEvent = overflowEvent;
  }

  get closed(): boolean {
    return this.ended || this.draining;
  }

  push(ev: StreamEvent): void {
    if (this.closed) return;
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w({ value: ev, done: false });
      return;
    }
    if (this.queue.length >= this.maxQueue) {
      // tràn: bỏ subscriber — client nhận resync rồi đọc lại bằng GET
      this.queue = [this.overflowEvent()];
      this.draining = true;
      this.onClose(this);
      return;
    }
    this.queue.push(ev);
  }

  next(): Promise<IteratorResult<StreamEvent, undefined>> {
    const ev = this.queue.shift();
    if (ev !== undefined) return Promise.resolve({ value: ev, done: false });
    if (this.ended || this.draining) {
      this.ended = true;
      return Promise.resolve({ value: undefined, done: true });
    }
    return new Promise((resolve) => {
      this.waiter = resolve;
    });
  }

  close(): void {
    if (this.ended) return;
    this.ended = true;
    this.queue = [];
    this.onClose(this);
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<StreamEvent, undefined> {
    return {
      next: () => this.next(),
      return: () => {
        this.close();
        return Promise.resolve({ value: undefined, done: true });
      },
    };
  }
}
