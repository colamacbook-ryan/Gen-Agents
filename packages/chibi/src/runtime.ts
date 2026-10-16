// Runtime trong trình duyệt: chèn CSS một lần, theo dõi các <svg class="chb">, lập lịch pha mặt THEO SỰ KIỆN (không thăm dò mỗi khung),
// tạm dừng khi ngoài màn hình, ngân sách chi tiết, đổi trạng thái gom theo lô + chuyển tiếp mượt.
// Không phụ thuộc framework; chỉ dùng API trình duyệt chuẩn (IntersectionObserver / MutationObserver / Web Animations).
import { buildCss, nsMarkup, V } from './css.ts';
import { EMOMAP, emoFor } from './emotes.ts';
import { eyeSet, mouthSet } from './face.ts';
import { heroMarkup, needOf, pickVariant } from './need.ts';
import { type Character, getChar } from './registry.ts';
import { type Resolved, resolve } from './resolve.ts';
import { AVATAR_STATES, type AvatarState } from './state-keys.ts';
import type { Face, IdleVariant, Phase } from './states.ts';

/** tuỳ chọn khi đổi trạng thái */
export interface StateOptions {
  /** biến thể idle (nap | drunk | game); không truyền = tự xoay vòng */
  variant?: IdleVariant | string | null;
  /** false = tắt chuyển tiếp mượt */
  transition?: boolean;
  /** thời lượng chuyển tiếp (ms), mặc định 260 */
  ms?: number;
  /** nội bộ: đổi do tự xoay vòng biến thể */
  auto?: boolean;
}

interface NodeState {
  /** chỉ số pha hiện tại (-1 = chưa áp) */
  i: number;
  /** giá trị mặt đã ghi vào thuộc tính (chỉ ghi khi đổi) */
  f: Partial<Face>;
  ph: Phase[] | null;
  tm: ReturnType<typeof setTimeout> | 0;
  /** chu kỳ (ms) */
  T: number;
  /** mốc 0 của chu kỳ (ms) */
  t0: number;
  pauseAt: number | null;
  /** đang đóng băng (hook kiểm thử) */
  frz: boolean;
  /** đổi trạng thái bị hoãn vì đang ngoài màn hình */
  defer: [string, StateOptions] | null;
}

type Svg = SVGSVGElement;
const info = new WeakMap<Svg, NodeState>();
const ns = (node: Svg): NodeState => {
  let s = info.get(node);
  if (!s) {
    s = { i: -1, f: {}, ph: null, tm: 0, T: 5000, t0: 0, pauseAt: null, frz: false, defer: null };
    info.set(node, s);
  }
  return s;
};

const reg = new Set<Svg>();
let budget = 8;
let budgetT: ReturnType<typeof setTimeout> | 0 = 0;
let io: IntersectionObserver | null = null;
let mo: MutationObserver | null = null;
let mqr: MediaQueryList | null = null;
let cssDone = false;
let autoTimer: ReturnType<typeof setInterval> | 0 = 0;

const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const attr = (node: Element, k: string): string => node.getAttribute(`data-chb-${k}`) ?? '';

export const getBudget = (): number => budget;
/** ngân sách chi tiết: số nhân vật cỡ lớn được vẽ đủ chi tiết cùng lúc (mặc định 8); số dư chuyển sang chế độ nhẹ */
export function setBudget(n: number): void {
  budget = Math.max(0, Math.trunc(n));
  schedBudget();
}

/** chỉ BUDGET nhân vật cỡ lớn đang nhìn thấy được vẽ đủ tay / phần phụ / emote; số dư: thân + đầu + một huy hiệu */
function rebudget(): void {
  budgetT = 0;
  let n = 0;
  for (const node of reg) {
    if (attr(node, 'vis') === '0' || attr(node, 'sz') !== 'b') continue;
    const lod = n++ >= budget;
    if (lod !== node.hasAttribute('data-chb-lod')) {
      if (lod) node.setAttribute('data-chb-lod', '1');
      else node.removeAttribute('data-chb-lod');
      sched(node);
    }
  }
}
function schedBudget(): void {
  if (!budgetT) budgetT = setTimeout(rebudget, 60);
}

