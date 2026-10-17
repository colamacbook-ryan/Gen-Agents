// Kiểu khoá i18n suy ra từ vi.json (nguồn gốc của tập khoá): `t('nav.overview')` sai khoá là lỗi biên dịch.

type Primitive = string | number | boolean | null;

/** Mọi đường dẫn lá của một cây JSON lồng nhau, nối bằng dấu chấm. */
export type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends Primitive
    ? `${Prefix}${K}`
    : T[K] extends readonly unknown[]
      ? never
      : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Tham số nội suy: `{name}` trong chuỗi. Chỉ chuỗi / số (React tự thoát khi render, nên không thoát HTML ở đây). */
export type I18nParams = Readonly<Record<string, string | number>>;

/** Duyệt cây JSON → bản phẳng `{ "a.b.c": "chữ" }`. Giá trị không phải chuỗi là lỗi (kiểm ở check.ts). */
export function flattenMessages(tree: unknown, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (tree === null || typeof tree !== 'object' || Array.isArray(tree)) return out;
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix === '' ? k : `${prefix}.${k}`;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flattenMessages(v, key));
    else out[key] = v;
  }
  return out;
}

/** Tên các `{tham_số}` xuất hiện trong một chuỗi, theo thứ tự xuất hiện, không lặp. */
export function placeholdersOf(message: string): string[] {
  const seen: string[] = [];
  for (const m of message.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) {
    const name = m[1] as string;
    if (!seen.includes(name)) seen.push(name);
  }
  return seen;
}
