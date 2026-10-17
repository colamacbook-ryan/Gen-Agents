// Bảng trong RAM cho fake store (M2 viết test trước khi repo SQLite xong). Hình dạng hàng lấy từ CHÍNH baseline SQL
// (cột + DEFAULT) ⇒ hàng fake có đủ cột như DB. Fake KHÔNG ép trigger / CHECK của DB: test guard phải chạy trên SQLite.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SQLITE_MIGRATIONS_DIR } from '../../runner/index.ts';

type Value = string | number | null | Buffer;
export type MemRow = Record<string, Value>;

interface ColumnDef {
  name: string;
  /** 'now' = DEFAULT (strftime(... 'now')). */
  def: Value | 'now' | undefined;
}

let cachedSchema: Map<string, ColumnDef[]> | null = null;

const COLUMN_RE = /^ {2}([a-z_][a-z0-9_]*) (TEXT|INTEGER|REAL|BLOB)\b(.*)$/;
const DEFAULT_RE = /\bDEFAULT ('(?:[^']|'')*'|-?\d+(?:\.\d+)?|\(strftime\()/;

/** Cột + DEFAULT của mọi bảng thường trong baseline (bảng ảo FTS bỏ qua). */
export function baselineSchema(): Map<string, ColumnDef[]> {
  if (cachedSchema) return cachedSchema;
  const sql = readFileSync(join(SQLITE_MIGRATIONS_DIR, '0001_baseline.sql'), 'utf8');
  const out = new Map<string, ColumnDef[]>();
  let current: ColumnDef[] | null = null;
  for (const line of sql.split('\n')) {
    const start = /^CREATE TABLE ([a-z_][a-z0-9_]*) \($/.exec(line);
    if (start) {
      current = [];
      out.set(start[1] as string, current);
      continue;
    }
    if (current === null) continue;
    if (line.startsWith(');')) {
      current = null;
      continue;
    }
    const m = COLUMN_RE.exec(line);
    if (!m) continue;
    const d = DEFAULT_RE.exec(m[3] as string);
    let def: ColumnDef['def'];
    if (d) {
      const lit = d[1] as string;
      if (lit === '(strftime(') def = 'now';
      else if (lit.startsWith("'")) def = lit.slice(1, -1).replaceAll("''", "'");
      else def = Number(lit);
    }
    current.push({ name: m[1] as string, def });
  }
  cachedSchema = out;
  return out;
}

export class MemTable {
  readonly rows = new Map<string, MemRow>();
  readonly name: string;
  private readonly columns: ColumnDef[];
  private readonly key: (row: MemRow) => string;
  private readonly guard: () => void;
  constructor(name: string, columns: ColumnDef[], key: (row: MemRow) => string, guard: () => void = () => {}) {
    this.name = name;
    this.columns = columns;
    this.key = key;
    this.guard = guard;
  }

  /** Điền đủ cột: giá trị truyền vào > DEFAULT của DB > null. Cột lạ ⇒ throw (bắt lỗi chính tả trong fake). */
  insert(values: Record<string, unknown>, now: string): MemRow {
    this.guard();
    const known = new Set(this.columns.map((c) => c.name));
    for (const k of Object.keys(values)) {
      if (!known.has(k)) throw new Error(`fake: bảng ${this.name} không có cột ${k}`);
    }
    const row: MemRow = {};
    for (const c of this.columns) {
      const v = values[c.name];
      if (v !== undefined) row[c.name] = normalize(v);
      else row[c.name] = c.def === 'now' ? now : (c.def ?? null);
    }
    const k = this.key(row);
    if (this.rows.has(k)) throw new Error(`fake: trùng khoá ${this.name} ${k}`);
    this.rows.set(k, row);
    return { ...row };
  }

  get(key: string): MemRow | null {
    const r = this.rows.get(key);
    return r ? { ...r } : null;
  }

  find(pred: (r: MemRow) => boolean): MemRow[] {
    const out: MemRow[] = [];
    for (const r of this.rows.values()) if (pred(r)) out.push({ ...r });
    return out;
  }

  update(key: string, patch: Record<string, unknown>): MemRow {
    this.guard();
    const r = this.rows.get(key);
    if (!r) throw new Error(`fake: ${this.name} không có ${key}`);
    for (const [k, v] of Object.entries(patch)) {
      if (!(k in r)) throw new Error(`fake: bảng ${this.name} không có cột ${k}`);
      if (v !== undefined) r[k] = normalize(v);
    }
    return { ...r };
  }

  snapshot(): Map<string, MemRow> {
    return new Map([...this.rows].map(([k, v]) => [k, { ...v }]));
  }

  restore(snap: Map<string, MemRow>): void {
    this.rows.clear();
    for (const [k, v] of snap) this.rows.set(k, v);
  }
}

function normalize(v: unknown): Value {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === null || typeof v === 'string' || typeof v === 'number' || Buffer.isBuffer(v)) return v;
  throw new Error(`fake: giá trị không lưu được (${typeof v})`);
}

const COMPOSITE_KEYS: Record<string, readonly string[]> = {
  workspace_members: ['workspace_id', 'user_id'],
  id_counters: ['workspace_id', 'prefix'],
  engines: ['slug'],
  engine_installs: ['workspace_id', 'engine_slug'],
};

/** Mọi bảng của baseline, khoá = id (hoặc PK ghép). */
export class MemDb {
  readonly tables = new Map<string, MemTable>();
  /** Bật trong store.read(): mọi insert / update ⇒ throw (giống kết nối chỉ đọc). */
  readOnly = false;
  constructor() {
    const guard = () => {
      if (this.readOnly) throw new Error('fake: ghi trong store.read() (kết nối chỉ đọc)');
    };
    for (const [name, cols] of baselineSchema()) {
      const pk = COMPOSITE_KEYS[name];
      const key = pk
        ? (r: MemRow) => pk.map((c) => String(r[c])).join('|')
        : cols.some((c) => c.name === 'id')
          ? (r: MemRow) => String(r.id)
          : (r: MemRow) => JSON.stringify(r);
      this.tables.set(name, new MemTable(name, cols, key, guard));
    }
  }

  t(name: string): MemTable {
    const t = this.tables.get(name);
    if (!t) throw new Error(`fake: không có bảng ${name}`);
    return t;
  }

  snapshot(): Map<string, Map<string, MemRow>> {
    return new Map([...this.tables].map(([n, t]) => [n, t.snapshot()]));
  }

  restore(snap: Map<string, Map<string, MemRow>>): void {
    for (const [n, s] of snap) this.t(n).restore(s);
  }
}
