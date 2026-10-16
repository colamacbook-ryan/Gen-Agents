import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAPABILITY_KINDS } from '../src/index.ts';

// "Không hardcode" (STD-10, INT-05, BUILD-PLAN §D.2): ngoài src/adapters không có tên CLI / model (luật lint của repo,
// chạy lại ngay trong test của gói); trong adapter không có danh sách model / mức effort / cửa sổ quota viết cứng.

const PKG = join(import.meta.dirname, '..');
const ROOT = join(PKG, '..', '..');
const patterns = JSON.parse(readFileSync(join(PKG, 'test', 'fixtures', 'no-hardcode.json'), 'utf8')) as {
  modelIdPatterns: string[];
  effortLiterals: string[];
  quotaLiterals: string[];
  baitName: string;
};

interface Rule {
  id: string;
  global?: boolean;
  applies(rel: string): boolean;
  check(rel: string, text: string): Array<{ line: number; msg: string }>;
  warnOnly?: (rel: string) => boolean;
}

async function lintModule(): Promise<{ RULES: Rule[]; stripJsComments(src: string): string }> {
  const path = join(ROOT, 'scripts', 'lint-rules.mjs');
  return (await import(path)) as { RULES: Rule[]; stripJsComments(src: string): string };
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const abs = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

const files = walk(PKG).map((abs) => ({ abs, rel: relative(ROOT, abs).split('\\').join('/') }));

describe('luật lint của repo trên @ga/engines', () => {
  it('mọi luật theo tệp (gồm no-model-cli-names, no-redos-regex, no-secret-env-names) ⇒ 0 vi phạm', async () => {
    const { RULES } = await lintModule();
    const violations: string[] = [];
    for (const rule of RULES.filter((r) => !r.global)) {
      for (const f of files) {
        if (!rule.applies(f.rel)) continue;
        for (const v of rule.check(f.rel, readFileSync(f.abs, 'utf8'))) {
          if (!rule.warnOnly?.(f.rel)) violations.push(`${f.rel}:${v.line} [${rule.id}] ${v.msg}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('luật tên CLI còn sống: tên CLI ngoài src/adapters (src khác + test) bị bắt; trong src/adapters được miễn', async () => {
    const { RULES } = await lintModule();
    const rule = RULES.find((r) => r.id === 'no-model-cli-names');
    expect(rule).toBeDefined();
    const bait = `export const x = '${patterns.baitName}';\n`;
    for (const rel of [
      'packages/engines/src/failover.ts',
      'packages/engines/test/bait.test.ts',
      'apps/runner/src/x.ts',
    ]) {
      expect(rule?.applies(rel), rel).toBe(true);
      expect(rule?.check(rel, bait).length, rel).toBe(1);
    }
    expect(rule?.applies('packages/engines/src/adapters/x/index.ts')).toBe(false);
  });
});

describe('adapter không viết cứng danh sách model / effort / quota (STD-10)', () => {
  const adapterSources = files.filter(
    (f) => f.rel.startsWith('packages/engines/src/adapters/') && f.rel.endsWith('.ts'),
  );

  it('có quét đúng các tệp adapter', () => {
    expect(adapterSources.length).toBeGreaterThanOrEqual(6);
  });

  it('không có id / bí danh model trong mã adapter (bỏ chú thích)', async () => {
    const { stripJsComments } = await lintModule();
    const res = patterns.modelIdPatterns.map((p) => new RegExp(p, 'i'));
    for (const f of adapterSources) {
      const code = stripJsComments(readFileSync(f.abs, 'utf8'));
      for (const re of res) expect(re.exec(code)?.[0] ?? null, `${f.rel} ~ ${re}`).toBeNull();
    }
  });

  it('không có chuỗi mức effort / cửa sổ quota viết cứng trong mã adapter', async () => {
    const { stripJsComments } = await lintModule();
    for (const f of adapterSources) {
      const code = stripJsComments(readFileSync(f.abs, 'utf8'));
      for (const lit of [...patterns.effortLiterals, ...patterns.quotaLiterals]) {
        for (const q of ["'", '"', '`'])
          expect(code.includes(`${q}${lit}${q}`), `${f.rel}: ${q}${lit}${q}`).toBe(false);
      }
    }
  });
});

describe('khoá registry khớp DB', () => {
  it('CAPABILITY_KINDS = CHECK capabilities.kind của baseline SQL (vendor DB)', () => {
    const sql = readFileSync(join(ROOT, 'packages', 'db', 'migrations', 'sqlite', '0001_baseline.sql'), 'utf8');
    const start = sql.indexOf('CREATE TABLE capabilities');
    expect(start).toBeGreaterThan(0);
    const body = sql.slice(start, sql.indexOf(');', start));
    const m = /kind TEXT NOT NULL CHECK \(kind IN \(([^)]*)\)\)/.exec(body);
    expect(m).not.toBeNull();
    const kinds = (m?.[1] ?? '').split(',').map((s) => s.trim().replaceAll("'", ''));
    expect([...CAPABILITY_KINDS]).toEqual(kinds);
  });
});
