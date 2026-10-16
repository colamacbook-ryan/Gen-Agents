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
 * Test trình duyệt chạy khi tìm thấy Chromium. Không có thì SKIP hiển thị rõ trong báo cáo vitest (máy dev không có trình duyệt).
 * CHIBI_REQUIRE_BROWSER=1 (CI đặt biến này) thì thiếu Chromium là LỖI, và CHIBI_BROWSER=skip bị bỏ qua: CI không được xanh
 * khi chưa chạy test trình duyệt. CHIBI_BROWSER=skip chỉ tắt ở máy dev.
 */
export const browserTestsEnabled = (): boolean => {
  const required = process.env.CHIBI_REQUIRE_BROWSER === '1';
  if (!required && process.env.CHIBI_BROWSER === 'skip') return false;
  if (chromiumPath()) return true;
  if (required)
    throw new Error('CHIBI_REQUIRE_BROWSER=1 nhưng không tìm thấy Chromium (CI: playwright-core install chromium)');
  return false;
};

export const launch = (): Promise<Browser> => chromium.launch();
