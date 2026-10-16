// Mặt (các lớp biểu cảm bật / tắt bằng opacity), đầu và ráp nhân vật (nội dung SVG, chưa có thẻ gốc).
import { f, INK, shade, sk } from './color.ts';
import { COIN, CROWN, DROP, EMOMAP, emoFor } from './emotes.ts';
import type { Params } from './params.ts';
import { arm, body } from './parts/body.ts';
import { CAPS } from './parts/caps.ts';
import { BEARDS, BROW_Y, BROWS, EYE_Y, EYES, eye, FACES, MOUTH_Y, MOUTHS } from './parts/head.ts';
import { BACK, CAPE, HELD, isBack, isHeld } from './parts/props.ts';

/** những lớp mặt / emote mà (nhân vật, trạng thái) thực sự dùng — chỉ dựng đúng những gì cần (DOM nhẹ hơn ~3 lần) */
export interface Need {
  em: string[];
  eyes: ReadonlySet<string>;
  mouths: ReadonlySet<string>;
}

/* ================= mặt: các lớp biểu cảm ================= */
function spiral(r: number, turns = 2.6): string {
  let d = '';
  const n = 44;
  for (let i = 0; i <= n; i++) {
    const t = i / n,
      a = t * turns * 2 * Math.PI,
      rr = r * t;
    d += `${(i ? 'L' : 'M') + f(rr * Math.cos(a))} ${f(rr * Math.sin(a))}`;
  }
  return d;
}
const EX2 = [77, 123] as const;
const eyeLayers = (p: Params, small: boolean): string => {
  const L = p.line || p.ink;
  const lid = (cx: number, py: number, off: number): string =>
    `<g transform="translate(${cx} ${EYE_Y})"><ellipse rx="10.5" ry="8" fill="#fff"/><circle cx="${off}" cy="${py}" r="4.7" fill="${p.iris}" stroke="none"/>` +
    `<path d="M-12 -9 H12 V-1.8 Q0 -4.2 -12 -1.8Z" fill="${p.skin}" stroke="none"/><path d="M-11 -1.8 Q0 -4.2 11 -1.8" fill="none" stroke="${p.mask === 'black' ? '#F2EFE8' : p.ink}" ${sk(1)}/></g>`;
  return (
    '' +
    `<g class="ey e-bulge">${[75, 125].map((cx) => `<circle cx="${cx}" cy="70" r="13.5" fill="#fff"/><circle cx="${cx}" cy="70" r="3.2" fill="${p.ink}" stroke="none"/>`).join('')}</g>` +
    `<g class="ey e-xx"><path d="M67 61 L87 72 L67 83 M133 61 L113 72 L133 83" fill="none" stroke="${L}" ${sk(1.15)}/></g>` +
    `<g class="ey e-coin">${EX2.map((cx) => `<g transform="translate(${cx} 71)"><g class="glint">${COIN(12.8)}</g></g>`).join('')}</g>` +
    `<g class="ey e-dog">${EX2.map((cx) => `<g transform="translate(${cx} 72)"><circle r="12.8" fill="#2B1E2A"/><circle cx="-3.6" cy="-4.4" r="4.8" fill="#fff" stroke="none"/><circle cx="4.2" cy="3.6" r="2.3" fill="#fff" stroke="none"/><path d="M-9.4 5 Q0 15 9.4 5 Q0 10 -9.4 5Z" fill="#8FD6FF" stroke="none"/></g>`).join('')}</g>` +
    `<g class="ey e-spiral">${EX2.map((cx) => `<g transform="translate(${cx} 71)"><circle r="12.8" fill="#fff"/><g class="spin"><path d="${spiral(10.4)}" fill="none" stroke="${p.ink}" style="stroke-width:2px"/></g></g>`).join('')}</g>` +
    `<g class="ey e-closed"><path d="M66 71 Q77 80 88 71 M112 71 Q123 80 134 71" fill="none" stroke="${L}" ${sk(1)}/></g>` +
    `<g class="ey e-happy"><path d="M66 78 Q77 62 88 78 M112 78 Q123 62 134 78" fill="none" stroke="${L}" ${sk(1.05)}/></g>` +
    `<g class="ey e-smug">${EX2.map((cx, i) => `<g transform="translate(${cx} 73) rotate(${i ? -7 : 7})"><path d="M-12.5 -4 H12.5 A12.5 12.5 0 0 1 -12.5 -4Z" fill="${L}" style="stroke-width:1.6px"/><path d="M-14.5 -4.4 H14.5" fill="none" stroke="${L}" style="stroke-width:3.2px"/><circle cx="-4.6" cy="2.2" r="2.2" fill="#fff" stroke="none"/></g>`).join('')}</g>` +
    `<g class="ey e-fire">${EX2.map(
      (cx, i) =>
        `<g transform="translate(${cx} 72)"><circle r="11.5" fill="#fff"/><circle cx="${i ? -1 : 1}" r="4.8" fill="${p.ink}" stroke="none"/><circle cx="${i ? -2.4 : -0.4}" cy="-2" r="1.6" fill="#fff" stroke="none"/>` +
        `<g class="flm" style="--i:${i}"><path d="M-10 -9 C-14 -19 -5 -23 -4 -33 C0 -26 5 -24 3 -17 C8 -21 12 -15 10 -9Z" fill="#FF8A1F" style="stroke-width:1.7px"/><path d="M-5 -10 C-7 -16 -2 -19 -1 -24 C2 -20 5 -18 4 -10Z" fill="#FFE45E" stroke="none"/></g></g>`,
    ).join('')}</g>` +
    `<g class="ey e-spring">${EX2.map((cx, i) => {
      const s = i ? 1 : -1;
      return (
        `<g transform="translate(${cx} 72)"><path d="M0 0 l-6 -3 l12 -3 l-12 -3 l12 -3 l-12 -3 l6 -3" fill="none" stroke="#8A8F9C" style="stroke-width:2.6px"/>` +
        `<g class="spg" style="--s:${s}"><circle cx="0" cy="-30" r="15.5" fill="#fff"/><circle cx="${-s * 1.6}" cy="-29" r="4.4" fill="${p.ink}" stroke="none"/><circle cx="${-s * 1.6 + 1.6}" cy="-31.4" r="1.5" fill="#fff" stroke="none"/></g></g>`
      );
    }).join('')}</g>` +
    `<g class="ey e-sideL">${lid(77, 0.8, -4.4)}${lid(123, 0.8, -4.4)}</g><g class="ey e-sideR">${lid(77, 0.8, 4.4)}${lid(123, 0.8, 4.4)}</g>` +
    `<g class="ey e-tired">${lid(77, 3.2, 0)}${lid(123, 3.2, 0)}</g>` +
    `<g class="ey e-peek"><path d="M66 71 Q77 80 88 71" fill="none" stroke="${L}" ${sk(1)}/>${lid(123, 0.6, -4.8)}</g>` +
    `<g class="ey e-sob"><path d="M66 70 Q77 80 88 70 M112 70 Q123 80 134 70" fill="none" stroke="${L}" ${sk(1.1)}/>` +
    (small ? [] : [-1, 1])
      .map((s) => {
        const x0 = s < 0 ? 70 : 130,
          d = `M${x0} 80 Q${100 + s * 60} 74 ${100 + s * 90} 106`;
        return (
          `<g class="jet"><path d="${d}" fill="none" stroke="${p.ink}" style="stroke-width:12px"/><path d="${d}" fill="none" stroke="#6FCBF2" style="stroke-width:8px"/><path class="hl" d="${d}" fill="none" stroke="#fff" style="stroke-width:2.2px"/>` +
          `<g transform="translate(${100 + s * 92} 112) scale(.75)"><g class="dr">${DROP}</g></g></g>`
        );
      })
      .join('') +
    `</g>`
  );
};
const mouthLayers = (p: Params): string => {
  const L = p.line || p.ink;
  return (
    '' +
    `<g class="mo m-gape"><path d="M83 91 C83 85 117 85 117 91 C119 108 113 124 100 124 C87 124 81 108 83 91Z" fill="#4A1522"/><path d="M89 115 C91 108 109 108 111 115 C109 122 91 122 89 115Z" fill="#E8707C" stroke="none"/><path d="M87.5 91 H112.5 V95.5 H87.5Z" fill="#fff" stroke="none"/></g>` +
    `<g class="mo m-shout"><path d="M76 88 C76 80 124 80 124 88 C130 112 116 128 100 128 C84 128 70 112 76 88Z" fill="#4A1522"/><path d="M86 118 C89 108 111 108 114 118 C111 126 89 126 86 118Z" fill="#E8707C" stroke="none"/><path d="M82 88 H118 V94 H82Z" fill="#fff" stroke="none"/></g>` +
    `<g class="mo m-laugh"><path d="M79 90 Q100 99 121 90 C122 110 112 120 100 120 C88 120 78 110 79 90Z" fill="#4A1522"/><path d="M89 112 C92 106 108 106 111 112 C108 119 92 119 89 112Z" fill="#E8707C" stroke="none"/><path d="M84 91.6 Q100 98 116 91.6 V96 Q100 101.5 84 96Z" fill="#fff" stroke="none"/></g>` +
    `<g class="mo m-wavy"><path d="M82 100 q4.5 -6 9 0 t9 0 t9 0 t9 0" fill="none" stroke="${p.line || p.ink}" ${sk(0.85)}/></g>` +
    `<g class="mo m-tongue"><path d="M90 96 Q100 101 110 96" fill="none" stroke="${p.line || p.ink}" ${sk(0.8)}/><path d="M94 98.4 C93 114 107 114 106 98.4Z" fill="#F07C8A"/><path class="dt" d="M100 101 V108" stroke="#C4505E" fill="none" style="stroke-width:1.2px"/></g>` +
    `<g class="mo m-clench"><rect x="85" y="90" width="30" height="14" rx="4.5" fill="#fff"/><path d="M92.5 90 V104 M100 90 V104 M107.5 90 V104 M85 97 H115" fill="none" stroke="${p.ink}" style="stroke-width:1.5px"/></g>` +
    `<g class="mo m-chatter"><rect x="84" y="92" width="32" height="11" rx="3.5" fill="#fff"/><path d="M84 97.5 H116 M89 92 V103 M95 92 V103 M101 92 V103 M107 92 V103 M113 92 V103" fill="none" stroke="${p.ink}" style="stroke-width:1.3px"/></g>` +
    `<g class="mo m-o"><ellipse cx="100" cy="100" rx="5.4" ry="7" fill="#4A1522"/></g>` +
    `<g class="mo m-cry"><path d="M77 113 C79 90 121 90 123 113 C111 104 89 104 77 113Z" fill="#4A1522"/><path d="M91 108 C93 102 107 102 109 108 C105 114 95 114 91 108Z" fill="#E8707C" stroke="none"/></g>` +
    `<g class="mo m-wail"><g class="wl"><rect x="76" y="89" width="48" height="36" rx="7" fill="#4A1522"/><rect x="79" y="90.5" width="42" height="8.5" rx="2.5" fill="#fff" stroke="none"/><ellipse cx="100" cy="119.5" rx="15" ry="6.8" fill="#E8707C" stroke="none"/></g></g>` +
    `<g class="mo m-drool"><path d="M78 90 Q100 100 122 90 C124 111 112 121 100 121 C88 121 76 111 78 90Z" fill="#4A1522"/><path d="M88 113 C91 107 109 107 112 113 C108 120 92 120 88 113Z" fill="#E8707C" stroke="none"/><path d="M83 91 Q100 99 117 91 V96 Q100 104 83 96Z" fill="#fff" stroke="none"/>` +
    `<g class="drl"><path d="M118 108 C121 116 120 124 119 132" fill="none" stroke="${INK}" style="stroke-width:7px"/><path d="M118 108 C121 116 120 124 119 132" fill="none" stroke="#CFF1FF" style="stroke-width:3.4px"/><path d="M119 130 C124 136 124 142 119 143 C114 142 114 136 119 130Z" fill="#CFF1FF" style="stroke-width:1.6px"/></g></g>` +
    `<g class="mo m-grovel"><path d="M79 92 Q100 111 121 92" fill="none" stroke="${L}" ${sk(0.95)}/><path class="dt" d="M76 90 l-4 -4 M124 90 l4 -4" fill="none" stroke="${L}" style="stroke-width:1.6px"/><rect x="94.2" y="99.6" width="5.6" height="7.4" rx="1.3" fill="#fff" style="stroke-width:1.4px"/><rect x="100.2" y="99.6" width="5.6" height="7.4" rx="1.3" fill="#fff" style="stroke-width:1.4px"/></g>` +
    `<g class="mo m-hehe"><path d="M79 94 Q89 108 100 97 Q111 108 122 91" fill="none" stroke="${L}" ${sk(0.95)}/><path d="M85 100.4 L88.6 109 L92.4 102.4Z" fill="#fff" style="stroke-width:1.3px"/><path class="dt" d="M124 89 q4 -1 6 -6" fill="none" stroke="${L}" style="stroke-width:1.6px"/></g>` +
    `<g class="mo m-wry"><path d="M80 98 Q89 90 99 98 Q108 105 121 90" fill="none" stroke="${L}" ${sk(0.95)}/><path class="dt" d="M123 88 q3 -1 5 -5" fill="none" stroke="${L}" style="stroke-width:1.6px"/></g>` +
    `<g class="mo m-agape"><path d="M81 90 C74 114 82 146 100 158 C118 146 126 114 119 90 C111 96 89 96 81 90Z" fill="#4A1522"/><path d="M89 140 C92 130 108 130 111 140 C108 152 92 152 89 140Z" fill="#E8707C" stroke="none"/><path d="M85 91 Q100 98 115 91 V97 Q100 104 85 97Z" fill="#fff" stroke="none"/></g>` +
    `<g class="mo m-grin"><path d="M80 91 Q100 110 120 90 Q100 101 80 91Z" fill="#fff"/></g>`
  );
};

