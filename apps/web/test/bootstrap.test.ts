import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('bootstrap: z.config({ jitless: true }) TRƯỚC mọi module dựng schema zod (CSP chặt, không unsafe-eval)', () => {
  it('main.tsx: import đầu tiên là ./bootstrap/zod.ts và bootstrap/zod.ts đặt jitless', () => {
    const src = readFileSync(join(WEB, 'src', 'main.tsx'), 'utf8');
    const sf = ts.createSourceFile('main.tsx', src, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TSX);
    const imports = sf.statements
      .filter(ts.isImportDeclaration)
      .map((s) => (s.moduleSpecifier as ts.StringLiteral).text);
    expect(imports[0]).toBe('./bootstrap/zod.ts');
    const boot = readFileSync(join(WEB, 'src', 'bootstrap', 'zod.ts'), 'utf8');
    expect(boot).toMatch(/z\.config\(\s*\{\s*jitless:\s*true\s*\}\s*\)/);
  });

  // Chạy trong tiến trình con (Node 22.18+ bỏ kiểu .ts): thay `Function` bằng bản ném lỗi và đếm số lần zod dò `new Function`.
  const probe = (jitless: boolean): { probes: number } => {
    const code = `
      const real = globalThis.Function;
      let probes = 0;
      globalThis.Function = new Proxy(real, { construct() { probes += 1; throw new EvalError('unsafe-eval bị chặn'); } });
      ${jitless ? "const { z } = await import('zod'); z.config({ jitless: true });" : ''}
      await import('@ga/contracts');
      globalThis.Function = real;
      process.stdout.write(JSON.stringify({ probes }));
    `;
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', code], { cwd: WEB, encoding: 'utf8' });
    return JSON.parse(out) as { probes: number };
  };

  it('ca âm (bộ bắt còn sống): KHÔNG đặt jitless thì nạp @ga/contracts gọi `new Function` — dưới CSP đây là vi phạm', () => {
    expect(probe(false).probes).toBeGreaterThan(0);
  });

  it('đặt jitless trước ⇒ nạp @ga/contracts không gọi `new Function` lần nào', () => {
    expect(probe(true).probes).toBe(0);
  });
});
