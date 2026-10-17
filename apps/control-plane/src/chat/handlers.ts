// Chat Ghim & Soi với AI Hệ thống (INTENT T6: chat trong app ở MVP CHỈ cho Interviewer / Trainer / trợ lý — không có Role).
//   SYS-16 danh sách thread · SYS-17 mở thread · SYS-18 lịch sử tin (mới nhất trước, con trỏ = display_seq).
// SYS-19 (gửi tin) chưa mount: `attachmentRefs: Ref<AT>[]` cần repo message_attachments + seeder chống IDOR (L-DB chưa có).

import { defineHandler, type Handler } from '../http/define-handler.ts';
import { ApiError } from '../http/errors.ts';
import { CHAT_PAGE_DEFAULT, cursorOf, isMvpThread, messageView, parseCursor, threadView } from './views.ts';

/** Thread mở được từ app ⇒ AI Hệ thống phụ trách (`tree` = chatroom nâng cấp cây, agent Trainer — DATABASE §5.17). */
export const AGENT_FOR_KIND = {
  interview: 'interviewer',
  training: 'trainer',
  tree: 'trainer',
  assistant: 'assistant',
} as const;

/** Thread gắn với một Role cụ thể ⇒ bắt buộc roleRef. */
const NEEDS_ROLE: ReadonlySet<string> = new Set(['interview', 'training']);

export const chatHandlers: readonly Handler[] = [
  defineHandler('SYS-16', ({ query }, ctx) => {
    const roleId = query.roleRef !== undefined ? ctx.ref('RL', query.roleRef).id : undefined;
    const after = parseCursor(query.cursor);
    const limit = query.limit ?? CHAT_PAGE_DEFAULT;
    return ctx.read((tx) => {
      const rows = tx.chat
        .threads({
          ...(query.kind !== undefined ? { kind: query.kind } : {}),
          ...(roleId !== undefined ? { roleId } : {}),
          ...(query.status !== undefined ? { status: query.status } : {}),
        })
        .filter(isMvpThread)
        .filter((t) => after === undefined || t.display_seq < after)
        .sort((a, b) => b.display_seq - a.display_seq);
      const page = rows.slice(0, limit);
      const last = page[page.length - 1];
      return {
        items: page.map((t) => threadView(tx, t)),
        nextCursor: rows.length > limit && last ? cursorOf(last.display_seq) : null,
      };
    });
  }),

  defineHandler('SYS-17', ({ body }, ctx) => {
    const roleId = body.roleRef !== undefined ? ctx.ref('RL', body.roleRef).id : null;
    if (NEEDS_ROLE.has(body.kind) && roleId === null) {
      throw new ApiError('validation.failed', { reason: 'role_required', field: 'body.roleRef' });
    }
    return ctx.write((tx) => {
      // AI Hệ thống chạy trên tài khoản Core agent: chưa sẵn sàng ⇒ không mở phiên (INT-20)
      const core = tx.engines.coreAgentStatus();
      if (core === null || core.is_ready !== 1) throw new ApiError('gate.core_agent_not_ready');
      let thread = tx.chat.openThread({
        kind: body.kind,
        agent: AGENT_FOR_KIND[body.kind],
        roleId,
        screenRoute: body.screenRoute ?? null,
      });
      if (body.context !== undefined) {
        // "Nhờ AI chỉnh": anchor là chuỗi STD-08, chỉ giải trong workspace của thread khi dựng prompt
        thread = tx.chat.updateThread(thread.id, {
          stateJson: JSON.stringify({ context: { intent: body.context.intent, anchors: body.context.anchors } }),
        });
      }
      return threadView(tx, thread);
    });
  }),

  defineHandler('SYS-18', ({ params, query }, ctx) => {
    const th = ctx.ref('TH', params.threadRef);
    const after = parseCursor(query.cursor);
    const limit = query.limit ?? CHAT_PAGE_DEFAULT;
    return ctx.read((tx) => {
      const thread = tx.chat.thread(th.id);
      if (thread === null || !isMvpThread(thread)) throw new ApiError('not_found');
      const page = tx.chat.messages(thread.id, { limit, order: 'desc', ...(after !== undefined ? { after } : {}) });
      return { items: page.items.map((m) => messageView(tx, m)), nextCursor: cursorOf(page.nextAfter) };
    });
  }),
];
