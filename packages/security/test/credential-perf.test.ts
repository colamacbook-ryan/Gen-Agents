// Hiệu năng bộ quét (STD-11 1.10: ReDoS — chạy tuyến tính, test chuỗi 1 MiB). Runner CI chậm và dao động ⇒ trần tuyệt đối
// thấp (50 ms) đỏ giả (Gen 2026-10-16, PR #5). Thứ phân biệt quét tuyến tính với ReDoS là TỈ LỆ: mỗi ca đo ở 128 KiB và
// 1 MiB (trung vị 5 lần chạy, mỗi lần lấy min(thời gian thực, thời gian CPU)). Kích thước gấp 8 ⇒ tuyến tính ≈ 8, bậc hai
// ≈ 64: ngưỡng tỉ lệ 24 (= 3 × tuyến tính) tách rõ hai loại mà không đỏ giả khi CI ồn (bản trước 256 KiB / 1 MiB ngưỡng 8
// = 2 × tuyến tính đỏ giả ở tỉ lệ 8.1 trên CI). + trần tuyệt đối 250 ms cho 1 MiB (khớp mức L0). Thời gian 128 KiB lấy sàn
// FLOOR_MS khi tính tỉ lệ — dưới mức đó đo là nhiễu.
import { describe, expect, it } from 'vitest';
import { detectCredential, redactText, screenPayload } from '../src/index.ts';

const MB = 1024 * 1024;
const SMALL = MB / 8;
const CAP_MS = 250;
const MAX_RATIO = 24;
const FLOOR_MS = 2.5;
const fill = (unit: string, size: number) => unit.repeat(Math.ceil(size / unit.length)).slice(0, size);
const NBSP = String.fromCharCode(0xa0);
const IDEO_SPACE = String.fromCharCode(0x3000);
const BS = '\\';

/** Một lần chạy: min(thời gian thực, thời gian CPU của tiến trình) — máy dùng chung kéo dài thời gian thực khi chờ CPU. */
function once(fn: () => unknown): number {
  const c0 = process.cpuUsage();
  const t0 = performance.now();
  fn();
  const wall = performance.now() - t0;
  const c = process.cpuUsage(c0);
  return Math.min(wall, (c.user + c.system) / 1000);
}

/** Trung vị 5 lần chạy (sau một lần chạy làm nóng JIT). */
function median5(fn: () => unknown): number {
  fn();
  const xs = [once(fn), once(fn), once(fn), once(fn), once(fn)].sort((a, b) => a - b);
  return xs[2] as number;
}

/** Đo ở 128 KiB và 1 MiB; kiểm tỉ lệ < MAX_RATIO và 1 MiB < 250 ms. Trả thông điệp số đo (in khi fail / console). */
function expectLinear(name: string, run: (s: string) => unknown, gen: (size: number) => string): string {
  const small = gen(SMALL);
  const big = gen(MB);
  const ts = median5(() => run(small));
  const tb = median5(() => run(big));
  const msg = `${name}: 128 KiB ${ts.toFixed(1)} ms, 1 MiB ${tb.toFixed(1)} ms, tỉ lệ ${(tb / Math.max(ts, 0.1)).toFixed(1)}`;
  expect(tb, msg).toBeLessThan(CAP_MS);
  expect(tb, msg).toBeLessThan(MAX_RATIO * Math.max(ts, FLOOR_MS));
  return msg;
}

