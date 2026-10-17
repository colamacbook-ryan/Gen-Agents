import { useI18n } from '@ga/i18n/react';
import {
  AppShell,
  CommandPalette,
  Header,
  LogDrawer,
  LogStream,
  type NavGroup,
  NotificationCenter,
  OverlayProvider,
  PageHeader,
  type PaletteItem,
  ShortcutProvider,
  ShortcutsDialog,
  Sidebar,
  useOverlays,
  type WorkspaceLink,
} from '@ga/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { Gamepad2, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '../auth/context.tsx';
import { SESSION_KEY, sessionQuery } from '../auth/session.ts';
import { NAV_GROUPS, pathOf, resolveLocation } from '../nav.ts';
import { GlobalShortcuts } from './global-shortcuts.tsx';

/** Khung của mọi màn sau đăng nhập: sidebar · header · page header (tab) · nội dung · log drawer, cùng O1–O3 và phím tắt. */
export function AppFrame() {
  return (
    <ShortcutProvider>
      <OverlayProvider>
        <FrameInner />
      </OverlayProvider>
    </ShortcutProvider>
  );
}

const tabDomId = (id: string): string => `ga-tab-${id}`;
const panelDomId = 'ga-tabpanel';

function FrameInner() {
  const { t } = useI18n();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const overlays = useOverlays();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: session } = useQuery(sessionQuery(auth));
  const [collapsed, setCollapsed] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const loc = resolveLocation(pathname);

  const groups: NavGroup[] = useMemo(
    () =>
      NAV_GROUPS.map((g) => ({
        id: g.id,
        label: t(g.label),
        icon: g.icon,
        to: pathOf(g),
        tabs: g.tabs.map((tab) => ({ id: tab.id, label: t(tab.label), to: pathOf(g, tab) })),
      })),
    [t],
  );

  const workspaceLinks: WorkspaceLink[] = useMemo(
    () => [
      { id: 'telegram', label: t('nav.workspace.telegram'), to: '/ops/telegram', icon: Send },
      {
        id: 'webgame',
        label: t('nav.workspace.webgame'),
        to: '/overview',
        icon: Gamepad2,
        badge: t('nav.workspace.webgameSoon'),
        disabled: true,
      },
    ],
    [t],
  );

  const paletteItems: PaletteItem[] = useMemo(() => {
    const nav: PaletteItem[] = NAV_GROUPS.flatMap((g) =>
      g.tabs.length === 0
        ? [
            {
              id: `nav-${g.id}`,
              label: t(g.label),
              group: t('palette.group.nav'),
              run: () => void navigate({ to: pathOf(g) }),
            },
          ]
        : g.tabs.map((tab) => ({
            id: `nav-${g.id}-${tab.id}`,
            label: `${t(g.label)} › ${t(tab.label)}`,
            group: t('palette.group.nav'),
            run: () => void navigate({ to: pathOf(g, tab) }),
          })),
    );
    const actions: PaletteItem[] = [
      {
        id: 'act-new-role',
        label: t('shortcuts.newRole'),
        group: t('palette.group.actions'),
        run: () => void navigate({ to: '/people/birth' }),
      },
      {
        id: 'act-help',
        label: t('shortcuts.help'),
        group: t('palette.group.actions'),
        run: () => overlays.open('shortcuts'),
      },
      {
        id: 'act-log',
        label: t('shortcuts.logDrawer'),
        group: t('palette.group.actions'),
        run: () => setLogOpen((v) => !v),
      },
    ];
    return [...actions, ...nav];
  }, [t, navigate, overlays]);

  const onLogout = async () => {
    await auth.logout();
    queryClient.setQueryData(SESSION_KEY, null);
    await navigate({ to: '/login' });
  };

  const activeTab = loc?.tab ?? null;
  const tabs = loc?.group.tabs.map((tab) => ({ id: tab.id, label: t(tab.label), to: pathOf(loc.group, tab) }));
  const crumbs = loc
    ? [{ label: t(loc.group.label), to: pathOf(loc.group) }, ...(activeTab ? [{ label: t(activeTab.label) }] : [])]
    : [{ label: t('notFound.title') }];

  const content =
    tabs && tabs.length > 0 && activeTab ? (
      <div role="tabpanel" id={panelDomId} aria-labelledby={tabDomId(activeTab.id)}>
        <Outlet />
      </div>
    ) : (
      <Outlet />
    );

  return (
    <>
      <GlobalShortcuts pathname={pathname} onToggleLog={() => setLogOpen((v) => !v)} />
      <AppShell
        sidebar={
          <Sidebar
            brand={t('brand.name')}
            groups={groups}
            activeGroupId={loc?.group.id ?? null}
            workspaceLinks={workspaceLinks}
            owner={session ? { name: session.username, role: t('nav.ownerRole') } : undefined}
            version={{ label: `v${import.meta.env.VITE_GA_VERSION ?? '0.0.0'}`, to: '/system/update' }}
            onLogout={() => void onLogout()}
            collapsed={collapsed}
            onToggleCollapsed={() => setCollapsed((c) => !c)}
          />
        }
        header={
          <Header
            breadcrumb={crumbs}
            onOpenPalette={() => overlays.open('palette')}
            bell={{ count: 0, onClick: () => overlays.open('notifications') }}
          />
        }
        pageHeader={
          loc ? (
            <PageHeader
              title={t(loc.group.pageTitle)}
              description={t(loc.group.description)}
              tabs={tabs}
              activeTabId={activeTab?.id ?? null}
              tabsLabel={t('a11y.pageTabs')}
              tabId={tabDomId}
            />
          ) : undefined
        }
        drawer={
          <LogDrawer open={logOpen} onToggle={() => setLogOpen((v) => !v)}>
            <LogStream lines={[]} label={t('log.drawerTitle')} />
          </LogDrawer>
        }
      >
        {content}
      </AppShell>
      <CommandPalette open={overlays.current === 'palette'} onClose={overlays.close} items={paletteItems} />
      <NotificationCenter open={overlays.current === 'notifications'} onClose={overlays.close} items={[]} />
      <ShortcutsDialog open={overlays.current === 'shortcuts'} onClose={overlays.close} />
    </>
  );
}
