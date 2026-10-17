// SessionsService GIẢ (CHỈ TEST) theo contracts/sessions.ts (CNS-151): L-SYS / L-WORK chạy lượt trước khi L-GW xong.
//   - `runTurn` kiểm `TurnRequest` (zod của contracts) — request sai ⇒ ném ZodError như bản thật nên làm.
//   - Kịch bản mỗi lượt: từ chối (`reject`), hoặc phát `events` rồi trả `result` (mặc định: lượt ok, văn bản cố định).
//   - Ghi lại mọi request để test khẳng định (`calls`).
import {
  type SessionsService,
  type TurnEvent,
  type TurnHandle,
  TurnRejectedError,
  type TurnRejection,
  TurnRequest,
  type TurnResult,
} from '@ga/contracts';

export interface FakeTurnScript {
  reject?: TurnRejection;
  events?: TurnEvent[];
  result?: Partial<TurnResult>;
}

const ZERO_USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, thinking: 0, costMicroUsd: 0 };

export class FakeSessionsService implements SessionsService {
  readonly calls: TurnRequest[] = [];
  readonly cancelled: Array<{ sessionId: string; reason: string }> = [];
  private readonly queue: FakeTurnScript[] = [];
  private seq = 0;

  /** Kịch bản cho các lượt kế tiếp (FIFO); hết kịch bản ⇒ lượt ok mặc định. */
  script(...turns: FakeTurnScript[]): this {
    this.queue.push(...turns);
    return this;
  }

  async runTurn(req: TurnRequest): Promise<TurnHandle> {
    const parsed = TurnRequest.parse(req);
    this.calls.push(parsed);
    const s = this.queue.shift() ?? {};
    if (s.reject) throw new TurnRejectedError(s.reject);
    this.seq++;
    const sessionId = `FAKESESS${String(this.seq).padStart(18, '0')}`;
    const events = s.events ?? [];
    const result: TurnResult = {
      sessionId,
      status: 'ok',
      outcome: 'ok',
      classification: { outcome: 'ok', resetAt: null, detail: null },
      usage: ZERO_USAGE,
      nativeMemory: 'off',
      failoverCount: 0,
      durationMs: 0,
      text: 'fake turn ok',
      certainty: null,
      phase: null,
      ...s.result,
    };
    return {
      sessionId,
      events: (async function* () {
        for (const e of events) yield e;
      })(),
      result: Promise.resolve(result),
      cancel: (reason: string) => {
        this.cancelled.push({ sessionId, reason });
      },
    };
  }
}
