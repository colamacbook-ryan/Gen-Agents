import { createI18n, type I18n } from '@ga/i18n';
import { I18nProvider, useI18n } from '@ga/i18n/react';
import { ShellLinkProvider, ToastProvider } from '@ga/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type RouterHistory, RouterProvider } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import type { ApiClient } from './api/client.ts';
import { ApiProvider } from './api/query.tsx';
import { AuthProvider } from './auth/context.tsx';
import { SESSION_KEY } from './auth/session.ts';
import type { AuthClient } from './auth/types.ts';
import { loadLocale } from './locale-store.ts';
import { createAppRouter } from './router.tsx';
import { RouterShellLink } from './shell/link-adapter.tsx';

export interface AppDeps {
  auth: AuthClient;
  /** client API gõ kiểu (dữ liệu màn hình); thiếu ⇒ không có lớp dữ liệu (test màn đăng nhập) */
  api?: ApiClient;
  i18n?: I18n;
  queryClient?: QueryClient;
  /** test truyền lịch sử bộ nhớ; mặc định lịch sử trình duyệt */
  history?: RouterHistory;
  uikit?: boolean;
}

/** Giữ <html lang> theo ngôn ngữ giao diện (đọc màn hình, kiểm chính tả). */
function HtmlLang() {
  const { locale } = useI18n();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}

/** Gốc app: i18n · auth · query · toast · liên kết router. Mọi phụ thuộc ngoài (HTTP, ngôn ngữ, lịch sử) đi vào qua `deps` để test thay bằng giả. */
export function App({ deps }: { deps: AppDeps }) {
  const i18n = useMemo(
    () =>
      deps.i18n ??
      createI18n({
        locale: loadLocale(),
        onMissingKey: (key) => console.error(`thiếu khoá i18n do API trả về: ${key}`),
      }),
    [deps.i18n],
  );
  const queryClient = useMemo(
    () =>
      deps.queryClient ??
      new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }),
    [deps.queryClient],
  );
  const router = useMemo(
    () => createAppRouter({ auth: deps.auth, queryClient }, { history: deps.history, uikit: deps.uikit }),
    [deps.auth, deps.history, deps.uikit, queryClient],
  );
  // 401 ở route cần phiên ⇒ bỏ cache dữ liệu + phiên rồi về G1. EXT-03 là phép dò "đã đăng nhập chưa": 401 ở đó là bình thường, router tự xử.
  useEffect(() => {
    if (!deps.api) return;
    return deps.api.events.subscribe((e) => {
      if (e.type !== 'unauthorized' || e.routeId === 'EXT-03') return;
      queryClient.removeQueries({ queryKey: ['api'] });
      queryClient.setQueryData(SESSION_KEY, null);
      void router.navigate({ to: '/login' });
    });
  }, [deps.api, queryClient, router]);
  const tree = (
    <ToastProvider>
      <ShellLinkProvider link={RouterShellLink}>
        <RouterProvider router={router} />
      </ShellLinkProvider>
    </ToastProvider>
  );
  return (
    <I18nProvider i18n={i18n}>
      <HtmlLang />
      <AuthProvider auth={deps.auth}>
        <QueryClientProvider client={queryClient}>
          {deps.api ? <ApiProvider api={deps.api}>{tree}</ApiProvider> : tree}
        </QueryClientProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
