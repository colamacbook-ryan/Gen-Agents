// DataGrid trong Chromium thật: ảo hoá 10k hàng · navigate tới hàng 9.000 qua scrollToId + sự kiện "anchor sẵn sàng" (CNS-153)
// · ngữ pháp anchor của mọi ô đang dựng · CSP chặt (0 vi phạm, kèm ca âm chứng minh bộ bắt còn sống) · axe 0 serious.
import { Anchor } from '@ga/contracts';
import type { Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { browserTestsEnabled } from '../support/browser.ts';
import { STRICT_CSP } from '../support/server.ts';
import { axeSource, gridState, type Lab, runAxe, startLab } from '../support/session.ts';

const enabled = browserTestsEnabled();

interface Detail {
  anchor: string;
  id: string;
  col: string | null;
  status: string;
}

/** gọi scrollToId trong trang; trả chi tiết + đo thời gian + vị trí phần tử so với vùng thấy của lưới */
const navigate = (page: Page, id: string, col: string | null, opts: Record<string, unknown> = {}) =>
  page.evaluate(
    async ({ id, col, opts }) => {
      const g = (
        window as unknown as {
          __grid: {
            current: {
              scrollToId(i: string, c: string | null, o: unknown): Promise<Detail & { element: HTMLElement | null }>;
            };
          };
        }
      ).__grid.current;
      const t0 = performance.now();
      const d = await g.scrollToId(id, col, opts);
      const ms = performance.now() - t0;
      const grid = document.querySelector('[role="grid"]') as HTMLElement;
      let inView = false;
      let isActiveDesc = false;
      if (d.element) {
        const r = d.element.getBoundingClientRect();
        const gr = grid.getBoundingClientRect();
        // dưới header dính (16 + 28) và trên mép dưới; đủ chiều ngang trong vùng cuộn
        inView =
          r.top >= gr.top + 44 - 1 && r.bottom <= gr.bottom + 1 && r.left >= gr.left - 1 && r.right <= gr.right + 1;
        isActiveDesc = grid.getAttribute('aria-activedescendant') === d.element.id;
      }
      return {
        anchor: d.anchor,
        id: d.id,
        col: d.col,
        status: d.status,
        hasElement: d.element !== null,
        elementAnchor: d.element?.getAttribute('data-anchor') ?? null,
        inView,
        isActiveDesc,
        ms,
        domRows: document.querySelectorAll('.ga-dg-body [role="row"]').length,
      };
    },
    { id, col, opts },
  );

const events = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __h: { anchorEvents: Detail[] } }).__h.anchorEvents.map((e) => ({ ...e })),
  );
const fetchCount = (page: Page) =>
  page.evaluate(() => (window as unknown as { __h: { source: { fetchCount: number } } }).__h.source.fetchCount);

