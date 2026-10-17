// Idempotency-Key (BACKEND-TRIAL §3.0; HANDLER-OBLIGATIONS §9) cho route `idempotent` (SYS-19, SYS-74, WRK-23…26).
//   - Khoá = (workspaceId, actorId, routeId, key). Dấu vân tay = route + path params + query + actor + sha256(body chuẩn hoá).
//     Cùng khoá + cùng dấu ⇒ trả lại ĐÚNG kết quả cũ; cùng khoá + khác dấu ⇒ 409 `idempotency.conflict` — KHÔNG BAO GIỜ phát
//     lại kết quả cũ. Đang chạy với cùng khoá ⇒ 409 (reason in_flight). Chỉ lưu kết quả 2xx; lỗi ⇒ nhả khoá.
//   - Khoá chứa `:` ⇒ 400 (tiền tố dành riêng của DB, vd `activate:<role>`; L-API đang cho `IdempotencyKey` từ chối `:`).
//
// Gen quyết 2026-10-17 (sau 2 review bảo mật MEDIUM): dài hạn = bảng DB `idempotency_keys` (DB v2.3.6: UNIQUE (workspace_id,
// actor_id, route_id, key) + fingerprint + status + expires_at + kết quả có trần, job TTL dọn, sống qua khởi động lại) — thay
// bằng một bản `IdempotencyStore` khác trong deps của createApp. Tới lúc đó, bản TRONG BỘ NHỚ dưới đây:
//   - KHÔNG BAO GIỜ evict mục còn hiệu lực (evict ⇒ đẩy khoá nạn nhân ra rồi phát lại = chạy lần 2);
//   - trần theo (workspace) và (workspace, actor); đầy ⇒ 429 CHỈ cho workspace / actor đó — KHÔNG có trần toàn cục từ chối
//     (một tenant flood không chặn tenant khác); bộ nhớ bị chặn bởi Σ trần workspace × số workspace thật;
//   - TTL đồng nhất ⇒ hai hàng đợi FIFO theo hạn (done: `doneTtlMs` mặc định 10 phút; pending: `pendingTimeoutMs` mặc định
//     120 s) ⇒ dọn từ đầu hàng tới mục chưa hạn: O(1) khấu hao, không quét toàn bộ;
//   - `pending` không bao giờ bị evict, nhưng có hạn cứng: handler treo quá `pendingTimeoutMs` ⇒ coi như thất bại, nhả khoá
//     (handler treo đó complete muộn ⇒ bỏ qua nhờ `ticket`).
//   - MẤT KHI KHỞI ĐỘNG LẠI ⇒ route ledger (WRK-23…26) PHẢI ghi khoá xuống `ledger_entries.idempotency_key` (UNIQUE là
//     chốt cuối). SYS-19, SYS-74: DB chưa có cột ⇒ chờ `idempotency_keys`.
import { createHash } from 'node:crypto';
import type { Clock } from '@ga/contracts';

export interface StoredResult {
  status: number;
  body: unknown;
}

export interface IdempotencyKeyRef {
  readonly workspaceId: string;
  readonly actorId: string;
  /** Khoá đầy đủ: workspace + actor + route + khoá client. */
  readonly scope: string;
}

export type BeginResult =
  | { kind: 'new'; ticket: number }
  | { kind: 'replay'; result: StoredResult }
  | { kind: 'conflict'; reason: 'fingerprint' | 'in_flight' }
  | { kind: 'full'; reason: 'actor' | 'workspace' };

/** Giao diện kho — bản DB (`idempotency_keys`, v2.3.6) thay bản bộ nhớ chỉ bằng deps của createApp. */
export interface IdempotencyStore {
  begin(key: IdempotencyKeyRef, fingerprint: string): BeginResult;
  complete(key: IdempotencyKeyRef, ticket: number, result: StoredResult): void;
  abort(key: IdempotencyKeyRef, ticket: number): void;
}

interface Entry {
  ticket: number;
  fingerprint: string;
  workspaceId: string;
  actorId: string;
  state: 'pending' | 'done';
  /** Hạn: pending ⇒ hết thời gian chờ handler; done ⇒ hết thời gian giữ kết quả. */
  expiresAt: number;
  result: StoredResult | null;
}

interface QueueItem {
  scope: string;
  ticket: number;
  state: 'pending' | 'done';
  expiresAt: number;
}

/** Hàng đợi FIFO có con trỏ đầu (shift O(1) khấu hao). */
class Fifo {
  private items: QueueItem[] = [];
  private head = 0;
  push(x: QueueItem): void {
    this.items.push(x);
  }
  peek(): QueueItem | undefined {
    return this.items[this.head];
  }
  shift(): void {
    this.head++;
    if (this.head > 1024 && this.head * 2 > this.items.length) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
  }
}

export interface InMemoryIdempotencyOptions {
  clock: Clock;
  /** Giữ kết quả `done` (mặc định 10 phút). */
  doneTtlMs?: number;
  /** Hạn cứng của `pending` (handler treo) — quá hạn ⇒ nhả khoá (mặc định 120 s). */
  pendingTimeoutMs?: number;
  /** Trần mục mỗi (workspace, actor) (mặc định 1 000). */
  maxPerActor?: number;
  /** Trần mục mỗi workspace (mặc định 10 000). */
  maxPerWorkspace?: number;
}

