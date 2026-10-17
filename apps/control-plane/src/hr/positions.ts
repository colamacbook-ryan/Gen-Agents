// SYS-44 — Position (đọc). SYS-45 (sửa) CHƯA làm: repo chưa có ghi `positions` (xem báo cáo L-HR).
import type { PositionRow, ReadTx } from '@ga/db/repos';
import { defineHandler, type Handler } from '../http/define-handler.ts';
import { notFound } from '../http/errors.ts';
import { asStr } from './shared.ts';

/**
 * Vị trí hiện tại của Role. Repo CHƯA có đọc `assignments` ⇒ khớp theo `position_title` của `v_roles`, không khớp thì dùng
 * Position mặc định. (Đề xuất repo: `roles.positionOf(roleId)`.)
 */
export function positionOfRole(tx: ReadTx, roleId: string): PositionRow | null {
  const title = asStr(tx.roles.view(roleId)?.position_title);
  const all = tx.roles.positions();
  const byTitle = title === null ? [] : all.filter((p) => p.title === title);
  return byTitle[0] ?? tx.roles.defaultPosition();
}

/** Người giữ vị trí: chỉ khi ĐÚNG MỘT Role chưa lưu trữ mang tên vị trí đó (mơ hồ ⇒ null, không đoán). */
function holderOf(tx: ReadTx, position: PositionRow) {
  const holders = tx.roles
    .list()
    .filter((r) => r.lifecycle_status !== 'archived')
    .filter((r) => asStr(tx.roles.view(r.id)?.position_title) === position.title);
  const only = holders.length === 1 ? holders[0] : undefined;
  return only === undefined ? null : { id: only.id, displayId: only.display_id };
}

export function positionRowOf(tx: ReadTx, positionId: string) {
  const p = tx.roles.positions().find((x) => x.id === positionId);
  if (p === undefined) throw notFound();
  return {
    id: p.id,
    displayId: p.display_id,
    title: p.title,
    jd: p.description,
    kpi: p.kpis_md,
    rewardCapMinor: p.reward_cap_minor,
    // CHƯA CHỐT ở DB: `positions` không có cột heartbeat (lịch ở proactive_jobs) ⇒ null
    heartbeat: null,
    dailyTokenQuota: p.daily_token_quota,
    holder: holderOf(tx, p),
  };
}

export const positionHandlers: readonly Handler[] = [
  defineHandler('SYS-44', ({ params }, ctx) => {
    const ref = ctx.ref('PS', params.positionRef);
    return ctx.read((tx) => positionRowOf(tx, ref.id));
  }),
];
