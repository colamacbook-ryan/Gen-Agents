import { DEFAULT_LOCALE, isLocale, type Locale } from '@ga/i18n';

const KEY = 'ga.locale';

/** Ngôn ngữ đã chọn lần trước (tuỳ chọn giao diện, không nhạy cảm). Đọc lỗi ⇒ dùng mặc định và báo qua console.warn. */
export function loadLocale(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Locale {
  try {
    const v = storage?.getItem(KEY);
    return isLocale(v) ? v : DEFAULT_LOCALE;
  } catch (error) {
    console.warn('không đọc được ngôn ngữ đã lưu', error);
    return DEFAULT_LOCALE;
  }
}

export function saveLocale(
  locale: Locale,
  storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage,
): void {
  try {
    storage?.setItem(KEY, locale);
  } catch (error) {
    console.warn('không lưu được ngôn ngữ đã chọn', error);
  }
}
