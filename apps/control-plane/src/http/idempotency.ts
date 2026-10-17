// Idempotency-Key (BACKEND-TRIAL §3.0; HANDLER-OBLIGATIONS §9) cho route `idempotent` (SYS-19, SYS-74, WRK-23…26).
//   - Không gian khoá = (workspaceId, actorId) + routeId + key: actor khác / route khác dùng cùng chuỗi khoá không đụng nhau.
//   - Dấu vân tay = route + path params + query + actor + sha256(body chuẩn hoá). Cùng khoá + cùng dấu ⇒ trả lại ĐÚNG kết quả
//     cũ (status + body); cùng khoá + khác dấu ⇒ 409 `idempotency.conflict` — KHÔNG BAO GIỜ phát lại kết quả cũ.
//   - Đang chạy với cùng khoá ⇒ 409 `idempotency.conflict` (reason in_flight) — không chạy song song hai lần.
//   - Chỉ lưu kết quả 2xx; lỗi ⇒ xoá dấu đang chạy (client thử lại được).
//   - Khoá chứa `:` ⇒ 400: tiền tố dành riêng của DB (vd `activate:<role>` ở ledger_entries) — L-API đang đổi `IdempotencyKey`
//     của contracts để từ chối `:`; chặn ở đây trước (fail-closed).
//   - KHÔNG BAO GIỜ EVICT mục còn hiệu lực (review bảo mật MEDIUM 2026-10-17: evict ⇒ kẻ tấn công đẩy khoá của nạn nhân ra
//     rồi phát lại ⇒ hành động chạy lần 2; evict `pending` ⇒ hai request song song cùng chạy):
//       · chỉ xoá mục `done` ĐÃ HẾT HẠN (TTL); mục `pending` chỉ rời khi complete / abort;
//       · trần theo namespace (workspace, actor): đầy và không còn mục hết hạn ⇒ 429 (actor tự chịu, không đụng actor khác);
//       · trần toàn cục (bảo vệ bộ nhớ): đầy ⇒ từ chối khoá MỚI (429 — hợp đồng chưa có mã 503), không evict.
// [MVP — CẦN GEN DUYỆT] Bảng DB chung cho idempotency CHƯA có (chỉ `ledger_entries` / `proactive_sends` có cột
// `idempotency_key` UNIQUE) ⇒ bản trong bộ nhớ: MẤT KHI KHỞI ĐỘNG LẠI (phát lại sau restart sẽ chạy lại). Route ledger
// (WRK-23…26) PHẢI ghi khoá xuống `ledger_entries.idempotency_key` — UNIQUE của DB là chốt cuối. SYS-19, SYS-74: DB chưa
// có cột ⇒ chờ Gen quyết bảng `idempotency_keys` (DB v2.3.6).
import { createHash } from 'node:crypto';
import type { Clock } from '@ga/contracts';

export interface StoredResult {
  status: number;
  body: unknown;
}

/** Khoá đã chia không gian: `namespace` = (workspace, actor); `scope` = namespace + route + khoá client. */
export interface IdempotencyKeyRef {
  readonly namespace: string;
  readonly scope: string;
}

export type BeginResult =
  | { kind: 'new' }
  | { kind: 'replay'; result: StoredResult }
  | { kind: 'conflict'; reason: 'fingerprint' | 'in_flight' }
  | { kind: 'full'; reason: 'namespace' | 'global' };

export interface IdempotencyStore {
  begin(key: IdempotencyKeyRef, fingerprint: string): BeginResult;
  complete(key: IdempotencyKeyRef, fingerprint: string, result: StoredResult): void;
  abort(key: IdempotencyKeyRef, fingerprint: string): void;
}

type Entry =
  | { state: 'pending'; fingerprint: string; atMs: number }
  | { state: 'done'; fingerprint: string; atMs: number; result: StoredResult };

