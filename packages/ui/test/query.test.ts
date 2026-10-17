import { describe, expect, it } from 'vitest';
import { compileQuery, type EvalContext } from '../src/query-box/evaluate.ts';
import { type QueryField, resolveQuery } from '../src/query-box/fields.ts';
import { FOLD_MAX_CHARS, foldVi } from '../src/query-box/fold.ts';
import {
  joinClauses,
  parseQuery,
  QUERY_MAX_CHARS,
  QUERY_MAX_CLAUSES,
  QUERY_MAX_VALUES,
  removeClause,
} from '../src/query-box/parse.ts';

const ok = (q: string) => {
  const r = parseQuery(q);
  if (!r.ok) throw new Error(`parse lỗi: ${JSON.stringify(r.error)}`);
  return r.clauses;
};
const err = (q: string) => {
  const r = parseQuery(q);
  if (r.ok) throw new Error(`phải lỗi: ${q}`);
  return r.error;
};

describe('parseQuery — ngữ pháp DATABASE §8.1', () => {
  it('ví dụ chuẩn: role:Mai status:active tokens>200', () => {
    const c = ok('role:Mai status:active tokens>200');
    expect(c.map((x) => (x.kind === 'field' ? [x.field, x.op, x.values.map((v) => v.text)] : x))).toEqual([
      ['role', ':', ['Mai']],
      ['status', ':', ['active']],
      ['tokens', '>', ['200']],
    ]);
  });

  it('đủ 7 toán tử, phân biệt >= với >, != với =', () => {
    const ops = ok('a:1 b=2 c!=3 d>4 e>=5 f<6 g<=7').map((x) => (x.kind === 'field' ? x.op : null));
    expect(ops).toEqual([':', '=', '!=', '>', '>=', '<', '<=']);
  });

  it('phủ định, nhiều giá trị, cụm từ, range, reldate', () => {
    const [a, b, c, d] = ok('-status:obsolete,superseded role:"Hoàng Phát" created:2026-10-01..2026-10-15 created>-7d');
    expect(a).toMatchObject({
      kind: 'field',
      negated: true,
      field: 'status',
      values: [{ text: 'obsolete' }, { text: 'superseded' }],
    });
    expect(b).toMatchObject({ field: 'role', values: [{ kind: 'phrase', text: 'Hoàng Phát' }] });
    expect(c).toMatchObject({ values: [{ kind: 'range', from: { text: '2026-10-01' }, to: { text: '2026-10-15' } }] });
    expect(d).toMatchObject({ op: '>', values: [{ kind: 'reldate', amount: 7, unit: 'd' }] });
  });

  it('số âm không phải reldate; từ trần dạng ID và cụm từ tự do là text', () => {
    const [a, b, c, d] = ok('amount>-5 MM-0041 "báo cáo tuần" -nháp');
    expect(a).toMatchObject({ values: [{ kind: 'word', text: '-5' }] });
    expect(b).toMatchObject({ kind: 'text', text: 'MM-0041', phrase: false, negated: false });
    expect(c).toMatchObject({ kind: 'text', text: 'báo cáo tuần', phrase: true });
    expect(d).toMatchObject({ kind: 'text', text: 'nháp', negated: true });
  });

  it('vị trí [start, end) của mệnh đề và atom khớp chuỗi gốc', () => {
    const q = '  role:Mai   -status:a,b ';
    const [a, b] = ok(q);
    expect(q.slice(a?.start, a?.end)).toBe('role:Mai');
    expect(q.slice(b?.start, b?.end)).toBe('-status:a,b');
    if (b?.kind !== 'field') throw new Error();
    expect(b.values.map((v) => q.slice(v.start, v.end))).toEqual(['a', 'b']);
  });

  it('lỗi cú pháp có vị trí: thiếu giá trị, nháy không đóng, ký tự thừa sau cụm từ, nháy lạc', () => {
    expect(err('role: x')).toMatchObject({ reason: 'syntax', position: 0, detail: 'missing_value' });
    expect(err('a:1 "chưa đóng')).toMatchObject({ reason: 'syntax', position: 4, detail: 'unclosed_quote' });
    expect(err('role:"Mai"x')).toMatchObject({ reason: 'syntax', position: 0, detail: 'unexpected_char' });
    expect(err('ab"c')).toMatchObject({ reason: 'syntax', position: 2, detail: 'stray_quote' });
    expect(err('role:Mai,')).toMatchObject({ reason: 'syntax', detail: 'missing_value' });
    expect(err('created:2026..')).toMatchObject({ reason: 'syntax', detail: 'missing_range_end' });
    expect(err('""')).toMatchObject({ reason: 'syntax', detail: 'empty_phrase' });
  });

  it('trần: độ dài, số mệnh đề, số giá trị ⇒ too_complex', () => {
    expect(err('a'.repeat(QUERY_MAX_CHARS + 1))).toMatchObject({ reason: 'too_complex', detail: 'too_long' });
    expect(parseQuery('a'.repeat(QUERY_MAX_CHARS)).ok).toBe(true);
    const many = Array.from({ length: QUERY_MAX_CLAUSES + 1 }, (_, i) => `w${i}`).join(' ');
    expect(err(many)).toMatchObject({ reason: 'too_complex', detail: 'too_many_clauses' });
    expect(ok(many.split(' ').slice(0, QUERY_MAX_CLAUSES).join(' '))).toHaveLength(QUERY_MAX_CLAUSES);
    const vals = `s:${Array.from({ length: QUERY_MAX_VALUES + 1 }, (_, i) => `v${i}`).join(',')}`;
    expect(err(vals)).toMatchObject({ reason: 'too_complex', detail: 'too_many_values' });
  });

  it('chuỗi rỗng / chỉ khoảng trắng = không điều kiện', () => {
    expect(ok('')).toEqual([]);
    expect(ok(' \t ')).toEqual([]);
  });

  it('chạy tuyến tính trên đầu vào xấu (đo tỉ lệ, không trần tuyệt đối sát)', () => {
    const time = (s: string): number => {
      const xs: number[] = [];
      for (let k = 0; k < 3; k++) {
        const t = performance.now();
        for (let i = 0; i < 200; i++) parseQuery(s);
        xs.push(performance.now() - t);
      }
      return xs.sort((a, b) => a - b)[1] as number;
    };
    const small = time('a:'.repeat(60));
    const big = time('a:'.repeat(240));
    expect(big / Math.max(small, 0.01)).toBeLessThan(8 * 4);
    expect(time(`-${'"'.repeat(1)}${'x'.repeat(498)}`)).toBeLessThan(2000);
  });

  it('removeClause / joinClauses giữ nguyên văn bản các mệnh đề còn lại', () => {
    const q = 'role:Mai  status:"đang chạy"   tokens>200';
    const c = ok(q);
    expect(removeClause(q, c, 1)).toBe('role:Mai tokens>200');
    expect(removeClause(q, c, 9)).toBe(q);
    expect(joinClauses([' a:1 ', '', 'b'])).toBe('a:1 b');
  });
});

