// Định dạng số / ngày theo ngôn ngữ giao diện. Không hardcode múi giờ (STD-06): nhận `timeZone` từ cài đặt workspace.
import type { Locale } from './index.ts';

const INTL_LOCALE: Record<Locale, string> = { vi: 'vi-VN', en: 'en-US' };

export function intlLocale(locale: Locale): string {
  return INTL_LOCALE[locale];
}

/** `1284` → "1.284" (vi) / "1,284" (en). */
export function formatInt(n: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(n);
}

export function formatNumber(n: number, locale: Locale, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits }).format(n);
}

export interface DateFormatOptions {
  timeZone?: string;
}

/** "14:02" theo giờ 24, múi giờ của workspace (không truyền ⇒ múi giờ trình duyệt). */
export function formatClock(d: Date, locale: Locale, opts: DateFormatOptions = {}): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(opts.timeZone ? { timeZone: opts.timeZone } : {}),
  }).format(d);
}

/** "14:02:31" cho dòng log. */
export function formatClockSeconds(d: Date, locale: Locale, opts: DateFormatOptions = {}): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    ...(opts.timeZone ? { timeZone: opts.timeZone } : {}),
  }).format(d);
}

/** "14/10/2026 14:02" (vi) — ngày + giờ. */
export function formatDateTime(d: Date, locale: Locale, opts: DateFormatOptions = {}): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: 'short',
    timeStyle: 'short',
    hour12: false,
    ...(opts.timeZone ? { timeZone: opts.timeZone } : {}),
  }).format(d);
}

/** Khoá ngày theo lịch của múi giờ (để gom "Hôm nay / Trước đó"): `YYYY-MM-DD`. */
export function dayKey(d: Date, opts: DateFormatOptions = {}): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(opts.timeZone ? { timeZone: opts.timeZone } : {}),
  }).format(d);
}

/** `26214400` → "25 MB" (cơ số 1024, đơn vị giữ nguyên chữ quốc tế). */
export function formatBytes(bytes: number, locale: Locale): string {
  const units = ['B', 'KB', 'MB', 'GB'] as const;
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${formatNumber(value, locale, i === 0 ? 0 : 1)} ${units[i]}`;
}
