// Họ phiên (mỗi lượt headless = một hàng `sessions`, SS-) + hội thoại (chat_threads / chat_messages) — DATABASE §5.9,
// §5.17; contracts/sessions.ts (runTurn của L-GW ghi qua đây). Phiên "trạng thái rồi đóng băng": running → kết thúc,
// nội dung không sửa sau khi đóng. Tin nhắn: streaming → final / failed; final / failed → redacted (một chiều).
import type { AgentKind, Certainty, SessionPhase, SessionStatus, SessionTrigger } from '@ga/contracts';
import type {
  ChatAuthorKind,
  ChatMessageRow,
  ChatThreadKind,
  ChatThreadRow,
  Page,
  PageRequest,
  SessionRow,
} from './types.ts';

export type NativeMemoryState = SessionRow['native_memory'];

export interface SessionUsage {
  tokensInput?: number | null;
  tokensOutput?: number | null;
  tokensCacheRead?: number | null;
  tokensCacheWrite?: number | null;
  tokensThinking?: number | null;
  costMicroUsd?: number | null;
}

export interface StartSessionInput {
  agentKind: AgentKind;
  trigger: SessionTrigger;
  roleId?: string | null;
  positionId?: string | null;
  taskId?: string | null;
  threadId?: string | null;
  engineAccountId?: string | null;
  engineSlug?: string | null;
  modelKey?: string | null;
  effort?: string | null;
  cliVersion?: string | null;
  compiledPromptId?: string | null;
  containerId?: string | null;
  deliveredPromptHash?: string | null;
  /** Polaris đã render cho lượt (JSON + hash + số token) — cả ba hoặc không (CHECK). */
  polaris?: { json: string; renderHash: string; tokensRendered: number } | null;
  nativeMemory?: NativeMemoryState;
  title?: string | null;
}

export interface FinishSessionInput {
  status: Exclude<SessionStatus, 'running'>;
  errorCode?: string | null;
  exitCode?: number | null;
  durationMs?: number | null;
  coldStartMs?: number | null;
  usage?: SessionUsage;
  failoverCount?: number;
  resultJson?: string | null;
  nativeMemory?: NativeMemoryState;
  cliSessionRef?: string | null;
}

export interface SessionReads {
  get(sessionId: string): SessionRow | null;
  list(filter?: {
    roleId?: string;
    threadId?: string;
    taskId?: string;
    status?: readonly SessionStatus[];
    page?: PageRequest;
  }): Page<SessionRow>;
  /** Phiên đang chạy (status 'running'), tuỳ chọn theo Role. */
  running(roleId?: string): SessionRow[];
}

export interface SessionRepo extends SessionReads {
  /** started_at = app_now(); status 'running'. DB chặn khi Core agent / Role không đủ điều kiện (INT-20, Trọng thương…). */
  start(input: StartSessionInput): SessionRow;
  /** Pha think / run (G-13): planning | acting; phase_at = app_now(). */
  setPhase(sessionId: string, phase: SessionPhase): SessionRow;
  /** Đóng phiên (một lần): ended_at = app_now(). */
  finish(sessionId: string, input: FinishSessionInput): SessionRow;
}

export interface ChatReads {
  thread(threadId: string): ChatThreadRow | null;
  threads(filter?: { kind?: ChatThreadKind; roleId?: string; status?: ChatThreadRow['status'] }): ChatThreadRow[];
  /** Thread Telegram sống của (bot, chat). */
  telegramThread(botId: string, tgChatId: number): ChatThreadRow | null;
  message(messageId: string): ChatMessageRow | null;
  messages(threadId: string, page?: PageRequest): Page<ChatMessageRow>;
}

export interface AppendMessageInput {
  threadId: string;
  authorKind: ChatAuthorKind;
  /** Mặc định = actor của giao dịch khi tác giả là người / Role / tác tử; null cho 'external'. */
  authorActorId?: string | null;
  channel: ChatMessageRow['channel'];
  content: string;
  /** Mặc định 'final'. 'streaming' = đang sinh (chat.delta), đóng bằng finalize. */
  status?: 'streaming' | 'final' | 'failed';
  sessionId?: string | null;
  replyToId?: string | null;
  /** id tin phía ngoài (Telegram message_id) — ghi MỘT lần lúc INSERT (bất biến sau đó). */
  externalId?: string | null;
  lang?: string | null;
  certainty?: Certainty | null;
  contextTokens?: number | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
}

export interface ChatRepo extends ChatReads {
  openThread(input: {
    kind: ChatThreadKind;
    agent: ChatThreadRow['agent'];
    roleId?: string | null;
    telegramBotId?: string | null;
    tgChatId?: number | null;
    title?: string | null;
    screenRoute?: string | null;
  }): ChatThreadRow;
  updateThread(
    threadId: string,
    patch: { status?: ChatThreadRow['status']; title?: string | null; stateJson?: string | null },
  ): ChatThreadRow;
  /** Thêm tin (MSG-); cập nhật cache message_count / last_message_at của thread. */
  append(input: AppendMessageInput): ChatMessageRow;
  /** streaming → final | failed (nội dung cuối, token). */
  finalize(
    messageId: string,
    input: { status: 'final' | 'failed'; content?: string; tokensIn?: number | null; tokensOut?: number | null },
  ): ChatMessageRow;
  /** final / failed → redacted (một chiều, kèm lý do). */
  redact(messageId: string, reason: string): ChatMessageRow;
}
