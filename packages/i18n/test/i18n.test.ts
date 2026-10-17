// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react';
import { createElement as h } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '../en.json' with { type: 'json' };
import { checkMessages } from '../src/check.ts';
import {
  createI18n,
  dayKey,
  flattenMessages,
  formatBytes,
  formatClock,
  formatDateTime,
  formatInt,
  isLocale,
  placeholdersOf,
} from '../src/index.ts';
import { I18nProvider, useI18n, useT } from '../src/react.ts';
import vi_ from '../vi.json' with { type: 'json' };

afterEach(cleanup);

// dựng lúc chạy để chính tệp test không chứa tên owner (lint no-owner-name)
const OWNER_NAMES = new RegExp(['\\b(ry', 'an|colama', 'cbook)\\b'].join(''), 'i');

describe('bảng chuỗi thật (vi.json + en.json)', () => {
  it('không có lỗi: khoá hợp lệ, không rỗng, en ⊆ vi, tham số khớp, không lộ mã nội bộ', () => {
    expect(checkMessages(vi_, en)).toEqual([]);
  });

  it('vi.json không chứa tên owner cụ thể và không có số 0 ₲ viết bằng từ cấm (kiểm bổ sung cho lint no-owner-name)', () => {
    const all = Object.values(flattenMessages(vi_)).join('\n');
    expect(all).not.toMatch(OWNER_NAMES);
  });

  it('mọi chuỗi ở dạng NFC (bộ kiểm từ cấm dựa vào dạng dựng sẵn; gõ kiểu tổ hợp sẽ lọt)', () => {
    for (const [key, value] of Object.entries(flattenMessages(vi_))) {
      expect(value, key).toBe((value as string).normalize('NFC'));
    }
    for (const [key, value] of Object.entries(flattenMessages(en))) {
      expect(value, key).toBe((value as string).normalize('NFC'));
    }
  });

  it('chữ tiếng Việt có dấu đầy đủ ở các chuỗi chính (không bị bỏ dấu)', () => {
    const flat = flattenMessages(vi_) as Record<string, string>;
    expect(flat['nav.group.people']).toBe('Nhân sự');
    expect(flat['status.wounded']).toBe('Nghỉ dưỡng thương');
    expect(flat['header.connectionLost']).toBe('Mất kết nối — đang thử lại');
  });
});

describe('checkMessages — mỗi luật phải bắt được ca xấu (bộ bắt còn sống)', () => {
  const codes = (vi: unknown, enx?: unknown): string[] => checkMessages(vi, enx).map((i) => i.code);

  it('khoá xấu, không phải chuỗi, rỗng', () => {
    expect(codes({ 'a b': 'x' })).toContain('bad_key');
    expect(codes({ a: { 'b-c': 'x' } })).toContain('bad_key');
    expect(codes({ a: 5 })).toContain('not_string');
    expect(codes({ a: ['x'] })).toContain('not_string');
    expect(codes({ a: '   ' })).toContain('empty');
  });

  it('en có khoá thừa; tham số lệch; en rỗng', () => {
    expect(codes({ a: 'x' }, { b: 'y' })).toContain('extra_key');
    expect(codes({ a: 'Chào {name}' }, { a: 'Hello {user}' })).toContain('placeholder_mismatch');
    expect(codes({ a: 'Chào {name} {n}' }, { a: 'Hello {n} {name}' })).toEqual([]);
    expect(codes({ a: 'x' }, { a: '' })).toContain('empty');
  });

  it('lộ mã nội bộ (CNS-, Q-R8a, INT-20, STD-07, nhãn tài liệu) ở vi lẫn en', () => {
    for (const leak of [
      'xem CNS-123',
      'theo Q-R8a',
      'luật INT-20',
      'chuẩn STD-07',
      '[CHỐT — Gen]',
      '[ĐỀ XUẤT — Gen]',
      'Q-I7 đã chốt',
    ]) {
      expect(codes({ a: leak }), leak).toContain('internal_code');
      expect(codes({ a: 'x' }, { a: leak }), leak).toContain('internal_code');
    }
    expect(codes({ a: 'Mai quay về CLI ưu tiên 1' })).toEqual([]);
  });

  it('cú pháp lồng của i18next bị chặn', () => {
    expect(codes({ a: 'xem $t(b)' })).toContain('nesting_syntax');
  });

  it('từ cấm quanh Trọng thương chỉ áp cho khoá có "wound"', () => {
    expect(codes({ wound: { a: 'Role đã chết' } })).toContain('forbidden_wound_word');
    expect(codes({ wound: { a: 'Role bị thay thế' } })).toContain('forbidden_wound_word');
    expect(codes({ wound: { a: 'Role nghỉ dưỡng thương' } })).toEqual([]);
    expect(codes({ other: { a: 'xoá thẻ' } })).toEqual([]);
  });
});

