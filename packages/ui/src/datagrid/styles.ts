// Stylesheet của DataGrid + thanh công thức + ô truy vấn — CONSTRUCTABLE (CSSStyleSheet.replaceSync + adoptedStyleSheets):
// chạy dưới CSP chặt `style-src 'self'` (không 'unsafe-inline', không thẻ <style>), giống @ga/chibi. Style động (độ rộng cột,
// đệm ảo hoá) đi qua CSSOM (thuộc tính style của React = element.style.setProperty), không phải thuộc tính style="…" trong HTML.
// Màu / font là biến CSS `--ga-*` (cùng tên với tokens.css của L-DS) kèm giá trị mặc định = bộ token tối STD-07 §8.

const T = {
  surface: 'var(--ga-bg-surface, #18171a)',
  raised: 'var(--ga-bg-raised, #201f23)',
  sunken: 'var(--ga-bg-sunken, #0c0b0d)',
  frozen: 'var(--ga-bg-grid-id, #141316)',
  hover: 'var(--ga-bg-hover, #201f23)',
  shadowPop: 'var(--ga-shadow-pop, 0 8px 24px rgba(0, 0, 0, 0.35))',
  rControl: 'var(--ga-r-control, 6px)',
  rInput: 'var(--ga-r-input, 4px)',
  subtle: 'var(--ga-border-subtle, #26252a)',
  strong: 'var(--ga-border-strong, #34333a)',
  primary: 'var(--ga-text-primary, #eceae6)',
  secondary: 'var(--ga-text-secondary, #a8a49d)',
  muted: 'var(--ga-text-muted, #8a857e)',
  accent: 'var(--ga-accent, #e8a33d)',
  accentSoft: 'var(--ga-accent-soft, rgba(232, 163, 61, 0.1))',
  onAccent: 'var(--ga-on-accent, #111012)',
  ok: 'var(--ga-ok, #4cb782)',
  danger: 'var(--ga-danger, #e5604d)',
  idle: 'var(--ga-idle, #8a8580)',
  sans: "var(--ga-font-sans, 'IBM Plex Sans', system-ui, sans-serif)",
  mono: "var(--ga-font-mono, 'IBM Plex Mono', ui-monospace, monospace)",
};

