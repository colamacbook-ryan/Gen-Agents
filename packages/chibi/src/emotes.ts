// Thư viện biểu tượng (emote) + huy hiệu 32 px. Mỗi emote đăng ký tên + kích thước; lớp chỉ được dựng khi (nhân vật, trạng thái) dùng tới.
import { f, INK } from './color.ts';

export const HERO_NAMES = [
  'speed',
  'ques',
  'coinp',
  'coinm',
  'crown',
  'steam',
  'cli',
  'excl',
  'tear',
  'beg',
  'bowl',
  'anger',
  'fire',
  'think',
  'gourd',
  'pad',
  'wow',
  'zzz',
] as const;
export type HeroName = (typeof HERO_NAMES)[number];

/* ================= thư viện biểu tượng dùng chung (emote) ================= */
const GMARK = `<path d="M3.6 -3.2 A4.8 4.8 0 1 0 4.4 2 L4.4 0.2 L0.6 0.2" fill="none" stroke="#7A4B00" style="stroke-width:1.9px"/><path d="M-6.6 -0.4 H6.6" stroke="#7A4B00" fill="none" style="stroke-width:1.4px"/>`;
export const COIN = (r = 10): string =>
  `<circle r="${r}" fill="#F4C542"/><circle r="${f(r * 0.74)}" fill="none" stroke="#C98A14" style="stroke-width:1.3px"/><g transform="scale(${f(r / 10)})">${GMARK}</g>` +
  `<path d="M${f(-r * 0.6)} ${f(-r * 0.45)} Q${f(-r * 0.1)} ${f(-r * 0.95)} ${f(r * 0.55)} ${f(-r * 0.5)}" fill="none" stroke="#FFF4C2" style="stroke-width:1.4px"/>`;
const SPARK = (c = '#FFF2A8'): string =>
  `<path d="M0 -10 Q1.4 -1.4 10 0 Q1.4 1.4 0 10 Q-1.4 1.4 -10 0 Q-1.4 -1.4 0 -10Z" fill="${c}" style="stroke-width:1.3px"/>`;
const STAR = `<path d="M0 -9.5 L2.8 -3.2 L9.5 -2.8 L4.3 1.8 L6 8.6 L0 5 L-6 8.6 L-4.3 1.8 L-9.5 -2.8 L-2.8 -3.2Z" fill="#FFD84A" style="stroke-width:1.4px"/>`;
export const DROP = `<path d="M0 -13 C5.5 -5 9 0 9 4.5 A9 9 0 0 1 -9 4.5 C-9 0 -5.5 -5 0 -13Z" fill="#BFE9FF" style="stroke-width:1.6px"/><path d="M-4 3 Q-4 7 0 8" fill="none" stroke="#fff" style="stroke-width:1.8px"/>`;
const VQ = `<path d="M2 -2 C2 -7 6 -10 10 -10 C9 -6 7 -3 2 -2Z"/>`;
export const VEIN = `<g fill="#E5483F" style="stroke-width:1.3px">${VQ}<g transform="scale(-1 1)">${VQ}</g><g transform="scale(1 -1)">${VQ}</g><g transform="scale(-1 -1)">${VQ}</g></g>`;
const QM = (c: string): string =>
  `<path d="M-6 -8 C-6 -17 7 -17 7 -8 C7 -2 0 -3 0 4" fill="none" stroke="${INK}" style="stroke-width:8.6px"/><path d="M-6 -8 C-6 -17 7 -17 7 -8 C7 -2 0 -3 0 4" fill="none" stroke="${c}" style="stroke-width:5px"/>` +
  `<circle cx="0" cy="12" r="4.8" fill="${INK}" stroke="none"/><circle cx="0" cy="12" r="3" fill="${c}" stroke="none"/>`;
const EX = (c: string): string =>
  `<path d="M0 -14 V3" stroke="${INK}" style="stroke-width:10px"/><path d="M0 -14 V3" stroke="${c}" style="stroke-width:6px"/><circle cx="0" cy="11.5" r="5.4" fill="${INK}" stroke="none"/><circle cx="0" cy="11.5" r="3.4" fill="${c}" stroke="none"/>`;
const ZZ = `<path d="M-6 -6 H6 L-6 6 H6" fill="none" stroke="${INK}" style="stroke-width:6.8px"/><path d="M-6 -6 H6 L-6 6 H6" fill="none" stroke="#A89BFF" style="stroke-width:3.6px"/>`;
const CLOUD = `<path d="M-9 4 C-14 4 -14 -4 -8 -4 C-8 -11 4 -12 6 -5 C13 -6 15 4 8 4Z" fill="#FFFFFF" style="stroke-width:1.5px"/>`;
const BULB = `<g class="gl"><path d="M0 -15 V-21 M-12 -9 L-16 -13 M12 -9 L16 -13 M-15 1 H-21 M15 1 H21" fill="none" stroke="#F4B400" style="stroke-width:2.2px"/></g><circle r="9.5" fill="#FFE45E"/><path d="M-4 9 H4 V15 H-4Z" fill="#B8BEC8" style="stroke-width:1.4px"/><path d="M-3 3 L0 -3 L3 3" fill="none" stroke="#E08A00" style="stroke-width:1.4px"/><path d="M-6 -4 Q-5 -8 -1 -8" fill="none" stroke="#fff" style="stroke-width:1.6px"/>`;
export const CROWN =
  `<path d="M-26 0 L-26 -21 L-13 -9 L0 -27 L13 -9 L26 -21 L26 0Z" fill="#F4C542" style="stroke-width:2px"/><path d="M-26 -6 H26" fill="none" stroke="#C98A14" style="stroke-width:1.6px"/>` +
  `<circle cx="0" cy="-3" r="2.8" fill="#E5483F" style="stroke-width:1.2px"/><circle cx="-14" cy="-3" r="2.2" fill="#3FA9F5" style="stroke-width:1.1px"/><circle cx="14" cy="-3" r="2.2" fill="#3FA9F5" style="stroke-width:1.1px"/>` +
  `<circle cx="-26" cy="-21" r="2.4" fill="#fff" style="stroke-width:1.1px"/><circle cx="0" cy="-27" r="2.6" fill="#fff" style="stroke-width:1.1px"/><circle cx="26" cy="-21" r="2.4" fill="#fff" style="stroke-width:1.1px"/>`;
