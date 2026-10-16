// Biến góc tay + hướng đạo cụ: tính từ tham số tay (armL / armR) một lần cho mỗi SVG, dùng trong keyframes (var(--chb-outR)...).
import { f } from './color.ts';
import type { Params, Vec2 } from './params.ts';

/** vị trí tay đưa tới khi che mặt (coverTarget) + góc quay đạo cụ lúc đó (coverHeld); đặt theo từng nhân vật khi cần */
export interface Cover {
  target?: Vec2;
  propAngle?: number;
}

/* ================= biến góc tay + hướng đạo cụ (tính từ tham số, dùng cho keyframes) ================= */
const deg = (r: number): number => (r * 180) / Math.PI;
const norm = (a: number): number => ((a % 360) + 360) % 360;
const angOf = (d: Vec2): number => deg(Math.atan2(d[1], d[0]));
const shortD = (a: number, b: number): number => {
  const d = norm(b - a);
  return d > 180 ? d - 360 : d;
};
const cwD = (a: number, b: number): number => norm(b - a);
const ccwD = (a: number, b: number): number => -norm(a - b);
const toward = (S: Vec2, T: Vec2): number => deg(Math.atan2(T[1] - S[1], T[0] - S[0]));
export function armVars(P: Params, cv: Cover | undefined): string {
  const p = P;
  const aL = angOf(p.armL),
    aR = angOf(p.armR);
  const SL: Vec2 = [66, 119];
  const SR: Vec2 = [134, 119];
  const lenL = Math.hypot(...p.armL) + 7;
  const lenR = Math.hypot(...p.armR) + 7;
  const dl = p.holdL ? 0 : 1,
    dr = p.holdR ? 0 : 1,
    kL = p.lockL ? 0 : 1,
    kR = p.lockR ? 0 : 1;
  const sh = p.holdL || p.holdR ? 0.35 : 1;
  const v = {
    cheerL: cwD(aL, 235) * kL,
    cheerR: ccwD(aR, 305) * kR,
    outL: 38 * kL,
    outR: -38 * kR,
    limpL: shortD(aL, 98) * dl * kL,
    limpR: shortD(aR, 82) * dr * kR,
    chestL: shortD(aL, toward(SL, [96, 150])) * dl * kL,
    chestR: shortD(aR, toward(SR, [104, 150])) * dr * kR,
    shockL: shortD(aL, toward(SL, [70, 84])) * sh * kL,
    shockR: shortD(aR, toward(SR, [130, 84])) * sh * kR,
    writeR: shortD(aR, 106) * kR,
    coverL: shortD(aL, toward(SL, [100, 100])) * kL,
    coverR: shortD(aR, toward(SR, cv?.target ?? [104, 99])) * kR,
    coverH: cv?.propAngle ?? -78,
    foreheadR: shortD(aR, toward(SR, [112, 46])) * kR,
    reachL: shortD(aL, toward(SL, [14, 134])) * kL,
    pointL: cwD(aL, 172) * kL,
    chinR: shortD(aR, toward(SR, [104, 108])) * kR,
    scratchR: shortD(aR, toward(SR, [132, 38])) * kR,
    aimR: shortD(aR, toward(SR, [146, 76])) * kR,
    prayL: shortD(aL, toward(SL, [99, 113])) * dl * kL,
    prayR: shortD(aR, toward(SR, [101, 113])) * dr * kR,
    coverLF: shortD(aL, toward(SL, [100, 100])),
    wipeL: shortD(aL, toward(SL, [82, 76])) * kL,
    eatR: shortD(aR, toward(SR, [102, 100])) * kR,
    reachDownR: shortD(aR, 90) * kR,
  };
  const num = { wipeK: Math.min(1.4, 44 / lenL), eatK: Math.min(1, 36 / lenR) };
  return (
    Object.entries(v)
      .map(([k, x]) => `--${k}:${f(x)}deg`)
      .join(';') +
    ';' +
    Object.entries(num)
      .map(([k, x]) => `--${k}:${f(x)}`)
      .join(';') +
    ';--flail:55deg'
  );
}
