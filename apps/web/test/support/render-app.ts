// Dựng cả <App> (router thật, i18n thật) trong happy-dom với máy khách đăng nhập giả và lịch sử bộ nhớ.

import { createI18n, type I18n } from '@ga/i18n';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, type RenderResult, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach } from 'vitest';
import { App } from '../../src/app.tsx';
import type { AuthClient } from '../../src/auth/types.ts';

export const h = createElement;

export function registerCleanup(): void {
  afterEach(() => {
    cleanup();
    document.body.className = '';
    document.documentElement.lang = '';
    globalThis.localStorage?.clear();
  });
}

export interface RenderedApp extends RenderResult {
  i18n: I18n;
  history: ReturnType<typeof createMemoryHistory>;
  queryClient: QueryClient;
  pathname(): string;
}

export function renderApp(auth: AuthClient, opts: { path?: string; i18n?: I18n; uikit?: boolean } = {}): RenderedApp {
  const history = createMemoryHistory({ initialEntries: [opts.path ?? '/'] });
  const i18n = opts.i18n ?? createI18n();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  const view = render(h(App, { deps: { auth, history, i18n, queryClient, uikit: opts.uikit } }));
  return Object.assign(view, { i18n, history, queryClient, pathname: () => history.location.pathname });
}
