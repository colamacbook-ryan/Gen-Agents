// Chromium THẬT: khung app dựng đúng token / tỷ lệ STD-07 dưới CSP chặt, điều hướng, phím tắt, ConfirmModal 2 bước, axe 0 serious.
import AxeBuilder from '@axe-core/playwright';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CSP_VALUE } from '../../csp.ts';
import { allViolations, browserTestsEnabled, fakeAuthApi, launch, type Watched, watch } from '../support/browser.ts';
import type { FakeAuthServer } from '../support/fake-auth-server.ts';
import { FIRST_PASSWORD, NEW_PASSWORD } from '../support/secrets.ts';
import { buildForTest, type Started, startBaitServer, startDevServer, startPreview } from '../support/servers.ts';

const enabled = browserTestsEnabled();
const suite = enabled ? describe : describe.skip;

suite('Chromium thật: CSP chặt + app (dev server, bản build + preview)', () => {
  let browser: Browser;
  let prev: Started;
  let cleanup: () => void;
  const contexts: BrowserContext[] = [];

  beforeAll(async () => {
    browser = await launch();
    const built = await buildForTest();
    cleanup = built.cleanup;
    prev = await startPreview(built.outDir);
  }, 180_000);
  afterAll(async () => {
    for (const c of contexts) await c.close();
    for (const c of extraCleanups.reverse()) await c();
    await browser?.close();
    await prev?.close();
    cleanup?.();
  });

  const extraCleanups: (() => void | Promise<void>)[] = [];

  /** Trang mới trên một server bất kỳ (bait, dev, preview) với máy chủ auth giả và bộ bắt vi phạm. */
  async function open(server: Started, path: string): Promise<{ page: Page; w: Watched }> {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    contexts.push(context);
    await fakeAuthApi(context);
    const page = await context.newPage();
    const w = await watch(page, server.origin);
    await page.goto(new URL(path, server.url).toString());
    return { page, w };
  }

  interface Session {
    page: Page;
    w: Watched;
    server: FakeAuthServer;
  }

  /** Trang mới đã đăng nhập xong (qua luồng lần đầu: đổi mật khẩu), đứng ở `path`. */
  async function signedIn(path = '/overview', opts: { reducedMotion?: boolean } = {}): Promise<Session> {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: opts.reducedMotion ? 'reduce' : 'no-preference',
    });
    contexts.push(context);
    const server = await fakeAuthApi(context);
    const page = await context.newPage();
    const w = await watch(page, prev.origin);
    await page.goto(new URL('/login', prev.url).toString());
    await page.getByLabel('Tên đăng nhập').fill('admin');
    await page.getByLabel('Mật khẩu', { exact: true }).fill(FIRST_PASSWORD);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await page.getByRole('heading', { name: 'Đặt mật khẩu mới' }).waitFor();
    await page.getByLabel('Mật khẩu hiện tại').fill(FIRST_PASSWORD);
    await page.getByLabel('Mật khẩu mới', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Nhập lại mật khẩu mới').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
    await page.getByRole('navigation', { name: 'Điều hướng chính' }).waitFor();
    if (path !== '/overview') await goto(page, path);
    return { page, w, server };
  }

  /** Điều hướng phía client (không tải lại trang) bằng history API + popstate. */
  async function goto(page: Page, path: string): Promise<void> {
    await page.evaluate((p) => {
      window.history.pushState({}, '', p);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);
    await page.waitForFunction((p) => window.location.pathname === p, path);
  }

  const pathname = (page: Page): string => new URL(page.url()).pathname;

  async function expectClean(s: Session): Promise<void> {
    const v = await allViolations(s.page, s.w);
    expect({ violations: v, problems: s.w.problems, bad: s.w.badRequests }).toEqual({
      violations: [],
      problems: [],
      bad: [],
    });
  }

  /** Quét axe; `scope` hẹp (vd hộp thoại đang mở) để bớt tải CPU — máy CI / máy dev dùng chung nhiều lane. */
  async function serious(page: Page, scope?: string): Promise<string[]> {
    const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']);
    const results = await (scope ? builder.include(scope) : builder).analyze();
    return results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map(
        (v) =>
          `${v.impact} ${v.id}: ${v.help} — ${v.nodes
            .slice(0, 3)
            .map((n) => n.target.join(' '))
            .join(' | ')}`,
      );
  }

  it('ca âm — bộ bắt còn sống: trang có <style>, style="" và script nội tuyến bị Chromium báo vi phạm', async () => {
    const bait = await startBaitServer();
    extraCleanups.push(() => bait.close());
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
    extraCleanups.push(() => dev.close());
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

  it('preview của bản build gửi header CSP chặt; mọi tài nguyên cùng origin; font Việt đã nạp; 0 vi phạm', async () => {
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

  it('khung dựng đúng tỷ lệ và token của STD-07 (CSS thật được áp dưới style-src self)', async () => {
    const s = await signedIn('/people/birth');
    const m = await s.page.evaluate(() => {
      const box = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
      const cs = (sel: string) => getComputedStyle(document.querySelector(sel) as Element);
      return {
        sidebarW: box('.ga-sidebar')?.width,
        headerH: box('.ga-header')?.height,
        pageTopH: box('.ga-page__top')?.height,
        tabsH: box('.ga-tabs')?.height,
        navItemH: box('.ga-nav-item')?.height,
        bodyBg: getComputedStyle(document.body).backgroundColor,
        bodyFont: getComputedStyle(document.body).fontFamily,
        bodySize: getComputedStyle(document.body).fontSize,
        titleSize: cs('.ga-page__title').fontSize,
        accentVar: getComputedStyle(document.documentElement).getPropertyValue('--ga-accent').trim(),
        activeNavShadow: cs('.ga-nav-item[aria-current="page"]').boxShadow,
        activeTabBorder: cs('.ga-tab[aria-selected="true"]').borderBottomColor,
        sidebarBg: cs('.ga-sidebar').backgroundColor,
        contentGrow: cs('.ga-shell__content').flexGrow,
        maxFont: Math.max(
          ...[...document.querySelectorAll('body *')].map((e) => Number.parseFloat(getComputedStyle(e).fontSize)),
        ),
        lang: document.documentElement.lang,
      };
    });
    expect(m.sidebarW).toBe(216);
    expect(m.headerH).toBe(44);
    expect(m.pageTopH).toBe(48);
    expect(m.tabsH).toBe(36);
    expect(m.navItemH).toBe(30);
    expect(m.bodyBg).toBe('rgb(17, 16, 18)');
    expect(m.sidebarBg).toBe('rgb(24, 23, 26)');
    expect(m.bodyFont).toContain('IBM Plex Sans');
    expect(m.bodySize).toBe('13px');
    expect(m.titleSize).toBe('18px');
    expect(m.accentVar.toLowerCase()).toBe('#e8a33d');
    expect(m.activeNavShadow).toContain('rgb(232, 163, 61)');
    expect(m.activeTabBorder).toBe('rgb(232, 163, 61)');
    expect(m.contentGrow).toBe('999');
    expect(m.maxFont).toBeLessThanOrEqual(20); // không có chữ > 20px trong Console
    expect(m.lang).toBe('vi');
    await expectClean(s);
  }, 120_000);

  it('font: glyph tiếng Việt và ₲ thật sự có (subset vietnamese + latin-ext đã nạp), cả sans, mono, serif', async () => {
    const s = await signedIn('/ops/leaderboard');
    const r = await s.page.evaluate(async () => {
      const text = 'Đăng nhập · Ắ ề ữ ợ ỷ · ₲';
      const out: Record<string, boolean> = {};
      for (const font of [
        '400 13px "IBM Plex Sans"',
        '600 13px "IBM Plex Sans"',
        '400 12px "IBM Plex Mono"',
        '500 16px "Newsreader"',
      ]) {
        await document.fonts.load(font, text);
        out[font] = document.fonts.check(font, text);
      }
      return out;
    });
    expect(r).toEqual({
      '400 13px "IBM Plex Sans"': true,
      '600 13px "IBM Plex Sans"': true,
      '400 12px "IBM Plex Mono"': true,
      '500 16px "Newsreader"': true,
    });
    expect(s.w.requested.some((p) => /ibm-plex-sans-latin-ext-/.test(p))).toBe(true);
    expect(s.w.requested.some((p) => /ibm-plex-sans-vietnamese-/.test(p))).toBe(true);
    await expectClean(s);
  }, 120_000);

  it('điều hướng phía client (không tải lại trang): nhóm → tab đầu, tab, breadcrumb, nút lùi của trình duyệt', async () => {
    const s = await signedIn('/overview');
    await s.page.evaluate(() => {
      (window as unknown as { __marker: string }).__marker = 'giữ-nguyên';
    });
    const nav = s.page.getByRole('navigation', { name: 'Điều hướng chính' });
    await nav.getByRole('link', { name: 'Hạ tầng' }).click();
    await s.page.waitForFunction(() => window.location.pathname === '/infra/accounts');
    await s.page.getByRole('tab', { name: 'Container' }).click();
    await s.page.waitForFunction(() => window.location.pathname === '/infra/containers');
    expect(await s.page.getByRole('tab', { name: 'Container' }).getAttribute('aria-selected')).toBe('true');
    expect(await nav.getByRole('link', { name: 'Hạ tầng' }).getAttribute('aria-current')).toBe('page');
    expect(await s.page.getByRole('heading', { level: 1 }).textContent()).toBe('Engine và tài khoản');
    expect(await s.page.getByRole('navigation', { name: 'Đường dẫn trang' }).textContent()).toContain('Container');
    await s.page.goBack();
    await s.page.waitForFunction(() => window.location.pathname === '/infra/accounts');
    expect(await s.page.evaluate(() => (window as unknown as { __marker?: string }).__marker)).toBe('giữ-nguyên');
    // tải lại trang giữ nguyên phiên (cookie + /session): vẫn ở khung, không về /login
    await s.page.reload();
    await s.page.getByRole('navigation', { name: 'Điều hướng chính' }).waitFor();
    expect(pathname(s.page)).toBe('/infra/accounts');
    await expectClean(s);
  }, 120_000);

  it('phím tắt thật trong trình duyệt: G rồi S, ], ⌘K, ?, Esc', async () => {
    const s = await signedIn('/overview');
    await s.page.keyboard.press('g');
    await s.page.keyboard.press('s');
    await s.page.waitForFunction(() => window.location.pathname === '/system/settings');
    await s.page.keyboard.press(']');
    await s.page.waitForFunction(() => window.location.pathname === '/system/audit');
    await s.page.keyboard.press('Control+k');
    const palette = s.page.getByRole('dialog', { name: 'Bảng lệnh' });
    await palette.waitFor();
    await s.page.keyboard.type('thẻ');
    await s.page.keyboard.press('Enter');
    await s.page.waitForFunction(() => window.location.pathname === '/people/cards');
    await s.page.keyboard.press('?');
    await s.page.getByRole('dialog', { name: 'Phím tắt' }).waitFor();
    await s.page.keyboard.press('Escape');
    await s.page.getByRole('dialog').waitFor({ state: 'detached' });
    await expectClean(s);
  }, 120_000);

  it('ConfirmModal 2 bước: bước 1 liệt kê hệ quả, bước 2 gõ lại tên mới bật nút; Ctrl+Enter xác nhận; Esc huỷ và trả focus', async () => {
    const s = await signedIn('/__ui-kit');
    const opener = s.page.getByRole('button', { name: 'Thu hồi thẻ…' });
    await opener.click();
    const dialog = s.page.getByRole('dialog', { name: 'Thu hồi thẻ nhân viên của Mai?' });
    await dialog.waitFor();
    // bước 1
    expect(await dialog.getByRole('listitem').count()).toBe(3);
    expect(await dialog.textContent()).toContain('Bước 1/2');
    expect(await dialog.getByRole('button', { name: 'Huỷ' }).evaluate((el) => el === document.activeElement)).toBe(
      true,
    );
    expect(await dialog.getByRole('textbox').count()).toBe(0);
    await dialog.getByRole('button', { name: 'Tiếp tục' }).click();
    // bước 2
    expect(await dialog.textContent()).toContain('Bước 2/2');
    const input = dialog.getByRole('textbox', { name: 'Gõ “Mai” để xác nhận' });
    expect(await input.evaluate((el) => el === document.activeElement)).toBe(true);
    const confirm = dialog.getByRole('button', { name: /Thu hồi thẻ/ });
    expect(await confirm.isDisabled()).toBe(true);
    await input.fill('Ma');
    expect(await confirm.isDisabled()).toBe(true);
    await input.fill('Mai');
    expect(await confirm.isDisabled()).toBe(false);
    // Tab xoay vòng trong khung (không thoát ra nền)
    for (let i = 0; i < 6; i++) await s.page.keyboard.press('Tab');
    expect(await s.page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)).toBe(true);
    await input.focus();
    await s.page.keyboard.press('Control+Enter');
    await dialog.waitFor({ state: 'detached' });
    await s.page.getByText('Đã xác nhận (bản demo, không làm gì)').waitFor();
    // huỷ bằng Esc ở bước 1: focus về nút mở
    await opener.click();
    await dialog.waitFor();
    await s.page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    expect(await opener.evaluate((el) => el === document.activeElement)).toBe(true);
    await expectClean(s);
  }, 120_000);

  it('Toast: tối đa 3, lỗi không tự ẩn, có nút đóng; vùng thông báo có nhãn', async () => {
    const s = await signedIn('/__ui-kit');
    await s.page.getByRole('button', { name: 'Đã lưu cấu hình' }).click();
    await s.page.getByRole('button', { name: 'Mai quay về CLI ưu tiên 1' }).click();
    await s.page.getByRole('button', { name: 'Không gọi được dịch vụ' }).click();
    await s.page.getByRole('button', { name: 'Đã lưu cấu hình' }).click();
    const region = s.page.getByRole('region', { name: 'Thông báo nhanh' });
    expect(await region.locator('.ga-toast').count()).toBe(3);
    expect(await region.getByRole('alert').textContent()).toContain('Không gọi được dịch vụ');
    await region.getByRole('button', { name: 'Đóng thông báo' }).first().click();
    expect(await region.locator('.ga-toast').count()).toBe(2);
    await expectClean(s);
  }, 120_000);

  it('QuietHoursTimeline: kéo tay nắm bằng chuột; biến CSS đặt qua CSSOM vẫn được áp dưới CSP', async () => {
    const s = await signedIn('/__ui-kit');
    const handle = s.page.getByRole('slider', { name: 'Bắt đầu im lặng' });
    await handle.scrollIntoViewIfNeeded();
    expect(await handle.getAttribute('aria-valuetext')).toBe('22:00');
    const bar = s.page.locator('.ga-qh__bar');
    const box = (await bar.boundingBox()) as { x: number; y: number; width: number; height: number };
    const from = (await handle.boundingBox()) as { x: number; y: number; width: number; height: number };
    // kéo tay nắm bắt đầu từ 22:00 sang khoảng 20:00 (20/24 chiều rộng)
    await s.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await s.page.mouse.down();
    await s.page.mouse.move(box.x + box.width * (20 / 24), from.y + from.height / 2, { steps: 8 });
    await s.page.mouse.up();
    expect(await handle.getAttribute('aria-valuetext')).toBe('20:00');
    // vùng sọc bắt đầu đúng vị trí 20/24: `left` tính ra từ biến CSS --ga-qh-start
    const left = await s.page
      .locator('.ga-qh__zone')
      .first()
      .evaluate((el) => Number.parseFloat(getComputedStyle(el).left));
    expect(Math.abs(left - box.width * (20 / 24))).toBeLessThan(2);
    await handle.press('ArrowRight');
    expect(await handle.getAttribute('aria-valuetext')).toBe('20:15');
    await expectClean(s);
  }, 120_000);

  it('prefers-reduced-motion: mọi animation tắt (thời lượng ≈ 0)', async () => {
    const s = await signedIn('/__ui-kit', { reducedMotion: true });
    await s.page.locator('[data-kit="quiet"]').waitFor(); // chunk bộ component nạp lười
    const durations = await s.page.evaluate(() =>
      [...document.querySelectorAll('.ga-skel, .ga-chip__dot--breath, .ga-spinner')].map((el) =>
        Number.parseFloat(getComputedStyle(el).animationDuration),
      ),
    );
    expect(durations.length).toBeGreaterThan(0);
    for (const d of durations) expect(d).toBeLessThan(0.001);
  }, 120_000);

  describe('axe: 0 vi phạm mức serious / critical', () => {
    it('đăng nhập, đổi mật khẩu lần đầu', async () => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      contexts.push(context);
      await fakeAuthApi(context);
      const page = await context.newPage();
      await page.goto(new URL('/login', prev.url).toString());
      await page.getByLabel('Tên đăng nhập').waitFor();
      expect(await serious(page)).toEqual([]);
      // trạng thái lỗi inline
      await page.getByLabel('Tên đăng nhập').fill('admin');
      await page.getByLabel('Mật khẩu', { exact: true }).fill('khong-dung');
      await page.getByRole('button', { name: 'Đăng nhập' }).click();
      await page.getByRole('alert').waitFor();
      expect(await serious(page)).toEqual([]);
      await page.getByLabel('Mật khẩu', { exact: true }).fill(FIRST_PASSWORD);
      await page.getByRole('button', { name: 'Đăng nhập' }).click();
      await page.getByRole('heading', { name: 'Đặt mật khẩu mới' }).waitFor();
      expect(await serious(page)).toEqual([]);
      await page.getByLabel('Mật khẩu hiện tại').fill(FIRST_PASSWORD);
      await page.getByLabel('Mật khẩu mới', { exact: true }).fill('ngan');
      await page.getByLabel('Nhập lại mật khẩu mới').fill('ngan');
      await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
      await page.getByText('Mật khẩu mới quá ngắn. Dùng một cụm từ dài hơn.').waitFor();
      expect(await serious(page)).toEqual([]);
    }, 120_000);

    it('khung app ở mọi nhóm / tab (placeholder), sidebar rail, log drawer mở', async () => {
      const s = await signedIn('/overview');
      // trang đại diện: trang đơn, trang có tab, đường dẫn lạ (các tab còn lại dùng cùng khung nên cùng kết quả)
      for (const path of ['/overview', '/people/roles', '/khong/co']) {
        await goto(s.page, path);
        await s.page.getByRole('main').waitFor();
        expect(await serious(s.page), path).toEqual([]);
      }
      await s.page.getByRole('button', { name: 'Thu gọn thanh bên' }).click();
      expect(await serious(s.page, '.ga-sidebar')).toEqual([]);
      await s.page.getByRole('button', { name: 'Mở rộng thanh bên' }).click();
      await s.page.getByRole('button', { name: /Mở log/ }).click();
      await s.page.getByRole('log').waitFor();
      expect(await serious(s.page, '.ga-logdrawer')).toEqual([]);
      await expectClean(s);
    }, 180_000);

    it('bộ component đầy đủ (/__ui-kit) và các lớp phủ O1–O3, Modal, ConfirmModal bước 1 + 2', async () => {
      const s = await signedIn('/__ui-kit');
      await s.page
        .getByRole('heading', { name: 'Bộ component' })
        .waitFor()
        .catch(() => undefined);
      await s.page.locator('[data-kit="quiet"]').waitFor();
      expect(await serious(s.page)).toEqual([]);
      for (const name of ['Mở bảng lệnh', 'Mở thông báo', 'Mở bảng phím tắt', 'Mở modal']) {
        await s.page.getByRole('button', { name }).click();
        await s.page.getByRole('dialog').waitFor();
        expect(await serious(s.page, '[role="dialog"]'), name).toEqual([]);
        await s.page.keyboard.press('Escape');
        await s.page.getByRole('dialog').waitFor({ state: 'detached' });
      }
      await s.page.getByRole('button', { name: 'Thu hồi thẻ…' }).click();
      await s.page.getByRole('dialog').waitFor();
      expect(await serious(s.page, '[role="dialog"]'), 'confirm bước 1').toEqual([]);
      await s.page.getByRole('button', { name: 'Tiếp tục' }).click();
      expect(await serious(s.page, '[role="dialog"]'), 'confirm bước 2').toEqual([]);
      await expectClean(s);
    }, 180_000);
  });
});
