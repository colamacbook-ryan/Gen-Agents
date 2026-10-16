// Schema ChibiParamsV1: nhân vật = bộ tham số JSON. Mỗi lối vào của dữ liệu ngoài (params_json) có ca âm.
import { afterEach, describe, expect, it } from 'vitest';
import {
  Chibi,
  ChibiParamsV1,
  ChibiSpecError,
  cast,
  hasChar,
  MAX_SPEC_BYTES,
  parse,
  register,
  registerAll,
  svg,
  toJsonSchema,
  unregister,
  validate,
} from '../src/index.ts';
import { CODES, clone, rawSpec, rawSpecs } from './support/pack.ts';

type Obj = Record<string, unknown>;
const base = (): Obj => clone(rawSpec('tq046')) as unknown as Obj;
const errPaths = (spec: unknown): string[] => {
  const r = validate(spec);
  return r.ok ? [] : r.errors.map((e) => e.path);
};
const setIn = (o: Obj, path: string, v: unknown): Obj => {
  const keys = path.split('.');
  let cur = o;
  for (const k of keys.slice(0, -1)) cur = cur[k] as Obj;
  cur[keys.at(-1) as string] = v;
  return o;
};

afterEach(() => {
  for (const c of cast()) unregister(c.id);
  unregister('zz001');
  unregister('zz002');
});

describe('10 nhân vật của gói tam-quoc-chibi', () => {
  it('đúng mã CSV, hợp lệ theo schema, $.id = mã, $.schema = 1 (ràng buộc CHECK của DB)', () => {
    expect(CODES).toHaveLength(10);
    for (const code of CODES) {
      const spec = rawSpec(code) as unknown as Obj;
      const r = validate(spec);
      expect(r.ok, `${code}: ${JSON.stringify(r.ok ? [] : r.errors)}`).toBe(true);
      expect(typeof spec.id).toBe('string');
      expect(spec.id).toBe(code);
      expect(Number.isInteger(spec.schema)).toBe(true);
      expect(spec.schema).toBe(1);
      expect(new TextEncoder().encode(JSON.stringify(spec)).length).toBeLessThan(MAX_SPEC_BYTES);
    }
  });

  it('đủ nam + nữ, đủ văn / võ / mưu / chủ công / lính', () => {
    const s = rawSpecs();
    expect(new Set(s.map((x) => x.gender))).toEqual(new Set(['nam', 'nu']));
    expect(new Set(s.map((x) => x.kind))).toEqual(new Set(['vo', 'van', 'muu', 'chu_cong', 'linh']));
  });

  it('không nhân vật nào có `over` riêng (STD-09 §4) — quét sâu mọi khoá', () => {
    const walk = (v: unknown, path: string): string[] =>
      v && typeof v === 'object'
        ? Object.entries(v).flatMap(([k, x]) => (k === 'over' ? [`${path}.${k}`] : walk(x, `${path}.${k}`)))
        : [];
    for (const code of CODES) expect(walk(rawSpec(code), code)).toEqual([]);
  });

  it('Chibi.schema là schema zod; JSON Schema xuất được, chặn khoá lạ', () => {
    expect(Chibi.schema).toBe(ChibiParamsV1);
    const js = toJsonSchema() as { properties?: Record<string, unknown>; additionalProperties?: unknown };
    expect(JSON.parse(JSON.stringify(js))).toEqual(js);
    expect(Object.keys(js.properties ?? {})).toEqual(expect.arrayContaining(['schema', 'id', 'p', 'identity']));
    expect(js.additionalProperties).toBe(false);
  });
});

