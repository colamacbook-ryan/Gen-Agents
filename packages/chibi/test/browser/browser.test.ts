// Test trong Chromium thật (Playwright): render 10 × 16, reduced-motion = 0 animation, cổng nhận diện trên DOM thật, chuyển tiếp mượt.
// Không có Chromium thì SKIP hiển thị rõ (CHIBI_REQUIRE_BROWSER=1 biến thiếu Chromium thành lỗi; CHIBI_BROWSER=skip tắt hẳn).
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { browserTestsEnabled, launch } from '../support/browser.ts';
import { CODES, rawSpec } from '../support/pack.ts';
import { startServer, type TestServer } from '../support/server.ts';

const enabled = browserTestsEnabled();
const STATES = [
  'error',
  'failover',
  'penalty',
  'quota',
  'rest',
  'wait',
  'discover',
  'rank1',
  'reward',
  'commit',
  'unsure',
  'think',
  'run',
  'idle',
  'sleep',
  'normal',
];
const VARIANTS = ['nap', 'drunk', 'game'];
const COMBOS: [string, string | null][] = STATES.flatMap((s) =>
  s === 'idle' ? VARIANTS.map((v): [string, string | null] => [s, v]) : [[s, null] as [string, string | null]],
);

interface Session {
  ctx: BrowserContext;
  page: Page;
  errors: string[];
}

