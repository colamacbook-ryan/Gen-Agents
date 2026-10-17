import { useI18n } from '@ga/i18n/react';
import { ChevronDown, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { IconButton } from '../primitives/button.tsx';
import { Icon } from '../primitives/icon.tsx';
import { RoleAvatar } from '../primitives/role-avatar.tsx';
import { useShellLink } from './link.tsx';
import type { NavGroup, PinnedEntity, WorkspaceLink } from './nav-model.ts';
import './sidebar.css';

export interface SidebarProps {
  brand: string;
  workspaceName?: string;
  onSwitchWorkspace?(): void;
  groups: readonly NavGroup[];
  activeGroupId: string | null;
  pinned?: readonly PinnedEntity[];
  workspaceLinks?: readonly WorkspaceLink[];
  owner?: { name: string; role: string };
  version?: { label: string; updateAvailable?: boolean; to?: string };
  onLogout?(): void;
  collapsed?: boolean;
  onToggleCollapsed?(): void;
}

/** Sidebar 216px (rail 56px khi thu gọn): brand 44 · nhóm lớn (item 30) · đang ghim · workspace · owner + phiên bản. */
export function Sidebar({
  brand,
  workspaceName,
  onSwitchWorkspace,
  groups,
  activeGroupId,
  pinned = [],
  workspaceLinks = [],
  owner,
  version,
  onLogout,
  collapsed = false,
  onToggleCollapsed,
}: SidebarProps) {
  const { t } = useI18n();
  const Link = useShellLink();
  return (
    <aside className={collapsed ? 'ga-sidebar ga-sidebar--rail' : 'ga-sidebar'}>
      <div className="ga-sidebar__brand">
        <span className="ga-sidebar__mark" aria-hidden="true" />
        <span className="ga-sidebar__name">{brand}</span>
        {workspaceName ? (
          <button
            type="button"
            className="ga-sidebar__ws"
            aria-label={t('sidebar.switchWorkspace', { name: workspaceName })}
            onClick={onSwitchWorkspace}
          >
            {workspaceName}
            <Icon icon={ChevronDown} size={12} />
          </button>
        ) : null}
      </div>

      <nav aria-label={t('a11y.mainNav')}>
        <div className="ga-sidebar__groups">
          {groups.map((g) => (
            <Link
              key={g.id}
              to={g.to}
              className="ga-nav-item"
              aria-current={g.id === activeGroupId ? 'page' : undefined}
              title={collapsed ? g.label : undefined}
            >
              <Icon icon={g.icon} />
              <span className="ga-nav-item__text">{g.label}</span>
              {g.alert ? (
                <span className="ga-nav-item__alert" role="img" aria-label={g.alert.label} />
              ) : g.badge ? (
                <span className="ga-nav-item__badge">{g.badge}</span>
              ) : g.count !== undefined ? (
                <span className="ga-nav-item__count">{g.count}</span>
              ) : null}
            </Link>
          ))}
        </div>
      </nav>

      <div className="ga-sidebar__rule" />
      <div className="ga-sidebar__label">{t('sidebar.pinned')}</div>
      {pinned.length === 0 ? (
        <div className="ga-sidebar__empty">{t('sidebar.pinnedEmpty')}</div>
      ) : (
        pinned.map((p) => (
          <Link key={p.id} to={p.to} className="ga-pinned" title={`${p.name} · ${p.statusLabel}`}>
            <RoleAvatar name={p.name} color={p.color} size={16} wounded={p.wounded} live={p.live} />
            <span className="ga-pinned__name">{p.name}</span>
            <span className="ga-pinned__code">{p.code}</span>
            <span className="ga-sr-only">{p.statusLabel}</span>
          </Link>
        ))
      )}

      <div className="ga-sidebar__bottom">
        {workspaceLinks.length > 0 ? (
          <>
            <div className="ga-sidebar__label">{t('sidebar.workspace')}</div>
            {workspaceLinks.map((w) =>
              w.disabled ? (
                <span
                  key={w.id}
                  className="ga-nav-item ga-nav-item--disabled"
                  aria-disabled="true"
                  title={collapsed ? w.label : undefined}
                >
                  <Icon icon={w.icon} />
                  <span className="ga-nav-item__stack">
                    <span className="ga-nav-item__text">{w.label}</span>
                    {w.badge ? <span className="ga-nav-item__sub">{w.badge}</span> : null}
                  </span>
                </span>
              ) : (
                <Link key={w.id} to={w.to} className="ga-nav-item" title={collapsed ? w.label : undefined}>
                  <Icon icon={w.icon} />
                  <span className="ga-nav-item__text">{w.label}</span>
                  {w.badge ? <span className="ga-nav-item__badge">{w.badge}</span> : null}
                </Link>
              ),
            )}
          </>
        ) : null}
        <div className="ga-sidebar__rule" />
        {owner ? (
          <div className="ga-sidebar__owner">
            <span className="ga-sidebar__owner-avatar" aria-hidden="true">
              {owner.name.slice(0, 1).toLocaleUpperCase()}
            </span>
            <div className="ga-sidebar__owner-text">
              <div className="ga-sidebar__owner-name">
                {owner.name} · {owner.role}
              </div>
              {version ? (
                <Link to={version.to ?? '#'} className="ga-sidebar__version">
                  {version.updateAvailable ? <span className="ga-sidebar__version-dot" aria-hidden="true" /> : null}
                  {version.label}
                  {version.updateAvailable ? ` · ${t('sidebar.updateAvailable')}` : ''}
                </Link>
              ) : null}
            </div>
            {onLogout ? (
              <IconButton
                className="ga-sidebar__logout"
                icon={LogOut}
                size="sm"
                iconSize={14}
                label={t('sidebar.logout')}
                onClick={onLogout}
              />
            ) : null}
          </div>
        ) : null}
        {onToggleCollapsed ? (
          <IconButton
            icon={collapsed ? PanelLeftOpen : PanelLeftClose}
            size="sm"
            iconSize={14}
            label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
            aria-expanded={!collapsed}
            onClick={onToggleCollapsed}
          />
        ) : null}
      </div>
    </aside>
  );
}
