// Cổng nhận diện KHAI BÁO: 55 hàm `identity.*.test` của spike đã thành dữ liệu (Check) + MỘT bộ đánh giá chung.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SvgView } from '../src/index.ts';
import {
  type Check,
  cast,
  colorIs,
  evaluate,
  evaluateIdentity,
  register,
  registerAll,
  svg,
  unregister,
  viewOfString,
} from '../src/index.ts';
import { CODES, clone, rawSpec, rawSpecs, SLUGS } from './support/pack.ts';

beforeAll(() => {
  registerAll(rawSpecs());
});
afterAll(() => {
  for (const c of cast()) unregister(c.id);
});

const viewOf = (id: string, state = 'normal', size = 160) => viewOfString(svg(id, state, { size, fixedPhase: true }));

describe('10 nhân vật qua cùng một bộ đánh giá', () => {
  it.each([...CODES])('%s: mọi must + extra đạt', (id) => {
    const r = evaluateIdentity(id, viewOf(id));
    const failed = [...r.must, ...r.extra].filter((x) => !x.ok).map((x) => x.label);
    expect(failed).toEqual([]);
    expect(r.pass).toBe(true);
    expect(r.must.length).toBeGreaterThanOrEqual(2);
    expect(r.must.length).toBeLessThanOrEqual(3);
  });

  it('tổng cộng 55 phép kiểm (30 must + 25 extra), mọi phép là khai báo thuần JSON', () => {
    const specs = rawSpecs();
    expect(specs.reduce((n, s) => n + s.identity.must.length, 0)).toBe(30);
    expect(specs.reduce((n, s) => n + s.identity.extra.length, 0)).toBe(25);
    for (const s of specs) expect(JSON.parse(JSON.stringify(s.identity))).toEqual(s.identity);
  });

  it('p1 của mỗi nhân vật là phần tử có thật trong SVG (kích thước ≥ 3 px ở 32 px: test trình duyệt)', () => {
    for (const id of CODES) {
      const p1 = rawSpec(id).identity.p1;
      expect(viewOf(id, 'normal', 32).part(p1), `${id}: ${p1}`).not.toBeNull();
    }
  });

  it('không có closure riêng từng tướng: mã / id ngắn của nhân vật không xuất hiện trong mã nguồn engine', () => {
    const dir = join(import.meta.dirname, '..', 'src');
    const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) {
      const src = readFileSync(join(dir, f), 'utf8');
      for (const w of [...CODES, ...SLUGS]) {
        expect(new RegExp(`['"\`/]${w}['"\`/]`).test(src), `${f} nhắc "${w}"`).toBe(false);
      }
    }
  });
});

describe('ngữ nghĩa của bộ đánh giá', () => {
  const view = (parts: Record<string, Record<string, string>>): SvgView => ({
    part: (n) => (parts[n] ? { attr: (k) => parts[n]?.[k] ?? null } : null),
  });
  const ctx = (v: SvgView) => ({ id: 'tq046', P: {} as never, view: v });

  it('part / attr', () => {
    const v = view({ a: { locks: '3' }, b: {} });
    expect(evaluate({ part: 'a' }, ctx(v))).toBe(true);
    expect(evaluate({ part: 'a', attr: { locks: '3' } }, ctx(v))).toBe(true);
    expect(evaluate({ part: 'a', attr: { locks: '1' } }, ctx(v))).toBe(false);
    expect(evaluate({ part: 'zzz' }, ctx(v))).toBe(false);
  });

  it('màu: thiếu phần tử / thiếu thuộc tính / không phải #RRGGBB ⇒ false (không đoán), kể cả nhóm "dark"', () => {
    const v = view({ face: { fill: '#CF4A3E' }, bad: { fill: 'red' }, none: {} });
    expect(evaluate({ fill: 'face', is: 'red' }, ctx(v))).toBe(true);
    expect(evaluate({ fill: 'face', is: 'white' }, ctx(v))).toBe(false);
    expect(evaluate({ fill: 'missing', is: 'dark' }, ctx(v))).toBe(false);
    expect(evaluate({ fill: 'none', is: 'dark' }, ctx(v))).toBe(false);
    expect(evaluate({ fill: 'bad', is: 'red' }, ctx(v))).toBe(false);
  });

  it('all / any / not', () => {
    const v = view({ a: {}, b: {} });
    const t: Check = { part: 'a' };
    const f: Check = { part: 'q' };
    expect(evaluate({ all: [t, t] }, ctx(v))).toBe(true);
    expect(evaluate({ all: [t, f] }, ctx(v))).toBe(false);
    expect(evaluate({ any: [f, t] }, ctx(v))).toBe(true);
    expect(evaluate({ any: [f, f] }, ctx(v))).toBe(false);
    expect(evaluate({ not: f }, ctx(v))).toBe(true);
    expect(evaluate({ not: { not: f } }, ctx(v))).toBe(false);
  });

  it('nhóm màu: mốc biên', () => {
    expect(colorIs('#FFFFFF', 'white')).toBe(true);
    expect(colorIs('#E1E1E1', 'white')).toBe(false); // 225 chưa > 225
    expect(colorIs('#E2E2E2', 'white')).toBe(true);
    expect(colorIs('#000000', 'dark')).toBe(true);
    expect(colorIs('#7F3F3F', 'dark')).toBe(false); // 127+63+63 = 253 ≥ 190
    expect(colorIs('#2F8052', 'green')).toBe(true);
    expect(colorIs('#00BFFF', 'gHigh')).toBe(true);
    expect(colorIs('#00BEFF', 'gHigh')).toBe(false); // G = 190 chưa > 190
    expect(colorIs(null, 'red')).toBe(false);
    expect(colorIs('#GGGGGG', 'red')).toBe(false);
  });

  it('noEmote đọc thư viện emote của engine: từ khoá có thật trong thư viện ⇒ false; từ khoá không có ⇒ true', () => {
    expect(evaluate({ noEmote: ['blood', 'skull'] }, ctx(view({})))).toBe(true);
    expect(evaluate({ noEmote: ['sweat'] }, ctx(view({})))).toBe(false);
    expect(evaluate({ noEmote: ['SWEAT'.toLowerCase()] }, ctx(view({})))).toBe(false);
  });
});

