// Họ keyframes của TAY: dữ liệu thuần (biểu thức CSS gốc của từng khung) + bộ sinh CSS.
//
// Vì sao không animate biến góc tay (@property) như spike: biến kế thừa (inherits:true) animate trên phần tử tay làm Blink tính lại
// style của MỌI phần tử con (tay áo, bàn tay, đạo cụ cầm tay, cọ, tay áo nước) mỗi khung. Ở đây tay animate trực tiếp thuộc tính
// `rotate` + `scale` (họ thuộc tính transform) trên chính phần tử tay; các phần tử con cần quay NGƯỢC theo góc tay (đạo cụ cầm
// tay giữ hướng, cọ, tay áo nước buông theo trọng lực) chạy keyframes riêng sinh từ cùng dữ liệu. Không còn @property, không còn
// animate biến tuỳ ý.
//
// Mỗi họ X (vd k-ar-run) sinh ra:
//   X-L / X-R   keyframes của phần tử .arm-L / .arm-R: rotate + scale
//   X-cL / X-cR  quay ngược góc tay (rotate: -góc) cho con của tay: .held, .brush, .ribw
//   X-hR         góc đạo cụ riêng (--hR) cho .held-h (lồng trong .held), chỉ họ nào có --hR
// Chỉ thị trong CSS_MOTION:  "@arm <tiền tố selector> | <họ> | <thời gian + easing>"  và  "@armnone <tiền tố selector> | R".

export interface ArmFrame {
  /** bộ chọn khung CSS: "0%,12%", "from", "to" */
  at: string;
  raL?: string;
  raR?: string;
  kL?: string;
  kR?: string;
  hR?: string;
}

