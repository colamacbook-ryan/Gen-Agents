// Đường CSP CHẶT (style-src 'self', KHÔNG 'unsafe-inline'): markup dựng bởi svg() dùng thuộc tính style="…" nội tuyến (bị style-src-attr
// chặn). strictMarkup() đổi MỌI style="…" sang dạng không bị CSP chặn, và hydrateStyles() áp phần còn lại qua CSSOM (el.style.setProperty
// không bị style-src chặn). Chuỗi svg() gốc không đổi (test so khớp); mount() luôn đi đường này.
//
//   style="stroke-width:1.5px"                        → stroke-width="1.5"                (thuộc tính trình bày SVG)
//   style="stroke-width:calc(var(--chb-sw,3.4) * k)"  → data-chb-k="k"                   (luật [data-chb-k] trong stylesheet, k thuộc tập đóng K_VALUES)
//   style="overflow:visible" / style="opacity:0"      → overflow="visible" / opacity="0"
//   style="--chb-x:…;--chb-y:…" (chỉ biến tuỳ ý)      → data-chb-sty="…"                  (hydrate: style.setProperty sau khi chèn)
// Kiểu style khác ⇒ ném lỗi (không để rơi âm thầm thành "không có style").

/** hệ số nhân độ dày nét có luật CSS sẵn (sk(k) ở color.ts chỉ được dùng các giá trị này) */
export const K_VALUES = [0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15] as const;
const K_OK = new Set<string>(K_VALUES.map(String));

const NUM = '-?(?:\\d+\\.?\\d*|\\.\\d+)';
const RE_SW = new RegExp(`^stroke-width:(${NUM})px$`);
const RE_K = new RegExp(`^stroke-width:calc\\(var\\(--chb-sw,3\\.4\\) \\* (${NUM})\\)$`);
const RE_OPACITY = new RegExp(`^opacity:(${NUM})$`);
const RE_VAR = /^--chb-[\w-]+:[^;"<>&]+$/; // một khai báo biến; cấm & (thực thể HTML) để giá trị không "mở" lại dấu nháy sau khi parse
/** chuỗi chỉ gồm các khai báo biến --chb-*, ngăn cách bằng ; (tách chuỗi thay vì regex lồng nhóm: tránh ReDoS) */
const isVars = (css: string): boolean => {
  const decls = css.split(';');
  if (decls.at(-1) === '') decls.pop();
  return decls.length > 0 && decls.every((d) => RE_VAR.test(d));
};

export function strictMarkup(markup: string): string {
  return markup.replace(/ style="([^"]*)"/g, (_m, css: string) => {
    let m = RE_SW.exec(css);
    if (m) return ` stroke-width="${m[1]}"`;
    m = RE_K.exec(css);
    if (m) {
      const k = String(Number.parseFloat(m[1] as string));
      if (!K_OK.has(k)) throw new Error(`Chibi: hệ số nét ${k} chưa có luật CSS (thêm vào K_VALUES)`);
      return ` data-chb-k="${k}"`;
    }
    if (css === 'overflow:visible') return ' overflow="visible"';
    m = RE_OPACITY.exec(css);
    if (m) return ` opacity="${m[1]}"`;
    if (isVars(css)) return ` data-chb-sty="${css}"`;
    throw new Error(`Chibi: style nội tuyến chưa hỗ trợ ở đường CSP chặt: ${css.slice(0, 60)}`);
  });
}

/** áp các biến tuỳ ý (data-chb-sty) qua CSSOM rồi gỡ thuộc tính; gọi sau mỗi lần chèn markup strict vào DOM */
export function hydrateStyles(root: Element): void {
  const els: Element[] = [];
  if (root.hasAttribute('data-chb-sty')) els.push(root);
  for (const el of root.querySelectorAll('[data-chb-sty]')) els.push(el);
  for (const el of els) {
    const style = (el as SVGElement).style;
    for (const decl of (el.getAttribute('data-chb-sty') ?? '').split(';')) {
      const i = decl.indexOf(':');
      if (i > 0) style.setProperty(decl.slice(0, i).trim(), decl.slice(i + 1).trim());
    }
    el.removeAttribute('data-chb-sty');
  }
}
