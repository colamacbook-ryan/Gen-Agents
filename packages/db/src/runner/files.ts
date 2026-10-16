// Đọc thư mục migration (DATABASE §10.1): header bắt buộc, checksum, đối tượng có đánh dấu.
//
// Định dạng tệp (mọi tệp do `pnpm db:gen` sinh hoặc viết tay đều theo):
//   -- kind: standard | rebuild | data
//   -- compat_min_app_version: 0.1.0
//   -- expand_only: true | false
//   -- breaking: none | <mô tả>
//   -- rebuild_table: <bảng>                  (chỉ kind: rebuild)
//   -- @ga:object <table|index|trigger|view> <tên>
//   CREATE …;
// Repeatable: R__triggers.sql, R__views.sql — chỉ có dòng `-- repeatable: triggers|views` + các đối tượng.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type MigrationKind = 'standard' | 'rebuild' | 'data';
export type ObjectType = 'table' | 'index' | 'trigger' | 'view';

export interface SqlObject {
  type: ObjectType;
  name: string;
  /** Câu lệnh không có dấu `;` cuối — đúng dạng SQLite lưu ở sqlite_master.sql. */
  sql: string;
}

export interface VersionedMigration {
  version: number;
  name: string;
  file: string;
  kind: MigrationKind;
  compatMinAppVersion: string;
  expandOnly: boolean;
  breaking: string;
  rebuildTable: string | null;
  checksum: string;
  sql: string;
  objects: SqlObject[];
}

export interface RepeatableScript {
  kind: 'triggers' | 'views';
  file: string;
  checksum: string;
  objects: SqlObject[];
}

export interface MigrationSet {
  versioned: VersionedMigration[];
  triggers: RepeatableScript;
  views: RepeatableScript;
}

export class MigrationFileError extends Error {
  constructor(file: string, message: string) {
    super(`${file}: ${message}`);
    this.name = 'MigrationFileError';
  }
}

const VERSIONED_RE = /^(\d{4})_([a-z0-9_]+)\.sql$/;
const MARKER_RE = /^-- @ga:object (table|index|trigger|view) ([A-Za-z0-9_]+)$/;
const HEADER_RE = /^-- ([a-z_]+): (.+)$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

export function sha256Hex(text: string | Buffer): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Tách đối tượng theo dòng đánh dấu `-- @ga:object`. Văn bản trước dấu đầu tiên chỉ được là header / chú thích. */
export function parseObjects(file: string, text: string): SqlObject[] {
  const lines = text.split('\n');
  const out: SqlObject[] = [];
  let cur: { type: ObjectType; name: string; body: string[] } | null = null;
  const flush = () => {
    if (!cur) return;
    const sql = cur.body.join('\n').trim().replace(/;\s*$/, '');
    if (!sql) throw new MigrationFileError(file, `đối tượng ${cur.name} rỗng`);
    out.push({ type: cur.type, name: cur.name, sql });
  };
  for (const line of lines) {
    const m = MARKER_RE.exec(line);
    if (m) {
      flush();
      cur = { type: m[1] as ObjectType, name: m[2] as string, body: [] };
      continue;
    }
    if (cur) cur.body.push(line);
    else if (line.trim() !== '' && !line.startsWith('--')) {
      throw new MigrationFileError(file, `có SQL trước dòng đánh dấu đầu tiên: ${line.slice(0, 60)}`);
    }
  }
  flush();
  return out;
}

function parseHeader(text: string): Map<string, string> {
  const h = new Map<string, string>();
  for (const line of text.split('\n')) {
    if (line.startsWith('-- @ga:object')) break;
    const m = HEADER_RE.exec(line);
    if (m) h.set(m[1] as string, (m[2] as string).trim());
  }
  return h;
}

function req(file: string, h: Map<string, string>, key: string): string {
  const v = h.get(key);
  if (v === undefined) throw new MigrationFileError(file, `thiếu header \`-- ${key}:\``);
  return v;
}