/** Bộ chuỗi đối kháng của contracts (M0) + các lối mới của bộ dùng chung — mỗi ca là hàm của kích thước. */
const adversarial: Record<string, (n: number) => string> = {
  'toàn a': (n) => 'a'.repeat(n),
  'toàn 0': (n) => '0'.repeat(n),
  'xen kẽ a0': (n) => fill('a0', n),
  'sk- lặp': (n) => fill('sk-', n),
  'sk- x lặp (không đủ dài)': (n) => fill('sk-x ', n),
  'eyJ lặp': (n) => fill('eyJ', n),
  'eyJ…. lặp (gần JWT)': (n) => fill('eyJaaaaaaaaa.', n),
  'ya29. lặp': (n) => fill('ya29.', n),
  '1//0 lặp': (n) => fill('1//0', n),
  'AIza lặp': (n) => fill('AIza', n),
  'ghp_ lặp': (n) => fill('ghp_', n),
  'xoxb- lặp': (n) => fill('xoxb-', n),
  'AKIA lặp': (n) => fill('AKIA', n),
  'BEGIN + đoạn chữ hoa dài': (n) => `-----BEGIN ${'A'.repeat(n - 11)}`,
  'BEGIN lặp': (n) => fill('-----BEGIN ', n),
  'BEGIN PRIVATE KEY lặp không END': (n) => fill('-----BEGIN PRIVATE KEY----- ', n),
  'refresh_token + khoảng trắng dài': (n) => `refresh_token${' '.repeat(n - 13)}`,
  'refresh_token lặp': (n) => fill('refresh_token ', n),
  'password= lặp (giá trị ngắn)': (n) => fill('password=x ', n),
  'GA-CANARY- lặp': (n) => fill('GA-CANARY-', n),
  'gạch nối': (n) => '-'.repeat(n),
  '8 chữ số + : lặp': (n) => fill('12345678:', n),
  ':// lặp': (n) => fill('a://b:c', n),
  'bearer lặp': (n) => fill('bearer ', n),
  'hex dài': (n) => fill('0123456789abcdef', n),
  'base64 + / lặp': (n) => fill('QUJD+/', n),
  'tiếng Việt': (n) => fill('Xin chào, đây là một câu tiếng Việt bình thường lúc 14:00. ', n),
  'ASCII in được': (n) => Array.from({ length: n }, (_, i) => String.fromCharCode(32 + ((i * 7919) % 95))).join(''),
  'kim base64 canary lặp': (n) => fill('R0EtQ0FOQVJZLxyz ', n),
  'eyJ + 5 ký tự lặp (ứng viên JWT hụt)': (n) => fill('eyJaaaaa ', n),
  'xghp_ lặp (hụt ranh giới)': (n) => fill(`xghp_${'a'.repeat(30)} `, n),
  ': + 35 ký tự không chữ số trước': (n) => fill(`:${'a'.repeat(35)} `, n),
  'xbearer lặp (hụt ranh giới)': (n) => fill(`xbearer ${'a'.repeat(16)} `, n),
  'GA-CANARY- + 8 ký tự ngoài hex lặp': (n) => fill('GA-CANARY-zzzzzzzz ', n),
  'xpassword= lặp (tên mở rộng hụt ranh giới)': (n) => fill('xpassword=abcdefghij ', n),
  'đoạn 31 ký tự đủ loại lặp': (n) => fill('aB3dE5gH7jK9mN2pQ4rS6tU8vW1xY3z ', n),
  // URL userinfo (xấp xỉ trên của parser URL): ứng viên lồng nhau, ':' dồn dập, gạch dài, TAB chen scheme, câu thường
  'https: lặp + @ cuối (ứng viên A lồng nhau)': (n) => `${fill('https:', n - 1)}@`,
  ': dồn dập + @ cuối': (n) => `${':'.repeat(n - 1)}@`,
  'x:// lặp + @ cuối': (n) => `${fill('x://', n - 1)}@`,
  'http: + gạch dài': (n) => `http:${'/\\'.repeat(n / 2 - 8)}u:p@h`,
  'scheme chen TAB lặp + @ cuối': (n) => `${fill('h\tt\tt\tp\ts\t:', n - 1)}@`,
  'ws: 10:30 a@b lặp (câu thường)': (n) => fill('ws: lúc 10:30 gửi a@b ', n),
  '@: lặp': (n) => fill('@:', n),
  'h + TAB dài + :@ (ứng viên A quét đoạn TAB)': (n) => `h${'\t'.repeat(n - 4)}:@x`,
  'x://a/ + chữ dài + @ rồi x:// lặp (vòng lùi một lần)': (n) =>
    `x://a/${'b'.repeat(n / 2)}${fill('x://', n / 2 - 8)}@`,
  // tên credential mọi kiểu viết + base64_secret_run (contracts 0a2bfff) + gán khoá credential giá trị ngắn
  'refresh-_-_-_- lặp': (n) => fill('refresh-_-_-_-', n),
  'api_ _ _ lặp (tên hụt)': (n) => fill('api___-__-_ ', n),
  'MAX_TOKEN=4096 lặp (khoá chỉ chứa tên)': (n) => fill('MAX_TOKEN=4096 ', n),
  'api_key: , lặp (không giá trị)': (n) => fill('api_key: , ', n),
  'api_key:" + 4 KiB không nháy đóng lặp': (n) => fill(`api_key:"${'a'.repeat(5000)} `, n),
  'base64 (+ / thưa, ít đổi lớp)': (n) => fill('aaaaAAAA1111/', n),
  'base64 đoạn 39 lặp': (n) => fill(`${'Ab1+'.repeat(9)}Ab1 `, n),
  'base64 không / (một đoạn dài)': (n) => fill('Ab1+Cd2+Ef3+', n),
  // khoảng trắng Unicode (gập thành space trước khi quét)
  'NBSP xen kẽ': (n) => fill(`a${NBSP}`, n),
  'U+3000 + password= lặp': (n) => fill(`password${IDEO_SPACE}=${IDEO_SPACE}x `, n),
};