describe('createI18n', () => {
  it('dịch theo khoá, nội suy {tham_số}', () => {
    const i = createI18n();
    expect(i.t('nav.group.overview')).toBe('Tổng quan');
    expect(i.t('card.label', { name: 'Mai' })).toBe('Thẻ nhân viên của Mai');
    expect(i.t('changeset.title', { count: 3 })).toBe('3 đề xuất chờ duyệt');
    // React tự thoát khi render; i18n không thoát HTML thêm lần nữa (tránh `&amp;lt;`)
    expect(i.t('card.label', { name: '<b>x</b>' })).toBe('Thẻ nhân viên của <b>x</b>');
  });

  it('đổi ngôn ngữ; khoá thiếu ở en rơi về vi; subscribe báo thay đổi', () => {
    const i = createI18n({ locale: 'en' });
    expect(i.locale).toBe('en');
    expect(i.t('auth.login.title')).toBe('Sign in');
    expect(i.t('nav.group.overview')).toBe('Tổng quan'); // chưa có bản en ⇒ rơi về vi
    const spy = vi.fn();
    const off = i.subscribe(spy);
    i.setLocale('vi');
    expect(i.locale).toBe('vi');
    expect(i.t('auth.login.title')).toBe('Đăng nhập');
    expect(spy).toHaveBeenCalled();
    off();
    spy.mockClear();
    i.setLocale('en');
    expect(spy).not.toHaveBeenCalled();
  });

  it('tr(): khoá từ API — có thì dịch; lạ thì báo onMissingKey và dùng chuỗi dự phòng, KHÔNG in khoá thô', () => {
    const missing: string[] = [];
    const i = createI18n({ onMissingKey: (k) => missing.push(k) });
    expect(i.tr('errors.auth.invalid_credentials')).toBe('Tên đăng nhập hoặc mật khẩu không đúng.');
    expect(i.tr('errors.db.chua_co_khoa')).toBe('Đã có lỗi. Thử lại, hoặc xem log nếu lỗi lặp lại.');
    expect(missing).toEqual(['errors.db.chua_co_khoa']);
    expect(i.tr('errors.db.chua_co_khoa', undefined, 'errors.network')).toBe(
      'Không kết nối được tới máy chủ. Kiểm tra mạng rồi thử lại.',
    );
    expect(i.has('errors.unknown')).toBe(true);
    expect(i.has('khong.co')).toBe(false);
  });

  it('isLocale', () => {
    expect(isLocale('vi')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe('React binding', () => {
  function View() {
    const t = useT();
    const { locale, setLocale } = useI18n();
    return h(
      'button',
      { type: 'button', onClick: () => setLocale(locale === 'vi' ? 'en' : 'vi') },
      t('auth.login.submit'),
    );
  }

  it('useT re-render khi đổi ngôn ngữ', () => {
    const i18n = createI18n();
    const { getByRole } = render(h(I18nProvider, { i18n }, h(View)));
    expect(getByRole('button').textContent).toBe('Đăng nhập');
    act(() => getByRole('button').click());
    expect(getByRole('button').textContent).toBe('Sign in');
    act(() => i18n.setLocale('vi'));
    expect(getByRole('button').textContent).toBe('Đăng nhập');
  });

  it('ngoài Provider vẫn dùng được (bản vi mặc định)', () => {
    const { getByRole } = render(h(View));
    expect(getByRole('button').textContent).toBe('Đăng nhập');
  });
});

describe('format', () => {
  it('số theo locale (dấu chấm ngăn nghìn ở vi)', () => {
    expect(formatInt(1284, 'vi')).toBe('1.284');
    expect(formatInt(1284, 'en')).toBe('1,284');
    expect(formatBytes(25 * 1024 * 1024, 'vi')).toBe('25 MB');
    expect(formatBytes(1536, 'vi')).toBe('1,5 KB');
    expect(formatBytes(10, 'en')).toBe('10 B');
  });

  it('giờ theo múi giờ workspace (không hardcode): cùng thời điểm, hai múi giờ cho hai kết quả', () => {
    const d = new Date('2026-10-14T07:06:00Z');
    expect(formatClock(d, 'vi', { timeZone: 'Asia/Ho_Chi_Minh' })).toBe('14:06');
    expect(formatClock(d, 'vi', { timeZone: 'UTC' })).toBe('07:06');
    expect(formatDateTime(d, 'vi', { timeZone: 'UTC' })).toContain('07:06');
    expect(dayKey(new Date('2026-10-13T23:30:00Z'), { timeZone: 'Asia/Ho_Chi_Minh' })).toBe('2026-10-14');
    expect(dayKey(new Date('2026-10-13T23:30:00Z'), { timeZone: 'UTC' })).toBe('2026-10-13');
  });
});

describe('keys', () => {
  it('flattenMessages và placeholdersOf', () => {
    expect(flattenMessages({ a: { b: 'x', c: { d: 'y' } }, e: 'z' })).toEqual({ 'a.b': 'x', 'a.c.d': 'y', e: 'z' });
    expect(flattenMessages(null)).toEqual({});
    expect(placeholdersOf('Chào {name}, bạn có {count} tin, {name} ơi')).toEqual(['name', 'count']);
    expect(placeholdersOf('không có')).toEqual([]);
    expect(placeholdersOf('{{x}} {1} {-a}')).toEqual(['x']);
  });
});
