// Phiên trình duyệt cho test DataGrid: dựng bundle một lần, máy chủ CSP chặt, mỗi ca một context sạch.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { launch } from './browser.ts';
import { bundle } from './bundle.ts';
import { startServer, type TestServer } from './server.ts';

export interface Violation {
  directive: string;
  blocked: string;
  sample: string;
}

export interface Session {
  page: Page;
  /** lỗi / cảnh báo console + lỗi trang */
  errors: string[];
  headers: Record<string, string>;
  csp(): Promise<Violation[]>;
}

export interface Lab {
  open(query: string, opts?: { reducedMotion?: 'reduce' | 'no-preference' }): Promise<Session>;
  close(): Promise<void>;
}

export async function startLab(): Promise<Lab> {
  const files = await bundle('harness');
  const server: TestServer = await startServer(files);
  const browser: Browser = await launch();
  const contexts: BrowserContext[] = [];
  return {
    async open(query, opts = {}) {
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        acceptDownloads: true,
        reducedMotion: opts.reducedMotion ?? 'no-preference',
      });
      contexts.push(ctx);
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
      });
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      const res = await page.goto(`${server.url}/harness.html?${query}`);
      await page.waitForFunction(() => (window as unknown as { __h?: { ready: boolean } }).__h?.ready === true);
      // khối đầu đã về: có ít nhất một hàng mang anchor, hoặc trạng thái trống
      await page.waitForSelector('.ga-dg-body [role="row"][data-anchor], .ga-dg-empty');
      return {
        page,
        errors,
        headers: res?.headers() ?? {},
        csp: async () => {
          // securitypolicyviolation được xếp hàng bất đồng bộ: chờ một nhịp trước khi đọc
          await page.evaluate(() => new Promise((r) => setTimeout(r, 60)));
          return page.evaluate(() => (window as unknown as { __h: { csp: Violation[] } }).__h.csp);
        },
      };
    },
    async close() {
      for (const c of contexts) await c.close();
      await browser.close();
      await server.close();
    },
  };
}

/** mã nguồn axe-core (dev-only, MPL-2.0) để chèn vào trang */
export function axeSource(): string {
  const require = createRequire(import.meta.url);
  return readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
}

export interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: string[];
}

/** chạy axe trên trang; trả mọi vi phạm (test lọc theo mức độ) */
export async function runAxe(page: Page, src: string): Promise<AxeViolation[]> {
  const has = await page.evaluate(() => typeof (window as unknown as { axe?: unknown }).axe !== 'undefined');
  if (!has) await page.evaluate(src);
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<unknown> } }).axe;
    const r = (await axe.run(document, { resultTypes: ['violations'] })) as {
      violations: { id: string; impact: string | null; help: string; nodes: { target: string[] }[] }[];
    };
    return r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
    }));
  });
}

/** thông tin hiển thị của lưới trong trang */
export const gridState = (page: Page) =>
  page.evaluate(() => {
    const q = (s: string) => document.querySelector(s);
    const grid = q('[role="grid"]') as HTMLElement;
    const rows = [...document.querySelectorAll('.ga-dg-body [role="row"]')] as HTMLElement[];
    return {
      ref: q('.ga-fb-ref')?.textContent ?? '',
      footer: (q('.ga-dg-footer > span') as HTMLElement | null)?.textContent ?? '',
      sum: [...document.querySelectorAll('.ga-dg-sumval')].map((e) => e.textContent ?? ''),
      ids: rows.map((r) => r.querySelector('[role="rowheader"]')?.textContent ?? '').filter((x) => x !== ''),
      domRows: rows.length,
      activeDesc: grid.getAttribute('aria-activedescendant'),
      rowCount: grid.getAttribute('aria-rowcount'),
      chips: [...document.querySelectorAll('.ga-qb-chip')].map((c) => c.firstChild?.textContent ?? ''),
      focused:
        (document.activeElement as HTMLElement | null)?.getAttribute('aria-label') ??
        document.activeElement?.tagName ??
        '',
      focusInGrid: grid.contains(document.activeElement),
      gridFocused: document.activeElement === grid,
    };
  });
