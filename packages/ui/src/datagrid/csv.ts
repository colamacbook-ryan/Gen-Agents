// Xuất CSV (RFC 4180, CRLF, UTF-8 có BOM để Excel đọc đúng tiếng Việt) + chặn CSV injection (OWASP):
// ô CHỮ bắt đầu bằng = + - @ TAB CR (kể cả bản fullwidth) bị thêm tiền tố ' để bảng tính không coi là công thức.
// Ô số / bool là giá trị thật nên không cần tiền tố (số âm vẫn là số).
import type { CellValue } from './types.ts';

export const CSV_BOM = '\uFEFF';
export const CSV_EOL = '\r\n';

const FORMULA_LEADS = new Set(['=', '+', '-', '@', '\t', '\r', '\uFF1D', '\uFF0B', '\uFF0D', '\uFF20']);
const NEEDS_QUOTE = /[",\r\n]/;

/** một trường CSV từ giá trị thô của ô */
export function csvField(value: CellValue): string {
  if (value === null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  let s = value;
  if (s.length > 0 && FORMULA_LEADS.has(s[0] as string)) s = `'${s}`;
  if (NEEDS_QUOTE.test(s) || s.trim() !== s) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

/** một dòng CSV (kèm CRLF) */
export const csvLine = (fields: readonly CellValue[]): string => fields.map(csvField).join(',') + CSV_EOL;

/** tên tệp an toàn: chỉ chữ / số / - / _ / . (không đường dẫn, không ký tự điều khiển) */
export function csvFileName(base: string): string {
  const clean = base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  return `${clean.slice(0, 80) || 'export'}.csv`;
}