const FIELDS: QueryField[] = [
  { name: 'id', type: 'id' },
  { name: 'role', aliases: ['vai'], type: 'text' },
  {
    name: 'status',
    aliases: ['trang-thai'],
    type: 'enum',
    values: [{ value: 'active' }, { value: 'superseded', aliases: ['bi-thay'] }, { value: 'obsolete' }],
  },
  { name: 'tokens', type: 'number' },
  { name: 'on', aliases: ['bat'], type: 'bool' },
  { name: 'created', type: 'date' },
  { name: 'action', type: 'text' },
];

describe('resolveQuery — whitelist DATABASE §8.2', () => {
  it('alias tiếng Việt không dấu cho tên trường và giá trị enum', () => {
    const r = resolveQuery('vai:Mai trang-thai:bi-thay BAT:co', FIELDS);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect(r.clauses.map((c) => (c.kind === 'cmp' ? [c.field.name, c.values] : null))).toEqual([
      ['role', [{ kind: 'eq', value: 'Mai' }]],
      ['status', [{ kind: 'eq', value: 'superseded' }]],
      ['on', [{ kind: 'eq', value: true }]],
    ]);
  });

  it('cột ngoài whitelist ⇒ unknown_field đúng vị trí tên trường (kể cả khi phủ định)', () => {
    const r = resolveQuery('role:Mai -abc:1', FIELDS);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatchObject({ reason: 'unknown_field', position: 10, length: 3, token: 'abc' });
  });

  it('toán tử không hợp kiểu ⇒ op_not_allowed; giá trị sai kiểu ⇒ bad_value đúng vị trí atom', () => {
    expect(resolveQuery('status>active', FIELDS)).toMatchObject({
      ok: false,
      error: { reason: 'op_not_allowed', position: 6 },
    });
    expect(resolveQuery('tokens>nhiều', FIELDS)).toMatchObject({
      ok: false,
      error: { reason: 'bad_value', position: 7 },
    });
    expect(resolveQuery('status:zzz', FIELDS)).toMatchObject({
      ok: false,
      error: { reason: 'bad_value', token: 'zzz' },
    });
    expect(resolveQuery('created:hôm-qua', FIELDS)).toMatchObject({ ok: false, error: { reason: 'bad_value' } });
    expect(resolveQuery('tokens>1,2', FIELDS)).toMatchObject({ ok: false, error: { reason: 'bad_value', token: '2' } });
    expect(resolveQuery('tokens>1..5', FIELDS)).toMatchObject({ ok: false, error: { reason: 'bad_value' } });
    expect(resolveQuery('role:-7d', FIELDS)).toMatchObject({ ok: false, error: { reason: 'bad_value' } });
    expect(resolveQuery('on:maybe', FIELDS)).toMatchObject({ ok: false, error: { reason: 'bad_value' } });
  });

  it('từ trần dạng display_id của lưới ⇒ điều kiện id; prefix khác ⇒ tìm toàn văn', () => {
    const r = resolveQuery('IN-0003 SK-0004', FIELDS, { idPrefix: 'IN' });
    if (!r.ok) throw new Error();
    expect(r.clauses.map((c) => c.kind)).toEqual(['id', 'text']);
    expect(resolveQuery('id:SK-0004', FIELDS, { idPrefix: 'IN' })).toMatchObject({
      ok: false,
      error: { reason: 'bad_value' },
    });
  });

  it('text kết thúc bằng * = khớp tiền tố (action:ledger.*)', () => {
    const r = resolveQuery('action:ledger.*', FIELDS);
    if (!r.ok) throw new Error();
    expect(r.clauses[0]).toMatchObject({ kind: 'cmp', values: [{ kind: 'prefix', value: 'ledger.' }] });
  });
});

