// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';

/** Chuỗi đánh dấu mọi tệp nguồn của gói này. Test `marker.test.ts` ép; `pnpm images:assert-no-testkit` có thể grep. */
export const FAKES_MARKER = 'GA-FAKES-TEST-ONLY';

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Treo đến khi bị kill (CLI giả đóng vai tiến trình bị kẹt). Timer giữ event loop sống. */
export function hangForever(): Promise<never> {
  setInterval(() => {}, 1 << 30);
  return new Promise<never>(() => {});
}

/** Đồng hồ của fake: `GA_FAKE_NOW` (ISO) cố định thời gian cho test xác định; mặc định giờ thật. */
export function nowMs(env: NodeJS.ProcessEnv = process.env): number {
  if (env.GA_FAKE_NOW) {
    const t = Date.parse(env.GA_FAKE_NOW);
    if (Number.isNaN(t)) throw new Error(`GA_FAKE_NOW không phải ISO: ${env.GA_FAKE_NOW}`);
    return t;
  }
  return Date.now();
}

export const home = (env: NodeJS.ProcessEnv = process.env): string => env.HOME ?? homedir();

export const uuid = (): string => randomUUID();

/** Ước lượng token thô (4 ký tự / token) — chỉ để usage có số, không phải tokenizer thật. */
export const approxTokens = (s: string): number => Math.ceil(s.length / 4);

/** Go duration đơn giản ("30s", "2m", "1h30m", "500ms") → ms. null nếu sai dạng. */
export function parseGoDuration(s: string): number | null {
  if (s === '0') return 0;
  if (!/^(?:\d+(?:ms|s|m|h))+$/.test(s)) return null;
  const unit: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };
  let total = 0;
  for (const m of s.matchAll(/(\d+)(ms|s|m|h)/g)) total += Number(m[1]) * (unit[m[2] as string] ?? 0);
  return total;
}
