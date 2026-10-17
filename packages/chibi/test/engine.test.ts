// Khung xương chung: 16 trạng thái × 10 nhân vật, token / slot / keyframes, quy tắc chuyển động, nhãn từ i18n (không cứng trong engine).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AVATAR_STATES } from '@ga/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildCss } from '../src/css.ts';
import { EMOTES, EMSZ } from '../src/emotes.ts';
import { Chibi, cast, IDLE_VARIANTS, registerAll, resolve, stateI18nKeys, unregister } from '../src/index.ts';
import { ST } from '../src/states.ts';
import { svg } from '../src/testing.ts';
import { TOK } from '../src/tokens.ts';
import { TRAITS } from '../src/traits.ts';
import labels from './fixtures/avatar-states.vi.json' with { type: 'json' };
import { blocks, keyframes, outsideNoPreference, stripComments } from './support/css.ts';
import { CODES, rawSpecs } from './support/pack.ts';

beforeAll(() => {
  registerAll(rawSpecs());
});
afterAll(() => {
  for (const c of cast()) unregister(c.id);
});

const CSS = buildCss();
const KF = keyframes(CSS);
/** keyframes có thật; họ keyframes của tay được sinh thành `-L` / `-R` (arm-anim.ts) */
const kfBody = (n: string): string | undefined => KF[`chb-${n}`] ?? KF[`chb-${n}-L`] ?? KF[`chb-${n}-R`];
const variantsOf = (s: string) => (s === 'idle' ? [...IDLE_VARIANTS] : [null]);
const SIZES = [160, 64, 32] as const;

