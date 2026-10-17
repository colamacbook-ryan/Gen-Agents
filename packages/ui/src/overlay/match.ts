// So khớp chữ không phân biệt hoa thường và dấu ("tung" khớp "Tùng") bằng Intl.Collator — không dùng .normalize (lint no-raw-normalize).
const collators = new Map<string, Intl.Collator>();

function collator(locale: string): Intl.Collator {
  let c = collators.get(locale);
  if (!c) {
    c = new Intl.Collator(locale, { sensitivity: 'base', usage: 'search' });
    collators.set(locale, c);
  }
  return c;
}

/** `needle` có nằm trong `haystack` (bỏ qua hoa thường + dấu) không. Rỗng thì luôn khớp. Chi phí O(n·m), n,m nhỏ (nhãn, ID). */
export function matchesBase(haystack: string, needle: string, locale = 'vi'): boolean {
  const n = needle.trim();
  if (n === '') return true;
  const c = collator(locale);
  const hs = Array.from(haystack);
  const ns = Array.from(n);
  if (ns.length > hs.length) return false;
  for (let i = 0; i + ns.length <= hs.length; i++) {
    if (c.compare(hs.slice(i, i + ns.length).join(''), ns.join('')) === 0) return true;
  }
  return false;
}

/** Vị trí khớp đầu tiên (theo chỉ số trong chuỗi UTF-16) và độ dài đoạn khớp trong `haystack`; không khớp ⇒ null. Dùng để tô sáng. */
export function findBase(haystack: string, needle: string, locale = 'vi'): { index: number; length: number } | null {
  const n = needle.trim();
  if (n === '') return null;
  const c = collator(locale);
  const hs = Array.from(haystack);
  const ns = Array.from(n);
  const target = ns.join('');
  for (let i = 0; i + ns.length <= hs.length; i++) {
    const part = hs.slice(i, i + ns.length).join('');
    if (c.compare(part, target) === 0) return { index: hs.slice(0, i).join('').length, length: part.length };
  }
  return null;
}