describe.skipIf(!enabled)('DataGrid — ảo hoá, anchor, CSP, axe trong Chromium thật', { timeout: 300_000 }, () => {
  let lab: Lab;
  beforeAll(async () => {
    lab = await startLab();
  });
  afterAll(async () => {
    await lab?.close();
  });

  it('ảo hoá 10.000 hàng: chỉ dựng hàng đang thấy, tải theo khối, cuộn tới cuối vẫn gọn', async () => {
    const { page, errors } = await lab.open('fixture=audit&n=10000');
    let st = await gridState(page);
    expect(st.footer).toBe('10.000 hàng · 0 đã chọn');
    expect(st.rowCount).toBe('10001');
    expect(st.domRows).toBeGreaterThan(10);
    expect(st.domRows).toBeLessThan(60);
    expect(await fetchCount(page)).toBeLessThanOrEqual(2);
    expect(await page.locator('.ga-dg-sumval').textContent()).toMatch(/^\d{1,3}(\.\d{3})+$/);
    // cuộn tới cuối
    await page.evaluate(() => {
      const g = document.querySelector('[role="grid"]') as HTMLElement;
      g.scrollTop = g.scrollHeight;
    });
    await page.waitForSelector('[data-anchor="grid:audit_log/row:AU-10000"]');
    st = await gridState(page);
    expect(st.domRows).toBeLessThan(60);
    expect(st.ids).toContain('AU-10000');
    expect(await fetchCount(page)).toBeLessThanOrEqual(5);
    // cuộn từng bước qua giữa bảng: mỗi lần chỉ dựng cửa sổ nhỏ, dữ liệu về đúng chỗ
    for (const top of [50_000, 120_000, 200_000]) {
      await page.evaluate((y) => {
        (document.querySelector('[role="grid"]') as HTMLElement).scrollTop = y;
      }, top);
      const want = `AU-${String(Math.floor(top / 28) + 2).padStart(5, '0')}`;
      await page.waitForSelector(`[data-anchor="grid:audit_log/row:${want}"]`);
      expect((await gridState(page)).domRows).toBeLessThan(60);
    }
    // bàn phím Ctrl+End tới hàng cuối
    await page.click('[data-anchor="grid:audit_log/row:AU-07144/col:B"]');
    await page.keyboard.press('Control+End');
    expect((await gridState(page)).ref).toBe('AU-10000 · J');
    expect(errors).toEqual([]);
  });

  it('navigate tới hàng 9.000 (ngoài màn, chưa tải): scrollToId → ô được dựng, trong vùng thấy, được chọn, phát "anchor sẵn sàng"', async () => {
    const { page, errors } = await lab.open('fixture=audit&n=10000');
    const before = await fetchCount(page);
    const r = await navigate(page, 'AU-09000', 'C');
    expect(r).toMatchObject({
      status: 'ready',
      anchor: 'grid:audit_log/row:AU-09000/col:C',
      elementAnchor: 'grid:audit_log/row:AU-09000/col:C',
      inView: true,
      isActiveDesc: true,
    });
    expect(r.domRows).toBeLessThan(60);
    expect(r.ms).toBeLessThan(3000);
    expect((await fetchCount(page)) - before).toBeLessThanOrEqual(3);
    expect(await events(page)).toEqual([
      { anchor: 'grid:audit_log/row:AU-09000/col:C', id: 'AU-09000', col: 'C', status: 'ready', element: null },
    ]);
    const st = await gridState(page);
    expect(st.ref).toBe('AU-09000 · C');
    expect(await page.locator('.ga-fb-col').textContent()).toBe('Actor');
    // cột nằm ngoài màn theo chiều ngang (J) cũng được cuộn vào
    const j = await navigate(page, 'AU-00042', 'J');
    expect(j).toMatchObject({ status: 'ready', inView: true, isActiveDesc: true });
    expect(errors).toEqual([]);
  });

  it('navigate khi nguồn chậm (locate + tải khối có độ trễ) vẫn chờ tới khi ô dựng xong; select:false không đổi ô chọn', async () => {
    const { page } = await lab.open('fixture=audit&n=10000&latency=40');
    const r = await navigate(page, 'AU-09000', 'D');
    expect(r).toMatchObject({ status: 'ready', inView: true, isActiveDesc: true });
    const r2 = await navigate(page, 'AU-00100', 'B', { select: false });
    expect(r2).toMatchObject({ status: 'ready', inView: true, isActiveDesc: false });
    expect((await gridState(page)).ref).toBe('AU-09000 · D');
  });

  it('anchor không tới được: filtered / gone / invalid / timeout / cancelled — không bao giờ chỉ sai chỗ mà không báo', async () => {
    const { page } = await lab.open('fixture=audit&n=10000');
    await page.locator('.ga-qb-input').fill('result:denied');
    await page.locator('.ga-qb-input').press('Enter');
    await expect.poll(async () => (await gridState(page)).chips).toEqual(['result:denied']);
    const okId = await page.evaluate(
      () =>
        (window as unknown as { __h: { rows(): { id: string; result: string }[] } }).__h
          .rows()
          .find((x) => x.result === 'ok')?.id,
    );
    expect((await navigate(page, okId as string, 'B')).status).toBe('filtered');
    expect((await navigate(page, 'AU-99999', 'B')).status).toBe('gone');
    expect((await navigate(page, 'IN-0001', 'B')).status).toBe('invalid'); // prefix không thuộc audit_log
    expect((await navigate(page, 'AU-00001', 'ZZ')).status).toBe('invalid'); // không có cột ZZ
    expect((await navigate(page, 'AU-1', null)).status).toBe('invalid'); // sai định dạng display_id
    const ev = await events(page);
    expect(ev.map((e) => e.status)).toEqual(['filtered', 'gone', 'invalid', 'invalid', 'invalid']);
    // cancelled: lần gọi mới huỷ lần đang chờ
    const both = await page.evaluate(async () => {
      const g = (window as unknown as { __grid: { current: { scrollToId(i: string, c: string): Promise<Detail> } } })
        .__grid.current;
      const a = g.scrollToId('AU-00010', 'B');
      const b = g.scrollToId('AU-00020', 'B');
      return [(await a).status, (await b).status];
    });
    expect(both[0]).toBe('cancelled');
    // timeout: nguồn chậm hơn trần chờ
    const slow = await lab.open('fixture=audit&n=2000&latency=600');
    expect((await navigate(slow.page, 'AU-01900', 'B', { timeoutMs: 150 })).status).toBe('timeout');
  });

  it('navigate mở lại cột đang ẩn; openEditor mở editor nhiều dòng của thanh công thức (Soi `navigate`, STD-08 §4)', async () => {
    const { page } = await lab.open('fixture=audit&n=500');
    await page.click('button[aria-label="Ẩn hiện cột"]');
    await page.locator('[role="dialog"] label', { hasText: 'Actor' }).click();
    await page.keyboard.press('Escape');
    expect(await page.locator('[role="columnheader"][title="C · Actor"]').count()).toBe(0);
    const r = await navigate(page, 'AU-00450', 'C');
    expect(r).toMatchObject({ status: 'ready', inView: true });
    expect(await page.locator('[role="columnheader"][title="C · Actor"]').count()).toBe(1);
    const ins = await lab.open('fixture=instructions');
    const e = await navigate(ins.page, 'IN-0003', 'D', { openEditor: true });
    expect(e.status).toBe('ready');
    await ins.page.locator('textarea.ga-fb-text').waitFor();
    expect(await ins.page.locator('.ga-fb-ref').textContent()).toBe('IN-0003 · D');
  });

  it('mọi data-anchor đang dựng đúng ngữ pháp đóng của hợp đồng (Anchor zod) và khớp display_id của hàng', async () => {
    for (const q of ['fixture=instructions', 'fixture=audit&n=10000']) {
      const { page } = await lab.open(q);
      if (q.includes('audit')) await navigate(page, 'AU-05000', 'A');
      const anchors = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.ga-dg [data-anchor]')].map((el) => ({
          a: el.getAttribute('data-anchor') ?? '',
          row: el.closest('[role="row"]')?.querySelector('[role="rowheader"]')?.textContent ?? null,
        })),
      );
      expect(anchors.length).toBeGreaterThan(50);
      for (const { a, row } of anchors) {
        expect(Anchor.safeParse(a).success, a).toBe(true);
        const m = /^grid:[a-z_]+\/row:([A-Z]+-\d+)/.exec(a);
        if (m) expect(row, a).toBe(m[1]);
      }
      expect(anchors.map((x) => x.a)).toContain('panel:formula-bar');
      expect(anchors.map((x) => x.a)).toContain('panel:query-box');
    }
  });

  it('CSP chặt: header không unsafe-inline / unsafe-eval; thao tác đủ kiểu ⇒ 0 vi phạm, 0 lỗi console, không thẻ <style>', async () => {
    const s = await lab.open('fixture=instructions');
    const { page } = s;
    expect(s.headers['content-security-policy']).toBe(STRICT_CSP);
    expect(s.headers['content-security-policy']).not.toMatch(/unsafe-inline|unsafe-eval/);
    // thao tác: popover, sửa, nhóm, mật độ, đổi độ rộng cột, xuất CSV, editor thanh công thức
    await page.click('[data-anchor="grid:instructions/row:IN-0005/col:C"]');
    await page.keyboard.press('F2');
    await page.keyboard.type('Xưng hô');
    await page.keyboard.press('Enter');
    await page.click('button[aria-label="Mật độ hàng"]');
    await page.click('button[aria-label="Nhóm hàng"]');
    await page.locator('[role="dialog"] select').selectOption('source');
    await page.locator('.ga-dg-grouprow').first().waitFor();
    const handle = page.locator('[role="columnheader"][title="C · Tên khối"] .ga-dg-resize');
    const box = await handle.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 3, box.y + 10);
      await page.mouse.down();
      await page.mouse.move(box.x + 63, box.y + 10, { steps: 4 });
      await page.mouse.up();
    }
    await Promise.all([page.waitForEvent('download'), page.click('button[aria-label="Xuất CSV"]')]);
    await page.click('[data-anchor="grid:instructions/row:IN-0003/col:D"]');
    await page.keyboard.press('F2');
    await page.locator('textarea.ga-fb-text').waitFor();
    expect(await s.csp()).toEqual([]);
    expect(s.errors).toEqual([]);
    expect(await page.evaluate(() => document.querySelectorAll('style').length)).toBe(0);
    expect(await page.evaluate(() => document.adoptedStyleSheets.length)).toBeGreaterThanOrEqual(2);
    // style thật sự được áp (stylesheet constructable hoạt động)
    expect(await page.locator('.ga-dg').evaluate((e) => getComputedStyle(e).borderRadius)).toBe('6px');
    // ca âm: chèn style="" nội tuyến ⇒ bộ bắt PHẢI ghi nhận vi phạm (bộ bắt còn sống)
    await page.evaluate(() => {
      const d = document.createElement('div');
      d.innerHTML = '<span style="color:red">x</span>';
      document.body.appendChild(d);
    });
    const v = await s.csp();
    expect(v.length).toBeGreaterThan(0);
    expect(v[0]?.directive).toMatch(/^style-src/);
  });

  it('axe: 0 vi phạm serious / critical ở các trạng thái chính (mặc định, popover, editor lõi, lỗi truy vấn, nhóm, 10k sau navigate)', async () => {
    const src = axeSource();
    const all: { state: string; v: Awaited<ReturnType<typeof runAxe>> }[] = [];
    const ins = await lab.open('fixture=instructions');
    const p = ins.page;
    all.push({ state: 'mặc định', v: await runAxe(p, src) });
    await p.click('[data-anchor="grid:instructions/row:IN-0002/col:C"]');
    await p.click('button[aria-label="Lọc"]');
    all.push({ state: 'ô chọn + popover Lọc', v: await runAxe(p, src) });
    await p.keyboard.press('Escape');
    await p.click('[data-anchor="grid:instructions/row:IN-0003/col:D"]');
    await p.keyboard.press('F2');
    await p.locator('textarea.ga-fb-text').waitFor();
    all.push({ state: 'editor ô dài hàng lõi', v: await runAxe(p, src) });
    await p.keyboard.press('Escape');
    await p.click('[data-anchor="grid:instructions/row:IN-0005/col:C"]');
    await p.keyboard.press('F2');
    all.push({ state: 'sửa ô trong lưới', v: await runAxe(p, src) });
    await p.keyboard.press('Escape');
    await p.locator('.ga-qb-input').fill('abc:1');
    await p.locator('.ga-qb-input').press('Enter');
    await p.locator('.ga-qb-error').waitFor();
    all.push({ state: 'lỗi ô truy vấn', v: await runAxe(p, src) });
    await p.locator('.ga-qb-input').press('Escape');
    await p.click('button[aria-label="Nhóm hàng"]');
    await p.locator('[role="dialog"] select').selectOption('layer');
    await p.locator('.ga-dg-grouprow').first().waitFor();
    all.push({ state: 'nhóm', v: await runAxe(p, src) });
    const au = await lab.open('fixture=audit&n=10000');
    await navigate(au.page, 'AU-09000', 'C');
    all.push({ state: '10k sau navigate', v: await runAxe(au.page, src) });
    await au.page.locator('.ga-qb-input').fill('tokens>999999');
    await au.page.locator('.ga-qb-input').press('Enter');
    await au.page.locator('.ga-dg-empty').waitFor();
    all.push({ state: 'trống', v: await runAxe(au.page, src) });
    const serious = all.flatMap(({ state, v }) =>
      v.filter((x) => x.impact === 'serious' || x.impact === 'critical').map((x) => ({ state, ...x })),
    );
    // in mọi vi phạm (kể cả moderate / minor) để người đọc báo cáo thấy
    const rest = all.flatMap(({ state, v }) => v.map((x) => `${state}: ${x.id} (${x.impact}) ${x.nodes[0] ?? ''}`));
    if (rest.length > 0) console.info(`axe (mọi mức):\n  ${rest.join('\n  ')}`);
    expect(serious).toEqual([]);
  });
});