export interface InMemoryIdempotencyOptions {
  clock: Clock;
  /** Thời gian giữ kết quả (mặc định 24 h). */
  ttlMs?: number;
  /** Trần mục mỗi (workspace, actor) (mặc định 1 000). */
  maxPerNamespace?: number;
  /** Trần mục toàn tiến trình — bảo vệ bộ nhớ (mặc định 100 000). */
  maxEntries?: number;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly clock: Clock;
  private readonly ttlMs: number;
  private readonly maxPerNamespace: number;
  private readonly maxEntries: number;
  private readonly spaces = new Map<string, Map<string, Entry>>();
  private total = 0;

  constructor(opts: InMemoryIdempotencyOptions) {
    this.clock = opts.clock;
    this.ttlMs = opts.ttlMs ?? 24 * 3600 * 1000;
    this.maxPerNamespace = opts.maxPerNamespace ?? 1000;
    this.maxEntries = opts.maxEntries ?? 100_000;
  }

  /** Số mục đang giữ (test / giám sát). */
  size(): number {
    return this.total;
  }

  private expired(e: Entry, nowMs: number): boolean {
    return e.state === 'done' && nowMs - e.atMs > this.ttlMs;
  }

  /** Xoá mục `done` đã hết hạn của MỘT namespace (không bao giờ xoá `pending`, không bao giờ xoá mục còn hạn). */
  private purgeExpired(space: Map<string, Entry>, nowMs: number): void {
    for (const [k, e] of space) {
      if (this.expired(e, nowMs)) {
        space.delete(k);
        this.total--;
      }
    }
  }

  private purgeAllExpired(nowMs: number): void {
    for (const [ns, space] of this.spaces) {
      this.purgeExpired(space, nowMs);
      if (space.size === 0) this.spaces.delete(ns);
    }
  }

  begin(key: IdempotencyKeyRef, fingerprint: string): BeginResult {
    const nowMs = this.clock.now().getTime();
    let space = this.spaces.get(key.namespace);
    const e = space?.get(key.scope);
    if (e !== undefined) {
      if (!this.expired(e, nowMs)) {
        if (e.fingerprint !== fingerprint) return { kind: 'conflict', reason: 'fingerprint' };
        if (e.state === 'pending') return { kind: 'conflict', reason: 'in_flight' };
        return { kind: 'replay', result: structuredClone(e.result) };
      }
      space?.delete(key.scope);
      this.total--;
    }
    if (space !== undefined && space.size >= this.maxPerNamespace) {
      this.purgeExpired(space, nowMs);
      if (space.size >= this.maxPerNamespace) return { kind: 'full', reason: 'namespace' };
    }
    if (this.total >= this.maxEntries) {
      this.purgeAllExpired(nowMs);
      if (this.total >= this.maxEntries) return { kind: 'full', reason: 'global' };
      space = this.spaces.get(key.namespace);
    }
    if (space === undefined) {
      space = new Map();
      this.spaces.set(key.namespace, space);
    }
    space.set(key.scope, { state: 'pending', fingerprint, atMs: nowMs });
    this.total++;
    return { kind: 'new' };
  }

  complete(key: IdempotencyKeyRef, fingerprint: string, result: StoredResult): void {
    const space = this.spaces.get(key.namespace);
    const e = space?.get(key.scope);
    if (space === undefined || e === undefined || e.fingerprint !== fingerprint) return;
    space.set(key.scope, {
      state: 'done',
      fingerprint,
      atMs: this.clock.now().getTime(),
      result: structuredClone(result),
    });
  }

  abort(key: IdempotencyKeyRef, fingerprint: string): void {
    const space = this.spaces.get(key.namespace);
    const e = space?.get(key.scope);
    if (space !== undefined && e !== undefined && e.state === 'pending' && e.fingerprint === fingerprint) {
      space.delete(key.scope);
      this.total--;
      if (space.size === 0) this.spaces.delete(key.namespace);
    }
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
  const namespace = `${p.workspaceId}\u0000${p.actorId}`;
  return { namespace, scope: `${namespace}\u0000${p.routeId}\u0000${p.key}` };
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
