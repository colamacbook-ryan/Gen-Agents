// Đọc thân request có trần (API_LIMITS.bodyBytes = 1 MiB): chặn TRƯỚC khi parse JSON.
//   - `Content-Length` khai > trần ⇒ 413 ngay (không đọc byte nào).
//   - Đếm byte KHI ĐANG đọc luồng: vượt trần ⇒ huỷ luồng, 413 — kể cả khi Content-Length nói dối (nhỏ hơn thật) hoặc
//     không có (chunked).
//   - Thân rỗng ⇒ `undefined` (không có body). Có byte ⇒ bắt buộc `application/json` + UTF-8 hợp lệ + JSON parse được.
import { ApiError } from './errors.ts';

/** Content-Length khai báo vượt trần? (header lạ / âm ⇒ coi như không khai; đếm luồng vẫn chặn). */
export function declaredTooLarge(contentLength: string | null | undefined, maxBytes: number): boolean {
  if (contentLength === null || contentLength === undefined) return false;
  if (!/^\d{1,16}$/.test(contentLength.trim())) return false;
  return Number(contentLength.trim()) > maxBytes;
}

export const tooLarge = (): ApiError => new ApiError('upload.too_large', { reason: 'body_bytes' });

/** Đọc toàn bộ thân với trần byte. Vượt ⇒ ném 413 (`upload.too_large`, reason `body_bytes`). */
export async function readBodyCapped(req: Request, maxBytes: number): Promise<Uint8Array> {
  if (declaredTooLarge(req.headers.get('content-length'), maxBytes)) throw tooLarge();
  if (req.body === null) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

const JSON_CT_RE = /^application\/json\s*(?:;\s*charset\s*=\s*"?utf-8"?\s*)?$/i;

/** Byte ⇒ giá trị JSON (hoặc `undefined` nếu rỗng). Sai content-type / UTF-8 / JSON ⇒ 400 `validation.failed`. */
export function parseJsonBody(bytes: Uint8Array, contentType: string | null | undefined): unknown {
  if (bytes.byteLength === 0) return undefined;
  if (!contentType || !JSON_CT_RE.test(contentType.trim())) {
    throw new ApiError('validation.failed', { reason: 'content_type' });
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ApiError('validation.failed', { reason: 'encoding' });
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError('validation.failed', { reason: 'json' });
  }
}
