import { Anchor } from '@ga/contracts';
import { describe, expect, it } from 'vitest';
import { cellAnchor, columnIndex, columnLetter, isRowIdOf, prefixOf, queryFields } from '../src/datagrid/columns.ts';
import { CSV_EOL, csvField, csvFileName, csvLine } from '../src/datagrid/csv.ts';
import { type Extent, type GridKey, keyCommand } from '../src/datagrid/keyboard.ts';
import { GridLayout, groupKey } from '../src/datagrid/layout.ts';
import { loadGridState, MAX_COL_WIDTH, MIN_COL_WIDTH, saveGridState } from '../src/datagrid/persist.ts';
import { INSTRUCTION_COLUMNS } from './fixtures/instructions.ts';

describe('chữ cột + anchor', () => {
  it('A…Z, AA, AZ, BA, ZZ, AAA và ngược lại', () => {
    const cases: [number, string][] = [
      [0, 'A'],
      [25, 'Z'],
      [26, 'AA'],
      [51, 'AZ'],
      [52, 'BA'],
      [701, 'ZZ'],
      [702, 'AAA'],
    ];
    for (const [i, l] of cases) {
      expect(columnLetter(i)).toBe(l);
      expect(columnIndex(l)).toBe(i);
    }
    expect(columnIndex('a')).toBe(-1);
    expect(columnIndex('AAAA')).toBe(-1);
    expect(() => columnLetter(-1)).toThrow(RangeError);
    expect(() => columnLetter(18_278)).toThrow(RangeError);
  });

  it('anchor đúng ngữ pháp đóng của hợp đồng; prefix sai bảng / ID lạ ⇒ ném lỗi (không bao giờ dựng anchor sai)', () => {
    expect(cellAnchor('skills', 'SK-0004', 'D')).toBe('grid:skills/row:SK-0004/col:D');
    expect(cellAnchor('audit_log', 'AU-09000')).toBe('grid:audit_log/row:AU-09000');
    expect(Anchor.safeParse(cellAnchor('instructions', 'IN-0003', 'AB')).success).toBe(true);
    expect(() => cellAnchor('skills', 'IN-0003', 'D')).toThrow(/anchor không hợp lệ/);
    expect(() => cellAnchor('skills', 'SK-0004', 'd')).toThrow();
    expect(() => cellAnchor('skills', 'SK-4"><x', 'D')).toThrow();
    expect(prefixOf('audit_log')).toBe('AU');
    expect(isRowIdOf('skills', 'SK-0004')).toBe(true);
    expect(isRowIdOf('skills', 'IN-0004')).toBe(false);
  });

  it('whitelist suy từ cột: id dựng sẵn + cột có query, bỏ cột query:false, giữ alias + enum', () => {
    const f = queryFields(INSTRUCTION_COLUMNS);
    expect(f.map((x) => x.name)).toEqual([
      'id',
      'ord',
      'layer',
      'name',
      'cond',
      'on',
      'tokens',
      'source',
      'updated',
      'status',
    ]);
    expect(f.find((x) => x.name === 'layer')).toMatchObject({ type: 'enum', aliases: ['lop'] });
    expect(f.find((x) => x.name === 'on')).toMatchObject({ type: 'bool' });
  });
});

describe('CSV', () => {
  it('RFC 4180: nháy kép, dấu phẩy, xuống dòng, khoảng trắng đầu/cuối được bọc; CRLF', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('nói "chào"')).toBe('"nói ""chào"""');
    expect(csvField('dòng 1\ndòng 2')).toBe('"dòng 1\ndòng 2"');
    expect(csvField(' x')).toBe('" x"');
    expect(csvField('Hoàng Phát')).toBe('Hoàng Phát');
    expect(csvLine(['IN-0001', 1.5, true, null])).toBe(`IN-0001,1.5,true,${CSV_EOL}`);
  });

  it('chặn CSV injection: ô chữ bắt đầu = + - @ TAB CR (kể cả fullwidth) có tiền tố; số âm thật không bị đổi', () => {
    for (const lead of ['=', '+', '-', '@', '\t', '\r', '\uFF1D', '\uFF0B', '\uFF0D', '\uFF20']) {
      const out = csvField(`${lead}HYPERLINK("http://x")`);
      expect(out.replace(/^"/, '').startsWith(`'${lead}`), JSON.stringify(out)).toBe(true);
    }
    expect(csvField(-5)).toBe('-5');
    expect(csvField(Number.NaN)).toBe('');
    expect(csvField('a=b')).toBe('a=b');
  });

  it('tên tệp an toàn', () => {
    expect(csvFileName('audit_log')).toBe('audit_log.csv');
    expect(csvFileName('../../etc/passwd')).toBe('etc-passwd.csv');
    expect(csvFileName('')).toBe('export.csv');
  });
});

