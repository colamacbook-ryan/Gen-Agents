// @vitest-environment happy-dom
import { fireEvent, screen } from '@testing-library/react';
import { Check } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import {
  Button,
  CHIP_STATES,
  EmptyState,
  FileDropzone,
  IconButton,
  InsecureTransportBanner,
  isInsecureTransport,
  KpiStrip,
  KpiTile,
  monogramOf,
  RoleAvatar,
  Skeleton,
  SkeletonGrid,
  SkeletonLines,
  StatusChip,
  Stepper,
  sparkPoints,
  TextField,
  WarningBanner,
} from '../src/primitives/index.ts';
import { h, registerCleanup, renderUi } from './support/dom.ts';

registerCleanup();

describe('StatusChip', () => {
  it('mọi trạng thái nghiệp vụ có chữ tiếng Việt + (icon hoặc chấm), không chỉ màu', () => {
    for (const state of Object.keys(CHIP_STATES) as (keyof typeof CHIP_STATES)[]) {
      const { container, unmount } = renderUi(h(StatusChip, { state }));
      const chip = container.querySelector('.ga-chip') as HTMLElement;
      expect(chip.textContent?.trim().length, state).toBeGreaterThan(1);
      expect(chip.querySelector('svg, .ga-chip__dot'), state).not.toBeNull();
      unmount();
    }
  });

  it('Nghỉ dưỡng thương KHÔNG dùng tông danger (trạng thái con người, không phải sự cố)', () => {
    renderUi(h(StatusChip, { state: 'wounded' }));
    const chip = screen.getByText('Nghỉ dưỡng thương').closest('.ga-chip') as HTMLElement;
    expect(chip.className).toContain('ga-chip--wound');
    expect(chip.className).not.toContain('danger');
  });

  it('đang chạy có chấm thở; tông tuỳ ý nhận chữ + icon', () => {
    const { container } = renderUi(
      h('div', null, h(StatusChip, { state: 'running' }), h(StatusChip, { tone: 'warn', icon: Check }, 'Tuỳ ý')),
    );
    expect(container.querySelector('.ga-chip__dot--breath')).not.toBeNull();
    expect(screen.getByText('Tuỳ ý').closest('.ga-chip')?.className).toContain('ga-chip--warn');
  });
});

describe('KpiTile', () => {
  it('hiện nhãn, giá trị mono, đơn vị, nguồn bảng, dòng phụ', () => {
    renderUi(
      h(
        KpiStrip,
        { label: 'Chỉ số chính' },
        h(KpiTile, {
          label: 'Role đang chạy',
          value: '3',
          unit: '/ 7',
          source: 'v_roles',
          note: '+1 so với hôm qua',
          noteTone: 'ok',
        }),
      ),
    );
    expect(screen.getByRole('region', { name: 'Chỉ số chính' })).toBeTruthy();
    expect(screen.getByText('3').className).toContain('ga-kpi__value');
    expect(screen.getByText('v_roles')).toBeTruthy();
    expect(screen.getByText('+1 so với hôm qua').className).toContain('ga-kpi__note--ok');
  });

  it('sparkline có nhãn đọc được; sparkPoints chuẩn hoá vào khung', () => {
    renderUi(h(KpiTile, { label: 'x', value: '1', spark: [1, 4, 2, 8], sparkLabel: 'xu hướng 4 điểm' }));
    expect(screen.getByRole('img', { name: 'xu hướng 4 điểm' })).toBeTruthy();
    const { points, lastY } = sparkPoints([0, 10]);
    expect(points).toBe('2.0,18.0 54.0,2.0');
    expect(lastY).toBe(2);
    expect(sparkPoints([]).points).toBe('');
    // dãy phẳng không chia cho 0
    expect(sparkPoints([5, 5, 5]).points).not.toContain('NaN');
  });
});

