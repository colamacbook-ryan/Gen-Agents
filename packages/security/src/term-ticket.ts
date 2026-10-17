// Vé terminal (PTY đăng nhập) — BUILD-PLAN §B.3, §B.6; DATABASE §9.5 bước 3 (v2.3.1, G-04, CNS-134); contracts `PTY`.
//
// - Ký bằng khoá RIÊNG `GA_TERM_TICKET_KEY` (tệp secret, chỉ ga-app ký + ga-supervisor kiểm) — KHÔNG dẫn xuất từ master key.
// - Vé = base64url(JSON claims) '.' base64url(HMAC-SHA256(key, "ga-term.v1." ‖ phần claims)) — đúng dạng `TICKET_RE` của contracts.
// - Hạn 60 s (`PTY.ticketTtlSeconds`); bên kiểm từ chối vé có exp xa hơn 60 s (+ lệch đồng hồ) dù chữ ký đúng.
// - Dùng MỘT lần: nonce vào bộ nhớ RAM của bên kiểm tới khi vé hết hạn; vé phát lại bị từ chối. Bộ nhớ đầy ⇒ từ chối vé mới
//   (fail-closed) thay vì quên nonce chưa hết hạn (quên = mở đường phát lại).
// - Vé đi trong `Sec-WebSocket-Protocol` (contracts `buildTermWebSocketInit` / `extractTermTicket`), không bao giờ trong URL.
// - Thứ tự kiểm: trần kích thước → dạng → HMAC (hằng thời gian) → JSON → schema chặt → hạn → nonce. Nonce chỉ được ghi nhớ
//   SAU khi mọi bước khác đạt (rác không lấp được bộ nhớ chống phát lại).
import { createHmac, randomBytes } from 'node:crypto';
import { type Clock, PTY, type TermTicketClaims, TermTicketClaims as TermTicketClaimsSchema } from '@ga/contracts';
import { b64urlDecodeStrict, b64urlEncode, constantTimeEqual } from './encoding.ts';

/** Trần độ dài vé (argv đăng nhập ngắn) — kiểm trước mọi xử lý. */
export const MAX_TICKET_CHARS = 4096;
/** Lệch đồng hồ chấp nhận giữa ga-app và ga-supervisor (giây). */
export const TICKET_CLOCK_SKEW_SECONDS = 5;
const MAC_DOMAIN = 'ga-term.v1.';

export type TicketRejectReason =
  | 'too_large'
  | 'malformed'
  | 'bad_signature'
  | 'bad_claims'
  | 'expired'
  | 'lifetime_too_long'
  | 'replayed'
  | 'replay_cache_full';

export type TicketVerifyResult = { ok: true; claims: TermTicketClaims } | { ok: false; reason: TicketRejectReason };

function assertTicketKey(key: Uint8Array): void {
  if (key.byteLength < 32) throw new RangeError('khoá vé terminal phải ≥ 32 byte');
}

function mac(key: Uint8Array, payloadB64: string): Buffer {
  return createHmac('sha256', key).update(MAC_DOMAIN).update(payloadB64).digest();
}

/** ga-app: ký vé cho một phiên PTY. Vé không lưu ở đâu. Trả vé + claims (để ghi audit metadata, không ghi vé). */
export function issueTermTicket(
  input: Pick<TermTicketClaims, 'acc' | 'container' | 'engineSlug' | 'authMethod' | 'guiSessionHash'>,
  key: Uint8Array,
  clock: Clock,
): { ticket: string; claims: TermTicketClaims } {
  assertTicketKey(key);
  const claims = TermTicketClaimsSchema.parse({
    v: 2,
    acc: input.acc,
    container: input.container,
    engineSlug: input.engineSlug,
    authMethod: input.authMethod,
    guiSessionHash: input.guiSessionHash,
    exp: Math.floor(clock.now().getTime() / 1000) + PTY.ticketTtlSeconds,
    nonce: b64urlEncode(randomBytes(18)),
  });
  const payload = b64urlEncode(Buffer.from(JSON.stringify(claims), 'utf8'));
  const ticket = `${payload}.${b64urlEncode(mac(key, payload))}`;
  if (ticket.length > MAX_TICKET_CHARS) throw new RangeError('vé vượt trần độ dài');
  return { ticket, claims };
}

/** Bộ nhớ nonce đã dùng (RAM của ga-supervisor). Mỗi tiến trình kiểm một instance. */
export class TicketReplayCache {
  private readonly used = new Map<string, number>();
  private readonly maxEntries: number;

  constructor(maxEntries = 10_000) {
    this.maxEntries = maxEntries;
  }

  private purge(nowSec: number): void {
    for (const [nonce, exp] of this.used) if (exp < nowSec - TICKET_CLOCK_SKEW_SECONDS) this.used.delete(nonce);
  }

  /** true nếu nonce mới và đã được ghi nhớ; false + lý do nếu phát lại / bộ nhớ đầy. */
  remember(
    nonce: string,
    exp: number,
    nowSec: number,
  ): { ok: true } | { ok: false; reason: 'replayed' | 'replay_cache_full' } {
    if (this.used.has(nonce)) return { ok: false, reason: 'replayed' };
    if (this.used.size >= this.maxEntries) {
      this.purge(nowSec);
      if (this.used.size >= this.maxEntries) return { ok: false, reason: 'replay_cache_full' };
    }
    this.used.set(nonce, exp);
    return { ok: true };
  }

  size(): number {
    return this.used.size;
  }
}

/** ga-supervisor: kiểm vé lấy từ `Sec-WebSocket-Protocol` (qua `extractTermTicket` của contracts). */
export function verifyTermTicket(
  ticket: string,
  key: Uint8Array,
  clock: Clock,
  replay: TicketReplayCache,
): TicketVerifyResult {
  assertTicketKey(key);
  if (typeof ticket !== 'string' || ticket.length > MAX_TICKET_CHARS) return { ok: false, reason: 'too_large' };
  const dot = ticket.indexOf('.');
  if (dot <= 0 || dot !== ticket.lastIndexOf('.')) return { ok: false, reason: 'malformed' };
  const payload = ticket.slice(0, dot);
  const sig = b64urlDecodeStrict(ticket.slice(dot + 1));
  const body = b64urlDecodeStrict(payload);
  if (sig?.byteLength !== 32 || !body || body.byteLength === 0) return { ok: false, reason: 'malformed' };
  if (!constantTimeEqual(sig, mac(key, payload))) return { ok: false, reason: 'bad_signature' };
  let raw: unknown;
  try {
    raw = JSON.parse(body.toString('utf8'));
  } catch {
    return { ok: false, reason: 'bad_claims' };
  }
  const parsed = TermTicketClaimsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'bad_claims' };
  const claims = parsed.data;
  const nowSec = Math.floor(clock.now().getTime() / 1000);
  if (claims.exp <= nowSec) return { ok: false, reason: 'expired' };
  if (claims.exp - nowSec > PTY.ticketTtlSeconds + TICKET_CLOCK_SKEW_SECONDS) {
    return { ok: false, reason: 'lifetime_too_long' };
  }
  const r = replay.remember(claims.nonce, claims.exp, nowSec);
  if (!r.ok) return r;
  return { ok: true, claims };
}
