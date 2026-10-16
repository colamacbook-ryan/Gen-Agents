// Hợp đồng kết nối SQLite (⑥-05; DATABASE §2.2, §9.3, §10.7; BUILD-PLAN §D.4). Làm xong trước mọi code DB khác.
//
// Mọi kết nối của app:
//   - đặt đủ pragma §10.7 rồi ĐỌC LẠI từng cái — sai thì throw (không mở kết nối "gần đúng");
//   - đăng ký app_maint(), app_now(), app_local_time(ts, tz) và MỌI hàm app_* mà schema đã vendor gọi (SYNC.json) —
//     thiếu cài đặt cho một hàm trong danh sách ⇒ throw. Kết nối không đăng ký (sqlite3 CLI…) gọi tới trigger sẽ lỗi
//     `no such function: app_maint` ⇒ không sửa/xoá được bảng được bảo vệ (fail-closed);
//   - kết nối đọc mở `readonly` + `query_only` — không ghi được, và KHÔNG có app_actor();
//   - MỌI ghi DB của app đi qua `conn.write(actorId, fn)` (khởi tạo workspace: `conn.bootstrap`, bảo trì: `conn.maintenance`
//     — CNS-170): transaction IMMEDIATE + gắn actor vào ngữ cảnh kết nối
//     (app_actor() = actorId) suốt transaction, xoá ở finally kể cả khi lỗi. DB v2.3.3 (báo trước): guard chung buộc
//     created_by / updated_by / deleted_by = app_actor(); app_actor() NULL ⇒ ghi bị từ chối (trừ bảo trì). Lint
//     `db-write-only-via-write` chặn câu lệnh ghi ngoài write(). Job hệ thống dùng actor system (systemActorId).
// Code app CẤM `INSERT OR REPLACE` / `REPLACE INTO` / `UPDATE OR REPLACE` / Kysely `.orReplace()` (lint `no-or-replace`).
// Cấm gọi mạng / LLM bên trong transaction (transaction của better-sqlite3 là đồng bộ; lint heuristic `no-io-in-transaction`).

import { type ActorSystemKey, type Clock, SYSTEM_WORKSPACE_ID, toDbTimestamp, ULID_RE } from '@ga/contracts';
import Database from 'better-sqlite3';
import { SYNC } from './generated/sync.ts';

export type SqliteDatabase = Database.Database;

/** Pragma bắt buộc (DATABASE §10.7) + giá trị đọc lại mong đợi. Thứ tự đặt: journal_mode trước. */
export const REQUIRED_PRAGMAS = [
  { name: 'journal_mode', set: 'WAL', expect: 'wal' },
  { name: 'synchronous', set: 'FULL', expect: 2 },
  { name: 'foreign_keys', set: 'ON', expect: 1 },
  { name: 'recursive_triggers', set: 'ON', expect: 1 },
  { name: 'busy_timeout', set: '5000', expect: 5000 },
  { name: 'cache_size', set: '-65536', expect: -65536 },
  { name: 'temp_store', set: 'MEMORY', expect: 2 },
  { name: 'mmap_size', set: '268435456', expect: 268435456 },
  { name: 'wal_autocheckpoint', set: '1000', expect: 1000 },
] as const;

export type PragmaName = (typeof REQUIRED_PRAGMAS)[number]['name'];

export class ConnectionContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectionContractError';
  }
}

export interface MaintenanceEvent {
  reason: string;
}

/** Query đã biên dịch (Kysely `.compile()` trả đúng dạng này) hoặc SQL thô có tham số. */
export interface CompiledLike {
  sql: string;
  parameters: readonly unknown[];
}
export type Statementish = string | CompiledLike | { compile(): CompiledLike };

/** Chạy câu lệnh đồng bộ trên chính transaction đang mở. */
export interface StatementRunner {
  run(q: Statementish, params?: readonly unknown[]): Database.RunResult;
  get<R = unknown>(q: Statementish, params?: readonly unknown[]): R | undefined;
  all<R = unknown>(q: Statementish, params?: readonly unknown[]): R[];
}