describe('Stepper', () => {
  it('trạng thái luôn có chữ; bước đang chạy là aria-current=step', () => {
    renderUi(
      h(Stepper, {
        label: 'Các bước cập nhật',
        steps: [
          { id: 'a', label: 'Tải bản mới', status: 'done' },
          { id: 'b', label: 'Chạy migration', status: 'running' },
          { id: 'c', label: 'Khởi động lại', status: 'pending' },
          { id: 'd', label: 'Chạy lại bản cũ', status: 'branch' },
          { id: 'e', label: 'Kiểm sức khoẻ', status: 'error' },
        ],
      }),
    );
    const list = screen.getByRole('list', { name: 'Các bước cập nhật' });
    const items = list.querySelectorAll('li');
    expect(items).toHaveLength(5);
    expect(items[1]?.getAttribute('aria-current')).toBe('step');
    expect(items[0]?.textContent).toContain('Xong');
    expect(items[2]?.textContent).toContain('Chờ');
    expect(items[3]?.textContent).toContain('Rẽ nhánh');
    expect(items[4]?.textContent).toContain('Lỗi');
  });

  it('hướng dọc / ngang theo lớp', () => {
    const { container } = renderUi(
      h(Stepper, { label: 'x', orientation: 'vertical', steps: [{ id: 'a', label: 'A', status: 'pending' }] }),
    );
    expect(container.querySelector('.ga-stepper--v')).not.toBeNull();
  });
});