describe.skipIf(!enabled)('Chromium thật', { timeout: 180_000 }, () => {
  let server: TestServer;
  let browser: Browser;
  const sessions: BrowserContext[] = [];

  beforeAll(async () => {
    server = await startServer();
    browser = await launch();
  });
  afterAll(async () => {
    for (const c of sessions) await c.close();
    await browser.close();
    await server.close();
  });

  async function open(reduced: boolean): Promise<Session> {
    const ctx = await browser.newContext({
      reducedMotion: reduced ? 'reduce' : 'no-preference',
      viewport: { width: 400, height: 420 },
    });
    sessions.push(ctx);
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await page.goto(`${server.url}/test/browser/harness.html`);
    await page.waitForFunction(() => (window as unknown as { __api?: { ready: boolean } }).__api?.ready === true);
    return { ctx, page, errors };
  }

  it('tải gói 10 nhân vật qua loadSkinPack, không lỗi / cảnh báo console', async () => {
    const { page, errors } = await open(false);
    const ids = await page.evaluate(() =>
      (window as never as { __api: { cast: { id: string }[] } }).__api.cast.map((c) => c.id),
    );
    expect(ids).toEqual([...CODES]);
    expect(errors).toEqual([]);
  });

  it('10 nhân vật × 16 trạng thái (+3 biến thể idle) mount không lỗi, đều có animation', async () => {
    const { page, errors } = await open(false);
    const res = await page.evaluate(
      async ({ ids, combos }: { ids: string[]; combos: [string, string | null][] }) => {
        const C = (
          window as never as {
            Chibi: { mount(el: Element, id: string, s: string, o: object): { svg: SVGSVGElement; destroy(): void } };
          }
        ).Chibi;
        const host = document.getElementById('s') as HTMLElement;
        const bad: string[] = [];
        let n = 0;
        for (const id of ids) {
          for (const [s, v] of combos) {
            const h = C.mount(host, id, s, { size: 160, variant: v ?? undefined });
            await new Promise((r) => requestAnimationFrame(() => r(null)));
            n++;
            if (h.svg.getAttribute('data-chb-s') !== s) bad.push(`${id}/${s}: sai trạng thái`);
            if (h.svg.getAnimations({ subtree: true }).length < 1) bad.push(`${id}/${s}: không có animation`);
            if (!h.svg.querySelector('.chb-hd') || !h.svg.querySelector('.chb-bd'))
              bad.push(`${id}/${s}: thiếu thân / đầu`);
            h.destroy();
          }
        }
        return { n, bad };
      },
      { ids: [...CODES], combos: COMBOS },
    );
    expect(res.n).toBe(10 * 18);
    expect(res.bad).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('prefers-reduced-motion: reduce → 0 animation ở mọi nhân vật × trạng thái, vẫn có huy hiệu, ẩn emote động', async () => {
    const { page, errors } = await open(true);
    const res = await page.evaluate(
      async ({ ids, combos }: { ids: string[]; combos: [string, string | null][] }) => {
        const C = (
          window as never as {
            Chibi: { mount(el: Element, id: string, s: string, o: object): { svg: SVGSVGElement; destroy(): void } };
          }
        ).Chibi;
        const host = document.getElementById('s') as HTMLElement;
        const bad: string[] = [];
        let total = 0;
        for (const id of ids) {
          for (const [s, v] of combos) {
            for (const size of [160, 64, 32]) {
              const h = C.mount(host, id, s, { size, variant: v ?? undefined });
              await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
              const n = h.svg.getAnimations({ subtree: true }).length;
              total += n;
              if (n !== 0) bad.push(`${id}/${s}/${size}: ${n} animation`);
              const hero = h.svg.querySelector('svg.chb-hero');
              if (!hero || getComputedStyle(hero).display === 'none') bad.push(`${id}/${s}/${size}: mất huy hiệu`);
              const emo = h.svg.querySelector('.chb-emo');
              if (emo && getComputedStyle(emo).display !== 'none') bad.push(`${id}/${s}/${size}: emote còn hiện`);
              h.destroy();
            }
          }
        }
        return { total, bad, pageAnims: document.getAnimations().length };
      },
      { ids: [...CODES], combos: COMBOS },
    );
    expect(res.bad).toEqual([]);
    expect(res.total).toBe(0);
    expect(res.pageAnims).toBe(0);
    expect(errors).toEqual([]);
  });

  it('cổng nhận diện trên DOM thật = trên chuỗi SVG, đều đạt; P1 đọc được ở 32 px (≥ 3 px)', async () => {
    const { page, errors } = await open(false);
    const res = await page.evaluate(
      async (ids) => {
        const C = (
          window as never as {
            Chibi: {
              mount(el: Element, id: string, s: string, o: object): { svg: SVGSVGElement; destroy(): void };
              evaluateIdentity(
                id: string,
                v: unknown,
              ): { pass: boolean; p1: string; must: { ok: boolean }[]; extra: { ok: boolean }[] };
              viewOfElement(n: ParentNode): unknown;
              viewOfString(s: string): unknown;
            };
          }
        ).Chibi;
        const host = document.getElementById('s') as HTMLElement;
        const out: { id: string; dom: string; str: string; pass: boolean; p1: string; w: number; h: number }[] = [];
        for (const id of ids) {
          const h = C.mount(host, id, 'normal', { size: 160 });
          const dom = C.evaluateIdentity(id, C.viewOfElement(h.svg));
          const str = C.evaluateIdentity(id, C.viewOfString(h.svg.outerHTML));
          h.destroy();
          const s32 = C.mount(host, id, 'normal', { size: 32 });
          const el = s32.svg.querySelector(`[data-part="${dom.p1}"]`);
          const r = el?.getBoundingClientRect();
          out.push({
            id,
            dom: JSON.stringify(dom),
            str: JSON.stringify(str),
            pass: dom.pass,
            p1: dom.p1,
            w: r?.width ?? 0,
            h: r?.height ?? 0,
          });
          s32.destroy();
        }
        return out;
      },
      [...CODES],
    );
    for (const r of res) {
      expect(r.dom, r.id).toBe(r.str);
      expect(r.pass, r.id).toBe(true);
      expect(r.w, `${r.id}: ${r.p1}`).toBeGreaterThanOrEqual(3);
      expect(r.h, `${r.id}: ${r.p1}`).toBeGreaterThanOrEqual(3);
      expect(r.p1).toBe(rawSpec(r.id).identity.p1);
    }
    expect(errors).toEqual([]);
  });

  it('keyframes thật trong trang: tiền tố chb-k-, chỉ transform / opacity / rotate / scale / stroke-dashoffset', async () => {
    const { page } = await open(false);
    const kf = await page.evaluate(() => {
      const C = (window as never as { Chibi: { injectCSS(): void; keyframeNames(): Record<string, string> } }).Chibi;
      C.injectCSS();
      return C.keyframeNames();
    });
    const names = Object.keys(kf);
    expect(names.length).toBeGreaterThan(150);
    expect(names.every((n) => n.startsWith('chb-k-'))).toBe(true);
    const bad = new Set<string>();
    for (const [n, text] of Object.entries(kf)) {
      for (const m of text.matchAll(/([\w-]+)\s*:/g)) {
        const p = m[1] as string;
        if (!['transform', 'opacity', 'stroke-dashoffset', 'rotate', 'scale'].includes(p)) bad.add(`${n}:${p}`);
      }
    }
    expect([...bad]).toEqual([]);
  });

  it('đổi trạng thái: gom theo lô, dựng chuyển tiếp mượt (composite add) rồi tự tắt; không lỗi qua cả 16 trạng thái', async () => {
    const { page, errors } = await open(false);
    const res = await page.evaluate(async () => {
      const C = (
        window as never as {
          Chibi: {
            mount(
              el: Element,
              id: string,
              s: string,
              o: object,
            ): { svg: SVGSVGElement; setState(s: string, o?: object): void; destroy(): void };
          };
        }
      ).Chibi;
      const host = document.getElementById('s') as HTMLElement;
      const h = C.mount(host, 'tq046', 'normal', { size: 160 });
      await new Promise((r) => setTimeout(r, 300));
      h.setState('penalty');
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const glides = document
        .getAnimations()
        .filter(
          (a) =>
            (a.effect as KeyframeEffect).composite === 'add' &&
            (a.effect as KeyframeEffect).getComputedTiming().duration === 260,
        ).length;
      const stateAfter = h.svg.getAttribute('data-chb-s');
      await new Promise((r) => setTimeout(r, 450));
      const glidesLater = document
        .getAnimations()
        .filter((a) => (a.effect as KeyframeEffect).composite === 'add').length;
      const seen: string[] = [];
      for (const s of [
        'wait',
        'reward',
        'error',
        'sleep',
        'discover',
        'idle',
        'run',
        'think',
        'unsure',
        'commit',
        'rank1',
        'rest',
        'quota',
        'failover',
        'normal',
      ]) {
        h.setState(s);
        await new Promise((r) => setTimeout(r, 60));
        seen.push(h.svg.getAttribute('data-chb-s') ?? '');
      }
      h.setState('không-có-trạng-thái-này');
      await new Promise((r) => setTimeout(r, 60));
      const fallback = h.svg.getAttribute('data-chb-s');
      h.destroy();
      return { glides, stateAfter, glidesLater, seen, fallback };
    });
    expect(res.stateAfter).toBe('penalty');
    expect(res.glides).toBeGreaterThan(0);
    expect(res.glidesLater).toBe(0);
    expect(res.seen).toEqual([
      'wait',
      'reward',
      'error',
      'sleep',
      'discover',
      'idle',
      'run',
      'think',
      'unsure',
      'commit',
      'rank1',
      'rest',
      'quota',
      'failover',
      'normal',
    ]);
    expect(res.fallback).toBe('normal');
    expect(errors).toEqual([]);
  });

  it('đạo cụ cầm tay không cắt vùng mắt–mũi khi chắp tay / nghĩ / xoa tay (điểm yếu spike, đo bằng hình học thật)', async () => {
    const { page, errors } = await open(false);
    const res = await page.evaluate(
      async ({ ids, states, skip }: { ids: string[]; states: string[]; skip: string[] }) => {
        type Q = { x: number; y: number }[];
        const W = window as never as {
          __api: { mount(id: string, s: string): SVGSVGElement; freeze(f: number): void };
        };
        // hai hình tứ giác lồi giao nhau? (SAT)
        const sat = (A: Q, B: Q): boolean => {
          for (const P of [A, B]) {
            for (let i = 0; i < 4; i++) {
              const a = P[i] as Q[number];
              const c = P[(i + 1) % 4] as Q[number];
              const nx = -(c.y - a.y);
              const ny = c.x - a.x;
              const pr = (Qd: Q) => Qd.map((p) => p.x * nx + p.y * ny);
              const pa = pr(A);
              const pb = pr(B);
              if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
            }
          }
          return true;
        };
        const quad = (el: SVGGraphicsElement): Q => {
          const bb = el.getBBox();
          const m = el.getScreenCTM() as DOMMatrix;
          return [
            [bb.x, bb.y],
            [bb.x + bb.width, bb.y],
            [bb.x + bb.width, bb.y + bb.height],
            [bb.x, bb.y + bb.height],
          ].map(([x, y]) => {
            const p = new DOMPoint(x, y).matrixTransform(m);
            return { x: p.x, y: p.y };
          });
        };
        const bad: string[] = [];
        let samples = 0;
        for (const id of ids) {
          for (const s of states) {
            if (skip.includes(`${id}/${s}`)) continue;
            const svg = W.__api.mount(id, s);
            for (let k = 0; k < 20; k++) {
              W.__api.freeze(k / 20);
              const held = svg.querySelector('.chb-arm-R .chb-held');
              const face = svg.querySelector('[data-part="face"]') as SVGGraphicsElement;
              if (!held) continue;
              samples++;
              const fm = face.getScreenCTM() as DOMMatrix;
              // vùng mắt + mũi (toạ độ đầu): x 62–138, y 58–92
              const zone: Q = [
                [62, 58],
                [138, 58],
                [138, 92],
                [62, 92],
              ].map(([x, y]) => {
                const p = new DOMPoint(x, y).matrixTransform(fm);
                return { x: p.x, y: p.y };
              });
              for (const el of held.querySelectorAll<SVGGraphicsElement>('path,rect,circle,ellipse')) {
                if (el.closest('.chb-dt')) continue;
                const bb = el.getBBox();
                if (Math.max(bb.width, bb.height) < 38) continue; // chỉ phần chính (lông quạt, lưỡi kiếm, mặt quạt lụa); tay cầm + tua nhỏ bỏ qua
                if (sat(quad(el), zone)) {
                  bad.push(`${id}/${s}@${k / 20}`);
                  break;
                }
              }
            }
          }
        }
        return { bad, samples };
      },
      {
        ids: ['tq046', 'tq080', 'tq141', 'tq010'],
        states: ['wait', 'reward', 'think'],
        // khi mừng Tôn Thượng Hương múa kiếm (trait prop-swordT, chủ ý hài): kiếm vung qua mặt là hành vi, không phải lỗi tư thế
        skip: ['tq141/reward'],
      },
    );
    expect(res.samples).toBeGreaterThan(200);
    expect(res.bad).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('hồ lô nằm trong bàn tay phải và lên tới miệng khi uống; máy game nằm giữa hai bàn tay (ngón cái trên phím)', async () => {
    const { page, errors } = await open(false);
    const res = await page.evaluate(
      async (ids: string[]) => {
        const W = window as never as {
          Chibi: { mount(el: Element, id: string, s: string, o: object): { svg: SVGSVGElement; destroy(): void } };
          __api: { freeze(f: number): void };
        };
        const host = document.getElementById('s') as HTMLElement;
        const rect = (el: Element) => el.getBoundingClientRect();
        const near = (a: DOMRect, b: DOMRect, pad: number) =>
          a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;
        const bad: string[] = [];
        for (const id of ids) {
          const d = W.Chibi.mount(host, id, 'idle', { size: 160, variant: 'drunk', fixedPhase: true });
          for (const f of [0.02, 0.2, 0.45, 0.9]) {
            W.__api.freeze(f);
            const gd = d.svg.querySelector('.chb-gd');
            const hand = d.svg.querySelector('.chb-arm-R [data-part="hand"]');
            if (!gd || !hand) {
              bad.push(`${id}: thiếu hồ lô / bàn tay`);
              continue;
            }
            if (!near(rect(gd), rect(hand), 3)) bad.push(`${id}: hồ lô rời tay @${f}`);
            // Triệu Vân khoá hai tay giữ em bé (lockR): hồ lô ở lại chỗ tay giữ, không lên miệng
            if (f === 0.45 && id !== 'tq047') {
              const face = rect(d.svg.querySelector('[data-part="face"]') as Element);
              if (!near(rect(gd), face, 0) || rect(gd).bottom < face.top + face.height * 0.45)
                bad.push(`${id}: hồ lô chưa lên miệng @${f}`);
            }
          }
          d.destroy();
          const g = W.Chibi.mount(host, id, 'idle', { size: 160, variant: 'game', fixedPhase: true });
          for (const f of [0.02, 0.25, 0.5, 0.75]) {
            W.__api.freeze(f);
            const pad = g.svg.querySelector('.chb-padb');
            const hl = g.svg.querySelector('.chb-arm-L [data-part="hand"]');
            const hr = g.svg.querySelector('.chb-arm-R [data-part="hand"]');
            if (!pad || !hl || !hr) {
              bad.push(`${id}: thiếu máy game / tay`);
              continue;
            }
            const p = rect(pad);
            for (const [n, h] of [
              ['trái', hl],
              ['phải', hr],
            ] as const) {
              const r = rect(h);
              const cx = r.left + r.width / 2;
              const cy = r.top + r.height / 2;
              if (cx < p.left - 4 || cx > p.right + 4 || cy < p.top - 4 || cy > p.bottom + 4)
                bad.push(`${id}: tay ${n} rời máy game @${f}`);
            }
          }
          g.destroy();
        }
        return bad;
      },
      [...CODES],
    );
    expect(res).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('ui.avatar_motion: full > subtle (chỉ thở + chớp mắt) > off (0 animation, pose tĩnh + huy hiệu); đổi nóng bằng setMotion', async () => {
    const { page, errors } = await open(false);
    const res = await page.evaluate(async () => {
      const C = (
        window as never as {
          Chibi: {
            mount(
              el: Element,
              id: string,
              s: string,
              o: object,
            ): { svg: SVGSVGElement; setMotion(l: string): void; setState(s: string): void; destroy(): void };
          };
        }
      ).Chibi;
      const host = document.getElementById('s') as HTMLElement;
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
      const kinds = (svg: SVGSVGElement) =>
        [
          ...new Set(
            svg.getAnimations({ subtree: true }).map((a) => {
              const t = (a.effect as KeyframeEffect).target as Element;
              return t.classList.contains('chb-breath')
                ? 'breath'
                : t.classList.contains('chb-e-n')
                  ? 'blink'
                  : (t.getAttribute('class') ?? '');
            }),
          ),
        ].sort();
      const out: Record<string, unknown> = {};
      for (const m of ['full', 'subtle', 'off']) {
        const h = C.mount(host, 'tq044', 'reward', { size: 160, motion: m });
        await frame();
        const hero = h.svg.querySelector('svg.chb-hero');
        const emo = h.svg.querySelector('.chb-emo');
        out[m] = {
          n: h.svg.getAnimations({ subtree: true }).length,
          kinds: kinds(h.svg),
          hero: !!hero && getComputedStyle(hero).display !== 'none',
          emo: !!emo && getComputedStyle(emo).display !== 'none',
          em: h.svg.getAttribute('data-chb-em'),
        };
        h.destroy();
      }
      const h = C.mount(host, 'tq044', 'reward', { size: 160 });
      await frame();
      const a0 = h.svg.getAnimations({ subtree: true }).length;
      h.setMotion('off');
      await frame();
      const a1 = h.svg.getAnimations({ subtree: true }).length;
      h.setMotion('subtle');
      await frame();
      const a2 = kinds(h.svg);
      h.setMotion('full');
      h.setState('penalty');
      await new Promise((r) => setTimeout(r, 120));
      const a3 = h.svg.getAnimations({ subtree: true }).length;
      h.destroy();
      return { out, live: { a0, a1, a2, a3 } };
    });
    const o = res.out as Record<string, { n: number; kinds: string[]; hero: boolean; emo: boolean; em: string }>;
    expect(o.full?.n).toBeGreaterThan(8);
    expect(o.full?.emo).toBe(true);
    expect(o.off?.n).toBe(0);
    expect(o.off?.hero).toBe(true);
    expect(o.off?.emo).toBe(false);
    expect(o.off?.em).toBe('');
    expect(o.subtle?.kinds.every((k) => k === 'breath' || k === 'blink')).toBe(true);
    expect(o.subtle?.n).toBeGreaterThanOrEqual(1);
    expect(o.subtle?.n).toBeLessThanOrEqual(2);
    expect(o.subtle?.hero).toBe(true);
    expect(o.subtle?.emo).toBe(false);
    expect(res.live.a0).toBeGreaterThan(8);
    expect(res.live.a1).toBe(0);
    expect(res.live.a2.every((k: string) => k === 'breath' || k === 'blink')).toBe(true);
    expect(res.live.a3).toBeGreaterThan(8);
    expect(errors).toEqual([]);
  });

  it('cỡ vừa / nhỏ chỉ chạy animation của thân, đầu và huy hiệu (ngân sách hiệu năng)', async () => {
    const { page } = await open(false);
    const res = await page.evaluate(async () => {
      const C = (
        window as never as {
          Chibi: { mount(el: Element, id: string, s: string, o: object): { svg: SVGSVGElement; destroy(): void } };
        }
      ).Chibi;
      const host = document.getElementById('s') as HTMLElement;
      const out: Record<string, string[]> = {};
      for (const size of [64, 32]) {
        const h = C.mount(host, 'tq044', 'reward', { size });
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
        const kinds = new Set<string>();
        for (const a of h.svg.getAnimations({ subtree: true })) {
          const t = (a.effect as KeyframeEffect).target as Element;
          kinds.add(
            t.closest('svg.chb-hero')
              ? 'hero'
              : t.classList.contains('chb-bd')
                ? 'bd'
                : t.classList.contains('chb-hd')
                  ? 'hd'
                  : `khác:${t.getAttribute('class')}`,
          );
        }
        out[String(size)] = [...kinds].sort();
        h.destroy();
      }
      return out;
    });
    for (const size of ['64', '32']) {
      const bad = (res[size] ?? []).filter((k) => k.startsWith('khác'));
      expect(bad, `size ${size}`).toEqual([]);
      expect(res[size]).toEqual(expect.arrayContaining(['bd', 'hero']));
    }
  });
});
