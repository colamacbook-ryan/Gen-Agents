import { describe, expect, it } from 'vitest';
import { maskAccountHint, measuredPromptTokens } from '../src/index.ts';
import { epochSecondsToDb, splitLines } from '../src/text.ts';

describe('account_hint dạng che (G-23, DATABASE: "mask ngay lúc ghi")', () => {
  it('email ⇒ ký tự đầu + *** + tên miền (khớp seed r***@gmail.com)', () => {
    expect(maskAccountHint('mai.nguyen@example.com')).toBe('m***@example.com');
    expect(maskAccountHint('  Linh@Example.ORG ')).toBe('L***@example.org');
    expect(maskAccountHint('ư@ví-dụ.vn')).toBe('ư***@ví-dụ.vn');
  });
  it('ca âm: không phải email / nhiều @ / thiếu tên miền / ký tự điều khiển / không phải chuỗi ⇒ null (không ghi bản rõ)', () => {
    for (const v of [
      '',
      'abc',
      '@x.io',
      'a@',
      'a@b',
      'a@@b.io',
      'a@b@c.io',
      'a b@c.io',
      'a@.io',
      'a@io.',
      'a\n@b.io',
      null,
      42,
      {},
    ]) {
      expect(maskAccountHint(v), JSON.stringify(v)).toBeNull();
    }
    expect(maskAccountHint(`a@${'x'.repeat(130)}.io`)).toBeNull();
  });
});

describe('tiện ích', () => {
  it('splitLines tách \\n và \\r\\n, bỏ dòng rỗng', () => {
    expect(splitLines('a\r\nb\n\nc')).toEqual(['a', 'b', 'c']);
  });
  it('giờ reset: giây Unix ⇒ ts DB; giá trị lạ ⇒ null (không đoán)', () => {
    expect(epochSecondsToDb(1791975600)).toBe('2026-10-14T11:00:00.000Z');
    for (const v of [null, '1791975600', Number.NaN, 1e15, -1, 0]) expect(epochSecondsToDb(v)).toBeNull();
  });
  it('token prompt đo thật = input + cache đọc + cache ghi; toàn null ⇒ chưa đo được', () => {
    expect(measuredPromptTokens({ input: 2, cacheRead: 0, cacheWrite: 33987 })).toBe(33989);
    expect(measuredPromptTokens({ input: 120, cacheRead: 100, cacheWrite: null })).toBe(220);
    expect(measuredPromptTokens({ input: null, cacheRead: null, cacheWrite: null })).toBeNull();
  });
});
