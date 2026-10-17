// @vitest-environment happy-dom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  BirthCertificate,
  type ChangeSetItem,
  ChangeSetTray,
  DiffViewer,
  diffLines,
  diffSeq,
  diffStats,
  diffWords,
  EmployeeCard,
  hhmm,
  isQuiet,
  type LogLine,
  LogStream,
  MASK,
  MAX_DIFF_CELLS,
  maskSecrets,
  mergeOps,
  ProvenanceLegend,
  ProvenanceMark,
  parseHhmm,
  QuietHoursTimeline,
  quietLength,
  snap,
  type VersionedRevision,
  VersionHistory,
  VersionTimeline,
} from '../src/shared/index.ts';
import { h, registerCleanup, renderUi } from './support/dom.ts';

registerCleanup();

describe('diff (LCS)', () => {
  const apply = (ops: { kind: string; text: string }[], side: 'a' | 'b'): string[] =>
    ops.filter((o) => o.kind === 'equal' || o.kind === (side === 'a' ? 'del' : 'add')).map((o) => o.text);

  it('tái dựng được cả hai phía từ ops (bất biến cơ bản của diff)', () => {
    const cases: [string[], string[]][] = [
      [[], []],
      [['a'], []],
      [[], ['a']],
      [
        ['a', 'b', 'c'],
        ['a', 'b', 'c'],
      ],
      [
        ['a', 'b', 'c'],
        ['a', 'x', 'c'],
      ],
      [
        ['a', 'b', 'c', 'd'],
        ['b', 'd', 'e'],
      ],
      [
        ['x', 'a', 'a', 'a'],
        ['a', 'a', 'x'],
      ],
    ];
    for (const [a, b] of cases) {
      const { ops, coarse } = diffSeq(a, b);
      expect(coarse).toBe(false);
      expect(apply(ops, 'a')).toEqual(a);
      expect(apply(ops, 'b')).toEqual(b);
    }
  });

  it('ngẫu nhiên (hạt cố định): luôn tái dựng đúng, và không dài hơn dãy không dùng LCS', () => {
    let seed = 12345;
    const rnd = (n: number): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let round = 0; round < 60; round++) {
      const a = Array.from({ length: rnd(25) }, () => String(rnd(5)));
      const b = Array.from({ length: rnd(25) }, () => String(rnd(5)));
      const { ops } = diffSeq(a, b);
      expect(apply(ops, 'a')).toEqual(a);
      expect(apply(ops, 'b')).toEqual(b);
      expect(ops.length).toBeLessThanOrEqual(a.length + b.length);
    }
  });

  it('diff dòng: chỉ đánh dấu dòng đổi; thống kê +/−', () => {
    const before = 'name: Mai\nrole: support\ntone: warm';
    const after = 'name: Mai\nrole: sales\ntone: warm\nlang: vi';
    const { ops } = diffLines(before, after);
    expect(ops.filter((o) => o.kind === 'equal').map((o) => o.text)).toEqual(['name: Mai', 'tone: warm']);
    expect(diffStats(ops)).toEqual({ added: 2, removed: 1 });
  });

  it('diff từ: giữ nguyên khoảng trắng để ghép lại đúng văn bản', () => {
    const { ops } = diffWords('Xin chào, tôi là Mai.', 'Xin chào, tôi là Lan.');
    expect(apply(ops, 'a').join('')).toBe('Xin chào, tôi là Mai.');
    expect(apply(ops, 'b').join('')).toBe('Xin chào, tôi là Lan.');
    expect(diffStats(ops).added).toBe(1);
  });

  it('quá lớn thì rơi về diff thô, không dựng bảng khổng lồ, và báo coarse', () => {
    const big = Array.from({ length: Math.ceil(Math.sqrt(MAX_DIFF_CELLS)) + 10 }, (_, i) => `a${i}`);
    const other = big.map((x) => `${x}x`);
    const t0 = performance.now();
    const { ops, coarse } = diffSeq(big, other);
    expect(coarse).toBe(true);
    expect(ops).toHaveLength(big.length * 2);
    expect(performance.now() - t0).toBeLessThan(2000);
  });

  it('mergeOps gộp đoạn cùng loại', () => {
    expect(
      mergeOps([
        { kind: 'add', text: 'a' },
        { kind: 'add', text: 'b' },
        { kind: 'equal', text: 'c' },
      ]),
    ).toEqual([
      { kind: 'add', text: 'ab' },
      { kind: 'equal', text: 'c' },
    ]);
  });
});

