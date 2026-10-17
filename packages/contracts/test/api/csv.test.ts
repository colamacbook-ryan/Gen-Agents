import { describe, expect, it } from 'vitest';
import { API_LIMITS, csv, csvCell, csvRow, ROUTES } from '../../src/index.ts';

// Review bảo mật PR #7 (L3): CSV chống formula injection — ô VĂN BẢN bị thoát, ô SỐ giữ nguyên.

describe('csvCell', () => {
  it("công thức dạng chữ bị thoát bằng tiền tố ' rồi bọc ngoặc kép: =1+1, @SUM, +cmd, -cmd, tab, CR", () => {
    expect(csvCell('=1+1')).toBe(`"'=1+1"`);
    expect(csvCell('@SUM(A1)')).toBe(`"'@SUM(A1)"`);
    expect(csvCell('+1')).toBe(`"'+1"`);
    expect(csvCell('-cmd|x')).toBe(`"'-cmd|x"`);
    expect(csvCell('\t=1')).toBe(`"'\t=1"`);
    expect(csvCell('\r=1')).toBe(`"'\r=1"`);
    expect(csvCell('  =HYPERLINK("x")')).toBe(`"'  =HYPERLINK(""x"")"`);
  });

  it('số giữ nguyên (-500 là số), chuỗi "-500" là VĂN BẢN nên bị thoát; boolean / null / NaN', () => {
    expect(csvCell(-500)).toBe('-500');
    expect(csvCell(0.25)).toBe('0.25');
    expect(csvCell('-500')).toBe(`"'-500"`);
    expect(csvCell(true)).toBe('true');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(Number.NaN)).toBe('');
    expect(csvCell(Number.POSITIVE_INFINITY)).toBe('');
  });

  it('văn bản thường được bọc ngoặc kép đầy đủ: dấu phẩy, ngoặc kép, xuống dòng không phá cấu trúc; không thoát thừa', () => {
    expect(csvCell('hello')).toBe('"hello"');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell('a=b')).toBe('"a=b"');
    expect(csvCell('')).toBe('""');
  });

  it('csvRow nối bằng dấu phẩy, kết thúc CRLF', () => {
    expect(csvRow(['=x', 5, null, 'ok'])).toBe(`"'=x",5,,"ok"\r\n`);
  });
});

describe('csv(): khai báo xuất CSV', () => {
  it('mọi route csv phải khai formulaEscape = true, maxRows nguyên dương, streamed = true', () => {
    const routes = ROUTES.filter((r) => r.response.kind === 'csv');
    expect(routes.map((r) => r.id).sort()).toEqual(['OPS-23', 'OPS-34']);
    for (const r of routes) {
      const res = r.response as { formulaEscape: boolean; maxRows: number; streamed: boolean };
      expect(res.formulaEscape, r.id).toBe(true);
      expect(res.streamed, r.id).toBe(true);
      expect(Number.isInteger(res.maxRows) && res.maxRows >= 1 && res.maxRows <= API_LIMITS.csvMaxRows, r.id).toBe(
        true,
      );
    }
  });

  it('maxRows không hợp lệ ⇒ lỗi lúc khai báo', () => {
    expect(() => csv({ formulaEscape: true, maxRows: 0 })).toThrow();
    expect(() => csv({ formulaEscape: true, maxRows: 1.5 })).toThrow();
    expect(csv({ formulaEscape: true, maxRows: 10 })).toEqual({
      kind: 'csv',
      formulaEscape: true,
      maxRows: 10,
      streamed: true,
    });
  });
});
