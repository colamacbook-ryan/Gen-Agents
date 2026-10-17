// @vitest-environment happy-dom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, pathOf } from '../src/nav.ts';
import { FakeAuthClient, SAMPLE_SESSION } from './support/fake-auth-client.ts';
import { registerCleanup, renderApp } from './support/render-app.ts';

registerCleanup();

const authed = () => new FakeAuthClient({ session: SAMPLE_SESSION });
const shell = async (path: string) => {
  const app = renderApp(authed(), { path });
  await screen.findByRole('navigation', { name: 'Điều hướng chính' });
  return app;
};
const key = (init: KeyboardEventInit) => fireEvent.keyDown(document.body, init);

describe('khung app sau đăng nhập (STD-07 §3)', () => {
  it('/ đưa vào Tổng quan; có đủ 6 nhóm lớn, nhóm hiện tại aria-current=page', async () => {
    const app = await shell('/');
    expect(app.pathname()).toBe('/overview');
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    expect(
      within(nav)
        .getAllByRole('link')
        .slice(0, 6)
        .map((l) => l.textContent),
    ).toEqual(['Tổng quan', 'Nhân sự', 'Tri thức', 'Vận hành', 'Hạ tầng', 'Hệ thống']);
    expect(within(nav).getByRole('link', { name: 'Tổng quan' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('heading', { level: 1, name: 'Tổng quan' })).toBeTruthy();
    expect(screen.getByText('Buồng lái vận hành hằng ngày.')).toBeTruthy();
  });

  it('nhóm có tab: page header 2 tầng với thanh tab, tab hiện tại aria-selected, tabpanel gắn nhãn theo tab', async () => {
    await shell('/people/birth');
    const tablist = screen.getByRole('tablist', { name: 'Các tab của trang' });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Danh sách Role',
      'Khai sinh',
      'Đào tạo',
      'Thẻ nhân viên',
      'Kho nhân vật',
    ]);
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false', 'false', 'false']);
    const panel = screen.getByRole('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[1]?.id);
    // màn chưa dựng: placeholder rõ ràng, không trống trơn
    expect(within(panel).getByRole('heading', { name: 'Màn hình này đang được dựng.' })).toBeTruthy();
    // breadcrumb: Nhóm / Tab
    const crumbs = screen.getByRole('navigation', { name: 'Đường dẫn trang' });
    expect(crumbs.textContent).toContain('Nhân sự');
    expect(crumbs.querySelector('[aria-current="page"]')?.textContent).toContain('Khai sinh');
  });

  it('bấm nhóm trên sidebar → tab đầu tiên của nhóm; bấm tab → đổi tab, giữ nhóm', async () => {
    const app = await shell('/overview');
    const user = userEvent.setup();
    await user.click(
      within(screen.getByRole('navigation', { name: 'Điều hướng chính' })).getByRole('link', { name: 'Tri thức' }),
    );
    await waitFor(() => expect(app.pathname()).toBe('/knowledge/instructions'));
    await user.click(screen.getByRole('tab', { name: 'Brain' }));
    await waitFor(() => expect(app.pathname()).toBe('/knowledge/brain'));
    expect(screen.getByRole('tab', { name: 'Brain' }).getAttribute('aria-selected')).toBe('true');
    expect(
      within(screen.getByRole('navigation', { name: 'Điều hướng chính' }))
        .getByRole('link', { name: 'Tri thức' })
        .getAttribute('aria-current'),
    ).toBe('page');
  });

  it('/people (không có tab) chuyển tới tab đầu; đường dẫn lạ hiện "không tìm thấy" TRONG khung app', async () => {
    const app = await shell('/people');
    await waitFor(() => expect(app.pathname()).toBe('/people/roles'));
    act(() => void app.history.push('/khong/co/trang/nay'));
    expect(await screen.findByRole('heading', { name: 'Không tìm thấy trang này.' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toBeTruthy();
  });

  it('mọi nhóm và mọi tab của cấu hình đều dựng được (không tuyến nào gãy)', async () => {
    const app = await shell('/overview');
    for (const g of NAV_GROUPS) {
      for (const path of g.tabs.length === 0 ? [pathOf(g)] : g.tabs.map((t) => pathOf(g, t))) {
        await act(async () => void app.history.push(path));
        await waitFor(() => expect(app.pathname()).toBe(path));
        expect(screen.getByRole('main')).toBeTruthy();
        expect(screen.queryByText('Không tìm thấy trang này.')).toBeNull();
      }
    }
  });

  it('đăng xuất: gọi API, xoá phiên, về /login; vào lại Admin bị chặn', async () => {
    const auth = authed();
    const app = renderApp(auth, { path: '/overview' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Đăng xuất' }));
    await screen.findByLabelText('Tên đăng nhập');
    expect(app.pathname()).toBe('/login');
    expect(auth.calls.logout).toBe(1);
    act(() => void app.history.push('/system/settings'));
    await screen.findByLabelText('Tên đăng nhập');
    expect(app.pathname()).toBe('/login');
  });

  it('phiên hết hạn ở máy chủ (session() = null) thì bị đưa về /login', async () => {
    const app = renderApp(new FakeAuthClient({ session: null }), { path: '/ops/wallet' });
    await screen.findByLabelText('Tên đăng nhập');
    expect(app.pathname()).toBe('/login');
  });

  it('lỗi tải phiên (mạng): banner danger trong vùng lỗi + nút Thử lại, không trắng màn', async () => {
    const { authError } = await import('./support/fake-auth-client.ts');
    let fail = true;
    const auth = new FakeAuthClient({ session: SAMPLE_SESSION });
    const original = auth.session.bind(auth);
    auth.session = async () => {
      if (fail) throw authError('network');
      return original();
    };
    renderApp(auth, { path: '/overview' });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Không kết nối được tới máy chủ');
    fail = false;
    await userEvent.setup().click(within(alert).getByRole('button', { name: 'Thử lại' }));
    await screen.findByRole('navigation', { name: 'Điều hướng chính' });
  });

  it('sidebar: Role đang ghim trống, workspace (Telegram dùng được; webgame mờ "sắp có"), phiên bản', async () => {
    await shell('/overview');
    expect(screen.getByText('Chưa ghim Role nào')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Telegram/ }).getAttribute('href')).toBe('/ops/telegram');
    expect(screen.queryByRole('link', { name: /webgame/ })).toBeNull();
    expect(screen.getByText('GĐ2 · sắp có')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'v0.0.0' }).getAttribute('href')).toBe('/system/update');
  });

  it('thu gọn sidebar thành rail rồi mở lại', async () => {
    await shell('/overview');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Thu gọn thanh bên' }));
    expect(document.querySelector('.ga-sidebar--rail')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Mở rộng thanh bên' }));
    expect(document.querySelector('.ga-sidebar--rail')).toBeNull();
  });
});

describe('phím tắt toàn cục (FRONTEND-SPEC §2.4)', () => {
  it('G rồi chữ cái đi tới đúng màn (mọi chữ trong bảng)', async () => {
    const app = await shell('/overview');
    const map: Record<string, string> = {
      d: '/overview',
      u: '/people/roles',
      k: '/people/birth',
      t: '/people/training',
      c: '/people/cards',
      b: '/knowledge/brain',
      e: '/infra/accounts',
      l: '/system/audit',
      v: '/system/update',
      s: '/system/settings',
      x: '/ops/leaderboard',
      p: '/ops/proactive',
    };
    for (const [letter, path] of Object.entries(map)) {
      key({ key: 'g' });
      key({ key: letter });
      await waitFor(() => expect(app.pathname(), `g ${letter}`).toBe(path));
    }
  });

  it('[ và ] chuyển tab trước / sau, quay vòng; N mở Khai sinh', async () => {
    const app = await shell('/system/audit');
    key({ key: ']' });
    await waitFor(() => expect(app.pathname()).toBe('/system/update'));
    key({ key: ']' });
    key({ key: ']' });
    await waitFor(() => expect(app.pathname()).toBe('/system/audit')); // quay vòng 3 tab
    key({ key: '[' });
    await waitFor(() => expect(app.pathname()).toBe('/system/settings'));
    key({ key: 'n' });
    await waitFor(() => expect(app.pathname()).toBe('/people/birth'));
  });

  it('? mở bảng phím tắt (O3), Esc đóng và trả focus', async () => {
    await shell('/overview');
    key({ key: '?', shiftKey: true });
    const dialog = await screen.findByRole('dialog', { name: 'Phím tắt' });
    expect(within(dialog).getByText('Tới Brain')).toBeTruthy();
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('⌘K mở bảng lệnh (O1): gõ "the" ra Thẻ nhân viên, Enter điều hướng; một overlay tại một thời điểm', async () => {
    const app = await shell('/overview');
    key({ key: 'k', metaKey: true });
    const input = await screen.findByRole('combobox', { name: 'Bảng lệnh' });
    fireEvent.change(input, { target: { value: 'the nhan' } });
    expect(
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Nhân sự › Thẻ nhân viên']);
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(app.pathname()).toBe('/people/cards'));
    expect(screen.queryByRole('dialog')).toBeNull();
    // mở bảng lệnh rồi mở phím tắt: cái sau thay cái trước
    key({ key: 'k', metaKey: true });
    await screen.findByRole('dialog', { name: 'Bảng lệnh' });
    key({ key: '?', shiftKey: true });
    await screen.findByRole('dialog', { name: 'Phím tắt' });
    expect(screen.queryByRole('dialog', { name: 'Bảng lệnh' })).toBeNull();
  });

  it('bảng lệnh có nhóm Hành động và Điều hướng; bấm chuông mở trung tâm thông báo (trống)', async () => {
    await shell('/overview');
    key({ key: 'k', metaKey: true });
    const list = await screen.findByRole('listbox');
    expect(
      within(list)
        .getAllByRole('group')
        .map((g) => g.getAttribute('aria-label')),
    ).toEqual(['Hành động', 'Điều hướng']);
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Thông báo, 0 chưa đọc' }));
    expect(await screen.findByRole('dialog', { name: 'Thông báo' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Chưa có thông báo nào.' })).toBeTruthy();
  });

  it('⌘J bật / tắt log drawer (thu gọn mặc định)', async () => {
    await shell('/overview');
    expect(screen.queryByRole('log')).toBeNull();
    key({ key: 'j', metaKey: true });
    expect(await screen.findByRole('log', { name: 'Log' })).toBeTruthy();
    key({ key: 'j', ctrlKey: true });
    await waitFor(() => expect(screen.queryByRole('log')).toBeNull());
  });

  it('đang gõ trong ô nhập thì phím chữ trơn không điều hướng (không "g d" khi gõ vào ô truy vấn)', async () => {
    const app = await shell('/system/settings');
    key({ key: 'k', metaKey: true });
    const input = await screen.findByRole('combobox');
    fireEvent.keyDown(input, { key: 'g' });
    fireEvent.keyDown(input, { key: 'd' });
    expect(app.pathname()).toBe('/system/settings');
  });

  it('phím tắt chưa đăng nhập không hoạt động (không có khung)', async () => {
    const app = renderApp(new FakeAuthClient(), { path: '/login' });
    await screen.findByLabelText('Tên đăng nhập');
    key({ key: 'g' });
    key({ key: 's' });
    expect(app.pathname()).toBe('/login');
  });
});
