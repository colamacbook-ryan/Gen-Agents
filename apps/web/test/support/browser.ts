// Chromium thật của Playwright (gói playwright-core; trình duyệt có sẵn ở PLAYWRIGHT_BROWSERS_PATH, KHÔNG tải trình duyệt).
// Không có Chromium thì nhóm test này SKIP hiển thị rõ; GA_REQUIRE_BROWSER=1 (hoặc CHIBI_REQUIRE_BROWSER=1 mà CI đã đặt) biến thiếu
// Chromium thành LỖI — CI không được xanh khi chưa chạy test trình duyệt. GA_BROWSER=skip chỉ tắt ở máy dev.
import { existsSync } from 'node:fs';
import { type Browser, type BrowserContext, chromium, type Page } from 'playwright-core';
import { createFakeAuthServer, type FakeAuthOptions, type FakeAuthServer } from './fake-auth-server.ts';

export function chromiumPath(): string | null {
  try {
    const p = chromium.executablePath();
    return existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

const required = (): boolean => process.env.GA_REQUIRE_BROWSER === '1' || process.env.CHIBI_REQUIRE_BROWSER === '1';

export function browserTestsEnabled(): boolean {
  if (!required() && process.env.GA_BROWSER === 'skip') return false;
  if (chromiumPath()) return true;
  if (required())
    throw new Error('GA_REQUIRE_BROWSER=1 nhưng không tìm thấy Chromium (CI: playwright-core install chromium)');
  return false;
}

export const launch = (): Promise<Browser> => chromium.launch();

export interface Watched {
  /** mọi vi phạm CSP (sự kiện securitypolicyviolation + thông báo console của Chromium) */
  violations: string[];
  /** console error / warning khác và lỗi trang chưa bắt */
  problems: string[];
  /** yêu cầu tới origin khác hoặc bị hỏng */
  badRequests: string[];
  /** đường dẫn đã tải (để kiểm font subset) */
  requested: string[];
}

/** Gắn bộ bắt vi phạm CSP / lỗi console / yêu cầu lạ vào trang MỚI (chạy trước mọi script của trang). */
export async function watch(page: Page, origin: string): Promise<Watched> {
  const w: Watched = { violations: [], problems: [], badRequests: [], requested: [] };
  await page.addInitScript(() => {
    const store: string[] = [];
    (window as unknown as { __csp: string[] }).__csp = store;
    document.addEventListener('securitypolicyviolation', (e) => {
      store.push(
        `${e.violatedDirective} blocked=${e.blockedURI} source=${e.sourceFile}:${e.lineNumber} sample=${e.sample}`,
      );
    });
  });
  page.on('console', (m) => {
    const text = m.text();
    if (/content security policy|refused to (apply|load|execute|connect|create)/i.test(text))
      w.violations.push(`console: ${text}`);
    else if (m.type() === 'error' && /status of 401/.test(text) && m.location().url.endsWith('/api/auth/session'))
      return; // phiên chưa có: máy chủ trả 401 theo đặc tả, Chromium ghi vào console
    else if (m.type() === 'error' || m.type() === 'warning') w.problems.push(`console.${m.type()}: ${text}`);
  });
  page.on('pageerror', (e) => w.problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    const reason = r.failure()?.errorText ?? '';
    // yêu cầu đang bay bị huỷ khi trang điều hướng / tải lại là bình thường
    if (reason !== 'net::ERR_ABORTED') w.badRequests.push(`failed: ${r.url()} ${reason}`);
  });
  page.on('response', (r) => {
    const url = new URL(r.url());
    w.requested.push(url.pathname);
    if (url.origin !== origin) w.badRequests.push(`ngoài origin: ${r.url()}`);
  });
  return w;
}

/** Vi phạm CSP ghi nhận trong trang (sự kiện) + vi phạm ghi ở phía Playwright. */
export async function allViolations(page: Page, w: Watched): Promise<string[]> {
  const inPage = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
  return [...w.violations, ...inPage];
}

/** Chuyển các yêu cầu /api/auth/* của trang sang máy chủ giả (đặc tả L-SEC); trả máy chủ để test đọc trạng thái. */
export async function fakeAuthApi(context: BrowserContext, opts: FakeAuthOptions = {}): Promise<FakeAuthServer> {
  const server = createFakeAuthServer(opts);
  await context.route('**/api/auth/**', async (route) => {
    const req = route.request();
    const body = req.postData();
    const request = new Request(req.url(), {
      method: req.method(),
      headers: await req.allHeaders(),
      body: req.method() === 'GET' || body === null ? undefined : body,
    });
    const res = await server.handle(request);
    await route.fulfill({
      status: res.status,
      headers: Object.fromEntries(res.headers),
      body: res.status === 204 ? undefined : await res.text(),
    });
  });
  return server;
}
