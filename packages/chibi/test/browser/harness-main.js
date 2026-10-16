// Trang thử của @ga/chibi: nạp gói skin rồi lộ window.Chibi + window.__api cho test / công cụ chụp ảnh.
import './harness-zod.js'; // phải chạy trước mọi import dựng schema zod
import * as C from '/src/index.ts';
import { ST } from '/src/states.ts';
import * as T from '/src/testing.ts'; // svg() dạng chuỗi (style nội tuyến) chỉ để làm ca âm CSP + ảnh đối chứng

const base = '/skins/tam-quoc-chibi/1.0.0/';
const manifest = await (await fetch(`${base}manifest.json`)).json();
const chars = {};
for (const c of manifest.characters) chars[c.file] = await (await fetch(`${base}${c.file}`)).json();
C.loadSkinPack(manifest, (f) => chars[f]);
const el = document.getElementById('s');
window.Chibi = C.Chibi;
window.__chars = chars;
window.__api = {
  ready: true,
  cast: C.cast().map((c) => ({ id: c.id, code: c.id })),
  states: C.AVATAR_STATES,
  variants: C.IDLE_VARIANTS,
  frac: (s) => ST[s].frac,
  mount: (id, s, v) => {
    el.innerHTML = '';
    return C.mount(el, id, s, { size: 160, fixedPhase: true, variant: v || undefined }).svg;
  },
  /** mount() nhưng giữ handle ở window.__h (cho test setState / setMotion) */
  mountHandle: (id, s, size = 160) => {
    el.innerHTML = '';
    window.__h = C.mount(el, id, s, { size });
    return window.__h.svg;
  },
  /** mount() vào shadow root (stylesheet phải được adopt vào chính shadow root) */
  mountShadow: (id, s) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const box = document.createElement('div');
    host.attachShadow({ mode: 'open' }).appendChild(box);
    return C.mount(box, id, s, { size: 160 }).svg;
  },
  /** chèn markup tuỳ ý vào avatar đang mount — dùng làm ca âm (style nội tuyến phải bị CSP báo) */
  inject: (html) => document.querySelector('svg.chb').insertAdjacentHTML('beforeend', html),
  freeze: (frac) => C.freeze(document.querySelector('svg.chb'), frac, 900),
  /** đường CŨ (chuỗi svg() có style="…" nội tuyến): ca âm CSP + ảnh đối chứng cho so khớp điểm ảnh */
  mountLegacy: (id, s, v) => {
    C.injectCSS();
    el.innerHTML = T.svg(id, s, { size: 160, fixedPhase: true, variant: v || undefined });
    return el.querySelector('svg.chb');
  },
};
