// Họ Telegram trên SQLite: bot (TG-), allowlist (AL-), outbox gửi đi = proactive_sends (PN-). Cổng người ghi + bất biến
// "bot sống luôn có ≥ 1 chủ sở hữu active" do DB ép (mã 'telegram.owner_invariant' / 'telegram.owner_capture' /
// 'permission.*'); repo không có lối vòng.
import { invalidInput } from '../errors.ts';
import type { TelegramRepo } from '../telegram.ts';
import type { ProactiveSendRow, TelegramAllowlistRow, TelegramBotRow } from '../types.ts';
import {
  audited,
  type Ctx,
  getRow,
  insertRow,
  mustGetRow,
  nowTs,
  pageOf,
  selectAll,
  selectOne,
  softDeleteRow,
  updateRow,
  Where,
} from './ctx.ts';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function telegramRepo(ctx: Ctx): TelegramRepo {
  const live = () => new Where(ctx, { live: true });
  const bot = (id: string) => mustGetRow<TelegramBotRow>(ctx, 'telegram_bots', id);
  const botUpdate = (id: string, patch: Record<string, unknown>, action: string | null, runtime = false) => {
    const before = bot(id);
    const row = updateRow<TelegramBotRow>(ctx, 'telegram_bots', id, patch, { bumpVersion: !runtime });
    return action === null ? row : audited(ctx, { action, table: 'telegram_bots', row, before });
  };
  const allowUpdate = (id: string, patch: Record<string, unknown>, action: string) => {
    const before = mustGetRow<TelegramAllowlistRow>(ctx, 'telegram_allowlist', id);
    const row = updateRow<TelegramAllowlistRow>(ctx, 'telegram_allowlist', id, patch);
    return audited(ctx, { action, table: 'telegram_allowlist', row, before });
  };
  const sendUpdate = (id: string, patch: Record<string, unknown>, fromStatus: ProactiveSendRow['status']) =>
    updateRow<ProactiveSendRow>(ctx, 'proactive_sends', id, patch, {
      extraWhere: { sql: 'status = ?', params: [fromStatus] },
    });
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
    sentCount: (roleId, dayLocal) =>
      ctx.r.get<{ n: number }>(
        "SELECT count(*) AS n FROM proactive_sends WHERE workspace_id = ? AND role_id = ? AND day_local = ? AND status IN ('sent', 'reserved')",
        [ctx.ws, roleId, day(dayLocal)],
      )?.n ?? 0,

    createBot: (i) => {
      const row = insertRow<TelegramBotRow>(ctx, 'telegram_bots', {
        role_id: i.roleId,
        bot_username: i.botUsername,
        secret_id: i.secretId,
        token_last4: i.tokenLast4 ?? null,
      });
      return audited(ctx, { action: 'telegram_bot.create', table: 'telegram_bots', row });
    },
    setBotStatus: (id, status) => botUpdate(id, { status }, 'telegram_bot.status'),
    recordGetMe: (id, i) =>
      botUpdate(
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
      return botUpdate(id, { poll_offset: offset, last_update_at: nowTs(ctx) }, null, true);
    },
    recordPollError: (id, error) =>
      botUpdate(id, { status: 'error', error: error.slice(0, 2000) }, 'telegram_bot.poll_error', true),
    softDeleteBot: (id) => {
      const before = bot(id);
      const row = softDeleteRow<TelegramBotRow>(ctx, 'telegram_bots', id);
      audited(ctx, { action: 'telegram_bot.delete', table: 'telegram_bots', row, before });
    },
    restoreBot: (id) => botUpdate(id, { deleted_at: null }, 'telegram_bot.restore'),
    captureOwner: (botId, i) => {
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

    reserveSend: (i) =>
      insertRow<ProactiveSendRow>(ctx, 'proactive_sends', {
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
      }),
    recordSuppressed: (i) =>
      insertRow<ProactiveSendRow>(ctx, 'proactive_sends', {
        role_id: i.roleId,
        trigger_kind: i.triggerKind,
        urgency: i.urgency,
        channel: i.channel,
        day_local: day(i.dayLocal),
        status: i.status,
        reason: i.reason ?? null,
        policy_id: i.policyId ?? null,
      }),
    markSent: (id, i) =>
      sendUpdate(id, { status: 'sent', sent_at: nowTs(ctx), message_id: i?.messageId ?? null }, 'reserved'),
    markFailed: (id, error) => sendUpdate(id, { status: 'failed', error: error.slice(0, 2000) }, 'reserved'),
    expireReservations: () => {
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
