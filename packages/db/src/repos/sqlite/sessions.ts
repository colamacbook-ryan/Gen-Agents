// Họ phiên (sessions: một lượt headless = một hàng) + hội thoại (chat_threads / chat_messages) trên SQLite.
import { invalidInput, permissionDenied } from '../errors.ts';
import type { ChatRepo, SessionRepo } from '../sessions.ts';
import type { ChatMessageRow, ChatThreadRow, SessionRow } from '../types.ts';
import {
  actorOf,
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
  STAFF_SYSTEM,
  selectAll,
  selectOne,
  updateRow,
  Where,
} from './ctx.ts';

const nonNeg = (v: number | null | undefined, what: string) => {
  if (v !== undefined && v !== null && (!Number.isSafeInteger(v) || v < 0))
    throw invalidInput(`${what} phải là số nguyên ≥ 0`);
  return v;
};

export function sessionRepo(ctx: Ctx): SessionRepo {
  return {
    get: (id) => getRow<SessionRow>(ctx, 'sessions', id),
    list: (f) =>
      pageOf<SessionRow>(
        ctx,
        'sessions',
        new Where(ctx)
          .eq('role_id', f?.roleId)
          .eq('thread_id', f?.threadId)
          .eq('task_id', f?.taskId)
          .in('status', f?.status),
        f?.page,
      ),
    running: (roleId) =>
      selectAll<SessionRow>(ctx, 'sessions', new Where(ctx).add("status = 'running'").eq('role_id', roleId)),
    start: (i) => {
      allow(ctx, 'sessions.start', ['system']);
      ref(ctx, 'roles', i.roleId);
      ref(ctx, 'positions', i.positionId);
      ref(ctx, 'tasks', i.taskId);
      ref(ctx, 'chat_threads', i.threadId);
      ref(ctx, 'engine_accounts', i.engineAccountId);
      ref(ctx, 'compiled_prompts', i.compiledPromptId);
      ref(ctx, 'containers', i.containerId);
      const p = i.polaris ?? null;
      if (p !== null) nonNeg(p.tokensRendered, 'polaris.tokensRendered');
      const row = insertRow<SessionRow>(ctx, 'sessions', {
        agent_kind: i.agentKind,
        trigger: i.trigger,
        role_id: i.roleId ?? null,
        position_id: i.positionId ?? null,
        task_id: i.taskId ?? null,
        thread_id: i.threadId ?? null,
        engine_account_id: i.engineAccountId ?? null,
        engine_slug: i.engineSlug ?? null,
        model_key: i.modelKey ?? null,
        effort: i.effort ?? null,
        cli_version: i.cliVersion ?? null,
        compiled_prompt_id: i.compiledPromptId ?? null,
        container_id: i.containerId ?? null,
        delivered_prompt_hash: i.deliveredPromptHash ?? null,
        polaris_json: p?.json ?? null,
        polaris_render_hash: p?.renderHash ?? null,
        polaris_tokens_rendered: p?.tokensRendered ?? null,
        native_memory: i.nativeMemory,
        title: i.title ?? null,
        started_at: nowTs(ctx),
      });
      return audited(ctx, { action: 'session.start', table: 'sessions', row });
    },
    setPhase: (id, phase) =>
      allow(ctx, 'sessions.setPhase', ['system']) &&
      updateRow<SessionRow>(
        ctx,
        'sessions',
        id,
        { phase, phase_at: nowTs(ctx) },
        { extraWhere: { sql: "status = 'running'", params: [] } },
      ),
    finish: (id, i) => {
      allow(ctx, 'sessions.finish', ['system']);
      const before = mustGetRow<SessionRow>(ctx, 'sessions', id);
      const u = i.usage ?? {};
      const ended = nowTs(ctx);
      const row = updateRow<SessionRow>(
        ctx,
        'sessions',
        id,
        {
          status: i.status,
          ended_at: ended,
          error_code: i.errorCode ?? null,
          exit_code: i.exitCode ?? null,
          duration_ms:
            nonNeg(i.durationMs, 'durationMs') ?? Math.max(0, Date.parse(ended) - Date.parse(before.started_at)),
          cold_start_ms: nonNeg(i.coldStartMs, 'coldStartMs') ?? null,
          tokens_input: nonNeg(u.tokensInput, 'tokensInput') ?? null,
          tokens_output: nonNeg(u.tokensOutput, 'tokensOutput') ?? null,
          tokens_cache_read: nonNeg(u.tokensCacheRead, 'tokensCacheRead') ?? null,
          tokens_cache_write: nonNeg(u.tokensCacheWrite, 'tokensCacheWrite') ?? null,
          tokens_thinking: nonNeg(u.tokensThinking, 'tokensThinking') ?? null,
          cost_micro_usd: nonNeg(u.costMicroUsd, 'costMicroUsd') ?? null,
          failover_count: i.failoverCount,
          result_json: i.resultJson ?? null,
          native_memory: i.nativeMemory,
          cli_session_ref: i.cliSessionRef ?? null,
        },
        { extraWhere: { sql: "status = 'running'", params: [] } },
      );
      return audited(ctx, { action: 'session.finish', table: 'sessions', row, before });
    },
  };
}

/** Đóng tin streaming: actor system hoặc chính tác giả. Trả true để nối biểu thức. */
function authorOrSystem(ctx: Ctx, messageId: string, what: string): true {
  const actor = allow(ctx, what, [...STAFF_SYSTEM, 'role']);
  if (actor.kind === 'system') return true;
  const m = mustGetRow<ChatMessageRow>(ctx, 'chat_messages', messageId);
  if (m.author_actor_id !== actor.id) throw permissionDenied(`${what}: chỉ tác giả hoặc actor system`);
  return true;
}

