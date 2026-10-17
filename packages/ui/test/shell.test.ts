// @vitest-environment happy-dom
import { fireEvent, screen, within } from '@testing-library/react';
import { Activity, LayoutDashboard, Send, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../src/primitives/index.ts';
import {
  AppShell,
  ConnectionStrip,
  Header,
  LogDrawer,
  type NavGroup,
  PageActions,
  PageHeader,
  type ShellLinkProps,
  ShellLinkProvider,
  Sidebar,
} from '../src/shell/index.ts';
import { h, registerCleanup, renderUi } from './support/dom.ts';

registerCleanup();

const groups: NavGroup[] = [
  { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard, to: '/overview', tabs: [] },
  {
    id: 'people',
    label: 'Nhân sự',
    icon: Users,
    to: '/people/roles',
    count: 7,
    tabs: [
      { id: 'roles', label: 'Danh sách Role', to: '/people/roles', count: 7 },
      { id: 'birth', label: 'Khai sinh', to: '/people/birth' },
      { id: 'cards', label: 'Thẻ nhân viên', to: '/people/cards', count: 4 },
    ],
  },
  {
    id: 'infra',
    label: 'Hạ tầng',
    icon: Activity,
    to: '/infra/accounts',
    tabs: [],
    alert: { label: 'Có tài khoản hết quota' },
  },
];

describe('Sidebar', () => {
  const props = {
    brand: 'Gen-Agents',
    workspaceName: 'Afi Labs',
    groups,
    activeGroupId: 'people',
    owner: { name: 'admin', role: 'Owner' },
    version: { label: 'v0.1.0', updateAvailable: true },
  };

  it('nhóm lớn là liên kết; mục đang chọn là aria-current=page; có số đếm và chấm cảnh báo có nhãn', () => {
    renderUi(h(Sidebar, props));
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent?.replace(/\d+$/, ''))).toEqual(['Tổng quan', 'Nhân sự', 'Hạ tầng']);
    expect(
      within(nav)
        .getByRole('link', { name: /Nhân sự/ })
        .getAttribute('aria-current'),
    ).toBe('page');
    expect(
      within(nav)
        .getByRole('link', { name: /Tổng quan/ })
        .getAttribute('aria-current'),
    ).toBeNull();
    expect(within(nav).getByRole('link', { name: /Nhân sự/ }).textContent).toContain('7');
    expect(within(nav).getByRole('img', { name: 'Có tài khoản hết quota' })).toBeTruthy();
  });

  it('brand, workspace, owner, phiên bản + "có bản mới", Role đang ghim trống', () => {
    renderUi(h(Sidebar, props));
    expect(screen.getByText('Gen-Agents')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Đổi workspace, hiện tại Afi Labs' })).toBeTruthy();
    expect(screen.getByText('admin · Owner')).toBeTruthy();
    expect(screen.getByText(/v0\.1\.0 · có bản mới/)).toBeTruthy();
    expect(screen.getByText('Chưa ghim Role nào')).toBeTruthy();
  });

  it('Role đang ghim: avatar + tên + ID mono + trạng thái bằng chữ (Trọng thương có giọt lệ, không đỏ)', () => {
    const { container } = renderUi(
      h(Sidebar, {
        ...props,
        pinned: [
          {
            id: '1',
            name: 'Mai',
            code: 'RL-0001',
            color: 'teal',
            to: '/roles/1',
            live: 'running',
            statusLabel: 'đang chạy',
          },
          {
            id: '2',
            name: 'Lan',
            code: 'RL-0002',
            color: 'coral',
            to: '/roles/2',
            wounded: true,
            statusLabel: 'nghỉ dưỡng thương',
          },
        ],
      }),
    );
    expect(screen.getByRole('link', { name: /Mai/ }).textContent).toContain('đang chạy');
    expect(screen.getByRole('link', { name: /Lan/ }).textContent).toContain('nghỉ dưỡng thương');
    expect(container.querySelectorAll('.ga-avatar__tear')).toHaveLength(1);
    expect(screen.getByText('RL-0001').className).toContain('ga-pinned__code');
  });

  it('thu gọn thành rail: nhãn vẫn có trong DOM cho trình đọc màn hình, nút bật lại có nhãn', () => {
    const onToggle = vi.fn();
    const { container } = renderUi(h(Sidebar, { ...props, collapsed: true, onToggleCollapsed: onToggle }));
    expect(container.querySelector('.ga-sidebar--rail')).not.toBeNull();
    expect(screen.getByRole('link', { name: /Nhân sự/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mở rộng thanh bên' }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('liên kết kết xuất qua ShellLinkProvider (để gắn router)', () => {
    const calls: ShellLinkProps[] = [];
    const link = (p: ShellLinkProps): ReactNode => {
      calls.push(p);
      return h('a', { 'data-router': 'yes', href: p.to, className: p.className }, p.children);
    };
    renderUi(h(ShellLinkProvider, { link }, h(Sidebar, props)));
    expect(calls.map((c) => c.to)).toEqual(['/overview', '/people/roles', '/infra/accounts', '#']);
    expect(document.querySelectorAll('a[data-router="yes"]').length).toBeGreaterThanOrEqual(3);
  });

  it('mục workspace chưa dùng được hiện mờ, không điều hướng', () => {
    renderUi(
      h(Sidebar, {
        ...props,
        workspaceLinks: [
          { id: 'tg', label: 'Telegram', to: '/ops/telegram', icon: Send, badge: 'MVP' },
          { id: 'game', label: 'Workspace webgame', to: '/x', icon: Send, badge: 'GĐ2 · sắp có', disabled: true },
        ],
      }),
    );
    expect(screen.getByRole('link', { name: /Telegram/ }).getAttribute('href')).toBe('/ops/telegram');
    expect(screen.queryByRole('link', { name: /webgame/ })).toBeNull();
    expect(screen.getByText('Workspace webgame').closest('[aria-disabled="true"]')).not.toBeNull();
  });

  it('đăng xuất gọi onLogout', () => {
    const onLogout = vi.fn();
    renderUi(h(Sidebar, { ...props, onLogout }));
    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(onLogout).toHaveBeenCalledOnce();
  });
});

describe('Header', () => {
  it('breadcrumb (mục cuối là trang hiện tại), ô ⌘K, cụm trạng thái, chuông có số', () => {
    const onOpenPalette = vi.fn();
    const onBell = vi.fn();
    renderUi(
      h(Header, {
        breadcrumb: [{ label: 'Nhân sự', to: '/people' }, { label: 'Khai sinh' }],
        onOpenPalette,
        status: { tone: 'ok', label: 'Ổn định' },
        runningText: '3/7 đang chạy',
        quota: { tone: 'warn', label: 'quota 18%', title: 'Quota thấp nhất' },
        bell: { count: 3, onClick: onBell },
      }),
    );
    const crumbs = screen.getByRole('navigation', { name: 'Đường dẫn trang' });
    expect(within(crumbs).getByRole('link', { name: 'Nhân sự' })).toBeTruthy();
    expect(crumbs.querySelector('[aria-current="page"]')?.textContent).toContain('Khai sinh');
    fireEvent.click(screen.getByRole('button', { name: /Tìm Role, ID, lệnh/ }));
    expect(onOpenPalette).toHaveBeenCalledOnce();
    expect(screen.getByText('Ổn định')).toBeTruthy();
    expect(screen.getByText('3/7 đang chạy').className).toContain('ga-mono');
    expect(screen.getByText('quota 18%').className).toContain('ga-quota--warn');
    fireEvent.click(screen.getByRole('button', { name: 'Thông báo, 3 chưa đọc' }));
    expect(onBell).toHaveBeenCalledOnce();
  });

  it('không bịa dữ liệu: bỏ trạng thái / quota thì không hiện; chuông 0 không có số', () => {
    const { container } = renderUi(
      h(Header, { breadcrumb: [{ label: 'Tổng quan' }], onOpenPalette: vi.fn(), bell: { count: 0, onClick: vi.fn() } }),
    );
    expect(container.querySelector('.ga-header__status')).toBeNull();
    expect(container.querySelector('.ga-quota')).toBeNull();
    expect(container.querySelector('.ga-header__bell-count')).toBeNull();
  });

  it('dải mất kết nối chỉ hiện khi mất kết nối', () => {
    const { rerender } = renderUi(h(ConnectionStrip, { lost: false }));
    expect(screen.queryByRole('status')).toBeNull();
    rerender(h(ConnectionStrip, { lost: true }));
    expect(screen.getByRole('status').textContent).toContain('Mất kết nối — đang thử lại');
  });
});

describe('PageHeader + PageActions', () => {
  const tabs = [
    { id: 'roles', label: 'Danh sách Role', to: '/people/roles', count: 7 },
    { id: 'birth', label: 'Khai sinh', to: '/people/birth' },
    { id: 'cards', label: 'Thẻ nhân viên', to: '/people/cards', count: 4 },
  ];

  it('tầng 1: tiêu đề h1 + mô tả; tầng 2: tablist, tab đang chọn aria-selected, số đếm mono', () => {
    renderUi(
      h(PageHeader, {
        title: 'Nhân sự',
        description: 'Role, giấy khai sinh, thẻ',
        tabs,
        activeTabId: 'birth',
        tabsLabel: 'Các tab của trang',
      }),
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Nhân sự' })).toBeTruthy();
    const list = screen.getByRole('tablist', { name: 'Các tab của trang' });
    const rendered = within(list).getAllByRole('tab');
    expect(rendered.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(rendered[1]?.getAttribute('tabindex')).toBe('0');
    expect(rendered[0]?.getAttribute('tabindex')).toBe('-1');
    expect(within(rendered[0] as HTMLElement).getByText('7').className).toContain('ga-tab__count');
  });

  it('mũi tên / Home / End chuyển focus giữa các tab (mẫu ARIA tabs)', () => {
    renderUi(h(PageHeader, { title: 'Nhân sự', tabs, activeTabId: 'roles', tabsLabel: 'Tab' }));
    const list = screen.getByRole('tablist');
    const [a, b, c] = within(list).getAllByRole('tab') as HTMLElement[];
    (a as HTMLElement).focus();
    fireEvent.keyDown(a as HTMLElement, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(b);
    fireEvent.keyDown(b as HTMLElement, { key: 'End' });
    expect(document.activeElement).toBe(c);
    fireEvent.keyDown(c as HTMLElement, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(a);
    fireEvent.keyDown(a as HTMLElement, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(c);
    fireEvent.keyDown(c as HTMLElement, { key: 'Home' });
    expect(document.activeElement).toBe(a);
  });

  it('PageActions đưa nút của màn vào khe bên phải tầng 1 (phụ trước, chính sau cùng)', () => {
    renderUi(
      h(
        AppShell,
        {
          sidebar: h('aside'),
          header: h('header'),
          pageHeader: h(PageHeader, { title: 'Tổng quan' }),
        },
        h(PageActions, {
          primary: h(Button, { variant: 'primary' }, 'Khai sinh Role'),
          secondary: [h(Button, { key: 'a' }, 'Audit log'), h(Button, { key: 'b' }, 'Bảng xếp hạng ₲')],
        }),
      ),
    );
    const slot = document.querySelector('.ga-page__actions') as HTMLElement;
    expect(
      within(slot)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Audit log', 'Bảng xếp hạng ₲', 'Khai sinh Role']);
  });
});

describe('AppShell', () => {
  it('có skip-link tới #ga-main; vùng chính focus được theo chương trình; sidebar | nội dung', () => {
    const { container } = renderUi(
      h(
        AppShell,
        {
          sidebar: h('aside', { 'data-testid': 'sb' }),
          header: h('header'),
          strip: h('p', null, 'dải'),
          drawer: h('footer'),
        },
        h('p', null, 'Nội dung'),
      ),
    );
    const skip = screen.getByRole('link', { name: 'Bỏ qua điều hướng, tới nội dung' });
    expect(skip.getAttribute('href')).toBe('#ga-main');
    const main = screen.getByRole('main');
    expect(main.id).toBe('ga-main');
    expect(main.getAttribute('tabindex')).toBe('-1');
    expect(container.querySelector('.ga-shell > .ga-shell__content')).not.toBeNull();
    expect(screen.getByText('dải')).toBeTruthy();
  });
});

describe('LogDrawer', () => {
  it('thu gọn mặc định: chỉ có thanh; mở ra mới dựng thân', () => {
    const onToggle = vi.fn();
    const { rerender } = renderUi(h(LogDrawer, { open: false, onToggle }, h('p', null, 'thân log')));
    expect(screen.queryByText('thân log')).toBeNull();
    const btn = screen.getByRole('button', { name: /Mở log/ });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledOnce();
    rerender(h(LogDrawer, { open: true, onToggle }, h('p', null, 'thân log')));
    expect(screen.getByText('thân log')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Đóng log/ }).getAttribute('aria-expanded')).toBe('true');
  });
});