describe('bàn phím', () => {
  const k = (key: string, m: Partial<GridKey> = {}): GridKey => ({
    key,
    ctrl: false,
    meta: false,
    shift: false,
    alt: false,
    ...m,
  });
  const ext: Extent = { rows: 10_000, cols: 10, pageRows: 20 };
  const ctx = { boolCell: false, canOpen: false };
  const cur = { row: 5, col: 3 };

  it('mũi tên, J/K, Home/End, Ctrl+mũi tên, PageUp/Down — kẹp trong biên', () => {
    expect(keyCommand(k('ArrowDown'), cur, ext, ctx)).toEqual({ type: 'move', to: { row: 6, col: 3 } });
    expect(keyCommand(k('j'), cur, ext, ctx)).toEqual({ type: 'move', to: { row: 6, col: 3 } });
    expect(keyCommand(k('k'), cur, ext, ctx)).toEqual({ type: 'move', to: { row: 4, col: 3 } });
    expect(keyCommand(k('ArrowLeft'), { row: 0, col: 0 }, ext, ctx)).toEqual({ type: 'move', to: { row: 0, col: 0 } });
    expect(keyCommand(k('End'), cur, ext, ctx)).toEqual({ type: 'move', to: { row: 5, col: 9 } });
    expect(keyCommand(k('End', { ctrl: true }), cur, ext, ctx)).toEqual({ type: 'move', to: { row: 9999, col: 9 } });
    expect(keyCommand(k('ArrowDown', { meta: true }), cur, ext, ctx)).toEqual({
      type: 'move',
      to: { row: 9999, col: 3 },
    });
    expect(keyCommand(k('PageDown'), cur, ext, ctx)).toEqual({ type: 'move', to: { row: 25, col: 3 } });
    expect(keyCommand(k('PageUp'), cur, ext, ctx)).toEqual({ type: 'move', to: { row: 0, col: 3 } });
    expect(keyCommand(k('Home', { ctrl: true }), cur, ext, ctx)).toEqual({ type: 'move', to: { row: 0, col: 0 } });
  });

  it('Enter = mở hàng nếu màn có inspector, không thì sửa; F2 luôn sửa; Space bật/tắt ô bool; Shift+Space chọn hàng', () => {
    expect(keyCommand(k('Enter'), cur, ext, ctx)).toEqual({ type: 'edit' });
    expect(keyCommand(k('Enter'), cur, ext, { ...ctx, canOpen: true })).toEqual({ type: 'open' });
    expect(keyCommand(k('F2'), cur, ext, { ...ctx, canOpen: true })).toEqual({ type: 'edit' });
    expect(keyCommand(k(' '), cur, ext, ctx)).toBeNull();
    expect(keyCommand(k(' '), cur, ext, { ...ctx, boolCell: true })).toEqual({ type: 'toggle' });
    expect(keyCommand(k(' ', { shift: true }), cur, ext, ctx)).toEqual({ type: 'select-row' });
    expect(keyCommand(k('a', { ctrl: true }), cur, ext, ctx)).toEqual({ type: 'select-all' });
    expect(keyCommand(k('/'), cur, ext, ctx)).toEqual({ type: 'focus-query' });
  });

  it('không nuốt phím của trình duyệt / phím tắt toàn cục: Tab, Alt+…, Ctrl+J, Ctrl+K, chữ thường khác', () => {
    expect(keyCommand(k('Tab'), cur, ext, ctx)).toBeNull();
    expect(keyCommand(k('ArrowDown', { alt: true }), cur, ext, ctx)).toBeNull();
    expect(keyCommand(k('j', { meta: true }), cur, ext, ctx)).toBeNull();
    expect(keyCommand(k('k', { ctrl: true }), cur, ext, ctx)).toBeNull();
    expect(keyCommand(k('x'), cur, ext, ctx)).toBeNull();
    expect(keyCommand(k('Enter'), null, ext, ctx)).toBeNull();
  });

  it('chưa có ô chọn: phím di chuyển đầu tiên chọn ô (0, 0); lưới rỗng chỉ còn `/`', () => {
    expect(keyCommand(k('ArrowDown'), null, ext, ctx)).toEqual({ type: 'move', to: { row: 0, col: 0 } });
    expect(keyCommand(k('ArrowDown'), null, { rows: 0, cols: 3, pageRows: 1 }, ctx)).toBeNull();
    expect(keyCommand(k('/'), null, { rows: 0, cols: 3, pageRows: 1 }, ctx)).toEqual({ type: 'focus-query' });
  });
});