describe('validate() — ca âm cho từng lối vào', () => {
  it('`over` riêng bị từ chối kèm lý do rõ ràng', () => {
    const spec = { ...base(), over: { normal: { m: ['stomp'] } } };
    const r = validate(spec);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const e = r.errors.find((x) => x.path === 'over');
      expect(e?.message).toMatch(/over.*TRAITS/s);
    }
  });

  it.each([
    ['khoá lạ ở gốc', (o: Obj) => setIn(o, 'script', '<script>'), 'script'],
    ['khoá lạ trong p', (o: Obj) => setIn(o, 'p.evil', 1), 'p.evil'],
    ['khoá lạ trong identity', (o: Obj) => setIn(o, 'identity.evil', 1), 'identity.evil'],
    [
      '__proto__ làm khoá',
      (o: Obj) => Object.defineProperty(o, '__proto__', { value: { x: 1 }, enumerable: true }),
      '__proto__',
    ],
    ['schema sai phiên bản', (o: Obj) => setIn(o, 'schema', 2), 'schema'],
    ['schema là chuỗi', (o: Obj) => setIn(o, 'schema', '1'), 'schema'],
    ['id viết hoa', (o: Obj) => setIn(o, 'id', 'TQ046'), 'id'],
    ['id có ../', (o: Obj) => setIn(o, 'id', '../etc'), 'id'],
    ['id quá dài', (o: Obj) => setIn(o, 'id', `a${'b'.repeat(40)}`), 'id'],
    ['tên rỗng', (o: Obj) => setIn(o, 'name', ''), 'name'],
    ['tên quá dài', (o: Obj) => setIn(o, 'name', 'x'.repeat(61)), 'name'],
    ['tên có ký tự điều khiển', (o: Obj) => setIn(o, 'name', 'a\u0000b'), 'name'],
    ['kind lạ', (o: Obj) => setIn(o, 'kind', 'boss'), 'kind'],
    ['gender lạ', (o: Obj) => setIn(o, 'gender', 'x'), 'gender'],
    ['crop thiếu phần tử', (o: Obj) => setIn(o, 'crop', [0, 0]), 'crop'],
    ['crop cạnh quá lớn', (o: Obj) => setIn(o, 'crop', [0, 0, 1e9]), 'crop[2]'],
    ['anim không có đơn vị giây', (o: Obj) => setIn(o, 'anim.blink', '3.4'), 'anim.blink'],
    ['anim chèn CSS', (o: Obj) => setIn(o, 'anim.blink', '3s;} body{display:none'), 'anim.blink'],
    ['anim số mũ', (o: Obj) => setIn(o, 'anim.phase', '1e9s'), 'anim.phase'],
    ['cover ngoài lưới', (o: Obj) => setIn(o, 'cover.target', [9999, 0]), 'cover.target[0]'],
    ['cape không có capeIn', (o: Obj) => setIn(o, 'p.cape', '#112233'), 'p'],
    [
      'must chỉ 1 mục',
      (o: Obj) => setIn(o, 'identity.must', (o.identity as Obj).must && [((o.identity as Obj).must as unknown[])[0]]),
      'identity.must',
    ],
    [
      'must 4 mục',
      (o: Obj) => setIn(o, 'identity.must', Array(4).fill(((o.identity as Obj).must as unknown[])[0])),
      'identity.must',
    ],
    [
      'nhãn nhận diện quá dài',
      (o: Obj) =>
        setIn(o, 'identity.must', [
          { p: 1, label: 'x'.repeat(241), check: { part: 'a' } },
          { p: 2, label: 'ok', check: { part: 'a' } },
        ]),
      'identity.must[0].label',
    ],
  ])('%s → bị từ chối', (_n, mutate, path) => {
    const o = mutate(base());
    const r = validate(o);
    expect(r.ok).toBe(false);
    expect(errPaths(o).some((p) => p === path || p.startsWith(`${path}.`) || p.startsWith(`${path}[`))).toBe(true);
  });

  const COLOR_FIELDS = [
    'p.skin',
    'p.robe',
    'p.trim',
    'p.capColor',
    'p.hair',
    'p.ribbon',
    'p.cape',
    'p.line',
    'p.flower',
    'own',
  ];
  const BAD_COLORS = [
    'red',
    '#FFF',
    '#GGGGGG',
    '#11223344',
    '',
    'url(#a)',
    'var(--x)',
    'rgb(1,2,3)',
    '#112233" onload="alert(1)',
    '#112233"/><script>',
  ];
  it.each(COLOR_FIELDS)('màu %s chỉ nhận #RRGGBB (chống chèn SVG / CSS)', (field) => {
    for (const bad of BAD_COLORS) {
      const o = setIn(base(), field, bad);
      if (field === 'p.cape') setIn(o, 'p.capeIn', '#112233');
      expect(validate(o).ok, `${field}=${bad}`).toBe(false);
    }
  });

  const ENUM_FIELDS: [string, string][] = [
    ['p.face', 'hexagon'],
    ['p.ears', 'pointy'],
    ['p.eyes', '<x>'],
    ['p.brow', 'unibrow'],
    ['p.mouth', 'fangs'],
    ['p.beard', 'goatee'],
    ['p.cap', 'crown'],
    ['p.prop', 'rocket'],
    ['p.front', 'baby2'],
    ['p.hem', 'torn'],
    ['p.collar', 'x'],
    ['p.stance', 'run'],
    ['p.mask', 'green'],
  ];
  it.each(ENUM_FIELDS)('%s chỉ nhận tên bộ phận có trong thư viện (%s bị từ chối)', (field, bad) => {
    expect(validate(setIn(base(), field, bad)).ok).toBe(false);
    expect(validate(setIn(base(), field, `${bad}" x="1`)).ok).toBe(false);
  });

  it.each([
    ['p.sleeve', 1e9],
    ['p.sleeve', -5],
    ['p.sleeve', Number.NaN],
    ['p.crownY', Number.POSITIVE_INFINITY],
    ['p.armL', [0, 0]],
    ['p.armL', [1e6, 1e6]],
    ['p.armR', [Number.NaN, 5]],
    ['p.armR', 'x'],
    ['p.sclera', 'yes'],
    ['p.tails', 1],
  ])('số / cờ %s = %j bị từ chối', (field, v) => {
    expect(validate(setIn(base(), field, v)).ok).toBe(false);
  });

  describe('cổng nhận diện khai báo (Check)', () => {
    const withCheck = (check: unknown) => setIn(base(), 'identity.extra', [{ label: 'x', check }]);
    it.each([
      ['hàm / chuỗi thay vì khai báo', 's => true'],
      ['khoá lạ', { fn: 'alert(1)' }],
      ['part sai định dạng', { part: 'a b' }],
      ['part chứa dấu nháy', { part: 'x"]' }],
      ['attr giá trị quá dài', { part: 'a', attr: { k: 'x'.repeat(41) } }],
      ['nhóm màu lạ', { fill: 'face', is: 'purple' }],
      ['all rỗng', { all: [] }],
      ['all quá nhiều', { all: Array(9).fill({ part: 'a' }) }],
      ['lồng quá sâu', { not: { not: { not: { not: { not: { part: 'a' } } } } } }],
      ['phase.where rỗng', { phase: { state: 'normal', where: {} } }],
      ['phase.state lạ', { phase: { state: 'zzz', where: { eyes: 'n' } } }],
      ['phase.where.emote lạ', { phase: { state: 'normal', where: { emote: 'nuke' } } }],
      ['token lạ', { token: { state: 'normal', has: 'rm -rf' } }],
      ['noEmote rỗng', { noEmote: [] }],
      ['noEmote có ký tự lạ', { noEmote: ['a.*'] }],
      ['param khoá lạ', { param: 'ink', is: 'x' }],
      ['param giá trị object', { param: 'eyes', is: { a: 1 } }],
    ])('%s → bị từ chối', (_n, check) => {
      expect(validate(withCheck(check)).ok).toBe(false);
    });

    it('lồng vừa đủ (độ sâu 4) vẫn được', () => {
      expect(validate(withCheck({ not: { not: { not: { not: { part: 'a' } } } } })).ok).toBe(true);
    });
  });
});