describe('16 trạng thái (khoá từ contracts, nhãn từ i18n)', () => {
  it('đúng 16 khoá, đúng thứ tự ưu tiên của view DB v_role_avatar_state', () => {
    expect([...Chibi.states]).toEqual([...AVATAR_STATES]);
    expect(Chibi.states).toHaveLength(16);
    expect(Object.keys(ST).sort()).toEqual([...AVATAR_STATES].sort());
  });

  it('engine không chứa nhãn / mô tả: mục trạng thái chỉ có dữ liệu chuyển động', () => {
    for (const [k, s] of Object.entries(ST)) {
      expect(Object.keys(s), k).not.toContain('label');
      expect(Object.keys(s), k).not.toContain('ev');
    }
  });

  it('mã nguồn engine không chép nhãn / mô tả của spike (lệch PS, mô tả failover ngược INT-05)', () => {
    const dir = join(import.meta.dirname, '..', 'src');
    const banned = [
      'Lao động hăng say',
      'Được thưởng',
      'Bị trừ ₲',
      'Chuyển CLI',
      'Kinh ngạc phát hiện',
      'Ngủ / ngoài giờ',
      'Rảnh (lười)',
      'tài khoản / CLI khác',
      'ĐỀ XUẤT',
    ];
    for (const f of readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((x) => x.endsWith('.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      for (const b of banned) expect(src.includes(b), `${f}: "${b}"`).toBe(false);
    }
    expect(CSS).not.toMatch(/[ÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬàáảãạăằắẳẵặâầấẩẫậĐđÊỀẾỂỄỆêềếểễệÔỒỐỔỖỘôồốổỗộƠỜỚỞỠỢơờớởỡợƯỪỨỬỮỰưừứửữự]/u);
  });

  it('khoá i18n: mỗi trạng thái có tên + mô tả trong bản vi (fixture chép PS §4.7); mô tả Đổi CLI nói "loại CLI", không nói "tài khoản" (INT-05)', () => {
    const dict = labels as Record<string, string>;
    for (const s of AVATAR_STATES) {
      const k = stateI18nKeys(s);
      expect(dict[k.name], k.name).toBeTruthy();
      expect(dict[k.when], k.when).toBeTruthy();
    }
    expect(dict['avatar.state.failover.name']).toBe('Đổi CLI');
    expect(dict['avatar.state.failover.when']).toMatch(/loại CLI/);
    expect(dict['avatar.state.failover.when']).not.toMatch(/tài khoản/i);
    // 16 tên hiển thị khác nhau và đúng thứ tự bảng PS §4.7
    expect(AVATAR_STATES.map((s) => dict[`avatar.state.${s}.name`])).toEqual([
      'Lỗi',
      'Đổi CLI',
      'Bị phạt',
      'Hết quota',
      'Nghỉ dưỡng thương',
      'Chờ duyệt',
      'Kinh ngạc',
      'Lên #1',
      'Nhận thưởng',
      'Hứa quyết tâm',
      'Nói không chắc',
      'Suy tư',
      'Đang làm',
      'Rảnh',
      'Ngủ',
      'Bình thường',
    ]);
  });
});

describe('khung xương: token / slot / keyframes', () => {
  it('token trong ST và TRAITS đều có thật; keyframes của token có thật trong CSS; không trùng slot', () => {
    for (const [s, def] of Object.entries(ST)) {
      for (const t of [...(def.m ?? []), ...Object.values(def.variants ?? {}).flatMap((v) => v.m)])
        expect(TOK, `${s}:${t}`).toHaveProperty(t);
      for (const k of def.pose) expect(kfBody(k), `${s} pose ${k}`).toBeTruthy();
    }
    for (const tr of TRAITS) {
      for (const [s, o] of Object.entries(tr.over)) {
        for (const t of [...(o.m ?? []), ...(o.drop ?? [])]) expect(TOK, `${tr.id}/${s}:${t}`).toHaveProperty(t);
      }
    }
    for (const [name, t] of Object.entries(TOK)) for (const k of t.kf) expect(kfBody(k), `${name}: ${k}`).toBeTruthy();
  });

  it.each([...CODES])('%s: 16 trạng thái × (3 biến thể idle) × 3 cỡ dựng không lỗi, SVG tự chứa', (id) => {
    for (const s of AVATAR_STATES) {
      for (const v of variantsOf(s)) {
        for (const size of SIZES) {
          const out = svg(id, s, { size, fixedPhase: true, variant: v ?? undefined });
          expect(out.startsWith('<svg')).toBe(true);
          expect(out).not.toMatch(/<image|<script|href="http|url\(http|javascript:/i);
          expect(out).toContain(`data-chb-s="${s}"`);
        }
        const r = resolve(id, s, v);
        expect(JSON.parse(JSON.stringify(r))).toEqual(r);
        const slots = r.m.flatMap((t) => TOK[t].slots);
        expect(new Set(slots).size, `${id}/${s}: trùng slot`).toBe(slots.length);
        for (const k of r.pose) expect(kfBody(k), `${id}/${s} thiếu keyframes ${k}`).toBeTruthy();
      }
    }
  });

  it.each([...CODES])(
    '%s (bảng B spike): mỗi trạng thái có emote + pose đổi + huy hiệu; ≥ 4 trạng thái có hành vi riêng theo bộ phận',
    (id) => {
      const moved = (n: string) => /transform|rotate|scale|opacity/.test(kfBody(n) ?? '');
      let own = 0;
      for (const s of AVATAR_STATES) {
        for (const v of variantsOf(s)) {
          const r = resolve(id, s, v);
          expect(r.emotes.length + (r.hero ? 1 : 0), `${id}/${s}: không emote`).toBeGreaterThanOrEqual(1);
          expect(r.pose.filter(moved).length, `${id}/${s}: không có pose đổi`).toBeGreaterThanOrEqual(1);
          if (s !== 'normal') expect(r.hero, `${id}/${s}: thiếu huy hiệu`).toBeTruthy();
        }
        if (resolve(id, s, variantsOf(s)[0]).own) own++;
      }
      expect(own, id).toBeGreaterThanOrEqual(4);
    },
  );

  it('mọi eyes / mouth / emote trong bảng pha có lớp SVG + luật CSS (bắt lỗi quên đăng ký lớp mặt)', () => {
    const missing: string[] = [];
    for (const id of CODES) {
      for (const s of AVATAR_STATES) {
        for (const v of variantsOf(s)) {
          const r = resolve(id, s, v);
          const el = svg(id, s, { size: 160, variant: v ?? undefined, fixedPhase: true });
          for (const q of [...r.ph.map((x) => x[1]), r.peak]) {
            if (
              q.eyes !== 'n' &&
              (!el.includes(`class="chb-ey chb-e-${q.eyes}"`) || !CSS.includes(`[data-chb-eyes="${q.eyes}"]`))
            )
              missing.push(`${id}/${s} eyes=${q.eyes}`);
            if (
              q.mouth !== 'n' &&
              (!el.includes(`class="chb-mo chb-m-${q.mouth}"`) || !CSS.includes(`[data-chb-mouth="${q.mouth}"]`))
            )
              missing.push(`${id}/${s} mouth=${q.mouth}`);
            for (const e of q.em.split(' ').filter(Boolean)) {
              const has = e === 'snot' ? el.includes('chb-snot') : el.includes(`chb-em-${e}`);
              if (!has || !CSS.includes(`[data-chb-em~="${e}"]`)) missing.push(`${id}/${s} em=${e}`);
            }
          }
        }
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });
});

describe('biểu cảm khoa trương (bảng C spike): mỗi tướng đều có emote + pose đúng loại', () => {
  const em = (id: string, s: string, v?: string) => new Set(resolve(id, s as never, v).emotes);
  const any = (id: string, s: string, pred: (q: { eyes: string; mouth: string; brow: string }) => boolean) =>
    resolve(id, s as never).ph.some(([, q]) => pred(q));
  const rows: [string, (id: string) => boolean][] = [
    [
      'tham tiền (reward)',
      (id) =>
        ['gold', 'coinRain', 'bag'].some((t) => em(id, 'reward').has(t)) &&
        any(id, 'reward', (q) => q.eyes === 'coin') &&
        any(id, 'reward', (q) => q.mouth === 'drool'),
    ],
    [
      'van xin (wait) khác cầu lương (quota)',
      (id) => {
        const w = resolve(id, 'wait'),
          q = resolve(id, 'quota');
        return (
          any(id, 'wait', (p) => p.eyes === 'dog' && p.mouth === 'grovel') &&
          em(id, 'quota').has('bowl') &&
          q.m.every((t) => !w.m.includes(t)) &&
          any(id, 'quota', (p) => p.mouth === 'wavy') &&
          !em(id, 'wait').has('bowl')
        );
      },
    ],
    [
      'khóc thác (penalty)',
      (id) =>
        any(id, 'penalty', (q) => q.eyes === 'sob') &&
        any(id, 'penalty', (q) => q.mouth === 'wail') &&
        em(id, 'penalty').has('snotCry') &&
        svg(id, 'penalty', { size: 160 }).includes('chb-jet'),
    ],
    [
      'cười đê tiện (rank1)',
      (id) =>
        any(id, 'rank1', (q) => q.eyes === 'smug') &&
        ['coverMouthL', 'coverMouthF', 'coverFaceR', 'beardStrokeLoop'].some((t) =>
          (resolve(id, 'rank1').m as string[]).includes(t),
        ) &&
        em(id, 'rank1').has('hehe'),
    ],
    [
      'giận khoa trương (error)',
      (id) =>
        ['smoke', 'vein', 'bristle'].every((t) => em(id, 'error').has(t)) && resolve(id, 'error').m.includes('stomp'),
    ],
    [
      'hoảng chạy vòng (failover)',
      (id) =>
        resolve(id, 'failover').m.includes('circleRun') &&
        (em(id, 'failover').has('cliA') || em(id, 'failover').has('cliB')),
    ],
    [
      'quyết tâm (commit)',
      (id) =>
        any(id, 'commit', (q) => q.eyes === 'fire') &&
        ['rays', 'band', 'resolve'].every((t) => em(id, 'commit').has(t)),
    ],
    [
      'ông cụ non (think)',
      (id) =>
        ['glasses', 'dots'].every((t) => em(id, 'think').has(t)) &&
        any(id, 'think', (q) => q.brow === 'knit') &&
        (['chinStroke', 'beardStrokeLoop'] as const).some((t) => (resolve(id, 'think').m as string[]).includes(t)),
    ],
    [
      'không chắc (unsure)',
      (id) =>
        any(id, 'unsure', (q) => q.mouth === 'wry') &&
        ['qwob', 'sweatL'].every((t) => em(id, 'unsure').has(t)) &&
        resolve(id, 'unsure').m.includes('unsureArms'),
    ],
    [
      'rảnh (idle) đủ 3 biến thể',
      (id) => {
        const n = resolve(id, 'idle', 'nap'),
          d = resolve(id, 'idle', 'drunk'),
          g = resolve(id, 'idle', 'game');
        return (
          em(id, 'idle', 'nap').has('zzz') &&
          em(id, 'idle', 'nap').has('snot') &&
          d.hold === 'gourd' &&
          em(id, 'idle', 'drunk').has('hic') &&
          g.hold === 'pad' &&
          new Set([n.m.join(), d.m.join(), g.m.join()]).size === 3
        );
      },
    ],
    [
      'phát hiện (discover)',
      (id) =>
        any(id, 'discover', (q) => q.eyes === 'spring') &&
        any(id, 'discover', (q) => q.mouth === 'agape') &&
        ['rays', 'bang3', 'scope'].every((t) => em(id, 'discover').has(t)) &&
        resolve(id, 'discover').m.includes('capFly'),
    ],
  ];
  it.each(rows)('%s', (_name, fn) => {
    for (const id of CODES) expect(fn(id), id).toBe(true);
  });
});

describe('chuyển động: quy tắc cấu trúc của CSS', () => {
  it('reduced-motion = 0 animation theo cấu trúc: khối reduce tắt mọi animation dưới .chb bằng !important, và không có animation nào khác dùng !important', () => {
    const css = stripComments(CSS);
    const reduce = blocks(css).find((b) => b.head.startsWith('@media (prefers-reduced-motion: reduce)'));
    expect(reduce?.body).toMatch(
      /\.chb \*,\.chb \*::before\{\s*animation:none !important;\s*transition:none !important\s*\}/,
    );
    // không luật nào có thể thắng khối reduce: mọi `animation: … !important` đều là `none`
    const important = [...css.matchAll(/animation\s*:\s*([^;}]*?)\s*!important/g)].map((m) => m[1]);
    expect(important.length).toBeGreaterThan(0);
    expect(important.every((v) => v === 'none')).toBe(true);
    // mọi keyframes đều được tham chiếu từ luật dưới @media (no-preference) hoặc CSS nền, không có animation chạy "ngoài" hệ thống chib
    expect(css).not.toMatch(/animation-name/);
    // khối no-preference vẫn có animation (không "tắt nhầm" cả hệ thống)
    expect(
      blocks(css).some(
        (b) => b.head.startsWith('@media (prefers-reduced-motion: no-preference)') && /animation:/.test(b.body),
      ),
    ).toBe(true);
    // phần ngoài no-preference chỉ có 2 animation nền (chớp mắt, thở) — cả hai bị khối reduce đè
    const outside = outsideNoPreference(CSS);
    const names = [...outside.matchAll(/animation\s*:\s*(chb-k-[\w-]+)/g)].map((m) => m[1]);
    expect(new Set(names)).toEqual(new Set(['chb-k-blink', 'chb-k-breathe']));
  });

  it('ui.avatar_motion: full không có thuộc tính; subtle / off gắn data-chb-mo + khung đỉnh không emote; CSS tĩnh chỉ tắt animation, không bật thêm', () => {
    const full = svg('tq044', 'penalty', { size: 160, fixedPhase: true });
    const subtle = svg('tq044', 'penalty', { size: 160, fixedPhase: true, motion: 'subtle' });
    const off = svg('tq044', 'penalty', { size: 160, fixedPhase: true, motion: 'off' });
    expect(full).not.toContain('data-chb-mo="');
    expect(subtle).toContain('data-chb-mo="s"');
    expect(off).toContain('data-chb-mo="o"');
    expect(full).toContain('data-chb-em="excl"'); // pha đầu của penalty có emote
    for (const o of [subtle, off]) expect(o).toContain('data-chb-em=""');
    for (const o of [subtle, off]) expect(o).toContain('data-chb-eyes="sob"'); // khung đỉnh
    const css = stripComments(CSS);
    const stat = blocks(css).filter((b) => b.head.includes('[data-chb-mo'));
    expect(stat.length).toBeGreaterThan(30); // cùng bộ pose tĩnh với reduced-motion
    for (const b of stat) expect(b.body).not.toMatch(/animation\s*:\s*(?!none)/);
    expect(css).toMatch(/\.chb\[data-chb-mo="s"\] \*:not\(\.chb-breath\):not\(\.chb-e-n\)\{ animation:none !important/);
  });

  it('keyframes chỉ animate transform / opacity / rotate / scale / stroke-dashoffset; không animate biến tuỳ ý (không còn @property)', () => {
    const allowed = new Set(['transform', 'opacity', 'stroke-dashoffset', 'rotate', 'scale']);
    const bad = new Set<string>();
    for (const [name, body] of Object.entries(KF)) {
      for (const m of body.matchAll(/([\w-]+)\s*:/g)) {
        const p = m[1] as string;
        if (!allowed.has(p)) bad.add(`${name}:${p}`);
      }
    }
    expect([...bad]).toEqual([]);
    expect(CSS).not.toMatch(/@property/);
  });

  it('cách ly: mọi class / keyframes / biến CSS có tiền tố chb-', () => {
    const noStrings = stripComments(CSS).replace(/"[^"]*"/g, '""');
    const badCls = (noStrings.match(/\.([a-zA-Z][\w-]*)/g) ?? [])
      .map((x) => x.slice(1))
      .filter((x) => !/^chb(-|$)/.test(x) && !/^\d/.test(x));
    expect(new Set(badCls)).toEqual(new Set());
    expect(Object.keys(KF).every((n) => n.startsWith('chb-k-'))).toBe(true);
    expect((CSS.match(/--[a-zA-Z][\w-]*/g) ?? []).every((v) => v.startsWith('--chb-'))).toBe(true);
  });

  it('thư viện emote không có hình máu / chết chóc (STD-09 §2)', () => {
    expect(EMOTES.some((e) => /knife|blood|saw|skull|arrow|dead/i.test(e))).toBe(false);
    for (const e of EMOTES) expect(EMSZ[e], e).toBeGreaterThan(0);
  });

  it('idle: biến thể do người gọi chọn được tôn trọng; không truyền thì tự xoay vòng', () => {
    for (const v of IDLE_VARIANTS) expect(svg('tq080', 'idle', { variant: v })).toContain(`data-chb-v="${v}"`);
    expect(svg('tq080', 'idle')).toContain('data-chb-auto="1"');
    expect(svg('tq080', 'idle', { variant: 'nap' })).not.toContain('data-chb-auto');
  });

  it('hồ lô / máy game là vật CẦM THẬT (không còn là emote trôi nổi): chỉ dựng ở cỡ lớn, đúng biến thể idle', () => {
    expect(EMOTES as readonly string[]).not.toContain('gourd');
    expect(EMOTES as readonly string[]).not.toContain('pad');
    const drunk = svg('tq046', 'idle', { variant: 'drunk', size: 160, fixedPhase: true });
    const game = svg('tq046', 'idle', { variant: 'game', size: 160, fixedPhase: true });
    const nap = svg('tq046', 'idle', { variant: 'nap', size: 160, fixedPhase: true });
    expect(drunk).toMatch(/class="chb-hx"><g transform="translate\(0 12\)"><g class="chb-gd"/);
    expect(game).toMatch(/class="chb-gpad"><g transform="translate\(100 166\)"><g class="chb-padb"/);
    expect(drunk).not.toContain('chb-padb');
    expect(game).not.toContain('chb-gd');
    expect(nap).not.toMatch(/chb-gd|chb-padb/);
    expect(svg('tq046', 'idle', { variant: 'drunk', size: 64 })).not.toMatch(/chb-gd|chb-hx/);
    expect(svg('tq046', 'normal', { size: 160 })).toMatch(/class="chb-hx"><\/g>/);
    for (const id of CODES) {
      expect(resolve(id, 'idle', 'drunk').hold).toBe('gourd');
      expect(resolve(id, 'idle', 'game').hold).toBe('pad');
      expect(resolve(id, 'idle', 'nap').hold).toBeNull();
      expect(resolve(id, 'normal').hold).toBeNull();
    }
    // hai bàn tay luôn có điểm đặt trên máy game (biến góc + tỉ lệ tay)
    expect(game).toMatch(/--chb-gripL:-?[\d.]+deg;/);
    expect(game).toMatch(/--chb-gripKR:[\d.]+/);
  });

  it('cỡ nhỏ / vừa chỉ giữ thân + đầu + một huy hiệu (ít phần tử hơn cỡ lớn)', () => {
    const n = (s: string) => (s.match(/</g) ?? []).length;
    const big = svg('tq044', 'reward', { size: 160, fixedPhase: true });
    const mid = svg('tq044', 'reward', { size: 64, fixedPhase: true });
    expect(n(mid)).toBeLessThan(n(big) * 0.75);
    expect(mid).toContain('class="chb-hero"');
  });
});