/* ---- đầu ---- */
function maskLines(p: Params): string {
  // nét mặt nạ kinh kịch (脸谱): để mặt đọc là MẶT NẠ chứ không phải màu da tô phẳng (research §6.1)
  if (p.mask === 'black') {
    // Trương Phi: mặt đen, mày + viền mắt + hoa văn trán/mũi màu trắng
    const w = '#F2EFE8';
    return (
      `<g data-part="mask-lines"><path d="M57 82 C59 98 78 106 100 106 C122 106 141 98 143 82" fill="none" stroke="${w}" style="stroke-width:2.2px" opacity=".75"/>` +
      `<path d="M100 30 L100 54 M92 36 Q100 48 108 36 M86 44 Q100 54 114 44" fill="none" stroke="${w}" style="stroke-width:2.4px"/>` +
      `<path d="M88 80 Q94 73 100 80 Q106 73 112 80 M91 87 Q100 94 109 87" fill="none" stroke="${w}" style="stroke-width:2.4px"/>` +
      `<path d="M62 74 Q60 88 69 94 M138 74 Q140 88 131 94" fill="none" stroke="${w}" style="stroke-width:2.4px"/></g>`
    );
  }
  const dark = p.mask === 'white' ? p.ink : shade(p.skin, 0.55),
    edge = p.mask === 'white' ? '#B9A98E' : shade(p.skin, 0.5);
  const half =
    `<path d="M60 70 C64 58 78 55 92 62 C82 60 71 62 66 74Z" fill="${dark}" stroke="${dark}" style="stroke-width:1.6px"/>` +
    `<path d="M58 66 L64 70" fill="none" stroke="${dark}" style="stroke-width:2.6px"/>`;
  return (
    `<g data-part="mask-lines"><path d="M57 82 C59 98 78 106 100 106 C122 106 141 98 143 82" fill="none" stroke="${edge}" style="stroke-width:2.2px" opacity=".75"/>` +
    `<path d="M100 64 C99 72 100 79 98.5 85" fill="none" stroke="${dark}" style="stroke-width:2.4px"/>` +
    half +
    `<g transform="translate(200 0) scale(-1 1)">${half}</g>` +
    (p.mask === 'white'
      ? `<path d="M100 44 L100 62" fill="none" stroke="${dark}" style="stroke-width:2.6px"/>`
      : `<circle cx="100" cy="53" r="2.2" fill="${dark}" stroke="none"/>`) +
    `</g>`
  );
}
/** lớp mặt đã tách theo tên, nhớ theo đối tượng tham số (tự hết khi nhân vật bị unregister) */
const layCache = new WeakMap<Params, Map<string, Record<string, string>>>();
function splitLayers(P: Params, key: string, build: () => string, prefix: string): Record<string, string> {
  let per = layCache.get(P);
  if (!per) {
    per = new Map();
    layCache.set(P, per);
  }
  const hit = per.get(key);
  if (hit) return hit;
  const map: Record<string, string> = {};
  for (const part of build().split(prefix).slice(1)) map[part.slice(0, part.indexOf('"'))] = prefix + part;
  per.set(key, map);
  return map;
}
const pickLayers = (map: Record<string, string>, names: ReadonlySet<string>): string =>
  Object.keys(map)
    .filter((k) => names.has(k))
    .map((k) => map[k])
    .join('');
