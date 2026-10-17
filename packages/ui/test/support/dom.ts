// Tiện ích test component: dựng cây có I18nProvider (vi) + tự dọn sau mỗi test.
// Tệp test .ts (không JSX) để `pnpm test` gốc — chỉ nhận test/**/*.test.ts — cũng chạy được; dùng `h` thay JSX.

import { createI18n, type I18n, type Locale } from '@ga/i18n';
import { I18nProvider } from '@ga/i18n/react';
import { cleanup, type RenderResult, render } from '@testing-library/react';
import { createElement, type JSXElementConstructor, type ReactElement, type ReactNode } from 'react';
import { afterEach } from 'vitest';
import { ToastProvider } from '../../src/overlay/toast.tsx';

/**
 * createElement có kiểu cho test không dùng JSX: kiểm kiểu các prop thật, còn `children` truyền làm đối số thứ ba
 * (createElement gốc đòi `children` có trong props nếu component khai báo bắt buộc).
 */
export function h<P extends object>(
  type: JSXElementConstructor<P>,
  props?: Omit<P, 'children'> | null,
  ...children: ReactNode[]
): ReactElement;
export function h(type: string, props?: Record<string, unknown> | null, ...children: ReactNode[]): ReactElement;
export function h(type: unknown, props?: unknown, ...children: ReactNode[]): ReactElement {
  return createElement(type as string, props as never, ...children);
}

/** Gọi một lần ở đầu tệp test. */
export function registerCleanup(): void {
  afterEach(() => {
    cleanup();
    document.body.className = '';
  });
}

export function renderUi(
  ui: ReactElement,
  opts: { locale?: Locale; i18n?: I18n; toasts?: boolean; autoHideMs?: number } = {},
): RenderResult & { i18n: I18n } {
  const i18n = opts.i18n ?? createI18n({ locale: opts.locale ?? 'vi' });
  const wrap = (node: ReactElement): ReactElement =>
    h(I18nProvider, { i18n }, opts.toasts ? h(ToastProvider, { autoHideMs: opts.autoHideMs }, node) : node);
  const result = render(wrap(ui));
  const rerenderRaw = result.rerender;
  // rerender phải giữ nguyên lớp bọc, nếu không cây bị gắn lại và mất state
  return Object.assign(result, { i18n, rerender: (next: ReactElement) => rerenderRaw(wrap(next)) });
}
