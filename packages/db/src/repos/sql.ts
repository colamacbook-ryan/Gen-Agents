// Bộ chạy câu lệnh GHI của tầng repos / ids / seed. Mọi INSERT / UPDATE / DELETE của @ga/db đi qua `dml(w).write(sql, …)`:
// trước khi chạy, kiểm lúc chạy rằng câu lệnh đang nằm trong giao dịch ghi của chính `w` — app_actor() = w.actorId
// (conn.write / conn.bootstrap) hoặc app_maint() = 1 (conn.maintenance). Ngoài giao dịch (vd giữ `w` rồi gọi sau khi
// write() đã trả về) ⇒ throw, không ghi. Đây là bản lúc-chạy của luật lint `db-write-only-via-write` (luật lint chỉ nhìn
// văn bản: SQL ghi phải nằm trong `.write(…)`). Tham số boolean đổi sang 0 / 1 (DB lưu bool là INTEGER, §2.2).
import { ConnectionContractError, type MaintenanceContext, type WriteContext } from '../connection.ts';

export interface WriteResult<R> {
  changes: number;
  /** Hàng trả về khi câu lệnh có RETURNING; [] nếu không. */
  rows: R[];
}

export interface Dml {
  write<R = Record<string, unknown>>(sql: string, params?: readonly unknown[]): WriteResult<R>;
}

const RETURNING_RE = /\bRETURNING\b/i;

export function bindable(v: unknown): unknown {
  if (v === true) return 1;
  if (v === false) return 0;
  if (v === undefined) return null;
  return v;
}

/** Bộ chạy câu lệnh ghi gắn với một ngữ cảnh ghi (write / bootstrap / maintenance). */
export function dml(w: WriteContext | MaintenanceContext): Dml {
  return {
    write<R>(sql: string, params: readonly unknown[] = []): WriteResult<R> {
      const live = w.get<{ ok: number }>('SELECT (app_maint() = 1 OR app_actor() IS ?) AS ok', [w.actorId]);
      if (live?.ok !== 1) {
        throw new ConnectionContractError(
          'câu lệnh ghi ngoài giao dịch conn.write / bootstrap / maintenance của chính nó',
        );
      }
      const p = params.map(bindable);
      if (RETURNING_RE.test(sql)) {
        const rows = w.all<R>(sql, p);
        return { changes: rows.length, rows };
      }
      return { changes: w.run(sql, p).changes, rows: [] };
    },
  };
}
