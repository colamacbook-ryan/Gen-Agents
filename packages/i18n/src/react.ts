// Gắn i18n vào React: `<I18nProvider>` + `useT()` / `useI18n()`. Component chỉ nhận chữ qua khoá (xem test no-literal-text của @ga/ui).
import { createContext, createElement, type ReactNode, useCallback, useContext, useSyncExternalStore } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { I18n, I18nKey, Locale, Translator } from './index.ts';
import { createI18n } from './index.ts';
import type { I18nParams } from './keys.ts';

const Ctx = createContext<I18n | null>(null);

export function I18nProvider(props: { i18n: I18n; children?: ReactNode }): ReactNode {
  return createElement(
    Ctx.Provider,
    { value: props.i18n },
    createElement(I18nextProvider, { i18n: props.i18n.raw }, props.children),
  );
}

export interface UseI18n {
  locale: Locale;
  setLocale(locale: Locale): void;
  t: Translator;
  tr(key: string, params?: I18nParams, fallbackKey?: I18nKey): string;
  has(key: string): boolean;
}

/** Ngoài `<I18nProvider>` (vd test đơn lẻ) dùng một bản vi mặc định, dựng một lần. */
let standalone: I18n | null = null;
const fallback = (): I18n => {
  standalone ??= createI18n();
  return standalone;
};

export function useI18n(): UseI18n {
  const i18n = useContext(Ctx) ?? fallback();
  // đổi ngôn ngữ ⇒ re-render mọi component dùng hook
  const locale = useSyncExternalStore(
    i18n.subscribe,
    () => i18n.locale,
    () => i18n.locale,
  );
  const setLocale = useCallback((l: Locale) => i18n.setLocale(l), [i18n]);
  return {
    locale,
    setLocale,
    t: i18n.t,
    tr: (key, params, fallbackKey) => i18n.tr(key, params, fallbackKey),
    has: (key) => i18n.has(key),
  };
}

export function useT(): Translator {
  return useI18n().t;
}