/** chèn stylesheet (đúng một lần, idempotent) + bật theo dõi DOM. No-op ngoài trình duyệt. */
export function injectCSS(): void {
  if (typeof document === 'undefined' || cssDone) return;
  cssDone = true;
  if (!document.getElementById('chb-css')) {
    const st = document.createElement('style');
    st.id = 'chb-css';
    st.textContent = buildCss();
    (document.head || document.documentElement).appendChild(st);
  }
  mqr = window.matchMedia('(prefers-reduced-motion: reduce)');
  mqr.addEventListener('change', () => {
    for (const n of reg) applyState(n, attr(n, 's'));
  });
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          const n = e.target as Svg;
          const s = ns(n);
          n.setAttribute('data-chb-vis', e.isIntersecting ? '1' : '0');
          if (!e.isIntersecting) {
            if (s.tm) {
              clearTimeout(s.tm);
              s.tm = 0;
            }
            s.pauseAt = nowMs();
          } else if (s.defer) {
            const d = s.defer;
            s.defer = null;
            applyState(n, d[0], Object.assign({}, d[1], { transition: false }));
          } else if (s.pauseAt != null) {
            s.t0 += nowMs() - s.pauseAt;
            s.pauseAt = null;
            sched(n);
          }
        }
        schedBudget();
      },
      { rootMargin: '80px' },
    );
  }
  if ('MutationObserver' in window) {
    mo = new MutationObserver((ms) => {
      for (const m of ms) {
        for (const n of m.addedNodes) scan(n);
        m.removedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          const el = n as Element;
          if (el.matches('svg.chb')) untrack(el as Svg);
          else el.querySelectorAll<Svg>('svg.chb').forEach(untrack);
        });
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }
  scan(document.documentElement);
}

/** quét một nhánh DOM, theo dõi mọi svg.chb trong đó */
export function scan(n: Node | null): void {
  if (n?.nodeType !== 1) return;
  const el = n as Element;
  if (el.matches('svg.chb')) track(el as Svg);
  else el.querySelectorAll<Svg>('svg.chb').forEach(track);
}

const resolveOf = (node: Svg): Resolved =>
  resolve(attr(node, 'c'), attr(node, 's') as AvatarState, node.getAttribute('data-chb-v'));

export function track(node: Svg): void {
  if (reg.has(node)) return;
  reg.add(node);
  schedBudget();
  const s = ns(node);
  s.i = -1;
  s.f = {};
  s.ph = resolveOf(node).ph;
  if (io) io.observe(node);
  if (attr(node, 'auto') === '1') startAuto();
  startClock(node);
}
export function untrack(node: Svg): void {
  reg.delete(node);
  const s = ns(node);
  if (s.tm) {
    clearTimeout(s.tm);
    s.tm = 0;
  }
  schedBudget();
  if (io) io.unobserve(node);
}

const isLite = (node: Svg): boolean => attr(node, 'sz') !== 'b' || node.hasAttribute('data-chb-lod');

/** mốc 0 của chu kỳ = thời điểm animation k-clk thật sự bắt đầu (đọc MỘT lần, không đọc mỗi khung) */
function startClock(node: Svg): void {
  const s = ns(node);
  if (s.tm) {
    clearTimeout(s.tm);
    s.tm = 0;
  }
  s.T = (Number.parseFloat(node.style.getPropertyValue(V('T'))) || 5) * 1000;
  s.t0 = nowMs();
  s.pauseAt = null;
  s.frz = false;
  if (typeof requestAnimationFrame === 'undefined') return;
  requestAnimationFrame(() => {
    const clk = node.querySelector('.chb-clk');
    const an = clk?.getAnimations?.()[0];
    if (an && an.startTime != null) s.t0 = Number(an.startTime);
    sched(node);
  });
}