export const IDEMPOTENCY_DEFAULTS = {
  doneTtlMs: 10 * 60_000,
  pendingTimeoutMs: 120_000,
  maxPerActor: 1_000,
  maxPerWorkspace: 10_000,
} as const;

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly clock: Clock;
  private readonly doneTtlMs: number;
  private readonly pendingTimeoutMs: number;
  private readonly maxPerActor: number;
  private readonly maxPerWorkspace: number;
  private readonly entries = new Map<string, Entry>();
  private readonly perWorkspace = new Map<string, number>();
  private readonly perActor = new Map<string, number>();
  private readonly pendingQ = new Fifo();
  private readonly doneQ = new Fifo();
  private seq = 0;

  constructor(opts: InMemoryIdempotencyOptions) {
    this.clock = opts.clock;
    this.doneTtlMs = opts.doneTtlMs ?? IDEMPOTENCY_DEFAULTS.doneTtlMs;
    this.pendingTimeoutMs = opts.pendingTimeoutMs ?? IDEMPOTENCY_DEFAULTS.pendingTimeoutMs;
    this.maxPerActor = opts.maxPerActor ?? IDEMPOTENCY_DEFAULTS.maxPerActor;
    this.maxPerWorkspace = opts.maxPerWorkspace ?? IDEMPOTENCY_DEFAULTS.maxPerWorkspace;
  }

  /** Số mục đang giữ (test / giám sát). */
  size(): number {
    return this.entries.size;
  }

  private bump(map: Map<string, number>, k: string, d: number): void {
    const n = (map.get(k) ?? 0) + d;
    if (n <= 0) map.delete(k);
    else map.set(k, n);
  }

  private remove(scope: string, e: Entry): void {
    this.entries.delete(scope);
    this.bump(this.perWorkspace, e.workspaceId, -1);
    this.bump(this.perActor, `${e.workspaceId}\u0000${e.actorId}`, -1);
  }

  /** Dọn mục hết hạn từ ĐẦU hai hàng đợi (hạn tăng dần) — dừng ở mục đầu tiên còn hạn. Mục cũ đã đổi trạng thái ⇒ bỏ qua. */
  private purge(nowMs: number): void {
    for (const q of [this.pendingQ, this.doneQ]) {
      for (let it = q.peek(); it !== undefined && it.expiresAt <= nowMs; it = q.peek()) {
        q.shift();
        const e = this.entries.get(it.scope);
        if (e !== undefined && e.ticket === it.ticket && e.state === it.state && e.expiresAt <= nowMs) {
          this.remove(it.scope, e);
        }
      }
    }
  }

  begin(key: IdempotencyKeyRef, fingerprint: string): BeginResult {
    const nowMs = this.clock.now().getTime();
    this.purge(nowMs);
    const e = this.entries.get(key.scope);
    if (e !== undefined) {
      if (e.fingerprint !== fingerprint) return { kind: 'conflict', reason: 'fingerprint' };
      if (e.state === 'pending') return { kind: 'conflict', reason: 'in_flight' };
      return { kind: 'replay', result: structuredClone(e.result as StoredResult) };
    }
    const actorKey = `${key.workspaceId}\u0000${key.actorId}`;
    if ((this.perActor.get(actorKey) ?? 0) >= this.maxPerActor) return { kind: 'full', reason: 'actor' };
    if ((this.perWorkspace.get(key.workspaceId) ?? 0) >= this.maxPerWorkspace)
      return { kind: 'full', reason: 'workspace' };
    const ticket = ++this.seq;
    const expiresAt = nowMs + this.pendingTimeoutMs;
    this.entries.set(key.scope, {
      ticket,
      fingerprint,
      workspaceId: key.workspaceId,
      actorId: key.actorId,
      state: 'pending',
      expiresAt,
      result: null,
    });
    this.bump(this.perWorkspace, key.workspaceId, 1);
    this.bump(this.perActor, actorKey, 1);
    this.pendingQ.push({ scope: key.scope, ticket, state: 'pending', expiresAt });
    return { kind: 'new', ticket };
  }

  complete(key: IdempotencyKeyRef, ticket: number, result: StoredResult): void {
    const e = this.entries.get(key.scope);
    // khoá đã nhả (handler treo quá hạn) hoặc thuộc lượt khác ⇒ bỏ qua
    if (e === undefined || e.ticket !== ticket || e.state !== 'pending') return;
    const expiresAt = this.clock.now().getTime() + this.doneTtlMs;
    e.state = 'done';
    e.expiresAt = expiresAt;
    e.result = structuredClone(result);
    this.doneQ.push({ scope: key.scope, ticket, state: 'done', expiresAt });
  }

  abort(key: IdempotencyKeyRef, ticket: number): void {
    const e = this.entries.get(key.scope);
    if (e !== undefined && e.ticket === ticket && e.state === 'pending') this.remove(key.scope, e);
  }
}

/** JSON chuẩn hoá (khoá sắp xếp) — để dấu vân tay không phụ thuộc thứ tự khoá. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value as object).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(',')}}`;
}

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

export function idempotencyKeyRef(p: {
  workspaceId: string;
  actorId: string;
  routeId: string;
  key: string;
}): IdempotencyKeyRef {
  return {
    workspaceId: p.workspaceId,
    actorId: p.actorId,
    scope: [p.workspaceId, p.actorId, p.routeId, p.key].join('\u0000'),
  };
}

export function idempotencyFingerprint(p: {
  routeId: string;
  actorId: string;
  params: unknown;
  query: unknown;
  body: unknown;
}): string {
  return sha256(
    canonicalJson({
      routeId: p.routeId,
      actorId: p.actorId,
      params: p.params ?? null,
      query: p.query ?? null,
      bodySha256: sha256(canonicalJson(p.body)),
    }),
  );
}

/** Khoá có ký tự dành riêng (`:` — tiền tố nội bộ của DB như `activate:`)? */
export function idempotencyKeyReserved(key: string): boolean {
  return key.includes(':');
}
