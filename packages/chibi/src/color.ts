// Màu + số học nhỏ dùng khi dựng SVG. Chỉ nhận màu dạng #RRGGBB (schema chặn mọi dạng khác trước khi tới đây).

export const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
export const rgb = (h: string): [number, number, number] => {
  const c = (i: number) => Number.parseInt(h.slice(i, i + 2), 16);
  return [c(1), c(3), c(5)];
};
export const hex = (a: readonly number[]): string =>
  `#${a.map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;
export const mix = (a: string, b: string, t: number): string => {
  const A = rgb(a);
  const B = rgb(b);
  return hex(A.map((v, i) => v + ((B[i] ?? 0) - v) * t));
};
export const shade = (c: string, t = 0.2): string => mix(c, '#2A1030', t);
export const lite = (c: string, t = 0.25): string => mix(c, '#FFFFFF', t);
/** làm tròn 2 chữ số thập phân (giữ chuỗi SVG ngắn, ổn định) */
export const f = (n: number): number => +n.toFixed(2);
export const INK = '#2A1B22';
/** style nét: độ dày nhân với biến --sw (độ dày chuẩn hoá theo cỡ hiển thị) */
export const sk = (k: number): string => `style="stroke-width:calc(var(--sw,3.4) * ${k})"`;

/** thoát ký tự đặc biệt cho giá trị thuộc tính SVG / HTML (nhãn, tên: dữ liệu từ ngoài vào) */
export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (ch) =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;',
  );