describe('DiffViewer', () => {
  it('Dạng đọc: chèn bằng <ins>, bỏ bằng <del>, kèm chữ cho trình đọc màn hình', () => {
    const { container } = renderUi(
      h(DiffViewer, { before: 'Giá 100 ₲', after: 'Giá 200 ₲', mode: 'read', onModeChange: vi.fn() }),
    );
    expect(container.querySelector('ins')?.textContent).toContain('200');
    expect(container.querySelector('del')?.textContent).toContain('100');
    expect(container.querySelector('ins .ga-sr-only')?.textContent).toBe('Thêm: ');
    expect(container.querySelector('del .ga-sr-only')?.textContent).toBe('Bỏ: ');
  });

  it('YAML: theo dòng, có dấu +/−; đổi kiểu hiển thị gọi onModeChange', () => {
    const onModeChange = vi.fn();
    const { container } = renderUi(
      h(DiffViewer, { before: 'a: 1\nb: 2', after: 'a: 1\nb: 3', mode: 'yaml', onModeChange }),
    );
    expect(container.querySelector('.ga-diff__line--add')?.textContent).toContain('b: 3');
    expect(container.querySelector('.ga-diff__line--del')?.textContent).toContain('b: 2');
    expect(Array.from(container.querySelectorAll('.ga-diff__gutter')).map((g) => g.textContent)).toEqual([
      ' ',
      '−',
      '+',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Dạng đọc' }));
    expect(onModeChange).toHaveBeenCalledWith('read');
  });
});

describe('VersionTimeline / VersionHistory', () => {
  const revs: VersionedRevision[] = [
    {
      id: 'r3',
      version: 'v2.0',
      at: new Date('2026-10-14T02:31:00Z'),
      by: 'Owner',
      note: 'Sửa lõi',
      core: true,
      current: true,
      content: 'Xưng hô: em\nGiọng: ấm',
    },
    {
      id: 'r2',
      version: 'v1.1',
      at: new Date('2026-10-02T02:00:00Z'),
      by: 'Phỏng vấn viên',
      content: 'Xưng hô: tôi\nGiọng: ấm',
    },
    { id: 'r1', version: 'v1.0', at: new Date('2026-09-30T02:48:00Z'), by: 'Owner', content: 'Xưng hô: tôi' },
  ];

  it('hiện version, người, ghi chú, badge LÕI, bản hiệu lực; tick tối đa 2 bản (chọn bản thứ ba bỏ bản chọn cũ nhất)', () => {
    const onChange = vi.fn();
    renderUi(
      h(VersionTimeline, { revisions: revs, selected: ['r1', 'r2'], onSelectedChange: onChange, label: 'Lịch sử' }),
    );
    const list = screen.getByRole('list', { name: 'Lịch sử' });
    expect(within(list).getByText('LÕI')).toBeTruthy();
    expect(within(list).getByText('đang hiệu lực')).toBeTruthy();
    expect(within(list).getByText('Sửa lõi')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Chọn v2.0 để so sánh' }));
    expect(onChange).toHaveBeenCalledWith(['r2', 'r3']);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Chọn v1.1 để so sánh' }));
    expect(onChange).toHaveBeenLastCalledWith(['r1']);
  });

  it('VersionHistory: tick 2 bản → diff theo thứ tự cũ → mới; khôi phục là hành động gọi onRestore (tạo revision mới ở app)', () => {
    const onRestore = vi.fn();
    const { container } = renderUi(h(VersionHistory, { revisions: revs, label: 'Lịch sử', onRestore }));
    expect(screen.getByText('Chọn hai phiên bản để so sánh.')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Chọn v2.0 để so sánh' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Chọn v1.1 để so sánh' }));
    expect(screen.getByText('v1.1 → v2.0')).toBeTruthy();
    expect(container.querySelector('ins')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Khôi phục v1.1' }));
    expect(onRestore).toHaveBeenCalledWith('r2');
    expect(screen.getByText('Khôi phục tạo phiên bản mới, không ghi đè lịch sử.')).toBeTruthy();
  });
});

describe('ProvenanceMark', () => {
  it('3 nguồn đều có nhãn chữ; AI suy ra có nút Xác nhận / Sửa', () => {
    const onConfirm = vi.fn();
    const onEdit = vi.fn();
    const { container } = renderUi(
      h(
        'div',
        null,
        h(ProvenanceMark, { source: 'owner' }, 'Mai'),
        h(ProvenanceMark, { source: 'ai', onConfirm, onEdit }, 'ấm áp'),
        h(ProvenanceMark, { source: 'system' }, 'DN-0026'),
      ),
    );
    expect(container.querySelector('.ga-prov--owner .ga-sr-only')?.textContent).toBe('Owner nhập');
    expect(container.querySelector('.ga-prov--ai .ga-prov__tag')?.textContent).toBe('AI suy ra');
    expect(container.querySelector('.ga-prov--system .ga-prov__tag')?.textContent).toBe('Hệ thống');
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('nguồn không phải AI thì không có nút; chú giải liệt kê đủ ba nguồn', () => {
    renderUi(h('div', null, h(ProvenanceMark, { source: 'system', onConfirm: vi.fn() }, 'x'), h(ProvenanceLegend)));
    expect(screen.queryByRole('button', { name: 'Xác nhận' })).toBeNull();
    expect(within(screen.getByRole('list', { name: 'Nguồn của giá trị' })).getAllByRole('listitem')).toHaveLength(3);
  });
});

describe('ChangeSetTray', () => {
  const items: ChangeSetItem[] = [
    { id: 'CS-0012', target: 'IN-0003 · D', reason: 'Trainer đề xuất nới nội quy', tokenDelta: 120 },
    { id: 'CS-0013', target: 'SK-0004 · E', reason: 'Rút gọn bước 3', tokenDelta: -30 },
  ];

  it('không có đề xuất thì không hiện gì', () => {
    const { container } = renderUi(
      h(ChangeSetTray, { items: [], onApply: vi.fn(), onReject: vi.fn(), onApplyAll: vi.fn() }),
    );
    expect(container.querySelector('.ga-cs')).toBeNull();
  });

  it('liệt kê đích, lý do, token_delta có dấu; Áp dụng / Bỏ từng mục; tổng', () => {
    const onApply = vi.fn();
    const onReject = vi.fn();
    renderUi(h(ChangeSetTray, { items, onApply, onReject, onApplyAll: vi.fn() }));
    expect(screen.getByRole('region', { name: '2 đề xuất chờ duyệt' })).toBeTruthy();
    expect(screen.getByText('+120')).toBeTruthy();
    expect(screen.getByText('−30')).toBeTruthy();
    expect(screen.getByText('+90').title).toBe('Tổng thay đổi Token prompt nếu áp dụng hết');
    fireEvent.click(screen.getAllByRole('button', { name: 'Áp dụng' })[1] as HTMLElement);
    fireEvent.click(screen.getAllByRole('button', { name: 'Bỏ' })[0] as HTMLElement);
    expect(onApply).toHaveBeenCalledWith('CS-0013');
    expect(onReject).toHaveBeenCalledWith('CS-0012');
  });

  it('cảnh báo khi áp dụng hết làm vượt trần Token prompt; nút đổi nhãn và sang tông nguy hiểm', () => {
    const onApplyAll = vi.fn();
    const { rerender } = renderUi(
      h(ChangeSetTray, {
        items,
        onApply: vi.fn(),
        onReject: vi.fn(),
        onApplyAll,
        budget: { current: 1795, ceiling: 2000 },
      }),
    );
    expect(screen.queryByRole('status')).toBeNull(); // 1795 + 90 = 1.885 ≤ 2.000
    expect(screen.getByText('Token prompt nếu áp dụng hết: 1.885 / 2.000')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Áp dụng mọi đề xuất chờ duyệt' }));
    expect(onApplyAll).toHaveBeenCalledOnce();
    rerender(
      h(ChangeSetTray, {
        items,
        onApply: vi.fn(),
        onReject: vi.fn(),
        onApplyAll,
        budget: { current: 1950, ceiling: 2000 },
      }),
    );
    expect(screen.getByRole('status').textContent).toContain('vượt trần');
    expect(screen.getByRole('button', { name: 'Vẫn áp dụng mọi đề xuất' }).className).toContain('ga-btn--danger');
  });
});

describe('EmployeeCard', () => {
  it('tỷ lệ ID-1, mặt trước có tên / số thẻ / trạng thái bằng chữ; lật sang mặt sau', () => {
    const { container } = renderUi(
      h(EmployeeCard, {
        name: 'Mai',
        position: 'Chăm sóc khách hàng',
        cardNo: 'CD-0004',
        status: 'active',
        issuedAt: new Date('2026-10-14T02:31:00Z'),
        timeZone: 'Asia/Ho_Chi_Minh',
        backLines: [{ label: 'Giờ làm', value: '08:00–17:00' }],
      }),
    );
    const card = screen.getByRole('figure', { name: 'Thẻ nhân viên của Mai' });
    expect(card.className).toContain('ga-card--active');
    const faces = container.querySelectorAll('.ga-card__face');
    expect(faces[0]?.hasAttribute('hidden')).toBe(false);
    expect(faces[1]?.hasAttribute('hidden')).toBe(true);
    expect(card.textContent).toContain('Hiệu lực');
    expect(card.textContent).toContain('CD-0004');
    fireEvent.click(screen.getByRole('button', { name: 'Lật thẻ' }));
    expect(faces[0]?.hasAttribute('hidden')).toBe(true);
    expect(faces[1]?.hasAttribute('hidden')).toBe(false);
    expect(faces[1]?.textContent).toContain('Giờ làm');
  });

  it('5 trạng thái: mờ / hiệu lực / tạm ngưng / thu hồi / đã thay (kèm ID thẻ mới), đều có chữ', () => {
    const texts: Record<string, string> = {
      pending: 'Chờ cấp',
      active: 'Hiệu lực',
      suspended: 'Tạm ngưng',
      revoked: 'Thu hồi',
      superseded: 'Đã thay bằng CD-0004',
    };
    for (const status of Object.keys(texts) as ('pending' | 'active' | 'suspended' | 'revoked' | 'superseded')[]) {
      const { container, unmount } = renderUi(
        h(EmployeeCard, { name: 'Mai', cardNo: 'CD-0003', status, supersededBy: 'CD-0004' }),
      );
      expect(container.querySelector(`.ga-card--${status}`), status).not.toBeNull();
      expect(container.querySelector('.ga-card__status')?.textContent, status).toBe(texts[status]);
      unmount();
    }
  });

  it('side điều khiển ngoài thì không có nút lật', () => {
    renderUi(h(EmployeeCard, { name: 'Mai', cardNo: 'CD-1', status: 'active', side: 'back' }));
    expect(screen.queryByRole('button', { name: 'Lật thẻ' })).toBeNull();
  });
});

describe('BirthCertificate (Data Console, không chibi)', () => {
  const sections = [
    {
      roman: 'I',
      title: 'Danh tính',
      fields: [
        { key: 'name', label: 'Tên gọi', value: 'Mai', source: 'owner' as const },
        { key: 'tone', label: 'Giọng điệu', value: 'ấm áp', source: 'ai' as const },
        { key: 'dn', label: 'Mã DNA', value: 'DN-0026', source: 'system' as const },
      ],
    },
    {
      roman: 'II',
      title: 'Tính cách',
      fields: [
        { key: 'patience', label: 'Kiên nhẫn', value: { trait: 4 as const, text: 'cao' }, source: 'ai' as const },
      ],
    },
  ];

  it('số hồ sơ và con dấu CHỈ hiện sau khi ký', () => {
    const { rerender } = renderUi(
      h(BirthCertificate, { title: 'Giấy khai sinh', sections, fileNo: 'GA-2026-0001', template: 'GA-01' }),
    );
    expect(screen.queryByText('GA-2026-0001')).toBeNull();
    expect(screen.queryByRole('img', { name: 'Con dấu: đã ký' })).toBeNull();
    expect(screen.getByText(/Chưa ký/)).toBeTruthy();
    rerender(
      h(BirthCertificate, {
        title: 'Giấy khai sinh',
        sections,
        fileNo: 'GA-2026-0001',
        template: 'GA-01',
        signed: { at: new Date('2026-09-30T02:48:00Z'), by: 'Owner' },
        timeZone: 'Asia/Ho_Chi_Minh',
      }),
    );
    expect(screen.getByText('GA-2026-0001')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Con dấu: đã ký' })).toBeTruthy();
    expect(screen.getByText('Ký bởi Owner')).toBeTruthy();
  });

  it('section La Mã, field theo 3 nguồn, tính cách 5 nấc có nhãn đọc được', () => {
    const { container } = renderUi(h(BirthCertificate, { title: 'Giấy khai sinh', sections }));
    expect(screen.getByRole('heading', { level: 3, name: 'I. Danh tính' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'II. Tính cách' })).toBeTruthy();
    expect(container.querySelectorAll('.ga-prov--ai')).toHaveLength(2);
    expect(container.querySelectorAll('.ga-prov--system')).toHaveLength(1);
    const dots = screen.getByRole('img', { name: 'Mức 4 trên 5' });
    expect(dots.querySelectorAll('.ga-trait__dot--on')).toHaveLength(4);
    expect(dots.querySelectorAll('.ga-trait__dot')).toHaveLength(5);
  });
});

describe('QuietHours', () => {
  it('toán thời gian: snap 15 phút, định dạng, phân tích, vùng qua nửa đêm', () => {
    expect(snap(7)).toBe(0);
    expect(snap(8)).toBe(15);
    expect(snap(1439)).toBe(0); // làm tròn lên 24:00 ⇒ 00:00
    expect(snap(-10)).toBe(1425); // gần -15 hơn 0 ⇒ 23:45 hôm trước
    expect(snap(-5)).toBe(0);
    expect(hhmm(0)).toBe('00:00');
    expect(hhmm(1425)).toBe('23:45');
    expect(parseHhmm('22:30')).toBe(1350);
    expect(parseHhmm('24:00')).toBeNull();
    expect(parseHhmm('abc')).toBeNull();
    const overnight = { start: 22 * 60, end: 6 * 60 };
    expect(quietLength(overnight)).toBe(8 * 60);
    expect(isQuiet(overnight, 23 * 60)).toBe(true);
    expect(isQuiet(overnight, 3 * 60)).toBe(true);
    expect(isQuiet(overnight, 12 * 60)).toBe(false);
    expect(isQuiet(overnight, 6 * 60)).toBe(false); // nửa mở: giờ kết thúc không còn im lặng
    const day = { start: 9 * 60, end: 17 * 60 };
    expect(quietLength(day)).toBe(8 * 60);
    expect(isQuiet(day, 9 * 60)).toBe(true);
    expect(quietLength({ start: 100 * 0, end: 0 })).toBe(0);
  });

  it('tay nắm là slider có giá trị chữ; mũi tên ±15 phút, Shift ±60; qua nửa đêm quay vòng', () => {
    const onChange = vi.fn();
    renderUi(
      h(QuietHoursTimeline, {
        value: { start: 22 * 60, end: 6 * 60, weekends: false },
        onChange,
        nowMinutes: 14 * 60 + 6,
      }),
    );
    const start = screen.getByRole('slider', { name: 'Bắt đầu im lặng' });
    expect(start.getAttribute('aria-valuetext')).toBe('22:00');
    fireEvent.keyDown(start, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith({ start: 22 * 60 + 15, end: 6 * 60, weekends: false });
    fireEvent.keyDown(start, { key: 'ArrowLeft', shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith({ start: 21 * 60, end: 6 * 60, weekends: false });
    const end = screen.getByRole('slider', { name: 'Kết thúc im lặng' });
    fireEvent.keyDown(end, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith({ start: 22 * 60, end: 6 * 60 - 15, weekends: false });
    expect(screen.getByRole('img', { name: 'Bây giờ 14:06' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Im lặng từ 22:00 đến 06:00 (8 giờ).');
  });

  it('ô giờ nhập chính xác (làm tròn 15 phút) và tuỳ chọn cuối tuần; disabled khoá mọi đường sửa', () => {
    const onChange = vi.fn();
    const { rerender } = renderUi(h(QuietHoursTimeline, { value: { start: 0, end: 0, weekends: false }, onChange }));
    expect(screen.getByRole('status').textContent).toBe('Không có giờ im lặng.');
    fireEvent.change(screen.getByLabelText('Bắt đầu im lặng', { selector: 'input' }), { target: { value: '21:08' } });
    expect(onChange).toHaveBeenLastCalledWith({ start: 21 * 60 + 15, end: 0, weekends: false });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cả cuối tuần' }));
    expect(onChange).toHaveBeenLastCalledWith({ start: 0, end: 0, weekends: true });
    onChange.mockClear();
    rerender(h(QuietHoursTimeline, { value: { start: 0, end: 60, weekends: false }, onChange, disabled: true }));
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Bắt đầu im lặng' }), { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: 'Cả cuối tuần' }).hasAttribute('disabled')).toBe(true);
  });

  it('vùng qua nửa đêm dựng hai đoạn sọc; vùng trong ngày một đoạn', () => {
    const { container, rerender } = renderUi(
      h(QuietHoursTimeline, { value: { start: 22 * 60, end: 6 * 60, weekends: false }, onChange: vi.fn() }),
    );
    expect(container.querySelectorAll('.ga-qh__zone')).toHaveLength(2);
    rerender(h(QuietHoursTimeline, { value: { start: 9 * 60, end: 17 * 60, weekends: false }, onChange: vi.fn() }));
    expect(container.querySelectorAll('.ga-qh__zone')).toHaveLength(1);
  });
});

describe('LogStream', () => {
  const at = (s: string) => new Date(`2026-10-14T07:${s}Z`);
  const mk = (n: number, over: Partial<LogLine> = {}): LogLine => ({
    id: `L${n}`,
    at: at('06:00'),
    level: 'info',
    text: `dòng ${n}`,
    ...over,
  });

  it('hiện giờ (theo múi giờ workspace), mức, tiền tố Role màu, nội dung; vùng log là role=log, focus được', () => {
    renderUi(
      h(LogStream, {
        label: 'Log hệ thống',
        timeZone: 'Asia/Ho_Chi_Minh',
        lines: [mk(1, { level: 'warn', source: { name: 'Mai', color: 'teal' }, text: 'hết quota cửa sổ 5 giờ' })],
      }),
    );
    const log = screen.getByRole('log', { name: 'Log hệ thống' });
    expect(log.getAttribute('tabindex')).toBe('0');
    expect(log.getAttribute('aria-live')).toBe('off');
    expect(within(log).getByText('14:06:00')).toBeTruthy();
    expect(within(log).getByText('WARN').className).toContain('ga-log__level-tag--warn');
    expect(within(log).getByText('Mai').className).toContain('ga-entity-teal');
  });

  it('bí mật tự che trước khi hiện', () => {
    const secret = ['sk', 'ABCDEFGHIJKLMNOP1234567890'].join('-');
    const { container } = renderUi(
      h(LogStream, {
        label: 'Log',
        lines: [
          mk(1, { text: `gọi API với ${secret} xong` }),
          mk(2, { text: 'password=hunter2abc ok' }),
          mk(3, { text: `Authorization: Bearer ${'a'.repeat(30)}` }),
        ],
      }),
    );
    const text = container.textContent ?? '';
    expect(text).not.toContain(secret);
    expect(text).not.toContain('hunter2abc');
    expect(text).not.toContain('a'.repeat(30));
    expect(text).toContain(MASK);
    expect(text).toContain('password=');
  });

  it('maskSecrets: ca dương và ca âm (câu thường không bị che)', () => {
    const key = ['ghp', 'x'.repeat(24)].join('_');
    expect(maskSecrets(`token ${key}`)).toBe(`token ${MASK}`);
    expect(maskSecrets('api_key: abc123')).toBe(`api_key: ${MASK}`);
    expect(maskSecrets(`hash ${'0123456789abcdef'.repeat(3)}`)).toBe(`hash ${MASK}`);
    for (const benign of [
      'Mai trả lời khách lúc 14:06',
      'tokens còn 1.284 / 2.000',
      'skip this step',
      'password policy ok',
    ]) {
      expect(maskSecrets(benign), benign).toBe(benign);
    }
    // mẫu tuyến tính: chuỗi độc hại dài không làm treo
    const t0 = performance.now();
    maskSecrets(`${'api_key '.repeat(20_000)}=`);
    maskSecrets(`Bearer ${'a'.repeat(100_000)}`);
    expect(performance.now() - t0).toBeLessThan(1500);
  });

  it('lọc theo mức và tìm (không phân biệt dấu), tô sáng chỗ khớp', () => {
    const lines = [
      mk(1, { level: 'info', text: 'Mai bắt đầu việc' }),
      mk(2, { level: 'error', text: 'Tùng gặp lỗi mạng' }),
      mk(3, { level: 'warn', text: 'quota thấp' }),
    ];
    const { container } = renderUi(h(LogStream, { label: 'Log', lines }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Lọc theo mức' }), { target: { value: 'warn' } });
    expect(container.querySelectorAll('.ga-log__line')).toHaveLength(2);
    fireEvent.change(screen.getByRole('combobox', { name: 'Lọc theo mức' }), { target: { value: 'all' } });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm trong log' }), { target: { value: 'tung' } });
    expect(container.querySelectorAll('.ga-log__line')).toHaveLength(1);
    expect(container.querySelector('mark')?.textContent).toBe('Tùng');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm trong log' }), { target: { value: 'không-có' } });
    expect(screen.getByText('Chưa có dòng log nào.')).toBeTruthy();
  });

  it('tạm dừng đóng băng danh sách, đếm dòng mới; tiếp tục thì hiện đủ', () => {
    const { container, rerender } = renderUi(h(LogStream, { label: 'Log', lines: [mk(1), mk(2)] }));
    fireEvent.click(screen.getByRole('button', { name: 'Tạm dừng' }));
    rerender(h(LogStream, { label: 'Log', lines: [mk(1), mk(2), mk(3), mk(4)] }));
    expect(container.querySelectorAll('.ga-log__line')).toHaveLength(2);
    expect(screen.getByText('+2 dòng mới')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(container.querySelectorAll('.ga-log__line')).toHaveLength(4);
    expect(screen.queryByText('+2 dòng mới')).toBeNull();
  });

  it('chỉ giữ maxLines dòng mới nhất trong DOM', () => {
    const lines = Array.from({ length: 50 }, (_, i) => mk(i));
    const { container } = renderUi(h(LogStream, { label: 'Log', lines, maxLines: 10 }));
    const rendered = container.querySelectorAll('.ga-log__line');
    expect(rendered).toHaveLength(10);
    expect(rendered[9]?.textContent).toContain('dòng 49');
  });

  it('bám đáy khi có dòng mới', () => {
    const { container, rerender } = renderUi(h(LogStream, { label: 'Log', lines: [mk(1)] }));
    const body = container.querySelector('.ga-log__body') as HTMLElement;
    Object.defineProperty(body, 'scrollHeight', { value: 500, configurable: true });
    rerender(h(LogStream, { label: 'Log', lines: [mk(1), mk(2)] }));
    expect(body.scrollTop).toBe(500);
    act(() => void 0);
  });
});
