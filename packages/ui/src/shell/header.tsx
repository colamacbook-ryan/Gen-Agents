import { useI18n } from '@ga/i18n/react';
import { Bell, Search, WifiOff } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { IconButton } from '../primitives/button.tsx';
import { Icon } from '../primitives/icon.tsx';
import { Kbd } from '../primitives/kbd.tsx';
import { formatCombo } from '../primitives/shortcuts.tsx';
import { useShellLink } from './link.tsx';
import './header.css';

export interface Crumb {
  label: string;
  to?: string;
}

export interface HeaderProps {
  breadcrumb: readonly Crumb[];
  onOpenPalette(): void;
  /** trạng thái hệ thống: chấm + chữ (đã dịch). Không truyền ⇒ không hiện (chưa có dữ liệu thật thì không bịa). */
  status?: { tone: 'ok' | 'warn' | 'danger' | 'idle'; label: string };
  /** vd "3/7 đang chạy" */
  runningText?: string;
  quota?: { tone?: 'warn' | 'danger'; label: string; title?: string };
  bell: { count: number; onClick(): void };
  /** chèn thêm vào cụm bên phải (trước chuông) */
  extra?: ReactNode;
}

/** Header 44px: breadcrumb · ô ⌘K 320px · cụm trạng thái bên phải (hệ thống, đang chạy, quota thấp nhất, chuông). */
export function Header({ breadcrumb, onOpenPalette, status, runningText, quota, bell, extra }: HeaderProps) {
  const { t } = useI18n();
  const Link = useShellLink();
  return (
    <header className="ga-header">
      <nav aria-label={t('a11y.breadcrumb')}>
        <ol className="ga-crumbs">
          {breadcrumb.map((c, i) => {
            const last = i === breadcrumb.length - 1;
            return (
              <Fragment key={c.to ?? c.label}>
                <li className="ga-crumbs__item" aria-current={last ? 'page' : undefined}>
                  {c.to && !last ? <Link to={c.to}>{c.label}</Link> : c.label}
                  {last ? null : (
                    <span className="ga-crumbs__sep" aria-hidden="true">
                      /
                    </span>
                  )}
                </li>
              </Fragment>
            );
          })}
        </ol>
      </nav>
      <button type="button" className="ga-header__search" onClick={onOpenPalette} aria-haspopup="dialog">
        <Icon icon={Search} size={14} />
        <span className="ga-header__search-text">{t('header.search')}</span>
        <Kbd>{formatCombo('mod+k')}</Kbd>
      </button>
      <div className="ga-header__right">
        {status ? (
          <span className="ga-header__status">
            <span className={`ga-header__dot ga-header__dot--${status.tone}`} aria-hidden="true" />
            {status.label}
          </span>
        ) : null}
        {runningText ? (
          <>
            <span className="ga-header__sep" aria-hidden="true" />
            <span className="ga-mono">{runningText}</span>
          </>
        ) : null}
        {quota ? (
          <span className={quota.tone ? `ga-quota ga-quota--${quota.tone}` : 'ga-quota'} title={quota.title}>
            {quota.label}
          </span>
        ) : null}
        {extra}
        <span className="ga-header__bell">
          <IconButton
            icon={Bell}
            label={t('header.notifications', { count: bell.count })}
            onClick={bell.onClick}
            aria-haspopup="dialog"
          />
          {bell.count > 0 ? (
            <span className="ga-header__bell-count" aria-hidden="true">
              {bell.count > 99 ? '99+' : bell.count}
            </span>
          ) : null}
        </span>
      </div>
    </header>
  );
}

/** Mất kết nối realtime: dải mảnh dưới header (STD-07 §10). */
export function ConnectionStrip({ lost }: { lost: boolean }) {
  const { t } = useI18n();
  if (!lost) return null;
  return (
    <div className="ga-conn-strip" role="status">
      <Icon icon={WifiOff} size={14} />
      {t('header.connectionLost')}
    </div>
  );
}
