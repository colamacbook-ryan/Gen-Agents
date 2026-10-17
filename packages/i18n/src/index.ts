// i18n lõi (không phụ thuộc React): một nguồn chữ giao diện duy nhất (FRONTEND-SPEC §1.8, CNS-179).
//   - API / view DB trả KHOÁ + tham số (`i18nKey`, `reason`, `state`…); giao diện chọn chuỗi theo khoá. Không đọc chữ từ view DB.
//   - `t(key)` có kiểu: khoá sai là lỗi biên dịch. `tr(key)` nhận khoá từ API (chuỗi tự do): khoá lạ ⇒ báo `onMissingKey` rồi
//     rơi về chuỗi dự phòng (không bao giờ in khoá thô ra màn hình).
import { createInstance } from 'i18next';
import en from '../en.json' with { type: 'json' };
import vi from '../vi.json' with { type: 'json' };
import type { I18nParams, Leaves } from './keys.ts';

export { flattenMessages, type I18nParams, type Leaves, placeholdersOf } from './keys.ts';

export const LOCALES = ['vi', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'vi';

/** Mọi khoá hợp lệ — suy ra từ vi.json (vi là bản gốc; en chỉ được có tập con). */
export type I18nKey = Leaves<typeof vi>;

export type Translator = (key: I18nKey, params?: I18nParams) => string;

export interface I18n {
  readonly locale: Locale;
  setLocale(locale: Locale): void;
  /** Dịch theo khoá có kiểu. */
  readonly t: Translator;
  /** Dịch khoá lấy từ API. Khoá không có trong bảng ⇒ `onMissingKey`, rồi dùng `fallbackKey` (mặc định `errors.unknown`). */
  tr(key: string, params?: I18nParams, fallbackKey?: I18nKey): string;
  has(key: string): boolean;
  /** Đăng ký nghe đổi ngôn ngữ; trả hàm huỷ. */
  subscribe(listener: () => void): () => void;
  /** Đối tượng i18next bên dưới (cho react-i18next). */
  readonly raw: ReturnType<typeof createInstance>;
}

export interface CreateI18nOptions {
  locale?: Locale;
  /** Gọi khi `tr()` gặp khoá lạ — để app ghi log; mặc định im lặng (khoá lạ là lỗi dữ liệu, không phải lỗi người dùng). */
  onMissingKey?: (key: string) => void;
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function createI18n(opts: CreateI18nOptions = {}): I18n {
  const raw = createInstance();
  const initial = opts.locale ?? DEFAULT_LOCALE;
  // initAsync:false + resources trong bộ nhớ ⇒ init đồng bộ, `t` dùng được ngay sau khi trả về.
  void raw.init({
    lng: initial,
    fallbackLng: DEFAULT_LOCALE,
    resources: { vi: { translation: vi }, en: { translation: en } },
    interpolation: { prefix: '{', suffix: '}', escapeValue: false },
    returnNull: false,
    initAsync: false,
    keySeparator: '.',
    nsSeparator: false,
  });

  const listeners = new Set<() => void>();
  raw.on('languageChanged', () => {
    for (const l of listeners) l();
  });

  const translate = (key: string, params?: I18nParams): string => String(raw.t(key, params ?? {}));
  const has = (key: string): boolean => raw.exists(key);

  return {
    get locale() {
      return isLocale(raw.language) ? raw.language : DEFAULT_LOCALE;
    },
    setLocale(locale) {
      void raw.changeLanguage(locale);
    },
    t: (key, params) => translate(key, params),
    tr(key, params, fallbackKey = 'errors.unknown') {
      if (has(key)) return translate(key, params);
      opts.onMissingKey?.(key);
      return translate(fallbackKey);
    },
    has,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    raw,
  };
}

export * from './format.ts';