describe('compileQuery — ngữ nghĩa bám SQL', () => {
  interface Row {
    id: string;
    role: string | null;
    status: string;
    tokens: number | null;
    on: boolean;
    created: string;
    action: string;
  }
  const rows: Row[] = [
    {
      id: 'IN-0001',
      role: 'Mai',
      status: 'active',
      tokens: 120,
      on: true,
      created: '2026-10-01T08:00:00.000Z',
      action: 'ledger.penalty',
    },
    {
      id: 'IN-0002',
      role: 'Lan',
      status: 'superseded',
      tokens: 300,
      on: false,
      created: '2026-10-10T08:00:00.000Z',
      action: 'task.report',
    },
    {
      id: 'IN-0003',
      role: null,
      status: 'obsolete',
      tokens: null,
      on: true,
      created: '2026-10-15T23:59:00.000Z',
      action: 'ledger.reward',
    },
    {
      id: 'IN-0004',
      role: 'Đặng Thị Hoà',
      status: 'active',
      tokens: 201,
      on: true,
      created: '2026-10-16T00:00:00.000Z',
      action: 'notify.owner',
    },
  ];
  const ctx: EvalContext<Row> = {
    value: (f, r) => (r as unknown as Record<string, string | number | boolean | null>)[f.name] ?? null,
    text: (r) => foldVi(`${r.role ?? ''} ${r.action}`),
    id: (r) => r.id,
    now: () => Date.parse('2026-10-17T00:00:00.000Z'),
  };
  const run = (q: string): string[] => {
    const r = resolveQuery(q, FIELDS, { idPrefix: 'IN' });
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    return rows.filter(compileQuery(r.clauses, ctx)).map((x) => x.id);
  };

  it('AND giữa mệnh đề; nhiều giá trị = IN; phủ định = NOT IN', () => {
    expect(run('status:active tokens>200')).toEqual(['IN-0004']);
    expect(run('status:active,obsolete')).toEqual(['IN-0001', 'IN-0003', 'IN-0004']);
    expect(run('-status:obsolete,superseded')).toEqual(['IN-0001', 'IN-0004']);
  });

  it('NULL không khớp so sánh nào, kể cả != (như SQL)', () => {
    expect(run('tokens<1000')).toEqual(['IN-0001', 'IN-0002', 'IN-0004']);
    expect(run('role!=Mai')).toEqual(['IN-0002', 'IN-0004']);
  });

  it('text `:` = chứa, không dấu, không phân biệt hoa thường; `=` = bằng', () => {
    expect(run('role:hoa')).toEqual(['IN-0004']);
    expect(run('role:DANG')).toEqual(['IN-0004']);
    expect(run('role=hoa')).toEqual([]);
    expect(run('role="đặng thị hoà"')).toEqual(['IN-0004']);
  });

  it('ngày: range bao gồm hai đầu, ngày không giờ so cả ngày; reldate theo Clock tiêm vào', () => {
    expect(run('created:2026-10-01..2026-10-15')).toEqual(['IN-0001', 'IN-0002', 'IN-0003']);
    expect(run('created<=2026-10-15')).toEqual(['IN-0001', 'IN-0002', 'IN-0003']);
    expect(run('created>2026-10-15')).toEqual(['IN-0004']);
    expect(run('created>-7d')).toEqual(['IN-0002', 'IN-0003', 'IN-0004']);
    expect(run('created>=-2d')).toEqual(['IN-0003', 'IN-0004']);
  });

  it('id, tiền tố, toàn văn, bool', () => {
    expect(run('IN-0002')).toEqual(['IN-0002']);
    expect(run('-IN-0002 on:khong')).toEqual([]);
    expect(run('action:ledger.*')).toEqual(['IN-0001', 'IN-0003']);
    expect(run('"task.report"')).toEqual(['IN-0002']);
    expect(run('on:true -hoa')).toEqual(['IN-0001', 'IN-0003']);
  });
});

describe('foldVi', () => {
  it('bỏ dấu từng ký tự, đ → d, chữ thường, giữ độ dài với văn bản NFC', () => {
    const s = 'Đặng Thị Hoà — Trương Ưng Ỷ';
    expect(foldVi(s)).toBe('dang thi hoa — truong ung y');
    expect(foldVi(s)).toHaveLength(s.length);
    expect(foldVi('ĂẮẰẲẴẶÂẤẦẨẪẬÊẾỀỂỄỆÔỐỒỔỖỘƠỚỜỞỠỢƯỨỪỬỮỰÝỲỶỸỴ')).toBe('aaaaaaaaaaaaeeeeeeoooooooooooouuuuuuyyyyy');
  });
  it('văn bản dạng tách (dấu tổ hợp) cho cùng kết quả; cặp surrogate giữ nguyên', () => {
    expect(foldVi('Hoà')).toBe('hoa');
    expect(foldVi('ớ')).toBe('o');
    expect(foldVi('a\u{1F600}b')).toBe('a\u{1F600}b');
  });
  it('chặn kích thước trước khi xử lý', () => {
    expect(() => foldVi('a'.repeat(FOLD_MAX_CHARS + 1))).toThrow(RangeError);
  });
});
