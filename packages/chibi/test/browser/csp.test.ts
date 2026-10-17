// CSP CHẶT trong Chromium thật: trang gửi header `default-src 'self'; style-src 'self'` (KHÔNG 'unsafe-inline'), mount() phải chạy trọn vẹn:
// 0 vi phạm CSP (bắt qua sự kiện securitypolicyviolation), 0 lỗi console, style thật sự được áp, ảnh giống đường style nội tuyến cũ.
// Ca âm: đường svg() cũ (style="…" nội tuyến) và việc chèn lại style="…" vào avatar phải làm bộ bắt vi phạm ĐỎ — chứng minh bộ bắt còn sống.
// Không có Chromium thì SKIP hiển thị rõ (CHIBI_REQUIRE_BROWSER=1 biến thiếu Chromium thành lỗi). CHIBI_CSP_FULL=1: đủ 3 khung/ca (540 khung).
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AVATAR_STATES, IDLE_VARIANTS } from '../../src/index.ts';
import { browserTestsEnabled, launch } from '../support/browser.ts';
import { CODES } from '../support/pack.ts';
import { STRICT_CSP, startServer, type TestServer } from '../support/server.ts';

const enabled = browserTestsEnabled();
const COMBOS: [string, string | null][] = AVATAR_STATES.flatMap((s) =>
  s === 'idle' ? IDLE_VARIANTS.map((v): [string, string | null] => [s, v]) : [[s, null] as [string, string | null]],
);
/** ngưỡng khác biệt kênh màu (0-255) tính là "điểm ảnh khác" — cùng ngưỡng với so ảnh trước/sau của spike */
const THRESHOLD = 24;

interface Violation {
  directive: string;
  blocked: string;
  sample: string;
}
interface PageApi {
  ready: boolean;
  frac(s: string): number;
  mount(id: string, s: string, v?: string | null): SVGSVGElement;
  mountHandle(id: string, s: string, size?: number): SVGSVGElement;
  mountShadow(id: string, s: string): SVGSVGElement;
  mountLegacy(id: string, s: string, v?: string | null): SVGSVGElement;
  inject(html: string): void;
  freeze(frac: number): void;
}
type Win = Window & {
  __api: PageApi;
  __csp: Violation[];
  __h: { setState(s: string, o?: object): void; setMotion(l: string): void };
};

