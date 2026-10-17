// Đạo cụ: cầm tay phải (HELD), dựng sau lưng (BACK), ở thân trước (FRONT), áo choàng (CAPE).
import { INK } from '../color.ts';
import type { BackName, FrontName, HeldName, Params, PropName } from '../params.ts';

/* ---- đạo cụ cầm tay: gốc (0,0) = tâm bàn tay; lớp .prop để token chuyển động nắm được ---- */
function feather(a: number): string {
  return (
    `<g transform="translate(0 -12) rotate(${a})"><path class="fth" d="M0 0 C-7.5 -14 -7.5 -37 0 -53 C7.5 -37 7.5 -14 0 0Z" fill="#FFFFFF"/>` +
    `<path d="M0 0 C-7.5 -14 -7.5 -37 0 -53 C-2.5 -37 -2.5 -14 0 0Z" fill="#E3EBF6" stroke="none"/></g>`
  );
}
export const HELD: Record<HeldName, (p: Params) => string> = {
  fan: (p) =>
    `<g class="fan prop" data-part="prop-fan"><g transform="rotate(20)">` +
    [-28, -16, -4, 8, 20, 32, 44].map((a) => feather(a)).join('') +
    `<rect x="-2.5" y="-14" width="5" height="32" rx="2.5" fill="#8B5A3C"/>` +
    `<circle cx="0" cy="-12" r="3.8" fill="${p.trim}" style="stroke-width:1.6px"/>` +
    `<path class="dt" d="M0 20 L-3 31 M0 20 L0 33 M0 20 L3 31" stroke="#C8363B" fill="none" style="stroke-width:1.6px"/></g></g>`,
  sword: (p) =>
    `<g class="sword prop" data-part="prop-sword"><g transform="rotate(14)">` +
    `<path d="M-4 -10 L4 -10 L4 -86 L0 -97 L-4 -86Z" fill="#D5DEE8"/>` +
    `<path d="M0 -10 L4 -10 L4 -86 L0 -97Z" fill="#A5B5C8" stroke="none"/>` +
    `<path class="gleam" d="M-2.2 -16 L2.2 -16 L1 -84 L-1 -84Z" fill="#fff" stroke="none" style="opacity:0"/>` +
    `<path d="M-13 -10 Q0 -15 13 -10 L13 -5 Q0 -10 -13 -5Z" fill="${p.buckle}"/>` +
    `<rect x="-3" y="-6" width="6" height="23" rx="1.5" fill="${p.hilt || '#6A2B33'}"/>` +
    `<circle cy="19" r="4.2" fill="${p.buckle}"/>` +
    `<path d="M0 23 C-2 33 -6 38 -5 47" fill="none" stroke="${p.tassel}" style="stroke-width:2.4px"/></g></g>`,
  swordT: (p) =>
    `<g class="sword prop" data-part="prop-sword"><g>` +
    `<path d="M-4 -10 L4 -10 L4 -100 L0 -112 L-4 -100Z" fill="#D5DEE8"/><path d="M0 -10 L4 -10 L4 -100 L0 -112Z" fill="#A5B5C8" stroke="none"/>` +
    `<path class="gleam" d="M-2.2 -16 L2.2 -16 L1 -98 L-1 -98Z" fill="#fff" stroke="none" style="opacity:0"/>` +
    `<path d="M-14 -10 Q0 -16 14 -10 L14 -4 Q0 -10 -14 -4Z" fill="${p.buckle}"/><rect x="-3.4" y="-6" width="6.8" height="24" rx="1.5" fill="${p.hilt || '#5A2A30'}"/><circle cy="20" r="4.6" fill="${p.buckle}"/>` +
    `<g data-part="sword-tassel" class="tsl"><path d="M0 24 C-2 36 -7 44 -5 56" fill="none" stroke="${p.tassel}" style="stroke-width:3px"/><path d="M0 24 C4 36 6 46 5 58" fill="none" stroke="${p.tassel}" style="stroke-width:3px"/><circle cx="0" cy="26" r="3.4" fill="${p.tassel}" style="stroke-width:1.3px"/><path d="M-9 56 L-1 70 L2 58 L9 72 L9 56Z" fill="${p.tassel}" style="stroke-width:1.4px"/></g></g></g>`,
  chopsticks: (_p) =>
    `<g class="chop prop" data-part="prop-chopsticks"><g transform="rotate(26)">` +
    `<path d="M-3 14 L-8 -36 M4 14 L10 -36" fill="none" stroke="${INK}" style="stroke-width:6px"/><path d="M-3 14 L-8 -36 M4 14 L10 -36" fill="none" stroke="#C99A62" style="stroke-width:3px"/>` +
    `<circle cx="-8.5" cy="-37" r="2.2" fill="#8B5A3C" style="stroke-width:1px"/><circle cx="10.5" cy="-37" r="2.2" fill="#8B5A3C" style="stroke-width:1px"/></g></g>`,
  silkfan: (p) =>
    `<g class="prop" data-part="prop-silkfan"><path d="M0 -8 L0 12" fill="none" stroke="#8B5A3C" style="stroke-width:3.4px"/>` +
    `<g transform="translate(0 -30) rotate(14)"><circle r="20" fill="#FFF1F6"/><circle r="20" fill="none" stroke="${p.trim}" style="stroke-width:3.4px"/>` +
    `<circle r="14" fill="none" stroke="#F7A6C6" style="stroke-width:1.4px"/>` +
    [0, 72, 144, 216, 288]
      .map(
        (a) =>
          `<ellipse cx="0" cy="-5" rx="3.6" ry="5" fill="#F7A6C6" transform="rotate(${a})" style="stroke-width:1px"/>`,
      )
      .join('') +
    `<circle r="2.4" fill="#FFE27A" style="stroke-width:1px"/></g>` +
    `<path class="dt" d="M0 14 C-2 22 -6 24 -5 32" fill="none" stroke="${p.sash}" style="stroke-width:2.2px"/></g>`,
};
/* ---- đạo cụ dựng sau lưng (toạ độ tuyệt đối) ---- */
export const BACK: Record<BackName, (p: Params) => string> = {
  /* Thanh Long Yển Nguyệt đao: lưỡi dài, cong như trăng khuyết, sống lưỡi có vây + đầu rồng */
  glaive: (p) =>
    `<g data-part="prop-glaive">` +
    `<rect x="23.5" y="92" width="5" height="146" rx="2.5" fill="#6B4430"/>` +
    `<rect x="22" y="229" width="8" height="8" rx="2" fill="${p.buckle}" style="stroke-width:1.6px"/>` +
    `<rect class="dt" x="22.5" y="118" width="7" height="3.5" rx="1" fill="${p.buckle}" style="stroke-width:1.2px"/><rect class="dt" x="22.5" y="200" width="7" height="3.5" rx="1" fill="${p.buckle}" style="stroke-width:1.2px"/>` +
    `<path d="M24 96 C6 88 -1 62 3 38 C7 16 22 4 44 -1 C31 12 24 30 24 50 C24 68 27 84 31 96Z" fill="#C9D6E4"/>` +
    `<path d="M44 -1 C31 12 24 30 24 50 C24 68 27 84 31 96 L27 96 C29 80 29 66 29 50 C29 30 35 14 44 -1Z" fill="#8FA3BA" stroke="none"/>` +
    `<path class="dt" d="M6 44 C8 22 20 8 38 2" fill="none" stroke="#fff" style="stroke-width:1.8px"/>` +
    `<path data-part="blade-fins" d="M26 18 L38 23 L25 30Z M23.5 38 L36 43 L23.5 50Z M24 58 L36 64 L25 70Z" fill="${p.buckle}" style="stroke-width:1.4px"/>` +
    `<path data-part="dragon-head" d="M26 99 C34 90 48 90 53 96 C55 100 51 103 46 102 L50 108 C42 111 31 108 26 104Z" fill="#3E9C74" style="stroke-width:1.6px"/>` +
    `<circle cx="42" cy="95.5" r="1.9" fill="#FFE066" style="stroke-width:1px"/><path class="dt" d="M44 100 L52 100" stroke="${INK}" fill="none" style="stroke-width:1.2px"/>` +
    `<path d="M25 108 L21 130 L30 130Z" fill="#C8363B" style="stroke-width:1.6px"/></g>`,
  /* Xà mâu (丈八蛇矛): mũi lượn sóng như rắn, dài hơn đầu */
  serpent: (_p) =>
    `<g data-part="prop-serpent">` +
    `<rect x="171.5" y="44" width="5" height="194" rx="2.5" fill="#4A3A34"/>` +
    `<rect x="170" y="229" width="8" height="8" rx="2" fill="#8F96A3" style="stroke-width:1.6px"/>` +
    `<path d="M170 46 C161 36 181 28 170 17 C161 8 180 2 174 -9 C183 1 190 10 180 20 C190 29 186 38 178 46Z" fill="#AEB8C8"/>` +
    `<path d="M174 -9 C183 1 190 10 180 20 C190 29 186 38 178 46 L174 46 C181 36 176 28 176 18 C176 8 178 2 174 -9Z" fill="#7C879A" stroke="none"/>` +
    `<rect x="168.5" y="44" width="11" height="6" rx="2" fill="#6B6F7A" style="stroke-width:1.5px"/>` +
    `<path d="M174 50 L169 74 L179 74Z" fill="#C8363B" style="stroke-width:1.6px"/>` +
    `<rect class="dt" x="170" y="120" width="8" height="3.5" rx="1" fill="#8F96A3" style="stroke-width:1.2px"/><rect class="dt" x="170" y="198" width="8" height="3.5" rx="1" fill="#8F96A3" style="stroke-width:1.2px"/></g>`,
  /* thương của Triệu Vân (cắp bên sườn, cùng em bé): mũi bạc, tua đỏ, dải xanh nhạt */
  spear: (_p) =>
    `<g data-part="prop-spear"><rect x="168.5" y="22" width="5" height="216" rx="2.5" fill="#6B5A4A"/>` +
    `<rect x="167" y="229" width="8" height="8" rx="2" fill="#B9C3D2" style="stroke-width:1.6px"/>` +
    `<path d="M171 -8 C177 6 179 18 177 28 L165 28 C163 18 165 6 171 -8Z" fill="#E8EEF6"/><path d="M171 -8 C177 6 179 18 177 28 L171 28Z" fill="#B7C3D4" stroke="none"/>` +
    `<rect x="166" y="27" width="10" height="6" rx="2" fill="#9AA6B8" style="stroke-width:1.5px"/>` +
    `<path d="M171 33 C161 40 163 52 156 60 C168 56 172 46 172 33Z" fill="#8DB4E2" style="stroke-width:1.6px"/>` +
    `<path d="M171 33 L166 58 L176 58Z" fill="#C8363B" style="stroke-width:1.6px"/></g>`,
  /* giáo của Lính quèn: dài hơn người, tua đỏ, cờ đỏ trơn không chữ */
  spearLong: (_p) =>
    `<g data-part="prop-spearlong"><rect x="173.5" y="-6" width="5" height="244" rx="2.5" fill="#8A6B4A"/>` +
    `<path d="M176 -34 C181 -22 182 -14 180 -6 L172 -6 C170 -14 171 -22 176 -34Z" fill="#9AA0AA"/><path d="M176 -34 C181 -22 182 -14 180 -6 L176 -6Z" fill="#6F7580" stroke="none"/>` +
    `<g data-part="spear-tassel"><path d="M176 -4 C168 6 168 16 172 26 C176 18 180 18 184 26 C186 14 184 4 176 -4Z" fill="#C8363B" style="stroke-width:1.5px"/></g><g class="flag"><path d="M178 34 C188 30 196 36 206 32 L204 50 C196 54 188 48 178 52Z" fill="#C8363B" style="stroke-width:1.6px"/></g>` +
    `<rect class="dt" x="173.5" y="150" width="5" height="3" fill="#6B5A4A" style="stroke-width:1px"/></g>`,
};
/* ---- vật dụng ở thân trước (vẽ sau áo, trước đầu và tay) ---- */
export const FRONT: Record<FrontName, (p: Params) => string> = {
  none: () => '',
  twinswords: (p) =>
    `<g data-part="prop-twinswords">` +
    (
      [
        [62, 1],
        [138, -1],
      ] as [number, number][]
    )
      .map(
        ([x, s]) =>
          `<g transform="translate(${x} 168) rotate(${24 * s})"><rect x="-4.5" y="2" width="9" height="42" rx="4.5" fill="#5A3A2A"/>` +
          `<rect x="-3" y="-14" width="6" height="16" rx="2" fill="#7A1F2B"/><rect x="-10" y="-2" width="20" height="5" rx="2.5" fill="${p.buckle}" style="stroke-width:1.5px"/><circle cy="-16" r="4" fill="${p.buckle}" style="stroke-width:1.3px"/>` +
          `<path d="M0 -18 C${5 * s} -26 ${9 * s} -26 ${8 * s} -34" fill="none" stroke="#C8363B" style="stroke-width:2.2px"/></g>`,
      )
      .join('') +
    `</g>`,
  bag: (_p) =>
    `<g data-part="prop-bag"><path d="M132 110 C120 130 98 156 80 174" fill="none" stroke="${INK}" style="stroke-width:8px"/><path d="M132 110 C120 130 98 156 80 174" fill="none" stroke="#3E7F5E" style="stroke-width:4.6px"/>` +
    `<g transform="translate(72 184) rotate(-14)"><rect x="-15" y="-13" width="30" height="28" rx="7" fill="#4C9C74"/><path d="M-15 -4 Q0 8 15 -4" fill="none" stroke="#2F6E50" style="stroke-width:2px"/>` +
    `<path d="M0 -13 C-4 -22 4 -22 0 -13" fill="none" stroke="#E0B04A" style="stroke-width:2.4px"/><circle cy="3" r="3" fill="#E0B04A" style="stroke-width:1.2px"/><path class="dt" d="M-6 8 q3 -6 6 0 q3 -6 6 0" fill="none" stroke="#CFEBD9" style="stroke-width:1.2px"/></g></g>`,
  baby: (_p) =>
    `<g class="baby" data-part="prop-baby">` +
    `<path d="M72 140 C70 114 130 114 128 140 C134 168 66 168 72 140Z" fill="#F6E7B8"/>` +
    `<path d="M128 140 C134 168 66 168 72 140 C80 160 120 160 128 140Z" fill="#E6D08E" stroke="none"/>` +
    `<path class="dt" d="M80 132 Q100 142 120 132 M82 148 Q100 158 118 148" fill="none" stroke="#C9AE63" style="stroke-width:1.6px"/>` +
    `<circle cx="88" cy="121" r="13" fill="#FBDCC0"/><path d="M76 118 Q88 102 100 118Z" fill="#9CC3E8" style="stroke-width:1.6px"/>` +
    `<circle cx="88" cy="106" r="3" fill="#9CC3E8" style="stroke-width:1.2px"/>` +
    `<path d="M80 123 Q83 126 86 123 M91 123 Q94 126 97 123" fill="none" stroke="${INK}" style="stroke-width:1.6px"/><ellipse cx="80" cy="128" rx="3" ry="2" fill="#F4A6A6" opacity=".7" stroke="none"/><ellipse cx="97" cy="128" rx="3" ry="2" fill="#F4A6A6" opacity=".7" stroke="none"/>` +
    `<path d="M85 130 Q88 133 91 130" fill="none" stroke="${INK}" style="stroke-width:1.4px"/>` +
    `<circle cx="116" cy="127" r="5.5" fill="#FBDCC0" class="bhand"/></g>`,
};
export function CAPE(p: Params): string {
  return (
    `<g class="cape" data-part="cape"><path d="M58 112 C40 150 25 198 20 230 C60 242 140 242 180 230 C175 198 160 150 142 112Z" fill="${p.capeIn}"/>` +
    `<path d="M60 112 C47 152 33 198 30 226 C64 236 136 236 170 226 C167 198 153 152 140 112Z" fill="${p.cape}"/></g>`
  );
}

export const isHeld = (n: PropName): n is HeldName => Object.hasOwn(HELD, n);
export const isBack = (n: PropName): n is BackName => Object.hasOwn(BACK, n);
