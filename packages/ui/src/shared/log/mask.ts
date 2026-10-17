// Che bí mật phía trình duyệt (phòng thủ nhiều lớp: server đã lọc bằng bộ che của @ga/security trước khi gửi; đây chỉ là lớp cuối
// cho trường hợp dòng log lọt qua). Mẫu tuyến tính, không lookaround, không lượng từ lồng (lint no-redos-regex).
export const MASK = '••••••••';

const PATTERNS: readonly RegExp[] = [
  // khoá API dạng tiền tố phổ biến: sk-…, ghp_…, xoxb-…
  /\b(?:sk|pk|ghp|gho|xoxb|xoxp)[-_][A-Za-z0-9_-]{16,}/g,
  // Authorization: Bearer <token>
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
  // tên: giá trị  (api_key=…, token: …, password=…, secret=…)
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|passwd)\s*[=:]\s*\S+/gi,
  // chuỗi hex dài (khoá, hash dùng làm bí mật)
  /\b[0-9a-f]{40,}\b/gi,
];

/** Thay mọi đoạn trông như bí mật bằng `••••••••`; giữ tên trường nếu có ("token=••••••••"). */
export function maskSecrets(text: string): string {
  let out = text;
  for (const re of PATTERNS) {
    out = out.replace(re, (m) => {
      const eq = /^([A-Za-z_-]+\s*[=:]\s*)/.exec(m);
      return eq ? `${eq[1]}${MASK}` : MASK;
    });
  }
  return out;
}
