import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { type Clock, SUPERVISOR_RPC, supervisorSigningString } from '@ga/contracts';

// Xác thực của supervisor (TCB):
//  1. RPC ga-app → supervisor: HMAC-SHA256(GA_SUPERVISOR_KEY, supervisorSigningString(ts, METHOD, path, sha256(body))) dạng
//     hex trong `x-ga-sig`, `x-ga-ts` = giây epoch; lệch ≤ 30 s; MỖI chữ ký chỉ dùng MỘT lần trong cửa sổ lệch (chống phát lại).
//  2. Vé PTY: KHÔNG tự kiểm — dùng `verifyTermTicket` + `TicketReplayCache` của @ga/security (một nguồn với bên ký
//     `issueTermTicket` của ga-app; xem pty.ts).

export type RpcAuthFailure = 'missing' | 'bad_timestamp' | 'skew' | 'bad_signature' | 'replayed' | 'replay_cache_full';

/** Bộ nhớ chữ ký / nonce đã dùng tới khi hết hạn. Đầy ⇒ từ chối (fail-closed), không quên mục chưa hết hạn. */
export class OneTimeCache {
  private readonly seen = new Map<string, number>();
  private readonly max: number;
  constructor(max = 20_000) {
    this.max = max;
  }
  /** true = lần đầu (đã ghi nhớ tới `expSec`). */
  remember(key: string, expSec: number, nowSec: number): 'ok' | 'replayed' | 'full' {
    if (this.seen.has(key)) return 'replayed';
    if (this.seen.size >= this.max) {
      for (const [k, e] of this.seen) if (e < nowSec) this.seen.delete(k);
      if (this.seen.size >= this.max) return 'full';
    }
    this.seen.set(key, expSec);
    return 'ok';
  }
  get size(): number {
    return this.seen.size;
  }
}

export function sha256Hex(body: Buffer | string): string {
  return createHash('sha256').update(body).digest('hex');
}

export function signRpc(key: Buffer, ts: string, method: string, path: string, body: Buffer | string): string {
  return createHmac('sha256', key)
    .update(supervisorSigningString(ts, method, path, sha256Hex(body)))
    .digest('hex');
}

export function verifyRpc(
  key: Buffer,
  headers: { ts: string | undefined; sig: string | undefined },
  method: string,
  path: string,
  body: Buffer,
  clock: Clock,
  cache: OneTimeCache,
): { ok: true } | { ok: false; reason: RpcAuthFailure } {
  const { ts, sig } = headers;
  if (!ts || !sig) return { ok: false, reason: 'missing' };
  if (!/^[0-9]{1,12}$/.test(ts)) return { ok: false, reason: 'bad_timestamp' };
  if (!/^[0-9a-f]{64}$/.test(sig)) return { ok: false, reason: 'bad_signature' };
  const nowSec = Math.floor(clock.now().getTime() / 1000);
  const t = Number(ts);
  if (Math.abs(nowSec - t) > SUPERVISOR_RPC.maxSkewSeconds) return { ok: false, reason: 'skew' };
  const expected = Buffer.from(signRpc(key, ts, method, path, body), 'hex');
  if (!timingSafeEqual(expected, Buffer.from(sig, 'hex'))) return { ok: false, reason: 'bad_signature' };
  const r = cache.remember(sig, t + SUPERVISOR_RPC.maxSkewSeconds, nowSec);
  if (r === 'replayed') return { ok: false, reason: 'replayed' };
  if (r === 'full') return { ok: false, reason: 'replay_cache_full' };
  return { ok: true };
}
