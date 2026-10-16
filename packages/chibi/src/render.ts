// svg(): dựng một SVG tự chứa (không ảnh, không href ngoài, không script) cho (nhân vật, trạng thái, cỡ).
import { armVars } from './arm-vars.ts';
import { esc, f } from './color.ts';
import { nsMarkup } from './css.ts';
import { figure } from './face.ts';
import { type MotionLevel, prefersReducedMotion } from './motion.ts';
import { heroMarkup, needOf, pickVariant } from './need.ts';
import { getChar } from './registry.ts';
import { resolve } from './resolve.ts';
import { injectCSS } from './runtime.ts';
import type { AvatarState } from './state-keys.ts';
import { type IdleVariant, ST } from './states.ts';

export type Crop = readonly [number, number, number];

export interface SvgOptions {
  /** cạnh cao (px). >= 120 cỡ lớn (đủ emote + phần phụ), 48–119 cỡ vừa, < 48 cỡ nhỏ (thân + đầu + một huy hiệu). Mặc định 160 */
  size?: number;
  /** màu Role (#RRGGBB): chỉ tô bóng dưới chân; đổi sau bằng svg.style.setProperty('--chb-rc', ...) */
  roleColor?: string;
  /** false = không vẽ emote / huy hiệu */
  emote?: boolean;
  /** chỉ có nghĩa với idle; không truyền = tự xoay vòng ~9 giây một biến thể */
  variant?: IdleVariant | string | null;
  /** avatar tròn (cắt theo `crop` của nhân vật) */
  round?: boolean;
  /** nhãn trợ năng (aria-label); mặc định = tên nhân vật */
  label?: string;
  /** cố định pha chớp / thở (ảnh chụp lặp lại được) */
  fixedPhase?: boolean;
  crop?: Crop;
  /** mức chuyển động (ui.avatar_motion). prefers-reduced-motion của hệ điều hành luôn ép 'off' */
  motion?: MotionLevel;
}

let uid = 0;
const HEX = /^#[0-9A-Fa-f]{6}$/;
const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

export function svg(id: string, state: AvatarState | string, o: SvgOptions = {}): string {
  const C = getChar(id);
  const st: AvatarState = Object.hasOwn(ST, state) ? (state as AvatarState) : 'normal';
  injectCSS();
  const variant = st === 'idle' ? pickVariant(o.variant) : null;
  const size = Number.isFinite(o.size) && (o.size as number) > 0 ? Math.min(o.size as number, 2048) : 160;
  const emote = o.emote !== false;
  if (o.roleColor !== undefined && !HEX.test(o.roleColor)) throw new Error('Chibi: roleColor phải là #RRGGBB');
  const crop: Crop | null = o.crop ?? (o.round ? C.spec.crop : null);
  if (crop && !crop.every(Number.isFinite)) throw new Error('Chibi: crop phải là 3 số');
  const sz = size >= 120 ? 'b' : size >= 48 ? 'm' : 's';
  const amp = sz === 'b' ? 1 : sz === 'm' ? 0.55 : 0.35;
  const target = sz === 'b' ? 1.7 : sz === 'm' ? 1.5 : 1.15;
  const vbH = crop ? crop[2] : 240;
  const vb = crop ? `${crop[0]} ${crop[1]} ${crop[2]} ${crop[2]}` : '0 0 200 240';
  const hpx = size;
  const wpx = crop ? size : Math.round((size * 200) / 240);
  const scale = hpx / vbH;
  const sw = f(target / scale);
  const R = resolve(id, st, variant);
  const first = R.ph[0]?.[1] ?? R.peak;
  const big = sz === 'b' && emote;
  const motion = prefersReducedMotion() ? 'off' : (o.motion ?? 'full');
  const face = motion === 'off' ? Object.assign({}, R.peak, { em: '' }) : first;
  const a = C.spec.anim ?? {};
  const need = needOf(R);
  let fig = figure(C.P, !big, need);
  const clipId = o.round ? `chb-clip-${++uid}` : '';
  if (crop && o.round) {
    fig = `<clipPath id="${clipId}"><circle cx="${crop[0] + crop[2] / 2}" cy="${crop[1] + crop[2] / 2}" r="${crop[2] / 2}"/></clipPath><g clip-path="url(#${clipId})">${fig}</g>`;
  }
  // huy hiệu 1 emote (32 / 64 px; hoặc mọi cỡ khi reduced-motion): vẽ ở góc phải-trên, tràn ra ngoài ~35%
  let hero = '';
  if (emote) {
    const Dpx = sz === 's' ? 15 : sz === 'm' ? 25 : 38;
    const U = (Dpx * vbH) / hpx;
    const cx = crop ? crop[0] + crop[2] - U * 0.2 : 200 - U * 0.2;
    const cy = (crop ? crop[1] : 0) + U * 0.08;
    hero = `<svg class="hero" x="${f(cx - U / 2)}" y="${f(cy - U / 2)}" width="${f(U)}" height="${f(U)}" viewBox="0 0 32 32" style="overflow:visible">${heroMarkup(R.hero)}</svg>`;
  }
  const style =
    `--h:${hpx}px;--sw:${sw};--amp:${amp};--T:${R.T}s;--blink:${a.blink || '4s'};--bdelay:${f((Number.parseFloat(a.bdelay ?? '') || 0) - (o.fixedPhase ? 0 : rnd(0, 2.5)))}s;--breath:${a.breath || '3.4s'};--phase:${f((Number.parseFloat(a.phase ?? '') || 0) - (o.fixedPhase ? 0 : rnd(0, 3)))}s;` +
    (o.roleColor ? `--rc:${o.roleColor};` : '') +
    armVars(C.P, C.spec.cover);
  const s =
    `<svg class="chb" xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${wpx}" height="${hpx}" role="img" aria-label="${esc(o.label ?? C.spec.name)}"` +
    ` data-chb-c="${id}" data-chb-s="${st}"${variant ? ` data-chb-v="${variant}"` : ''}${variant && !o.variant ? ' data-chb-auto="1"' : ''} data-chb-m="${R.m.join(' ')}" data-chb-sz="${sz}"${big ? '' : ' data-chb-sm="1"'} data-chb-eyes="${face.eyes}" data-chb-mouth="${face.mouth}" data-chb-brow="${face.brow}" data-chb-face="${face.face}" data-chb-em="${face.em}"` +
    ` style="${style}">` +
    `<ellipse class="shadow" cx="100" cy="237" rx="64" ry="4.5" opacity=".3"/>` +
    fig +
    hero +
    `<rect class="clk" width="1" height="1" opacity="0"/></svg>`;
  return nsMarkup(s);
}
