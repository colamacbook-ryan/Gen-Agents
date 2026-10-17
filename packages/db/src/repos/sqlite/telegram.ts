// Họ Telegram trên SQLite: bot (TG-), allowlist (AL-), outbox gửi đi = proactive_sends (PN-). Cổng người ghi + bất biến
// "bot sống luôn có ≥ 1 chủ sở hữu active" do DB ép (mã 'telegram.owner_invariant' / 'telegram.owner_capture' /
// 'permission.*'); repo không có lối vòng.
import { invalidInput, permissionDenied } from '../errors.ts';
import type { TelegramRepo } from '../telegram.ts';
import type { ProactivePolicyRow, ProactiveSendRow, TelegramAllowlistRow, TelegramBotRow } from '../types.ts';
import {
  allow,
  audited,
  type Ctx,
  getRow,
  insertRow,
  mustGetRow,
  nowTs,
  OWNER_ADMIN,
  pageOf,
  ref,
  selectAll,
  selectOne,
  softDeleteRow,
  updateRow,
  Where,
  type Who,
} from './ctx.ts';
import { insertPolarisCheck } from './polaris.ts';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const flag = (v: boolean | undefined): 0 | 1 | undefined => (v === undefined ? undefined : v ? 1 : 0);
/** Trần tin chủ động / ngày (= CHECK proactive_policies.max_per_day BETWEEN 0 AND 20). */
export const PROACTIVE_MAX_PER_DAY = 20;
/** Bot + token: CHỈ owner hoặc actor system (DB telegram_bots_writer_*; Gen quyết — hẹp hơn §9.7). */
const BOT_WRITERS: readonly Who[] = ['owner', 'system'];