describe('parse() — giới hạn kích thước + JSON hỏng', () => {
  it('chặn chuỗi quá trần trước khi parse', () => {
    const r = parse(`{"a":"${'x'.repeat(MAX_SPEC_BYTES)}"}`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]?.message).toMatch(/trần/);
  });
  it('JSON hỏng → lỗi có thông điệp, không ném', () => {
    const r = parse('{"a":');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]?.message).toMatch(/JSON không hợp lệ/);
  });
  it('chuỗi hợp lệ → ok', () => {
    expect(parse(JSON.stringify(rawSpec('tq044'))).ok).toBe(true);
  });
});

describe('register() / registerAll()', () => {
  it('đăng ký đủ 10 nhân vật; cast() theo thứ tự đăng ký', () => {
    registerAll(rawSpecs());
    expect(cast().map((c) => c.id)).toEqual([...CODES]);
    expect(cast()[0]).toMatchObject({ id: 'tq046', name: 'Gia Cát Lượng', kind: 'muu', gender: 'nam' });
  });

  it('spec sai → ChibiSpecError mang danh sách lỗi theo đường dẫn; không đăng ký', () => {
    const bad = setIn(base(), 'p.robe', 'red');
    expect(() => register(bad)).toThrow(ChibiSpecError);
    try {
      register(bad);
    } catch (e) {
      expect((e as ChibiSpecError).issues.some((i) => i.path === 'p.robe')).toBe(true);
    }
    expect(hasChar('tq046')).toBe(false);
  });

  it('đăng ký lại đúng nội dung cũ là no-op; nội dung khác cùng id thì từ chối', () => {
    register(rawSpec('tq046'));
    expect(() => register(rawSpec('tq046'))).not.toThrow();
    const other = setIn(base(), 'p.robe', '#112233');
    expect(() => register(other)).toThrow(/khác/);
    expect(unregister('tq046')).toBe(true);
    expect(() => register(other)).not.toThrow();
  });

  it('registerAll là nguyên tử: một nhân vật sai thì không đăng ký cái nào; id trùng trong gói bị bắt', () => {
    const good = clone(rawSpec('tq044')) as unknown as Obj;
    const bad = setIn(base(), 'p.skin', 'nope');
    expect(() => registerAll([good, bad])).toThrow(ChibiSpecError);
    expect(hasChar('tq044')).toBe(false);
    expect(() => registerAll([good, good])).toThrow(/trùng/);
    expect(hasChar('tq044')).toBe(false);
  });

  it('id lạ không được âm thầm vẽ nhân vật khác', () => {
    expect(() => svg('khong-co', 'normal')).toThrow(/không có nhân vật/);
  });
});

