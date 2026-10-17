// Cấu hình điều hướng: 6 nhóm lớn, các mục gần nhau là tab trong trang (STD-07 §2, FRONTEND-SPEC §2.2). Chữ qua khoá i18n.

import type { I18nKey } from '@ga/i18n';
import { Activity, BookOpen, LayoutDashboard, type LucideIcon, Server, SlidersHorizontal, Users } from 'lucide-react';

export interface NavTabDef {
  /** đoạn cuối của đường dẫn: /<nhóm>/<tab> */
  id: string;
  label: I18nKey;
  /** mã màn của FRONTEND-SPEC §2.3 (chỉ để đối chiếu / tài liệu, không hiện ra giao diện) */
  screen: string;
}

export interface NavGroupDef {
  id: 'overview' | 'people' | 'knowledge' | 'ops' | 'infra' | 'system';
  icon: LucideIcon;
  label: I18nKey;
  pageTitle: I18nKey;
  description: I18nKey;
  /** rỗng ⇒ nhóm là một trang đơn (/overview) */
  tabs: readonly NavTabDef[];
}

export const NAV_GROUPS: readonly NavGroupDef[] = [
  {
    id: 'overview',
    icon: LayoutDashboard,
    label: 'nav.group.overview',
    pageTitle: 'nav.page.overview',
    description: 'nav.description.overview',
    tabs: [],
  },
  {
    id: 'people',
    icon: Users,
    label: 'nav.group.people',
    pageTitle: 'nav.page.people',
    description: 'nav.description.people',
    tabs: [
      { id: 'roles', label: 'nav.tab.roles', screen: 'A3' },
      { id: 'birth', label: 'nav.tab.birth', screen: 'A1' },
      { id: 'training', label: 'nav.tab.training', screen: 'A2' },
      { id: 'cards', label: 'nav.tab.cards', screen: 'A4' },
      { id: 'characters', label: 'nav.tab.characters', screen: 'A11' },
    ],
  },
  {
    id: 'knowledge',
    icon: BookOpen,
    label: 'nav.group.knowledge',
    pageTitle: 'nav.page.knowledge',
    description: 'nav.description.knowledge',
    tabs: [
      { id: 'instructions', label: 'nav.tab.instructions', screen: 'grid' },
      { id: 'skills', label: 'nav.tab.skills', screen: 'grid' },
      { id: 'base', label: 'nav.tab.base', screen: 'grid' },
      { id: 'brain', label: 'nav.tab.brain', screen: 'A10' },
    ],
  },
  {
    id: 'ops',
    icon: Activity,
    label: 'nav.group.ops',
    pageTitle: 'nav.page.ops',
    description: 'nav.description.ops',
    tabs: [
      { id: 'tasks', label: 'nav.tab.tasks', screen: 'grid' },
      { id: 'wallet', label: 'nav.tab.wallet', screen: 'grid' },
      { id: 'proactive', label: 'nav.tab.proactive', screen: 'A3.P' },
      { id: 'leaderboard', label: 'nav.tab.leaderboard', screen: 'A9' },
      { id: 'telegram', label: 'nav.tab.telegram', screen: 'grid' },
    ],
  },
  {
    id: 'infra',
    icon: Server,
    label: 'nav.group.infra',
    pageTitle: 'nav.page.infra',
    description: 'nav.description.infra',
    tabs: [
      { id: 'accounts', label: 'nav.tab.accounts', screen: 'A5' },
      { id: 'capabilities', label: 'nav.tab.capabilities', screen: 'A5' },
      { id: 'system_ai', label: 'nav.tab.system_ai', screen: 'A5' },
      { id: 'ranking', label: 'nav.tab.ranking', screen: 'A5' },
      { id: 'containers', label: 'nav.tab.containers', screen: 'A5' },
    ],
  },
  {
    id: 'system',
    icon: SlidersHorizontal,
    label: 'nav.group.system',
    pageTitle: 'nav.page.system',
    description: 'nav.description.system',
    tabs: [
      { id: 'audit', label: 'nav.tab.audit', screen: 'A8' },
      { id: 'update', label: 'nav.tab.update', screen: 'A7' },
      { id: 'settings', label: 'nav.tab.settings', screen: 'A6' },
    ],
  },
];

/** Đường dẫn của một nhóm (trang đơn) hoặc của một tab. */
export const pathOf = (group: NavGroupDef, tab?: NavTabDef): string =>
  tab
    ? `/${group.id}/${tab.id}`
    : group.tabs.length === 0
      ? `/${group.id}`
      : `/${group.id}/${(group.tabs[0] as NavTabDef).id}`;

/** Khoá màn trong registry: "<nhóm>" cho trang đơn, "<nhóm>/<tab>" cho tab. */
export const screenKey = (group: NavGroupDef, tab?: NavTabDef): string => (tab ? `${group.id}/${tab.id}` : group.id);

export const ALL_SCREEN_KEYS: readonly string[] = NAV_GROUPS.flatMap((g) =>
  g.tabs.length === 0 ? [screenKey(g)] : g.tabs.map((t) => screenKey(g, t)),
);

export interface ResolvedLocation {
  group: NavGroupDef;
  tab: NavTabDef | null;
}

/** Từ đường dẫn → nhóm + tab hiện tại. Không khớp ⇒ null. */
export function resolveLocation(pathname: string): ResolvedLocation | null {
  const [groupId, tabId] = pathname.split('/').filter(Boolean);
  const group = NAV_GROUPS.find((g) => g.id === groupId);
  if (!group) return null;
  if (group.tabs.length === 0) return tabId === undefined ? { group, tab: null } : null;
  const tab = group.tabs.find((t) => t.id === tabId);
  return tab ? { group, tab } : null;
}

/**
 * Phím tắt `G` rồi chữ cái → màn (FRONTEND-SPEC §2.4). Khoá của GLOBAL_SHORTCUTS ('g d'…) lấy chữ cái ở cuối.
 */
export const GO_TO: Readonly<Record<string, string>> = {
  d: '/overview',
  u: '/people/roles',
  k: '/people/birth',
  t: '/people/training',
  c: '/people/cards',
  b: '/knowledge/brain',
  e: '/infra/accounts',
  l: '/system/audit',
  v: '/system/update',
  s: '/system/settings',
  x: '/ops/leaderboard',
  p: '/ops/proactive',
};
