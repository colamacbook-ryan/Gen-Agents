import { useI18n } from '@ga/i18n/react';
import type { ReactNode } from 'react';
import { PageChromeProvider } from './page-header.tsx';
import './app-shell.css';

export interface AppShellProps {
  sidebar: ReactNode;
  header: ReactNode;
  /** dải mảnh dưới header (mất kết nối realtime…) */
  strip?: ReactNode;
  /** page header 2 tầng (bỏ trống ở màn không cần) */
  pageHeader?: ReactNode;
  /** log drawer đáy */
  drawer?: ReactNode;
  children: ReactNode;
}

/** Khung mọi màn trừ Onboarding: sidebar | (header · strip · page header · nội dung · log drawer). */
export function AppShell({ sidebar, header, strip, pageHeader, drawer, children }: AppShellProps) {
  const { t } = useI18n();
  return (
    <PageChromeProvider>
      <div className="ga-shell">
        <a className="ga-skip" href="#ga-main">
          {t('a11y.skipToContent')}
        </a>
        {sidebar}
        <div className="ga-shell__content">
          {header}
          {strip}
          {pageHeader}
          <main id="ga-main" className="ga-shell__main" tabIndex={-1}>
            {children}
          </main>
          {drawer}
        </div>
      </div>
    </PageChromeProvider>
  );
}
