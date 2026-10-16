// `pnpm test` cũng chạy selftest của lint-rules: mỗi luật phải bắt đúng mồi của nó (BUILD-PLAN §D.6).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RULES, runRules, stripJsComments } from '../lint-rules.mjs';

const script = fileURLToPath(new URL('../lint-rules.mjs', import.meta.url));

describe('lint-rules', () => {
  it('--selftest: mọi luật bắt đúng mồi, không báo nhầm', () => {
    const out = execFileSync(process.execPath, [script, '--selftest'], { encoding: 'utf8' });
    expect(out).toContain(`${RULES.length}/${RULES.length} luật bắt đúng mồi`);
    expect(RULES.map((r) => r.id)).toEqual(
      expect.arrayContaining([
        'no-or-replace',
        'no-model-cli-names',
        'no-owner-name',
        'no-secret-env-names',
        'no-console-log',
        'dockerode-only-in-supervisor',
        'no-io-in-transaction',
        'no-redos-regex',
        'db-write-only-via-write',
        'no-duplicate-component-names',
        'import-boundaries',
        'engine-plans-only-in-runner',
        'db-privileged-api-paths',
        'db-actor-columns-from-context',
      ]),
    );
  });

  it('repo hiện tại sạch (0 vi phạm)', () => {
    const root = fileURLToPath(new URL('../..', import.meta.url));
    const { errors } = runRules(root, {
      exclude: (rel) => rel.startsWith('scripts/lint-fixtures/') || rel.startsWith('scripts/license-fixtures/'),
    });
    expect(errors).toEqual([]);
  });

  it('bỏ chú thích không cắt nhầm // trong chuỗi, giữ số dòng', () => {
    const src = "const u = 'http://x'; // OR REPLACE\n/* REPLACE INTO */ const v = 1;\n";
    const out = stripJsComments(src);
    expect(out).toContain("'http://x'");
    expect(out).not.toMatch(/REPLACE/);
    expect(out.split('\n')).toHaveLength(src.split('\n').length);
  });
});