const CLI = (c1: string, c2: string): string =>
  `<rect x="-17" y="-12" width="34" height="24" rx="4.5" fill="${c1}" stroke="#E8E4DD" style="stroke-width:1.8px"/><path d="M-10 -4 L-3 1 L-10 6" fill="none" stroke="${c2}" style="stroke-width:2.6px"/><path d="M1 7 H10" fill="none" stroke="${c2}" style="stroke-width:2.6px"/>`;
const PLUS = (c: string): string =>
  `<path d="M-30 0 H-14 M-22 -8 V8" fill="none" stroke="${INK}" style="stroke-width:8.4px"/><path d="M-30 0 H-14 M-22 -8 V8" fill="none" stroke="${c}" style="stroke-width:4.4px"/>`;
const MINUS = (c: string): string =>
  `<path d="M-30 0 H-14" fill="none" stroke="${INK}" style="stroke-width:8.4px"/><path d="M-30 0 H-14" fill="none" stroke="${c}" style="stroke-width:4.4px"/>`;
const BOLT = `<path d="M8 -26 L-10 2 L2 2 L-8 28 L16 -6 L3 -6 L14 -26Z" fill="#FFE45E" style="stroke-width:2.2px" stroke-linejoin="miter"/><path d="M6 -22 L-5 -2 L4 -2" fill="none" stroke="#fff" style="stroke-width:1.8px"/>`;
const HEART = (c: string): string =>
  `<path d="M0 8 C-14 -2 -12 -14 -5 -14 C-2 -14 0 -11 0 -9 C0 -11 2 -14 5 -14 C12 -14 14 -2 0 8Z" fill="${c}" style="stroke-width:1.8px"/><path d="M-7 -9 Q-6 -12 -3 -12" fill="none" stroke="#fff" style="stroke-width:1.6px"/>`;
const GALL = `<path d="M0 -17 C13 -17 15 -2 10 9 C6 19 -6 19 -10 9 C-15 -2 -13 -17 0 -17Z" fill="#76CF58" style="stroke-width:2px"/><path d="M0 -17 L0 -24" fill="none" style="stroke-width:3px"/><path d="M-7 -8 Q-9 0 -6 7" fill="none" stroke="#C9F2B2" style="stroke-width:2.4px"/><path d="M2 -12 C8 -8 8 2 5 8" fill="none" stroke="#4FA63A" style="stroke-width:1.8px"/>`;
const TIGER = `<path d="M-14 -10 L-18 -22 L-6 -15Z M14 -10 L18 -22 L6 -15Z" fill="#F4A93A" style="stroke-width:1.8px"/><circle r="15" fill="#F4A93A" style="stroke-width:2px"/><path d="M-3 -14 L0 -9 L3 -14 M-13 -4 L-8 -3 M13 -4 L8 -3 M-14 4 L-9 3 M14 4 L9 3" fill="none" style="stroke-width:2.2px"/><circle cx="-6" cy="-1" r="2" fill="${INK}" stroke="none"/><circle cx="6" cy="-1" r="2" fill="${INK}" stroke="none"/><path d="M-4 5 Q0 9 4 5 L0 3Z" fill="#E5483F" style="stroke-width:1.4px"/><path d="M-6 9 Q0 14 6 9" fill="none" style="stroke-width:1.6px"/>`;
const CRANE = `<path d="M-18 8 C-8 -2 6 0 10 -6 C12 -10 10 -16 14 -20 L16 -14 C14 -10 18 -6 14 -2 C8 8 -6 14 -18 8Z" fill="#FFFFFF" style="stroke-width:2px"/><path d="M14 -20 L24 -22 L16 -16Z" fill="#F4A93A" style="stroke-width:1.5px"/><path d="M-12 6 C-22 0 -26 -6 -30 -10 C-20 -8 -14 -4 -8 0Z" fill="#2B2B33" style="stroke-width:1.5px"/><path d="M-2 12 L-2 24 M4 12 L6 24" fill="none" stroke="#F4A93A" style="stroke-width:2.2px"/><circle cx="14" cy="-16" r="1.4" fill="${INK}" stroke="none"/>`;
const PETAL = (c: string): string =>
  `<path d="M0 -7 C6 -7 7 0 0 8 C-7 0 -6 -7 0 -7Z" fill="${c}" style="stroke-width:1.2px"/>`;

export const EMSZ: Record<string, number> = {};
export const EMOMAP: Record<string, string> = {};
function E(name: string, x: number, y: number, inner: string, size: number): string {
  EMSZ[name] = size;
  const markup = `<g class="em em-${name}" transform="translate(${x} ${y})"><g class="in"><g class="bb">${inner}</g></g></g>`;
  EMOMAP[name] = markup;
  return markup;
}
const CONF = ['#F4C542', '#E5483F', '#3FA9F5', '#58C27D', '#B16CF0', '#FF8FB1'];
const TXT = (s: string, fs: number, extra = ''): string =>
  `<text ${extra} font-size="${fs}" font-weight="800" font-family="system-ui,Inter,sans-serif" fill="#fff" stroke="${INK}" stroke-linejoin="round" paint-order="stroke" style="stroke-width:3.6px" text-anchor="middle">${s}</text>`;
