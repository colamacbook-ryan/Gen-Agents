// mount(): dựng SVG vào một phần tử và bật theo dõi (pha mặt, tạm dừng ngoài màn hình, đổi trạng thái mượt).

import type { MotionLevel } from './motion.ts';
import { type SvgOptions, svg } from './render.ts';
import {
  adoptCSS,
  applyState,
  injectCSS,
  markStrict,
  type StateOptions,
  setMotion,
  startAuto,
  styleRootOf,
  track,
  untrack,
} from './runtime.ts';
import type { AvatarState } from './state-keys.ts';
import { hydrateStyles, strictMarkup } from './strict.ts';

export interface ChibiHandle {
  svg: SVGSVGElement;
  setState(state: AvatarState | string, opts?: StateOptions): void;
  /** đổi mức chuyển động (setting ui.avatar_motion): full | subtle | off */
  setMotion(level: MotionLevel): void;
  destroy(): void;
}

export function mount(el: Element, id: string, state: AvatarState | string = 'normal', opts?: SvgOptions): ChibiHandle {
  injectCSS();
  adoptCSS(styleRootOf(el)); // avatar trong shadow root cũng có stylesheet (adoptedStyleSheets, không cần <style>)
  // ĐƯỜNG CSP CHẶT: markup do engine tự dựng từ tham số đã qua schema (enum đóng, màu #RRGGBB, nhãn đã thoát); mọi style="…" nội tuyến được
  // đổi sang thuộc tính trình bày / data-chb-k / data-chb-sty (strict.ts) rồi áp biến tuỳ ý qua CSSOM — không cần style-src 'unsafe-inline'.
  el.innerHTML = strictMarkup(svg(id, state, opts));
  const node = el.querySelector<SVGSVGElement>('svg.chb');
  if (!node) throw new Error('Chibi: không dựng được SVG');
  hydrateStyles(node);
  markStrict(node);
  track(node);
  startAuto();
  return {
    svg: node,
    setState(s, o) {
      applyState(node, s, o);
    },
    setMotion(level) {
      setMotion(node, level);
    },
    destroy() {
      untrack(node);
      node.remove();
    },
  };
}
