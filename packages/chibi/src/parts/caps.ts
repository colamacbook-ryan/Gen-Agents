// Mũ / khăn / búi tóc: mỗi mục trả [phần sau đầu (vẽ trước mặt), phần trước đầu (vẽ sau mặt)].
import { lite, shade } from '../color.ts';
import type { CapName, Params } from '../params.ts';

export const CAPS: Record<CapName, (p: Params) => [string, string]> = {
  // [sau đầu (vẽ trước mặt), trước đầu (vẽ sau mặt)]
  soft: (p) => [
    // khăn luân cân: vải mềm, đỉnh nhọn nghiêng, nếp gấp, nơ + hai dải; lộ tóc hai bên
    `<g class="tail tailL"><path d="M60 46 C47 62 40 88 41 118 L49.5 115 C50 90 55 68 66 52Z" fill="${p.capColor}"/></g>` +
      `<g class="tail tailR"><path d="M140 46 C153 62 160 88 159 118 L150.5 115 C150 90 145 68 134 52Z" fill="${p.capColor}"/></g>`,
    `<g data-part="cap-lunjin"><path d="M60 47 C54 28 66 12 86 6 C94 3 100 0 108 3 C122 8 136 20 140 36 C142 41 141 44 140 47 C128 42 114 40 100 40 C86 40 72 42 60 47Z" fill="${p.capColor}"/>` +
      `<path d="M122 6 C136 14 142 30 140 47 C134 44 128 42 124 41 C128 30 128 16 122 6Z" fill="${shade(p.capColor, 0.3)}" stroke="none"/>` +
      `<path d="M86 7 C80 16 70 30 68 42 C66 32 72 16 86 7Z" fill="${lite(p.capColor, 0.16)}" stroke="none"/>` +
      `<path d="M60 47 C72 42 86 40 100 40 C114 40 128 42 140 47" fill="none" stroke="${p.capAccent}" style="stroke-width:6px"/>` +
      `<path class="dt" d="M100 4 C97 18 92 30 88 41 M106 4 C108 18 114 30 120 41" fill="none" stroke="${shade(p.capColor, 0.4)}" style="stroke-width:1.7px"/>` +
      `<ellipse cx="100" cy="41" rx="4.4" ry="3.6" fill="#BFF0DA" style="stroke-width:1.5px"/>` +
      `<circle cx="142" cy="46" r="4.6" fill="${p.capAccent}" style="stroke-width:1.6px"/>` +
      `<path d="M141 49 L146 70 L152 62Z" fill="${p.capColor}" style="stroke-width:1.5px"/><path d="M143 49 L157 63 L148 66Z" fill="${p.capColor}" style="stroke-width:1.5px"/></g>`,
  ],
  wrap: (p) => [
    `<path d="M51 54 C42 68 39 88 42 108 L50 105 C50 90 52 73 58 60Z" fill="${p.capColor}"/><path d="M149 54 C158 68 161 88 158 108 L150 105 C150 90 148 73 142 60Z" fill="${p.capColor}"/>`,
    `<g data-part="cap-wrap"><ellipse cx="100" cy="17" rx="13" ry="10.5" fill="${p.hair}"/>` +
      `<path d="M49 58 C44 36 64 22 100 22 C136 22 156 36 151 58 C141 49 125 44 100 44 C75 44 59 49 49 58Z" fill="${p.capColor}"/>` +
      `<path d="M151 58 C156 38 138 24 104 22 C128 28 142 40 141 51Z" fill="${shade(p.capColor, 0.3)}" stroke="none"/>` +
      `<path d="M62 36 C68 28 82 24 94 24 C82 28 74 34 70 42Z" fill="${lite(p.capColor, 0.22)}" stroke="none"/>` +
      `<path d="M49 58 C59 49 75 44 100 44 C125 44 141 49 151 58" fill="none" stroke="${p.capAccent}" style="stroke-width:5px"/>` +
      `<path d="M88 22 Q100 29 112 22" fill="none" stroke="${p.capAccent}" style="stroke-width:4px"/>` +
      `<circle cx="100" cy="46" r="3.6" fill="${p.buckle}" style="stroke-width:1.6px"/></g>`,
  ],
  official: (p) => [
    '',
    `<g data-part="cap-official"><path d="M52 47 L21 42 L21 53 L52 58Z" fill="${p.capColor}"/><path d="M148 47 L179 42 L179 53 L148 58Z" fill="${p.capColor}"/>` +
      `<path d="M21 42 L26 43 L26 53 L21 53Z" fill="${p.buckle}" style="stroke-width:1.4px"/><path d="M179 42 L174 43 L174 53 L179 53Z" fill="${p.buckle}" style="stroke-width:1.4px"/>` +
      `<path d="M50 58 C46 40 62 33 100 33 C138 33 154 40 150 58 C140 50 124 45 100 45 C76 45 60 50 50 58Z" fill="${p.capColor}"/>` +
      `<path d="M68 38 L76 4 L124 4 L132 38 C120 33 80 33 68 38Z" fill="${p.capColor}"/>` +
      `<path d="M76 4 L124 4 L123 11 L77 11Z" fill="${lite(p.capColor, 0.2)}" stroke="none"/>` +
      `<path d="M124 4 L132 38 C128 36 124 35 121 34 L119 4Z" fill="${lite(p.capColor, 0.08)}" stroke="none"/>` +
      `<path d="M88 12 L86 35 M100 11 L100 34 M112 12 L114 35" fill="none" stroke="${p.buckle}" style="stroke-width:2.4px"/>` +
      `<circle cx="100" cy="45" r="4.5" fill="${p.buckle}" style="stroke-width:1.6px"/><circle cx="100" cy="45" r="1.8" fill="${p.trim}" stroke="none"/></g>`,
  ],
  crownbun: (p) => [
    // Lưu Bị: búi tóc đen + mũ miện vàng nhỏ (hoàng thân), tua đỏ
    '',
    `<g data-part="cap-crownbun"><path d="M50 58 C45 36 66 22 100 22 C134 22 155 36 150 58 C140 47 124 42 100 42 C76 42 60 47 50 58Z" fill="${p.hair}"/>` +
      `<path d="M64 34 C72 28 86 25 96 25 C86 29 76 34 70 42Z" fill="${lite(p.hair, 0.14)}" stroke="none"/>` +
      `<ellipse cx="100" cy="15" rx="11" ry="10" fill="${p.hair}"/>` +
      `<path d="M85 26 L88 11 L94.5 19 L100 4 L105.5 19 L112 11 L115 26Z" fill="${p.crownGold || p.buckle}" style="stroke-width:1.8px"/>` +
      `<path d="M85 26 H115" fill="none" stroke="${shade(p.crownGold || p.buckle, 0.35)}" style="stroke-width:1.5px"/><circle cx="100" cy="19" r="2.4" fill="#E5483F" style="stroke-width:1.1px"/>` +
      `<path d="M114 24 C122 30 124 40 119 52" fill="none" stroke="#C8363B" style="stroke-width:2.4px"/><circle cx="119" cy="53" r="2.4" fill="#C8363B" style="stroke-width:1px"/></g>`,
  ],
  flowerbun: (p) => [
    // Điêu Thuyền: hai búi tóc, hoa, trâm cài; tóc dài sau lưng
    `<path d="M47 66 C36 104 38 142 52 166 L70 156 C60 132 60 100 62 72Z" fill="${p.hair}"/><path d="M153 66 C164 104 162 142 148 166 L130 156 C140 132 140 100 138 72Z" fill="${p.hair}"/>` +
      `<ellipse cx="62" cy="24" rx="17" ry="14" fill="${p.hair}"/><ellipse cx="138" cy="24" rx="17" ry="14" fill="${p.hair}"/>`,
    `<g data-part="cap-flowerbun"><path d="M51 60 C48 38 68 28 100 28 C132 28 152 38 149 60 C142 50 130 44 118 44 C112 52 88 52 82 44 C70 44 58 50 51 60Z" fill="${p.hair}"/>` +
      `<path d="M62 38 C72 32 88 31 98 31 C86 35 76 40 70 46Z" fill="${lite(p.hair, 0.14)}" stroke="none"/>` +
      [
        [66, 22],
        [134, 22],
      ]
        .map(
          ([x, y]) =>
            `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-6.5" rx="4.6" ry="6.4" fill="${p.flower || '#F7A6C6'}" transform="rotate(${a})" style="stroke-width:1.3px"/>`).join('')}<circle r="3" fill="#FFE27A" style="stroke-width:1px"/></g>`,
        )
        .join('') +
      `<path d="M148 24 L176 6" fill="none" stroke="${p.buckle}" style="stroke-width:2.4px"/><circle cx="176" cy="6" r="3" fill="${p.buckle}" style="stroke-width:1px"/>` +
      `<path d="M160 16 L164 34 M168 11 L174 28" fill="none" stroke="${p.buckle}" style="stroke-width:1.4px"/><circle cx="164" cy="36" r="2.8" fill="#FFF7F0" style="stroke-width:1px"/><circle cx="174" cy="30" r="2.8" fill="#FFF7F0" style="stroke-width:1px"/></g>`,
  ],
  ponytail: (p) => [
    // Tôn Thượng Hương: đuôi ngựa cao, băng đô, nơ
    `<g class="tail tailR"><path d="M112 22 C146 4 180 22 176 54 C174 76 160 88 152 104 C162 80 154 60 132 50 C120 44 110 36 112 22Z" fill="${p.hair}"/></g>`,
    `<g data-part="cap-ponytail"><path d="M50 58 C46 36 66 24 100 24 C134 24 154 36 150 58 C140 47 124 42 100 42 C76 42 60 47 50 58Z" fill="${p.hair}"/>` +
      `<path d="M62 36 C72 30 88 28 98 28 C86 32 76 38 70 44Z" fill="${lite(p.hair, 0.14)}" stroke="none"/>` +
      `<path d="M50 58 C66 47 84 43 100 43 C116 43 134 47 150 58" fill="none" stroke="${p.capAccent}" style="stroke-width:6px"/>` +
      `<g transform="translate(116 24)"><path d="M0 0 L-12 -8 L-12 8Z M0 0 L12 -8 L12 8Z" fill="${p.capAccent}" style="stroke-width:1.6px"/><circle r="3.4" fill="${p.capAccent}" style="stroke-width:1.4px"/></g></g>`,
  ],
  sqcap: (p) => [
    // Hoa Đà: khăn vuông, tóc bạc xõa hai bên
    `<path d="M52 50 C42 70 44 92 52 112 L62 104 C56 90 58 70 62 56Z" fill="${p.hair}"/><path d="M148 50 C158 70 156 92 148 112 L138 104 C144 90 142 70 138 56Z" fill="${p.hair}"/>`,
    `<g data-part="cap-sqcap"><path d="M55 46 L57 12 C80 6 120 6 143 12 L145 46 C128 39 72 39 55 46Z" fill="${p.capColor}"/>` +
      `<path d="M126 8 L143 12 L145 46 C138 43 132 41 127 40Z" fill="${shade(p.capColor, 0.25)}" stroke="none"/>` +
      `<path d="M60 14 C70 10 84 9 94 9 C82 14 72 22 66 38Z" fill="${lite(p.capColor, 0.2)}" stroke="none"/>` +
      `<path class="dt" d="M100 8 L100 40 M78 9 L74 41 M122 9 L126 41" fill="none" stroke="${shade(p.capColor, 0.3)}" style="stroke-width:1.5px"/>` +
      `<path d="M55 46 C72 40 128 40 145 46" fill="none" stroke="${p.capAccent}" style="stroke-width:5px"/></g>`,
  ],
  band: (p) => [
    // Triệu Vân: tóc buộc, băng đô bạc, dải lụa xanh nhạt bay
    `<g class="tail tailR"><path d="M148 52 C174 56 184 80 176 108 L168 104 C174 82 164 66 146 62Z" fill="${p.capColor}"/></g>`,
    `<g data-part="cap-band"><ellipse cx="100" cy="15" rx="12" ry="10" fill="${p.hair}"/>` +
      `<path d="M50 58 C46 34 66 22 100 22 C134 22 154 34 150 58 C140 48 124 43 100 43 C76 43 60 48 50 58Z" fill="${p.hair}"/>` +
      `<path d="M62 36 C72 29 88 26 98 26 C86 30 76 36 70 44Z" fill="${lite(p.hair, 0.14)}" stroke="none"/>` +
      `<path d="M50 58 C62 48 80 43 100 43 C120 43 138 48 150 58" fill="none" stroke="${p.capAccent}" style="stroke-width:6px"/>` +
      `<path d="M92 24 Q100 30 108 24" fill="none" stroke="${p.capColor}" style="stroke-width:4px"/><circle cx="100" cy="46" r="3.8" fill="${p.capColor}" style="stroke-width:1.5px"/></g>`,
  ],
  knot: (p) => [
    // Trương Phi: khăn buộc nơ to, tóc xù
    `<path d="M47 60 L36 48 L48 52 L38 38 L52 46 L50 30 L62 42 L64 24 L76 38 L88 20 L96 36 L112 18 L116 36 L132 22 L134 40 L148 30 L146 46 L160 42 L152 56 L164 56 L150 70 L47 70Z" fill="${p.hair}"/>`,
    `<g data-part="cap-knot"><path d="M49 58 C44 38 64 26 100 26 C136 26 156 38 151 58 C141 48 125 43 100 43 C75 43 59 48 49 58Z" fill="${p.capColor}"/>` +
      `<path d="M62 38 C70 31 86 29 96 29 C84 33 76 38 70 45Z" fill="${lite(p.capColor, 0.2)}" stroke="none"/>` +
      `<path d="M49 58 C59 49 75 44 100 44 C125 44 141 49 151 58" fill="none" stroke="${p.capAccent}" style="stroke-width:5px"/>` +
      `<g transform="translate(138 30)"><path d="M0 0 C10 -16 28 -14 24 -2 C21 6 8 6 0 0Z" fill="${p.capAccent}" style="stroke-width:1.8px"/><path d="M0 0 C-8 -14 -24 -12 -20 0 C-17 8 -6 8 0 0Z" fill="${p.capAccent}" style="stroke-width:1.8px"/>` +
      `<path d="M0 2 L-8 22 L2 18Z M2 2 L14 22 L16 12Z" fill="${p.capAccent}" style="stroke-width:1.6px"/><circle r="4.4" fill="${lite(p.capAccent, 0.2)}" style="stroke-width:1.5px"/></g></g>`,
  ],
  helm: (p) => [
    // Lính quèn: mũ trụ 兜鍪 to quá khổ, lệch; trùm đỉnh tròn ghép mảnh; má + gáy loe
    `<g transform="rotate(-9 100 44)" data-part="helm-neck"><path d="M42 64 C30 92 34 118 54 132 L146 132 C166 118 170 92 158 64Z" fill="${shade(p.capColor, 0.32)}"/>` +
      `<path class="dt" d="M52 80 C48 98 52 116 62 126 M148 80 C152 98 148 116 138 126 M80 112 V130 M100 112 V131 M120 112 V130" fill="none" stroke="${shade(p.capColor, 0.55)}" style="stroke-width:1.5px"/></g>`,
    `<g data-part="cap-helm" transform="rotate(-9 100 44)"><path d="M40 62 C32 22 62 2 100 2 C138 2 168 22 160 62 L156 68 C132 58 68 58 44 68Z" fill="${p.capColor}"/>` +
      `<path d="M130 6 C152 14 164 34 160 62 L156 68 C148 64 140 61 132 60 C140 40 138 22 130 6Z" fill="${shade(p.capColor, 0.25)}" stroke="none"/>` +
      `<path d="M52 30 C58 16 74 8 92 6 C76 14 66 28 62 42Z" fill="${lite(p.capColor, 0.22)}" stroke="none"/>` +
      `<path class="dt" d="M100 3 V60 M76 6 C68 26 64 44 62 60 M124 6 C132 26 136 44 138 60" fill="none" stroke="${shade(p.capColor, 0.3)}" style="stroke-width:1.6px"/>` +
      `<path d="M44 68 C68 58 132 58 156 68" fill="none" stroke="${shade(p.capColor, 0.3)}" style="stroke-width:5px"/>` +
      `<circle cx="100" cy="1" r="6" fill="${shade(p.capColor, 0.15)}" style="stroke-width:1.8px"/>` +
      `<g data-part="helm-cheek"><path d="M42 66 C36 88 40 106 54 118 L68 108 C62 96 60 84 62 70Z" fill="${shade(p.capColor, 0.18)}"/><path d="M158 66 C164 88 160 106 146 118 L132 108 C138 96 140 84 138 70Z" fill="${shade(p.capColor, 0.18)}"/>` +
      `<circle cx="52" cy="82" r="2.2" fill="${lite(p.capColor, 0.3)}" style="stroke-width:1px"/><circle cx="148" cy="82" r="2.2" fill="${lite(p.capColor, 0.3)}" style="stroke-width:1px"/></g>` +
      `<path d="M63 62 C66 66 70 68 76 69 M137 62 C134 66 130 68 124 69" fill="none" stroke="${p.sash}" style="stroke-width:2.4px"/></g>`,
  ],
  bunband: (p) => [
    // Tôn Thượng Hương: búi cao + băng trán lam/trắng (không đỏ) + trâm nhỏ
    '',
    `<g data-part="cap-bunband" data-band="${p.capAccent}"><ellipse cx="100" cy="12" rx="15" ry="13" fill="${p.hair}"/>` +
      `<path d="M50 58 C46 36 66 24 100 24 C134 24 154 36 150 58 C140 47 124 42 100 42 C76 42 60 47 50 58Z" fill="${p.hair}"/>` +
      `<path d="M62 36 C72 30 88 28 98 28 C86 32 76 38 70 44Z" fill="${lite(p.hair, 0.14)}" stroke="none"/><path d="M88 6 C94 3 100 3 106 6 C100 6 94 8 90 12Z" fill="${lite(p.hair, 0.16)}" stroke="none"/>` +
      `<path d="M50 58 C66 47 84 43 100 43 C116 43 134 47 150 58" fill="none" stroke="${p.capColor}" style="stroke-width:8.4px"/><path d="M50 58 C66 47 84 43 100 43 C116 43 134 47 150 58" fill="none" stroke="${p.capAccent}" style="stroke-width:4.6px"/>` +
      `<circle cx="100" cy="45" r="3.4" fill="${p.capColor}" style="stroke-width:1.4px"/>` +
      `<path d="M78 14 H124" fill="none" stroke="${p.buckle}" style="stroke-width:2.6px"/><circle cx="125" cy="14" r="2.6" fill="${p.buckle}" style="stroke-width:1px"/></g>`,
  ],
};