function EMO(): string {
  const o: string[] = [];
  o.push(E('sweat', 150, 40, `<g transform="scale(1.55)">${DROP}</g>`, 30));
  o.push(
    E(
      'fly',
      0,
      0,
      [
        [52, 40, -34, -8],
        [150, 30, 38, -12],
        [162, 70, 40, 8],
      ]
        .map(
          ([x, y, dx, dy], i) =>
            `<g transform="translate(${x} ${y})"><g class="fd" style="--dx:${dx}px;--dy:${dy}px;--dl:${f(-i * 0.27)}s"><g transform="scale(1.25)">${DROP}</g></g></g>`,
        )
        .join(''),
      28,
    ),
  );
  o.push(
    E(
      'pour',
      0,
      0,
      [
        [44, 50],
        [156, 50],
        [162, 86],
      ]
        .map(
          ([x, y], i) =>
            `<g transform="translate(${x} ${y})"><g class="pd" style="--dl:${f(-i * 0.31)}s"><g transform="scale(1.45)">${DROP}</g></g></g>`,
        )
        .join(''),
      30,
    ),
  );
  o.push(E('vein', 166, 14, `<g transform="scale(1.7)">${VEIN}</g>`, 32));
  o.push(
    E(
      'sparkR',
      0,
      0,
      [
        [34, 52, 1.3],
        [168, 44, 1.6],
        [24, 142, 1.1],
        [178, 126, 1.3],
      ]
        .map(
          ([x, y, s], i) =>
            `<g transform="translate(${x} ${y})"><g class="tw" style="--i:${i}"><g transform="scale(${s})">${SPARK()}</g></g></g>`,
        )
        .join(''),
      24,
    ),
  );
  o.push(
    E(
      'sparkB',
      0,
      0,
      [
        [84, 134, 1],
        [114, 158, 0.9],
        [92, 176, 0.8],
      ]
        .map(
          ([x, y, s], i) =>
            `<g transform="translate(${x} ${y})"><g class="tw" style="--i:${i}"><g transform="scale(${s})">${SPARK()}</g></g></g>`,
        )
        .join(''),
      18,
    ),
  );
  o.push(
    E(
      'sparkS',
      0,
      0,
      [
        [48, 58, 1.3],
        [160, 96, 0.9],
      ]
        .map(
          ([x, y, s], i) =>
            `<g transform="translate(${x} ${y})"><g class="tw" style="--i:${i}"><g transform="scale(${s})">${SPARK('#E6D4FF')}</g></g></g>`,
        )
        .join(''),
      20,
    ),
  );
  o.push(E('plus', 100, 2, `${PLUS('#2EC27E')}<g transform="translate(2 0)">${COIN(12)}</g>`, 44));
  o.push(E('minus', 100, -4, `${MINUS('#F0483E')}<g transform="translate(2 0)">${COIN(12)}</g>`, 44));
  o.push(
    E(
      'stars',
      100,
      30,
      [0, 1, 2]
        .map(
          (i) =>
            `<g class="ox" style="--i:${i}"><g class="oy" style="--i:${i}"><g transform="scale(1.1)">${STAR}</g></g></g>`,
        )
        .join(''),
      22,
    ),
  );
  o.push(E('ques', 100, -8, `<g transform="scale(1.6)">${QM('#FFD84A')}</g>`, 34));
  o.push(E('ques2', 152, 8, `<g transform="scale(1)">${QM('#FFB4C8')}</g>`, 22));
  o.push(E('excl', 100, -8, `<g transform="scale(1.6)">${EX('#FF5A4A')}</g>`, 34));
  o.push(
    E(
      'zzz',
      140,
      22,
      [0, 1, 2]
        .map((i) => `<g class="zz" style="--i:${i}"><g transform="scale(${f(1 + i * 0.38)})">${ZZ}</g></g>`)
        .join(''),
      22,
    ),
  );
  o.push(
    E(
      'steam',
      100,
      4,
      [-24, 0, 24]
        .map(
          (x, i) =>
            `<g transform="translate(${x} 0)"><g class="pf" style="--i:${i}"><g transform="scale(1.5)">${CLOUD}</g></g></g>`,
        )
        .join(''),
      30,
    ),
  );
  o.push(
    E(
      'steamEar',
      0,
      0,
      [
        [44, 66, -14],
        [156, 66, 14],
      ]
        .map(
          ([x, y, px], i) =>
            `<g transform="translate(${x} ${y})"><g class="pf" style="--i:${i};--px:${px}px"><g transform="scale(1.4)">${CLOUD}</g></g></g>`,
        )
        .join(''),
      28,
    ),
  );
  o.push(E('bulb', 152, 2, `<g transform="scale(1.2)">${BULB}</g>${TXT('Kế!', 17, 'x="-8" y="-30"')}`, 32));
  o.push(
    E(
      'speed',
      0,
      0,
      (
        [
          [4, 72, 40],
          [0, 98, 52],
          [8, 126, 34],
          [2, 154, 56],
          [6, 182, 38],
        ] as [number, number, number][]
      )
        .map(
          ([x, y, l], i) =>
            `<g class="ln" style="--i:${i}"><path d="M${x} ${y} H${x + l}" stroke="${INK}" fill="none" style="stroke-width:7px"/><path d="M${x} ${y} H${x + l}" stroke="#fff" fill="none" style="stroke-width:3.2px"/></g>`,
        )
        .join('') +
        [
          [52, 232, -14],
          [148, 232, 14],
        ]
          .map(
            ([x, y, px], i) =>
              `<g transform="translate(${x} ${y})"><g class="dp" style="--i:${i};--px:${px}px"><g transform="scale(1.1)">${CLOUD}</g></g></g>`,
          )
          .join(''),
      40,
    ),
  );
  let cf = '';
  for (let i = 0; i < 12; i++) {
    const x = 8 + ((i * 37) % 184),
      sx = ((i * 13) % 31) - 15,
      du = f(2.2 + (i % 5) * 0.3),
      dl = f(-((i * 0.37) % 2.4));
    cf += `<g transform="translate(${x} 0)"><g class="cf" style="--sx:${sx}px;--r:${(i % 2 ? 1 : -1) * (240 + i * 23)}deg;--du:${du}s;--dl:${dl}s"><rect x="-3" y="-4.5" width="6" height="9" rx="1" fill="${CONF[i % 6]}" style="stroke-width:1.2px"/></g></g>`;
  }
  o.push(E('confetti', 0, 0, cf, 24));
  let pt = '';
  for (let i = 0; i < 8; i++) {
    const x = 14 + ((i * 43) % 176),
      sx = ((i * 17) % 41) - 20,
      du = f(3.2 + (i % 4) * 0.5),
      dl = f(-((i * 0.53) % 3.4));
    pt += `<g transform="translate(${x} 0)"><g class="cf" style="--sx:${sx}px;--r:${(i % 2 ? 1 : -1) * (180 + i * 31)}deg;--du:${du}s;--dl:${dl}s"><g transform="scale(${f(0.9 + (i % 3) * 0.25)})">${PETAL(i % 2 ? '#F7A6C6' : '#FFD0E2')}</g></g></g>`;
  }
  o.push(E('petals', 0, 0, pt, 24));
  o.push(
    E(
      'hash1',
      150,
      16,
      `<circle r="14" fill="#F4C542" style="stroke-width:2px"/><text y="5.2" font-size="14.5" font-weight="900" font-family="system-ui,Inter,sans-serif" text-anchor="middle" fill="${INK}" stroke="none">#1</text>`,
      28,
    ),
  );
  o.push(E('cliA', 100, -8, `<g transform="scale(1.5)">${CLI('#14121A', '#5CE08A')}</g>`, 48));
  o.push(E('cliB', 158, 18, `<g transform="scale(.85)">${CLI('#1F3C88', '#FFD84A')}</g>`, 28));
  o.push(E('kha', 158, 26, TXT('khà khà', 15, 'font-style="italic"'), 40));
  o.push(E('thunder', 34, 30, `<g transform="scale(1.5)">${BOLT}</g>`, 44));
  o.push(E('flash', 100, 100, `<rect x="-140" y="-160" width="400" height="460" fill="#fff" stroke="none"/>`, 40));
  o.push(
    E(
      'shout',
      0,
      0,
      [-1, 1]
        .map((s) =>
          [0, 1]
            .map(
              (i) =>
                `<g transform="translate(${100 + s * (52 + i * 15)} 82)"><g class="sw" style="--i:${i}"><path d="M0 -${14 + i * 7} Q${s * (7 + i * 3)} 0 0 ${14 + i * 7}" fill="none" stroke="${INK}" style="stroke-width:7px"/><path d="M0 -${14 + i * 7} Q${s * (7 + i * 3)} 0 0 ${14 + i * 7}" fill="none" stroke="#fff" style="stroke-width:3px"/></g></g>`,
            )
            .join(''),
        )
        .join('') + TXT('!!', 20, 'x="100" y="-6"'),
      44,
    ),
  );
  o.push(
    E(
      'pulse',
      34,
      100,
      `${HEART('#FF5A7A')}<path d="M-26 22 H-14 L-9 12 L-3 32 L3 18 L7 22 H26" fill="none" stroke="${INK}" style="stroke-width:6px"/><path class="ecg" d="M-26 22 H-14 L-9 12 L-3 32 L3 18 L7 22 H26" fill="none" stroke="#5CE08A" style="stroke-width:2.6px"/>${TXT('tùng tùng', 11, 'x="2" y="-22"')}`,
      40,
    ),
  );
  o.push(
    E(
      'patient',
      20,
      138,
      `<path d="M-62 -8 H8 L12 -4 V10 L8 14 H-62Z" fill="#CFE7F2" style="stroke-width:2px"/><path d="M8 -6 H12 V12 H8Z" fill="#8DB4C8" style="stroke-width:1.4px"/><ellipse cx="22" cy="3" rx="10" ry="8" fill="#F6D5B4" style="stroke-width:2px"/><path d="M14 0 Q22 -2 30 2 M14 6 Q22 8 30 6" fill="none" stroke="#C99A78" style="stroke-width:1.2px"/>`,
      40,
    ),
  );
  o.push(E('gall', 100, 196, `<g transform="scale(1.7)">${GALL}</g>${TXT('GAN!', 13, 'y="9"')}`, 40));
  o.push(E('tiger', 34, 40, `<g transform="scale(1.7)">${TIGER}</g>`, 44));
  o.push(E('crane', 166, 44, `<g transform="scale(1.5)">${CRANE}</g>`, 44));
  o.push(
    E(
      'scroll',
      110,
      198,
      `<rect x="-35" y="-17" width="9" height="34" rx="4.5" fill="#D9BE84" style="stroke-width:1.8px"/><rect x="-30" y="-14" width="60" height="28" rx="2" fill="#F6EBCB" style="stroke-width:1.8px"/><rect x="26" y="-17" width="9" height="34" rx="4.5" fill="#D9BE84" style="stroke-width:1.8px"/>` +
        `<path class="s1" d="M-24 -7 q5 -5 10 0 t10 0 t10 0 t10 0" fill="none" stroke="#3A2A38" style="stroke-width:2px"/>` +
        `<path class="s2" d="M-24 0 q5 -5 10 0 t10 0 t10 0 t8 0" fill="none" stroke="#3A2A38" style="stroke-width:2px"/>` +
        `<path class="s3" d="M-24 7 q5 -5 10 0 t10 0 t6 0" fill="none" stroke="#3A2A38" style="stroke-width:2px"/>`,
      44,
    ),
  );
  /* --- 5 kiểu mặt khoa trương (chỉ đạo owner 2026-10-16) --- */
  const COINS3 = [-30, 0, 30]
    .map(
      (x, i) =>
        `<g transform="translate(${x} ${i === 1 ? -9 : 0})"><g class="gb" style="--i:${i}"><g transform="scale(1.15)">${COIN(10)}</g></g></g>`,
    )
    .join('');
  o.push(E('gold', 100, -8, COINS3 + TXT('!', 30, 'x="62" y="10"'), 44));
  let cr = '';
  for (let i = 0; i < 7; i++) {
    const x = 10 + ((i * 47) % 180),
      sx = ((i * 19) % 29) - 14,
      du = f(1.5 + (i % 4) * 0.22),
      dl = f(-((i * 0.31) % 1.9));
    cr += `<g transform="translate(${x} 0)"><g class="cf" style="--sx:${sx}px;--r:${(i % 2 ? 1 : -1) * (160 + i * 40)}deg;--du:${du}s;--dl:${dl}s"><g transform="scale(.72)">${COIN(10)}</g></g></g>`;
  }
  o.push(E('coinRain', 0, 0, cr, 26));
  o.push(
    E(
      'bag',
      100,
      176,
      `<g transform="scale(1.55)"><path d="M-8 -13 L-12 -22 L-4 -17 L0 -24 L4 -17 L12 -22 L8 -13Z" fill="#C79A4A" style="stroke-width:1.8px"/><path d="M-17 -8 C-26 8 -22 25 0 27 C22 25 26 8 17 -8 C9 -13 -9 -13 -17 -8Z" fill="#C79A4A" style="stroke-width:2px"/><path d="M-10 -10 Q0 -17 10 -10" fill="none" stroke="#B4372E" style="stroke-width:3px"/><path d="M-13 14 C-8 22 8 22 13 14 C9 24 -9 24 -13 14Z" fill="#9B7230" stroke="none"/><g transform="translate(0 7)">${COIN(9)}</g></g>`,
      44,
    ),
  );
  o.push(
    E(
      'snotCry',
      100,
      86,
      `<g class="sn"><path d="M-5 0 C-8 9 -4 17 -7 27" fill="none" stroke="${INK}" style="stroke-width:7px"/><path d="M-5 0 C-8 9 -4 17 -7 27" fill="none" stroke="#CFF1FF" style="stroke-width:3.4px"/><path d="M-7 25 C-3 30 -3 35 -7 36 C-11 35 -11 30 -7 25Z" fill="#CFF1FF" style="stroke-width:1.5px"/></g>` +
        `<g class="sn sn2"><circle cx="9" cy="6" r="6.5" fill="#D6F1FF" fill-opacity=".9" style="stroke-width:1.5px"/><path d="M6 3 Q7 1 9 1" fill="none" stroke="#fff" style="stroke-width:1.5px"/></g>`,
      26,
    ),
  );
  o.push(
    E(
      'plead',
      100,
      0,
      `${[
        [58, 54, 1.1],
        [142, 54, 1.1],
        [30, 92, 0.8],
        [170, 92, 0.8],
      ]
        .map(
          ([x, y, s], i) =>
            `<g transform="translate(${x} ${y})"><g class="tw" style="--i:${i}"><g transform="scale(${s})">${SPARK('#FFFFFF')}</g></g></g>`,
        )
        .join('')}<g transform="translate(52 18) rotate(-8)">${TXT('xin mà~', 15, 'font-style="italic"')}</g>`,
      36,
    ),
  );
  o.push(
    E(
      'bowl',
      30,
      196,
      `<g transform="scale(1.6)"><path d="M-15 -5 H15 C15 8 9 15 0 15 C-9 15 -15 8 -15 -5Z" fill="#F3E6D0" style="stroke-width:2px"/><ellipse cx="0" cy="-5" rx="15" ry="4" fill="#CDB68E" style="stroke-width:1.8px"/><path d="M-9 -9 L11 -22 M-3 -9 L17 -19" fill="none" stroke="#7B5A36" style="stroke-width:2.2px"/></g>` +
        TXT('lương thảo?', 13, 'x="14" y="36"'),
      34,
    ),
  );
  o.push(E('hehe', 150, 52, TXT('hehehe', 16, 'font-style="italic"'), 40));
  const SMK = `<path d="M-10 5 C-16 5 -16 -4 -9 -4 C-9 -12 4 -13 6 -5 C14 -6 16 5 8 5Z" fill="#C9CCD8" style="stroke-width:1.6px"/>`;
  o.push(
    E(
      'smoke',
      0,
      0,
      [
        [72, 22, -18],
        [100, 10, 0],
        [128, 22, 18],
      ]
        .map(
          ([x, y, px], i) =>
            `<g transform="translate(${x} ${y})"><g class="pf" style="--i:${i};--px:${px}px"><g transform="scale(1.7)">${SMK}</g></g></g>`,
        )
        .join(''),
      34,
    ),
  );
  let bs = '';
  for (let i = 0; i < 7; i++) {
    const a = ((-160 + i * 21.5) * Math.PI) / 180,
      r1 = 50,
      r2 = 69 + (i % 2) * 7,
      x1 = 100 + r1 * Math.cos(a),
      y1 = 52 + r1 * Math.sin(a),
      x2 = 100 + r2 * Math.cos(a),
      y2 = 52 + r2 * Math.sin(a);
    bs += `<g><path d="M${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)}" stroke="${INK}" fill="none" style="stroke-width:8px"/><path d="M${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)}" stroke="#FFE45E" fill="none" style="stroke-width:4px"/></g>`;
  }
  o.push(E('bristle', 0, 0, `<g class="bs">${bs}</g>`, 30));
  /* --- 5 trạng thái bổ sung + discover (chỉ đạo owner 2026-10-16) --- */
  o.push(E('resolve', 100, -14, `<g transform="rotate(-6)">${TXT('Quyết!', 28, 'y="8"')}</g>`, 48));
  o.push(
    E(
      'band',
      0,
      0,
      `<path d="M52 49 Q100 36 148 49" fill="none" stroke="${INK}" style="stroke-width:12px"/><path d="M52 49 Q100 36 148 49" fill="none" stroke="#fff" style="stroke-width:7px"/><circle cx="100" cy="43.5" r="5.6" fill="#E5483F" style="stroke-width:1.4px"/>` +
        `<g class="bt"><path d="M147 49 C160 48 168 56 176 70 M147 52 C158 56 162 66 164 80" fill="none" stroke="${INK}" style="stroke-width:7px"/><path d="M147 49 C160 48 168 56 176 70 M147 52 C158 56 162 66 164 80" fill="none" stroke="#fff" style="stroke-width:3.6px"/></g>`,
      30,
    ),
  );
  o.push(
    E(
      'glasses',
      100,
      86,
      `<g class="gls"><circle cx="-22" cy="0" r="10.5" fill="#CFE9FF" fill-opacity=".28" style="stroke-width:2px"/><circle cx="22" cy="0" r="10.5" fill="#CFE9FF" fill-opacity=".28" style="stroke-width:2px"/><path d="M-11.5 -2 Q0 -6 11.5 -2 M-32.5 -2 L-46 -9 M32.5 -2 L46 -9" fill="none" style="stroke-width:2px"/><path d="M-27 -4 Q-24 -7 -20 -6" fill="none" stroke="#fff" style="stroke-width:1.6px"/></g>`,
      30,
    ),
  );
  o.push(
    E(
      'dots',
      152,
      18,
      `<path d="M-22 6 C-34 6 -34 -12 -20 -12 C-20 -26 6 -28 10 -16 C26 -20 34 -2 22 6 C26 18 4 20 0 12 C-8 18 -22 16 -22 6Z" fill="#fff" style="stroke-width:2px"/><circle cx="-26" cy="22" r="4" fill="#fff" style="stroke-width:1.6px"/><circle cx="-34" cy="32" r="2.4" fill="#fff" style="stroke-width:1.4px"/>` +
        [-13, 0, 13]
          .map((x, i) => `<circle class="dd" style="--i:${i}" cx="${x}" cy="-3" r="3.4" fill="${INK}" stroke="none"/>`)
          .join(''),
      40,
    ),
  );
  o.push(
    E(
      'scope',
      150,
      66,
      `<g transform="rotate(-38)"><rect x="-4" y="-7" width="26" height="14" rx="3" fill="#C9973F" style="stroke-width:1.8px"/><rect x="22" y="-9" width="22" height="18" rx="3" fill="#B07F2E" style="stroke-width:1.8px"/><rect x="44" y="-11.5" width="12" height="23" rx="3" fill="#C9973F" style="stroke-width:1.8px"/><path d="M12 -7 V7 M33 -9 V9" fill="none" stroke="#7A5418" style="stroke-width:1.6px"/><ellipse cx="56" cy="0" rx="3.4" ry="9" fill="#BFE9FF" style="stroke-width:1.5px"/></g><g transform="translate(70 -42)"><g class="tw" style="--i:1"><g transform="scale(1.3)">${SPARK('#FFFFFF')}</g></g></g>`,
      40,
    ),
  );
  o.push(
    E(
      'gourd',
      144,
      118,
      `<g class="gd"><path d="M0 -26 C-6 -26 -7 -17 -4 -12 C-14 -8 -17 4 -14 14 C-10 25 10 25 14 14 C17 4 14 -8 4 -12 C7 -17 6 -26 0 -26Z" fill="#D9892B" style="stroke-width:2px"/><path d="M-9 -4 Q-12 6 -8 14" fill="none" stroke="#F4C46A" style="stroke-width:2.4px"/><rect x="-3" y="-34" width="6" height="9" rx="2" fill="#7A4A1A" style="stroke-width:1.5px"/><path d="M-5 -10 Q0 -6 5 -10" fill="none" stroke="#C8363B" style="stroke-width:2.6px"/></g>`,
      40,
    ),
  );
  o.push(E('hic', 150, 20, TXT('hic!', 20, 'font-style="italic"'), 40));
  o.push(
    E(
      'pad',
      100,
      152,
      `<rect x="-40" y="-22" width="80" height="44" rx="12" fill="#4B4F63" style="stroke-width:2.4px"/><rect x="-23" y="-15" width="46" height="30" rx="4" fill="#9BE3A9" style="stroke-width:1.8px"/><g class="scr"><rect x="-17" y="-8" width="6" height="6" fill="${INK}" stroke="none"/><rect x="-4" y="1" width="6" height="6" fill="${INK}" stroke="none"/><rect x="8" y="-9" width="6" height="6" fill="${INK}" stroke="none"/></g>` +
        `<path d="M-33 -3 H-27 M-30 -6 V0" fill="none" stroke="#E8E4DD" style="stroke-width:2.6px"/><circle cx="31" cy="-5" r="3" fill="#E5483F" style="stroke-width:1.2px"/><circle cx="36" cy="2" r="3" fill="#3FA9F5" style="stroke-width:1.2px"/>` +
        [
          [-14, -30],
          [2, -36],
          [16, -29],
        ]
          .map(
            ([x, y], i) =>
              `<g class="blp" style="--i:${i}"><rect x="${x}" y="${y}" width="5" height="5" fill="#FFE45E" style="stroke-width:1.2px"/></g>`,
          )
          .join(''),
      48,
    ),
  );
  o.push(E('bang3', 100, -20, TXT('!!!', 40, 'y="10"'), 48));
  o.push(E('sweatL', 152, 34, `<g transform="scale(2.5)">${DROP}</g>`, 40));
  o.push(E('qwob', 100, -8, `<g transform="scale(2)">${QM('#FFD84A')}</g>`, 40));
  o.push(
    E(
      'blur',
      0,
      0,
      (
        [
          [34, 150, 1],
          [34, 162, -1],
          [166, 150, 1],
          [166, 162, -1],
        ] as [number, number, number][]
      )
        .map(
          ([x, y, d], i) =>
            `<g class="bl2" style="--i:${i}"><path d="M${x} ${y} q${d * -10} 14 ${d * 4} 26" fill="none" stroke="${INK}" style="stroke-width:7px"/><path d="M${x} ${y} q${d * -10} 14 ${d * 4} 26" fill="none" stroke="#fff" style="stroke-width:3px"/></g>`,
        )
        .join(''),
      30,
    ),
  );
  return o.join('');
}
/* nền tia sáng: vẽ SAU CÙNG phía dưới nhân vật (lớp emb), chỉ cỡ lớn */
function EMOB(): string {
  let r = '';
  for (let i = 0; i < 14; i++) {
    const a0 = (i * Math.PI * 2) / 14,
      a1 = a0 + Math.PI / 14;
    r += `<path d="M100 122 L${f(100 + 122 * Math.cos(a0))} ${f(122 + 122 * Math.sin(a0))} L${f(100 + 122 * Math.cos(a1))} ${f(122 + 122 * Math.sin(a1))}Z" fill="#FFE9A8" fill-opacity=".42" stroke="none"/>`;
  }
  const markup = `<g class="em em-rays"><g class="in"><g class="rr">${r}</g></g></g>`;
  EMOMAP.rays = markup;
  return markup;
}
EMO();
EMOB();
EMSZ.rays = 40;
/* chỉ dựng những emote mà (nhân vật, trạng thái) thực sự dùng: DOM nhẹ hơn ~3 lần (xem README, mục hiệu năng) */
export const emoFor = (names: readonly string[]): string =>
  names
    .filter((n) => n !== 'rays' && EMOMAP[n])
    .map((n) => EMOMAP[n])
    .join('');
