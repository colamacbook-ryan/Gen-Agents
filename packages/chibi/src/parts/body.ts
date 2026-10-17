// Thân (áo, đai, giáp...) và tay áo.
import { f, INK, shade } from '../color.ts';
import type { Params, Vec2 } from '../params.ts';
import { ROBE } from './head.ts';
import { FRONT } from './props.ts';

type Pt2 = [number, number];

/** tay áo nước (水袖): dải lụa dài, luôn buông xuống theo trọng lực (ngược chiều xoay của cánh tay), đuôi tròn, gợn sóng */
function waterSleeve(side: 'L' | 'R', dx: number, dy: number, ux: number, uy: number, color: string): string {
  const sg = side === 'L' ? -1 : 1;
  const N = 10;
  const len = 64;
  const pts: Pt2[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push([sg * (13 * t + 8 * Math.sin(t * 5.4) * t), 2 + len * t]);
  }
  const at = (i: number): Pt2 => pts[i] ?? [0, 0];
  const wd = (t: number) => 5.2 + 5.6 * t;
  const nrm = (i: number): [number, number, number, number] => {
    const a = at(Math.min(i + 1, N));
    const b = at(Math.max(i - 1, 0));
    const tx = a[0] - b[0];
    const ty = a[1] - b[1];
    const l = Math.hypot(tx, ty) || 1;
    return [-ty / l, tx / l, tx / l, ty / l];
  };
  const left: Pt2[] = [];
  const right: Pt2[] = [];
  for (let i = 0; i <= N; i++) {
    const [nx2, ny2] = nrm(i);
    const w = wd(i / N);
    const q = at(i);
    left.push([q[0] + nx2 * w, q[1] + ny2 * w]);
    right.push([q[0] - nx2 * w, q[1] - ny2 * w]);
  }
  const [enx, eny, etx, ety] = nrm(N);
  const ew = wd(1);
  const end = at(N);
  const cap: Pt2[] = [];
  for (let k = 1; k < 6; k++) {
    const th = (Math.PI * k) / 6;
    cap.push([
      end[0] + enx * ew * Math.cos(th) + etx * ew * Math.sin(th) * 0.9,
      end[1] + eny * ew * Math.cos(th) + ety * ew * Math.sin(th) * 0.9,
    ]);
  }
  const dd = `M${[...left, ...cap, ...right.reverse()].map((q) => `${f(q[0])} ${f(q[1])}`).join(' L')}Z`;
  const fold = `M${pts
    .slice(1, N)
    .map((q, i) => {
      const [nx2, ny2] = nrm(i + 1);
      const w = wd((i + 1) / N) * 0.45;
      return `${f(q[0] + nx2 * w)} ${f(q[1] + ny2 * w)}`;
    })
    .join(' L')}`;
  return `<g transform="translate(${f(dx + ux * 4)} ${f(dy + uy * 4)})"><g class="ribw"><g class="rib" data-part="water-sleeve"><path d="${dd}" fill="${color}" style="stroke-width:1.6px"/><path class="dt" d="${fold}" fill="none" stroke="${shade(color, 0.22)}" style="stroke-width:1.4px"/></g></g></g>`;
}

