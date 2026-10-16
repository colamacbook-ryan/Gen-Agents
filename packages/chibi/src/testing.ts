// @ga/chibi/testing — CHỈ cho test so khớp. svg() trả chuỗi SVG mang style="…" nội tuyến (cần style-src-attr 'unsafe-inline'),
// nên KHÔNG nằm ở export chính và apps/** KHÔNG được import tệp này (test/boundary.test.ts chặn). Ứng dụng dùng mount() (đường CSP chặt).
export type { SvgOptions } from './render.ts';
export { svg } from './render.ts';
