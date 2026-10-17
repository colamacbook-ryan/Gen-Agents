// Bộ phận đầu thay được: dáng mặt, mắt, mày, miệng, râu (bản vẽ SVG dạng chuỗi). Tên khoá = danh sách đóng trong params.ts.
import { f, lite, mix, shade } from '../color.ts';
import type { BeardName, BrowName, EyeName, FaceName, MouthName, Params } from '../params.ts';

export interface EyeDef {
  rx: number;
  ry: number;
  tilt: number;
  dot?: true;
}

export const FACES: Record<FaceName, string> = {
  round: 'M52 64 C52 37 74 28 100 28 C126 28 148 37 148 64 C148 90 128 107 100 107 C72 107 52 90 52 64Z',
  square:
    'M52 62 C52 38 74 29 100 29 C126 29 148 38 148 62 L148 80 C148 97 136 107 120 107 L80 107 C64 107 52 97 52 80Z',
  oval: 'M54 62 C54 36 76 28 100 28 C124 28 146 36 146 62 C146 88 128 108 100 109 C72 108 54 88 54 62Z',
};
export const ROBE =
  'M61 110 C57 148 49 188 45 222 C72 233 128 233 155 222 C151 188 143 148 139 110 C123 118 77 118 61 110Z';
export const EYE_Y = 72;
export const BROW_Y = 55;
export const MOUTH_Y = 96;
export const EYES: Record<EyeName, EyeDef> = {
  round: { rx: 9, ry: 11.5, tilt: 0 },
  big: { rx: 10.5, ry: 12.5, tilt: 0 },
  phoenix: { rx: 10.5, ry: 6.6, tilt: 12 },
  sharp: { rx: 9.5, ry: 8, tilt: 13 },
  slit: { rx: 10.5, ry: 5.6, tilt: 16 },
  ring: { rx: 11, ry: 11.5, tilt: 0 },
  small: { rx: 7, ry: 8, tilt: 0 },
  dot: { rx: 5.4, ry: 6, tilt: 0, dot: true },
};