export const ARM_FAMILIES: Record<string, ArmFrame[]> = {
  'k-ar-run': [
    { at: '0%,100%', raL: 'calc(var(--flail) * -1)', raR: 'var(--flail)' },
    { at: '50%', raL: 'var(--flail)', raR: 'calc(var(--flail) * -1)' },
  ],
  'k-ar-wait': [
    { at: 'from', raL: 'calc(var(--prayL) - 9deg)', raR: 'calc(var(--prayR) + 9deg)', hR: '62deg' },
    { at: 'to', raL: 'calc(var(--prayL) + 7deg)', raR: 'calc(var(--prayR) - 7deg)', hR: '62deg' },
  ],
  'k-ar-reward': [
    { at: 'from', raL: 'calc(var(--chestL) - 10deg)', raR: 'calc(var(--chestR) + 10deg)' },
    { at: 'to', raL: 'calc(var(--chestL) + 9deg)', raR: 'calc(var(--chestR) - 9deg)' },
  ],
  'k-ar-penalty': [
    { at: 'from', raL: 'calc(var(--outL) * 1.6)', raR: 'var(--limpR)' },
    { at: 'to', raL: 'var(--limpL)', raR: 'calc(var(--outR) * 1.6)' },
  ],
  'k-ar-rank1': [
    { at: '0%,12%,100%', raR: '0deg' },
    { at: '22%,90%', raR: 'calc(var(--outR) * .55)' },
  ],
  'k-ar-quota': [
    { at: '0%', raL: 'calc(var(--limpL) - 5deg)', raR: 'calc(var(--outR) * 1.35)' },
    { at: '25%', raR: 'calc(var(--outR) * 1.95)' },
    { at: '33%', raL: 'calc(var(--limpL) + 7deg)' },
    { at: '50%', raR: 'calc(var(--outR) * 1.35)' },
    { at: '66%', raL: 'calc(var(--limpL) - 5deg)' },
    { at: '75%', raR: 'calc(var(--outR) * 1.95)' },
    { at: '100%', raL: 'calc(var(--limpL) - 5deg)', raR: 'calc(var(--outR) * 1.35)' },
  ],
  'k-ar-failover': [
    { at: 'from', raL: 'calc(var(--outL) * 1.7)', raR: 'calc(var(--outR) * .6)' },
    { at: 'to', raL: 'calc(var(--outL) * .6)', raR: 'calc(var(--outR) * 1.7)' },
  ],
  'k-ar-error': [
    { at: 'from', raL: 'calc(var(--outL) * .5)', raR: 'calc(var(--outR) * .9)' },
    { at: 'to', raL: 'calc(var(--outL) * .95)', raR: 'calc(var(--outR) * .45)' },
  ],
  'k-cover-lf': [
    { at: '0%,46%', raL: '0deg' },
    { at: '50%', raL: 'calc(var(--coverLF) * -.12)' },
    { at: '57%', raL: 'calc(var(--coverLF) * 1.06)' },
    { at: '61%,79%', raL: 'var(--coverLF)' },
    { at: '86%,100%', raL: '0deg' },
  ],
  'k-ar-rest': [
    { at: 'from', raR: 'calc(var(--writeR) - 8deg)', raL: 'var(--limpL)' },
    { at: 'to', raR: 'calc(var(--writeR) + 8deg)', raL: 'var(--limpL)' },
  ],
  'k-ar-sleep': [{ at: '0%,100%', raL: 'var(--limpL)', raR: 'var(--limpR)' }],
  'k-cover-r': [
    { at: '0%,52%', raR: '0deg', hR: '0deg' },
    { at: '56%', raR: '14deg', hR: '0deg' },
    { at: '64%', raR: 'calc(var(--coverR) * 1.06)', hR: 'calc(var(--coverH) * 1.12)' },
    { at: '68%,87%', raR: 'var(--coverR)', hR: 'var(--coverH)' },
    { at: '94%,100%', raR: '0deg', hR: '0deg' },
  ],
  'k-cover-l': [
    { at: '0%,46%', raL: '0deg' },
    { at: '50%', raL: 'calc(var(--coverL) * -.12)' },
    { at: '57%', raL: 'calc(var(--coverL) * 1.06)' },
    { at: '61%,79%', raL: 'var(--coverL)' },
    { at: '86%,100%', raL: '0deg' },
  ],
  'k-ar-startle': [
    { at: '0%,46%', raL: 'var(--limpL)', raR: 'var(--limpR)', hR: '0deg' },
    { at: '50%', raL: 'calc(var(--outL) * 1.3)', raR: 'calc(var(--outR) * 1.5)', hR: '-20deg' },
    { at: '54%', hR: '-80deg' },
    { at: '58%', hR: '90deg' },
    { at: '62%', hR: '-80deg' },
    { at: '66%', hR: '90deg' },
    { at: '70%', hR: '-30deg', raR: 'calc(var(--outR) * 1.5)' },
    { at: '76%,100%', raL: 'var(--limpL)', raR: 'var(--limpR)', hR: '0deg' },
  ],
  'k-ar-thunder': [
    { at: '0%', raR: '0deg', kR: '1' },
    { at: '8%', raR: 'var(--eatR)', kR: 'var(--eatK)' },
    { at: '14%', raR: '0deg', kR: '1' },
    { at: '22%', raR: 'var(--eatR)', kR: 'var(--eatK)' },
    { at: '28%,36%', raR: '0deg', kR: '1' },
    { at: '39%', raR: 'calc(var(--outR) * 1.6)', kR: '1' },
    { at: '44%', raR: 'calc(var(--outR) * 1.1)' },
    { at: '52%,66%', raR: 'var(--reachDownR)' },
    { at: '74%,100%', raR: '0deg', kR: '1' },
  ],
  'k-wipe': [
    { at: 'from', raL: 'calc(var(--wipeL) - 6deg)', kL: 'var(--wipeK)' },
    { at: 'to', raL: 'calc(var(--wipeL) + 6deg)', kL: 'var(--wipeK)' },
  ],
  'k-beat': [
    { at: 'from', raL: 'calc(var(--chestL) - 8deg)', raR: 'calc(var(--chestR) + 14deg)', kL: '1.05', kR: '1' },
    { at: 'to', raL: 'calc(var(--chestL) + 12deg)', raR: 'calc(var(--chestR) - 6deg)', kL: '1', kR: '1.05' },
  ],
  'k-ar-swoon': [
    { at: '0%', raR: '0deg' },
    { at: '12%', raR: 'calc(var(--foreheadR) * 1.1)' },
    { at: '20%,56%', raR: 'var(--foreheadR)' },
    { at: '68%,100%', raR: '0deg' },
  ],
  'k-ar-swing': [
    { at: '0%,34%', raR: '0deg', hR: '0deg' },
    { at: '40%', raR: 'calc(var(--outR) * 1.2)', hR: '-60deg' },
    { at: '48%', hR: '75deg' },
    { at: '56%', hR: '-60deg' },
    { at: '64%', hR: '75deg' },
    { at: '72%', hR: '20deg', raR: 'var(--outR)' },
    { at: '82%,100%', raR: '0deg', hR: '0deg' },
  ],
  'k-ar-pulse': [
    { at: '0%,24%', raL: '0deg', kL: '1' },
    { at: '30%', raL: 'calc(var(--reachL) * 1.08)', kL: '1.04' },
    { at: '34%,74%', raL: 'var(--reachL)', kL: '1' },
    { at: '38%', raL: 'calc(var(--reachL) + 2deg)' },
    { at: '42%', raL: 'calc(var(--reachL) - 2deg)' },
    { at: '46%', raL: 'calc(var(--reachL) + 2deg)' },
    { at: '50%', raL: 'calc(var(--reachL) - 2deg)' },
    { at: '54%', raL: 'calc(var(--reachL) + 2deg)' },
    { at: '58%', raL: 'calc(var(--reachL) - 2deg)' },
    { at: '62%', raL: 'calc(var(--reachL) + 2deg)' },
    { at: '66%', raL: 'calc(var(--reachL) - 2deg)' },
    { at: '82%', raL: '0deg', kL: '1' },
    { at: '100%', raL: '0deg', kL: '1' },
  ],
  'k-ar-crane': [
    { at: '0%,12%', raL: '0deg', raR: '0deg', kL: '1', kR: '1' },
    { at: '24%', raL: 'calc(var(--outL) * 2.3)', raR: 'calc(var(--outR) * 2.3)', kL: '1.2', kR: '1.2' },
    { at: '32%', raL: 'calc(var(--outL) * 1.6)', raR: 'calc(var(--outR) * 1.6)' },
    { at: '40%', raL: 'calc(var(--outL) * 2.3)', raR: 'calc(var(--outR) * 2.3)' },
    { at: '48%', raL: 'calc(var(--outL) * 1.6)', raR: 'calc(var(--outR) * 1.6)' },
    { at: '56%', raL: 'calc(var(--outL) * 2.3)', raR: 'calc(var(--outR) * 2.3)' },
    { at: '64%', raL: 'calc(var(--outL) * 1.6)', raR: 'calc(var(--outR) * 1.6)' },
    { at: '72%', raL: 'calc(var(--outL) * 2.3)', raR: 'calc(var(--outR) * 2.3)' },
    { at: '86%,100%', raL: '0deg', raR: '0deg', kL: '1', kR: '1' },
  ],
  'k-ar-salute': [
    { at: '0%,32%', raR: '0deg', kR: '1' },
    { at: '40%', raR: 'calc(var(--foreheadR) * 1.1)', kR: '1.4' },
    { at: '46%,62%', raR: 'var(--foreheadR)', kR: '1.3' },
    { at: '76%', raR: 'calc(var(--foreheadR) * .5)', kR: '1.1' },
    { at: '86%,100%', raR: '0deg', kR: '1' },
  ],
  'k-ar-commit': [
    { at: '0%,100%', raR: 'calc(var(--cheerR) * .88)', raL: 'calc(var(--chestL) - 8deg)' },
    { at: '25%', raL: 'calc(var(--chestL) + 10deg)' },
    { at: '50%', raR: 'calc(var(--cheerR) * 1.1)', raL: 'calc(var(--chestL) - 8deg)' },
    { at: '75%', raL: 'calc(var(--chestL) + 10deg)' },
  ],
  'k-ar-chin': [
    { at: 'from', raR: 'calc(var(--chinR) - 4deg)' },
    { at: 'to', raR: 'calc(var(--chinR) + 5deg)' },
  ],
  'k-ar-unsure': [
    { at: '0%,6%', raL: '0deg', raR: '0deg' },
    { at: '12%', raR: 'var(--scratchR)', raL: 'calc(var(--chestL) * .8)' },
    { at: '16%,28%,40%', raR: 'calc(var(--scratchR) + 7deg)' },
    { at: '20%,32%,36%', raR: 'calc(var(--scratchR) - 7deg)' },
    { at: '24%', raR: 'calc(var(--scratchR) + 7deg)' },
    { at: '48%', raL: 'var(--chestL)', raR: 'var(--chestR)' },
    { at: '54%,66%,78%', raL: 'calc(var(--chestL) + 6deg)', raR: 'calc(var(--chestR) - 6deg)' },
    { at: '60%,72%', raL: 'calc(var(--chestL) - 6deg)', raR: 'calc(var(--chestR) + 6deg)' },
    { at: '90%', raL: 'calc(var(--chestL) * .6)', raR: 'calc(var(--chestR) * .6)' },
    { at: '100%', raL: '0deg', raR: '0deg' },
  ],
  'k-ar-drink': [
    { at: '0%', raR: 'var(--limpR)', raL: 'calc(var(--limpL) - 6deg)' },
    { at: '12%', raR: 'var(--limpR)' },
    { at: '25%', raL: 'calc(var(--limpL) + 10deg)' },
    { at: '30%,56%', raR: 'var(--eatR)' },
    { at: '50%', raL: 'calc(var(--limpL) - 6deg)' },
    { at: '70%,100%', raR: 'var(--limpR)' },
    { at: '75%', raL: 'calc(var(--limpL) + 10deg)' },
    { at: '100%', raL: 'calc(var(--limpL) - 6deg)' },
  ],
  'k-ar-game': [
    { at: 'from', raL: 'calc(var(--chestL) - 4deg)', raR: 'calc(var(--chestR) + 3deg)' },
    { at: 'to', raL: 'calc(var(--chestL) + 4deg)', raR: 'calc(var(--chestR) - 3deg)' },
  ],
  'k-ar-discover': [
    { at: '0%,14%', raL: '0deg', raR: '0deg', kL: '1' },
    { at: '16%', raL: 'calc(var(--chestL) * .6)', raR: 'calc(var(--chestR) * .6)' },
    { at: '21%', raL: 'calc(var(--pointL) * 1.1)', raR: 'calc(var(--aimR) * 1.1)', kL: '1.25' },
    { at: '28%,34%,40%,46%,52%,60%', raL: 'var(--pointL)', raR: 'var(--aimR)', kL: '1.2' },
    { at: '31%,43%,55%', raR: 'calc(var(--aimR) + 4deg)' },
    { at: '37%,49%', raR: 'calc(var(--aimR) - 4deg)' },
    { at: '70%,100%', raL: '0deg', raR: '0deg', kL: '1' },
  ],
  'k-ar-point': [
    { at: '0%,22%', raL: '0deg', kL: '1' },
    { at: '28%', raL: 'calc(var(--pointL) * 1.08)', kL: '1.22' },
    { at: '34%,70%', raL: 'var(--pointL)', kL: '1.2' },
    { at: '38%', raL: 'calc(var(--pointL) + 5deg)' },
    { at: '46%', raL: 'calc(var(--pointL) - 4deg)' },
    { at: '54%', raL: 'calc(var(--pointL) + 5deg)' },
    { at: '62%', raL: 'calc(var(--pointL) - 4deg)' },
    { at: '78%,100%', raL: '0deg', kL: '1' },
  ],
  'k-ar-slip': [
    { at: '0%,38%', raR: '0deg', kR: '1' },
    { at: '46%', raR: 'calc(var(--foreheadR) * 1.1)', kR: '1.4' },
    { at: '52%,58%', raR: 'var(--foreheadR)', kR: '1.3' },
    { at: '64%', raR: 'calc(var(--foreheadR) - 8deg)' },
    { at: '74%,100%', raR: '0deg', kR: '1' },
  ],
};

