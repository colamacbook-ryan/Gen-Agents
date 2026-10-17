// Chromium THẬT dưới CSP chặt `default-src 'self'; style-src 'self'`: dev server và preview đều gửi header, app chạy với 0 vi phạm.
import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CSP_VALUE } from '../../csp.ts';
import { allViolations, browserTestsEnabled, fakeAuthApi, launch, watch } from '../support/browser.ts';
import { FIRST_PASSWORD, NEW_PASSWORD } from '../support/secrets.ts';
import { buildForTest, type Started, startBaitServer, startDevServer, startPreview } from '../support/servers.ts';

const enabled = browserTestsEnabled();
const suite = enabled ? describe : describe.skip;

suite('CSP chặt trong Chromium thật', () => {
  let browser: Browser;
  const cleanups: (() => void | Promise<void>)[] = [];

  beforeAll(async () => {
    browser = await launch();
  }, 120_000);
  afterAll(async () => {
    await browser?.close();
    for (const c of cleanups.reverse()) await c();
  });

  async function open(server: Started, path: string): Promise<{ page: Page; w: Awaited<ReturnType<typeof watch>> }> {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    cleanups.push(() => context.close());
    await fakeAuthApi(context);
    const page = await context.newPage();
    const w = await watch(page, server.origin);
    await page.goto(new URL(path, server.url).toString());
    return { page, w };
  }

  it('ca âm — bộ bắt còn sống: trang có <style>, style="" và script nội tuyến bị Chromium báo vi phạm', async () => {
    const bait = await startBaitServer();
    cleanups.push(() => bait.close());
    const { page, w } = await open(bait, '/');
    await page.waitForSelector('#p');
    const v = await allViolations(page, w);
    expect(
      v.some((x) => /style-src-elem/.test(x)),
      v.join('\n'),
    ).toBe(true);
    expect(
      v.some((x) => /style-src-attr/.test(x)),
      v.join('\n'),
    ).toBe(true);
    expect(
      v.some((x) => /script-src/.test(x)),
      v.join('\n'),
    ).toBe(true);
    // và style nội tuyến thật sự KHÔNG được áp: chữ không đỏ
    expect(await page.evaluate(() => getComputedStyle(document.body).margin)).not.toBe('0px');
  });

  it('dev server gửi header CSP chặt và app chạy (đăng nhập → khung) với 0 vi phạm, 0 lỗi console', async () => {
    const dev = await startDevServer();
    cleanups.push(() => dev.close());
    const { page, w } = await open(dev, '/');
    await page.waitForSelector('form');
    const res = await page.request.get(dev.url);
    expect(res.headers()['content-security-policy']).toBe(CSP_VALUE);
    expect(CSP_VALUE).toContain("default-src 'self'");
    expect(CSP_VALUE).toContain("style-src 'self'");
    expect(CSP_VALUE).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
    // đăng nhập lần đầu, đổi mật khẩu, vào khung
    await page.getByLabel('Tên đăng nhập').fill('admin');
    await page.getByLabel('Mật khẩu', { exact: true }).fill(FIRST_PASSWORD);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await page.getByRole('heading', { name: 'Đặt mật khẩu mới' }).waitFor();
    await page.getByLabel('Mật khẩu hiện tại').fill(FIRST_PASSWORD);
    await page.getByLabel('Mật khẩu mới', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Nhập lại mật khẩu mới').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
    await page.getByRole('navigation', { name: 'Điều hướng chính' }).waitFor();
    expect(new URL(page.url()).pathname).toBe('/overview');
    const v = await allViolations(page, w);
    expect({ violations: v, problems: w.problems, bad: w.badRequests }).toEqual({
      violations: [],
      problems: [],
      bad: [],
    });
  }, 120_000);

  it('preview của bản build gửi header CSP chặt; mọi tài nguyên cùng origin; 0 vi phạm', async () => {
    const built = await buildForTest();
    cleanups.push(() => built.cleanup());
    const prev = await startPreview(built.outDir);
    cleanups.push(() => prev.close());
    const { page, w } = await open(prev, '/login');
    await page.waitForSelector('form');
    const res = await page.request.get(prev.url);
    expect(res.headers()['content-security-policy']).toBe(CSP_VALUE);
    // tài nguyên tĩnh cũng mang header (script, css, font)
    const html = await res.text();
    expect(html).not.toMatch(/<style|style="|<script(?![^>]*src=)/i);
    // font tự host: chữ tiếng Việt kéo subset vietnamese; font đã nạp xong
    await page.evaluate(() => document.fonts.ready);
    expect(w.requested.some((p) => /ibm-plex-sans-vietnamese-\d+-normal-.*\.woff2$/.test(p))).toBe(true);
    const loaded = await page.evaluate(() =>
      [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
    );
    expect(loaded.some((f) => f.includes('IBM Plex Sans'))).toBe(true);
    const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(bodyFont).toContain('IBM Plex Sans');
    const v = await allViolations(page, w);
    expect({ violations: v, problems: w.problems, bad: w.badRequests }).toEqual({
      violations: [],
      problems: [],
      bad: [],
    });
  }, 180_000);
});
