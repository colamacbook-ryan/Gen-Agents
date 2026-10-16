// Hiệu năng bộ quét (STD-11 1.10: ReDoS — chạy tuyến tính, test chuỗi 1 MB). Mỗi ca: lượt nhanh nhất trong 5 lần < 50 ms
// cho cả chặn (dừng ở mẫu đầu) lẫn che (tìm mọi mẫu). Thêm kiểm tỉ lệ thời gian 1 MB / 256 KB (tuyến tính ≈ 4; bậc hai ≈ 16).
// Lưu ý: máy cloud 4 CPU dùng chung với lane khác — ngưỡng tính theo lượt nhanh nhất, min(thời gian thực, thời gian CPU).
import { describe, expect, it } from 'vitest';
import { detectCredential, redactText, screenPayload } from '../src/index.ts';

const MB = 1024 * 1024;
const fill = (unit: string, size = MB) => unit.repeat(Math.ceil(size / unit.length)).slice(0, size);
const NBSP = String.fromCharCode(0xa0);
const IDEO_SPACE = String.fromCharCode(0x3000);

/**
 * Lượt nhanh nhất trong `rounds` lần. Đo CẢ thời gian thực lẫn thời gian CPU của tiến trình (process.cpuUsage) và lấy giá trị
 * nhỏ hơn: máy cloud 4 CPU chạy song song nhiều lane, thời gian thực bị kéo dài khi tiến trình phải chờ CPU — thời gian CPU
 * phản ánh đúng chi phí thuật toán. Cả hai số đều in ra trong thông báo assert để báo cáo.
 */
function fastest(fn: () => unknown, rounds = 5): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < rounds; i++) {
    const c0 = process.cpuUsage();
    const t0 = performance.now();
    fn();
    const wall = performance.now() - t0;
    const c = process.cpuUsage(c0);
    best = Math.min(best, wall, (c.user + c.system) / 1000);
  }
  return best;
}

/** Bộ chuỗi đối kháng của contracts (M0) + các lối mới của bộ dùng chung (tiền tố mới, chuẩn hoá, kim mã hoá). */
const adversarial: Record<string, string> = {
  'toàn a': 'a'.repeat(MB),
  'toàn 0': '0'.repeat(MB),
  'xen kẽ a0': fill('a0'),
  'sk- lặp': fill('sk-'),
  'sk- x lặp (không đủ dài)': fill('sk-x '),
  'eyJ lặp': fill('eyJ'),
  'eyJ…. lặp (gần JWT)': fill('eyJaaaaaaaaa.'),
  'ya29. lặp': fill('ya29.'),
  '1//0 lặp': fill('1//0'),
  'AIza lặp': fill('AIza'),
  'ghp_ lặp': fill('ghp_'),
  'xoxb- lặp': fill('xoxb-'),
  'AKIA lặp': fill('AKIA'),
  'BEGIN + 1 MB chữ hoa': `-----BEGIN ${'A'.repeat(MB - 11)}`,
  'BEGIN lặp': fill('-----BEGIN '),
  'BEGIN PRIVATE KEY lặp không END': fill('-----BEGIN PRIVATE KEY----- '),
  'refresh_token + 1 MB khoảng trắng': `refresh_token${' '.repeat(MB - 13)}`,
  'refresh_token lặp': fill('refresh_token '),
  'password= lặp (giá trị ngắn)': fill('password=x '),
  'GA-CANARY- lặp': fill('GA-CANARY-'),
  'gạch nối': '-'.repeat(MB),
  '8 chữ số + : lặp': fill('12345678:'),
  ':// lặp': fill('a://b:c'),
  'bearer lặp': fill('bearer '),
  'hex dài': fill('0123456789abcdef'),
  'base64 + / lặp': fill('QUJD+/'),
  'tiếng Việt': fill('Xin chào, đây là một câu tiếng Việt bình thường lúc 14:00. '),
  'ASCII in được': Array.from({ length: MB }, (_, i) => String.fromCharCode(32 + ((i * 7919) % 95))).join(''),
  'kim base64 canary lặp': fill('R0EtQ0FOQVJZLxyz '),
  'eyJ + 5 ký tự lặp (ứng viên JWT hụt)': fill('eyJaaaaa '),
  'xghp_ lặp (hụt ranh giới)': fill(`xghp_${'a'.repeat(30)} `),
  ': + 35 ký tự không chữ số trước': fill(`:${'a'.repeat(35)} `),
  'xbearer lặp (hụt ranh giới)': fill(`xbearer ${'a'.repeat(16)} `),
  'GA-CANARY- + 8 ký tự ngoài hex lặp': fill('GA-CANARY-zzzzzzzz '),
  'xpassword= lặp (tên mở rộng hụt ranh giới)': fill('xpassword=abcdefghij '),
  'đoạn 31 ký tự đủ loại lặp': fill('aB3dE5gH7jK9mN2pQ4rS6tU8vW1xY3z '),
  // URL userinfo (xấp xỉ trên của parser URL): ứng viên lồng nhau, ':' dồn dập, gạch dài, TAB chen scheme, câu thường
  'https: lặp + @ cuối (ứng viên A lồng nhau)': `${fill('https:', MB - 1)}@`,
  ': dồn dập + @ cuối': `${':'.repeat(MB - 1)}@`,
  'x:// lặp + @ cuối': `${fill('x://', MB - 1)}@`,
  'http: + 1 MB gạch': `http:${'/\\'.repeat(MB / 2 - 8)}u:p@h`,
  'scheme chen TAB lặp + @ cuối': `${fill('h\tt\tt\tp\ts\t:', MB - 1)}@`,
  'ws: 10:30 a@b lặp (câu thường)': fill('ws: lúc 10:30 gửi a@b '),
  '@: lặp': fill('@:'),
  'h + 1 MB TAB + :@ (ứng viên A quét đoạn TAB)': `h${'\t'.repeat(MB - 4)}:@x`,
  'x://a/ + 1 MB chữ + @ rồi x:// lặp (vòng lùi một lần)': `x://a/${'b'.repeat(MB / 2)}${fill('x://', MB / 2 - 8)}@`,
  // tên credential mọi kiểu viết + base64_secret_run (contracts 0a2bfff)
  'refresh-_-_-_- lặp': fill('refresh-_-_-_-'),
  'api_ _ _ lặp (tên hụt)': fill('api___-__-_ '),
  'base64 1 MB (+ / thưa, ít đổi lớp)': fill('aaaaAAAA1111/'),
  'base64 đoạn 39 lặp': fill(`${'Ab1+'.repeat(9)}Ab1 `),
  'base64 1 MB không / (một đoạn dài)': fill('Ab1+Cd2+Ef3+'),
  // khoảng trắng Unicode (gập thành space trước khi quét)
  'NBSP xen kẽ': fill(`a${NBSP}`),
  'U+3000 + password= lặp': fill(`password${IDEO_SPACE}=${IDEO_SPACE}x `),
};

