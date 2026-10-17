// Lượt AI Hệ thống trong chat Ghim & Soi (SYS-19 dùng — chưa mount, xem handlers.ts). HANDLER-OBLIGATIONS #17:
//   KẾT QUẢ CỦA LLM được ghi bằng actor của CHÍNH tác tử (`systemActorId(ws, 'interviewer' | 'trainer')`), KHÔNG BAO GIỜ
//   bằng actor `'system'` (actor đó chỉ cho mã nền tảng tất định). Tin của owner ghi ở handler bằng actor của phiên.
//   - Chỉ thread của AI Hệ thống mà runTurn hỗ trợ (`AGENT_KINDS`): interviewer, trainer. Thread `role` (Telegram) và
//     `assistant` (hợp đồng sessions chưa có agentKind 'assistant') ⇒ từ chối (fail-closed).
//   - Văn bản ra (delta + kết quả) qua `redactText` trước khi vào bus / DB; bus còn tự quét credential.
//   - Một lượt / thread tại một thời điểm; `cancel` huỷ lượt đang chạy.
import type { SessionsService, TurnHandle, TurnRequest } from '@ga/contracts';
import type { DataStore } from '@ga/db/repos';
import { redactText } from '@ga/security';
import type { EventBus } from '../events/bus.ts';
import { ApiError } from '../http/errors.ts';
import type { Logger } from '../http/logger.ts';

/** agent của thread ⇒ tác tử chạy lượt + actor ghi kết quả + author_kind của tin trả lời. */
export const TURN_AGENTS = {
  interviewer: { agentKind: 'interviewer', trigger: 'interview', actorKey: 'interviewer', authorKind: 'interviewer' },
  trainer: { agentKind: 'trainer', trigger: 'training', actorKey: 'trainer', authorKind: 'trainer' },
} as const;
type TurnAgent = keyof typeof TURN_AGENTS;

const isTurnAgent = (a: string): a is TurnAgent => Object.hasOwn(TURN_AGENTS, a);

export interface TurnRunnerDeps {
  store: DataStore;
  events: EventBus;
  sessions: SessionsService;
  logger: Logger;
}

export interface StartTurnInput {
  workspaceId: string;
  threadId: string;
  /** Tin của owner kích hoạt lượt (compiler đọc từ DB — không truyền văn bản thô). */
  sourceMessageId: string;
  idempotencyKey: string;
}

export interface StartedTurn {
  state: 'running';
  sessionId: string;
  /** Xong khi tin trả lời đã ghi (test / tắt máy chờ). */
  done: Promise<void>;
}

const MAX_DELTA = 16_384;

export class ChatTurnRunner {
  private readonly d: TurnRunnerDeps;
  private readonly running = new Map<string, TurnHandle | null>();

  constructor(deps: TurnRunnerDeps) {
    this.d = deps;
  }

  isRunning(threadId: string): boolean {
    return this.running.has(threadId);
  }

  /** Huỷ lượt đang chạy của thread. `idle` = không có lượt nào. */
  cancel(threadId: string): 'cancelled' | 'idle' {
    const h = this.running.get(threadId);
    if (h === undefined) return 'idle';
    h?.cancel('owner_cancel');
    return 'cancelled';
  }

