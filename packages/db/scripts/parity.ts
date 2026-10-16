// Parity (BUILD-PLAN §C.4): DB dựng bằng runner TS (0001_baseline + R__triggers + R__views) phải KHỚP 100%
// sqlite_master của DB do Python dựng từ chính SQL đã vendor (cách bộ test 94 ca nạp schema): bảng, index, trigger, view.
// So từng đối tượng (type, name, tbl_name, sql) theo đúng thứ tự tạo trong mỗi loại — thứ tự trigger quyết định thứ tự chạy.
// Chạy: node packages/db/scripts/parity.ts   (pnpm db:test gọi sau bộ test Python)

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openScratch } from '../src/connection.ts';
import { migrate, SQLITE_MIGRATIONS_DIR } from '../src/runner/index.ts';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const SPEC_SQL = join(root, 'db', 'spec', 'schema_v2_2.sql');

export interface MasterRow {
  type: string;
  name: string;
  tbl_name: string;
  sql: string | null;
}

export interface ParityReport {
  ok: boolean;
  counts: Record<string, { ts: number; py: number }>;
  diffs: string[];
  sameGlobalOrder: boolean;
  pythonSqlite: string;
  tsSqlite: string;
}

const PY_DUMP = `
import json, sqlite3, sys
db = sqlite3.connect(':memory:', isolation_level=None)
db.execute('PRAGMA foreign_keys=ON'); db.execute('PRAGMA recursive_triggers=ON')
db.create_function('app_maint', 0, lambda: 0, deterministic=False)
db.create_function('app_now', 0, lambda: '2026-10-15T08:00:00.000Z', deterministic=False)
db.create_function('app_local_time', 2, lambda ts, tz: None, deterministic=True)
db.executescript(open(sys.argv[1], encoding='utf-8').read())
rows = [dict(type=t, name=n, tbl_name=tb, sql=s) for t, n, tb, s in db.execute('SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY rowid')]
print(json.dumps(dict(sqlite=sqlite3.sqlite_version, rows=rows), ensure_ascii=False))
`;

export function pythonMaster(): { sqlite: string; rows: MasterRow[] } {
  const out = execFileSync('python3', ['-I', '-c', PY_DUMP, SPEC_SQL], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out) as { sqlite: string; rows: MasterRow[] };
}

export function runnerMaster(): { sqlite: string; rows: MasterRow[] } {
  const conn = openScratch({ clock: { now: () => new Date('2026-10-15T08:00:00.000Z') } });
  try {
    migrate(conn, { dir: SQLITE_MIGRATIONS_DIR, appVersion: '0.0.0' });
    const rows = conn.db
      .prepare('SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY rowid')
      .all() as MasterRow[];
    const sqlite = (conn.db.prepare('SELECT sqlite_version() AS v').get() as { v: string }).v;
    return { sqlite, rows };
  } finally {
    conn.close();
  }
}

const TYPES = ['table', 'index', 'trigger', 'view'] as const;

export function compareMasters(
  ts: MasterRow[],
  py: MasterRow[],
): Pick<ParityReport, 'ok' | 'counts' | 'diffs' | 'sameGlobalOrder'> {
  const diffs: string[] = [];
  const counts: ParityReport['counts'] = {};
  for (const type of TYPES) {
    const a = ts.filter((r) => r.type === type);
    const b = py.filter((r) => r.type === type);
    counts[type] = { ts: a.length, py: b.length };
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const x = a[i];
      const y = b[i];
      if (!x || !y) {
        diffs.push(`${type} #${i}: chỉ có ở ${x ? 'TS' : 'Python'} (${(x ?? y)?.name})`);
        continue;
      }
      if (x.name !== y.name || x.tbl_name !== y.tbl_name) {
        diffs.push(`${type} #${i}: TS ${x.name}(${x.tbl_name}) ≠ Python ${y.name}(${y.tbl_name})`);
      } else if (x.sql !== y.sql) {
        diffs.push(`${type} ${x.name}: văn bản SQL khác`);
      }
      if (diffs.length > 20) break;
    }
  }
  const key = (r: MasterRow) => `${r.type}:${r.name}`;
  const sameGlobalOrder = ts.length === py.length && ts.every((r, i) => key(r) === key(py[i] as MasterRow));
  return { ok: diffs.length === 0, counts, diffs, sameGlobalOrder };
}

export function runParity(): ParityReport {
  const ts = runnerMaster();
  const py = pythonMaster();
  return { ...compareMasters(ts.rows, py.rows), pythonSqlite: py.sqlite, tsSqlite: ts.sqlite };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = runParity();
  const c = r.counts;
  const line = `bảng ${c.table?.ts} · index ${c.index?.ts} (gồm autoindex) · trigger ${c.trigger?.ts} (đúng thứ tự) · view ${c.view?.ts}`;
  if (r.ok) {
    process.stdout.write(
      `parity: OK — sqlite_master runner TS ≡ Python: ${line}; thứ tự toàn cục ${r.sameGlobalOrder ? 'trùng' : 'khác (chỉ khác giữa các loại)'} — SQLite TS ${r.tsSqlite} / Python ${r.pythonSqlite}\n`,
    );
  } else {
    process.stdout.write(`parity: FAIL — ${r.diffs.length} khác biệt (${JSON.stringify(c)})\n`);
    for (const d of r.diffs) process.stdout.write(`  - ${d}\n`);
    process.exit(1);
  }
}