describe('svg(): dữ liệu từ ngoài không chui vào markup', () => {
  it('roleColor chỉ nhận #RRGGBB', () => {
    register(rawSpec('tq046'));
    expect(() => svg('tq046', 'normal', { roleColor: 'red;} *{display:none' })).toThrow(/roleColor/);
    expect(() => svg('tq046', 'normal', { roleColor: '#E4785F' })).not.toThrow();
  });
  it('label và tên được thoát (không thoát được khỏi thuộc tính)', () => {
    register(rawSpec('tq046'));
    const out = svg('tq046', 'normal', { label: '"><script>alert(1)</script><x a="' });
    expect(out).not.toMatch(/<script/i);
    expect(out).toContain('aria-label="&quot;&gt;&lt;script&gt;');
    const named = setIn(base(), 'id', 'zz001');
    setIn(named, 'name', 'A"><img src=x onerror=alert(1)>');
    register(named);
    const o2 = svg('zz001', 'normal');
    expect(o2).not.toMatch(/<img/i);
    expect(o2).toContain('aria-label="A&quot;&gt;&lt;img');
  });
  it('size / crop hỏng không làm hỏng markup; trạng thái lạ thành normal', () => {
    register(rawSpec('tq046'));
    expect(svg('tq046', 'normal', { size: Number.NaN })).toContain('height="160"');
    expect(svg('tq046', 'normal', { size: 1e12 })).toContain('height="2048"');
    expect(() => svg('tq046', 'normal', { round: true, crop: [0, 0, Number.NaN] })).toThrow(/crop/);
    expect(svg('tq046', '<script>')).toContain('data-chb-s="normal"');
  });
});

describe('hiệu năng bộ kiểm với dữ liệu từ ngoài (STD-11: giới hạn kích thước + không bùng nổ)', () => {
  const timeMs = (fn: () => void): number => {
    const t0 = performance.now();
    fn();
    return performance.now() - t0;
  };

  it('trường hợp xấu nhất còn nằm dưới trần 32 KB (11 phép kiểm lồng sâu 3 tầng × 4 nhánh) kiểm xong < 500 ms', () => {
    const leaf = { part: 'prop-fan' };
    const wide = (d: number): unknown =>
      d === 0 ? leaf : { [d % 2 ? 'all' : 'any']: Array.from({ length: 4 }, () => wide(d - 1)) };
    const o = base();
    const id = o.identity as { must: { check: unknown }[]; extra: { label: string; check: unknown }[] };
    for (const m of id.must) m.check = wide(3);
    id.must.length = 3;
    id.extra = Array.from({ length: 8 }, (_, i) => ({ label: `x${i}`, check: wide(3) }));
    const text = JSON.stringify(o);
    const bytes = new TextEncoder().encode(text).length;
    expect(bytes).toBeLessThanOrEqual(MAX_SPEC_BYTES);
    expect(bytes).toBeGreaterThan(15_000);
    let ok = false;
    const ms = timeMs(() => {
      ok = parse(text).ok;
    });
    expect(ok).toBe(true);
    expect(ms).toBeLessThan(500);
  });

  it('chuỗi khổng lồ / mảng khổng lồ bị từ chối nhanh (không quét hết, không treo)', () => {
    const o = base();
    setIn(o, 'name', 'x'.repeat(5_000_000));
    const ms1 = timeMs(() => {
      expect(validate(o).ok).toBe(false);
    });
    const p = base();
    setIn(
      p,
      'identity.extra',
      Array.from({ length: 50_000 }, () => ({ label: 'x', check: { part: 'a' } })),
    );
    const ms2 = timeMs(() => {
      expect(validate(p).ok).toBe(false);
    });
    expect(ms1).toBeLessThan(500); // chặn "không treo" (quét 5 MB bằng regex mất hàng giây); 200 ms bị đỏ giả lúc máy vừa khởi động
    expect(ms2).toBeLessThan(2000);
    const ms3 = timeMs(() => {
      expect(parse(`{"a":"${'x'.repeat(10_000_000)}"}`).ok).toBe(false); // chặn theo kích thước trước khi parse
    });
    expect(ms3).toBeLessThan(300);
  });

  it('kiểm 10 nhân vật thật: trung bình < 5 ms mỗi nhân vật', () => {
    const specs = rawSpecs();
    const ms = timeMs(() => {
      for (let i = 0; i < 20; i++) for (const s of specs) validate(s);
    });
    expect(ms / (20 * specs.length)).toBeLessThan(5);
  });
});
