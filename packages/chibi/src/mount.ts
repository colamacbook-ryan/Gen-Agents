// mount(): dựng SVG vào một phần tử và bật theo dõi (pha mặt, tạm dừng ngoài màn hình, đổi trạng thái mượt).
import { type SvgOptions, svg } from './render.ts';
import { applyState, injectCSS, type StateOptions, startAuto, track, untrack } from './runtime.ts';
import type { AvatarState } from './state-keys.ts';

export interface ChibiHandle {
  svg: SVGSVGElement;
  setState(state: AvatarState | string, opts?: StateOptions): void;
  destroy(): void;
}

export function mount(el: Element, id: string, state: AvatarState | string = 'normal', opts?: SvgOptions): ChibiHandle {
  injectCSS();
  // markup do engine tự dựng từ tham số đã qua schema (enum đóng, màu #RRGGBB, nhãn đã thoát): không có chuỗi từ ngoài chưa thoát
  el.innerHTML = svg(id, state, opts);
  const node = el.querySelector<SVGSVGElement>('svg.chb');
  if (!node) throw new Error('Chibi: không dựng được SVG');
  track(node);
  startAuto();
  return {
    svg: node,
    setState(s, o) {
      applyState(node, s, o);
    },
    destroy() {
      untrack(node);
      node.remove();
    },
  };
}
