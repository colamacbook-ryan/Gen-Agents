// Ranh giới CSP: svg() dạng chuỗi mang style="…" nội tuyến nên chỉ nằm ở subpath `@ga/chibi/testing`. Export chính chỉ có mount() và đường strict.
// apps/** và mã nguồn (src/) của mọi package KHÔNG được import subpath đó. (Đề xuất luật lint-rules tương đương: xem báo cáo lane.)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as main from '../src/index.ts';
import * as testing from '../src/testing.ts';

const PKG = resolve(import.meta.dirname, '..');
const REPO = resolve(PKG, '..', '..');

/** có import / require / dynamic import tới subpath testing của chibi không (chú thích đã bị bỏ trước khi quét) */
function importsChibiTesting(code: string): boolean {
  const src = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
  return /['"`](?:@ga\/chibi\/testing|@ga\/chibi\/src\/testing(?:\.ts)?|(?:\.{1,2}\/)+(?:packages\/)?chibi\/src\/testing(?:\.ts)?)['"`]/.test(
    src,
  );
}

const CODE_EXT = /\.(?:[cm]?[jt]sx?|vue|svelte|astro|html)$/;
const SKIP_DIR = new Set(['node_modules', 'dist', '.next', '.turbo', 'coverage', '.git']);
function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (CODE_EXT.test(name)) out.push(p);
  }
  return out;
}

describe('svg() dạng chuỗi chỉ ở @ga/chibi/testing', () => {
  it('export chính không có svg() (cả hàm lẫn Chibi.svg); mount() và đường strict có', () => {
    expect('svg' in main).toBe(false);
    expect('svg' in main.Chibi).toBe(false);
    expect(typeof main.mount).toBe('function');
    expect(typeof testing.svg).toBe('function');
  });

  it('package.json: "." không trỏ vào testing, "./testing" trỏ src/testing.ts, index.ts không nhắc tới testing', () => {
    const pj = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')) as { exports: Record<string, string> };
    expect(pj.exports['.']).toBe('./src/index.ts');
    expect(pj.exports['./testing']).toBe('./src/testing.ts');
    const idx = readFileSync(join(PKG, 'src', 'index.ts'), 'utf8');
    expect(idx).not.toMatch(/testing/);
  });

  it('bộ quét thật sự bắt được (mồi): 6 kiểu import testing bị bắt, 5 import hợp lệ không bị báo nhầm', () => {
    const bad = [
      `import { svg } from '@ga/chibi/testing';`,
      `import { svg } from "@ga/chibi/testing";`,
      `const t = await import('@ga/chibi/testing');`,
      `const t = require('@ga/chibi/testing');`,
      `import { svg } from '../../packages/chibi/src/testing.ts';`,
      `import { svg } from '@ga/chibi/src/testing';`,
    ];
    for (const b of bad) expect(importsChibiTesting(b), b).toBe(true);
    const ok = [
      `import { mount } from '@ga/chibi';`,
      `import { validate } from '@ga/chibi/schema';`,
      `import { evaluateIdentity } from '@ga/chibi/identity';`,
      `// import { svg } from '@ga/chibi/testing'  (chỉ là chú thích)`,
      `import { testing } from './testing.ts';`,
    ];
    for (const g of ok) expect(importsChibiTesting(g), g).toBe(false);
  });

  it('apps/** không import @ga/chibi/testing', () => {
    const hits = walk(join(REPO, 'apps')).filter((f) => importsChibiTesting(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });

  it('mã nguồn src/ của mọi package không import @ga/chibi/testing (chỉ test/ và scripts của chibi được dùng)', () => {
    const pkgs = readdirSync(join(REPO, 'packages'));
    const own = join(PKG, 'src', 'testing.ts');
    const hits = pkgs
      .flatMap((p) => walk(join(REPO, 'packages', p, 'src')))
      .filter((f) => f !== own)
      .filter((f) => importsChibiTesting(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});