/** lập lịch pha mặt THEO SỰ KIỆN: tính mốc pha từ T rồi setTimeout tới mốc kế tiếp; chỉ ghi thuộc tính khi pha đổi */
function sched(node: Svg): void {
  const s = ns(node);
  if (s.tm) {
    clearTimeout(s.tm);
    s.tm = 0;
  }
  if (s.frz || !node.isConnected || mqr?.matches || attr(node, 'vis') === '0' || isLite(node)) return;
  const ph = s.ph;
  const T = s.T;
  if (!ph) return;
  const el = (((nowMs() - s.t0) % T) + T) % T;
  const i = phaseAt(ph, el / T);
  if (s.i !== i) {
    s.i = i;
    const cur = ph[i];
    if (cur) applyFace(node, cur[1]);
  }
  if (ph.length < 2) return;
  const next = ph[i + 1];
  const nextAt = next ? next[0] * T : T;
  s.tm = setTimeout(() => sched(node), Math.max(4, nextAt - el + 2));
}

const FACE_KEYS = ['eyes', 'mouth', 'brow', 'face', 'em'] as const;
function applyFace(node: Svg, ph: Face): void {
  const s = ns(node);
  for (const k of FACE_KEYS) {
    if (s.f[k] !== ph[k]) {
      s.f[k] = ph[k] as never;
      node.setAttribute(`data-chb-${k}`, ph[k]);
    }
  }
}
function phaseAt(list: Phase[], prog: number): number {
  let i = 0;
  while (i + 1 < list.length && (list[i + 1]?.[0] ?? 2) <= prog) i++;
  return i;
}

// ---------------------------------------------------------------- chuyển tiếp mượt khi đổi trạng thái
const TPARTS = ['bd', 'hd', 'capg', 'shoeL', 'shoeR'] as const;
/** phần tử quay theo góc tay: tay (rotate + scale), đạo cụ cầm tay (quay ngược + góc riêng), cọ, tay áo nước */
const ARM_PARTS = '.chb-arm-L,.chb-arm-R,.chb-held,.chb-held-h,.chb-brush,.chb-ribw';
const mat = (el: Element): DOMMatrix => {
  const tr = getComputedStyle(el).transform;
  return new DOMMatrix(tr === 'none' ? undefined : tr);
};
interface ArmPose {
  rot: number;
  scale: number;
}
const armPose = (el: Element): ArmPose => {
  const cs = getComputedStyle(el);
  return { rot: Number.parseFloat(cs.rotate) || 0, scale: Number.parseFloat(cs.scale) || 1 };
};

interface Snapshot {
  t: Record<string, DOMMatrix>;
  arms: Map<Element, ArmPose>;
  lite: boolean;
}
function snapshot(node: Svg): Snapshot {
  const lite = isLite(node);
  const out: Snapshot = { t: {}, arms: new Map(), lite };
  for (const k of lite ? (['bd', 'hd'] as const) : TPARTS) {
    const el = node.querySelector(`.chb-${k}`);
    if (el) out.t[k] = mat(el);
  }
  if (!lite) for (const el of node.querySelectorAll(ARM_PARTS)) out.arms.set(el, armPose(el));
  return out;
}

/** cộng một "độ lệch" (pose cũ − pose mới tại t=0) rồi tắt dần trong ~260 ms, ease có vượt đà */
function glide(node: Svg, before: Snapshot, ms: number): void {
  const ease = 'cubic-bezier(.25,.9,.35,1.3)';
  const opts: KeyframeAnimationOptions = { duration: ms, easing: ease, composite: 'add' };
  for (const k of before.lite ? (['bd', 'hd'] as const) : TPARTS) {
    const el = node.querySelector(`.chb-${k}`);
    const b = before.t[k];
    if (!el || !b) continue;
    const E = mat(el).inverse().multiply(b);
    const dx = Math.abs(E.e) + Math.abs(E.f) + Math.abs(E.a - 1) + Math.abs(E.b) + Math.abs(E.c) + Math.abs(E.d - 1);
    // ma trận không khả nghịch (scale 0) cho NaN: bỏ qua, không dựng chuyển tiếp
    if (!Number.isFinite(dx) || dx < 0.004) continue;
    el.animate([{ transform: E.toString() }, { transform: 'none' }], opts);
  }
  for (const [el, was] of before.arms) {
    const now = armPose(el);
    const dr = was.rot - now.rot;
    // rotate cộng góc; scale NHÂN (composite add của scale là phép nhân) nên lệch = tỉ số
    if (Number.isFinite(dr) && Math.abs(dr) >= 0.05) el.animate([{ rotate: `${dr}deg` }, { rotate: '0deg' }], opts);
    const ds = was.scale / now.scale;
    if (Number.isFinite(ds) && Math.abs(ds - 1) >= 0.0005) el.animate([{ scale: `${ds}` }, { scale: '1' }], opts);
  }
}

