import { toDbTimestamp } from '@ga/contracts';

// Tiện ích xử lý output CLI (dữ liệu từ ngoài): chặn kích thước TRƯỚC khi quét, không regex có quantifier lồng,
// mọi vòng lặp tuyến tính theo độ dài đầu vào (STD-11 1.13: bộ lọc / parser nhận dữ liệu ngoài).

/** Trần một dòng stdout được parse JSON. Dòng dài hơn bị bỏ qua (đếm ở stats), không JSON.parse. */
export const MAX_LINE_BYTES = 1024 * 1024;
/** Trần phần đuôi stdout / stderr mà bộ phân loại lỗi đọc. */
export const MAX_CLASSIFY_STDOUT_CHARS = 4 * 1024 * 1024;
export const MAX_CLASSIFY_STDERR_CHARS = 64 * 1024;
/** Trần văn bản `--help` / output probe được parse. */
export const MAX_PROBE_TEXT_CHARS = 512 * 1024;
/** Trần chuỗi đem so khớp từ khoá (đã hạ chữ thường). */
export const MAX_HAYSTACK_CHARS = 64 * 1024;

export function tail(text: string, maxChars: number): string {
  return text.length > maxChars ? text.slice(text.length - maxChars) : text;
}

export function head(text: string, maxChars: number): string {
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

/** Cắt chuỗi cho trường `detail` (≤ 500 ký tự theo contracts). */
export function clip(text: string, max = 500): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/** Tách dòng (\n hoặc \r\n) tuyến tính; bỏ dòng rỗng. */
export function splitLines(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text.charCodeAt(i) === 10) {
      let end = i;
      if (end > start && text.charCodeAt(end - 1) === 13) end--;
      if (end > start) out.push(text.slice(start, end));
      start = i + 1;
    }
  }
  return out;
}

export type JsonObject = Record<string, unknown>;

export function isObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** JSON.parse một dòng có chặn kích thước; chỉ nhận object. Lỗi parse ⇒ null (người gọi tự đếm / ghi lý do). */
export function parseJsonObject(line: string, maxBytes = MAX_LINE_BYTES): JsonObject | null {
  if (line.length > maxBytes) return null;
  const t = line.trim();
  if (t.length < 2 || t.charCodeAt(0) !== 123 /* { */) return null;
  try {
    const v: unknown = JSON.parse(t);
    return isObject(v) ? v : null;
  } catch {
    return null;
  }
}

export function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/** Số nguyên không âm (đếm token); khác ⇒ null. */
export function count(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
}

export function obj(v: unknown): JsonObject | null {
  return isObject(v) ? v : null;
}

/** Hạ chữ thường + chặn độ dài để so khớp từ khoá bằng `includes` (tuyến tính). */
export function haystack(...parts: Array<string | null | undefined>): string {
  let s = '';
  for (const p of parts) {
    if (!p) continue;
    s += `${p}\n`;
    if (s.length >= MAX_HAYSTACK_CHARS) break;
  }
  return head(s, MAX_HAYSTACK_CHARS).toLowerCase();
}

export function includesAny(hay: string, needles: readonly string[]): boolean {
  for (const n of needles) if (hay.includes(n)) return true;
  return false;
}

/** Giây Unix ⇒ dạng ts DB; giá trị lạ (không hữu hạn, ngoài 2000–2100) ⇒ null (không đoán giờ reset). */
export function epochSecondsToDb(v: unknown): string | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const ms = v * 1000;
  if (ms < Date.UTC(2000, 0, 1) || ms > Date.UTC(2100, 0, 1)) return null;
  return toDbTimestamp(new Date(Math.round(ms)));
}

/**
 * Che danh tính để ghi `account_hint` (DATABASE: "mask ngay lúc ghi", dạng `r***@gmail.com`).
 * Chỉ nhận email (một `@`, có tên miền chứa dấu chấm); khác ⇒ null (không ghi gì còn hơn ghi bản rõ).
 */
export function maskAccountHint(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s.length < 3 || s.length > 254) return null;
  const at = s.indexOf('@');
  if (at <= 0 || at !== s.lastIndexOf('@') || at === s.length - 1) return null;
  const domain = s.slice(at + 1).toLowerCase();
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) return null;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 32 || c === 127) return null;
  }
  const first = String.fromCodePoint(s.codePointAt(0) ?? 63);
  const masked = `${first}***@${domain}`;
  return masked.length <= 120 ? masked : null;
}
