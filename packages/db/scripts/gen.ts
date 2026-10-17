// pnpm db:gen [--check]
// Từ DB spec (db/spec/schema_v2_2.sql + manifest SYNC.json — nguồn = repo từ DB v2.3.4) sinh:
//   packages/db/migrations/sqlite/0001_baseline.sql   — CHỈ bảng + index (+ bảng ảo FTS5)          [CNS-157]
//   packages/db/migrations/sqlite/R__triggers.sql     — mọi trigger, đúng thứ tự tạo (thứ tự = thứ tự chạy)
//   packages/db/migrations/sqlite/R__views.sql        — mọi view, đúng thứ tự tạo (view phụ thuộc view)
//   packages/db/src/generated/sync.ts                 — rev, version, danh sách hàm app_* (hợp đồng kết nối)
//   packages/db/src/generated/schema.ts               — kiểu Kysely sinh từ PRAGMA table_xinfo + union từ CHECK … IN (…)
//   packages/db/src/generated/enums.ts                — các union đó ở dạng giá trị (test đối chiếu contracts ↔ DB)
// --check: không ghi gì, thoát 1 nếu tệp nào lệch (CI).
// Nguồn đối tượng = sqlite_master của DB dựng bằng chính SQL đã vendor ⇒ văn bản từng câu lệnh giữ nguyên byte.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { renderObject, type SqlObject } from '../src/runner/files.ts';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, '..');
const root = join(pkg, '..', '..');
const specDir = join(root, 'db', 'spec');
const check = process.argv.includes('--check');

interface Sync {
  rev: string;
  database_version: string;
  app_functions: string[];
  files: Record<string, { sha256: string }>;
}
const sync = JSON.parse(readFileSync(join(specDir, 'SYNC.json'), 'utf8')) as Sync;
const rev7 = sync.rev.slice(0, 7);
const sourceSql = readFileSync(join(specDir, 'schema_v2_2.sql'), 'utf8');

const db = new Database(':memory:');
// hàm app_* chỉ cần TỒN TẠI để SQLite biên dịch view khi đọc cột (giá trị không dùng ở đây)
for (const fn of sync.app_functions) db.function(fn, { varargs: true, deterministic: false }, () => null);
db.exec(sourceSql);

type MasterRow = { type: string; name: string; tbl_name: string; sql: string | null };
const master = db.prepare('SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY rowid').all() as MasterRow[];
const tableKinds = new Map(
  (
    db.prepare("SELECT name, type FROM pragma_table_list WHERE schema = 'main'").all() as Array<{
      name: string;
      type: string;
    }>
  ).map((r) => [r.name, r.type]),
);

const baseline: SqlObject[] = [];
const triggers: SqlObject[] = [];
const views: SqlObject[] = [];
for (const r of master) {
  if (r.sql === null || r.name.startsWith('sqlite_')) continue; // autoindex
  if (r.type === 'table') {
    const kind = tableKinds.get(r.name);
    if (kind === 'shadow') continue; // bảng phụ do CREATE VIRTUAL TABLE tự tạo
    baseline.push({ type: 'table', name: r.name, sql: r.sql });
  } else if (r.type === 'index') baseline.push({ type: 'index', name: r.name, sql: r.sql });
  else if (r.type === 'trigger') triggers.push({ type: 'trigger', name: r.name, sql: r.sql });
  else if (r.type === 'view') views.push({ type: 'view', name: r.name, sql: r.sql });
}

const generatedBy = `GENERATED bởi \`pnpm db:gen\` từ db/spec/schema_v2_2.sql (nguồn = repo, DB v${sync.database_version}) — KHÔNG SỬA TAY.`;
const outputs = new Map<string, string>();