/* ---- tay áo: S = vai, d = vector tới cổ tay ---- */
export function arm(
  side: 'L' | 'R',
  S: readonly [number, number],
  d: Vec2,
  p: Params,
  held: string,
  cls: string,
  hx: string | null = null,
): string {
  const [dx, dy] = d;
  const L = Math.hypot(dx, dy);
  const ux = dx / L;
  const uy = dy / L;
  const nx = -uy;
  const ny = ux;
  const w0 = p.sleeve * 0.82;
  const w1 = p.sleeve * 1.18;
  const W = (t: number) => w0 + (w1 - w0) * t;
  const Pt = (t: number, o: number) => `${f(dx * t + nx * o)} ${f(dy * t + ny * o)}`;
  const sd = nx + ny > 0 ? 1 : -1;
  const sleeve = `M${Pt(0, W(0) / 2)} L${Pt(1, W(1) / 2)} L${Pt(1, -W(1) / 2)} L${Pt(0, -W(0) / 2)}Z`;
  const shadeD = `M${Pt(0, sd * W(0) * 0.08)} L${Pt(1, sd * W(1) * 0.08)} L${Pt(1, sd * W(1) * 0.5)} L${Pt(0, sd * W(0) * 0.5)}Z`;
  const t0 = 0.78;
  const cuff = `M${Pt(t0, W(t0) / 2)} L${Pt(1, W(1) / 2)} L${Pt(1, -W(1) / 2)} L${Pt(t0, -W(t0) / 2)}Z`;
  const hx0 = f(dx + ux * 7);
  const hy = f(dy + uy * 7);
  const rib = p.ribbon ? waterSleeve(side, dx, dy, ux, uy, p.ribbon) : '';
  return (
    `<g transform="translate(${S[0]} ${S[1]})"><g class="arm-s arm-${side}"${L >= 58 ? ' data-part="arm-long"' : ''}><g${cls ? ` class="${cls}"` : ''}>` +
    rib +
    `<circle r="${f(W(0) / 2)}" fill="${p.robe}"/>` +
    `<path d="${sleeve}" fill="${p.robe}"/><path d="${shadeD}" fill="${shade(p.robe, 0.2)}" stroke="none"/>` +
    `<path d="${cuff}" fill="${p.trim}"/><path d="${sleeve}" fill="none"/>` +
    `<g class="rolled"><path d="M${Pt(0.5, Math.min(W(0.5) / 2.4, 7))} L${Pt(1, Math.min(W(1) / 2.4, 6.4))} L${Pt(1, -Math.min(W(1) / 2.4, 6.4))} L${Pt(0.5, -Math.min(W(0.5) / 2.4, 7))}Z" fill="${p.skin}"/><path d="M${Pt(0.5, W(0.5) / 2 + 2)} L${Pt(0.5, -W(0.5) / 2 - 2)}" fill="none" stroke="${p.robe}" style="stroke-width:6.4px"/><path d="M${Pt(0.5, W(0.5) / 2 + 2)} L${Pt(0.5, -W(0.5) / 2 - 2)}" fill="none" stroke="${shade(p.robe, 0.25)}" style="stroke-width:1.5px" transform="translate(${f(ux * 3.4)} ${f(uy * 3.4)})"/></g>` +
    (p.armor
      ? `<g data-part="armor-gold"><path d="M-15 -3 C-15 -17 15 -17 15 -3 C15 6 8 10 0 10 C-8 10 -15 6 -15 -3Z" fill="${p.armorColor}"/><path class="dt" d="M-9 -9 Q0 -14 9 -9 M-11 -2 Q0 -8 11 -2" fill="none" stroke="${shade(p.armorColor, 0.35)}" style="stroke-width:1.5px"/></g>`
      : '') +
    `<g transform="translate(${hx0} ${hy})">${held ? `<g class="held"><g class="held-h">${held}</g></g>` : ''}${hx === null ? '' : `<g class="hx">${hx}</g>`}` +
    `<circle data-part="hand" r="8.2" fill="${p.skin}"/><path d="M1 -2 Q5 1 2 5" fill="none" stroke="${shade(p.skin, 0.3)}" class="dt" style="stroke-width:1.4px"/>` +
    (side === 'R'
      ? `<g class="brush"><path d="M0 -14 L0 8" stroke="#6B4430" fill="none" style="stroke-width:3.4px"/><path d="M-2.2 8 L2.2 8 L0 17Z" fill="${INK}" stroke="none"/></g>`
      : '') +
    `</g></g></g></g>`
  );
}