/** Ngữ cảnh của một giao dịch ghi (write / bootstrap): actor luôn có. */
export interface WriteContext extends StatementRunner {
  readonly actorId: string;
}

/** Ngữ cảnh bảo trì: actor system, hoặc null khi DB chưa có actor nào (migrate DB rỗng). */
export interface MaintenanceContext extends StatementRunner {
  readonly actorId: string | null;
}

export interface AppConnection {
  readonly db: SqliteDatabase;
  readonly role: 'writer' | 'reader' | 'scratch';
  readonly clock: Clock;
  /** Giá trị app_maint() hiện tại. */
  inMaintenance(): boolean;
  /** Actor của giao dịch ghi đang chạy (= app_actor()); null ngoài write(). */
  currentActor(): string | null;
  /**
   * Cửa ghi DUY NHẤT của app: transaction IMMEDIATE, app_actor() = actorId trong suốt transaction, chạy `fn` ĐỒNG BỘ
   * (không await — transaction của better-sqlite3 là đồng bộ), xoá actor ở finally kể cả khi lỗi (transaction rollback).
   * Không lồng nhau. actorId = id ULID của hàng `actors` (người, Role hoặc actor system — job dùng systemActorId()).
   */
  write<T>(actorId: string, fn: (w: WriteContext) => T): T;
  /**
   * Ghi KHỞI TẠO một workspace (seed tham chiếu, dựng workspace hệ thống / tenant) — CNS-170. app_actor() = actor system
   * của CHÍNH workspace đó, id cấp trước (ULID); hàng `actors` của nó tạo TRONG giao dịch trước mọi hàng có *_by.
   * Kiểm trước: workspace đã có actor system thì phải đúng id này. Kiểm sau (trước COMMIT): actor system đó phải tồn tại.
   * Chỉ dùng trong packages/db (lint `db-privileged-api-paths`).
   */
  bootstrap<T>(target: { workspaceId: string; systemActorId: string }, fn: (w: WriteContext) => T): T;
  /**
   * Bảo trì (DATABASE §9.3, §10.4, §10.9): app_maint() = 1 + actor system — migrate, purge, xoay KEK. Actor =
   * `opts.actorId` (phải là actor kind 'system') hoặc mặc định actor system của workspace hệ thống; DB chưa có actor
   * (migrate DB rỗng) ⇒ app_actor() NULL — hợp lệ vì bảo trì được miễn. Mặc định tự mở transaction IMMEDIATE;
   * `transaction: 'caller'` khi người gọi đã BEGIN (runner rebuild). Gọi onMaintenance (lane audit ghi lý do + số dòng).
   */
  maintenance<T>(
    reason: string,
    fn: (w: MaintenanceContext) => T,
    opts?: { actorId?: string; transaction?: 'own' | 'caller' },
  ): T;
  close(): void;
}

export interface OpenOptions {
  clock: Clock;
  onMaintenance?: (event: MaintenanceEvent) => void;
}

// ---------------------------------------------------------------- hàm SQL app_*
const localTimeFormatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat | null {
  const cached = localTimeFormatters.get(tz);
  if (cached) return cached;
  try {
    const f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    localTimeFormatters.set(tz, f);
    return f;
  } catch {
    return null; // tz lạ (RangeError) ⇒ NULL theo hợp đồng
  }
}

const TS_PREFIX_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/;

/**
 * app_local_time(ts, tz): giờ địa phương 'YYYY-MM-DD HH:MM:SS' của ts (UTC) theo IANA tz; tz lạ / ts hỏng ⇒ NULL
 * (DATABASE §2.2 v2.3.0; cùng hành vi với bản Python của bộ test: đọc 19 ký tự đầu, coi là UTC).
 */
export function appLocalTime(ts: unknown, tz: unknown): string | null {
  if (typeof ts !== 'string' || typeof tz !== 'string' || tz.length === 0) return null;
  const m = TS_PREFIX_RE.exec(ts);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  // từ chối ngày không tồn tại (Date.UTC tự "tràn" 30/02 sang 02/03)
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== mo - 1 ||
    date.getUTCDate() !== d ||
    date.getUTCHours() !== h ||
    date.getUTCMinutes() !== mi ||
    date.getUTCSeconds() !== s
  ) {
    return null;
  }
  const f = formatterFor(tz);
  if (!f) return null;
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(date)) p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

