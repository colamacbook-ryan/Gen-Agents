import { useEffect, useState } from 'react';

/** Số giây còn lại tới mốc `until` (ms, theo `now`); 0 khi đã qua hoặc không có mốc. Cập nhật mỗi giây. */
export function useCountdown(until: number | null, now: () => number = Date.now): number {
  const [, tick] = useState(0);
  useEffect(() => {
    if (until === null) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [until]);
  return until === null ? 0 : Math.max(0, Math.ceil((until - now()) / 1000));
}

/** 75 → "1:15"; 9 → "0:09". */
export function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