export const EMOTES = [
  'sweat',
  'fly',
  'pour',
  'vein',
  'sparkR',
  'sparkB',
  'sparkS',
  'plus',
  'minus',
  'stars',
  'ques',
  'ques2',
  'excl',
  'zzz',
  'steam',
  'steamEar',
  'bulb',
  'speed',
  'confetti',
  'petals',
  'hash1',
  'cliA',
  'cliB',
  'kha',
  'thunder',
  'flash',
  'shout',
  'pulse',
  'patient',
  'gall',
  'tiger',
  'crane',
  'scroll',
  'gold',
  'coinRain',
  'bag',
  'snotCry',
  'plead',
  'bowl',
  'hehe',
  'smoke',
  'bristle',
  'resolve',
  'band',
  'glasses',
  'dots',
  'scope',
  'gourd',
  'hic',
  'pad',
  'bang3',
  'sweatL',
  'qwob',
  'blur',
  'rays',
] as const;
export type EmoteName = (typeof EMOTES)[number];

/* ---- hero badge cho 32 / 64 px: lưới 32×32, một biểu tượng đọc được ---- */
const BG = `<circle class="hbg" cx="16" cy="16" r="15" fill="#FFF7E6" stroke="${INK}" stroke-width="2.4"/>`;
const HC = (r = 9): string => `<g transform="translate(15 17.5) scale(${r / 10})">${COIN(10)}</g>`;
export const HERO: Record<HeroName, string> = {
  speed: `${BG}<g class="bw" fill="none" stroke-linecap="round"><path d="M7 10 H20 M5 16 H25 M9 22 H18" stroke="${INK}" stroke-width="5.6"/><path d="M7 10 H20 M5 16 H25 M9 22 H18" stroke="#FF8A1F" stroke-width="3"/></g>`,
  ques: `${BG}<g class="bw" fill="none" stroke-linecap="round"><path d="M11.5 12 C11.5 5 21 5 21 12 C21 16.5 16 15.5 16 20.5" stroke="${INK}" stroke-width="6"/><path d="M11.5 12 C11.5 5 21 5 21 12 C21 16.5 16 15.5 16 20.5" stroke="#FF5A4A" stroke-width="3.2"/><circle cx="16" cy="26" r="3" fill="${INK}"/><circle cx="16" cy="26" r="1.8" fill="#FF5A4A"/></g>`,
  coinp: `${BG}<g class="bw">${HC(9.6)}<path d="M21 6 V14 M17 10 H25" stroke="${INK}" stroke-width="5.4" stroke-linecap="round"/><path d="M21 6 V14 M17 10 H25" stroke="#2EC27E" stroke-width="3" stroke-linecap="round"/></g>`,
  coinm: `${BG}<g class="bw">${HC(9.6)}<path d="M17 10 H25" stroke="${INK}" stroke-width="5.4" stroke-linecap="round"/><path d="M17 10 H25" stroke="#F0483E" stroke-width="3" stroke-linecap="round"/></g>`,
  crown: `${BG}<g class="bw"><path d="M6 23 L6 11 L11.5 17 L16 8 L20.5 17 L26 11 L26 23Z" fill="#F4C542" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><circle cx="16" cy="19" r="1.8" fill="#E5483F"/></g>`,
  steam: `${BG}<g class="bw" fill="none" stroke-linecap="round"><path d="M10 25 q4 -4 0 -8 t0 -8 M17 25 q4 -4 0 -8 t0 -8 M24 25 q4 -4 0 -8 t0 -8" stroke="${INK}" stroke-width="5"/><path d="M10 25 q4 -4 0 -8 t0 -8 M17 25 q4 -4 0 -8 t0 -8 M24 25 q4 -4 0 -8 t0 -8" stroke="#E8F1FA" stroke-width="2.6"/></g>`,
  cli: `${BG}<g class="bw"><rect x="5" y="8" width="22" height="16" rx="3" fill="#1E1B22" stroke="${INK}" stroke-width="1.6"/><path d="M9.5 13 L14 16 L9.5 19" fill="none" stroke="#5CE08A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M16.5 20 H22" stroke="#5CE08A" stroke-width="2.4" stroke-linecap="round"/></g>`,
  excl: `<circle cx="16" cy="16" r="15" fill="#FF5A4A" stroke="${INK}" stroke-width="2"/><g class="bw" stroke-linecap="round"><path d="M16 7 V18" stroke="#fff" stroke-width="4.6"/><circle cx="16" cy="24" r="2.8" fill="#fff"/></g>`,
  tear: `${BG}<g class="bw"><path d="M16 5 C21 12 24 16 24 20 A8 8 0 0 1 8 20 C8 16 11 12 16 5Z" fill="#6FCBF2" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M12 20 Q12 24 15.5 25" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/></g>`,
  beg: `${BG}<g class="bw"><path d="M16 5.5 C22.5 12 23.5 20 20.5 27.5 L11.5 27.5 C8.5 20 9.5 12 16 5.5Z" fill="#F6D5B4" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M16 9 V26" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/><path d="M5.5 8.5 L8 11 M26.5 8.5 L24 11 M16 2.8 V1" stroke="#F4B400" stroke-width="2.2" stroke-linecap="round"/></g>`,
  bowl: `${BG}<g class="bw"><path d="M6 15 H26 C26 23 22 27.5 16 27.5 C10 27.5 6 23 6 15Z" fill="#F3E6D0" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M10 5 L20 13 M22 5 L12 13" fill="none" stroke="#7B5A36" stroke-width="2.6" stroke-linecap="round"/></g>`,
  anger: `<circle cx="16" cy="16" r="15" fill="#FFF0E4" stroke="${INK}" stroke-width="2.2"/><g class="bw"><g transform="translate(16 16) scale(1.62)">${VEIN}</g></g>`,
  fire: `${BG}<g class="bw"><path d="M16 4 C20 10 26 13 25 20 C24 26 20 28 16 28 C12 28 7 26 7 20 C7 15 11 13 12 9 C14 11 15 11 16 4Z" fill="#FF8A1F" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M16 14 C18 18 21 19 20 23 C19 26 17 26 16 26 C14 26 12 25 12 22 C12 19 15 18 16 14Z" fill="#FFE45E"/></g>`,
  think: `${BG}<g class="bw"><path d="M6 12 C4 6 12 3 16 6 C20 2 28 6 26 12 C30 16 24 21 19 19 C15 22 8 20 8 16 C4 16 3 13 6 12Z" fill="#fff" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><circle cx="11" cy="12" r="1.9" fill="${INK}"/><circle cx="16.5" cy="12" r="1.9" fill="${INK}"/><circle cx="22" cy="12" r="1.9" fill="${INK}"/><circle cx="8" cy="24" r="2.6" fill="#fff" stroke="${INK}" stroke-width="1.6"/><circle cx="5" cy="29" r="1.5" fill="#fff" stroke="${INK}" stroke-width="1.2"/></g>`,
  gourd: `${BG}<g class="bw"><path d="M16 5 C14 5 13.5 8 14.5 9.5 C9 11 7 17 9 22 C11 28 21 28 23 22 C25 17 23 11 17.5 9.5 C18.5 8 18 5 16 5Z" fill="#D9892B" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M13.6 12.4 Q11.4 18 13 23" fill="none" stroke="#F4C46A" stroke-width="1.8" stroke-linecap="round"/></g>`,
  pad: `${BG}<g class="bw"><rect x="4.5" y="9" width="23" height="15" rx="4.5" fill="#4B4F63" stroke="${INK}" stroke-width="2"/><rect x="10" y="11.5" width="12" height="9" rx="1.5" fill="#9BE3A9"/><path d="M6.5 16.5 H9.5 M8 15 V18" stroke="#E8E4DD" stroke-width="1.4" stroke-linecap="round"/><circle cx="24" cy="15.5" r="1.4" fill="#E5483F"/></g>`,
  wow: `<circle cx="16" cy="16" r="15" fill="#FFE45E" stroke="${INK}" stroke-width="2.2"/><g class="bw" stroke-linecap="round"><path d="M10 7 V17 M16 5 V18 M22 7 V17" stroke="${INK}" stroke-width="5.2"/><path d="M10 7 V17 M16 5 V18 M22 7 V17" stroke="#E5483F" stroke-width="3"/><circle cx="10" cy="23.5" r="2.4" fill="#E5483F" stroke="${INK}" stroke-width="1.2"/><circle cx="16" cy="24.5" r="2.4" fill="#E5483F" stroke="${INK}" stroke-width="1.2"/><circle cx="22" cy="23.5" r="2.4" fill="#E5483F" stroke="${INK}" stroke-width="1.2"/></g>`,
  zzz: `${BG}<g class="bw" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M7 24 H12 L7 29 H12 M12 16 H18 L12 22 H18 M18 8 H25 L18 15 H25" stroke="${INK}" stroke-width="5" transform="translate(0 -3)"/><path d="M7 24 H12 L7 29 H12 M12 16 H18 L12 22 H18 M18 8 H25 L18 15 H25" stroke="#A89BFF" stroke-width="2.4" transform="translate(0 -3)"/></g>`,
};
