// SYS-30…36 — danh sách / tạo / hồ sơ / sửa / nhân bản / lưu trữ / xoá Role (A3, A1).

import { createHash } from 'node:crypto';
import { API_LIMITS, ROLE_COLORS, toDbTimestamp } from '@ga/contracts';
import type { RoleRow as DbRole, ReadTx, WriteTx } from '@ga/db/repos';
import { defineHandler, type Handler } from '../http/define-handler.ts';
import { ApiError, notFound } from '../http/errors.ts';
import { chooseAvatar, resolveAvatarChoice } from './avatar-choice.ts';
import { decodeCursor, encodeCursor } from './cursor.ts';
import { applyDnaCreate } from './dna-write.ts';
import { positionOfRole } from './positions.ts';
import { asNum, asStr, budgetOf, idOf, roleRowOf } from './shared.ts';

const DEFAULT_LIMIT = 50;

/** Màu mặc định xác định theo tên (không ngẫu nhiên: cùng tên ⇒ cùng màu, test lặp lại được). */
export function defaultColorFor(name: string): (typeof ROLE_COLORS)[number] {
  const h = createHash('sha256').update(name.trim().toLowerCase()).digest();
  return ROLE_COLORS[(h[0] ?? 0) % ROLE_COLORS.length] ?? 'jade';
}

/** Tên Role còn dùng để khớp: bỏ khoảng trắng đầu / cuối. */
const norm = (s: string) => s.trim().toLocaleLowerCase('vi');

function matchesQuery(role: DbRole, q: string): boolean {
  const needle = norm(q);
  return norm(role.name).includes(needle) || role.display_id.toLowerCase().includes(needle);
}

function listRoles(tx: ReadTx, q: { q?: string; name?: string; cursor?: string; limit?: number }) {
  const after = q.cursor === undefined ? 0 : decodeCursor(q.cursor);
  const limit = q.limit ?? DEFAULT_LIMIT;
  const all = tx.roles
    .list()
    .filter((r) => (q.name === undefined ? true : r.name === q.name))
    .filter((r) => (q.q === undefined ? true : matchesQuery(r, q.q)))
    .filter((r) => r.display_seq > after)
    .sort((a, b) => a.display_seq - b.display_seq);
  const page = all.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map((r) => roleRowOf(tx, r.id)),
    nextCursor: all.length > limit && last !== undefined ? encodeCursor(last.display_seq) : null,
  };
}

function roleRowOrThrow(tx: ReadTx, id: string): DbRole {
  const r = tx.roles.get(id);
  if (r === null || r.deleted_at !== null) throw notFound();
  return r;
}

const ACTIVE_CARD_LIFECYCLES: ReadonlySet<string> = new Set(['carded', 'suspended']);

