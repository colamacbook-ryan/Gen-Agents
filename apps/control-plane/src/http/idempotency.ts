// Idempotency-Key (BACKEND-TRIAL §3.0; HANDLER-OBLIGATIONS §9) cho route `idempotent` (SYS-19, SYS-74, WRK-23…26).
//   - Không gian khoá = (workspaceId, actorId, routeId, key): actor khác / route khác dùng cùng chuỗi khoá không đụng nhau.
//   - Dấu vân tay = route + path params + query + actor + sha256(body chuẩn hoá). Cùng khoá + cùng dấu ⇒ trả lại ĐÚNG kết quả
//     cũ (status + body); cùng khoá + khác dấu ⇒ 409 `idempotency.conflict` — KHÔNG BAO GIỜ phát lại kết quả cũ.
//   - Đang chạy với cùng khoá ⇒ 409 (không chạy song song hai lần).
//   - Chỉ lưu kết quả 2xx; lỗi ⇒ xoá dấu đang chạy (client thử lại được).
//   - Khoá chứa `:` ⇒ 400: tiền tố dành riêng của DB (vd `activate:<role>` ở ledger_entries) — L-API đang đổi `IdempotencyKey`
//     của contracts để từ chối `:`; chặn ở đây trước (fail-closed).
// [MVP — CẦN GEN DUYỆT] Bảng DB chung cho idempotency CHƯA có (chỉ `ledger_entries` / `proactive_sends` có cột
// `idempotency_key` UNIQUE) ⇒ bản trong bộ nhớ có TTL + trần số mục: mất khi khởi động lại. Với ledger, UNIQUE của DB vẫn là
// chốt cuối (handler PHẢI ghi key vào `ledger_entries.idempotency_key`).
import { createHash } from 'node:crypto';
import type { Clock } from '@ga/contracts';

export interface StoredResult {
  status: number;
  body: unknown;
}

export type BeginResult =
  | { kind: 'new' }
  | { kind: 'replay'; result: StoredResult }
  | { kind: 'conflict'; reason: 'fingerprint' | 'in_flight' };

export interface IdempotencyStore {
  begin(scope: string, fingerprint: string): BeginResult;
  complete(scope: string, fingerprint: string, result: StoredResult): void;
  abort(scope: string, fingerprint: string): void;
}

type Entry =
  | { state: 'pending'; fingerprint: string; atMs: number }
  | { state: 'done'; fingerprint: string; atMs: number; result: StoredResult };

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly clock: Clock;
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly entries = new Map<string, Entry>();

  constructor(opts: { clock: Clock; ttlMs?: number; maxEntries?: number }) {
    this.clock = opts.clock;
    this.ttlMs = opts.ttlMs ?? 24 * 3600 * 1000;
    this.maxEntries = opts.maxEntries ?? 10_000;
  }

  private sweep(nowMs: number): void {
    for (const [k, e] of this.entries) {
      if (nowMs - e.atMs <= this.ttlMs) break; // Map giữ thứ tự chèn = thứ tự thời gian
      this.entries.delete(k);
    }
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  begin(scope: string, fingerprint: string): BeginResult {
    const nowMs = this.clock.now().getTime();
    this.sweep(nowMs);
    const e = this.entries.get(scope);
    if (e !== undefined && nowMs - e.atMs <= this.ttlMs) {
      if (e.fingerprint !== fingerprint) return { kind: 'conflict', reason: 'fingerprint' };
      if (e.state === 'pending') return { kind: 'conflict', reason: 'in_flight' };
      return { kind: 'replay', result: e.result };
    }
    this.entries.delete(scope);
    this.entries.set(scope, { state: 'pending', fingerprint, atMs: nowMs });
    return { kind: 'new' };
  }

  complete(scope: string, fingerprint: string, result: StoredResult): void {
    const e = this.entries.get(scope);
    if (e === undefined || e.fingerprint !== fingerprint) return;
    this.entries.set(scope, { state: 'done', fingerprint, atMs: e.atMs, result: structuredClone(result) });
  }

  abort(scope: string, fingerprint: string): void {
    const e = this.entries.get(scope);
    if (e !== undefined && e.state === 'pending' && e.fingerprint === fingerprint) this.entries.delete(scope);
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

export function idempotencyScope(p: { workspaceId: string; actorId: string; routeId: string; key: string }): string {
  return [p.workspaceId, p.actorId, p.routeId, p.key].join('\u0000');
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
