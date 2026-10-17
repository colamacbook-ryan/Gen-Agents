// Content-Security-Policy của Admin GUI (lane rule L-DS): `default-src 'self'; style-src 'self'` — không style nội tuyến, không
// 'unsafe-eval', không 'unsafe-inline', không tài nguyên ngoài. Các chỉ thị thêm bên dưới KHÔNG nới gì (chúng không có trong
// default-src nên cần khai riêng): chặn nhúng khung, đổi <base>, gửi form ra ngoài, plugin.
// Một nguồn cho dev server, preview và bài test; edge (Caddy) phải gửi đúng chuỗi này ở bản phát hành.
export const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'style-src': ["'self'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
  'object-src': ["'none'"],
} as const;

export const CSP_HEADER_NAME = 'Content-Security-Policy';

export const CSP_VALUE: string = Object.entries(CSP_DIRECTIVES)
  .map(([name, sources]) => `${name} ${sources.join(' ')}`)
  .join('; ');

export const cspHeaders = { [CSP_HEADER_NAME]: CSP_VALUE } as const;
