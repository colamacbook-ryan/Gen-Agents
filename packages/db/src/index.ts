// @ga/db — SQL trước (DDL vendor từ DATABASE spec theo commit), runner riêng, hợp đồng kết nối ⑥-05, kiểu Kysely sinh từ DB.
// Kysely CHỈ là lớp truy vấn có kiểu; schema không định nghĩa ở TS (ADR 0004).
import { Kysely, SqliteDialect } from 'kysely';
import type { AppConnection } from './connection.ts';
import type { DB } from './generated/schema.ts';

export * from './connection.ts';
export type { DB } from './generated/schema.ts';
export { TABLES, VIEWS } from './generated/schema.ts';
export { SYNC } from './generated/sync.ts';
export * from './runner/index.ts';
export * from './seed/reference.ts';

/** Query builder có kiểu trên một kết nối đã qua hợp đồng (writer / reader). Cấm `.orReplace()` (lint no-or-replace). */
export function createKysely(conn: AppConnection): Kysely<DB> {
  return new Kysely<DB>({ dialect: new SqliteDialect({ database: conn.db }) });
}