describe('phép kiểm bắt được lỗi thật (đột biến tham số)', () => {
  const mutated = (id: string, mutate: (s: Record<string, unknown>) => void, newId: string) => {
    const s = clone(rawSpec(id)) as unknown as Record<string, unknown>;
    s.id = newId;
    mutate(s);
    register(s);
    return evaluateIdentity(newId, viewOf(newId));
  };
  const failing = (r: ReturnType<typeof evaluateIdentity>) =>
    [...r.must, ...r.extra].filter((x) => !x.ok).map((x) => x.label);

  it('Quan Vũ đổi mặt đỏ → xanh: must 1 rớt', () => {
    const r = mutated('tq044', (s) => ((s.p as Record<string, unknown>).skin = '#2F8052'), 'zz001');
    expect(r.pass).toBe(false);
    expect(failing(r).join('|')).toMatch(/Mặt đỏ/);
    unregister('zz001');
  });
  it('Quan Vũ bỏ râu dài: must 2 rớt', () => {
    const r = mutated('tq044', (s) => ((s.p as Record<string, unknown>).beard = 'none'), 'zz001');
    expect(failing(r).join('|')).toMatch(/Râu dài ba chòm/);
    unregister('zz001');
  });
  it('Râu dài kiểu hai chòm không thay được ba chòm (attr locks)', () => {
    const r = mutated('tq044', (s) => ((s.p as Record<string, unknown>).beard = 'long2'), 'zz001');
    expect(failing(r).join('|')).toMatch(/Râu dài ba chòm/);
    unregister('zz001');
  });
  it('Tôn Thượng Hương đổi băng trán sang đỏ (sẽ nhầm Tôn Sách): must 2 rớt', () => {
    const r = mutated('tq141', (s) => ((s.p as Record<string, unknown>).capAccent = '#C8363B'), 'zz001');
    expect(failing(r).join('|')).toMatch(/băng trán lam\/trắng/);
    unregister('zz001');
  });
  it('Triệu Vân bỏ em bé: must 1 rớt', () => {
    const r = mutated('tq047', (s) => ((s.p as Record<string, unknown>).front = 'none'), 'zz001');
    expect(failing(r).join('|')).toMatch(/em bé/);
    unregister('zz001');
  });
  it('Lính quèn mặc áo màu đỏ: ràng buộc "giáp xám" rớt', () => {
    const r = mutated('tqx001', (s) => ((s.p as Record<string, unknown>).robe = '#C8363B'), 'zz001');
    expect(failing(r).join('|')).toMatch(/Giáp xám/);
    unregister('zz001');
  });
  it('Điêu Thuyền đổi cổ áo kín → cổ chữ V: extra "không gợi cảm hoá" rớt', () => {
    const r = mutated('tq010', (s) => ((s.p as Record<string, unknown>).collar = 'v'), 'zz001');
    expect(failing(r).join('|')).toMatch(/Không gợi cảm hoá/);
    unregister('zz001');
  });
});
