import { useT } from '@ga/i18n/react';
import { Info, OctagonX, TriangleAlert, X } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { IconButton } from './button.tsx';
import { Icon } from './icon.tsx';
import './warning-banner.css';

export type BannerTone = 'info' | 'warn' | 'danger';

export interface BannerAck {
  label: ReactNode;
  checked: boolean;
  onChange(checked: boolean): void;
}

export interface WarningBannerProps {
  tone: BannerTone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  /** có thì hiện nút đóng. Cảnh báo pháp lý / chế độ khắc phục phải `blocking` (không đóng được). */
  onDismiss?: () => void;
  /** không đóng được (điều khoản, chế độ khắc phục): bỏ qua `onDismiss` */
  blocking?: boolean;
  /** điều khoản: checkbox bắt buộc */
  ack?: BannerAck;
  /** dải mảnh sát mép (không bo góc) */
  strip?: boolean;
}

const ICON = { info: Info, warn: TriangleAlert, danger: OctagonX } as const;

export function WarningBanner({ tone, title, children, actions, onDismiss, blocking, ack, strip }: WarningBannerProps) {
  const t = useT();
  const ackId = useId();
  const canDismiss = onDismiss !== undefined && !blocking;
  const cls = ['ga-banner', `ga-banner--${tone}`, strip && 'ga-banner--strip'].filter(Boolean).join(' ');
  return (
    <div className={cls} role={tone === 'danger' ? 'alert' : 'status'}>
      <span className="ga-banner__icon">
        <Icon icon={ICON[tone]} size={16} />
      </span>
      <div className="ga-banner__body">
        {title ? <div className="ga-banner__title">{title}</div> : null}
        {children ? <div className="ga-banner__text">{children}</div> : null}
        {ack ? (
          <label className="ga-banner__ack" htmlFor={ackId}>
            <input
              id={ackId}
              type="checkbox"
              checked={ack.checked}
              onChange={(e) => ack.onChange(e.currentTarget.checked)}
            />
            <span>{ack.label}</span>
          </label>
        ) : null}
      </div>
      {actions || canDismiss ? (
        <div className="ga-banner__actions">
          {actions}
          {canDismiss ? (
            <IconButton icon={X} size="sm" iconSize={14} label={t('common.dismiss')} onClick={onDismiss} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** HTTP không mã hoá: localhost / loopback là bối cảnh an toàn của trình duyệt nên không cảnh báo. */
export function isInsecureTransport(loc: { protocol: string; hostname: string }): boolean {
  if (loc.protocol !== 'http:') return false;
  const h = loc.hostname.toLowerCase();
  return !(
    h === 'localhost' ||
    h === '::1' ||
    h === '[::1]' ||
    /^127(?:\.\d{1,3}){3}$/.test(h) ||
    h.endsWith('.localhost')
  );
}

/** Dải `warn` khi truy cập qua HTTP không mã hoá (FRONTEND-SPEC G1; khuyến nghị bật TLS ở edge). */
export function InsecureTransportBanner({ location }: { location?: { protocol: string; hostname: string } }) {
  const t = useT();
  const loc = location ?? (typeof window === 'undefined' ? undefined : window.location);
  if (!loc || !isInsecureTransport(loc)) return null;
  return (
    <WarningBanner tone="warn" strip blocking title={t('banner.http.title')}>
      {t('banner.http.body')}
    </WarningBanner>
  );
}
