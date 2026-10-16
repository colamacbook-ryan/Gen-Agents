#!/usr/bin/env node
// tsconfig.json gốc phải tham chiếu MỌI project TS của workspace (packages/*, apps/*, testing/… theo pnpm-workspace.yaml)
// — thiếu thì `tsc -b` bỏ qua project đó và merge vẫn xanh dù có lỗi kiểu (đã xảy ra với apps/runner).
//   node scripts/tsconfig-refs.mjs --check   lệch ⇒ in danh sách, thoát 1 (chạy trong `pnpm typecheck`)
//   node scripts/tsconfig-refs.mjs --write   ghi lại "references" (sắp theo đường dẫn)
//   --root <dir>                              repo khác (test)
// Không phụ thuộc gói ngoài.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Glob `packages:` của pnpm-workspace.yaml (chỉ dạng `dir/*` hoặc đường cố định — đủ cho repo này). */
export function workspaceGlobs(root) {
  const text = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
  const out = [];
  let inPackages = false;
  for (const line of text.split('\n')) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      const m = /^\s+-\s+['"]?([^'"#\s]+)['"]?\s*(?:#.*)?$/.exec(line);
      if (m) out.push(m[1]);
      else if (/^\S/.test(line)) inPackages = false;
    }
  }
  return out;
}

/** Thư mục project TS (có tsconfig.json) theo glob workspace, đường tương đối dùng '/'. */
export function workspaceProjects(root) {
  const dirs = new Set();
  for (const g of workspaceGlobs(root)) {
    if (g.endsWith('/*')) {
      const base = g.slice(0, -2);
      if (!existsSync(join(root, base))) continue;
      for (const name of readdirSync(join(root, base))) {
        const rel = `${base}/${name}`;
        if (statSync(join(root, rel)).isDirectory() && existsSync(join(root, rel, 'tsconfig.json'))) dirs.add(rel);
      }
    } else if (!g.includes('*') && existsSync(join(root, g, 'tsconfig.json'))) {
      dirs.add(g.replace(/\/$/, ''));
    } else if (g.includes('*')) {
      throw new Error(`glob workspace chưa hỗ trợ: ${g}`);
    }
  }
  return [...dirs].sort();
}

export function referencedProjects(root) {
  const ts = JSON.parse(readFileSync(join(root, 'tsconfig.json'), 'utf8'));
  return (ts.references ?? []).map((r) => r.path.replace(/^\.\//, '').replace(/\/$/, '')).sort();
}

/** Ghi theo đúng dáng biome format (độ rộng 120): mảng reference một dòng nếu vừa, không thì mỗi phần tử một dòng. */
export function formatTsconfig(ts) {
  const lines = Object.entries(ts).map(([k, v]) => {
    if (k !== 'references') return `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`;
    const items = v.map((r) => `{ "path": ${JSON.stringify(r.path)} }`);
    const one = `  "references": [${items.join(', ')}]`;
    return one.length <= 120 ? one : `  "references": [\n${items.map((i) => `    ${i}`).join(',\n')}\n  ]`;
  });
  return `{\n${lines.join(',\n')}\n}\n`;
}

function main() {
  const args = process.argv.slice(2);
  const ri = args.indexOf('--root');
  const root = ri >= 0 ? resolve(args[ri + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const want = workspaceProjects(root);
  const have = referencedProjects(root);
  const missing = want.filter((p) => !have.includes(p));
  const extra = have.filter((p) => !want.includes(p));
  if (args.includes('--write')) {
    const path = join(root, 'tsconfig.json');
    const ts = JSON.parse(readFileSync(path, 'utf8'));
    ts.references = want.map((p) => ({ path: p }));
    writeFileSync(path, formatTsconfig(ts));
    console.log(`✓ tsconfig.json: ${want.length} reference (${want.join(', ')})`);
    return 0;
  }
  if (missing.length || extra.length) {
    console.log('✗ tsconfig.json gốc lệch workspace — chạy `pnpm tsconfig:refs`:');
    for (const p of missing) console.log(`  + thiếu ${p}`);
    for (const p of extra) console.log(`  - thừa ${p} (không phải project workspace có tsconfig.json)`);
    return 1;
  }
  console.log(`✓ tsconfig.json tham chiếu đủ ${want.length} project workspace`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main());
