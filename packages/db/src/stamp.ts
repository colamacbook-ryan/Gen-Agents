// Cột người ghi `created_by` / `updated_by` / `deleted_by` LẤY TỪ ACTOR CỦA GIAO DỊCH (WriteContext.actorId = app_actor()),
// không bao giờ từ tham số của người gọi (CNS-176; STD-11 1.13; DB v2.3.3: guard *_by = app_actor()). Repo dựng giá trị
// ghi qua các hàm dưới đây; truyền sẵn cột *_by ⇒ throw. Lint `db-actor-columns-from-context` chặn cột *_by viết tay
// ngoài packages/db/src/{stamp.ts, seed/, connection.ts, runner/}.
import { ConnectionContractError, type WriteContext } from './connection.ts';

export const ACTOR_STAMP_COLUMNS = ['created_by', 'updated_by', 'deleted_by'] as const;
export type ActorStampColumn = (typeof ACTOR_STAMP_COLUMNS)[number];

type NoStamp = { [K in ActorStampColumn]?: never };

function assertNoStamp(values: Record<string, unknown>, api: string): void {
  const passed = ACTOR_STAMP_COLUMNS.filter((c) => Object.hasOwn(values, c));
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

/** Giá trị UPDATE (SET): updated_by = actor của giao dịch. */
export function stampUpdate<T extends Record<string, unknown> & NoStamp>(
  w: Pick<WriteContext, 'actorId'>,
  values: T,
): T & { updated_by: string } {
  assertNoStamp(values, 'stampUpdate');
  return { ...values, updated_by: w.actorId };
}

/** Giá trị xoá mềm (SET): deleted_at do người gọi đặt (app_now()); deleted_by + updated_by = actor của giao dịch. */
export function stampSoftDelete<T extends Record<string, unknown> & NoStamp>(
  w: Pick<WriteContext, 'actorId'>,
  values: T,
): T & { updated_by: string; deleted_by: string } {
  assertNoStamp(values, 'stampSoftDelete');
  return { ...values, updated_by: w.actorId, deleted_by: w.actorId };
}
