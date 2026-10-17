// Rào ranh giới (bổ sung cho lint import-boundaries — lint cho phép dynamic import ở mọi nơi):
//   - mã production `src/**` không nhắc tới testkit / handler demo;
//   - handler demo / test không nằm trong PRODUCTION_HANDLERS.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PRODUCTION_HANDLERS } from '../../src/http/handlers.ts';
import { DEMO_HANDLERS } from '../http/demo-handlers.ts';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe('ranh giới test ↔ production', () => {
  it('src/** không import / nhắc tới @ga/testkit, demo-handlers, harness', () => {
    const bad = files(SRC)
      .filter((f) => /\.[cm]?[jt]s$/.test(f))
      .filter((f) => /@ga\/testkit|packages\/testkit|demo-handlers|test\/http\/harness/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f));
    expect(bad).toEqual([]);
  });

  it('PRODUCTION_HANDLERS không chứa handler demo', () => {
    const demo = new Set<unknown>(DEMO_HANDLERS);
    expect(PRODUCTION_HANDLERS.filter((h) => demo.has(h))).toEqual([]);
    const demoRuns = new Set<unknown>(DEMO_HANDLERS.map((h) => h.run));
    expect(PRODUCTION_HANDLERS.filter((h) => demoRuns.has(h.run))).toEqual([]);
  });
});