type Side = 'L' | 'R';
const rotKey = (s: Side): 'raL' | 'raR' => (s === 'L' ? 'raL' : 'raR');
const scaleKey = (s: Side): 'kL' | 'kR' => (s === 'L' ? 'kL' : 'kR');

const block = (name: string, rows: string[]): string => `@keyframes ${name}{${rows.join(' ')}}`;

/** các khung có một trong các khoá cho trước, dạng "<at>{ <khai báo> }" */
function rows(frames: ArmFrame[], decl: (f: ArmFrame) => string[]): string[] {
  const out: string[] = [];
  for (const f of frames) {
    const d = decl(f);
    if (d.length) out.push(`${f.at}{ ${d.join('; ')} }`);
  }
  return out;
}

/** họ này có animate tay bên s không */
export const hasSide = (family: string, s: Side): boolean =>
  (ARM_FAMILIES[family] ?? []).some((f) => f[rotKey(s)] !== undefined || f[scaleKey(s)] !== undefined);
const hasHeld = (family: string): boolean => (ARM_FAMILIES[family] ?? []).some((f) => f.hR !== undefined);

/** toàn bộ @keyframes của tay (đặt trong @media no-preference) */
export function armKeyframes(): string {
  const out: string[] = [];
  for (const [name, frames] of Object.entries(ARM_FAMILIES)) {
    for (const s of ['L', 'R'] as const) {
      if (!hasSide(name, s)) continue;
      const ra = rotKey(s);
      const k = scaleKey(s);
      out.push(
        block(
          `${name}-${s}`,
          rows(frames, (f) => [...(f[ra] ? [`rotate:${f[ra]}`] : []), ...(f[k] ? [`scale:${f[k]}`] : [])]),
        ),
      );
      if (frames.some((f) => f[ra] !== undefined)) {
        out.push(
          block(
            `${name}-c${s}`,
            rows(frames, (f) => (f[ra] ? [`rotate:calc(-1 * (${f[ra]}))`] : [])),
          ),
        );
      }
    }
    if (hasHeld(name))
      out.push(
        block(
          `${name}-hR`,
          rows(frames, (f) => (f.hR ? [`rotate:${f.hR}`] : [])),
        ),
      );
  }
  return out.join('\n');
}

