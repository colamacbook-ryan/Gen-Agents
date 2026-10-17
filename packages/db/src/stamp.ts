// Cột người ghi `created_by` / `updated_by` / `deleted_by` LẤY TỪ ACTOR CỦA GIAO DỊCH (WriteContext.actorId = app_actor()),
// không bao giờ từ tham số của người gọi (CNS-176; STD-11 1.13; DB v2.3.3: guard *_by = app_actor()). Repo dựng giá trị
// ghi qua các hàm dưới đây; truyền sẵn cột *_by ⇒ throw. Lint `db-actor-columns-from-context` chặn cột *_by viết tay
// ngoài packages/db/src/{stamp.ts, seed/, connection.ts, runner/}.
import { type RawBuilder, sql } from 'kysely';
import { ConnectionContractError, type WriteContext } from './connection.ts';

export const ACTOR_STAMP_COLUMNS = ['created_by', 'updated_by', 'deleted_by'] as const;
export type ActorStampColumn = (typeof ACTOR_STAMP_COLUMNS)[number];

type NoStamp = { [K in ActorStampColumn]?: never };
/** UPDATE / xoá mềm: updated_at cũng do helper đặt (FRESH_UPDATED_AT). */
type NoStampUpdate = NoStamp & { updated_at?: never };

/**
 * updated_at cho UPDATE (DB v2.3.3+: guard chung `*_actor_u` đòi updated_at ĐỔI ở mỗi UPDATE): giờ của giao dịch (app_now()), nhưng luôn
 * lớn hơn giá trị cũ của hàng (cùng ms ⇒ +1 ms) — = TS_FRESH của db/spec/schema_v2_2.py. Biểu thức SQL (đọc cột của chính hàng đang sửa).
 */
export const FRESH_UPDATED_AT: RawBuilder<string> = sql<string>`max(strftime('%Y-%m-%dT%H:%M:%fZ', app_now()), COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds'), ''))`;

function assertNoStamp(values: Record<string, unknown>, api: string, extra: readonly string[] = []): void {
  const passed = [...ACTOR_STAMP_COLUMNS, ...extra].filter((c) => Object.hasOwn(values, c));
  if (passed.length > 0) {
    throw new ConnectionContractError(
      `${api}: không truyền ${passed.join(', ')} — cột người ghi lấy từ actor của giao dịch (app_actor())`,
    );
  }
}

/** Giá trị INSERT: created_by = actor của giao dịch. */
export function stampInsert<T extends Record<string, unknown> & NoStamp>(
  w: Pick<WriteContext, 'actorId'>,
  values: T,
): T & { created_by: string } {
  assertNoStamp(values, 'stampInsert');
  return { ...values, created_by: w.actorId };
}

/** Giá trị UPDATE (SET): updated_by = actor của giao dịch, updated_at = FRESH_UPDATED_AT (DB v2.3.3+). */
export function stampUpdate<T extends Record<string, unknown> & NoStampUpdate>(
  w: Pick<WriteContext, 'actorId'>,
  values: T,
): T & { updated_by: string; updated_at: RawBuilder<string> } {
  assertNoStamp(values, 'stampUpdate', ['updated_at']);
  return { ...values, updated_by: w.actorId, updated_at: FRESH_UPDATED_AT };
}

/** Giá trị xoá mềm (SET): deleted_at do người gọi đặt (app_now()); deleted_by + updated_by = actor của giao dịch, updated_at = FRESH_UPDATED_AT. */
export function stampSoftDelete<T extends Record<string, unknown> & NoStampUpdate>(
  w: Pick<WriteContext, 'actorId'>,
  values: T,
): T & { updated_by: string; deleted_by: string; updated_at: RawBuilder<string> } {
  assertNoStamp(values, 'stampSoftDelete', ['updated_at']);
  return { ...values, updated_by: w.actorId, deleted_by: w.actorId, updated_at: FRESH_UPDATED_AT };
}
