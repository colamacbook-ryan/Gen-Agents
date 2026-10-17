// Khởi chạy Chromium của Playwright (gói playwright-core; trình duyệt có sẵn ở PLAYWRIGHT_BROWSERS_PATH, KHÔNG tải trình duyệt).
import { existsSync } from 'node:fs';
import { type Browser, chromium } from 'playwright-core';

/** đường dẫn Chromium nếu có */
export function chromiumPath(): string | null {
  try {
    const p = chromium.executablePath();
    return existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

/**
 * Test trình duyệt chạy khi tìm thấy Chromium; không có thì SKIP hiện rõ trong báo cáo vitest (máy dev không có trình duyệt).
 * GA_REQUIRE_BROWSER=1 (hoặc CHIBI_REQUIRE_BROWSER=1 mà job test của CI đã đặt) ⇒ thiếu Chromium là LỖI và UI_BROWSER=skip bị bỏ qua:
 * CI không được xanh khi chưa chạy test trình duyệt. UI_BROWSER=skip chỉ tắt ở máy dev.
 */
export const browserTestsEnabled = (): boolean => {
  const required = process.env.GA_REQUIRE_BROWSER === '1' || process.env.CHIBI_REQUIRE_BROWSER === '1';
  if (!required && process.env.UI_BROWSER === 'skip') return false;
  if (chromiumPath()) return true;
  if (required)
    throw new Error('GA_REQUIRE_BROWSER=1 nhưng không tìm thấy Chromium (CI: playwright-core install chromium)');
  return false;
};

export const launch = (): Promise<Browser> => chromium.launch();