/** luật animation của tay + của các phần tử con cần quay ngược */
function armRules(prefix: string, family: string, timing: string): string {
  if (!ARM_FAMILIES[family]) throw new Error(`họ keyframes tay không có: ${family}`);
  const out: string[] = [];
  for (const s of ['L', 'R'] as const) {
    if (!hasSide(family, s)) continue;
    const arm = `${prefix} .arm-${s}`;
    out.push(`${arm}{ animation:${family}-${s} ${timing} }`);
    const ra = rotKey(s);
    if ((ARM_FAMILIES[family] ?? []).some((f) => f[ra] !== undefined)) {
      const kids = s === 'R' ? ['.held', '.brush', '.ribw'] : ['.ribw'];
      out.push(`${kids.map((c) => `${arm} ${c}`).join(',')}{ animation:${family}-c${s} ${timing} }`);
    }
    if (s === 'R' && hasHeld(family)) out.push(`${arm} .held-h{ animation:${family}-hR ${timing} }`);
  }
  return out.join('\n');
}

/** tắt animation của tay bên s (và các con quay ngược) khi một token khác chiếm tay đó */
function armNone(prefix: string, s: Side): string {
  const arm = `${prefix} .arm-${s}`;
  const kids = s === 'R' ? ['.held', '.held-h', '.brush', '.ribw'] : ['.ribw'];
  return `${arm}{ animation:none }\n${kids.map((c) => `${arm} ${c}`).join(',')}{ animation:none }`;
}

/** thay các dòng chỉ thị @arm / @armnone trong CSS_MOTION bằng luật thật (giữ nguyên thứ tự, vì thứ tự quyết định ưu tiên) */
export function expandArm(css: string): string {
  return css
    .split('\n')
    .map((line) => {
      const a = /^@arm (.+?) \| (k-[\w-]+) \| (.+)$/.exec(line);
      if (a) return armRules(a[1] as string, a[2] as string, a[3] as string);
      const n = /^@armnone (.+?) \| (L|R)$/.exec(line);
      if (n) return armNone(n[1] as string, n[2] as Side);
      return line;
    })
    .join('\n');
}