describe('GridLayout (nhóm)', () => {
  it('không nhóm: hàng ảo = hàng dữ liệu', () => {
    const l = new GridLayout(5, null);
    expect(l.count).toBe(5);
    expect(l.at(3)).toEqual({ kind: 'row', index: 3 });
    expect(l.at(5)).toBeNull();
    expect(l.vIndexOfRow(4)).toBe(4);
    expect(l.vIndexOfRow(5)).toBeNull();
    expect(l.dataRanges(1, 3)).toEqual([[1, 4]]);
  });

  it('nhóm: tiêu đề + hàng; thu gọn ẩn hàng; vIndexOfRow / groupOfRow; dataRanges không tải nhóm thu gọn ở giữa', () => {
    const groups = [
      { value: 'a', count: 2 },
      { value: 'b', count: 9000 },
      { value: null, count: 3 },
    ];
    const open = new GridLayout(9005, groups);
    expect(open.count).toBe(9005 + 3);
    expect(open.at(0)).toEqual({ kind: 'group', group: 0 });
    expect(open.at(1)).toEqual({ kind: 'row', index: 0 });
    expect(open.at(3)).toEqual({ kind: 'group', group: 1 });
    expect(open.at(4)).toEqual({ kind: 'row', index: 2 });
    expect(open.vIndexOfRow(9002)).toBe(9002 + 3);
    expect(open.groupOfRow(9001)).toBe(1);
    const shut = new GridLayout(9005, groups, new Set([groupKey('b')]));
    expect(shut.count).toBe(2 + 3 + 3);
    expect(shut.isOpen(1)).toBe(false);
    expect(shut.vIndexOfRow(100)).toBeNull();
    expect(shut.at(4)).toEqual({ kind: 'group', group: 2 });
    expect(shut.at(5)).toEqual({ kind: 'row', index: 9002 });
    // dải nhìn thấy gồm cuối nhóm a, tiêu đề b (thu gọn), đầu nhóm null ⇒ hai dải, không có 9000 hàng của b
    expect(shut.dataRanges(0, 7)).toEqual([
      [0, 2],
      [9002, 9005],
    ]);
  });
});

describe('nhớ trạng thái bảng — đọc phòng thủ', () => {
  const mem = (init: Record<string, string> = {}) => {
    const m = new Map(Object.entries(init));
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  };
  const ids = ['name', 'layer', 'token_count'];

  it('ghi rồi đọc lại đủ trường hợp lệ', () => {
    const s = mem();
    saveGridState(s, 'k', {
      q: 'on:true',
      sort: [{ column: 'name', desc: true }],
      hidden: ['layer'],
      widths: { name: 200 },
      density: 'comfortable',
      groupBy: 'layer',
      view: 'on',
    });
    expect(loadGridState(s, 'k', ids)).toEqual({
      q: 'on:true',
      sort: [{ column: 'name', desc: true }],
      hidden: ['layer'],
      widths: { name: 200 },
      density: 'comfortable',
      groupBy: 'layer',
      view: 'on',
    });
  });

  it('rác / phiên bản lạ / cột không còn / kiểu sai / quá cỡ ⇒ bỏ từng trường, không ném', () => {
    expect(loadGridState(mem({ 'ga.grid.k': '{hỏng' }), 'k', ids)).toEqual({});
    expect(loadGridState(mem({ 'ga.grid.k': '{"v":2,"q":"x"}' }), 'k', ids)).toEqual({});
    expect(loadGridState(mem({ 'ga.grid.k': 'x'.repeat(20_000) }), 'k', ids)).toEqual({});
    const got = loadGridState(
      mem({
        'ga.grid.k': JSON.stringify({
          v: 1,
          q: 5,
          sort: [
            { column: 'gone', desc: true },
            { column: 'name', desc: 'yes' },
            { column: 'layer', desc: false },
          ],
          hidden: ['gone', 3, 'name'],
          widths: { name: 99_999, layer: 'x', gone: 10, token_count: 1 },
          density: 'huge',
          groupBy: 'gone',
          view: 'x'.repeat(65),
        }),
      }),
      'k',
      ids,
    );
    expect(got).toEqual({
      sort: [{ column: 'layer', desc: false }],
      hidden: ['name'],
      widths: { name: MAX_COL_WIDTH, token_count: MIN_COL_WIDTH },
    });
  });
});