interface FnState {
  maint: boolean;
  clock: Clock;
  /** actor của giao dịch ghi hiện tại — chỉ write() đặt / xoá. */
  actor: string | null;
}

type AppFunctionImpl = (db: SqliteDatabase, state: FnState) => void;

/** Cài đặt cho từng hàm app_* — tên phải phủ SYNC.app_functions (kiểm lúc mở kết nối). */
const APP_FUNCTIONS: Record<string, { impl: AppFunctionImpl; onReader: boolean }> = {
  // KHÔNG bật directOnly: trigger phải gọi được (DATABASE §9.3). Trả INTEGER 0/1 như bản Python.
  app_maint: {
    onReader: true,
    impl: (db, st) => db.function('app_maint', { deterministic: false }, () => (st.maint ? 1n : 0n)),
  },
  app_now: {
    onReader: true,
    impl: (db, st) => db.function('app_now', { deterministic: false }, () => toDbTimestamp(st.clock.now())),
  },
  app_local_time: {
    onReader: true,
    impl: (db) => db.function('app_local_time', { deterministic: true }, appLocalTime),
  },
  // DB v2.3.3 (báo trước): actor của giao dịch ghi; NULL ngoài write() ⇒ guard từ chối ghi. Kết nối đọc KHÔNG có hàm này.
  app_actor: {
    onReader: false,
    impl: (db, st) => db.function('app_actor', { deterministic: false }, () => st.actor),
  },
};

/** Hàm app_* đăng ký cho một loại kết nối. */
export function registeredAppFunctions(role: AppConnection['role'] = 'writer'): string[] {
  return Object.entries(APP_FUNCTIONS)
    .filter(([, f]) => role !== 'reader' || f.onReader)
    .map(([name]) => name)
    .sort();
}

function registerAppFunctions(db: SqliteDatabase, state: FnState, role: AppConnection['role']): void {
  const missing = SYNC.appFunctions.filter((name) => !(name in APP_FUNCTIONS));
  if (missing.length > 0) {
    throw new ConnectionContractError(
      `Schema đã vendor (rev ${SYNC.rev.slice(0, 7)}) gọi hàm chưa có cài đặt: ${missing.join(', ')} — thêm vào APP_FUNCTIONS`,
    );
  }
  for (const f of Object.values(APP_FUNCTIONS)) if (role !== 'reader' || f.onReader) f.impl(db, state);
}

// ---------------------------------------------------------------- pragma
function readPragma(db: SqliteDatabase, name: string): unknown {
  return db.pragma(name, { simple: true });
}

function applyAndVerifyPragmas(db: SqliteDatabase, mode: 'writer' | 'reader' | 'scratch'): void {
  for (const p of REQUIRED_PRAGMAS) {
    if (
      mode === 'scratch' &&
      (p.name === 'journal_mode' || p.name === 'mmap_size' || p.name === 'wal_autocheckpoint')
    ) {
      continue; // DB trong RAM (công cụ sinh mã / parity) không có WAL / mmap
    }
    if (mode === 'reader' && p.name === 'journal_mode') {
      // kết nối chỉ đọc không đổi được journal_mode; DB phải đã ở WAL (writer đặt)
    } else {
      db.pragma(`${p.name} = ${p.set}`);
    }
    const got = readPragma(db, p.name);
    if (got !== p.expect) {
      throw new ConnectionContractError(
        `PRAGMA ${p.name} = ${JSON.stringify(got)}, hợp đồng §10.7 đòi ${JSON.stringify(p.expect)}`,
      );
    }
  }
  if (mode === 'reader') {
    db.pragma('query_only = ON');
    if (readPragma(db, 'query_only') !== 1) throw new ConnectionContractError('PRAGMA query_only không bật được');
  }
}