describe('WarningBanner', () => {
  it('danger là role=alert, warn/info là status', () => {
    renderUi(
      h(
        'div',
        null,
        h(WarningBanner, { tone: 'danger', title: 'Hỏng' }),
        h(WarningBanner, { tone: 'warn', title: 'Cẩn thận' }),
      ),
    );
    expect(screen.getByRole('alert').textContent).toContain('Hỏng');
    expect(screen.getByRole('status').textContent).toContain('Cẩn thận');
  });

  it('đóng được khi có onDismiss; blocking thì KHÔNG có nút đóng', () => {
    const onDismiss = vi.fn();
    const { rerender } = renderUi(h(WarningBanner, { tone: 'info', onDismiss }, 'Nội dung'));
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ thông báo' }));
    expect(onDismiss).toHaveBeenCalledOnce();
    rerender(h(WarningBanner, { tone: 'info', onDismiss, blocking: true }, 'Nội dung'));
    expect(screen.queryByRole('button', { name: 'Bỏ thông báo' })).toBeNull();
  });

  it('điều khoản: checkbox bắt buộc có nhãn, báo thay đổi', () => {
    const onChange = vi.fn();
    renderUi(
      h(
        WarningBanner,
        { tone: 'warn', blocking: true, ack: { label: 'Tôi hiểu và tự chịu trách nhiệm', checked: false, onChange } },
        'Điều khoản',
      ),
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tôi hiểu và tự chịu trách nhiệm' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('dải HTTP: chỉ hiện khi http và không phải loopback', () => {
    expect(isInsecureTransport({ protocol: 'http:', hostname: '192.168.1.10' })).toBe(true);
    expect(isInsecureTransport({ protocol: 'http:', hostname: 'ga.example.com' })).toBe(true);
    expect(isInsecureTransport({ protocol: 'https:', hostname: 'ga.example.com' })).toBe(false);
    for (const hostname of ['localhost', '127.0.0.1', '127.1.2.3', '[::1]', '::1', 'app.localhost']) {
      expect(isInsecureTransport({ protocol: 'http:', hostname }), hostname).toBe(false);
    }
    // ca âm: tên miền trông giống loopback nhưng không phải
    expect(isInsecureTransport({ protocol: 'http:', hostname: '127.0.0.1.evil.com' })).toBe(true);
    expect(isInsecureTransport({ protocol: 'http:', hostname: 'localhost.evil.com' })).toBe(true);

    const { container, rerender } = renderUi(
      h(InsecureTransportBanner, { location: { protocol: 'https:', hostname: 'x.com' } }),
    );
    expect(container.querySelector('.ga-banner')).toBeNull();
    rerender(h(InsecureTransportBanner, { location: { protocol: 'http:', hostname: 'x.com' } }));
    const banner = container.querySelector('.ga-banner--warn') as HTMLElement;
    expect(banner.textContent).toContain('HTTP');
    expect(banner.querySelector('button')).toBeNull(); // không đóng được
  });
});

describe('EmptyState', () => {
  it('minh hoạ trang trí + 1 câu + 1 câu giải thích + 1 CTA; mọi minh hoạ có đúng 1 điểm ember', () => {
    for (const illustration of ['desk', 'cabinet', 'shelf', 'socket', 'ledger', 'tree', 'star'] as const) {
      const { container, unmount } = renderUi(
        h(EmptyState, {
          illustration,
          title: 'Trống',
          description: 'Giải thích',
          action: h(Button, null, 'Làm gì đó'),
        }),
      );
      expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
      expect(container.querySelectorAll('.ga-empty__dot'), illustration).toHaveLength(1);
      expect(screen.getByRole('heading', { name: 'Trống' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Làm gì đó' })).toBeTruthy();
      unmount();
    }
  });
});

describe('Skeleton', () => {
  it('lưới chờ đúng hình DataGrid: cột ID + N cột dữ liệu × số hàng, có chữ cho trình đọc màn hình', () => {
    const { container } = renderUi(h(SkeletonGrid, { rows: 5, columns: 3 }));
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(status.textContent).toContain('Đang tải');
    const rows = container.querySelectorAll('.ga-skel-grid__row');
    expect(rows).toHaveLength(5);
    expect(rows[0]?.querySelectorAll('.ga-skel')).toHaveLength(4);
  });

  it('đoạn văn và khối đơn lẻ', () => {
    const { container } = renderUi(h('div', null, h(SkeletonLines, { lines: 4 }), h(Skeleton, { variant: 'circle' })));
    expect(container.querySelectorAll('.ga-skel-lines .ga-skel')).toHaveLength(4);
    expect(container.querySelector('.ga-skel--circle')).not.toBeNull();
  });
});

describe('FileDropzone', () => {
  const file = (name: string, size: number): File => {
    const f = new File(['x'], name);
    Object.defineProperty(f, 'size', { value: size });
    return f;
  };
  const dropData = (files: File[]) => ({ dataTransfer: { types: ['Files'], files } });

  it('kéo tệp vào: hiện lớp phủ có tên đích; thả: gọi onFiles và tắt lớp phủ', () => {
    const onFiles = vi.fn();
    const { container } = renderUi(
      h(FileDropzone, { targetLabel: 'Kho tri thức của Mai', onFiles }, h('p', null, 'Nội dung')),
    );
    const zone = container.querySelector('.ga-drop') as HTMLElement;
    fireEvent.dragEnter(zone, dropData([]));
    expect(screen.getByText('Thả tệp vào: Kho tri thức của Mai')).toBeTruthy();
    const f = file('bang-gia.pdf', 100);
    fireEvent.drop(zone, dropData([f]));
    expect(onFiles).toHaveBeenCalledWith([f]);
    expect(container.querySelector('.ga-drop__overlay')).toBeNull();
  });

  it('kéo thứ không phải tệp (văn bản) thì bỏ qua', () => {
    const { container } = renderUi(h(FileDropzone, { targetLabel: 'Đính kèm', onFiles: vi.fn() }, h('p', null, 'x')));
    fireEvent.dragEnter(container.querySelector('.ga-drop') as HTMLElement, {
      dataTransfer: { types: ['text/plain'], files: [] },
    });
    expect(container.querySelector('.ga-drop__overlay')).toBeNull();
  });

  it('tệp vượt trần bị từ chối, nói rõ trần (số lấy từ cài đặt, không hardcode)', () => {
    const onFiles = vi.fn();
    const { container } = renderUi(
      h(FileDropzone, { targetLabel: 'Đính kèm', onFiles, maxBytes: 25 * 1024 * 1024 }, h('p', null, 'x')),
    );
    fireEvent.drop(container.querySelector('.ga-drop') as HTMLElement, dropData([file('lon.bin', 26 * 1024 * 1024)]));
    expect(onFiles).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('Tệp lớn hơn 25 MB');
    // tệp hợp lệ xoá lỗi
    fireEvent.drop(container.querySelector('.ga-drop') as HTMLElement, dropData([file('nho.bin', 1024)]));
    expect(onFiles).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('đường bàn phím: nút Chọn tệp; disabled thì không nhận thả', () => {
    const onFiles = vi.fn();
    const { container } = renderUi(
      h(FileDropzone, { targetLabel: 'Đính kèm', onFiles, disabled: true }, h('p', null, 'x')),
    );
    expect(screen.getByRole('button', { name: 'Chọn tệp' }).hasAttribute('disabled')).toBe(true);
    fireEvent.drop(container.querySelector('.ga-drop') as HTMLElement, dropData([file('a', 1)]));
    expect(onFiles).not.toHaveBeenCalled();
  });
});

describe('RoleAvatar', () => {
  it('monogram theo grapheme, giữ dấu tiếng Việt', () => {
    expect(monogramOf('Mai')).toBe('M');
    expect(monogramOf('  tùng')).toBe('T');
    expect(monogramOf('Ánh')).toBe('Á');
    expect(monogramOf('')).toBe('?');
  });

  it('Trọng thương: lớp wounded + giọt lệ, không chấm trạng thái; trang trí trừ khi có label', () => {
    const { container } = renderUi(
      h(
        'div',
        null,
        h(RoleAvatar, { name: 'Lan', color: 'coral', wounded: true, live: 'running' }),
        h(RoleAvatar, { name: 'Mai', color: 'teal', live: 'running', label: 'Mai' }),
      ),
    );
    const [lan, mai] = Array.from(container.querySelectorAll('.ga-avatar'));
    expect(lan?.className).toContain('ga-avatar--wounded');
    expect(lan?.className).toContain('ga-entity-coral');
    expect(lan?.querySelector('.ga-avatar__tear')).not.toBeNull();
    expect(lan?.querySelector('.ga-avatar__status')).toBeNull();
    expect(lan?.getAttribute('aria-hidden')).toBe('true');
    expect(mai?.getAttribute('role')).toBe('img');
    expect(mai?.querySelector('.ga-avatar__status--running')).not.toBeNull();
  });
});

describe('Button / IconButton / TextField', () => {
  it('nút mặc định type=button; busy khoá nút và đặt aria-busy', () => {
    renderUi(h(Button, { busy: true, variant: 'primary' }, 'Lưu'));
    const b = screen.getByRole('button', { name: 'Lưu' });
    expect(b.getAttribute('type')).toBe('button');
    expect(b.hasAttribute('disabled')).toBe(true);
    expect(b.getAttribute('aria-busy')).toBe('true');
  });

  it('IconButton luôn có nhãn truy cập', () => {
    renderUi(h(IconButton, { icon: Check, label: 'Xác nhận' }));
    expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeTruthy();
  });

  it('TextField: label thật, lỗi inline gắn aria-describedby và aria-invalid', () => {
    renderUi(h(TextField, { label: 'Tên đăng nhập', hint: 'Gợi ý', error: 'Bắt buộc' }));
    const input = screen.getByLabelText('Tên đăng nhập');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const described = (input.getAttribute('aria-describedby') ?? '').split(' ');
    expect(described).toHaveLength(2);
    expect(described.map((id) => document.getElementById(id)?.textContent)).toEqual(['Bắt buộc', 'Gợi ý']);
  });
});
