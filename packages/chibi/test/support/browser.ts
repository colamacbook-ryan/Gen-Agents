// Khởi chạy Chromium của Playwright (gói playwright-core, trình duyệt có sẵn ở PLAYWRIGHT_BROWSERS_PATH; KHÔNG tải trình duyệt).
import { existsSync } from 'node:fs';
import { type Browser, chromium } from 'playwright-core';

/** có Chromium để chạy test trình duyệt không */
export function chromiumPath(): string | null {
  try {
    const p = chromium.executablePath();
    return existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

/**
 * Test trình duyệt chạy khi tìm thấy Chromium. Không có thì SKIP hiển thị rõ trong báo cáo vitest — trừ khi CHIBI_REQUIRE_BROWSER=1
 * (CI của lane component đặt biến này) thì thiếu Chromium là LỖI. CHIBI_BROWSER=skip tắt hẳn (máy không có trình duyệt).
 */
export const browserTestsEnabled = (): boolean => {
  if (process.env.CHIBI_BROWSER === 'skip') return false;
  if (chromiumPath()) return true;
  if (process.env.CHIBI_REQUIRE_BROWSER === '1')
    throw new Error('CHIBI_REQUIRE_BROWSER=1 nhưng không tìm thấy Chromium');
  return false;
};

export const launch = (): Promise<Browser> => chromium.launch();
