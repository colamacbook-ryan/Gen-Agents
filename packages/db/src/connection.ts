// Hợp đồng kết nối SQLite (⑥-05; DATABASE §2.2, §9.3, §10.7; BUILD-PLAN §D.4). Làm xong trước mọi code DB khác.
//
// Mọi kết nối của app:
//   - đặt đủ pragma §10.7 rồi ĐỌC LẠI từng cái — sai thì throw (không mở kết nối "gần đúng");
//   - đăng ký app_maint(), app_now(), app_local_time(ts, tz) và MỌI hàm app_* mà schema đã vendor gọi (SYNC.json) —
//     thiếu cài đặt cho một hàm trong danh sách ⇒ throw. Kết nối không đăng ký (sqlite3 CLI…) gọi tới trigger sẽ lỗi
//     `no such function: app_maint` ⇒ không sửa/xoá được bảng được bảo vệ (fail-closed);
//   - kết nối đọc mở `readonly` + `query_only` — không ghi được.
// Code app CẤM `INSERT OR REPLACE` / `REPLACE INTO` / `UPDATE OR REPLACE` / Kysely `.orReplace()` (lint `no-or-replace`).
// Cấm gọi mạng / LLM bên trong transaction (transaction của better-sqlite3 là đồng bộ; lint heuristic `no-io-in-transaction`).

import { type Clock, toDbTimestamp } from '@ga/contracts';
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

export interface AppConnection {
  readonly db: SqliteDatabase;
  readonly role: 'writer' | 'reader' | 'scratch';
  readonly clock: Clock;
  /** Giá trị app_maint() hiện tại. */
  inMaintenance(): boolean;
  /**
   * Bật ngữ cảnh bảo trì (app_maint() = 1) cho đúng một hàm đồng bộ, tắt ở finally (DATABASE §9.3).
   * Mặc định tự mở transaction; `{ transaction: 'caller' }` khi người gọi đã BEGIN (runner rebuild).
   * Mỗi lần dùng gọi `onMaintenance` (lane audit ghi lý do + số dòng — M1).
   */
  withMaintenance<T>(reason: string, fn: () => T, opts?: { transaction: 'own' | 'caller' }): T;
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
}

type AppFunctionImpl = (db: SqliteDatabase, state: FnState) => void;

/** Cài đặt cho từng hàm app_* — tên phải phủ SYNC.app_functions (kiểm lúc mở kết nối). */
const APP_FUNCTIONS: Record<string, AppFunctionImpl> = {
  // KHÔNG bật directOnly: trigger phải gọi được (DATABASE §9.3). Trả INTEGER 0/1 như bản Python.
  app_maint: (db, st) => db.function('app_maint', { deterministic: false }, () => (st.maint ? 1n : 0n)),
  app_now: (db, st) => db.function('app_now', { deterministic: false }, () => toDbTimestamp(st.clock.now())),
  app_local_time: (db) => db.function('app_local_time', { deterministic: true }, appLocalTime),
};

export function registeredAppFunctions(): string[] {
  return Object.keys(APP_FUNCTIONS).sort();
}

function registerAppFunctions(db: SqliteDatabase, state: FnState): void {
  const missing = SYNC.appFunctions.filter((name) => !(name in APP_FUNCTIONS));
  if (missing.length > 0) {
    throw new ConnectionContractError(
      `Schema đã vendor (rev ${SYNC.rev.slice(0, 7)}) gọi hàm chưa có cài đặt: ${missing.join(', ')} — thêm vào APP_FUNCTIONS`,
    );
  }
  for (const impl of Object.values(APP_FUNCTIONS)) impl(db, state);
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
    withMaintenance<T>(reason: string, fn: () => T, o: { transaction: 'own' | 'caller' } = { transaction: 'own' }): T {
      if (role === 'reader') throw new ConnectionContractError('Kết nối đọc không có ngữ cảnh bảo trì');
      if (reason.trim().length === 0) throw new ConnectionContractError('withMaintenance cần lý do (ghi audit)');
      if (state.maint) throw new ConnectionContractError('withMaintenance không được lồng nhau');
      const run = (): T => {
        state.maint = true;
        try {
          opts.onMaintenance?.({ reason });
          const out = fn();
          if (out instanceof Promise) throw new ConnectionContractError('withMaintenance chỉ nhận hàm đồng bộ');
          return out;
        } finally {
          state.maint = false;
        }
      };
      if (o.transaction === 'caller') {
        if (!db.inTransaction)
          throw new ConnectionContractError("withMaintenance({transaction:'caller'}) cần transaction đang mở");
        return run();
      }
      return db.transaction(run)();
    },
    close: () => db.close(),
  };
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
    const state: FnState = { maint: false, clock: opts.clock };
    applyAndVerifyPragmas(db, 'writer');
    registerAppFunctions(db, state);
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
    const state: FnState = { maint: false, clock: opts.clock };
    applyAndVerifyPragmas(db, 'reader');
    registerAppFunctions(db, state);
    return wrap(db, 'reader', opts, state);
  } catch (e) {
    db.close();
    throw e;
  }
}

/** DB trong RAM cho công cụ (sinh kiểu, parity, test). Cùng hàm + pragma trừ WAL / mmap. Không dùng trong app. */
export function openScratch(opts: OpenOptions): AppConnection {
  const db = new Database(':memory:');
  const state: FnState = { maint: false, clock: opts.clock };
  applyAndVerifyPragmas(db, 'scratch');
  registerAppFunctions(db, state);
  return wrap(db, 'scratch', opts, state);
}