export function eye(cx: number, s: number, e: EyeDef, p: Params): string {
  // s=+1 trái, -1 phải (gương); cục bộ: mắt trong ở +x
  if (e.dot)
    return `<g transform="translate(${cx} ${EYE_Y})"><g class="eye"><g class="pose"><circle r="5.6" fill="${p.ink}" stroke="none"/><circle cx="1.8" cy="-2" r="1.7" fill="#fff" stroke="none"/></g></g></g>`;
  const { rx, ry, tilt } = e,
    hl = Math.min(3.4, ry * 0.34),
    fl = p.liner ? 8.5 : 4.5;
  return (
    `<g transform="translate(${cx} ${EYE_Y})${s < 0 ? ' scale(-1 1)' : ''}"><g class="eye"><g class="pose"><g transform="rotate(${tilt})">` +
    (p.sclera ? `<ellipse rx="${rx + 1.4}" ry="${ry + 1.4}" fill="#fff"/>` : '') +
    `<ellipse rx="${f(p.sclera ? rx * 0.74 : rx)}" ry="${f(p.sclera ? ry * 0.74 : ry)}" fill="${p.iris}" stroke="none"/>` +
    `<ellipse cy="${f(ry * 0.36)}" rx="${f(rx * 0.6)}" ry="${f(ry * 0.36)}" fill="${mix(p.iris, p.glow, 0.62)}" stroke="none"/>` +
    `<circle cx="${f(rx * 0.26)}" cy="${f(-ry * 0.3)}" r="${f(hl)}" fill="#fff" stroke="none"/>` +
    `<circle cx="${f(-rx * 0.3)}" cy="${f(ry * 0.36)}" r="${f(hl * 0.45)}" fill="#fff" stroke="none"/>` +
    (p.eyeRing
      ? `<ellipse rx="${rx + 4.6}" ry="${ry + 4.6}" fill="none" stroke="${p.eyeRing}" data-part="eye-ring" style="stroke-width:2.8px"/>`
      : '') +
    `<path d="M${-rx} ${f(-ry * 0.25)} L${f(-rx - fl)} ${f(-ry * 0.25 - (p.liner ? 5.5 : 4))}" stroke="${p.ink}" style="stroke-width:calc(var(--sw,3.4) * ${p.liner ? 1.15 : 0.8})"/>` +
    `<path d="M${-rx} ${f(-ry * 0.25)} Q0 ${f(-ry * 1.5)} ${rx} ${f(-ry * 0.25)}" fill="none" stroke="${p.ink}" style="stroke-width:calc(var(--sw,3.4) * ${p.liner ? 1.15 : 0.9})"/>` +
    `</g></g></g></g>`
  );
}
export const BROWS: Record<BrowName, (c: string) => string> = {
  soft: (c: string) => `<path d="M-10 2 Q0 -5 10 -0.5" fill="none" stroke="${c}" style="stroke-width:3.2px"/>`,
  thin: (c: string) => `<path d="M-9 2 Q0 -3.4 9 -0.5" fill="none" stroke="${c}" style="stroke-width:2px"/>`,
  thick: (c: string) =>
    `<path d="M12 3.5 Q-1 1 -15 -6.5 Q0 -9 12 -2Z" fill="${c}" stroke="${c}" style="stroke-width:2px"/>`,
  sharp: (c: string) =>
    `<path d="M-13 -6 L11 3" fill="none" stroke="${c}" style="stroke-width:4.4px" stroke-linecap="butt"/>`,
  swept: (c: string) =>
    `<path d="M12 3.5 Q-2 -2 -20 -14 Q-4 -10 12 -2.5Z" fill="${c}" stroke="${c}" style="stroke-width:2px"/>`,
  silk: (c: string) =>
    `<path d="M-15 1 C-13 -7 -2 -9 6 -6 C10 -4.6 12 -1.5 12.5 1.8 C6 -2 -4 -2.6 -15 1Z" fill="${c}" stroke="${c}" style="stroke-width:2px"/>`,
  curl: (c: string) =>
    `<path d="M13 4 C4 0 -8 -4 -14 -10 C-18 -14 -12 -20 -8 -15 C-12 -12 -8 -8 -2 -6 C4 -4 10 -3 13 -2Z" fill="${c}" stroke="${c}" style="stroke-width:1.6px"/>`,
  wisp: (c: string) =>
    `<path d="M12 2 Q-2 -3 -22 4 Q-2 -1 12 -1.5Z" fill="${c}" stroke="${c}" style="stroke-width:1.8px"/>`,
};
export const MOUTHS: Record<MouthName, string> = {
  smile: `<path d="M-8 -1 Q0 7 8 -1" fill="none"/>`,
  calm: `<path d="M-6 0 Q0 3 6 0" fill="none"/>`,
  smirk: `<path d="M-8 2 Q0 5 9 -4" fill="none"/>`,
  small: `<path d="M-4 0 Q0 3 4 0" fill="none"/>`,
};
export const BEARDS: Record<BeardName, (p: Params) => string> = {
  none: () => '',
  short: (p: Params) =>
    `<g data-part="beard-short"><path d="M100 90 C93 86 85 88 81 94 C88 92 94 93 100 92 C106 93 112 92 119 94 C115 88 107 86 100 90Z" fill="${p.beardColor}"/>` +
    `<path d="M93 101 C94 108 97 112 100 113 C103 112 106 108 107 101 C103 103 97 103 93 101Z" fill="${p.beardColor}"/></g>`,
  long2: (p: Params) =>
    `<path d="M100 89 C92 85 83 88 79 95 C87 92 94 93 100 92 C106 93 113 92 121 95 C117 88 108 85 100 89Z" fill="${p.beardColor}"/>` +
    `<g class="beard-sway" data-part="beard-long" data-locks="1"><path d="M56 76 C54 96 66 108 82 109 L84 138 C84 154 91 166 100 176 C109 166 116 154 116 138 L118 109 C134 108 146 96 144 76 C140 92 134 102 120 103 C110 107 90 107 80 103 C66 102 60 92 56 76Z" fill="${p.beardColor}"/>` +
    `<path class="dt" d="M92 116 C91 134 94 152 99 166 M108 116 C109 134 106 152 101 166" fill="none" stroke="${p.beardColor === '#1C171F' ? lite(p.beardColor, 0.2) : shade(p.beardColor, 0.25)}" style="stroke-width:1.5px"/></g>` +
    `<g class="beard-tangle fx"></g>`,
  long: (p: Params) =>
    `<path d="M100 89 C92 85 83 88 79 95 C87 92 94 93 100 92 C106 93 113 92 121 95 C117 88 108 85 100 89Z" fill="${p.beardColor}"/>` +
    `<g class="beard-sway" data-part="beard-long" data-locks="3"><path d="M54 74 C52 94 64 108 80 110 L78 148 C78 168 84 182 90 190 C93 180 96 172 100 194 C104 172 107 180 110 190 C116 182 122 168 122 148 L120 110 C136 108 148 94 146 74 C142 90 134 100 120 102 C110 106 90 106 80 102 C66 100 58 90 54 74Z" fill="${p.beardColor}"/>` +
    `<path class="dt" d="M88 116 C86 140 88 160 91 176 M100 114 C99 140 100 166 100 184 M112 116 C114 140 112 160 109 176" fill="none" stroke="${lite(p.beardColor, 0.2)}" style="stroke-width:1.5px"/></g>` +
    `<g class="beard-tangle fx"><path d="M54 74 C52 94 64 108 80 110 L72 138 L84 148 L70 168 L88 172 L80 194 L98 182 L104 200 L113 178 L130 192 L122 168 L136 160 L120 146 L128 128 L120 110 C136 108 148 94 146 74 C142 90 134 100 120 102 C110 106 90 106 80 102 C66 100 58 90 54 74Z" fill="${p.beardColor}"/>` +
    `<path d="M72 150 Q58 146 55 158 Q62 164 70 158 M128 148 Q143 142 147 154 Q140 162 131 156 M92 176 Q86 188 96 190" fill="none" stroke="${p.beardColor}" style="stroke-width:3.2px"/></g>`,
  tiger: (p: Params) =>
    `<g class="beard-sway" data-part="beard-tiger"><path d="M100 90 L92 85 L86 90 L79 83 L75 92 L66 87 L71 98 L61 98 L72 104 L66 114 L78 108 L84 118 L92 110 L100 120 L108 110 L116 118 L122 108 L134 114 L128 104 L139 98 L129 98 L134 87 L125 92 L121 83 L114 90 L108 85Z" fill="${p.beardColor}"/>` +
    `<path d="M56 78 L44 86 L54 90 L45 100 L58 96 L56 108 L66 98 L66 86Z M144 78 L156 86 L146 90 L155 100 L142 96 L144 108 L134 98 L134 86Z" fill="${p.beardColor}"/></g>`,
};