describe('chuỗi 1 MB — chặn (dừng ở mẫu đầu) < 50 ms', () => {
  for (const [name, str] of Object.entries(adversarial)) {
    it(name, () => {
      const ms = fastest(() => detectCredential(str));
      expect(ms, `${name}: ${ms.toFixed(1)} ms`).toBeLessThan(50);
    });
  }
});

/** Che: chuỗi đối kháng KHÔNG chứa credential < 50 ms; chuỗi có N mẫu thật tốn O(n + N) — kiểm ở nhóm "tuyến tính". */
describe('chuỗi 1 MB — che (tìm mọi mẫu) chuỗi sạch < 50 ms', () => {
  for (const [name, str] of Object.entries(adversarial).filter(([, v]) => detectCredential(v) === null)) {
    it(name, () => {
      const ms = fastest(() => redactText(str));
      expect(ms, `${name}: ${ms.toFixed(1)} ms`).toBeLessThan(50);
    });
  }
});

describe('tuyến tính: thời gian 1 MB / 256 KB < 8 (bậc hai ⇒ ≈ 16)', () => {
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
  };
  for (const [name, unit] of Object.entries(dense)) {
    it(name, () => {
      const small = fastest(() => redactText(fill(unit, MB / 4)));
      const big = fastest(() => redactText(fill(unit, MB)));
      const ratio = big / Math.max(small, 0.5);
      expect(
        ratio,
        `${name}: 256 KB ${small.toFixed(1)} ms, 1 MB ${big.toFixed(1)} ms, tỉ lệ ${ratio.toFixed(1)}`,
      ).toBeLessThan(8);
    });
  }
});

/**
 * Chuỗi thoát dồn dập (≥ 100 k chuỗi thoát / MB — chỉ có khi bị dựng): chi phí giải tỉ lệ số chuỗi thoát, không phải
 * ReDoS. Bắt buộc tuyến tính (tỉ lệ 1 MB / 256 KB < 8) + trần an toàn 250 ms. Số đo thật in trong thông báo assert.
 */
describe('chuẩn hoá (giải tới 3 lớp) với chuỗi thoát dồn dập 1 MB: tuyến tính, < 250 ms', () => {
  const floods: Record<string, string> = {
    'chuỗi \\" lặp': fill('\\"'),
    '%XX': fill('%41'),
    '\\uXXXX': fill('\\u0041'),
    '\\\\ lồng 3 lớp': fill('\\\\\\\\u0041'),
    '%25 lồng 3 lớp': fill('%252541'),
    '&#NN;': fill('&#65;'),
    'độ rộng 0': fill('a\u200b'),
    fullwidth: fill('\uff21\uff22\uff11'),
    'khoảng trắng Unicode dồn dập': fill(`${NBSP}${IDEO_SPACE}`),
  };
  for (const [name, str] of Object.entries(floods)) {
    it(name, () => {
      const detect = fastest(() => detectCredential(str));
      const small = fastest(() => redactText(str.slice(0, MB / 4)));
      const big = fastest(() => redactText(str));
      const msg = `${name}: chặn ${detect.toFixed(1)} ms, che 256 KB ${small.toFixed(1)} ms, che 1 MB ${big.toFixed(1)} ms`;
      console.info(msg);
      expect(detect, msg).toBeLessThan(250);
      expect(big, msg).toBeLessThan(250);
      expect(big / Math.max(small, 0.5), msg).toBeLessThan(8);
    });
  }
});

describe('payload: chặn kích thước trước — 1 MB không bị quét', () => {
  it('chuỗi 1 MB trong payload ⇒ payload_too_large, nhanh', () => {
    let r: ReturnType<typeof screenPayload> | undefined;
    const ms = fastest(() => {
      r = screenPayload({ newValue: 'a0'.repeat(MB / 2) });
    });
    expect(r).toMatchObject({ status: 'denied', code: 'payload_too_large' });
    expect(ms).toBeLessThan(50);
  });
  it('payload tối đa trong trần (64 Ki ký tự, mảng chuỗi 16 Ki) quét < 50 ms', () => {
    const value = Array.from({ length: 4 }, (_, i) => fill(`chuỗi ${i} bình thường `, 16_000));
    const ms = fastest(() => screenPayload({ items: value }));
    expect(screenPayload({ items: value })).toEqual({ status: 'ok' });
    expect(ms).toBeLessThan(50);
  });
});
