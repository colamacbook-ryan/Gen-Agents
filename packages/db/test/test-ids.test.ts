// Hằng id trong test phải là ULID hợp lệ (Crockford: không I, L, O, U) — TENANT_WS từng chứa "I" mà không test nào bắt
// vì write() không kiểm workspace (bài học CNS-170). Kiểm cả export của helpers lẫn mọi literal dạng id trong test.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ULID_RE } from '@ga/contracts';
import { describe, expect, it } from 'vitest';
import * as helpers from './helpers.ts';

const PACKAGES = fileURLToPath(new URL('../../', import.meta.url));

function testFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) testFiles(p, out);
    else if (/\.ts$/.test(name) && /(^|\/)test\//.test(relative(PACKAGES, p))) out.push(p);
  }
  return out;
}

describe('id trong test là ULID hợp lệ', () => {
  it('mọi hằng chuỗi export của test/helpers.ts', () => {
    const ids = Object.entries(helpers).filter(([, v]) => typeof v === 'string');
    expect(ids.length).toBeGreaterThan(0);
    for (const [name, v] of ids) expect(ULID_RE.test(v as string), `${name} = ${v}`).toBe(true);
  });

  it("mọi literal '<26 ký tự [0-9A-Z] bắt đầu bằng số>' trong test của packages/*", () => {
    const bad: string[] = [];
    let seen = 0;
    for (const f of testFiles(PACKAGES)) {
      for (const m of readFileSync(f, 'utf8').matchAll(/'([0-9][0-9A-Z]{25})'/g)) {
        seen++;
        if (!ULID_RE.test(m[1] as string)) bad.push(`${relative(PACKAGES, f)}: ${m[1]}`);
      }
    }
    expect(seen).toBeGreaterThan(10);
    expect(bad).toEqual([]);
  });
});