describe(`chuỗi đối kháng — chặn (dừng ở mẫu đầu): tỉ lệ 1 MiB / 128 KiB < ${MAX_RATIO}, 1 MiB < ${CAP_MS} ms`, () => {
  for (const [name, gen] of Object.entries(adversarial)) {
    it(name, () => {
      expectLinear(name, (s) => detectCredential(s), gen);
    });
  }
});

/** Che: chuỗi đối kháng KHÔNG chứa credential (chuỗi có N mẫu thật tốn O(n + N) — kiểm ở nhóm "dày đặc"). */
describe(`chuỗi đối kháng sạch — che (tìm mọi mẫu): tỉ lệ < ${MAX_RATIO}, 1 MiB < ${CAP_MS} ms`, () => {
  for (const [name, gen] of Object.entries(adversarial).filter(([, g]) => detectCredential(g(MB)) === null)) {
    it(name, () => {
      expectLinear(name, (s) => redactText(s), gen);
    });
  }
});

describe(`mẫu dày đặc — che: tỉ lệ < ${MAX_RATIO}, 1 MiB < ${CAP_MS} ms`, () => {
  const dense: Record<string, string> = {
    'JWT dày đặc': 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJlLXRlc3Q ',
    'refresh_token: dày đặc': 'refresh_token: v ',
    'entropy dày đặc': 'Zq8XwLmN3vBtRk7HpYc2Zq8XwLmN3vBtRk7H ',
    'ASCII lặp': 'The quick brown fox, 12:00 & 50% off! ',
    'valid_token= dày đặc (khớp tham chiếu credential_assignment)': 'valid_token=abcdefghij ',
    'gần JWT dày đặc (eyJ…. lặp)': 'eyJaaaaaaaaa.',
    'sk- lặp': 'sk-',
    'https:@ dày đặc (mỗi ":" một đoạn che)': 'https:@',
    'URL có mật khẩu dày đặc': 'a://u:p@h https:u:p@h ',
    'refresh_token:<NBSP> dày đặc': `refresh_token:${NBSP}vvvvvvvv `,
    'api_key=v dày đặc (giá trị ngắn)': 'api_key=v ',
  };
  for (const [name, unit] of Object.entries(dense)) {
    it(name, () => {
      expectLinear(
        name,
        (s) => redactText(s),
        (n) => fill(unit, n),
      );
    });
  }
});

/**
 * Chuỗi thoát dồn dập (≥ 100 k chuỗi thoát / MiB — chỉ có khi bị dựng): chi phí giải tỉ lệ số chuỗi thoát, không phải
 * ReDoS. Cùng tiêu chí: tuyến tính (tỉ lệ < 8) + trần 250 ms, cho cả chặn lẫn che. Số đo thật in ra console.
 */
describe(`chuẩn hoá (giải tới 3 lớp) với chuỗi thoát dồn dập: tỉ lệ < ${MAX_RATIO}, 1 MiB < ${CAP_MS} ms`, () => {
  const floods: Record<string, string> = {
    'chuỗi \\" lặp': `${BS}"`,
    '%XX': '%41',
    '\\uXXXX': `${BS}u0041`,
    '\\\\ lồng 3 lớp': `${BS.repeat(4)}u0041`,
    '%25 lồng 3 lớp': '%252541',
    '&#NN;': '&#65;',
    'độ rộng 0': `a${String.fromCharCode(0x200b)}`,
    fullwidth: String.fromCharCode(0xff21, 0xff22, 0xff11),
    'khoảng trắng Unicode dồn dập': `${NBSP}${IDEO_SPACE}`,
  };
  for (const [name, unit] of Object.entries(floods)) {
    it(name, () => {
      const detect = expectLinear(
        `${name} (chặn)`,
        (s) => detectCredential(s),
        (n) => fill(unit, n),
      );
      const redact = expectLinear(
        `${name} (che)`,
        (s) => redactText(s),
        (n) => fill(unit, n),
      );
      console.info(`${detect}; ${redact}`);
    });
  }
});

describe('payload: chặn kích thước trước — 1 MiB không bị quét', () => {
  it('chuỗi 1 MiB trong payload ⇒ payload_too_large, nhanh (không quét)', () => {
    let r: ReturnType<typeof screenPayload> | undefined;
    const ms = median5(() => {
      r = screenPayload({ newValue: 'a0'.repeat(MB / 2) });
    });
    expect(r).toMatchObject({ status: 'denied', code: 'payload_too_large' });
    expect(ms).toBeLessThan(CAP_MS);
  });
  it('payload tối đa trong trần (64 Ki ký tự, mảng chuỗi 16 Ki) quét < 250 ms', () => {
    const value = Array.from({ length: 4 }, (_, i) => fill(`chuỗi ${i} bình thường `, 16_000));
    const ms = median5(() => screenPayload({ items: value }));
    expect(screenPayload({ items: value })).toEqual({ status: 'ok' });
    expect(ms).toBeLessThan(CAP_MS);
  });
});