export function parseVersioned(file: string, text: string): VersionedMigration {
  const m = VERSIONED_RE.exec(file);
  if (!m) throw new MigrationFileError(file, 'tên tệp phải là NNNN_<slug>.sql');
  const h = parseHeader(text);
  const kind = req(file, h, 'kind');
  if (kind !== 'standard' && kind !== 'rebuild' && kind !== 'data') {
    throw new MigrationFileError(file, `kind lạ: ${kind}`);
  }
  const compat = req(file, h, 'compat_min_app_version');
  if (!SEMVER_RE.test(compat)) throw new MigrationFileError(file, `compat_min_app_version không phải x.y.z: ${compat}`);
  const expand = req(file, h, 'expand_only');
  if (expand !== 'true' && expand !== 'false') throw new MigrationFileError(file, 'expand_only phải là true | false');
  const objects = parseObjects(file, text);
  const rebuildTable = h.get('rebuild_table') ?? null;
  if (kind === 'rebuild') {
    if (!rebuildTable) throw new MigrationFileError(file, 'kind: rebuild cần `-- rebuild_table: <bảng>`');
    const tables = objects.filter((o) => o.type === 'table');
    if (tables.length !== 1 || tables[0]?.name !== rebuildTable) {
      throw new MigrationFileError(file, 'kind: rebuild phải có đúng một đối tượng table trùng rebuild_table');
    }
    if (objects.some((o) => o.type !== 'table' && o.type !== 'index')) {
      throw new MigrationFileError(file, 'kind: rebuild chỉ chứa table + index (trigger / view nằm ở R__*)');
    }
  }
  // lint DATABASE §10.1: expand_only không được DROP / RENAME / CREATE TRIGGER / rebuild
  if (expand === 'true') {
    if (kind === 'rebuild') throw new MigrationFileError(file, 'expand_only: true không được là kind: rebuild');
    const body = text
      .split('\n')
      .filter((l) => !l.startsWith('--'))
      .join('\n');
    if (/\bDROP\b|\bRENAME\b|\bCREATE\s+TRIGGER\b/i.test(body)) {
      throw new MigrationFileError(file, 'expand_only: true không được chứa DROP / RENAME / CREATE TRIGGER');
    }
  }
  return {
    version: Number(m[1]),
    name: m[2] as string,
    file,
    kind,
    compatMinAppVersion: compat,
    expandOnly: expand === 'true',
    breaking: h.get('breaking') ?? 'none',
    rebuildTable,
    checksum: sha256Hex(text),
    sql: text,
    objects,
  };
}

export function parseRepeatable(file: string, text: string, kind: 'triggers' | 'views'): RepeatableScript {
  const h = parseHeader(text);
  if (h.get('repeatable') !== kind) throw new MigrationFileError(file, `cần header \`-- repeatable: ${kind}\``);
  const objects = parseObjects(file, text);
  const want: ObjectType = kind === 'triggers' ? 'trigger' : 'view';
  const bad = objects.find((o) => o.type !== want);
  if (bad) throw new MigrationFileError(file, `${file} chỉ được chứa ${want}, gặp ${bad.type} ${bad.name}`);
  return { kind, file, checksum: sha256Hex(text), objects };
}

export function loadMigrations(dir: string): MigrationSet {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const versioned: VersionedMigration[] = [];
  let triggers: RepeatableScript | null = null;
  let views: RepeatableScript | null = null;
  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf8');
    if (f === 'R__triggers.sql') triggers = parseRepeatable(f, text, 'triggers');
    else if (f === 'R__views.sql') views = parseRepeatable(f, text, 'views');
    else versioned.push(parseVersioned(f, text));
  }
  if (!triggers || !views) throw new MigrationFileError(dir, 'thiếu R__triggers.sql hoặc R__views.sql');
  const seen = new Set<number>();
  for (const v of versioned) {
    if (seen.has(v.version)) throw new MigrationFileError(v.file, `trùng version ${v.version}`);
    seen.add(v.version);
  }
  versioned.sort((a, b) => a.version - b.version);
  return { versioned, triggers, views };
}

/** So x.y.z (bỏ hậu tố pre-release). */
export function compareSemver(a: string, b: string): number {
  const pa = a.split(/[-+]/)[0]?.split('.').map(Number) ?? [];
  const pb = b.split(/[-+]/)[0]?.split('.').map(Number) ?? [];
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

/** Ghi một đối tượng ra dạng tệp migration (dùng bởi `pnpm db:gen`). */
export function renderObject(o: SqlObject): string {
  return `-- @ga:object ${o.type} ${o.name}\n${o.sql};\n`;
}