// ---------------------------------------------------------------- mở kết nối
function wrap(db: SqliteDatabase, role: AppConnection['role'], opts: OpenOptions, state: FnState): AppConnection {
  return {
    db,
    role,
    clock: opts.clock,
    inMaintenance: () => state.maint,
    currentActor: () => state.actor,
    write<T>(actorId: string, fn: (w: WriteContext) => T): T {
      assertWritable(role, state);
      assertActorId(actorId, 'write()');
      return withActor(db, state, actorId, () => fn(statementContext(db, actorId)), 'write()');
    },
    bootstrap<T>(target: { workspaceId: string; systemActorId: string }, fn: (w: WriteContext) => T): T {
      assertWritable(role, state);
      assertActorId(target.systemActorId, 'bootstrap()');
      if (typeof target.workspaceId !== 'string' || !ULID_RE.test(target.workspaceId)) {
        throw new ConnectionContractError('bootstrap() cần workspaceId là ULID');
      }
      const existing = workspaceSystemActor(db, target.workspaceId);
      if (existing !== null && existing !== target.systemActorId) {
        throw new ConnectionContractError(
          `workspace ${target.workspaceId} đã có actor system ${existing} — bootstrap phải dùng đúng id đó`,
        );
      }
      return withActor(
        db,
        state,
        target.systemActorId,
        () => {
          const out = fn(statementContext(db, target.systemActorId));
          if (workspaceSystemActor(db, target.workspaceId) !== target.systemActorId) {
            throw new ConnectionContractError(
              'bootstrap() phải tạo / giữ hàng actors (kind system, system_key system) của workspace với đúng systemActorId',
            );
          }
          return out;
        },
        'bootstrap()',
      );
    },
    maintenance<T>(
      reason: string,
      fn: (w: MaintenanceContext) => T,
      o: { actorId?: string; transaction?: 'own' | 'caller' } = {},
    ): T {
      assertWritable(role, state);
      if (reason.trim().length === 0) throw new ConnectionContractError('maintenance cần lý do (ghi audit)');
      let actor: string | null;
      if (o.actorId !== undefined) {
        assertActorId(o.actorId, 'maintenance()');
        if (!isSystemActor(db, o.actorId))
          throw new ConnectionContractError('maintenance() chỉ chạy bằng actor kind system');
        actor = o.actorId;
      } else {
        actor = workspaceSystemActor(db, SYSTEM_WORKSPACE_ID);
      }
      const run = (): T => {
        state.maint = true;
        state.actor = actor;
        try {
          opts.onMaintenance?.({ reason });
          const out = fn({ ...statementContext(db, actor ?? ''), actorId: actor });
          if (out instanceof Promise) throw new ConnectionContractError('maintenance() chỉ nhận hàm đồng bộ');
          return out;
        } finally {
          state.maint = false;
          state.actor = null;
        }
      };
      if (o.transaction === 'caller') {
        if (!db.inTransaction)
          throw new ConnectionContractError("maintenance({transaction:'caller'}) cần transaction đang mở");
        return run();
      }
      return db.transaction(run).immediate();
    },
    close: () => db.close(),
  };
}

function assertWritable(role: AppConnection['role'], state: FnState): void {
  if (role === 'reader') throw new ConnectionContractError('Kết nối đọc không ghi được');
  if (state.actor !== null || state.maint) {
    throw new ConnectionContractError('write / bootstrap / maintenance không được lồng nhau');
  }
}

function assertActorId(actorId: string, api: string): void {
  if (typeof actorId !== 'string' || !ULID_RE.test(actorId)) {
    throw new ConnectionContractError(`${api} cần actorId là ULID của một hàng actors`);
  }
}

/** Gắn actor cho đúng một transaction IMMEDIATE, xoá ở finally kể cả khi lỗi. */
function withActor<T>(db: SqliteDatabase, state: FnState, actorId: string, body: () => T, api: string): T {
  state.actor = actorId;
  try {
    return db
      .transaction(() => {
        const out = body();
        if (out instanceof Promise) {
          throw new ConnectionContractError(`${api} chỉ nhận hàm đồng bộ (transaction của better-sqlite3 là đồng bộ)`);
        }
        return out;
      })
      .immediate();
  } finally {
    state.actor = null;
  }
}

function actorsTableExists(db: SqliteDatabase): boolean {
  return db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'actors'").get() !== undefined;
}

