// Lượt AI Hệ thống (HANDLER-OBLIGATIONS #17): kết quả LLM ghi bằng actor của CHÍNH tác tử, không bao giờ 'system';
// văn bản ra đã che credential; từ chối của runTurn không để lại lượt treo.
import { randomBytes } from 'node:crypto';
import { TurnRejectedError } from '@ga/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ChatTurnRunner } from '../../src/chat/turn-runner.ts';
import { InMemoryEventBus } from '../../src/events/bus.ts';
import { memoryLogger, tk } from '../http/harness.ts';

let world: import('@ga/testkit').TestWorld;
beforeAll(() => {
  world = tk.makeWorld();
});
afterAll(() => world.close());

const A = () => world.tenants.A;

function setup(agent: 'interviewer' | 'trainer' | 'assistant') {
  const owner = A().users.owner;
  return world.store.write(
    owner.actorId,
    (tx) => {
      const role = tx.roles.create({ name: `Role ${randomBytes(3).toString('hex')}`, color: 'jade' });
      const kind = agent === 'interviewer' ? 'interview' : agent === 'trainer' ? 'training' : 'assistant';
      const thread = tx.chat.openThread({ kind, agent, roleId: agent === 'assistant' ? null : role.id });
      const msg = tx.chat.append({ threadId: thread.id, authorKind: 'owner', channel: 'web', content: 'Chào bạn' });
      return { thread, msg };
    },
    { channel: 'web' },
  );
}

function runner(sessions: InstanceType<typeof tk.FakeSessionsService>) {
  const events = new InMemoryEventBus({ clock: world.clock });
  const logger = memoryLogger();
  return { events, logger, r: new ChatTurnRunner({ store: world.store, events, sessions, logger }) };
}

describe('ChatTurnRunner', () => {
  it('tin trả lời ghi bằng actor interviewer (≠ system), author_kind interviewer, final; SSE đủ chuỗi sự kiện', async () => {
    const { thread, msg } = setup('interviewer');
    const sessions = new tk.FakeSessionsService().script({
      events: [
        { type: 'delta', text: 'Xin ' },
        { type: 'delta', text: 'chào' },
      ],
      result: { text: 'Xin chào' },
    });
    const { events, r } = runner(sessions);
    const sub = events.subscribe(A().workspaceId, { userId: A().users.owner.userId, authLevel: 'O' });
    const started = await r.start({
      workspaceId: A().workspaceId,
      threadId: thread.id,
      sourceMessageId: msg.id,
      idempotencyKey: 'k1',
    });
    await started.done;
    expect(sessions.calls[0]).toMatchObject({
      agentKind: 'interviewer',
      trigger: 'interview',
      threadId: thread.id,
      sourceMessageId: msg.id,
    });
    const interviewer = world.store.systemActorId(A().workspaceId, 'interviewer');
    const system = world.store.systemActorId(A().workspaceId, 'system');
    expect(interviewer).not.toBe(system);
    const reply = world.reader.db
      .prepare(
        "SELECT author_kind, author_actor_id, created_by, status, content FROM chat_messages WHERE thread_id = ? AND author_kind <> 'owner'",
      )
      .get(thread.id) as {
      author_kind: string;
      author_actor_id: string;
      created_by: string;
      status: string;
      content: string;
    };
    expect(reply).toEqual({
      author_kind: 'interviewer',
      author_actor_id: interviewer,
      created_by: interviewer,
      status: 'final',
      content: 'Xin chào',
    });
    sub.close();
    expect(r.isRunning(thread.id)).toBe(false);
  });

  it('thứ tự sự kiện + che credential trong delta và kết quả (bus không bao giờ nhận chuỗi thô)', async () => {
    const { thread, msg } = setup('trainer');
    const secret = `ghp_${randomBytes(24).toString('hex').slice(0, 36)}`;
    const sessions = new tk.FakeSessionsService().script({
      events: [{ type: 'delta', text: `token ${secret}` }],
      result: { text: `kết quả ${secret}` },
    });
    const { events, r } = runner(sessions);
    const sub = events.subscribe(A().workspaceId, { userId: A().users.owner.userId, authLevel: 'O' });
    const started = await r.start({
      workspaceId: A().workspaceId,
      threadId: thread.id,
      sourceMessageId: msg.id,
      idempotencyKey: 'k2',
    });
    await started.done;
    const got: Array<{ type: string; text?: string }> = [];
    for (let i = 0; i < 4; i++) got.push((await sub.next()).value as { type: string; text?: string });
    sub.close();
    expect(got.map((e) => e.type)).toEqual(['chat.turn', 'chat.delta', 'chat.message', 'chat.turn']);
    expect(JSON.stringify(got)).not.toContain(secret);
    expect(got[1]?.text).toMatch(/\[REDACTED:/);
    const row = world.reader.db
      .prepare("SELECT content, author_actor_id FROM chat_messages WHERE thread_id = ? AND author_kind = 'trainer'")
      .get(thread.id) as { content: string; author_actor_id: string };
    expect(row.content).not.toContain(secret);
    expect(row.author_actor_id).toBe(world.store.systemActorId(A().workspaceId, 'trainer'));
  });

  it('runTurn từ chối ⇒ ném TurnRejectedError, không có tin trả lời, thread không kẹt "đang chạy"', async () => {
    const { thread, msg } = setup('interviewer');
    const sessions = new tk.FakeSessionsService().script({ reject: 'recovery_mode' });
    const { r } = runner(sessions);
    const input = { workspaceId: A().workspaceId, threadId: thread.id, sourceMessageId: msg.id, idempotencyKey: 'k3' };
    await expect(r.start(input)).rejects.toBeInstanceOf(TurnRejectedError);
    expect(r.isRunning(thread.id)).toBe(false);
    const n = world.reader.db
      .prepare("SELECT count(*) AS n FROM chat_messages WHERE thread_id = ? AND author_kind <> 'owner'")
      .get(thread.id) as { n: number };
    expect(n.n).toBe(0);
  });

  it('thread trợ lý (sessions chưa có agentKind) / thread của tenant khác ⇒ từ chối, không gọi runTurn', async () => {
    const { thread, msg } = setup('assistant');
    const sessions = new tk.FakeSessionsService();
    const { r } = runner(sessions);
    await expect(
      r.start({ workspaceId: A().workspaceId, threadId: thread.id, sourceMessageId: msg.id, idempotencyKey: 'k4' }),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    const other = setup('interviewer');
    await expect(
      r.start({
        workspaceId: world.tenants.B.workspaceId,
        threadId: other.thread.id,
        sourceMessageId: other.msg.id,
        idempotencyKey: 'k5',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(sessions.calls).toHaveLength(0);
  });
});
