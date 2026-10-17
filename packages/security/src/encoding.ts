// Mã hoá nhị phân ↔ chữ, so sánh hằng thời gian. Chỉ dùng node:crypto / Buffer, không gói ngoài.
import { timingSafeEqual } from 'node:crypto';

const B64URL_RE = /^[A-Za-z0-9_-]*$/;

/** base64url không padding (RFC 4648 §5). */
export function b64urlEncode(data: Uint8Array): string {
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('base64url');
}

/**
 * Giải base64url CHẶT: chỉ ký tự [A-Za-z0-9_-], không padding, độ dài hợp lệ, và mã hoá lại phải ra đúng chuỗi cũ
 * (chặn biến thể "nhiều chuỗi cùng giải ra một giá trị" — bit thừa ở ký tự cuối). Sai ⇒ null.
 */
export function b64urlDecodeStrict(text: string): Buffer | null {
  if (!B64URL_RE.test(text) || text.length % 4 === 1) return null;
  const buf = Buffer.from(text, 'base64url');
  return buf.toString('base64url') === text ? buf : null;
}

/** So hai chuỗi byte hằng thời gian theo nội dung; khác độ dài ⇒ false (độ dài không phải bí mật ở đây). */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(a, b);
}

/** Ghép các trường thành một chuỗi byte không mơ hồ: mỗi trường = độ dài 4 byte big-endian + nội dung UTF-8. */
export function lengthPrefixed(...fields: string[]): Buffer {
  const parts: Buffer[] = [];
  for (const f of fields) {
    const body = Buffer.from(f, 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.byteLength, 0);
    parts.push(len, body);
  }
  return Buffer.concat(parts);
}