export function eyeSet(p: Params, small: boolean, names: ReadonlySet<string>): string {
  return pickLayers(
    splitLayers(p, `e${small}`, () => eyeLayers(p, small), '<g class="ey e-'),
    names,
  );
}
export function mouthSet(p: Params, names: ReadonlySet<string>): string {
  return pickLayers(
    splitLayers(p, 'm', () => mouthLayers(p), '<g class="mo m-'),
    names,
  );
}
function head(p: Params, small: boolean, need: Need): string {
  const FACE = FACES[p.face],
    s0 = p.skin,
    ear = p.earSkin || s0,
    skS = shade(s0, 0.16),
    L = p.line || p.ink;
  const [capBack, capFront] = CAPS[p.cap](p);
  const sideburn =
    p.beard.startsWith('long') || p.beard === 'tiger' || p.cap === 'sqcap'
      ? ''
      : `<path d="M53 56 C52 68 54 80 58 88 L64 86 C61 76 61 66 63 57Z" fill="${p.hair}"/><path d="M147 56 C148 68 146 80 142 88 L136 86 C139 76 139 66 137 57Z" fill="${p.hair}"/>`;
  const eN = eye(77, 1, EYES[p.eyes], p) + eye(123, -1, EYES[p.eyes], p);
  const bc = p.browColor || p.hair;
  const ears =
    p.ears === 'long'
      ? `<ellipse cx="45" cy="92" rx="9" ry="23" fill="${ear}" transform="rotate(7 45 92)" data-part="ears-long"/><ellipse cx="155" cy="92" rx="9" ry="23" fill="${ear}" transform="rotate(-7 155 92)"/>` +
        `<path class="dt" d="M44 78 Q40 92 45 106 M156 78 Q160 92 155 106" fill="none" stroke="${shade(ear, 0.3)}" style="stroke-width:1.5px"/>`
      : `<circle cx="52" cy="74" r="8" fill="${ear}"/><circle cx="148" cy="74" r="8" fill="${ear}"/>`;
  return (
    `<path d="M47 72 C40 34 66 12 100 12 C134 12 160 34 153 72 C156 92 150 104 142 111 L58 111 C50 104 44 92 47 72Z" fill="${p.hair}"/>` +
    capBack +
    ears +
    `<path data-part="face" data-shape="${p.face}" data-fill="${s0}" d="${FACE}" fill="${s0}"/>` +
    (p.mask
      ? `<path d="M56 88 C64 103 82 108 100 108 C118 108 136 103 144 88 C134 98 118 103 100 103 C82 103 66 98 56 88Z" fill="${p.jawSkin || ear}" stroke="none" data-part="jaw-skin"/>`
      : '') +
    `<path d="M148 66 C148 91 128 107 100 107 C120 104 140 92 144 62Z" fill="${skS}" stroke="none"/>` +
    `<path d="M56 52 Q100 66 144 52 L144 46 L56 46Z" fill="${skS}" stroke="none"/>` +
    `<ellipse cx="65" cy="88" rx="9" ry="5" fill="${p.blush}" opacity="${p.mask === 'black' ? 0.0 : 0.55}" stroke="none"/><ellipse cx="135" cy="88" rx="9" ry="5" fill="${p.blush}" opacity="${p.mask === 'black' ? 0.0 : 0.55}" stroke="none"/>` +
    `<path d="M98 83 Q100 86 102 83" fill="none" stroke="${p.mask === 'black' ? '#F2EFE8' : shade(s0, 0.35)}" style="stroke-width:1.8px"/>` +
    `<path class="fx fw" d="${FACE}" fill="${p.whiteFx}" stroke="none"/><path class="fx fr" d="${FACE}" fill="#A31818" stroke="none"/>` +
    (p.mask ? maskLines(p) : '') +
    `<path d="${FACE}" fill="none"/>` +
    `<g class="fx puff"><path d="M58 76 C37 76 37 106 64 101Z" fill="${s0}" stroke="none"/><path d="M58 76 C37 76 37 106 64 101" fill="none"/><path d="M142 76 C163 76 163 106 136 101Z" fill="${s0}" stroke="none"/><path d="M142 76 C163 76 163 106 136 101" fill="none"/>` +
    `<ellipse cx="52" cy="90" rx="6" ry="4" fill="${p.blush}" opacity=".6" stroke="none"/><ellipse cx="148" cy="90" rx="6" ry="4" fill="${p.blush}" opacity=".6" stroke="none"/></g>` +
    `<g class="fx bl" fill="none" stroke="#E4483F" style="stroke-width:2.2px"><path d="M57 81 l5 9 M64 80 l5 9 M71 79 l5 9 M143 81 l-5 9 M136 80 l-5 9 M129 79 l-5 9"/></g>` +
    `<g class="ey e-n"${p.eyes === 'phoenix' ? ' data-part="eyes-phoenix"' : p.eyes === 'slit' ? ' data-part="eyes-slit"' : p.eyes === 'ring' ? ' data-part="eyes-ring"' : ''}>${eN}</g><g class="eyel">` +
    eyeSet(p, small, need.eyes) +
    `</g>` +
    `<g transform="translate(77 ${BROW_Y})" class="brow"${p.brow === 'silk' ? ' data-part="brow-silkworm"' : p.brow === 'curl' ? ' data-part="brow-white"' : p.brow === 'thick' ? ' data-part="brow-thick"' : ''}><g class="pose">${BROWS[p.brow](bc)}</g></g>` +
    `<g transform="translate(123 ${BROW_Y}) scale(-1 1)" class="brow"><g class="pose">${BROWS[p.brow](bc)}</g></g>` +
    sideburn +
    BEARDS[p.beard](p) +
    `<g class="mo m-n"><g transform="translate(100 ${MOUTH_Y})"><g stroke="${L}" style="stroke-width:calc(var(--sw,3.4) * .8)">${MOUTHS[p.mouth]}</g></g></g><g class="mouthl">` +
    mouthSet(p, need.mouths) +
    `</g>` +
    `<g class="capg">${capFront}</g>` +
    (small ? '' : `<g transform="translate(100 ${p.crownY})"><g class="crown">${CROWN}</g></g>`) +
    `<g class="fx gloom" fill="none" stroke="#7E92B4" style="stroke-width:2.8px"><path d="M62 24 V54 M76 20 V50 M90 18 V46 M104 18 V46 M118 20 V50 M132 24 V54 M146 30 V58"/></g>` +
    `<g class="fx crack" fill="none" stroke="${p.mask === 'black' ? '#F2EFE8' : p.ink}" style="stroke-width:2.2px"><path d="M97 30 L92 41 L99 49 L93 60 M63 82 L70 88 L65 96 M137 80 L131 87 L138 94"/></g>` +
    (small
      ? ''
      : `<g transform="translate(97 87)"><g class="snot"><circle r="8.5" fill="#D6F1FF" fill-opacity=".85" style="stroke-width:1.5px"/><path d="M-4 -3 Q-3 -6 0 -6" fill="none" stroke="#fff" style="stroke-width:1.6px"/></g></g>`) +
    `<g class="rest-only"><path d="M51 46 Q100 30 149 46 L148.5 54.5 Q100 38.5 52 55Z" fill="#F7F4EC"/>` +
    `<rect x="106" y="34" width="13" height="10" rx="2.5" transform="rotate(-8 112 39)" fill="#EADFC8" style="stroke-width:1.4px"/>` +
    `<g transform="translate(136 98) rotate(-24)"><rect x="-9" y="-5.5" width="18" height="11" rx="3" fill="#F7F4EC"/><rect x="-4.2" y="-3.4" width="8.4" height="6.8" rx="1" fill="#E7DCC4" stroke="none"/></g></g>`
  );
}

