import { LOCALES, type Locale } from '@ga/i18n';
import { useI18n } from '@ga/i18n/react';
import { InsecureTransportBanner } from '@ga/ui/primitives';
import type { ReactNode } from 'react';
import { saveLocale } from '../../locale-store.ts';
import './auth-layout.css';

/** Khung chung của G1 và đổi mật khẩu lần đầu: dải HTTP (nếu có) · khối giữa 360px · chân màn (version + VI | EN). */
export function AuthLayout({ children }: { children: ReactNode }) {
  const { t, locale, setLocale } = useI18n();
  const version = import.meta.env.VITE_GA_VERSION ?? '0.0.0';
  const choose = (next: Locale) => {
    setLocale(next);
    saveLocale(next);
  };
  return (
    <div className="ga-auth">
      <InsecureTransportBanner />
      <main className="ga-auth__main">
        <div className="ga-auth__col">
          <div className="ga-auth__brand">
            <span className="ga-auth__mark" aria-hidden="true" />
            <span className="ga-auth__name">{t('brand.name')}</span>
          </div>
          <p className="ga-auth__tagline">{t('brand.tagline')}</p>
          {children}
        </div>
      </main>
      <footer className="ga-auth__foot">
        <span className="ga-auth__version">{t('auth.login.version', { version })}</span>
        <fieldset className="ga-auth__lang">
          <legend className="ga-sr-only">{t('auth.login.language')}</legend>
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={locale === l}
              aria-label={t(`locale.name.${l}`)}
              onClick={() => choose(l)}
            >
              {t(`locale.short.${l}`)}
            </button>
          ))}
        </fieldset>
      </footer>
    </div>
  );
}