export const roleHandlers: readonly Handler[] = [
  defineHandler('SYS-30', ({ query }, ctx) => {
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, API_LIMITS.pageMax);
    return ctx.read((tx) => listRoles(tx, { ...query, limit }));
  }),

  defineHandler('SYS-31', ({ body }, ctx) => {
    // Ref của body đi qua ctx.ref TRƯỚC khi ghi (rào IDOR); kiểm ảnh upload / sinh tự động trước khi tạo gì.
    const choice = body.avatar === undefined ? null : resolveAvatarChoice(ctx, body.avatar);
    return ctx.write(
      (tx: WriteTx) => {
        const role = tx.roles.create({
          name: body.name,
          color: body.color ?? defaultColorFor(body.name),
          description: body.description === '' ? null : body.description,
        });
        const thread = tx.chat.openThread({
          kind: 'interview',
          agent: 'interviewer',
          roleId: role.id,
          title: role.name,
          screenRoute: 'birth',
        });
        const avatar = choice === null ? null : chooseAvatar(tx, role.id, choice);
        applyDnaCreate(tx, role.id, 'identity.gender', body.gender, 'Khởi tạo hồ sơ Role');
        return {
          role: { id: role.id, displayId: role.display_id, lifecycle: 'draft' as const },
          interviewThread: idOf(thread),
          avatar: avatar === null ? null : idOf(avatar),
        };
      },
      { reason: 'role.create' },
    );
  }),

  defineHandler('SYS-32', ({ params }, ctx) => {
    const ref = ctx.ref('RL', params.roleRef);
    return ctx.read((tx) => {
      const role = roleRowOrThrow(tx, ref.id);
      const base = roleRowOf(tx, role.id);
      const position = positionOfRole(tx, role.id);
      if (position === null) throw new ApiError('internal');
      const bindings = tx.engines.bindingsForRole(role.id).map((b) => {
        const acc = tx.engines.account(b.engine_account_id);
        if (acc === null) throw new ApiError('internal');
        return {
          ...idOf(b),
          engineSlug: acc.engine_slug,
          priority: b.priority,
          loginStatus: acc.login_status,
        };
      });
      const wallet = tx.wallet.forRole(role.id);
      const wound = tx.wallet.openWound(role.id);
      const interview = tx.chat.threads({ kind: 'interview', roleId: role.id })[0] ?? null;
      const v = tx.roles.view(role.id);
      return {
        ...base,
        registryNo: role.registry_no,
        position: { ...idOf({ id: position.id, display_id: position.display_id }), title: position.title },
        bindings,
        // CHƯA CÓ repo đọc `employee_cards` ⇒ chưa điền (xem báo cáo L-HR: thiếu `cards` repo).
        card: null,
        wallet:
          wallet === null
            ? null
            : {
                balanceMinor: wallet.balance_minor,
                rank: v?.coin_rank === null || v?.coin_rank === undefined ? null : asNum(v.coin_rank),
                rankTotal: asNum(v?.total_roles),
              },
        wound: wound === null ? null : idOf(wound),
        budget: budgetOf(tx, role),
        interview: interview === null ? null : idOf(interview),
      };
    });
  }),

  defineHandler('SYS-33', ({ params, body }, ctx) => {
    const ref = ctx.ref('RL', params.roleRef);
    return ctx.write((tx) => {
      const role = roleRowOrThrow(tx, ref.id);
      // tên chỉ sửa khi còn nháp: quyết theo TRẠNG THÁI ĐÃ LƯU
      if (body.name !== undefined && body.name !== role.name && role.lifecycle_status !== 'draft') {
        throw new ApiError('db.immutable_identity');
      }
      const patch: { name?: string; color?: (typeof ROLE_COLORS)[number] } = {};
      if (body.name !== undefined) patch.name = body.name;
      if (body.color !== undefined) patch.color = body.color;
      if (Object.keys(patch).length > 0) tx.roles.update(role.id, patch);
      return roleRowOf(tx, role.id);
    });
  }),

  defineHandler('SYS-34', ({ params, body }, ctx) => {
    const ref = ctx.ref('RL', params.roleRef);
    return ctx.write((tx) => {
      const src = roleRowOrThrow(tx, ref.id);
      // Chỉ nhân bản VỎ (tên mới, màu, mô tả). Sao DN / IN lõi sang Role khác là thay đổi lõi — thuộc về owner qua change set.
      const role = tx.roles.create({ name: body.name, color: src.color, description: src.description });
      return { role: idOf(role) };
    });
  }),

  defineHandler('SYS-35', ({ params }, ctx) => {
    const ref = ctx.ref('RL', params.roleRef);
    return ctx.write((tx) => {
      const role = roleRowOrThrow(tx, ref.id);
      if (role.lifecycle_status === 'archived') return roleRowOf(tx, role.id);
      // còn thẻ hiệu lực (carded / suspended) ⇒ phải thu hồi thẻ trước
      if (ACTIVE_CARD_LIFECYCLES.has(role.lifecycle_status)) {
        throw new ApiError('conflict', { reason: 'active_card' });
      }
      tx.roles.setLifecycle(role.id, 'archived');
      return roleRowOf(tx, role.id);
    });
  }),

  defineHandler('SYS-36', ({ params, body }, ctx) => {
    const ref = ctx.ref('RL', params.roleRef);
    return ctx.write(
      (tx) => {
        const role = roleRowOrThrow(tx, ref.id);
        // ConfirmName: trùng NGUYÊN VĂN tên đã lưu (không theo tên client tự khai ở nơi khác)
        if (body.confirmName !== role.name) throw new ApiError('confirm.mismatch');
        if (ACTIVE_CARD_LIFECYCLES.has(role.lifecycle_status))
          throw new ApiError('conflict', { reason: 'active_card' });
        const graceDays = tx.settings.get('purge.grace_days') ?? 30;
        const runAfter = toDbTimestamp(new Date(ctx.clock.now().getTime() + graceDays * 86_400_000));
        tx.roles.softDelete(role.id);
        const { job } = tx.jobs.enqueue({
          kind: 'purge',
          payload: { table: 'roles', id: role.id, displayId: role.display_id },
          runAfter,
          dedupeKey: `purge:roles:${role.id}`,
        });
        return { purge: { jobDisplayId: job.display_id, state: job.status }, graceDays };
      },
      { reason: 'role.delete' },
    );
  }),
];

export { asStr };
