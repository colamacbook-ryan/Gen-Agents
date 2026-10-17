// Đồng hồ inject được (BUILD-PLAN §A.1 scheduler, §C.3): một nguồn giờ cho scheduler, `app_now()` của SQLite và TTL vé.
// Test dùng đồng hồ giả, reset sau mỗi test (STD-11).

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/**
 * Dạng thời điểm chuẩn của DB (DATABASE §2.2, §2.4): UTC `YYYY-MM-DDTHH:MM:SS.sssZ`, đúng 24 ký tự,
 * nên so chuỗi = so thời gian. `app_now()` trả đúng dạng này.
 */
export function toDbTimestamp(date: Date): string {
  const t = date.getTime();
  if (!Number.isFinite(t)) throw new RangeError('Thời điểm không hợp lệ');
  const iso = date.toISOString();
  if (iso.length !== 24) throw new RangeError(`Năm ngoài khoảng 0000–9999: ${iso}`);
  return iso;
}

export const DB_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
