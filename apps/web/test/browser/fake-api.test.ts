// Chromium THẬT + backend giả: trang đăng nhập → (phiên, CSRF, client gõ kiểu, schema) → tổng quan + DataGrid đọc dữ liệu từ backend giả,
// dưới CSP chặt. Và: bản PHÁT HÀNH không chứa backend giả (quét gói build); bản bật cờ thì có (đối chứng để phép quét không rỗng).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FAKE_BACKEND_MARKER, type FakeControl } from '../../src/api/fake/index.ts';
import { allViolations, browserTestsEnabled, launch, type Watched, watch } from '../support/browser.ts';
import { buildForTest, type Started, startPreview } from '../support/servers.ts';

const enabled = browserTestsEnabled();
const suite = enabled ? describe : describe.skip;

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? filesUnder(p) : [p];
  });
}
const allText = (dir: string): string =>
  filesUnder(dir)
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
// các dấu hiệu chỉ có trong mã backend giả / trang dò
const FAKE_SIGNS = [FAKE_BACKEND_MARKER, '__gaFake', '__api-probe', 'fake.local'];

suite('backend giả trong Chromium thật + bản phát hành không chứa nó', () => {
  let browser: Browser;
  let prev: Started;
  const cleanups: (() => void)[] = [];
  const contexts: BrowserContext[] = [];
  let fakeDir = '';
  let releaseDir = '';

  beforeAll(async () => {
    browser = await launch();
    const fake = await buildForTest({ 'import.meta.env.VITE_GA_FAKE': JSON.stringify('1') });
    const release = await buildForTest({});
    cleanups.push(fake.cleanup, release.cleanup);
    fakeDir = fake.outDir;
    releaseDir = release.outDir;
    prev = await startPreview(fake.outDir);
  }, 300_000);
  afterAll(async () => {
    for (const c of contexts) await c.close();
    await browser?.close();
    await prev?.close();
    for (const c of cleanups) c();
  });

  async function openLogin(): Promise<{ page: Page; w: Watched }> {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    contexts.push(context);
    const page = await context.newPage();
    const w = await watch(page, prev.origin);
    await page.goto(new URL('/login', prev.url).toString());
    // main.tsx dùng top-level await để nạp backend giả: chờ tay cầm xuất hiện
    await page.waitForFunction(() => '__gaFake' in globalThis);
    return { page, w };
  }

  // Hàm đưa vào page.evaluate được tuần tự hoá nguyên văn: chỉ dùng `globalThis`, không tham chiếu biến ngoài (và không eval: CSP chặn).
  const credentials = (page: Page) =>
    page.evaluate(() => (globalThis as unknown as { __gaFake: FakeControl }).__gaFake.credentials);
  const callLog = (page: Page) =>
    page.evaluate(() =>
      (globalThis as unknown as { __gaFake: FakeControl }).__gaFake.calls.map((c) => `${c.routeId}:${c.status}`),
    );
  const goClient = (page: Page, path: string) =>
    page.evaluate((p) => {
      window.history.pushState({}, '', p);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);
  async function signIn(page: Page): Promise<void> {
    const creds = await credentials(page);
    await page.getByLabel('Tên đăng nhập').fill(creds.username);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(creds.password);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await page.getByRole('navigation', { name: 'Điều hướng chính' }).waitFor();
  }

  it('bản phát hành KHÔNG chứa backend giả / trang dò / tay cầm; bản bật cờ thì có (đối chứng)', () => {
    const release = allText(releaseDir);
    for (const sign of FAKE_SIGNS) expect(release.includes(sign), `bản phát hành chứa "${sign}"`).toBe(false);
    const flagged = allText(fakeDir);
    for (const sign of FAKE_SIGNS.slice(0, 3)) expect(flagged.includes(sign), `bản bật cờ thiếu "${sign}"`).toBe(true);
  });

  it('đăng nhập bằng giao diện ⇒ trang dò đọc tổng quan (SYS-80) + dựng DataGrid từ OPS-32/33; 0 vi phạm CSP', async () => {
    const { page, w } = await openLogin();
    await signIn(page);
    expect(new URL(page.url()).pathname).toBe('/overview');

    await goClient(page, '/__api-probe');
    await page.getByTestId('overview-status').filter({ hasText: 'success' }).waitFor();
    await expect(page.locator('[data-kpi]').count()).resolves.toBe(6);
    await page.getByTestId('grid-status').filter({ hasText: 'ready' }).waitFor();
    // DataGrid thật dựng hàng từ OPS-33 (tên Role từ hạt giống)
    await page.getByText('Tùng', { exact: true }).first().waitFor();

    // luồng SSE của vỏ đã mở tới backend giả (SYS-85)
    await page.waitForFunction(() => (globalThis as unknown as { __gaFake: FakeControl }).__gaFake.openStreams === 1);
    const calls = await callLog(page);
    expect(calls).toEqual(
      expect.arrayContaining(['EXT-01:200', 'EXT-03:200', 'SYS-80:200', 'OPS-32:200', 'OPS-33:200']),
    );
    const v = await allViolations(page, w);
    expect({ violations: v, problems: w.problems, bad: w.badRequests }).toEqual({
      violations: [],
      problems: [],
      bad: [],
    });
  }, 120_000);

  it('hết phiên ở máy chủ ⇒ sự kiện 401 đưa về trang đăng nhập (G1)', async () => {
    const { page } = await openLogin();
    await signIn(page);
    await goClient(page, '/__api-probe');
    await page.getByTestId('overview-status').filter({ hasText: 'success' }).waitFor();
    await page.evaluate(() => {
      const f = (globalThis as unknown as { __gaFake: FakeControl }).__gaFake;
      f.expireSession();
      // sự kiện SSE làm hết SYS-80 đang hiển thị ⇒ tải lại ⇒ 401
      f.emit({ type: 'attention.changed', count: 0, maxSeverity: null });
    });
    await page.waitForFunction(() => window.location.pathname === '/login');
  }, 120_000);
});