outputs.set(
  'migrations/sqlite/0001_baseline.sql',
  [
    '-- kind: standard',
    '-- compat_min_app_version: 0.0.0',
    '-- expand_only: false',
    '-- breaking: baseline — trước v0.1.0 được sinh lại khi DB spec đổi; từ v0.1.0 forward-only (BUILD-PLAN §D.4)',
    `-- ${generatedBy}`,
    '-- Chỉ bảng + index (+ bảng ảo FTS5). Trigger ở R__triggers.sql, view ở R__views.sql (CNS-157).',
    '',
    baseline.map(renderObject).join('\n'),
  ].join('\n'),
);
outputs.set(
  'migrations/sqlite/R__triggers.sql',
  [
    '-- repeatable: triggers',
    `-- ${generatedBy}`,
    '-- Thứ tự tạo = thứ tự chạy ngược (SQLite chạy trigger tạo sau trước): giữ nguyên thứ tự này.',
    `-- ${triggers.length} trigger. Runner DROP mọi trigger rồi tạo lại sau mỗi lượt migration (DATABASE §10.1).`,
    '',
    triggers.map(renderObject).join('\n'),
  ].join('\n'),
);
outputs.set(
  'migrations/sqlite/R__views.sql',
  [
    '-- repeatable: views',
    `-- ${generatedBy}`,
    `-- ${views.length} view, theo thứ tự tạo (view sau có thể đọc view trước). Trigger KHÔNG được SELECT từ view.`,
    '',
    views.map(renderObject).join('\n'),
  ].join('\n'),
);

// ---------------------------------------------------------------- sync.ts
outputs.set(
  'src/generated/sync.ts',
  `// ${generatedBy}
export const SYNC = {
  rev: ${JSON.stringify(sync.rev)},
  databaseVersion: ${JSON.stringify(sync.database_version)},
  /** Hàm SQL mà schema gọi — mọi kết nối phải đăng ký đủ (hợp đồng ⑥-05). */
  appFunctions: ${JSON.stringify(sync.app_functions)} as readonly string[],
  counts: { tables: ${baseline.filter((o) => o.type === 'table' && tableKinds.get(o.name) === 'table').length}, virtualTables: ${baseline.filter((o) => tableKinds.get(o.name) === 'virtual').length}, indexes: ${baseline.filter((o) => o.type === 'index').length}, triggers: ${triggers.length}, views: ${views.length} },
} as const;
`,
);

// ---------------------------------------------------------------- kiểu Kysely
type XInfo = { name: string; type: string; notnull: number; dflt_value: string | null; pk: number; hidden: number };
const ident = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const key = (k: string) => (ident.test(k) ? k : JSON.stringify(k));
const pascal = (n: string) =>
  n
    .split('_')
    .filter(Boolean)
    .map((p) => p[0]?.toUpperCase() + p.slice(1))
    .join('');

function enumsOf(createSql: string): Map<string, Array<string | number>> {
  const out = new Map<string, Array<string | number>>();
  const parseList = (list: string): Array<string | number> | null => {
    const items = list.split(',').map((s) => s.trim());
    const vals: Array<string | number> = [];
    for (const it of items) {
      if (/^'(?:[^']|'')*'$/.test(it)) vals.push(it.slice(1, -1).replaceAll("''", "'"));
      else if (/^-?\d+$/.test(it)) vals.push(Number(it));
      else return null;
    }
    return vals;
  };
  const pats = [/CHECK \((\w+) IN \(([^()]*)\)\)/g, /CHECK \((\w+) IS NULL OR (\w+) IN \(([^()]*)\)\)/g];
  for (const m of createSql.matchAll(pats[0] as RegExp)) {
    const vals = parseList(m[2] as string);
    if (vals) out.set(m[1] as string, vals);
  }
  for (const m of createSql.matchAll(pats[1] as RegExp)) {
    if (m[1] !== m[2]) continue;
    const vals = parseList(m[3] as string);
    if (vals) out.set(m[1] as string, vals);
  }
  return out;
}

function baseType(decl: string): string {
  const t = decl.toUpperCase();
  if (t === '') return 'SqlValue';
  if (t.includes('INT')) return 'number';
  if (t.includes('CHAR') || t.includes('CLOB') || t.includes('TEXT')) return 'string';
  if (t.includes('BLOB')) return 'Buffer';
  if (t.includes('REAL') || t.includes('FLOA') || t.includes('DOUB')) return 'number';
  return 'number | string';
}