  async start(input: StartTurnInput): Promise<StartedTurn> {
    const { store } = this.d;
    const ws = input.workspaceId;
    const thread = store.read(ws, (tx) => tx.chat.thread(input.threadId));
    if (thread === null) throw new ApiError('not_found');
    if (!isTurnAgent(thread.agent)) throw new ApiError('validation.failed', { reason: 'thread_agent' });
    if (thread.status !== 'open') throw new ApiError('conflict', { reason: 'thread_not_open' });
    if (this.running.has(thread.id)) throw new ApiError('conflict', { reason: 'turn_in_progress' });
    const spec = TURN_AGENTS[thread.agent];
    // actor ghi kết quả = actor của tác tử; thiếu ⇒ repo ném (không bao giờ rơi về 'system')
    const agentActorId = store.systemActorId(ws, spec.actorKey);
    this.running.set(thread.id, null);
    let handle: TurnHandle;
    try {
      const req: TurnRequest = {
        workspaceId: ws,
        agentKind: spec.agentKind,
        trigger: spec.trigger,
        roleId: null,
        taskId: null,
        threadId: thread.id,
        sourceMessageId: input.sourceMessageId,
        idempotencyKey: input.idempotencyKey,
        timeoutMs: null,
        measure: null,
      };
      handle = await this.d.sessions.runTurn(req);
    } catch (e) {
      this.running.delete(thread.id);
      this.publish(ws, {
        type: 'chat.turn',
        threadId: thread.id,
        state: 'rejected',
        sessionDisplayId: null,
        rejection: null,
      });
      throw e;
    }
    this.running.set(thread.id, handle);
    const done = this.consume(ws, thread.id, agentActorId, spec.authorKind, handle).finally(() => {
      this.running.delete(thread.id);
    });
    return { state: 'running', sessionId: handle.sessionId, done };
  }

  private publish(ws: string, ev: Parameters<EventBus['publish']>[1]): void {
    try {
      this.d.events.publish(ws, ev);
    } catch (err) {
      // bus từ chối (vd còn sót chuỗi giống credential) ⇒ bỏ sự kiện đó, không làm hỏng lượt
      this.d.logger.log('warn', 'chat.event_rejected', { type: ev.type, err });
    }
  }

  private async consume(
    ws: string,
    threadId: string,
    agentActorId: string,
    authorKind: (typeof TURN_AGENTS)[TurnAgent]['authorKind'],
    handle: TurnHandle,
  ): Promise<void> {
    const { store } = this.d;
    const sessionRow = store.read(ws, (tx) => tx.sessions.get(handle.sessionId));
    const reply = store.write(agentActorId, (tx) =>
      tx.chat.append({
        threadId,
        authorKind,
        channel: 'web',
        content: '',
        status: 'streaming',
        sessionId: sessionRow ? sessionRow.id : null,
      }),
    );
    const sessionDisplayId = sessionRow?.display_id ?? null;
    this.publish(ws, { type: 'chat.turn', threadId, state: 'running', sessionDisplayId, rejection: null });
    try {
      for await (const ev of handle.events) {
        if (ev.type === 'delta') {
          const text = redactText(ev.text).slice(0, MAX_DELTA);
          this.publish(ws, { type: 'chat.delta', threadId, messageId: reply.id, text });
        } else if (ev.type === 'tool') {
          this.publish(ws, {
            type: 'chat.tool',
            threadId,
            messageId: reply.id,
            tool: ev.name,
            stage: ev.stage,
            deniedCode: ev.deniedCode,
          });
        }
      }
      const result = await handle.result;
      const ok = result.status === 'ok';
      const final = store.write(agentActorId, (tx) =>
        tx.chat.finalize(reply.id, {
          status: ok ? 'final' : 'failed',
          content: redactText(result.text),
          tokensIn: result.usage.input,
          tokensOut: result.usage.output,
        }),
      );
      this.publish(ws, {
        type: 'chat.message',
        threadId,
        messageId: final.id,
        messageDisplayId: final.display_id,
        authorKind,
        status: final.status,
      });
      this.publish(ws, {
        type: 'chat.turn',
        threadId,
        state: result.status === 'cancelled' ? 'cancelled' : ok ? 'done' : 'failed',
        sessionDisplayId,
        rejection: null,
      });
    } catch (err) {
      this.d.logger.log('error', 'chat.turn_failed', { threadId, err });
      try {
        store.write(agentActorId, (tx) => tx.chat.finalize(reply.id, { status: 'failed' }));
      } catch (e2) {
        this.d.logger.log('error', 'chat.turn_finalize_failed', { threadId, err: e2 });
      }
      this.publish(ws, { type: 'chat.turn', threadId, state: 'failed', sessionDisplayId, rejection: null });
    }
  }
}