export function chatRepo(ctx: Ctx): ChatRepo {
  return {
    thread: (id) => getRow<ChatThreadRow>(ctx, 'chat_threads', id),
    threads: (f) =>
      selectAll<ChatThreadRow>(
        ctx,
        'chat_threads',
        new Where(ctx, { live: true }).eq('kind', f?.kind).eq('role_id', f?.roleId).eq('status', f?.status),
      ),
    telegramThread: (botId, chatId) =>
      selectOne<ChatThreadRow>(
        ctx,
        'chat_threads',
        new Where(ctx, { live: true })
          .add("kind = 'telegram'")
          .eq('telegram_bot_id', botId)
          .eq('tg_chat_id', chatId)
          .add("status <> 'archived'"),
      ),
    message: (id) => getRow<ChatMessageRow>(ctx, 'chat_messages', id),
    messages: (threadId, page) =>
      pageOf<ChatMessageRow>(ctx, 'chat_messages', new Where(ctx).eq('thread_id', threadId), page),
    openThread: (i) => {
      allow(ctx, 'chat.openThread', STAFF_SYSTEM);
      ref(ctx, 'roles', i.roleId);
      ref(ctx, 'telegram_bots', i.telegramBotId);
      const row = insertRow<ChatThreadRow>(ctx, 'chat_threads', {
        kind: i.kind,
        agent: i.agent,
        role_id: i.roleId ?? null,
        telegram_bot_id: i.telegramBotId ?? null,
        tg_chat_id: i.tgChatId ?? null,
        title: i.title ?? null,
        screen_route: i.screenRoute ?? null,
      });
      return audited(ctx, { action: 'chat_thread.open', table: 'chat_threads', row });
    },
    updateThread: (id, p) => {
      allow(ctx, 'chat.updateThread', STAFF_SYSTEM);
      const before = mustGetRow<ChatThreadRow>(ctx, 'chat_threads', id);
      const row = updateRow<ChatThreadRow>(ctx, 'chat_threads', id, {
        status: p.status,
        title: p.title,
        state_json: p.stateJson,
      });
      return audited(ctx, { action: 'chat_thread.update', table: 'chat_threads', row, before });
    },
    append: (i) => {
      const who = allow(ctx, 'chat.append', [...STAFF_SYSTEM, 'role']);
      ref(ctx, 'actors', i.authorActorId);
      ref(ctx, 'sessions', i.sessionId);
      ref(ctx, 'chat_messages', i.replyToId);
      if (
        who.kind !== 'system' &&
        i.authorActorId !== undefined &&
        i.authorActorId !== null &&
        i.authorActorId !== who.id
      ) {
        throw permissionDenied('chat.append: không ghi tin thay actor khác');
      }
      const thread = mustGetRow<ChatThreadRow>(ctx, 'chat_threads', i.threadId);
      if (who.kind === 'role' && (i.authorKind !== 'role' || thread.role_id !== who.role_id)) {
        throw permissionDenied('chat.append: Role chỉ ghi tin của chính mình trong thread của mình');
      }
      const actor = actorOf(ctx);
      const row = insertRow<ChatMessageRow>(ctx, 'chat_messages', {
        thread_id: thread.id,
        author_kind: i.authorKind,
        author_actor_id:
          i.authorActorId === undefined ? (i.authorKind === 'external' ? null : actor.id) : i.authorActorId,
        channel: i.channel,
        content: i.content,
        status: i.status ?? 'final',
        session_id: i.sessionId ?? null,
        reply_to_id: i.replyToId ?? null,
        external_id: i.externalId ?? null,
        lang: i.lang ?? null,
        certainty: i.certainty ?? null,
        context_tokens: nonNeg(i.contextTokens, 'contextTokens') ?? null,
        tokens_in: nonNeg(i.tokensIn, 'tokensIn') ?? null,
        tokens_out: nonNeg(i.tokensOut, 'tokensOut') ?? null,
      });
      // cột cache của thread (không tăng version)
      updateRow(
        ctx,
        'chat_threads',
        thread.id,
        { message_count: thread.message_count + 1, last_message_at: row.created_at },
        { bumpVersion: false },
      );
      return audited(ctx, { action: 'chat_message.append', table: 'chat_messages', row, roleId: thread.role_id });
    },
    finalize: (id, i) =>
      authorOrSystem(ctx, id, 'chat.finalize') &&
      updateRow<ChatMessageRow>(
        ctx,
        'chat_messages',
        id,
        { status: i.status, content: i.content, tokens_in: i.tokensIn, tokens_out: i.tokensOut },
        { extraWhere: { sql: "status = 'streaming'", params: [] } },
      ),
    redact: (id, reason) => {
      allow(ctx, 'chat.redact', OWNER_ADMIN);
      if (reason.trim().length === 0) throw invalidInput('ẩn tin cần lý do');
      const before = mustGetRow<ChatMessageRow>(ctx, 'chat_messages', id);
      const row = updateRow<ChatMessageRow>(
        ctx,
        'chat_messages',
        id,
        {
          status: 'redacted',
          content: '',
          redacted_at: nowTs(ctx),
          redacted_by: actorOf(ctx).id,
          redact_reason: reason,
        },
        { extraWhere: { sql: "status IN ('final', 'failed')", params: [] } },
      );
      return audited(ctx, { action: 'chat_message.redact', table: 'chat_messages', row, before, reason });
    },
  };
}
