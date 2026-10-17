// Phân tích CSS tối thiểu (đếm ngoặc) cho các kiểm tra tĩnh về animation.
export interface Block {
  /** phần đầu (selector hoặc at-rule) */
  head: string;
  body: string;
}

/** tách các khối cấp ngoài cùng của một đoạn CSS */
export function blocks(css: string): Block[] {
  const out: Block[] = [];
  let depth = 0;
  let start = 0;
  let headStart = 0;
  let head = '';
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '{') {
      if (depth === 0) {
        head = css.slice(headStart, i).trim();
        start = i + 1;
      }
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) {
        out.push({ head, body: css.slice(start, i) });
        headStart = i + 1;
      }
    }
  }
  return out;
}

/** gỡ chú thích CSS */
export const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** phần CSS nằm NGOÀI mọi @media (prefers-reduced-motion: no-preference) */
export function outsideNoPreference(css: string): string {
  return blocks(stripComments(css))
    .filter((b) => !/^@media\s*\(prefers-reduced-motion:\s*no-preference\)/.test(b.head))
    .map((b) => `${b.head}{${b.body}}`)
    .join('\n');
}

/** mọi @keyframes (kể cả lồng trong @media): tên → thân */
export function keyframes(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (src: string): void => {
    for (const b of blocks(src)) {
      const m = /^@keyframes\s+([\w-]+)/.exec(b.head);
      if (m) out[m[1] as string] = b.body;
      else if (b.head.startsWith('@media')) walk(b.body);
    }
  };
  walk(stripComments(css));
  return out;
}