// ---------------------------------------------------------------- lớp mặt / emote theo (nhân vật, trạng thái)
interface Layers {
  eyes: string;
  mouths: string;
  emo: string;
  emb: string;
  hero: string;
}
const layerCache = new WeakMap<Character, Map<string, Layers>>();
/** chuỗi lớp mặt / emote đã gắn tiền tố, nhớ theo (nhân vật, trạng thái, biến thể, cỡ); cache gắn với đối tượng nhân vật nên tự hết khi unregister */
function layersFor(id: string, state: AvatarState, variant: string | null, small: boolean, R: Resolved): Layers {
  const C = getChar(id);
  let per = layerCache.get(C);
  if (!per) {
    per = new Map();
    layerCache.set(C, per);
  }
  const k = `${state}|${variant ?? ''}|${small ? 1 : 0}`;
  const hit = per.get(k);
  if (hit) return hit;
  const need = needOf(R);
  const rays = need.em.includes('rays');
  const L: Layers = {
    eyes: nsMarkup(eyeSet(C.P, small, need.eyes)),
    mouths: nsMarkup(mouthSet(C.P, need.mouths)),
    emo: small ? '' : nsMarkup(emoFor(need.em)),
    emb: small || !rays ? '' : nsMarkup(EMOMAP.rays ?? ''),
    hero: nsMarkup(heroMarkup(R.hero)),
  };
  per.set(k, L);
  return L;
}

const htmlOf = new WeakMap<Element, string>();
function setHtml(el: Element | null, html: string): void {
  if (el && htmlOf.get(el) !== html) {
    htmlOf.set(el, html);
    el.innerHTML = html;
  }
}
function rebuildLayers(node: Svg, R: Resolved, variant: string | null): void {
  const small = attr(node, 'sm') === '1';
  const L = layersFor(attr(node, 'c'), R.state, variant, small, R);
  setHtml(node.querySelector('.chb-eyel'), L.eyes);
  setHtml(node.querySelector('.chb-mouthl'), L.mouths);
  if (!small) {
    setHtml(node.querySelector('.chb-emo'), L.emo);
    setHtml(node.querySelector('.chb-emb'), L.emb);
  }
  setHtml(node.querySelector('svg.chb-hero'), L.hero);
}

// ---------------------------------------------------------------- đổi trạng thái (gom theo lô, một microtask)
const pend = new Map<Svg, [string, StateOptions]>();
let pendQ = false;
/** đọc pose cũ của MỌI node trước, đổi thuộc tính của mọi node, rồi chỉ một lần tính lại style để dựng chuyển tiếp mượt */
export function applyState(node: Svg, state: string, opts?: StateOptions): void {
  pend.set(node, [state, opts ?? {}]);
  if (!pendQ) {
    pendQ = true;
    Promise.resolve().then(runPending);
  }
}
const isState = (s: string): s is AvatarState => (AVATAR_STATES as readonly string[]).includes(s);

function runPending(): void {
  pendQ = false;
  const jobs = Array.from(pend).filter(([node, [state, opts]]) => {
    if (attr(node, 'vis') === '0') {
      ns(node).defer = [state, opts];
      return false; // ngoài màn hình: hoãn tới khi hiện ra (tiết kiệm style recalc)
    }
    ns(node).defer = null;
    return true;
  });
  pend.clear();
  const reduced = mqr
    ? mqr.matches
    : typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const prep = jobs.map(([node, [state, opts]]) => ({
    node,
    state: (isState(state) ? state : 'normal') as AvatarState,
    opts,
    before:
      !reduced && opts.transition !== false && node.isConnected && attr(node, 'vis') !== '0' ? snapshot(node) : null,
  }));
  for (const j of prep) mutate(j.node, j.state, j.opts, reduced);
  for (const j of prep) if (j.before) glide(j.node, j.before, j.opts.ms || 260);
}

