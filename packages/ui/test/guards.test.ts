import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { ENTITY_COLORS, SPACING_SCALE } from '../src/tokens/index.ts';
import { listFiles, read, rel, UI_SRC, WEB_SRC } from './support/files.ts';

const css = (): string[] => [...listFiles(UI_SRC, /\.css$/), ...listFiles(WEB_SRC, /\.css$/)];
const sources = (): string[] => [...listFiles(UI_SRC, /\.(ts|tsx)$/), ...listFiles(WEB_SRC, /\.(ts|tsx)$/)];
const stripCssComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '');

describe('token = STD-07 §8 (bộ token mặc định)', () => {
  // biome đổi nháy đơn → kép trong CSS: so sánh không phụ thuộc kiểu nháy
  const tokens = read(join(UI_SRC, 'tokens', 'tokens.css')).replaceAll('"', "'");
  const block = (sel: string): string => {
    const start = tokens.indexOf(sel);
    expect(start, sel).toBeGreaterThanOrEqual(0);
    return tokens.slice(start, tokens.indexOf('\n}\n', start));
  };
  const val = (b: string, name: string): string => {
    const m = new RegExp(`--ga-${name}:\\s*([^;]+);`).exec(b);
    if (!m) throw new Error(`thiếu token --ga-${name}`);
    return (m[1] as string).trim().toLowerCase();
  };

  it('dark mặc định: nền, viền, chữ, accent, Document, 5 màu trạng thái đúng từng giá trị', () => {
    const dark = block(":root,\n:root[data-theme='dark']");
    const expected: Record<string, string> = {
      'bg-canvas': '#111012',
      'bg-surface': '#18171a',
      'bg-raised': '#201f23',
      'bg-sunken': '#0c0b0d',
      'border-subtle': '#26252a',
      'border-strong': '#34333a',
      'text-primary': '#eceae6',
      'text-secondary': '#a8a49d',
      'text-muted': '#8a857e',
      accent: '#e8a33d',
      'accent-soft': '#e8a33d1a',
      'doc-paper': '#f3eee3',
      'doc-ink': '#2a2622',
      'doc-seal': '#a4362b',
      ok: '#4cb782',
      info: '#6fa8dc',
      warn: '#e8c547',
      danger: '#e5604d',
      idle: '#8a8580',
      'wound-ring': '#6b6862',
      'wound-text': '#b4bfcc',
      'wound-dot': '#8a97a8',
      'wound-tear': '#8fb3d9',
      'bg-grid-id': '#141316',
    };
    for (const [name, hex] of Object.entries(expected)) expect(val(dark, name), name).toBe(hex);
  });

  it('light: nền / viền / chữ / accent đúng bảng STD-07', () => {
    const light = block(":root[data-theme='light']");
    const expected: Record<string, string> = {
      'bg-canvas': '#f6f4ef',
      'bg-surface': '#fff',
      'bg-raised': '#fbfaf7',
      'bg-sunken': '#efece5',
      'border-subtle': '#e6e2d9',
      'border-strong': '#d3cec2',
      'text-primary': '#1c1b1e',
      'text-secondary': '#5e5a53',
      'text-muted': '#8e897f',
      accent: '#b9741a',
      'accent-soft': '#b9741a14',
    };
    for (const [name, hex] of Object.entries(expected)) expect(val(light, name), name).toBe(hex);
  });

  it('12 màu nhận diện thực thể khớp bản TS và có lớp .ga-entity-*', () => {
    expect(Object.keys(ENTITY_COLORS)).toHaveLength(12);
    const base = read(join(UI_SRC, 'tokens', 'base.css'));
    for (const [name, hex] of Object.entries(ENTITY_COLORS)) {
      expect(tokens.toLowerCase()).toContain(`--ga-entity-${name}: ${hex.toLowerCase()};`);
      expect(base).toContain(`.ga-entity-${name}`);
    }
  });

  it('thang khoảng cách, cỡ chữ (không có chữ > 20px), khung 216 / 44 / 48 / 36 / 28 / 380 / 400', () => {
    for (const [i, px] of [
      [1, 4],
      [2, 8],
      [3, 12],
      [4, 16],
      [6, 24],
      [8, 32],
    ] as const) {
      expect(tokens).toContain(`--ga-sp-${i}: ${px}px;`);
    }
    expect([...SPACING_SCALE]).toEqual([4, 8, 12, 16, 24, 32]);
    const sizes = [...tokens.matchAll(/--ga-fs-[a-z]+:\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(Math.max(...sizes)).toBeLessThanOrEqual(20);
    for (const [name, px] of Object.entries({
      'sidebar-w': 216,
      'header-h': 44,
      'page-h': 48,
      'tabbar-h': 36,
      'row-h': 28,
      'toolbar-h': 36,
      'formula-h': 32,
      'panel-chat': 380,
      'panel-inspector': 400,
      'nav-item-h': 30,
      'rail-w': 56,
    })) {
      expect(tokens, name).toContain(`--ga-${name}: ${px}px;`);
    }
  });
});

describe('thang khoảng cách duy nhất 4·8·12·16·24·32 (STD-07 §4)', () => {
  const ALLOWED = new Set<number>([0, 1, ...SPACING_SCALE]); // 1px chỉ để bù viền (margin -1px của thanh tab)
  const PROP =
    /(?:^|[;{\s])((?:padding|margin)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?|gap|row-gap|column-gap)\s*:\s*([^;}]+)/g;

  it('mọi padding / margin / gap trong CSS nằm trong thang', () => {
    const bad: string[] = [];
    for (const file of css()) {
      for (const m of stripCssComments(read(file)).matchAll(PROP)) {
        const value = (m[2] as string).replace(/var\(--ga-sp-(\d+)\)/g, (_, n: string) => {
          const px = ({ '0': 0, '1': 4, '2': 8, '3': 12, '4': 16, '6': 24, '8': 32 } as Record<string, number>)[n];
          if (px === undefined) bad.push(`${rel(file)}: var(--ga-sp-${n}) không tồn tại`);
          return `${px ?? 0}px`;
        });
        for (const num of value.matchAll(/(-?\d*\.?\d+)(px|em|rem|%|vw|vh)?/g)) {
          const unit = num[2];
          const n = Math.abs(Number(num[1]));
          if (n === 0) continue;
          if (unit === 'vh' || unit === 'vw') continue; // vị trí theo khung nhìn (palette cách đỉnh 1/3 màn), không phải token khoảng cách
          if (unit !== 'px' || !ALLOWED.has(n)) bad.push(`${rel(file)}: ${m[1]}: ${(m[2] as string).trim()}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('bộ bắt còn sống: giá trị ngoài thang bị phát hiện', () => {
    const sample = '.x{padding:0 10px;gap:6px;margin:0 0 -1px}';
    const hits = [...sample.matchAll(PROP)].filter((m) =>
      [...(m[2] as string).matchAll(/(-?\d*\.?\d+)px/g)].some((n) => !ALLOWED.has(Math.abs(Number(n[1])))),
    );
    expect(hits.map((h) => h[1])).toEqual(['padding', 'gap']);
  });
});

describe("CSP chặt: default-src 'self'; style-src 'self' — không style nội tuyến, không eval, không tài nguyên ngoài", () => {
  it('mã nguồn không dùng thẻ <style>, thuộc tính style chuỗi, setAttribute(style), cssText, innerHTML, eval, new Function', () => {
    const bad: string[] = [];
    const rules: [string, RegExp][] = [
      ['thẻ <style>', /<style[\s>]/],
      ['style="…" chuỗi', /\bstyle\s*=\s*["'`]/],
      ['setAttribute style', /setAttribute\(\s*['"]style['"]/],
      ['cssText', /\.cssText\b/],
      ['innerHTML / outerHTML / insertAdjacentHTML', /\b(?:innerHTML|outerHTML|insertAdjacentHTML)\b/],
      ['dangerouslySetInnerHTML', /dangerouslySetInnerHTML/],
      ['eval', /\beval\s*\(/],
      ['new Function', /new\s+Function\s*\(/],
      ['document.write', /document\.write\s*\(/],
    ];
    for (const file of sources()) {
      const code = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      for (const [name, re] of rules) if (re.test(code)) bad.push(`${rel(file)}: ${name}`);
    }
    expect(bad).toEqual([]);
  });

  it('CSS không @import ngoài, không url() tới http(s) hay data:, không expression()', () => {
    const bad: string[] = [];
    for (const file of css()) {
      const c = stripCssComments(read(file));
      if (/@import\b/.test(c)) bad.push(`${rel(file)}: @import`);
      if (/url\(\s*['"]?(?:https?:|\/\/|data:)/i.test(c)) bad.push(`${rel(file)}: url() ngoài / data:`);
      if (/expression\s*\(/i.test(c)) bad.push(`${rel(file)}: expression()`);
    }
    expect(bad).toEqual([]);
  });

  it('prop style của React chỉ được truyền biến CSS (--ga-…), không thuộc tính trực tiếp', () => {
    const bad: string[] = [];
    for (const file of sources().filter((f) => f.endsWith('.tsx'))) {
      const sf = ts.createSourceFile(file, read(file), ts.ScriptTarget.ES2023, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node): void => {
        if (ts.isJsxAttribute(node) && node.name.getText() === 'style') {
          const init = node.initializer;
          const expr = init && ts.isJsxExpression(init) ? init.expression : undefined;
          // cho phép: style={zoneStyle} (biến đã dựng bằng CSSProperties có khoá `--`), hoặc literal đối tượng chỉ có khoá `--…`
          if (expr && ts.isObjectLiteralExpression(expr)) {
            for (const p of expr.properties) {
              const name = ts.isPropertyAssignment(p) ? p.name.getText().replace(/['"]/g, '') : '';
              if (!name.startsWith('--')) bad.push(`${rel(file)}: style={{ ${name} }}`);
            }
          } else if (expr && !ts.isIdentifier(expr)) {
            bad.push(`${rel(file)}: style={${expr.getText().slice(0, 30)}}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    expect(bad).toEqual([]);
  });

  it('font tự host: mọi @font-face trỏ tới tệp woff2 có thật, không CDN', () => {
    const fontsCss = read(join(UI_SRC, 'tokens', 'fonts.css')).replaceAll('"', "'");
    const urls = [...fontsCss.matchAll(/url\(['"]([^'"]+)['"]\)/g)].map((m) => m[1] as string);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) {
      expect(u).toMatch(/^\.\/fonts\/[a-z0-9-]+\.woff2$/);
      expect(() => readFileSync(join(UI_SRC, 'tokens', u))).not.toThrow();
    }
    // 3 họ font, mỗi họ có subset vietnamese (STD-07: verify glyph tiếng Việt) và latin-ext (có ₲ U+20B2)
    for (const fam of ['IBM Plex Sans', 'IBM Plex Mono', 'Newsreader']) {
      const faces = fontsCss.split('@font-face').filter((b) => b.includes(`'${fam}'`));
      expect(
        faces.some((b) => b.includes('vietnamese')),
        fam,
      ).toBe(true);
      expect(
        faces.some((b) => /U\+20A0-20AB,\s*U\+20AD-20C0/.test(b)),
        fam,
      ).toBe(true);
    }
  });
});

describe('mọi chữ hiển thị qua i18n (CNS-179)', () => {
  const LETTER = /\p{L}/u;
  const ATTRS = new Set([
    'aria-label',
    'title',
    'placeholder',
    'alt',
    'aria-description',
    'aria-valuetext',
    'aria-roledescription',
  ]);

  it('JSX không chứa chữ ghi cứng: không JsxText có chữ, không thuộc tính hiển thị là chuỗi có chữ', () => {
    const bad: string[] = [];
    for (const file of sources().filter((f) => f.endsWith('.tsx'))) {
      const sf = ts.createSourceFile(file, read(file), ts.ScriptTarget.ES2023, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node): void => {
        if (ts.isJsxText(node) && LETTER.test(node.getText())) {
          bad.push(`${rel(file)}: văn bản JSX "${node.getText().trim().slice(0, 40)}"`);
        }
        if (ts.isJsxAttribute(node) && ATTRS.has(node.name.getText())) {
          const init = node.initializer;
          if (init && ts.isStringLiteral(init) && LETTER.test(init.text)) {
            bad.push(`${rel(file)}: ${node.name.getText()}="${init.text}"`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    expect(bad).toEqual([]);
  });

  it('bộ bắt còn sống: JSX có chữ ghi cứng bị phát hiện', () => {
    const sf = ts.createSourceFile(
      'x.tsx',
      '<button aria-label="Đóng">Lưu</button>',
      ts.ScriptTarget.ES2023,
      true,
      ts.ScriptKind.TSX,
    );
    const found: string[] = [];
    const visit = (n: ts.Node): void => {
      if (ts.isJsxText(n) && LETTER.test(n.getText())) found.push('text');
      if (ts.isJsxAttribute(n) && ATTRS.has(n.name.getText()) && n.initializer && ts.isStringLiteral(n.initializer))
        found.push('attr');
      ts.forEachChild(n, visit);
    };
    visit(sf);
    expect(found).toEqual(['attr', 'text']);
  });
});