describe.skipIf(!enabled)(
  'CSP chặt (style-src self, không unsafe-inline) trong Chromium thật',
  { timeout: 300_000 },
  () => {
    let server: TestServer;
    let browser: Browser;
    const contexts: BrowserContext[] = [];

    beforeAll(async () => {
      server = await startServer();
      browser = await launch();
    });
    afterAll(async () => {
      for (const c of contexts) await c.close();
      await browser.close();
      await server.close();
    });

    interface Session {
      page: Page;
      errors: string[];
      csp: () => Promise<Violation[]>;
      headers: Record<string, string>;
    }

    /** mở trang thử; strict=true → máy chủ gửi header CSP chặt */
    async function open(strict: boolean, init?: () => void): Promise<Session> {
      const ctx = await browser.newContext({ reducedMotion: 'no-preference', viewport: { width: 300, height: 320 } });
      contexts.push(ctx);
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
      });
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      if (init) await page.addInitScript(init);
      const res = await page.goto(`${server.url}/test/browser/harness.html${strict ? '?csp=strict' : ''}`);
      await page.waitForFunction(() => (window as unknown as Win).__api?.ready === true);
      return {
        page,
        errors,
        headers: res?.headers() ?? {},
        // sự kiện securitypolicyviolation được xếp hàng bất đồng bộ: chờ một nhịp trước khi đọc
        csp: async () => {
          await page.evaluate(() => new Promise((r) => setTimeout(r, 60)));
          return page.evaluate(() => (window as unknown as Win).__csp);
        },
      };
    }

    it('trang thử thật sự chạy dưới header CSP chặt (không unsafe-inline), nạp đủ gói skin, 0 vi phạm lúc khởi động', async () => {
      const { headers, csp, errors } = await open(true);
      expect(headers['content-security-policy']).toBe(STRICT_CSP);
      expect(headers['content-security-policy']).not.toMatch(/unsafe-inline|unsafe-eval/);
      expect(await csp()).toEqual([]);
      expect(errors).toEqual([]);
    });

    it('mount() 10 nhân vật × 16 trạng thái (+3 biến thể idle) × 3 cỡ: 0 vi phạm CSP, 0 lỗi console, stylesheet adopt (không có thẻ <style>)', async () => {
      const { page, csp, errors } = await open(true);
      const res = await page.evaluate(
        async ({ ids, combos }) => {
          const host = document.getElementById('s') as HTMLElement;
          const bad: string[] = [];
          let n = 0;
          for (const id of ids) {
            for (const [s, v] of combos) {
              for (const size of [160, 64, 32]) {
                const h = (
                  window as unknown as { Chibi: { mount(...a: unknown[]): { svg: SVGSVGElement; destroy(): void } } }
                ).Chibi.mount(host, id, s, { size, variant: v ?? undefined });
                await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
                n++;
                if (h.svg.querySelector('[data-chb-sty]'))
                  bad.push(`${id}/${s}/${size}: còn data-chb-sty chưa hydrate`);
                if (h.svg.getAnimations({ subtree: true }).length < 1)
                  bad.push(`${id}/${s}/${size}: không có animation`);
                h.destroy();
              }
            }
          }
          return {
            n,
            bad,
            adopted: document.adoptedStyleSheets.length,
            styleTags: document.querySelectorAll('style').length,
          };
        },
        { ids: [...CODES], combos: COMBOS },
      );
      expect(res.n).toBe(10 * 18 * 3);
      expect(res.bad).toEqual([]);
      expect(res.adopted).toBe(1);
      expect(res.styleTags).toBe(0);
      expect(await csp()).toEqual([]);
      expect(errors).toEqual([]);
    });

    it('style thật sự được áp dưới CSP (không chỉ vắng vi phạm): nét theo hệ số, biến tuỳ ý qua CSSOM, keyframes chạy', async () => {
      const { page, csp, errors } = await open(true);
      const res = await page.evaluate(
        async ({ ids }) => {
          const w = window as unknown as Win;
          const bad: string[] = [];
          let nk = 0;
          let nvar = 0;
          for (const id of ids) {
            const svg = w.__api.mount(id, 'run');
            await new Promise((r) => requestAnimationFrame(() => r(null)));
            const sw = Number.parseFloat(getComputedStyle(svg).getPropertyValue('--chb-sw'));
            if (!(sw > 0)) bad.push(`${id}: --chb-sw không được áp (hydrate hỏng)`);
            for (const el of svg.querySelectorAll('[data-chb-k]')) {
              const k = Number.parseFloat(el.getAttribute('data-chb-k') ?? 'NaN');
              const got = Number.parseFloat(getComputedStyle(el).strokeWidth.replace(/[^\d.]/g, ''));
              nk++;
              if (!(Math.abs(got - sw * k) < 0.01))
                bad.push(`${id}: data-chb-k=${k} → stroke-width ${got}, mong đợi ${sw * k}`);
            }
            for (const el of svg.querySelectorAll('.chb-ln, .chb-flm, .chb-fd, .chb-dp')) {
              nvar++;
              const v =
                getComputedStyle(el).getPropertyValue('--chb-i').trim() ||
                getComputedStyle(el).getPropertyValue('--chb-dx').trim();
              if (v === '') bad.push(`${id}: ${el.getAttribute('class')} thiếu biến tuỳ ý`);
            }
            if (svg.getAnimations({ subtree: true }).length < 5)
              bad.push(`${id}: quá ít animation (keyframes chưa chạy?)`);
          }
          return { bad, nk, nvar };
        },
        { ids: [...CODES] },
      );
      expect(res.bad).toEqual([]);
      expect(res.nk).toBeGreaterThan(10); // có luật data-chb-k thật để kiểm
      expect(res.nvar).toBeGreaterThan(0);
      expect(await csp()).toEqual([]);
      expect(errors).toEqual([]);
    });

    it('đổi trạng thái / mức chuyển động sau khi mount: lớp dựng lại vẫn đi đường chặt (0 vi phạm, không còn data-chb-sty)', async () => {
      const { page, csp, errors } = await open(true);
      const res = await page.evaluate(
        async ({ ids, states }) => {
          const w = window as unknown as Win;
          const bad: string[] = [];
          for (const id of ids) {
            const svg = w.__api.mountHandle(id, 'normal');
            for (const s of states) {
              w.__h.setState(s, { variant: s === 'idle' ? 'game' : undefined, ms: 120 });
              await new Promise((r) => setTimeout(r, 160));
              if (svg.querySelector('[data-chb-sty]')) bad.push(`${id}→${s}: còn data-chb-sty`);
              if (svg.getAttribute('data-chb-s') !== s) bad.push(`${id}→${s}: không đổi trạng thái`);
            }
            for (const l of ['subtle', 'off', 'full']) {
              w.__h.setMotion(l);
              await new Promise((r) => requestAnimationFrame(() => r(null)));
            }
          }
          return bad;
        },
        { ids: ['tq046', 'tq044', 'tqx001'], states: [...AVATAR_STATES] as string[] },
      );
      expect(res).toEqual([]);
      expect(await csp()).toEqual([]);
      expect(errors).toEqual([]);
    });

    it('avatar trong shadow root: stylesheet được adopt vào chính shadow root, style áp đúng, 0 vi phạm CSP', async () => {
      const { page, csp, errors } = await open(true);
      const res = await page.evaluate(async () => {
        const w = window as unknown as Win;
        const bad: string[] = [];
        const svg = w.__api.mountShadow('tq046', 'run');
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        const root = svg.getRootNode() as ShadowRoot;
        if (!(root instanceof ShadowRoot)) bad.push('không nằm trong shadow root');
        if (root.adoptedStyleSheets.length !== 1)
          bad.push(`shadow adoptedStyleSheets = ${root.adoptedStyleSheets.length}`);
        if (root.querySelectorAll('style').length !== 0) bad.push('shadow root có thẻ <style>');
        const sw = Number.parseFloat(getComputedStyle(svg).getPropertyValue('--chb-sw'));
        const el = svg.querySelector('[data-chb-k]');
        const got = el ? Number.parseFloat(getComputedStyle(el).strokeWidth.replace(/[^\d.]/g, '')) : Number.NaN;
        if (!el || !(Math.abs(got - sw * Number.parseFloat(el.getAttribute('data-chb-k') ?? 'NaN')) < 0.01))
          bad.push(`stroke-width trong shadow = ${got}`);
        if (svg.getAnimations({ subtree: true }).length < 5) bad.push('shadow: keyframes không chạy');
        return bad;
      });
      expect(res).toEqual([]);
      expect(await csp()).toEqual([]);
      expect(errors).toEqual([]);
    });

    it('fail-closed: trình duyệt thiếu constructable stylesheet → mount() ném lỗi rõ ràng, KHÔNG rơi về thẻ <style>, 0 vi phạm CSP', async () => {
      const { page, csp } = await open(true, () => {
        Reflect.deleteProperty(CSSStyleSheet.prototype, 'replaceSync'); // giả lập Chromium < 73 / Firefox < 101 / Safari < 16.4
      });
      const res = await page.evaluate(() => {
        try {
          (window as unknown as Win).__api.mount('tq046', 'run');
          return { threw: false, msg: '', styleTags: document.querySelectorAll('style').length };
        } catch (e) {
          return { threw: true, msg: (e as Error).message, styleTags: document.querySelectorAll('style').length };
        }
      });
      expect(res.threw).toBe(true);
      expect(res.msg).toMatch(/constructable stylesheet/);
      expect(res.styleTags).toBe(0);
      expect(await csp()).toEqual([]);
    });

    it('CA ÂM 1: đường svg() cũ (style="…" nội tuyến) bị CSP báo style-src-attr → bộ bắt còn sống', async () => {
      const { page, csp } = await open(true);
      expect(await csp()).toEqual([]);
      await page.evaluate(() => (window as unknown as Win).__api.mountLegacy('tq046', 'run'));
      const v = await csp();
      expect(v.length).toBeGreaterThan(0);
      expect(v.map((x) => x.directive)).toContain('style-src-attr');
      for (const x of v) expect(x.directive).toMatch(/^style-src/);
    });

    it('CA ÂM 2: chèn lại style="…" nội tuyến vào avatar mount() đúng đường chặt → test đỏ (bị báo), trước khi chèn là 0', async () => {
      const { page, csp } = await open(true);
      await page.evaluate(() => (window as unknown as Win).__api.mount('tq046', 'run'));
      expect(await csp()).toEqual([]);
      await page.evaluate(() => (window as unknown as Win).__api.inject('<g style="stroke-width:1.5px"/>'));
      const v = await csp();
      expect(v.length).toBeGreaterThan(0);
      expect(v.map((x) => x.directive)).toContain('style-src-attr');
    });

    it(`ảnh: mount() dưới CSP chặt = đường style nội tuyến cũ không CSP (điểm ảnh lệch > ${THRESHOLD}/255 = 0) — ${process.env.CHIBI_CSP_FULL === '1' ? '540' : '180'} khung`, async () => {
      const strict = await open(true);
      const legacy = await open(false);
      const fracsOf = (f: number): number[] => (process.env.CHIBI_CSP_FULL === '1' ? [0.02, f, 0.8] : [f]);

      async function shoot(
        s: Session,
        mode: 'mount' | 'mountLegacy',
        id: string,
        st: string,
        v: string | null,
        f: number,
      ): Promise<string> {
        await s.page.evaluate(
          ([m, i, a, b]) =>
            (window as unknown as Win).__api[m as 'mount'](i as string, a as string, b as string | null),
          [mode, id, st, v] as const,
        );
        await s.page.evaluate((fr) => (window as unknown as Win).__api.freeze(fr), f);
        await s.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        return (await s.page.locator('#s').screenshot()).toString('base64');
      }

      const pairs: { name: string; a: string; b: string }[] = [];
      for (const id of CODES) {
        for (const [st, v] of COMBOS) {
          const f0 = await strict.page.evaluate((x) => (window as unknown as Win).__api.frac(x), st);
          for (const [i, f] of fracsOf(f0).entries()) {
            pairs.push({
              name: `${id}_${st}${v ? `_${v}` : ''}_f${i}`,
              a: await shoot(strict, 'mount', id, st, v, f),
              b: await shoot(legacy, 'mountLegacy', id, st, v, f),
            });
          }
        }
      }
      expect(pairs.length).toBe(CODES.length * COMBOS.length * (process.env.CHIBI_CSP_FULL === '1' ? 3 : 1));

      // giải mã PNG và so điểm ảnh ngay trong một trang trống (không cần thư viện ảnh)
      const cmpCtx = await browser.newContext();
      contexts.push(cmpCtx);
      const cmp = await cmpCtx.newPage();
      const rows = await cmp.evaluate(
        async ({ pairs: ps, th }) => {
          const dec = async (b64: string): Promise<ImageData> => {
            const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
            const g = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d') as OffscreenCanvasRenderingContext2D;
            g.drawImage(bmp, 0, 0);
            return g.getImageData(0, 0, bmp.width, bmp.height);
          };
          const out: { name: string; over: number; max: number; size: boolean }[] = [];
          for (const p of ps) {
            const A = await dec(p.a);
            const B = await dec(p.b);
            if (A.width !== B.width || A.height !== B.height) {
              out.push({ name: p.name, over: -1, max: 255, size: true });
              continue;
            }
            let over = 0;
            let max = 0;
            for (let k = 0; k < A.data.length; k += 4) {
              const d = Math.max(
                Math.abs((A.data[k] as number) - (B.data[k] as number)),
                Math.abs((A.data[k + 1] as number) - (B.data[k + 1] as number)),
                Math.abs((A.data[k + 2] as number) - (B.data[k + 2] as number)),
              );
              if (d > max) max = d;
              if (d > th) over++;
            }
            out.push({ name: p.name, over, max, size: false });
          }
          return out;
        },
        { pairs, th: THRESHOLD },
      );
      const worst = rows.filter((r) => r.over !== 0);
      expect(worst).toEqual([]);
      expect(Math.max(...rows.map((r) => r.max))).toBeLessThanOrEqual(THRESHOLD);
      expect(await strict.csp()).toEqual([]);
      expect(strict.errors).toEqual([]);
      expect(legacy.errors).toEqual([]);
    });
  },
);
