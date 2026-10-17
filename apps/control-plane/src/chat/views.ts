// Chiếu hàng chat của repo sang hình hợp đồng (SYS-16 / 17 / 18) + con trỏ trang. Không SQL.
//   - Con trỏ = `display_seq` thập phân của hàng cuối trang (keyset của repo, DATABASE §8.3) — chỉ là số, không bao giờ là tên
//     cột; sai dạng ⇒ 400.
//   - Nội dung tin che credential LẦN NỮA khi đọc (người ghi đã che — phòng thủ hai lớp); tin `redacted` ⇒ chuỗi rỗng.
import { THREAD_KINDS } from '@ga/contracts';
import type { ChatMessageRow, ChatThreadRow, ReadTx } from '@ga/db/repos';
import { redactText } from '@ga/security';
import { ApiError } from '../http/errors.ts';

export const CHAT_PAGE_DEFAULT = 50;
const CURSOR_RE = /^[1-9][0-9]{0,14}$/;

export function parseCursor(cursor: string | undefined): number | undefined {
  if (cursor === undefined) return undefined;
  if (!CURSOR_RE.test(cursor)) throw new ApiError('validation.failed', { reason: 'cursor', field: 'query.cursor' });
  return Number(cursor);
}

export const cursorOf = (seq: number | null): string | null => (seq === null ? null : String(seq));

const MVP_KINDS: ReadonlySet<string> = new Set(THREAD_KINDS);
export const isMvpThread = (t: ChatThreadRow): boolean => MVP_KINDS.has(t.kind);

type ThreadKind = (typeof THREAD_KINDS)[number];

export function threadView(tx: ReadTx, t: ChatThreadRow) {
  const role = t.role_id ? tx.roles.get(t.role_id) : null;
  return {
    id: t.id,
    displayId: t.display_id,
    kind: t.kind as ThreadKind,
    agent: t.agent,
    role: role ? { id: role.id, displayId: role.display_id } : null,
    title: (t.title ?? '').slice(0, 200),
    status: t.status,
    // Tiến độ nhóm câu hỏi (Interviewer) chưa có nguồn ở DB ⇒ null.
    progress: null,
    lastMessageAt: t.last_message_at,
    messageCount: t.message_count,
  };
}

export function messageView(tx: ReadTx, m: ChatMessageRow) {
  const session = m.session_id ? tx.sessions.get(m.session_id) : null;
  return {
    id: m.id,
    displayId: m.display_id,
    authorKind: m.author_kind,
    channel: m.channel,
    content: m.status === 'redacted' ? '' : redactText(m.content).slice(0, 65_536),
    status: m.status,
    contextTokens: m.context_tokens,
    tokensIn: m.tokens_in,
    tokensOut: m.tokens_out,
    session: session ? { id: session.id, displayId: session.display_id } : null,
    // message_anchors / message_attachments / công cụ / ui_actions: L-DB chưa có repo đọc ⇒ rỗng (báo Gen).
    anchors: [],
    attachments: [],
    tools: [],
    uiActionCount: 0,
    certainty: m.certainty,
    at: m.created_at,
  };
}
