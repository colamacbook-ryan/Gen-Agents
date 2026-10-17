// @vitest-environment happy-dom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CommandPalette,
  ConfirmModal,
  Drawer,
  GLOBAL_SHORTCUTS,
  MAX_TOASTS,
  Modal,
  matchesBase,
  NotificationCenter,
  OverlayProvider,
  phraseMatches,
  ShortcutsDialog,
  useOverlays,
  useToast,
} from '../src/overlay/index.ts';
import { h, registerCleanup, renderUi } from './support/dom.ts';

registerCleanup();

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function Pusher(props: { onApi(api: ReturnType<typeof useToast>): void }) {
    props.onApi(useToast());
    return null;
  }
  const setup = (autoHideMs = 6000) => {
    let api!: ReturnType<typeof useToast>;
    const view = renderUi(h(Pusher, { onApi: (a) => (api = a) }), { toasts: true, autoHideMs });
    return { api: () => api, view };
  };

  it('tự ẩn sau thời gian cấu hình; toast ok là role=status', () => {
    const { api } = setup(6000);
    act(() => void api().push({ kind: 'ok', title: 'Đã lưu' }));
    expect(screen.getByRole('status').textContent).toContain('Đã lưu');
    act(() => void vi.advanceTimersByTime(5900));
    expect(screen.queryByText('Đã lưu')).not.toBeNull();
    act(() => void vi.advanceTimersByTime(200));
    expect(screen.queryByText('Đã lưu')).toBeNull();
  });

  it('lỗi KHÔNG tự ẩn và là role=alert; persist:true cũng không tự ẩn', () => {
    const { api } = setup(1000);
    act(() => {
      api().push({ kind: 'danger', title: 'Hỏng rồi' });
      api().push({ kind: 'info', title: 'Giữ lại', persist: true });
    });
    act(() => void vi.advanceTimersByTime(60_000));
    expect(screen.getByRole('alert').textContent).toContain('Hỏng rồi');
    expect(screen.queryByText('Giữ lại')).not.toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Đóng thông báo' })[0] as HTMLElement);
    expect(screen.queryByText('Hỏng rồi')).toBeNull();
  });

  it(`tối đa ${MAX_TOASTS} toast: toast thứ 4 đẩy toast cũ nhất ra`, () => {
    const { api } = setup();
    act(() => {
      for (const n of [1, 2, 3, 4]) api().push({ kind: 'info', title: `Tin ${n}` });
    });
    expect(screen.queryByText('Tin 1')).toBeNull();
    for (const n of [2, 3, 4]) expect(screen.queryByText(`Tin ${n}`)).not.toBeNull();
  });

  it('rê chuột vào thì dừng đếm giờ, rời ra thì đếm lại từ đầu', () => {
    const { api } = setup(1000);
    act(() => void api().push({ kind: 'ok', title: 'Rê chuột' }));
    const toast = screen.getByText('Rê chuột').closest('.ga-toast') as HTMLElement;
    fireEvent.mouseEnter(toast);
    act(() => void vi.advanceTimersByTime(5000));
    expect(screen.queryByText('Rê chuột')).not.toBeNull();
    fireEvent.mouseLeave(toast);
    act(() => void vi.advanceTimersByTime(1100));
    expect(screen.queryByText('Rê chuột')).toBeNull();
  });

  it('có hành động và ID mono (vd "Xem EV-8841")', () => {
    const { api } = setup();
    const onClick = vi.fn();
    act(
      () =>
        void api().push({
          kind: 'warn',
          title: 'Mai quay về CLI ưu tiên 1',
          detail: 'EN-0004 → EN-0003',
          ref: 'EV-8842',
          action: { label: 'Xem EV-8842', onClick },
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Xem EV-8842' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByText('EV-8842').className).toContain('ga-toast__ref');
  });

  it('useToast ngoài ToastProvider là lỗi rõ ràng', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderUi(h(Pusher, { onApi: () => {} }))).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});

describe('Modal', () => {
  function Harness(props: { blocking?: boolean; closeOnScrimClick?: boolean; onClose?(): void }) {
    const [open, setOpen] = useState(false);
    return h(
      'div',
      null,
      h('button', { type: 'button', onClick: () => setOpen(true) }, 'Mở'),
      h(
        Modal,
        {
          open,
          title: 'Tiêu đề',
          blocking: props.blocking,
          closeOnScrimClick: props.closeOnScrimClick,
          onClose: () => {
            props.onClose?.();
            setOpen(false);
          },
          footer: h('button', { type: 'button' }, 'Nút cuối'),
        },
        h('input', { 'aria-label': 'Ô nhập' }),
      ),
    );
  }

  it('mở: focus vào phần tử đầu tiên; Tab xoay vòng trong khung; Esc đóng và trả focus về nút mở', () => {
    renderUi(h(Harness));
    const opener = screen.getByRole('button', { name: 'Mở' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Tiêu đề' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const close = within(dialog).getByRole('button', { name: 'Đóng' });
    expect(document.activeElement).toBe(close);
    const last = within(dialog).getByRole('button', { name: 'Nút cuối' });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    expect(document.body.classList.contains('ga-scroll-lock')).toBe(true);
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.body.classList.contains('ga-scroll-lock')).toBe(false);
  });

  it('blocking (chế độ khắc phục): role=alertdialog, không nút đóng, không Esc, không bấm nền', () => {
    const onClose = vi.fn();
    renderUi(h(Modal, { open: true, blocking: true, title: 'Chặn', onClose }, 'Nội dung'));
    const dialog = screen.getByRole('alertdialog', { name: 'Chặn' });
    expect(within(dialog).queryByRole('button', { name: 'Đóng' })).toBeNull();
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    fireEvent.mouseDown(dialog.parentElement as Element);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('bấm nền chỉ đóng khi bật closeOnScrimClick; bấm trong khung thì không', () => {
    const onClose = vi.fn();
    const { unmount } = renderUi(h(Modal, { open: true, title: 'A', onClose }, 'x'));
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement as Element);
    expect(onClose).not.toHaveBeenCalled();
    unmount();
    renderUi(h(Modal, { open: true, title: 'B', onClose, closeOnScrimClick: true }, 'x'));
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement as Element);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('Drawer 400px là dialog có tiêu đề và nút đóng', () => {
    const onClose = vi.fn();
    renderUi(h(Drawer, { open: true, title: 'Ngăn', onClose }, 'Nội dung'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Ngăn' })).getByRole('button', { name: 'Đóng' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('ConfirmModal 2 bước', () => {
  const base = {
    title: 'Thu hồi thẻ của Mai?',
    consequences: ['Mai ngừng nhận việc mới ngay lập tức.', 'Vốn 1.000 ₲ vẫn giữ trong ví.'] as [string, string],
    confirmPhrase: 'Mai',
    confirmLabel: 'Thu hồi thẻ',
  };

  it('bước 1 liệt kê hệ quả; focus rơi vào nút an toàn (Huỷ), không phải nút nguy hiểm', () => {
    renderUi(h(ConfirmModal, { ...base, open: true, onConfirm: vi.fn(), onCancel: vi.fn() }));
    const dialog = screen.getByRole('dialog', { name: base.title });
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(2);
    expect(dialog.textContent).toContain('Bước 1/2');
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Huỷ' }));
    expect(within(dialog).queryByRole('textbox')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Thu hồi thẻ' })).toBeNull();
  });

  it('bước 2 yêu cầu gõ lại tên; nút chỉ bật khi khớp; xác nhận gọi onConfirm', async () => {
    const onConfirm = vi.fn();
    renderUi(h(ConfirmModal, { ...base, open: true, onConfirm, onCancel: vi.fn() }));
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(screen.getByRole('dialog').textContent).toContain('Bước 2/2');
    const input = screen.getByLabelText('Gõ “Mai” để xác nhận') as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    const confirm = screen.getByRole('button', { name: /Thu hồi thẻ/ });
    expect(confirm.hasAttribute('disabled')).toBe(true);
    fireEvent.change(input, { target: { value: 'mai' } }); // phân biệt hoa thường
    expect(confirm.hasAttribute('disabled')).toBe(true);
    fireEvent.change(input, { target: { value: 'Mai' } });
    expect(confirm.hasAttribute('disabled')).toBe(false);
    await act(async () => void fireEvent.click(confirm));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('⌘↵ / Ctrl ↵ xác nhận ở bước 2 nhưng chỉ khi chữ khớp', async () => {
    const onConfirm = vi.fn();
    renderUi(h(ConfirmModal, { ...base, open: true, onConfirm, onCancel: vi.fn() }));
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    const input = screen.getByLabelText('Gõ “Mai” để xác nhận');
    await act(async () => void fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true }));
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'Mai' } });
    await act(async () => void fireEvent.keyDown(input, { key: 'Enter', metaKey: true }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('Quay lại về bước 1; Esc và Huỷ gọi onCancel; mở lại luôn bắt đầu từ bước 1 với ô trống', () => {
    const onCancel = vi.fn();
    const { rerender } = renderUi(h(ConfirmModal, { ...base, open: true, onConfirm: vi.fn(), onCancel }));
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    fireEvent.change(screen.getByLabelText('Gõ “Mai” để xác nhận'), { target: { value: 'Ma' } });
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
    expect(screen.getByRole('dialog').textContent).toContain('Bước 1/2');
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
    rerender(h(ConfirmModal, { ...base, open: false, onConfirm: vi.fn(), onCancel }));
    rerender(h(ConfirmModal, { ...base, open: true, onConfirm: vi.fn(), onCancel }));
    expect(screen.getByRole('dialog').textContent).toContain('Bước 1/2');
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect((screen.getByLabelText('Gõ “Mai” để xác nhận') as HTMLInputElement).value).toBe('');
  });

  it('onConfirm ném lỗi: giữ bước 2, báo câu chung, chuyển lỗi thật cho onError (không nuốt lỗi)', async () => {
    const boom = new Error('db.ledger_rule');
    const onError = vi.fn();
    renderUi(
      h(ConfirmModal, { ...base, open: true, onConfirm: () => Promise.reject(boom), onCancel: vi.fn(), onError }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    fireEvent.change(screen.getByLabelText('Gõ “Mai” để xác nhận'), { target: { value: 'Mai' } });
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: /Thu hồi thẻ/ })));
    expect(onError).toHaveBeenCalledWith(boom);
    expect(screen.getByRole('alert').textContent).toContain('Không thực hiện được');
    expect(screen.getByRole('dialog').textContent).toContain('Bước 2/2');
    expect(screen.getByRole('alert').textContent).not.toContain('ledger'); // không lộ mã lỗi thô
  });

  it('phraseMatches: NFKC (gõ tiếng Việt tổ hợp / dựng sẵn đều khớp), bỏ khoảng trắng hai đầu, phân biệt hoa thường, không khớp chuỗi rỗng', () => {
    expect(phraseMatches('Tùng', 'Tùng')).toBe(true);
    expect(phraseMatches('Tùng', 'Tùng')).toBe(true);
    expect(phraseMatches('  Mai  ', 'Mai')).toBe(true);
    expect(phraseMatches('mai', 'Mai')).toBe(false);
    expect(phraseMatches('', '')).toBe(false);
    expect(phraseMatches('Mai Lan', 'Mai')).toBe(false);
    // chuỗi cực dài vượt trần ⇒ không khớp (fail-closed), không treo
    expect(phraseMatches('a'.repeat(100_000), 'a')).toBe(false);
  });
});

describe('CommandPalette (O1)', () => {
  const items = [
    { id: 'r1', label: 'Tùng · đang chạy', hint: 'RL-0003', group: 'Role', run: vi.fn() },
    { id: 'r2', label: 'Mai · đang chạy', hint: 'RL-0001', group: 'Role', run: vi.fn() },
    { id: 'a1', label: 'Khai sinh Role mới', group: 'Hành động', run: vi.fn() },
    { id: 'a2', label: 'Trừ ₲…', group: 'Hành động', danger: true, run: vi.fn() },
  ];

  it('gom theo nhóm; gõ lọc không phân biệt dấu ("tung" ra Tùng); không khớp thì báo trống', () => {
    renderUi(h(CommandPalette, { open: true, onClose: vi.fn(), items }));
    const list = screen.getByRole('listbox', { name: 'Kết quả' });
    expect(
      within(list)
        .getAllByRole('group')
        .map((g) => g.getAttribute('aria-label')),
    ).toEqual(['Role', 'Hành động']);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'tung' } });
    expect(within(list).getAllByRole('option')).toHaveLength(1);
    expect(within(list).getByRole('option').textContent).toContain('Tùng');
    fireEvent.change(input, { target: { value: 'rl-0001' } }); // khớp ID
    expect(within(list).getByRole('option').textContent).toContain('Mai');
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.getByRole('status').textContent).toContain('Không có kết quả');
  });

  it('↑↓ chọn, ↵ chạy rồi đóng; Esc đóng; focus ở ô tìm', () => {
    const onClose = vi.fn();
    const run = vi.fn();
    renderUi(h(CommandPalette, { open: true, onClose, items: items.map((i) => ({ ...i, run })) }));
    const input = screen.getByRole('combobox');
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute('aria-activedescendant')).toContain('r1');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toContain('a1');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'ArrowUp' }); // quay vòng về cuối
    expect(input.getAttribute('aria-activedescendant')).toContain('a2');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(run).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('hành động nguy hiểm có nhãn cảnh báo cho trình đọc màn hình', () => {
    renderUi(h(CommandPalette, { open: true, onClose: vi.fn(), items }));
    const danger = screen.getByRole('option', { name: /Trừ ₲/ });
    expect(danger.textContent).toContain('sẽ hỏi xác nhận');
  });
});

describe('matchesBase', () => {
  it('bỏ qua hoa thường và dấu; rỗng luôn khớp; kim dài hơn rơm thì không', () => {
    expect(matchesBase('Khai sinh Role', 'KHAI')).toBe(true);
    expect(matchesBase('Đào tạo', 'dao tao')).toBe(true);
    expect(matchesBase('Đào tạo', 'đào')).toBe(true);
    expect(matchesBase('abc', '')).toBe(true);
    expect(matchesBase('ab', 'abc')).toBe(false);
    expect(matchesBase('abc', 'xyz')).toBe(false);
  });
});

describe('NotificationCenter (O2)', () => {
  const now = new Date('2026-10-14T07:06:00Z'); // 14:06 giờ Việt Nam
  const tz = 'Asia/Ho_Chi_Minh';
  const items = [
    {
      id: 'NT-0003',
      kind: 'wound' as const,
      title: 'Lan vào nghỉ dưỡng thương',
      at: new Date('2026-10-14T05:38:00Z'),
      read: false,
    },
    {
      id: 'NT-0002',
      kind: 'quota' as const,
      title: 'Quota thấp',
      body: 'Còn dưới 20%',
      at: new Date('2026-10-14T03:00:00Z'),
      read: true,
    },
    {
      id: 'NT-0001',
      kind: 'update' as const,
      title: 'Có bản cập nhật',
      at: new Date('2026-10-13T02:00:00Z'),
      read: false,
    },
  ];

  it('gom Hôm nay / Trước đó theo ngày lịch của múi giờ workspace; đếm chưa đọc', () => {
    renderUi(h(NotificationCenter, { open: true, onClose: vi.fn(), items, now, timeZone: tz }));
    const today = screen.getByRole('region', { name: 'Hôm nay' });
    const earlier = screen.getByRole('region', { name: 'Trước đó' });
    expect(within(today).getAllByRole('listitem')).toHaveLength(2);
    expect(within(earlier).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('2 chưa đọc')).toBeTruthy();
    // mới nhất trước
    expect(within(today).getAllByRole('listitem')[0]?.textContent).toContain('Lan vào nghỉ dưỡng thương');
  });

  it('cùng thời điểm, múi giờ khác ⇒ ngày lịch khác (không hardcode múi giờ)', () => {
    // 23:30 UTC ngày 13 = 06:30 ngày 14 ở Việt Nam, nhưng vẫn là ngày 13 ở UTC
    const edge = [
      { id: 'NT-9', kind: 'update' as const, title: 'Sát nửa đêm', at: new Date('2026-10-13T23:30:00Z'), read: true },
    ];
    const { unmount } = renderUi(
      h(NotificationCenter, { open: true, onClose: vi.fn(), items: edge, now, timeZone: tz }),
    );
    expect(screen.queryByRole('region', { name: 'Hôm nay' })).not.toBeNull();
    unmount();
    renderUi(h(NotificationCenter, { open: true, onClose: vi.fn(), items: edge, now, timeZone: 'UTC' }));
    expect(screen.queryByRole('region', { name: 'Hôm nay' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Trước đó' })).not.toBeNull();
  });

  it('trống: empty state; đánh dấu đã đọc hết chỉ bật khi còn chưa đọc', () => {
    const onMarkAllRead = vi.fn();
    const { unmount } = renderUi(h(NotificationCenter, { open: true, onClose: vi.fn(), items: [], now }));
    expect(screen.getByRole('heading', { name: 'Chưa có thông báo nào.' })).toBeTruthy();
    unmount();
    renderUi(h(NotificationCenter, { open: true, onClose: vi.fn(), items, now, timeZone: tz, onMarkAllRead }));
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu đã đọc hết' }));
    expect(onMarkAllRead).toHaveBeenCalledOnce();
  });
});

describe('ShortcutsDialog (O3)', () => {
  it('lưới 3 nhóm, tìm theo mô tả hoặc phím; không khớp thì báo trống', () => {
    renderUi(h(ShortcutsDialog, { open: true, onClose: vi.fn() }));
    const dialog = screen.getByRole('dialog', { name: 'Phím tắt' });
    expect(within(dialog).getAllByRole('heading', { level: 3 })).toHaveLength(GLOBAL_SHORTCUTS.length);
    const search = within(dialog).getByRole('searchbox', { name: 'Tìm phím tắt' });
    expect(document.activeElement).toBe(search);
    fireEvent.change(search, { target: { value: 'brain' } });
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(1);
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(within(dialog).getByRole('status').textContent).toContain('Không có phím tắt');
  });

  it('bảng có đủ các phím của FRONTEND-SPEC §2.4', () => {
    const keys = GLOBAL_SHORTCUTS.flatMap((g) => g.items.map((i) => i.keys));
    for (const k of [
      'mod+k',
      'g d',
      'g p',
      '/',
      'j',
      'k',
      'enter',
      'escape',
      '[',
      ']',
      'mod+s',
      'mod+enter',
      'alt+p',
      'mod+j',
      'mod+.',
      '?',
      'n',
      '@',
    ]) {
      expect(keys, k).toContain(k);
    }
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('OverlayProvider', () => {
  function Probe() {
    const o = useOverlays();
    return h(
      'div',
      null,
      h('span', { 'data-testid': 'cur' }, o.current ?? 'none'),
      h('button', { type: 'button', onClick: () => o.open('palette') }, 'p'),
      h('button', { type: 'button', onClick: () => o.toggle('shortcuts') }, 's'),
      h('button', { type: 'button', onClick: () => o.close() }, 'c'),
    );
  }

  it('một overlay mở tại một thời điểm: mở cái mới thay cái cũ; toggle bật / tắt', () => {
    renderUi(h(OverlayProvider, null, h(Probe)));
    const cur = () => screen.getByTestId('cur').textContent;
    expect(cur()).toBe('none');
    fireEvent.click(screen.getByRole('button', { name: 'p' }));
    expect(cur()).toBe('palette');
    fireEvent.click(screen.getByRole('button', { name: 's' }));
    expect(cur()).toBe('shortcuts');
    fireEvent.click(screen.getByRole('button', { name: 's' }));
    expect(cur()).toBe('none');
    fireEvent.click(screen.getByRole('button', { name: 'c' }));
    expect(cur()).toBe('none');
  });

  it('useOverlays ngoài provider là lỗi rõ ràng', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderUi(h(Probe))).toThrow(/OverlayProvider/);
    spy.mockRestore();
  });
});
