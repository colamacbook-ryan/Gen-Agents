import { dayKey, formatClock, formatDateTime } from '@ga/i18n';
import { useI18n } from '@ga/i18n/react';
import { Bell, Clock, Download, Droplet, Gauge, Inbox, type LucideIcon, Repeat, TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '../primitives/button.tsx';
import { EmptyState } from '../primitives/empty-state.tsx';
import { Icon } from '../primitives/icon.tsx';
import { Drawer } from './modal.tsx';
import './notification-center.css';

/** Loại thông báo (FRONTEND-SPEC §2.5 O2). */
export type NotificationKind = 'wound' | 'deadline' | 'fallback' | 'quota' | 'core_incident' | 'update' | 'proposal';

const KIND_ICON: Record<NotificationKind, LucideIcon> = {
  wound: Droplet,
  deadline: Clock,
  fallback: Repeat,
  quota: Gauge,
  core_incident: TriangleAlert,
  update: Download,
  proposal: Inbox,
};

const KIND_TONE: Partial<Record<NotificationKind, 'warn' | 'danger'>> = {
  quota: 'warn',
  deadline: 'warn',
  core_incident: 'danger',
};

export interface NotificationItem {
  /** mã thông báo (NT-…), mono, hiện ở dòng phụ */
  id: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  at: Date;
  read: boolean;
}

export interface NotificationCenterProps {
  open: boolean;
  onClose(): void;
  items: readonly NotificationItem[];
  /** "bây giờ" (inject để test); mặc định đồng hồ máy */
  now?: Date;
  /** múi giờ workspace (không hardcode, STD-06) */
  timeZone?: string;
  onMarkAllRead?(): void;
  onOpenItem?(item: NotificationItem): void;
}

/** O2 Trung tâm thông báo: drawer phải 400px, gom "Hôm nay" / "Trước đó" theo ngày lịch của múi giờ workspace. */
export function NotificationCenter({
  open,
  onClose,
  items,
  now,
  timeZone,
  onMarkAllRead,
  onOpenItem,
}: NotificationCenterProps) {
  const { t, locale } = useI18n();
  const fmtOpts = useMemo(() => (timeZone ? { timeZone } : {}), [timeZone]);
  const { today, earlier } = useMemo(() => {
    const todayKey = dayKey(now ?? new Date(), fmtOpts);
    const sorted = [...items].sort((a, b) => b.at.getTime() - a.at.getTime());
    return {
      today: sorted.filter((i) => dayKey(i.at, fmtOpts) === todayKey),
      earlier: sorted.filter((i) => dayKey(i.at, fmtOpts) !== todayKey),
    };
  }, [items, now, fmtOpts]);
  const unread = items.filter((i) => !i.read).length;

  const renderGroup = (title: string, list: NotificationItem[], withDate: boolean) =>
    list.length === 0 ? null : (
      <section aria-label={title}>
        <h3 className="ga-notes__group-title">{title}</h3>
        <ul className="ga-notes__list">
          {list.map((n) => {
            const tone = KIND_TONE[n.kind];
            const cls = ['ga-note', tone && `ga-note--${tone}`, !n.read && 'ga-note--unread'].filter(Boolean).join(' ');
            return (
              <li key={n.id} className={cls}>
                <span className="ga-note__icon">
                  <Icon icon={KIND_ICON[n.kind]} size={16} />
                </span>
                <div className="ga-note__body">
                  {onOpenItem ? (
                    <button type="button" className="ga-note__title ga-note__link" onClick={() => onOpenItem(n)}>
                      {n.title}
                    </button>
                  ) : (
                    <div className="ga-note__title">{n.title}</div>
                  )}
                  {n.body ? <div className="ga-note__text">{n.body}</div> : null}
                  <div className="ga-note__meta">
                    <time dateTime={n.at.toISOString()}>
                      {withDate ? formatDateTime(n.at, locale, fmtOpts) : formatClock(n.at, locale, fmtOpts)}
                    </time>
                    <span>{n.id}</span>
                  </div>
                </div>
                {!n.read ? <span className="ga-note__dot" role="img" aria-label={t('notifications.unread')} /> : null}
              </li>
            );
          })}
        </ul>
      </section>
    );

  return (
    <Drawer open={open} onClose={onClose} title={t('notifications.title')}>
      {items.length === 0 ? (
        <EmptyState
          illustration="desk"
          title={t('notifications.emptyTitle')}
          description={t('notifications.emptyBody')}
        />
      ) : (
        <div className="ga-notes">
          <div className="ga-notes__head">
            <span>{t('notifications.unreadCount', { count: unread })}</span>
            {onMarkAllRead ? (
              <Button size="sm" variant="ghost" icon={Bell} disabled={unread === 0} onClick={onMarkAllRead}>
                {t('notifications.markAllRead')}
              </Button>
            ) : null}
          </div>
          {renderGroup(t('notifications.today'), today, false)}
          {renderGroup(t('notifications.earlier'), earlier, true)}
        </div>
      )}
    </Drawer>
  );
}
