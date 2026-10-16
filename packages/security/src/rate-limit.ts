// Giới hạn tần suất (đăng nhập, đổi mật khẩu) — cửa sổ trượt trong RAM, đồng hồ inject được (BUILD-PLAN §C.3).
// Bộ nhớ có trần: đầy thì dọn khoá hết hạn, rồi bỏ khoá ít dùng gần nhất (LRU). Giới hạn toàn cục (khoá '*') là lớp
// chặn cuối khi kẻ tấn công có nhiều IP.
import type { Clock } from '@ga/contracts';

export interface RateLimitDecision {
  allowed: boolean;
  /** 0 khi được phép; ngược lại số ms tới khi lượt cũ nhất trong cửa sổ hết hạn. */
  retryAfterMs: number;
}

export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly opts: { limit: number; windowMs: number; clock: Clock; maxKeys?: number };

  constructor(opts: { limit: number; windowMs: number; clock: Clock; maxKeys?: number }) {
    this.opts = opts;
    if (!(opts.limit >= 1) || !(opts.windowMs > 0)) throw new RangeError('limit ≥ 1, windowMs > 0');
  }

  private now(): number {
    return this.opts.clock.now().getTime();
  }

  private live(key: string, now: number): number[] {
    const arr = this.hits.get(key);
    if (!arr) return [];
    const from = now - this.opts.windowMs;
    let i = 0;
    while (i < arr.length && (arr[i] as number) <= from) i++;
    if (i > 0) arr.splice(0, i);
    if (arr.length === 0) this.hits.delete(key);
    return arr;
  }

  /** Còn lượt không (không tốn lượt). */
  check(key: string): RateLimitDecision {
    const now = this.now();
    const arr = this.live(key, now);
    if (arr.length < this.opts.limit) return { allowed: true, retryAfterMs: 0 };
    return { allowed: false, retryAfterMs: Math.max(1, (arr[0] as number) + this.opts.windowMs - now) };
  }

  /** Ghi một lượt (gọi TRƯỚC thao tác tốn kém — lượt đang chạy dở cũng tính, chống dồn song song). */
  hit(key: string): void {
    const now = this.now();
    const arr = this.live(key, now);
    if (arr.length === 0) this.makeRoom();
    arr.push(now);
    if (arr.length > this.opts.limit) arr.splice(0, arr.length - this.opts.limit);
    // đưa xuống cuối thứ tự Map = dùng gần nhất (LRU)
    this.hits.delete(key);
    this.hits.set(key, arr);
  }

  /** check rồi hit nếu còn lượt. */
  consume(key: string): RateLimitDecision {
    const d = this.check(key);
    if (d.allowed) this.hit(key);
    return d;
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  size(): number {
    return this.hits.size;
  }

  private makeRoom(): void {
    const max = this.opts.maxKeys ?? 10_000;
    if (this.hits.size < max) return;
    const now = this.now();
    for (const k of [...this.hits.keys()]) this.live(k, now);
    while (this.hits.size >= max) {
      const oldest = this.hits.keys().next().value as string;
      this.hits.delete(oldest);
    }
  }
}

/**
 * Khoá tạm tài khoản sau nhiều lần sai liên tiếp (FS G1: "Khoá tạm sau nhiều lần sai (đếm ngược)"). [Gen duyệt 2026-10-16]
 * 5 lần sai đầu không khoá; từ lần thứ 5: 30 s, nhân đôi mỗi lần sai thêm, trần 15 phút. Trần thấp có chủ đích: kẻ ngoài
 * mạng chỉ khoá được owner tối đa 15 phút mỗi lần, còn đoán mật khẩu vẫn bị chặn bởi giới hạn IP + toàn cục.
 */
export const ACCOUNT_LOCKOUT = { freeFailures: 4, baseSeconds: 30, maxSeconds: 15 * 60 } as const;

export type AccountLockoutPolicy = { freeFailures: number; baseSeconds: number; maxSeconds: number };

export function accountLockSeconds(
  consecutiveFailures: number,
  policy: AccountLockoutPolicy = ACCOUNT_LOCKOUT,
): number {
  const n = consecutiveFailures - policy.freeFailures;
  if (n <= 0) return 0;
  return Math.min(policy.maxSeconds, policy.baseSeconds * 2 ** Math.min(n - 1, 20));
}