export const GRID_CSS = `
.ga-dg{display:flex;flex-direction:column;min-width:0;min-height:0;height:100%;box-sizing:border-box;background:${T.surface};
  border:1px solid ${T.subtle};border-radius:${T.rControl};color:${T.primary};font:400 13px/1.25 ${T.sans};overflow:hidden;position:relative}
.ga-dg *,.ga-dg *::before,.ga-dg *::after{box-sizing:border-box}
.ga-dg button,.ga-dg input,.ga-dg select,.ga-dg textarea{font:inherit;color:inherit}
.ga-dg :focus-visible{outline:2px solid ${T.accent};outline-offset:1px}
.ga-dg .ga-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}

.ga-dg-toolbar{height:36px;flex:0 0 36px;display:flex;align-items:center;gap:8px;padding:0 8px;border-bottom:1px solid ${T.subtle};position:relative}
.ga-dg-btn{height:26px;padding:0 8px;border:1px solid ${T.subtle};border-radius:4px;background:transparent;color:${T.secondary};
  font-size:12px;display:inline-flex;align-items:center;gap:4px;cursor:pointer;white-space:nowrap}
.ga-dg-btn:hover{background:${T.raised};color:${T.primary}}
.ga-dg-btn[disabled]{cursor:not-allowed;opacity:.6}
.ga-dg-btn-primary{border-color:${T.strong};color:${T.primary}}
.ga-dg-icons{display:flex;align-items:center;gap:4px}
.ga-dg-ib{width:26px;height:26px;border:0;border-radius:4px;background:transparent;color:${T.secondary};display:inline-flex;align-items:center;
  justify-content:center;cursor:pointer;padding:0}
.ga-dg-ib:hover,.ga-dg-ib[aria-pressed="true"],.ga-dg-ib[aria-expanded="true"]{background:${T.raised};color:${T.primary}}
.ga-dg-ib[disabled]{cursor:not-allowed;opacity:.5}
.ga-dg-view{height:26px;border:1px solid ${T.subtle};border-radius:4px;background:${T.surface};color:${T.primary};font-size:12px;padding:0 4px;max-width:180px}
.ga-dg-view-label{font-size:12px;color:${T.secondary};white-space:nowrap}

.ga-qb{flex:1;min-width:120px;height:26px;display:flex;align-items:center;gap:4px;padding:0 4px 0 8px;background:${T.sunken};
  border:1px solid ${T.subtle};border-radius:4px;position:relative;cursor:text}
.ga-qb[data-invalid]{border-color:${T.danger}}
.ga-qb-icon{flex:0 0 auto;color:${T.muted}}
.ga-qb-chips{display:flex;align-items:center;gap:4px;margin:0;padding:0;list-style:none;min-width:0;overflow:hidden;flex:0 1 auto}
.ga-qb-chip{display:inline-flex;align-items:center;gap:4px;height:18px;padding:0 0 0 8px;border-radius:4px;background:${T.raised};
  border:1px solid ${T.strong};font:400 11px/16px ${T.mono};color:${T.primary};white-space:nowrap}
.ga-qb-chip[data-invalid]{border-color:${T.danger}}
.ga-qb-x{border:0;background:transparent;color:${T.secondary};padding:0 4px;height:16px;line-height:16px;cursor:pointer;border-radius:3px}
.ga-qb-x:hover{color:${T.primary};background:${T.strong}}
.ga-qb-input{flex:1;min-width:60px;height:20px;background:transparent;border:0;outline:none;color:${T.primary};font:400 12px ${T.mono};padding:0}
.ga-qb-input::placeholder{color:${T.muted}}
.ga-qb:focus-within{border-color:${T.accent}}
.ga-qb .ga-qb-input:focus-visible{outline:none}
.ga-qb-error{position:absolute;left:-1px;right:-1px;top:calc(100% + 4px);z-index:30;background:${T.raised};border:1px solid ${T.danger};
  border-radius:${T.rInput};padding:4px 8px;font:400 12px/1.45 ${T.sans};color:${T.primary};box-shadow:${T.shadowPop}}
.ga-qb-error mark{background:transparent;color:${T.primary};text-decoration:underline wavy ${T.danger};font-family:${T.mono}}

.ga-fb{flex:0 0 auto;border-bottom:1px solid ${T.subtle};background:${T.surface}}
.ga-fb-line{height:32px;display:flex;align-items:stretch}
.ga-fb-ref{width:120px;flex:0 0 120px;display:flex;align-items:center;padding:0 8px;border-right:1px solid ${T.subtle};font:400 12px ${T.mono};
  color:${T.primary};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ga-fb[data-expanded] .ga-fb-ref{color:${T.accent}}
.ga-fb-fx{width:32px;flex:0 0 32px;display:flex;align-items:center;justify-content:center;border-right:1px solid ${T.subtle};
  font:italic 400 12px ${T.mono};color:${T.muted}}
.ga-fb-body{flex:1;min-width:0;display:flex;align-items:center;gap:8px;padding:0 8px;white-space:nowrap}
.ga-fb-col{font-size:11px;color:${T.secondary};white-space:nowrap}
.ga-fb-value{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;color:${T.primary}}
.ga-fb-value[data-empty]{color:${T.muted}}
.ga-fb-badge{font:400 10px/16px ${T.mono};color:${T.secondary};border:1px solid ${T.strong};border-radius:4px;padding:0 4px;white-space:nowrap}
.ga-fb-btn{height:22px;padding:0 8px;border:1px solid ${T.strong};border-radius:4px;background:transparent;color:${T.primary};font-size:11px;
  cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:4px}
.ga-fb-btn:hover{background:${T.raised}}
.ga-fb-btn-save{background:${T.accent};border-color:${T.accent};color:${T.onAccent};font-weight:500}
.ga-fb-btn-save:hover{background:${T.accent}}
.ga-fb-btn[disabled]{cursor:not-allowed;opacity:.55}
.ga-fb-kbd{font:400 10px ${T.mono};opacity:.85}
.ga-fb-editor{display:flex;height:144px;background:${T.sunken};font:400 12px/18px ${T.mono}}
.ga-fb-gutter{width:40px;flex:0 0 40px;overflow:hidden;padding:4px 8px 4px 0;text-align:right;color:${T.muted};user-select:none;
  border-right:1px solid ${T.subtle};white-space:pre}
.ga-fb-text{flex:1;min-width:0;resize:none;border:0;outline:none;background:transparent;color:${T.primary};font:inherit;padding:4px 8px;
  white-space:pre;overflow:auto;tab-size:2}
.ga-fb-reason{display:flex;align-items:center;gap:8px;padding:4px 8px;border-top:1px solid ${T.subtle};background:${T.surface}}
.ga-fb-reason label{font-size:12px;color:${T.secondary};white-space:nowrap}
.ga-fb-reason input{flex:1;min-width:0;height:24px;border:1px solid ${T.strong};border-radius:4px;background:${T.sunken};color:${T.primary};padding:0 8px;font-size:12px}
.ga-fb-status{height:22px;display:flex;align-items:center;gap:12px;padding:0 8px;font:400 10.5px ${T.mono};color:${T.muted};white-space:nowrap;overflow:hidden;
  border-top:1px solid ${T.subtle}}
.ga-fb-status .ga-fb-hint{margin-left:auto}
.ga-fb-error{color:${T.primary};display:inline-flex;align-items:center;gap:4px}
.ga-fb-error::before{content:"";width:8px;height:8px;border-radius:50%;background:${T.danger}}

.ga-dg-scroll{flex:1 1 0;min-height:0;overflow:auto;position:relative;outline:none;background:${T.surface}}
.ga-dg-scroll:focus-visible{outline:none;box-shadow:inset 0 0 0 1px ${T.accent}}
.ga-dg-table{position:relative;min-width:100%;font-size:12.5px}
.ga-dg-head{position:sticky;top:0;z-index:4;background:${T.surface}}
.ga-dg-letters{display:grid;grid-template-columns:var(--ga-dg-cols);height:16px;font:400 10px/16px ${T.mono};color:${T.muted};background:${T.frozen};border-bottom:1px solid ${T.subtle}}
.ga-dg-letters>span{text-align:center;border-right:1px solid ${T.subtle};overflow:hidden;background:${T.frozen}}
.ga-dg-hrow{display:grid;grid-template-columns:var(--ga-dg-cols);height:28px;font-size:12px;font-weight:500;color:${T.secondary};border-bottom:1px solid ${T.strong}}
.ga-dg-th{position:relative;display:flex;align-items:center;gap:4px;padding:0 8px;border-right:1px solid ${T.subtle};background:${T.surface};min-width:0}
.ga-dg-th[data-align="end"] .ga-dg-th-btn{justify-content:flex-end}
.ga-dg-th-btn{flex:1;min-width:0;height:100%;display:flex;align-items:center;gap:4px;border:0;background:transparent;padding:0;cursor:pointer;
  text-align:left;color:inherit;font-weight:inherit;white-space:nowrap;overflow:hidden}
.ga-dg-th-btn[disabled]{cursor:default}
.ga-dg-th-name{overflow:hidden;text-overflow:ellipsis}
.ga-dg-kind{font:400 10px ${T.mono};color:${T.muted};flex:0 0 auto}
.ga-dg-sorted{color:${T.accent};font:400 10px ${T.mono};flex:0 0 auto}
.ga-dg-resize{position:absolute;right:-3px;top:0;width:6px;height:100%;cursor:col-resize;z-index:3;touch-action:none}
.ga-dg-resize:hover,.ga-dg-resize[data-active]{background:${T.accent}}
.ga-dg-fz0{position:sticky;left:0;z-index:2;background:${T.frozen};border-right:1px solid ${T.subtle};display:flex;align-items:center;justify-content:center}
.ga-dg-fz1{position:sticky;left:28px;z-index:2;background:${T.frozen};border-right:1px solid ${T.strong}}
.ga-dg-th.ga-dg-fz0,.ga-dg-th.ga-dg-fz1{background:${T.frozen};z-index:5}
.ga-dg-th.ga-dg-fz1{gap:4px;padding:0 8px}
.ga-dg-pk{margin-left:auto;font:400 10px ${T.mono};color:${T.muted}}
.ga-dg-body{position:relative}
.ga-dg-row{display:grid;grid-template-columns:var(--ga-dg-cols);height:var(--ga-dg-row-h, 28px);border-bottom:1px solid ${T.subtle};position:relative;background:${T.surface}}
.ga-dg-row:hover{background:${T.hover}}
.ga-dg-row[data-active],.ga-dg-row[aria-selected="true"]{background:${T.raised}}
.ga-dg-row[data-kind="proposed"]{background:${T.accentSoft}}
.ga-dg-row[data-kind="wounded"]{box-shadow:inset 3px 0 0 ${T.idle}}
.ga-dg-row[data-kind="superseded"] .ga-dg-text{color:${T.secondary};text-decoration:line-through;text-decoration-color:${T.muted}}
.ga-dg-cell{position:relative;display:flex;align-items:center;gap:4px;padding:0 8px;border-right:1px solid ${T.subtle};overflow:hidden;
  white-space:nowrap;min-width:0;cursor:cell}
.ga-dg-cell[data-align="end"]{justify-content:flex-end;font-family:${T.mono};font-size:12px;font-variant-numeric:tabular-nums}
.ga-dg-cell[data-align="center"]{justify-content:center}
.ga-dg-cell[data-active]{box-shadow:inset 0 0 0 1.5px ${T.accent};z-index:1}
.ga-dg-cell[data-mono]{font-family:${T.mono};font-size:11.5px}
.ga-dg-text{overflow:hidden;text-overflow:ellipsis;min-width:0}
.ga-dg-cell[data-align="end"] .ga-dg-text{flex:0 1 auto}
.ga-dg-cell:not([data-align]) .ga-dg-text{flex:1 1 auto}
.ga-dg-id{font:400 12px ${T.mono};display:flex;align-items:center;gap:4px;padding:0 8px;overflow:hidden;white-space:nowrap}
.ga-dg-dot{width:6px;height:6px;border-radius:50%;background:${T.accent};flex:0 0 auto}
.ga-dg-check{appearance:none;-webkit-appearance:none;margin:0;width:12px;height:12px;border:1px solid ${T.muted};border-radius:3px;background:transparent;cursor:pointer;
  display:inline-grid;place-content:center}
.ga-dg-check:checked{background:${T.accent};border-color:${T.accent}}
.ga-dg-check:checked::after{content:"";width:6px;height:3px;border-left:1.5px solid ${T.onAccent};border-bottom:1.5px solid ${T.onAccent};transform:translateY(-1px) rotate(-45deg)}
.ga-dg-check:indeterminate{background:${T.accent};border-color:${T.accent}}
.ga-dg-check:indeterminate::after{content:"";width:6px;height:1.5px;background:${T.onAccent}}
.ga-dg-chev{margin-left:auto;flex:0 0 auto;display:inline-flex;color:${T.muted}}
.ga-dg-tok{font:400 10px/16px ${T.mono};color:${T.secondary};background:${T.raised};border-radius:4px;padding:0 4px;flex:0 0 auto}
.ga-dg-switch{position:relative;width:26px;height:14px;border-radius:7px;border:1px solid ${T.strong};background:${T.raised};padding:0;cursor:pointer;flex:0 0 auto}
.ga-dg-switch::after{content:"";position:absolute;top:1px;left:1px;width:10px;height:10px;border-radius:50%;background:${T.secondary}}
.ga-dg-switch[aria-checked="true"]{background:${T.ok};border-color:${T.ok}}
.ga-dg-switch[aria-checked="true"]::after{left:13px;background:${T.onAccent}}
.ga-dg-switch[aria-disabled="true"]{cursor:default;opacity:.7}
.ga-dg-skel{display:block;height:8px;width:70%;border-radius:4px;background:${T.raised}}
.ga-dg-editor{position:absolute;inset:0;width:100%;height:100%;border:0;margin:0;padding:0 8px;background:${T.sunken};color:${T.primary};
  box-shadow:inset 0 0 0 1.5px ${T.accent};outline:none;font:inherit;z-index:3}
.ga-dg-meta{display:flex;align-items:center;gap:4px;padding:0 8px;overflow:hidden;white-space:nowrap}
.ga-dg-badge{display:inline-flex;align-items:center;height:18px;padding:0 4px;border-radius:${T.rInput};font-size:11px;font-weight:500;color:${T.onAccent};background:${T.accent}}
.ga-dg-mini{height:20px;padding:0 8px;border:1px solid ${T.strong};border-radius:4px;background:${T.surface};color:${T.primary};font-size:11px;cursor:pointer}
.ga-dg-mini-ok{border-color:${T.ok};color:${T.ok}}
.ga-dg-link{border:0;background:transparent;padding:0;color:${T.accent};font:400 11.5px ${T.mono};cursor:pointer;text-decoration:underline}
.ga-dg-grouprow{grid-column:1 / -1;display:flex;align-items:center;gap:8px;height:var(--ga-dg-row-h, 28px);padding:0 8px;background:${T.frozen};border-bottom:1px solid ${T.strong};
  font-size:12px;color:${T.secondary};position:sticky;left:0}
.ga-dg-grouprow[data-active]{box-shadow:inset 0 0 0 1.5px ${T.accent}}
.ga-dg-gtoggle{border:0;background:transparent;color:${T.primary};padding:0 4px;cursor:pointer;font:400 12px ${T.mono}}

.ga-dg-footer{height:28px;flex:0 0 28px;display:flex;align-items:center;gap:16px;padding:0 12px;border-top:1px solid ${T.subtle};background:${T.frozen};
  font-size:11.5px;color:${T.muted};white-space:nowrap;overflow:hidden}
.ga-dg-num{font-family:${T.mono};color:${T.secondary};font-variant-numeric:tabular-nums}
.ga-dg-sumval{font-family:${T.mono};color:${T.primary};font-variant-numeric:tabular-nums}
.ga-dg-footer-end{margin-left:auto;display:inline-flex;align-items:center;gap:12px;font-family:${T.mono}}
.ga-dg-banner{display:flex;align-items:center;gap:8px;padding:4px 12px;background:var(--ga-danger-soft, rgba(229, 96, 77, 0.14));border-bottom:1px solid ${T.danger};
  font-size:12px;color:${T.primary}}
.ga-dg-banner::before{content:"";width:8px;height:8px;border-radius:50%;background:${T.danger};flex:0 0 auto}
.ga-dg-emptyrow{display:block;border-bottom:0}
.ga-dg-empty{position:sticky;left:0;width:max-content;max-width:100%;display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:24px 16px;color:${T.secondary};font-size:13px}

.ga-dg-pop{position:absolute;top:34px;z-index:20;min-width:240px;max-width:360px;background:${T.raised};border:1px solid ${T.strong};border-radius:6px;
  box-shadow:${T.shadowPop};padding:8px;display:flex;flex-direction:column;gap:8px;font-size:12px}
.ga-dg-pop-title{font-size:12px;font-weight:600;color:${T.primary}}
.ga-dg-pop-row{display:flex;align-items:center;gap:8px}
.ga-dg-pop-row label{color:${T.secondary};min-width:64px}
.ga-dg-pop select,.ga-dg-pop input[type="text"]{flex:1;min-width:0;height:24px;border:1px solid ${T.strong};border-radius:4px;background:${T.sunken};
  color:${T.primary};padding:0 8px;font-size:12px}
.ga-dg-pop-list{display:flex;flex-direction:column;gap:4px;max-height:240px;overflow:auto;margin:0;padding:0;list-style:none}
.ga-dg-pop-list label{display:flex;align-items:center;gap:8px;padding:4px;border-radius:4px;color:${T.primary};cursor:pointer}
.ga-dg-pop-list label:hover{background:${T.strong}}
.ga-dg-pop-actions{display:flex;justify-content:flex-end;gap:8px}
.ga-dg-letter{font:400 10px ${T.mono};color:${T.secondary};min-width:20px}
.ga-dg-status{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
@media (prefers-reduced-motion: no-preference){
  .ga-dg-row,.ga-dg-ib,.ga-dg-btn,.ga-dg-switch::after{transition:background-color .12s ease-out,left .12s ease-out}
}
`;

let sheet: CSSStyleSheet | null = null;
const adopted = new WeakSet<object>();

/**
 * Gắn stylesheet của lưới vào document / shadow root (idempotent). Không có đường dự phòng bằng thẻ <style> (sẽ buộc CSP nới
 * style-src): trình duyệt thiếu constructable stylesheet (Chromium < 73, Firefox < 101, Safari < 16.4) ⇒ ném lỗi rõ ràng.
 */
export function adoptGridStyles(root: Document | ShadowRoot): void {
  if (adopted.has(root)) return;
  if (
    typeof CSSStyleSheet === 'undefined' ||
    !('replaceSync' in CSSStyleSheet.prototype) ||
    !('adoptedStyleSheets' in root)
  ) {
    throw new Error(
      'DataGrid: trình duyệt không hỗ trợ constructable stylesheet (CSSStyleSheet.replaceSync + adoptedStyleSheets)',
    );
  }
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(GRID_CSS);
  }
  if (!root.adoptedStyleSheets.includes(sheet)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  adopted.add(root);
}

/** document hoặc shadow root chứa phần tử */
export function styleRootOf(el: Node): Document | ShadowRoot {
  const r = el.getRootNode();
  return r instanceof ShadowRoot || r instanceof Document ? r : document;
}