const lit = (v: string | number) =>
  typeof v === 'number' ? String(v) : `'${v.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

const tableNames = baseline
  .filter((o) => o.type === 'table')
  .map((o) => o.name)
  .sort();
const viewNames = views.map((v) => v.name).sort();
const enumEntries: Array<[string, Array<string | number>]> = [];
const lines: string[] = [
  `// ${generatedBy}`,
  '// Bảng: Generated<T> khi cột có DEFAULT hoặc là INTEGER PRIMARY KEY; union từ CHECK (col IN (…)).',
  '// View: chỉ đọc (ColumnType<T, never, never>); cột biểu thức không có kiểu khai báo ⇒ SqlValue.',
  "import type { ColumnType, Generated } from 'kysely';",
  '',
  'export type SqlValue = string | number | bigint | Buffer | null;',
  '',
];
for (const t of tableNames) {
  const createSql = (master.find((r) => r.type === 'table' && r.name === t)?.sql ?? '') as string;
  const enums = enumsOf(createSql);
  const cols = (db.prepare('SELECT * FROM pragma_table_xinfo(?)').all(t) as XInfo[]).filter((c) => c.hidden === 0);
  const pkCount = cols.filter((c) => c.pk > 0).length;
  lines.push(`export interface ${pascal(t)} {`);
  for (const c of cols) {
    const e = enums.get(c.name);
    if (e) enumEntries.push([`${t}.${c.name}`, e]);
    let ty = e ? e.map(lit).join(' | ') : baseType(c.type);
    const nullable = c.notnull === 0 && c.pk === 0;
    if (nullable) ty = `${ty} | null`;
    const rowidAlias = c.pk > 0 && pkCount === 1 && c.type.toUpperCase() === 'INTEGER';
    if (c.dflt_value !== null || rowidAlias) ty = `Generated<${ty}>`;
    lines.push(`  ${key(c.name)}: ${ty};`);
  }
  lines.push('}', '');
}
for (const v of viewNames) {
  const cols = db.prepare('SELECT * FROM pragma_table_xinfo(?)').all(v) as XInfo[];
  lines.push(`/** view (chỉ đọc) */`, `export interface ${pascal(v)} {`);
  for (const c of cols) lines.push(`  ${key(c.name)}: ColumnType<${baseType(c.type)} | null, never, never>;`);
  lines.push('}', '');
}
lines.push('export interface DB {');
for (const t of tableNames) lines.push(`  ${key(t)}: ${pascal(t)};`);
for (const v of viewNames) lines.push(`  ${key(v)}: ${pascal(v)};`);
lines.push('}', '');
lines.push(`export const TABLES = ${JSON.stringify(tableNames)} as const;`);
lines.push(`export const VIEWS = ${JSON.stringify(viewNames)} as const;`, '');
outputs.set('src/generated/schema.ts', lines.join('\n'));

enumEntries.sort((a, b) => a[0].localeCompare(b[0]));
outputs.set(
  'src/generated/enums.ts',
  [
    `// ${generatedBy}`,
    '// Union giá trị từ CHECK (col IN (…)) của từng bảng — test đối chiếu enum của @ga/contracts với DB.',
    'export const DB_ENUMS = {',
    ...enumEntries.map(([k, v]) => `  ${JSON.stringify(k)}: [${v.map(lit).join(', ')}],`),
    '} as const satisfies Record<string, readonly (string | number)[]>;',
    '',
  ].join('\n'),
);

// ---------------------------------------------------------------- ghi / kiểm
let stale = 0;
for (const [rel, content] of outputs) {
  const path = join(pkg, rel);
  let current: string | null = null;
  try {
    current = readFileSync(path, 'utf8');
  } catch {
    current = null;
  }
  if (current === content) continue;
  if (check) {
    stale++;
    process.stdout.write(`✗ ${relative(root, path)} lệch db/spec (chạy pnpm db:gen)\n`);
  } else {
    writeFileSync(path, content);
    process.stdout.write(`✓ ghi ${relative(root, path)}\n`);
  }
}
const summary = `${baseline.filter((o) => o.type === 'table').length} bảng (gồm bảng ảo), ${baseline.filter((o) => o.type === 'index').length} index, ${triggers.length} trigger, ${views.length} view, ${enumEntries.length} union enum — rev ${rev7}`;
if (check && stale > 0) {
  process.stdout.write(`✗ db:gen --check: ${stale} tệp lệch\n`);
  process.exit(1);
}
process.stdout.write(`${check ? '✓ db:gen --check khớp' : '✓ db:gen xong'}: ${summary}\n`);