/* ---- ráp nhân vật (nội dung SVG, chưa có thẻ gốc) ---- */
export function figure(p: Params, small: boolean, need: Need): string {
  const back = (p.cape ? CAPE(p) : '') + (isBack(p.prop) ? BACK[p.prop](p) : '');
  const heldR = isHeld(p.prop) ? HELD[p.prop](p) : '';
  const clsR =
    p.prop === 'fan'
      ? 'fan-arm'
      : p.prop === 'sword' || p.prop === 'swordT'
        ? 'sword-arm'
        : p.beard === 'long'
          ? 'beard-arm'
          : '';
  const g = `fill="none" stroke="${p.ink}" stroke-linejoin="round" stroke-linecap="round"`;
  return (
    (small ? '' : `<g class="ink emb" ${g}>${need.em.includes('rays') ? EMOMAP.rays : ''}</g>`) +
    `<g class="ink" ${g}><g class="bd"><g class="breath">` +
    back +
    body(p) +
    `<g class="hd">${head(p, small, need)}</g>` +
    arm('L', [66, 119], p.armL, p, '', '') +
    arm('R', [134, 119], p.armR, p, heldR, clsR) +
    `</g></g></g>` +
    (small ? '' : `<g class="ink emo" ${g}>${emoFor(need.em)}</g>`)
  );
}