function mutate(node: Svg, state: AvatarState, opts: StateOptions, reduced: boolean): void {
  const id = attr(node, 'c');
  const s = ns(node);
  const variant = state === 'idle' ? pickVariant(opts.variant) : null;
  const R = resolve(id, state, variant);
  const same = attr(node, 's') === state && (node.getAttribute('data-chb-v') || null) === variant;
  node.setAttribute('data-chb-m', R.m.join(' '));
  node.style.setProperty(V('T'), `${R.T}s`);
  if (variant) {
    node.setAttribute('data-chb-v', variant);
    if (opts.variant) node.removeAttribute('data-chb-auto');
    else if (!opts.auto) node.setAttribute('data-chb-auto', '1');
  } else {
    node.removeAttribute('data-chb-v');
    node.removeAttribute('data-chb-auto');
  }
  const old = node.querySelector('.chb-clk');
  if (old) old.replaceWith(old.cloneNode(false));
  s.i = -1;
  s.ph = R.ph;
  applyFace(node, reduced ? Object.assign({}, R.peak, { em: '' }) : (R.ph[0]?.[1] ?? R.peak));
  if (same) {
    node.removeAttribute('data-chb-s');
    void node.getBoundingClientRect(); // đặt lại đúng trạng thái đang có: buộc animation chạy lại từ đầu
  }
  node.setAttribute('data-chb-s', state);
  rebuildLayers(node, R, variant);
  if (!reg.has(node) && node.isConnected) track(node);
  else startClock(node);
}

/** idle tự xoay vòng 3 biến thể khi không truyền opts.variant */
export function startAuto(): void {
  if (autoTimer || typeof setInterval === 'undefined') return;
  autoTimer = setInterval(() => {
    for (const n of reg) {
      if (attr(n, 'auto') === '1' && attr(n, 's') === 'idle') {
        const v = pickVariant();
        if (v !== n.getAttribute('data-chb-v')) applyState(n, 'idle', { variant: v, auto: true });
      }
    }
  }, 1000);
}

// ---------------------------------------------------------------- API công khai
/** hook kiểm thử: đóng băng ở tỉ lệ chu kỳ (pose đỉnh) + thời gian cho emote */
export function freeze(node: Svg, frac = 0, emMs = 900): void {
  const s = ns(node);
  s.frz = true;
  if (s.tm) {
    clearTimeout(s.tm);
    s.tm = 0;
  }
  const T = Number.parseFloat(node.style.getPropertyValue(V('T')));
  const t = frac * T * 1000;
  const ca = node.querySelector('.chb-clk')?.getAnimations()[0];
  if (ca) {
    ca.pause();
    ca.currentTime = t;
  }
  if (!s.ph) s.ph = resolveOf(node).ph;
  const i = phaseAt(s.ph, frac % 1);
  s.i = i;
  const cur = s.ph[i];
  if (cur) applyFace(node, cur[1]);
  void node.getBoundingClientRect();
  for (const a of node.getAnimations({ subtree: true })) {
    a.pause();
    const tg = a.effect && (a.effect as KeyframeEffect).target;
    if (tg?.classList.contains('chb-eye')) a.currentTime = 0;
    else if (tg?.closest('.chb-em,.chb-hero')) a.currentTime = emMs;
    else a.currentTime = t;
  }
}

/** các @keyframes của stylesheet engine (tên → cssText), cho công cụ tự kiểm */
export function keyframeNames(): Record<string, string> {
  const out: Record<string, string> = {};
  const sheet = (document.getElementById('chb-css') as HTMLStyleElement | null)?.sheet;
  const walk = (rules: CSSRuleList): void => {
    for (const r of Array.from(rules)) {
      if (r instanceof CSSKeyframesRule) out[r.name] = r.cssText;
      else if ('cssRules' in r) walk((r as CSSGroupingRule).cssRules);
    }
  };
  if (sheet) walk(sheet.cssRules);
  return out;
}
