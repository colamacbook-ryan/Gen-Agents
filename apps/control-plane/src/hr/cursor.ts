// Con trỏ phân trang của danh sách L-HR: chỉ mang `display_seq` của hàng cuối (keyset, không OFFSET). Không bao giờ được hiểu
// như tên cột; đọc sai dạng ⇒ 400 `validation.failed` (field=cursor). Sửa tay con trỏ chỉ dịch điểm bắt đầu TRONG workspace
// của chính phiên (mọi truy vấn vẫn theo workspace) nên không cần chữ ký như lưới OPS.
import { ApiError } from '../http/errors.ts';

const CURSOR_RE = /^[A-Za-z0-9_-]{2,40}$/;
const PAYLOAD_RE = /^s(\d{1,15})$/;

export function encodeCursor(displaySeq: number): string {
  return Buffer.from(`s${displaySeq}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): number {
  if (!CURSOR_RE.test(cursor)) throw new ApiError('validation.failed', { field: 'cursor' });
  const m = PAYLOAD_RE.exec(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (m === null) throw new ApiError('validation.failed', { field: 'cursor' });
  const n = Number(m[1]);
  if (!Number.isSafeInteger(n)) throw new ApiError('validation.failed', { field: 'cursor' });
  return n;
}
