import { useI18n } from '@ga/i18n/react';
import { Button, SkeletonLines, WarningBanner } from '@ga/ui/primitives';
import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  type RouterHistory,
  redirect,
  useRouter,
} from '@tanstack/react-router';
import { sessionQuery } from './auth/session.ts';
import { type AuthClient, isAuthError } from './auth/types.ts';
import { NAV_GROUPS, type NavGroupDef, type NavTabDef, pathOf, screenKey } from './nav.ts';
import { ChangePasswordScreen } from './routes/login/change-password-screen.tsx';
import { LoginScreen } from './routes/login/login-screen.tsx';
import { SCREENS, type ScreenComponent } from './screens.ts';
import { AppFrame } from './shell/app-frame.tsx';
import { NotFoundScreen, PlaceholderScreen } from './shell/placeholder.tsx';

export interface RouterContext {
  auth: AuthClient;
  queryClient: QueryClient;
}

export interface CreateRouterOptions {
  history?: RouterHistory;
  /** bật /__ui-kit (bộ component để duyệt + test). Mặc định: bản dev hoặc bản build đặt VITE_GA_UIKIT=1. */
  uikit?: boolean;
  /** bảng màn (test truyền bảng giả); mặc định registry gom từ routes/ * /screens.tsx */
  screens?: ReadonlyMap<string, ScreenComponent>;
}

const uikitLoader =
  import.meta.env.DEV || import.meta.env.VITE_GA_UIKIT === '1' ? () => import('./dev/uikit.tsx') : null;

// trang dò của backend giả: cùng kỹ thuật cổng build như uikit — ở bản phát hành `probeLoader` là null và chunk bị loại khỏi gói
const probeLoader = import.meta.env.VITE_GA_FAKE === '1' ? () => import('./api/fake/probe.tsx') : null;

const session = (c: RouterContext) => c.queryClient.ensureQueryData(sessionQuery(c.auth));

function RouteError({ error }: { error: unknown }) {
  const { t, tr } = useI18n();
  const router = useRouter();
  if (!isAuthError(error)) console.error('lỗi tuyến', error);
  return (
    <div>
      <WarningBanner
        tone="danger"
        actions={
          <Button size="sm" onClick={() => void router.invalidate()}>
            {t('common.retry')}
          </Button>
        }
      >
        {tr(isAuthError(error) ? error.i18nKey : 'errors.unknown')}
      </WarningBanner>
    </div>
  );
}

function Pending() {
  const { t } = useI18n();
  return (
    <div>
      <span className="ga-sr-only">{t('auth.session.checking')}</span>
      <SkeletonLines lines={3} />
    </div>
  );
}

export function createAppRouter(ctx: RouterContext, opts: CreateRouterOptions = {}) {
  const screens = opts.screens ?? SCREENS;
  const uikit = opts.uikit ?? uikitLoader !== null;

  const root = createRootRouteWithContext<RouterContext>()({ component: Outlet, errorComponent: RouteError });

  const index = createRoute({
    getParentRoute: () => root,
    path: '/',
    beforeLoad: () => {
      throw redirect({ to: '/overview' });
    },
  });

  const login = createRoute({
    getParentRoute: () => root,
    path: '/login',
    component: LoginScreen,
    beforeLoad: async ({ context }) => {
      const s = await session(context);
      if (s) throw redirect({ to: s.mustChangePassword ? '/change-password' : '/overview' });
    },
  });

  const changePassword = createRoute({
    getParentRoute: () => root,
    path: '/change-password',
    component: ChangePasswordScreen,
    beforeLoad: async ({ context }) => {
      const s = await session(context);
      if (!s) throw redirect({ to: '/login' });
      if (!s.mustChangePassword) throw redirect({ to: '/overview' });
    },
  });

  // mọi màn Admin: cần phiên, và phiên không còn bị buộc đổi mật khẩu
  const authed = createRoute({
    getParentRoute: () => root,
    id: 'authed',
    component: AppFrame,
    beforeLoad: async ({ context }) => {
      const s = await session(context);
      if (!s) throw redirect({ to: '/login' });
      if (s.mustChangePassword) throw redirect({ to: '/change-password' });
    },
  });

  const leaf = (group: NavGroupDef, tab?: NavTabDef) =>
    createRoute({
      getParentRoute: () => authed,
      path: pathOf(group, tab),
      component: screens.get(screenKey(group, tab)) ?? PlaceholderScreen,
    });

  const leaves = NAV_GROUPS.flatMap((g) => (g.tabs.length === 0 ? [leaf(g)] : g.tabs.map((tab) => leaf(g, tab))));
  // /people → /people/roles (tab đầu tiên)
  const groupIndexes = NAV_GROUPS.filter((g) => g.tabs.length > 0).map((g) =>
    createRoute({
      getParentRoute: () => authed,
      path: `/${g.id}`,
      beforeLoad: () => {
        throw redirect({ to: pathOf(g) });
      },
    }),
  );
  const notFound = createRoute({ getParentRoute: () => authed, path: '$', component: NotFoundScreen });
  // bộ component chỉ đóng gói khi bản build bật VITE_GA_UIKIT=1 (bản dev luôn có): ở bản phát hành `uikitLoader` là null và chunk bị loại
  const uikitRoute =
    uikit && uikitLoader
      ? [
          createRoute({
            getParentRoute: () => authed,
            path: '/__ui-kit',
            component: lazyRouteComponent(uikitLoader, 'UiKit'),
          }),
        ]
      : [];

  const probeRoute = probeLoader
    ? [
        createRoute({
          getParentRoute: () => authed,
          path: '/__api-probe',
          component: lazyRouteComponent(probeLoader, 'ApiProbe'),
        }),
      ]
    : [];

  const routeTree = root.addChildren([
    index,
    login,
    changePassword,
    authed.addChildren([...leaves, ...groupIndexes, ...uikitRoute, ...probeRoute, notFound]),
  ]);

  return createRouter({
    routeTree,
    context: ctx,
    history: opts.history,
    defaultPendingComponent: Pending,
    defaultPendingMs: 200,
    defaultPreload: false,
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