/* ---- thân ---- */
function featherHem(_p: Params): string {
  // hạc sưởng: viền lông hạc, 7 chiếc lông trắng rủ xuống dải viền
  let s = '';
  for (let i = 0; i < 7; i++) {
    const x = 46 + i * 15.4;
    s += `<path d="M${f(x)} 209 Q${f(x + 7.7)} 226 ${f(x + 15.4)} 209Z" fill="#FBFAF6" style="stroke-width:1.3px"/>`;
  }
  return `<g data-part="hem-feather">${s}</g>`;
}
export function body(p: Params): string {
  const W = p.stance === 'wide';
  return (
    `<ellipse class="shoeL" cx="${W ? 68 : 78}" cy="232" rx="17" ry="6.5" fill="${p.shoe}"/><ellipse class="shoeR" cx="${W ? 132 : 122}" cy="232" rx="17" ry="6.5" fill="${p.shoe}"/>` +
    (W ? `<g data-part="stance-wide" transform="translate(100 0) scale(1.1 1) translate(-100 0)">` : '') +
    `<path data-part="robe" data-fill="${p.robe}" data-trim="${p.trim}" d="${ROBE}" fill="${p.robe}"/>` +
    `<path d="M139 110 C143 148 151 188 155 222 C148 225.6 141 227.8 131 228.6 C135 196 132 148 124 116 C131 116 136 114 139 110Z" fill="${shade(p.robe, 0.2)}" stroke="none"/>` +
    `<path d="M46 207 C72 218 128 218 154 207 L155 222 C128 233 72 233 45 222Z" fill="${p.trim}" stroke="none"/>` +
    (p.hem === 'feather' ? featherHem(p) : '') +
    (p.collar === 'high'
      ? `<path data-part="collar-high" d="M84 106 L116 106 L110 124 L90 124Z" fill="${p.inner}" stroke="none"/>`
      : `<path d="M82 106 L118 106 L100 152Z" fill="${p.inner}" stroke="none"/>`) +
    `<path d="M72 108 L84 105 L106 160 L97 162Z" fill="${p.trim}"/><path d="M128 108 L116 105 L94 160 L103 162Z" fill="${p.trim}"/>` +
    `<path d="M55 158 Q100 168 145 158 L146.5 173 Q100 183 53.5 173Z" fill="${p.sash}"/>` +
    (p.armor
      ? `<g data-part="armor-gold"><path d="M57 174 L78 178 L76 206 L56 202Z M143 174 L122 178 L124 206 L144 202Z" fill="${p.armorColor}"/><path class="dt" d="M58 186 L77 189 M57 196 L76 198 M142 186 L123 189 M143 196 L124 198" fill="none" stroke="${shade(p.armorColor, 0.35)}" style="stroke-width:1.5px"/></g>`
      : '') +
    (p.tails
      ? `<path d="M95 176 L90 204 L99 199 L102 178Z" fill="${p.sash}"/><path d="M103 178 L110 203 L115 195 L108 176Z" fill="${p.sash}"/>`
      : '') +
    (p.rope
      ? `<g data-part="armor-cord"><path d="M55 160 Q100 170 145 160" fill="none" stroke="${p.ropeColor || '#D8C08C'}" style="stroke-width:5px"/><path d="M100 169 L94 188 M100 169 L108 186" fill="none" stroke="${p.ropeColor || '#D8C08C'}" style="stroke-width:3.4px"/></g>`
      : '') +
    `<circle cx="100" cy="170.5" r="6" fill="${p.buckle}"/><circle cx="100" cy="170.5" r="2.2" fill="${shade(p.buckle, 0.35)}" stroke="none"/>` +
    (p.patch
      ? `<g data-part="patch"><rect x="112" y="190" width="16" height="15" rx="2" fill="#B49A6B" style="stroke-width:1.4px"/><path d="M114 192 L126 203 M126 192 L114 203" fill="none" stroke="#5C4F38" stroke-dasharray="2 2" style="stroke-width:1px"/></g>`
      : '') +
    `<path d="${ROBE}" fill="none"/>` +
    (W ? '</g>' : '') +
    FRONT[p.front](p)
  );
}