function workspaceSystemActor(db: SqliteDatabase, workspaceId: string): string | null {
  if (!actorsTableExists(db)) return null;
  const row = db
    .prepare(
      "SELECT id FROM actors WHERE workspace_id = ? AND kind = 'system' AND system_key = 'system' AND purged_at IS NULL",
    )
    .get(workspaceId) as { id: string } | undefined;
  return row?.id ?? null;
}

function isSystemActor(db: SqliteDatabase, actorId: string): boolean {
  if (!actorsTableExists(db)) return false;
  return (
    db.prepare("SELECT 1 FROM actors WHERE id = ? AND kind = 'system' AND purged_at IS NULL").get(actorId) !== undefined
  );
}

function resolveStatement(q: Statementish, params: readonly unknown[] | undefined): CompiledLike {
  if (typeof q === 'string') return { sql: q, parameters: params ?? [] };
  const c = 'compile' in q ? q.compile() : q;
  if (params && params.length > 0) throw new ConnectionContractError('query đã biên dịch không nhận thêm tham số');
  return { sql: c.sql, parameters: c.parameters };
}

function statementContext(db: SqliteDatabase, actorId: string): WriteContext {
  return {
    actorId,
    run: (q, params) => {
      const c = resolveStatement(q, params);
      return db.prepare(c.sql).run(...(c.parameters as unknown[]));
    },
    get: <R>(q: Statementish, params?: readonly unknown[]) => {
      const c = resolveStatement(q, params);
      return db.prepare(c.sql).get(...(c.parameters as unknown[])) as R | undefined;
    },
    all: <R>(q: Statementish, params?: readonly unknown[]) => {
      const c = resolveStatement(q, params);
      return db.prepare(c.sql).all(...(c.parameters as unknown[])) as R[];
    },
  };
}

/** id actor system của workspace cho job / tiến trình (scheduler, gateway, updater…). Thiếu ⇒ throw (không ghi vô danh). */
export function systemActorId(conn: AppConnection, workspaceId: string, key: ActorSystemKey = 'system'): string {
  const row = conn.db
    .prepare(
      "SELECT id FROM actors WHERE workspace_id = ? AND kind = 'system' AND system_key = ? AND purged_at IS NULL",
    )
    .get(workspaceId, key) as { id: string } | undefined;
  if (!row) throw new ConnectionContractError(`workspace ${workspaceId} không có actor system '${key}'`);
  return row.id;
}

function assertFilePath(path: string): void {
  if (path === ':memory:' || path === '') {
    throw new ConnectionContractError('Kết nối app phải là tệp DB (WAL); DB trong RAM chỉ dùng openScratch()');
  }
}

/** Kết nối GHI duy nhất (luồng chính). Tạo tệp nếu chưa có. */
export function openWriter(path: string, opts: OpenOptions): AppConnection {
  assertFilePath(path);
  const db = new Database(path);
  try {
    const state: FnState = { maint: false, clock: opts.clock, actor: null };
    applyAndVerifyPragmas(db, 'writer');
    registerAppFunctions(db, state, 'writer');
    return wrap(db, 'writer', opts, state);
  } catch (e) {
    db.close();
    throw e;
  }
}

/** Kết nối CHỈ ĐỌC cho lưới / export. Tệp phải tồn tại và đã ở WAL. */
export function openReader(path: string, opts: OpenOptions): AppConnection {
  assertFilePath(path);
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const state: FnState = { maint: false, clock: opts.clock, actor: null };
    applyAndVerifyPragmas(db, 'reader');
    registerAppFunctions(db, state, 'reader');
    return wrap(db, 'reader', opts, state);
  } catch (e) {
    db.close();
    throw e;
  }
}

/** DB trong RAM cho công cụ (sinh kiểu, parity, test). Cùng hàm + pragma trừ WAL / mmap. Không dùng trong app. */
export function openScratch(opts: OpenOptions): AppConnection {
  const db = new Database(':memory:');
  const state: FnState = { maint: false, clock: opts.clock, actor: null };
  applyAndVerifyPragmas(db, 'scratch');
  registerAppFunctions(db, state, 'scratch');
  return wrap(db, 'scratch', opts, state);
}