export function telegramRepo(ctx: Ctx): TelegramRepo {
  const live = () => new Where(ctx, { live: true });
  const bot = (id: string) => mustGetRow<TelegramBotRow>(ctx, 'telegram_bots', id);
  const botUpdate = (
    who: readonly Who[],
    id: string,
    patch: Record<string, unknown>,
    action: string | null,
    runtime = false,
  ) => {
    allow(ctx, action ?? 'telegram_bot.runtime', who);
    const before = bot(id);
    const row = updateRow<TelegramBotRow>(ctx, 'telegram_bots', id, patch, { bumpVersion: !runtime });
    return action === null ? row : audited(ctx, { action, table: 'telegram_bots', row, before });
  };
  const allowUpdate = (id: string, patch: Record<string, unknown>, action: string) => {
    allow(ctx, action, ['owner', 'admin', 'system']);
    const before = mustGetRow<TelegramAllowlistRow>(ctx, 'telegram_allowlist', id);
    const row = updateRow<TelegramAllowlistRow>(ctx, 'telegram_allowlist', id, patch);
    return audited(ctx, { action, table: 'telegram_allowlist', row, before });
  };
  const sendUpdate = (id: string, patch: Record<string, unknown>, fromStatus: ProactiveSendRow['status']) => {
    allow(ctx, 'proactive_send.update', ['system']);
    return updateRow<ProactiveSendRow>(ctx, 'proactive_sends', id, patch, {
      extraWhere: { sql: 'status = ?', params: [fromStatus] },
    });
  };
  const day = (d: string) => {
    if (!DAY_RE.test(d)) throw invalidInput('dayLocal phải là YYYY-MM-DD');
    return d;
  };
  return {
    bot: (id) => getRow<TelegramBotRow>(ctx, 'telegram_bots', id),
    botForRole: (roleId) => selectOne<TelegramBotRow>(ctx, 'telegram_bots', live().eq('role_id', roleId)),
    bots: (f) => selectAll<TelegramBotRow>(ctx, 'telegram_bots', live().in('status', f?.status)),
    allowlist: (botId) => selectAll<TelegramAllowlistRow>(ctx, 'telegram_allowlist', live().eq('bot_id', botId)),
    allowed: (botId, tgUserId) =>
      selectOne<TelegramAllowlistRow>(
        ctx,
        'telegram_allowlist',
        live().eq('bot_id', botId).eq('tg_user_id', tgUserId).add("status = 'active'"),
      ),
    owners: (botId) =>
      selectAll<TelegramAllowlistRow>(
        ctx,
        'telegram_allowlist',
        live().eq('bot_id', botId).add("is_owner = 1 AND status = 'active'"),
      ),
    send: (id) => getRow<ProactiveSendRow>(ctx, 'proactive_sends', id),
    sends: (f) =>
      pageOf<ProactiveSendRow>(
        ctx,
        'proactive_sends',
        new Where(ctx).eq('role_id', f?.roleId).in('status', f?.status),
        f?.page,
      ),
    proactivePolicy: (roleId) => selectOne<ProactivePolicyRow>(ctx, 'proactive_policies', live().eq('role_id', roleId)),
    setProactivePolicy: (roleId, i) => {
      // review bảo mật MEDIUM: Role không tự sửa hợp đồng giờ làm của mình — chỉ owner / admin (nhiều lớp với DB v2.3.5)
      allow(ctx, 'telegram.setProactivePolicy', OWNER_ADMIN);
      ref(ctx, 'roles', roleId);
      if (
        i.maxPerDay !== undefined &&
        (!Number.isSafeInteger(i.maxPerDay) || i.maxPerDay < 0 || i.maxPerDay > PROACTIVE_MAX_PER_DAY)
      ) {
        throw invalidInput(`maxPerDay phải là số nguyên 0–${PROACTIVE_MAX_PER_DAY}`);
      }
      if (i.timezone !== undefined && (i.timezone.length === 0 || i.timezone.length > 64))
        throw invalidInput('timezone lạ');
      const before = selectOne<ProactivePolicyRow>(ctx, 'proactive_policies', live().eq('role_id', roleId));
      const minute = (v: number | undefined, what: string) => {
        if (v !== undefined && (!Number.isSafeInteger(v) || v < 0 || v > 1439))
          throw invalidInput(`${what}: phút 0–1439`);
        return v;
      };
      const values: Record<string, unknown> = {
        is_enabled: i.isEnabled === undefined ? undefined : i.isEnabled ? 1 : 0,
        max_per_day: i.maxPerDay,
        quiet_start_min: minute(i.quietStartMin, 'quietStartMin'),
        quiet_end_min: minute(i.quietEndMin, 'quietEndMin'),
        timezone: i.timezone,
        break_quiet_level: i.breakQuietLevel,
        channel: i.channel,
        allow_commitment_reminder: flag(i.allow?.commitmentReminder),
        allow_task_done: flag(i.allow?.taskDone),
        allow_opportunity: flag(i.allow?.opportunity),
        allow_incident: flag(i.allow?.incident),
        allow_heartbeat_digest: flag(i.allow?.heartbeatDigest),
      };
      if (i.weekend !== undefined) {
        values.weekend_differs = i.weekend === null ? 0 : 1;
        values.weekend_quiet_start_min =
          i.weekend === null ? null : minute(i.weekend.quietStartMin, 'weekend.quietStartMin');
        values.weekend_quiet_end_min = i.weekend === null ? null : minute(i.weekend.quietEndMin, 'weekend.quietEndMin');
      }
      if (before === null) {
        if (i.quietStartMin === undefined || i.quietEndMin === undefined || i.timezone === undefined) {
          throw invalidInput('tạo hợp đồng giờ làm cần quietStartMin, quietEndMin, timezone');
        }
        const row = insertRow<ProactivePolicyRow>(ctx, 'proactive_policies', { role_id: roleId, ...values });
        return audited(ctx, { action: 'proactive_policy.create', table: 'proactive_policies', row, roleId });
      }
      const row = updateRow<ProactivePolicyRow>(ctx, 'proactive_policies', before.id, values);
      return audited(ctx, { action: 'proactive_policy.update', table: 'proactive_policies', row, before, roleId });
    },
    sentCount: (roleId, dayLocal) =>
      ctx.r.get<{ n: number }>(
        "SELECT count(*) AS n FROM proactive_sends WHERE workspace_id = ? AND role_id = ? AND day_local = ? AND status IN ('sent', 'reserved')",
        [ctx.ws, roleId, day(dayLocal)],
      )?.n ?? 0,

    createBot: (i) => {
      allow(ctx, 'telegram.createBot', BOT_WRITERS);
      const row = insertRow<TelegramBotRow>(ctx, 'telegram_bots', {
        role_id: ref(ctx, 'roles', i.roleId),
        bot_username: i.botUsername,
        secret_id: ref(ctx, 'secrets', i.secretId),
        token_last4: i.tokenLast4 ?? null,
      });
      return audited(ctx, { action: 'telegram_bot.create', table: 'telegram_bots', row });
    },
    setBotStatus: (id, status) => botUpdate(BOT_WRITERS, id, { status }, 'telegram_bot.status'),
    recordGetMe: (id, i) =>
      botUpdate(
        ['system'],
        id,
        i.ok
          ? { status: 'active', bot_tg_id: i.botTgId, getme_ok_at: nowTs(ctx), error: null }
          : { status: 'error', error: i.error.slice(0, 2000) },
        'telegram_bot.getme',
        true,
      ),
    advanceOffset: (id, offset) => {
      if (!Number.isSafeInteger(offset) || offset < 0) throw invalidInput('offset phải là số nguyên ≥ 0');
      const before = bot(id);
      if (offset < before.poll_offset) throw invalidInput('poll_offset chỉ tiến');
      return botUpdate(['system'], id, { poll_offset: offset, last_update_at: nowTs(ctx) }, null, true);
    },
    recordPollError: (id, error) =>
      botUpdate(['system'], id, { status: 'error', error: error.slice(0, 2000) }, 'telegram_bot.poll_error', true),
    softDeleteBot: (id) => {
      allow(ctx, 'telegram.softDeleteBot', BOT_WRITERS);
      const before = bot(id);
      const row = softDeleteRow<TelegramBotRow>(ctx, 'telegram_bots', id);
      audited(ctx, { action: 'telegram_bot.delete', table: 'telegram_bots', row, before });
    },
    restoreBot: (id) => botUpdate(['owner'], id, { deleted_at: null }, 'telegram_bot.restore'),
    captureOwner: (botId, i) => {
      // capture user ID đã xác minh: owner của workspace, hoặc gateway (actor system) khi bot chưa có chủ (DB ép thêm)
      allow(ctx, 'telegram.captureOwner', BOT_WRITERS);
      bot(botId);
      const row = insertRow<TelegramAllowlistRow>(ctx, 'telegram_allowlist', {
        bot_id: botId,
        tg_user_id: i.tgUserId,
        display_name: i.displayName,
        is_owner: 1,
        added_via: 'capture',
      });
      return audited(ctx, { action: 'telegram_allowlist.capture_owner', table: 'telegram_allowlist', row });
    },
    addAllowed: (botId, i) => {
      allow(ctx, 'telegram.addAllowed', OWNER_ADMIN);
      bot(botId);
      const row = insertRow<TelegramAllowlistRow>(ctx, 'telegram_allowlist', {
        bot_id: botId,
        tg_user_id: i.tgUserId,
        display_name: i.displayName,
        added_via: i.addedVia,
      });
      return audited(ctx, { action: 'telegram_allowlist.add', table: 'telegram_allowlist', row });
    },
    removeAllowed: (id) => allowUpdate(id, { status: 'removed' }, 'telegram_allowlist.remove'),

    reserveSend: (i) => {
      const actor = allow(ctx, 'telegram.reserveSend', ['system', 'role']);
      if (actor.kind === 'role' && actor.role_id !== i.roleId) {
        throw permissionDenied('telegram.reserveSend: Role chỉ giữ chỗ tin của chính mình');
      }
      ref(ctx, 'roles', i.roleId);
      ref(ctx, 'proactive_policies', i.policyId);
      ref(ctx, 'tasks', i.taskId);
      ref(ctx, 'commitments', i.commitmentId);
      ref(ctx, 'proactive_jobs', i.proactiveJobId);
      const id = ctx.newId();
      insertPolarisCheck(ctx, i.roleId, { kind: 'proactive', proactiveSendId: id }, i.polaris);
      return insertRow<ProactiveSendRow>(ctx, 'proactive_sends', {
        id,
        role_id: i.roleId,
        trigger_kind: i.triggerKind,
        urgency: i.urgency,
        channel: i.channel,
        day_local: day(i.dayLocal),
        status: 'reserved',
        reserved_until: i.reservedUntil,
        idempotency_key: i.idempotencyKey ?? null,
        policy_id: i.policyId ?? null,
        task_id: i.taskId ?? null,
        commitment_id: i.commitmentId ?? null,
        proactive_job_id: i.proactiveJobId ?? null,
      });
    },
    recordSuppressed: (i) => {
      allow(ctx, 'telegram.recordSuppressed', ['system']);
      ref(ctx, 'proactive_policies', i.policyId);
      return insertRow<ProactiveSendRow>(ctx, 'proactive_sends', {
        role_id: ref(ctx, 'roles', i.roleId),
        trigger_kind: i.triggerKind,
        urgency: i.urgency,
        channel: i.channel,
        day_local: day(i.dayLocal),
        status: i.status,
        reason: i.reason ?? null,
        policy_id: i.policyId ?? null,
      });
    },
    markSent: (id, i) =>
      sendUpdate(
        id,
        { status: 'sent', sent_at: nowTs(ctx), message_id: ref(ctx, 'chat_messages', i?.messageId) ?? null },
        'reserved',
      ),
    markFailed: (id, error) => sendUpdate(id, { status: 'failed', error: error.slice(0, 2000) }, 'reserved'),
    expireReservations: () => {
      allow(ctx, 'telegram.expireReservations', ['system']);
      const now = nowTs(ctx);
      let n = 0;
      for (const r of selectAll<ProactiveSendRow>(
        ctx,
        'proactive_sends',
        new Where(ctx).add("status = 'reserved'").add('reserved_until < ?', now),
      )) {
        sendUpdate(r.id, { status: 'expired' }, 'reserved');
        n++;
      }
      return n;
    },
  };
}
