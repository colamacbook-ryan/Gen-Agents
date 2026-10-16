import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  TermTicketClaims as Claims,
  type Clock,
  PTY,
  SUPERVISOR_RPC,
  supervisorSigningString,
  type TermTicketClaims,
} from '@ga/contracts';

// Xác thực của supervisor (TCB):
//  1. RPC ga-app → supervisor: HMAC-SHA256(GA_SUPERVISOR_KEY, supervisorSigningString(ts, METHOD, path, sha256(body))) dạng
//     hex trong `x-ga-sig`, `x-ga-ts` = giây epoch; lệch ≤ 30 s; MỖI chữ ký chỉ dùng MỘT lần trong cửa sổ lệch (chống phát lại).
//  2. Vé PTY: base64url(JSON claims) '.' base64url(HMAC-SHA256(GA_TERM_TICKET_KEY, "ga-term.v1." ‖ phần claims)) — cùng
//     định dạng với @ga/security issueTermTicket (L-SEC). Thứ tự kiểm: trần → dạng → HMAC hằng thời gian → JSON → schema
//     chặt → hạn (≤ 60 s + lệch 5 s) → nonce một lần (RAM, đầy ⇒ từ chối). TODO(L-SEC): thay bằng verifyTermTicket khi có gói.

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

// ---------------------------------------------------------------- vé PTY
export const MAX_TICKET_CHARS = 4096;
export const TICKET_CLOCK_SKEW_SECONDS = 5;
const MAC_DOMAIN = 'ga-term.v1.';

export type TicketFailure =
  | 'too_large'
  | 'malformed'
  | 'bad_signature'
  | 'bad_claims'
  | 'expired'
  | 'lifetime_too_long'
  | 'replayed'
  | 'replay_cache_full';

function b64urlDecodeStrict(s: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s) || s.length % 4 === 1) return null;
  const b = Buffer.from(s, 'base64url');
  return b.toString('base64url') === s ? b : null;
}

export function ticketMac(key: Buffer, payloadB64: string): Buffer {
  return createHmac('sha256', key).update(MAC_DOMAIN).update(payloadB64).digest();
}

/** Chỉ dùng trong test / testkit (ga-app ký bằng @ga/security): dựng vé đúng định dạng. */
export function signTicketForTest(claims: unknown, key: Buffer): string {
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  return `${payload}.${ticketMac(key, payload).toString('base64url')}`;
}

export function verifyTicket(
  ticket: string,
  key: Buffer,
  clock: Clock,
  nonces: OneTimeCache,
): { ok: true; claims: TermTicketClaims } | { ok: false; reason: TicketFailure } {
  if (typeof ticket !== 'string' || ticket.length > MAX_TICKET_CHARS) return { ok: false, reason: 'too_large' };
  const dot = ticket.indexOf('.');
  if (dot <= 0 || dot !== ticket.lastIndexOf('.')) return { ok: false, reason: 'malformed' };
  const payload = ticket.slice(0, dot);
  const sig = b64urlDecodeStrict(ticket.slice(dot + 1));
  const body = b64urlDecodeStrict(payload);
  if (sig?.length !== 32 || !body || body.length === 0) return { ok: false, reason: 'malformed' };
  if (!timingSafeEqual(sig, ticketMac(key, payload))) return { ok: false, reason: 'bad_signature' };
  let raw: unknown;
  try {
    raw = JSON.parse(body.toString('utf8'));
  } catch {
    return { ok: false, reason: 'bad_claims' };
  }
  const parsed = Claims.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'bad_claims' };
  const claims = parsed.data;
  const nowSec = Math.floor(clock.now().getTime() / 1000);
  if (claims.exp <= nowSec) return { ok: false, reason: 'expired' };
  if (claims.exp - nowSec > PTY.ticketTtlSeconds + TICKET_CLOCK_SKEW_SECONDS)
    return { ok: false, reason: 'lifetime_too_long' };
  const r = nonces.remember(claims.nonce, claims.exp + TICKET_CLOCK_SKEW_SECONDS, nowSec);
  if (r === 'replayed') return { ok: false, reason: 'replayed' };
  if (r === 'full') return { ok: false, reason: 'replay_cache_full' };
  return { ok: true, claims };
}
