import { useI18n } from '@ga/i18n/react';
import { PanelBottom, PanelBottomOpen } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { Icon } from '../primitives/icon.tsx';
import { Kbd } from '../primitives/kbd.tsx';
import { formatCombo } from '../primitives/shortcuts.tsx';
import './log-drawer.css';

export interface LogDrawerProps {
  open: boolean;
  onToggle(): void;
  /** thân drawer (thường là <LogStream>) — chỉ dựng khi mở */
  children: ReactNode;
}

/** Log drawer đáy vùng nội dung (⌘J), thu gọn mặc định: một thanh 28px; mở ra cao 240px. */
export function LogDrawer({ open, onToggle, children }: LogDrawerProps) {
  const { t } = useI18n();
  const id = useId();
  return (
    <section className="ga-logdrawer" aria-label={t('log.drawerTitle')}>
      <div className="ga-logdrawer__bar">
        <button
          type="button"
          className="ga-logdrawer__toggle"
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
        >
          <Icon icon={open ? PanelBottomOpen : PanelBottom} size={14} />
          {open ? t('log.drawerClose') : t('log.drawerOpen')}
          <Kbd>{formatCombo('mod+j')}</Kbd>
        </button>
      </div>
      {open ? (
        <div id={id} className="ga-logdrawer__body">
          {children}
        </div>
      ) : null}
    </section>
  );
}
