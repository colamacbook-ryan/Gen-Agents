// DataGrid trong Chromium thật (CSP chặt): bàn phím · sửa ô · lọc · sắp xếp · cột · nhóm · ô truy vấn · CSV · đề xuất / bị thay
// · chọn hàng · clipboard · thêm hàng · mật độ · nhớ trạng thái. Không có Chromium ⇒ SKIP hiện rõ (GA_REQUIRE_BROWSER=1 ⇒ lỗi).
import { readFile } from 'node:fs/promises';
import type { Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { browserTestsEnabled } from '../support/browser.ts';
import { gridState, type Lab, startLab } from '../support/session.ts';

const enabled = browserTestsEnabled();

interface H {
  calls: {
    updates: { id: string; column: string; value: unknown; reason: string | null }[];
    applied: string[];
    rejected: string[];
    opened: string[];
    errors: string[];
    added: number;
    active: string[];
  };
  copied: string[];
  rows(): { id: string; name: string; layer: string; is_enabled: boolean; content: string }[];
}
const h = (page: Page) => page.evaluate(() => (window as unknown as { __h: H }).__h.calls);
const rowOf = (page: Page, id: string) =>
  page.evaluate((x) => (window as unknown as { __h: H }).__h.rows().find((r) => r.id === x), id);
const cell = (id: string, letter: string) => `[data-anchor="grid:instructions/row:${id}/col:${letter}"]`;

describe.skipIf(!enabled)('DataGrid — tương tác trong Chromium thật', { timeout: 300_000 }, () => {
  let lab: Lab;
  beforeAll(async () => {
    lab = await startLab();
  });
  afterAll(async () => {
    await lab?.close();
  });

  it('bàn phím: mũi tên, J/K, Home/End, Ctrl+Home/End, PageDown; aria-activedescendant trỏ đúng ô; Tab rời lưới; / vào ô truy vấn', async () => {
    const { page, errors } = await lab.open('fixture=instructions');
    await page.click(cell('IN-0001', 'C'));
    const at = async () => (await gridState(page)).ref;
    expect(await at()).toBe('IN-0001 · C');
    const steps: [string, string][] = [
      ['ArrowDown', 'IN-0002 · C'],
      ['ArrowRight', 'IN-0002 · D'],
      ['j', 'IN-0003 · D'],
      ['k', 'IN-0002 · D'],
      ['ArrowLeft', 'IN-0002 · C'],
      ['End', 'IN-0002'], // cột cuối = ô "Duyệt" (không có chữ cột)
      ['ArrowLeft', 'IN-0002 · J'],
      ['Home', 'IN-0002 · A'],
      ['Control+End', 'IN-0012'],
      ['Control+Home', 'IN-0001 · A'],
      ['ArrowUp', 'IN-0001 · A'],
      ['ArrowLeft', 'IN-0001 · A'],
      ['PageDown', 'IN-0012 · A'],
    ];
    for (const [key, ref] of steps) {
      await page.keyboard.press(key);
      expect(await at(), key).toBe(ref);
    }
    const st = await gridState(page);
    expect(st.gridFocused).toBe(true);
    // onActiveCellChange (callback nội tuyến của màn): báo đúng một lần mỗi lần ô đổi, không lặp, không vòng lặp
    const seen = (await h(page)).active.filter((x) => x !== '∅');
    expect(seen.at(-1)).toBe('IN-0012·A');
    expect(seen.every((x, i) => i === 0 || x !== seen[i - 1])).toBe(true);
    expect(seen).toContain('IN-0002·-');
    const target = await page.evaluate((sel) => document.querySelector(sel)?.id, cell('IN-0012', 'A'));
    expect(st.activeDesc).toBe(target);
    // Tab rời lưới (không bẫy bàn phím)
    await page.keyboard.press('Tab');
    expect((await gridState(page)).focusInGrid).toBe(false);
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Sau lưới');
    // quay lại lưới, `/` vào ô truy vấn
    await page.keyboard.press('Shift+Tab');
    expect((await gridState(page)).gridFocused).toBe(true);
    await page.keyboard.press('/');
    expect((await gridState(page)).focused).toBe('Truy vấn bảng');
    expect(await page.inputValue('.ga-qb-input')).toBe('');
    // handle cho phím `/` toàn cục của shell
    await page.locator('[role="grid"]').focus();
    await page.evaluate(() =>
      (window as unknown as { __grid: { current: { focusQuery(): void } } }).__grid.current.focusQuery(),
    );
    expect((await gridState(page)).focused).toBe('Truy vấn bảng');
    expect(errors).toEqual([]);
  });

  it('sửa ô chữ: F2 → gõ → Enter lưu qua nguồn rồi xuống hàng; Esc huỷ không lưu; cột chỉ đọc không mở editor', async () => {
    const { page, errors } = await lab.open('fixture=instructions');
    await page.click(cell('IN-0005', 'C'));
    await page.keyboard.press('F2');
    const editor = page.locator('input.ga-dg-editor');
    expect(await editor.inputValue()).toBe('Xưng hô & giọng');
    await page.keyboard.type('Xưng hô');
    await page.keyboard.press('Enter');
    await page.waitForFunction((sel) => document.querySelector(sel)?.textContent === 'Xưng hô', cell('IN-0005', 'C'));
    expect((await rowOf(page, 'IN-0005'))?.name).toBe('Xưng hô');
    expect((await h(page)).updates).toEqual([{ id: 'IN-0005', column: 'name', value: 'Xưng hô', reason: null }]);
    expect((await gridState(page)).ref).toBe('IN-0006 · C');
    expect((await gridState(page)).gridFocused).toBe(true);
    // Esc huỷ
    await page.keyboard.press('F2');
    await page.keyboard.type('zzz');
    await page.keyboard.press('Escape');
    expect(await editor.count()).toBe(0);
    expect((await rowOf(page, 'IN-0006'))?.name).toBe('Định dạng Telegram');
    expect((await h(page)).updates).toHaveLength(1);
    expect((await gridState(page)).gridFocused).toBe(true);
    // Token (G) chỉ đọc
    await page.click(cell('IN-0006', 'G'));
    await page.keyboard.press('F2');
    expect(await editor.count()).toBe(0);
    expect(errors).toEqual([]);
  });

  it('ô enum = dropdown inline; ô bool = công tắc (Space hoặc bấm); Tab khi sửa = lưu + sang phải', async () => {
    const { page, errors } = await lab.open('fixture=instructions');
    await page.click(cell('IN-0005', 'B'));
    await page.keyboard.press('Enter'); // màn không có inspector ⇒ Enter = sửa
    await page.selectOption('select.ga-dg-editor', 'goal');
    await page.keyboard.press('Enter');
    await page.waitForFunction((sel) => document.querySelector(sel)?.textContent === 'Mục tiêu', cell('IN-0005', 'B'));
    expect((await rowOf(page, 'IN-0005'))?.layer).toBe('goal');
    // bool bằng Space (bấm mép trái ô — giữa ô là chính công tắc)
    await page.click(cell('IN-0007', 'F'), { position: { x: 4, y: 4 } });
    await page.keyboard.press('Space');
    await page.waitForFunction(
      (sel) => document.querySelector(`${sel} [role="switch"]`)?.getAttribute('aria-checked') === 'true',
      cell('IN-0007', 'F'),
    );
    expect((await rowOf(page, 'IN-0007'))?.is_enabled).toBe(true);
    // bool bằng chuột
    await page.click(`${cell('IN-0001', 'F')} [role="switch"]`);
    await expect.poll(async () => (await rowOf(page, 'IN-0001'))?.is_enabled).toBe(false);
    expect((await gridState(page)).gridFocused).toBe(true);
    // Tab trong editor: lưu + sang phải
    await page.click(cell('IN-0002', 'C'));
    await page.keyboard.press('F2');
    await page.keyboard.type('Giữ bí mật');
    await page.keyboard.press('Tab');
    await expect.poll(async () => (await gridState(page)).ref).toBe('IN-0002 · D');
    expect((await rowOf(page, 'IN-0002'))?.name).toBe('Giữ bí mật');
    expect(errors).toEqual([]);
  });

  it('ô dài ở hàng LÕI: editor nhiều dòng của thanh công thức + Lý do bắt buộc; ⌘/Ctrl+Enter lưu kèm lý do', async () => {
    const { page, errors } = await lab.open('fixture=instructions');
    await page.click(cell('IN-0003', 'D'));
    await page.keyboard.press('F2');
    const ta = page.locator('textarea.ga-fb-text');
    await ta.waitFor();
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('TEXTAREA');
    expect(await ta.inputValue()).toContain('Thiếu ngày, giờ, người nhận hay con số');
    expect(await page.locator('.ga-fb-ref').textContent()).toBe('IN-0003 · D');
    expect(await page.locator('.ga-fb-gutter').textContent()).toBe('1\n2');
    const save = page.locator('button.ga-fb-btn-save');
    await page.keyboard.press('End');
    await page.keyboard.type('\nKhông hỏi quá hai câu liên tiếp.');
    expect(await page.locator('.ga-fb-gutter').textContent()).toBe('1\n2\n3');
    expect(await save.isDisabled()).toBe(true); // thiếu lý do
    await page.keyboard.press('Control+Enter');
    expect((await h(page)).updates).toEqual([]);
    await page.fill('.ga-fb-reason input', 'thêm giới hạn số câu hỏi');
    expect(await save.isDisabled()).toBe(false);
    await page.keyboard.press('Control+Enter');
    await ta.waitFor({ state: 'detached' });
    const u = (await h(page)).updates;
    expect(u).toHaveLength(1);
    expect(u[0]).toMatchObject({ id: 'IN-0003', column: 'content', reason: 'thêm giới hạn số câu hỏi' });
    expect((await rowOf(page, 'IN-0003'))?.content.split('\n')).toHaveLength(3);
    expect((await gridState(page)).gridFocused).toBe(true);
    // hàng không lõi: không có ô lý do, Huỷ đóng editor không lưu
    await page.click(cell('IN-0005', 'D'));
    await page.click('button.ga-fb-btn >> text=Mở editor');
    await ta.waitFor();
    expect(await page.locator('.ga-fb-reason').count()).toBe(0);
    await page.click('button.ga-fb-btn >> text=Huỷ');
    await ta.waitFor({ state: 'detached' });
    expect((await h(page)).updates).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  it('lỗi tải: banner + "Thử lại" tải lại được; truy vấn bị nguồn từ chối (query.invalid) ⇒ banner + "Xoá truy vấn"', async () => {
    const { page } = await lab.open('fixture=instructions&failFetch=1');
    const banner = page.locator('.ga-dg-banner[role="alert"]');
    await banner.waitFor();
    expect(await banner.textContent()).toContain('Không tải được dữ liệu của lưới.');
    expect(await page.locator('[role="grid"]').getAttribute('aria-rowcount')).toBe('-1');
    // onError đúng một lần cho mỗi lỗi (StrictMode gắn effect hai lần ⇒ có thể là 1 hoặc 2 lần tải, mỗi lần một lỗi riêng)
    const errs = (await h(page)).errors;
    expect(errs.length).toBeGreaterThanOrEqual(1);
    expect(new Set(errs)).toEqual(new Set(['mô phỏng lỗi mạng']));
    // "Thử lại" khi mạng vẫn hỏng: lỗi mới được báo, vẫn banner, rồi KHÔNG tự gọi lại (không vòng lặp)
    const n0 = errs.length;
    await banner.locator('button', { hasText: 'Thử lại' }).click();
    await expect.poll(async () => (await h(page)).errors.length).toBe(n0 + 1);
    await banner.waitFor();
    const before = (await h(page)).errors.length;
    await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
    expect((await h(page)).errors.length).toBe(before);
    await page.evaluate(() => (window as unknown as { __h: { heal(): void } }).__h.heal());
    await banner.locator('button', { hasText: 'Thử lại' }).click();
    await expect.poll(async () => (await gridState(page)).footer).toBe('12 hàng · 0 đã chọn');
    expect(await banner.count()).toBe(0);
    // handle.setQuery đi thẳng tới nguồn (không qua kiểm của ô truy vấn) ⇒ nguồn từ chối như máy chủ
    await page.evaluate(() =>
      (window as unknown as { __grid: { current: { setQuery(q: string): void } } }).__grid.current.setQuery('abc:1'),
    );
    await banner.waitFor();
    expect(await banner.textContent()).toContain('Máy chủ từ chối truy vấn: cột không tồn tại trong lưới này');
    expect(await page.locator('.ga-qb-chip[data-invalid]').count()).toBe(1);
    await banner.locator('button', { hasText: 'Xoá truy vấn' }).click();
    await expect.poll(async () => (await gridState(page)).footer).toBe('12 hàng · 0 đã chọn');
  });

  it('lỗi lưu: banner danger + onError, dữ liệu không đổi, editor giữ nháp', async () => {
    const { page } = await lab.open('fixture=instructions&failSave=1');
    await page.click(cell('IN-0005', 'C'));
    await page.keyboard.press('F2');
    await page.keyboard.type('Tên mới');
    await page.keyboard.press('Enter');
    await page.locator('.ga-dg-banner[role="alert"]').waitFor();
    expect(await page.locator('.ga-dg-banner').textContent()).toContain('Không lưu được ô');
    expect((await h(page)).errors).toEqual(['mô phỏng lỗi lưu']);
    expect((await rowOf(page, 'IN-0005'))?.name).toBe('Xưng hô & giọng');
    expect(await page.locator('input.ga-dg-editor').inputValue()).toBe('Tên mới');
  });

  it('lọc qua toolbar ghi thành mệnh đề trong ô truy vấn; Σ token theo kết quả; sắp xếp header (đơn, nhiều cột)', async () => {
    const { page, errors } = await lab.open('fixture=instructions');
    await page.click('button[aria-label="Lọc"]');
    const dlg = page.locator('[role="dialog"][aria-label="Lọc"]');
    await dlg.waitFor();
    await dlg.locator('select').first().selectOption('layer');
    await dlg.locator('select').nth(2).selectOption('position');
    await dlg.locator('button', { hasText: 'Thêm điều kiện' }).click();
    await expect.poll(async () => (await gridState(page)).footer).toBe('3 hàng · 0 đã chọn');
    const st = await gridState(page);
    expect(st.chips).toEqual(['layer:position']);
    expect(st.ids).toEqual(['IN-0008', 'IN-0009', 'IN-0010']);
    expect(st.sum).toEqual(['292']);
    expect(await dlg.count()).toBe(0);
    // sắp xếp: bấm header Token (G)
    const tok = page.locator('[role="columnheader"][title="G · Token"]');
    await tok.locator('button').click();
    expect(await tok.getAttribute('aria-sort')).toBe('ascending');
    await expect.poll(async () => (await gridState(page)).ids).toEqual(['IN-0010', 'IN-0009', 'IN-0008']);
    await tok.locator('button').click();
    expect(await tok.getAttribute('aria-sort')).toBe('descending');
    await expect.poll(async () => (await gridState(page)).ids).toEqual(['IN-0008', 'IN-0009', 'IN-0010']);
    // bỏ lọc bằng × trên chip, sắp nhiều cột bằng Shift
    await page.click('button[aria-label="Bỏ điều kiện layer:position"]');
    await expect.poll(async () => (await gridState(page)).footer).toBe('12 hàng · 0 đã chọn');
    await page.locator('[role="columnheader"][title="B · Lớp"] button').click({ modifiers: ['Shift'] });
    // header theo thứ tự cột: B (khoá 2, tăng) … G (khoá 1, giảm)
    expect(await page.locator('.ga-dg-sorted').allTextContents()).toEqual(['\u21912', '\u21931']);
    expect(await page.locator('[role="columnheader"][title="B · Lớp"]').getAttribute('aria-sort')).toBe('ascending');
    // popover Sắp xếp: đặt một khoá rồi bỏ
    await page.click('button[aria-label="Sắp xếp"]');
    const sdlg = page.locator('[role="dialog"][aria-label="Sắp xếp"]');
    await sdlg.locator('select').first().selectOption('name');
    await sdlg.locator('select').nth(1).selectOption('asc');
    await sdlg.locator('button', { hasText: 'Áp dụng' }).click();
    // đối chiếu tiếng Việt: "Định dạng email (bản cũ)" < "Định dạng Telegram" < "Giữ bí mật…"
    await expect.poll(async () => (await gridState(page)).ids.slice(0, 3)).toEqual(['IN-0012', 'IN-0006', 'IN-0002']);
    await page.click('button[aria-label="Sắp xếp"]');
    await sdlg.locator('button', { hasText: 'Bỏ sắp xếp' }).click();
    await expect.poll(async () => (await gridState(page)).ids[0]).toBe('IN-0001');
    expect(errors).toEqual([]);
  });

  it('kéo đổi độ rộng cột (header + ô cùng đổi), nhấp đúp về mặc định', async () => {
    const { page } = await lab.open('fixture=instructions');
    const width = () =>
      page.evaluate(
        () =>
          document.querySelector('[data-anchor="grid:instructions/row:IN-0001/col:C"]')?.getBoundingClientRect().width,
      );
    expect(await width()).toBe(168);
    const handle = page.locator('[role="columnheader"][title="C · Tên khối"] .ga-dg-resize');
    const box = await handle.boundingBox();
    if (!box) throw new Error('không thấy tay kéo');
    await page.mouse.move(box.x + 3, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 63, box.y + 10, { steps: 5 });
    await page.mouse.up();
    expect(await width()).toBe(228);
    const head = await page.locator('[role="columnheader"][title="C · Tên khối"]').boundingBox();
    expect(head?.width).toBe(228);
    await handle.dblclick();
    expect(await width()).toBe(168);
  });

  it('ẩn cột: chữ cột và anchor của cột còn lại KHÔNG đổi; luôn giữ ít nhất một cột', async () => {
    const { page } = await lab.open('fixture=instructions');
    await page.click('button[aria-label="Ẩn hiện cột"]');
    const dlg = page.locator('[role="dialog"][aria-label="Ẩn hiện cột"]');
    await dlg.locator('label', { hasText: 'Lớp' }).click();
    const letters = await page.locator('.ga-dg-letters > span').allTextContents();
    expect(letters.filter((x) => x !== '')).toEqual(['A', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);
    expect(await page.locator(cell('IN-0001', 'B')).count()).toBe(0);
    expect(await page.locator(cell('IN-0001', 'C')).textContent()).toBe('Trung thực trước hết');
    await page.keyboard.press('Escape');
    expect(await dlg.count()).toBe(0);
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Ẩn hiện cột');
  });

  it('ô truy vấn: chip + Σ; lỗi cột lạ báo tại chỗ (không áp nửa vời); ×, Backspace lấy chip ra sửa; ID trần; phủ định; toàn văn; view', async () => {
    const { page, errors } = await lab.open('fixture=instructions');
    const input = page.locator('.ga-qb-input');
    await input.click();
    await input.fill('lop:vi-tri tokens>70');
    await input.press('Enter');
    await expect.poll(async () => (await gridState(page)).footer).toBe('2 hàng · 0 đã chọn');
    let st = await gridState(page);
    expect(st.chips).toEqual(['lop:vi-tri', 'tokens>70']);
    expect(st.sum).toEqual(['228']);
    // cột lạ: báo lỗi, KHÔNG áp
    await input.fill('abc:1');
    await input.press('Enter');
    const alert = page.locator('.ga-qb-error[role="alert"]');
    await alert.waitFor();
    expect(await alert.textContent()).toBe('Không hiểu “abc”: cột không tồn tại trong lưới này');
    expect(await input.getAttribute('aria-invalid')).toBe('true');
    expect((await gridState(page)).footer).toBe('2 hàng · 0 đã chọn');
    await input.press('Escape');
    expect(await alert.count()).toBe(0);
    expect(await input.inputValue()).toBe('');
    // toán tử sai kiểu
    await input.fill('lop>3');
    await input.press('Enter');
    expect(await alert.textContent()).toContain('toán tử không dùng được');
    await input.press('Escape');
    // × trên chip
    await page.click('button[aria-label="Bỏ điều kiện tokens>70"]');
    await expect.poll(async () => (await gridState(page)).footer).toBe('3 hàng · 0 đã chọn');
    // Backspace ở ô trống: lấy chip cuối ra sửa
    await input.click();
    await input.press('Backspace');
    expect(await input.inputValue()).toBe('lop:vi-tri');
    await expect.poll(async () => (await gridState(page)).footer).toBe('12 hàng · 0 đã chọn');
    await input.fill('IN-0003');
    await input.press('Enter');
    await expect.poll(async () => (await gridState(page)).ids).toEqual(['IN-0003']);
    await page.click('button[aria-label="Bỏ điều kiện IN-0003"]');
    await input.fill('-on:true');
    await input.press('Enter');
    await expect.poll(async () => (await gridState(page)).ids).toEqual(['IN-0007', 'IN-0012']);
    await page.click('button[aria-label="Bỏ điều kiện -on:true"]');
    await input.fill('"báo cáo tuần"');
    await input.press('Enter');
    await expect.poll(async () => (await gridState(page)).ids).toEqual(['IN-0008', 'IN-0010']);
    await page.click('button[aria-label="Bỏ điều kiện \\"báo cáo tuần\\""]');
    // không có hàng nào: trạng thái trống + "Xoá truy vấn"
    await input.fill('tokens>9999');
    await input.press('Enter');
    await page.locator('.ga-dg-empty').waitFor();
    expect(await page.locator('.ga-dg-empty').textContent()).toContain('Không có hàng nào khớp truy vấn.');
    await page.locator('.ga-dg-empty button', { hasText: 'Xoá truy vấn' }).click();
    await expect.poll(async () => (await gridState(page)).footer).toBe('12 hàng · 0 đã chọn');
    // view dựng sẵn
    await page.selectOption('select.ga-dg-view', 'on');
    await expect.poll(async () => (await gridState(page)).chips).toEqual(['on:true']);
    st = await gridState(page);
    expect(st.footer).toBe('10 hàng · 0 đã chọn');
    expect(errors).toEqual([]);
  });

  it('xuất CSV: BOM + CRLF, cột đang hiện, đúng truy vấn đang áp, chặn CSV injection', async () => {
    const { page, errors } = await lab.open('fixture=instructions');
    const grab = async (): Promise<{ name: string; text: string }> => {
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button[aria-label="Xuất CSV"]')]);
      const p = await dl.path();
      return { name: dl.suggestedFilename(), text: await readFile(p, 'utf8') };
    };
    let csv = await grab();
    expect(csv.name).toBe('instructions.csv');
    expect(csv.text.startsWith('\uFEFF')).toBe(true);
    const lines = csv.text.slice(1).split('\r\n');
    expect(lines[0]).toBe(
      'ID,A · Thứ tự,B · Lớp,C · Tên khối,D · Nội dung,E · Điều kiện,F · Bật,G · Token,H · Nguồn,I · Sửa lần cuối,J · Trạng thái',
    );
    expect(lines.filter((l) => l !== '')).toHaveLength(13);
    expect(lines[1]).toMatch(/^IN-0001,1,values,Trung thực trước hết,"Không bao giờ bịa số liệu/);
    const l12 = lines.find((l) => l.startsWith('IN-0012,')) ?? '';
    expect(l12).toContain(`"'=HYPERLINK(""http://example.invalid"",""bấm"")`);
    // ẩn cột + truy vấn
    await page.locator('.ga-qb-input').fill('lop:vi-tri');
    await page.locator('.ga-qb-input').press('Enter');
    await expect.poll(async () => (await gridState(page)).footer).toBe('3 hàng · 0 đã chọn');
    await page.click('button[aria-label="Ẩn hiện cột"]');
    await page.locator('[role="dialog"] label', { hasText: 'Nội dung' }).click();
    await page.keyboard.press('Escape');
    csv = await grab();
    const rows = csv.text
      .slice(1)
      .split('\r\n')
      .filter((l) => l !== '');
    expect(rows).toHaveLength(4);
    expect(rows[0]).not.toContain('Nội dung');
    expect(rows.slice(1).map((r) => r.split(',')[0])).toEqual(['IN-0008', 'IN-0009', 'IN-0010']);
    expect(errors).toEqual([]);
  });

  it('hàng Đề xuất (nền accent + Áp dụng / Bỏ) và hàng bị thay (muted + gạch + "→ ID mới" điều hướng)', async () => {
    const { page } = await lab.open('fixture=instructions');
    const prop = page.locator('[role="row"][data-anchor="grid:instructions/row:IN-0010"]');
    expect(await prop.getAttribute('data-kind')).toBe('proposed');
    await prop.locator('button', { hasText: 'Áp dụng' }).click();
    await prop.locator('button', { hasText: 'Bỏ' }).click();
    expect((await h(page)).applied).toEqual(['IN-0010']);
    expect((await h(page)).rejected).toEqual(['IN-0010']);
    const sup = page.locator('[role="row"][data-anchor="grid:instructions/row:IN-0012"]');
    expect(await sup.getAttribute('data-kind')).toBe('superseded');
    const deco = await sup
      .locator('.ga-dg-text')
      .first()
      .evaluate((e) => getComputedStyle(e).textDecorationLine);
    expect(deco).toBe('line-through');
    await page.click(cell('IN-0012', 'C'));
    await sup.locator('button', { hasText: '→ IN-0006' }).click();
    // bấm link = chọn ô "Duyệt" của hàng cũ ⇒ sang hàng mới ở cùng cột "Duyệt"
    await expect.poll(async () => (await gridState(page)).ref).toBe('IN-0006');
    // bàn phím: ô "Duyệt" là ô cuối; Enter vào nút của ô, ←/→ giữa các nút, Esc về lưới
    await page.click(cell('IN-0010', 'C'));
    await page.keyboard.press('End');
    expect((await gridState(page)).ref).toBe('IN-0010');
    expect(await page.locator('.ga-fb-value').textContent()).toBe('Đề xuất');
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Áp dụng');
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Bỏ');
    await page.keyboard.press('Enter');
    expect((await h(page)).rejected).toEqual(['IN-0010', 'IN-0010']);
    await page.keyboard.press('Escape');
    expect((await gridState(page)).gridFocused).toBe(true);
  });

  it('chọn hàng: Shift+Space, checkbox, Ctrl+A (mọi hàng khớp truy vấn) + footer; Enter mở hàng khi màn có inspector', async () => {
    const { page } = await lab.open('fixture=instructions&open=1');
    await page.click(cell('IN-0002', 'C'));
    await page.keyboard.press('Shift+Space');
    expect((await gridState(page)).footer).toBe('12 hàng · 1 đã chọn');
    expect(await page.locator('[data-anchor="grid:instructions/row:IN-0002"]').getAttribute('aria-selected')).toBe(
      'true',
    );
    await page.click('[data-anchor="grid:instructions/row:IN-0004"] input[type="checkbox"]');
    expect((await gridState(page)).footer).toBe('12 hàng · 2 đã chọn');
    expect((await gridState(page)).gridFocused).toBe(true);
    await page.keyboard.press('Control+a');
    expect((await gridState(page)).footer).toBe('12 hàng · 12 đã chọn');
    await page.click('[data-anchor="grid:instructions/row:IN-0004"] input[type="checkbox"]');
    expect((await gridState(page)).footer).toBe('12 hàng · 11 đã chọn');
    expect(
      await page
        .locator('[role="columnheader"] input[type="checkbox"]')
        .evaluate((e) => (e as HTMLInputElement).indeterminate),
    ).toBe(true);
    await page.keyboard.press('Enter');
    expect((await h(page)).opened).toEqual(['IN-0002']);
  });

  it('clipboard: Ctrl+C chép giá trị thô của ô; dán vào ô sửa được ghi qua nguồn, ô chỉ đọc / hàng lõi bỏ qua', async () => {
    const { page } = await lab.open('fixture=instructions');
    await page.click(cell('IN-0001', 'C'));
    await page.keyboard.press('Control+c');
    expect(await page.evaluate(() => (window as unknown as { __h: H }).__h.copied)).toEqual(['Trung thực trước hết']);
    const paste = (text: string) =>
      page.evaluate((t) => {
        const dt = new DataTransfer();
        dt.setData('text/plain', t);
        document
          .querySelector('[role="grid"]')
          ?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      }, text);
    await page.click(cell('IN-0006', 'C'));
    await paste('Định dạng Zalo\n');
    await expect.poll(async () => (await rowOf(page, 'IN-0006'))?.name).toBe('Định dạng Zalo');
    await page.click(cell('IN-0006', 'G'));
    await paste('999');
    await page.click(cell('IN-0003', 'D'));
    await paste('ghi đè lõi');
    // focus ở ô truy vấn: dán là của ô truy vấn, lưới KHÔNG ghi ô đang chọn
    await page.click(cell('IN-0002', 'C'));
    await page.locator('.ga-qb-input').focus();
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'không được ghi');
      document
        .querySelector('.ga-qb-input')
        ?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    expect((await h(page)).updates.map((u) => u.column)).toEqual(['name']);
    expect((await rowOf(page, 'IN-0002'))?.name).toBe('Giữ bí mật nội bộ');
  });

  it('+ Thêm hàng: tạo qua nguồn, cuộn tới hàng mới và chọn ô sửa được đầu tiên', async () => {
    const { page } = await lab.open('fixture=instructions');
    await page.click('button:has-text("Thêm hàng")');
    await expect.poll(async () => (await gridState(page)).footer).toBe('13 hàng · 0 đã chọn');
    await expect.poll(async () => (await gridState(page)).ref).toBe('IN-0013 · B');
    expect((await h(page)).added).toBe(1);
  });

  it('nhóm theo cột: hàng tiêu đề nhóm + số hàng, thu gọn / mở, scrollToId mở nhóm đang thu gọn', async () => {
    const { page, errors } = await lab.open('fixture=instructions');
    await page.click('button[aria-label="Nhóm hàng"]');
    await page.locator('[role="dialog"][aria-label="Nhóm hàng"] select').selectOption('layer');
    const groupRows = page.locator('.ga-dg-grouprow');
    await groupRows.first().waitFor();
    // nhóm theo thứ tự sắp xếp của nguồn (giá trị thô của cột, như ORDER BY)
    expect(await groupRows.allTextContents()).toEqual([
      'Lớp: Mục tiêu · 1 hàng',
      'Lớp: Nội quy · 1 hàng',
      'Lớp: Tính cách · 2 hàng',
      'Lớp: Vị trí · 3 hàng',
      'Lớp: Phong cách · 3 hàng',
      'Lớp: Giá trị · 2 hàng',
    ]);
    await groupRows.first().locator('button').click();
    expect(await groupRows.first().locator('button').getAttribute('aria-expanded')).toBe('false');
    expect(await page.locator(cell('IN-0007', 'C')).count()).toBe(0);
    const res = await page.evaluate(async () => {
      const g = (
        window as unknown as { __grid: { current: { scrollToId(id: string, c: string): Promise<{ status: string }> } } }
      ).__grid.current;
      return (await g.scrollToId('IN-0007', 'C')).status;
    });
    expect(res).toBe('ready');
    expect(await groupRows.first().locator('button').getAttribute('aria-expanded')).toBe('true');
    expect((await gridState(page)).ref).toBe('IN-0007 · C');
    // bàn phím trên hàng nhóm: Enter thu gọn
    await page.locator('[role="grid"]').focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    expect(await groupRows.first().locator('button').getAttribute('aria-expanded')).toBe('false');
    expect(errors).toEqual([]);
  });

  it('mật độ hàng 28 ↔ 32px; nhớ trạng thái bảng (truy vấn, cột ẩn, mật độ) qua lần tải lại', async () => {
    const { page } = await lab.open('fixture=instructions&persist=1');
    const rowH = () =>
      page.evaluate(() => document.querySelector('.ga-dg-body [role="row"]')?.getBoundingClientRect().height);
    expect(await rowH()).toBe(28);
    await page.click('button[aria-label="Mật độ hàng"]');
    expect(await page.getAttribute('button[aria-label="Mật độ hàng"]', 'aria-pressed')).toBe('true');
    expect(await rowH()).toBe(32);
    await page.locator('.ga-qb-input').fill('on:true');
    await page.locator('.ga-qb-input').press('Enter');
    await page.click('button[aria-label="Ẩn hiện cột"]');
    await page.locator('[role="dialog"] label', { hasText: 'Nguồn' }).click();
    await page.keyboard.press('Escape');
    await page.reload();
    await page.waitForSelector('.ga-dg-body [role="row"][data-anchor]');
    const st = await gridState(page);
    expect(st.chips).toEqual(['on:true']);
    expect(await page.locator('[role="columnheader"][title="H · Nguồn"]').count()).toBe(0);
    expect(await rowH()).toBe(32);
    // dữ liệu nhớ bị sửa tay thành rác ⇒ bỏ qua, lưới vẫn chạy
    await page.evaluate(() =>
      localStorage.setItem('ga.grid.instr-test', '{"v":1,"q":5,"hidden":["khong-co"],"density":"x"}'),
    );
    await page.reload();
    await page.waitForSelector('.ga-dg-body [role="row"][data-anchor]');
    expect((await gridState(page)).footer).toBe('12 hàng · 0 đã chọn');
    expect(await rowH()).toBe(28);
  });
});
