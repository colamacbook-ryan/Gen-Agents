// SYS-16 / 17 / 18: mở thread AI Hệ thống, liệt kê có lọc + trang, lịch sử tin (mới nhất trước) đã che credential.
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sysHandlers } from '../../src/onboarding/sys-handlers.ts';
import { makeTestApp, type TestApp } from '../http/harness.ts';

let t: TestApp;
let roleRef: string;
beforeAll(() => {
  t = makeTestApp({ handlers: sysHandlers });
  const role = t.world.store.write(
    t.world.tenants.A.users.owner.actorId,
    (tx) => tx.roles.create({ name: 'Mai', color: 'jade' }),
    { channel: 'web' },
  );
  roleRef = role.display_id;
});
afterAll(() => t.close());

type Thread = { id: string; displayId: string; kind: string; agent: string; role: { displayId: string } | null };

describe('SYS-17 mở thread', () => {
  it('interview + roleRef ⇒ agent interviewer, gắn Role; thiếu roleRef ⇒ 400; viewer ⇒ 403', async () => {
    const res = await t.as('A.admin').call('SYS-17', { body: { kind: 'interview', roleRef } });
    expect(res.status, res.text).toBe(200);
    const th = res.json as Thread;
    expect(th).toMatchObject({ kind: 'interview', agent: 'interviewer', role: { displayId: roleRef } });
    const bad = await t.as('A.admin').call('SYS-17', { body: { kind: 'training' } });
    expect(bad.status).toBe(400);
    expect(bad.detail?.field).toBe('body.roleRef');
    expect((await t.as('A.viewer').call('SYS-17', { body: { kind: 'assistant' } })).status).toBe(403);
  });

  it('tree ⇒ Trainer; context "Nhờ AI chỉnh" lưu vào state_json của thread', async () => {
    const res = await t.as('A.owner').call('SYS-17', {
      body: { kind: 'tree', context: { intent: 'adjust', anchors: [`role:${roleRef}`] } },
    });
    expect(res.status, res.text).toBe(200);
    const th = res.json as Thread;
    expect(th.agent).toBe('trainer');
    const row = t.world.reader.db.prepare('SELECT state_json FROM chat_threads WHERE id = ?').get(th.id) as {
      state_json: string;
    };
    expect(JSON.parse(row.state_json)).toEqual({ context: { intent: 'adjust', anchors: [`role:${roleRef}`] } });
  });
});

describe('SYS-16 / SYS-18', () => {
  it('lọc theo kind / roleRef, trang theo con trỏ; không thấy thread của tenant B', async () => {
    for (let i = 0; i < 3; i++) await t.as('A.owner').call('SYS-17', { body: { kind: 'assistant' } });
    t.world.store.write(
      t.world.tenants.B.users.owner.actorId,
      (tx) => tx.chat.openThread({ kind: 'assistant', agent: 'assistant' }),
      { channel: 'web' },
    );
    const p1 = await t.as('A.admin').call('SYS-16', { query: { kind: 'assistant', limit: '2' } });
    expect(p1.status, p1.text).toBe(200);
    const b1 = p1.json as { items: Thread[]; nextCursor: string | null };
    expect(b1.items).toHaveLength(2);
    expect(b1.nextCursor).not.toBeNull();
    const p2 = await t
      .as('A.admin')
      .call('SYS-16', { query: { kind: 'assistant', limit: '2', cursor: b1.nextCursor as string } });
    const b2 = p2.json as { items: Thread[]; nextCursor: string | null };
    const all = [...b1.items, ...b2.items];
    expect(all.length).toBe(3);
    expect(new Set(all.map((x) => x.id)).size).toBe(3);
    const ids = new Set(
      (
        t.world.reader.db
          .prepare('SELECT id FROM chat_threads WHERE workspace_id = ?')
          .all(t.world.tenants.B.workspaceId) as {
          id: string;
        }[]
      ).map((r) => r.id),
    );
    expect(all.some((x) => ids.has(x.id))).toBe(false);
    const byRole = await t.as('A.admin').call('SYS-16', { query: { roleRef } });
    expect((byRole.json as { items: Thread[] }).items.every((x) => x.role?.displayId === roleRef)).toBe(true);
    const bad = await t.as('A.admin').call('SYS-16', { query: { cursor: 'name; DROP' } });
    expect(bad.status).toBe(400);
  });

  it('SYS-18: mới nhất trước, trang theo con trỏ, nội dung đã che credential, tin redacted ⇒ rỗng', async () => {
    const owner = t.world.tenants.A.users.owner;
    const secret = `ghp_${randomBytes(24).toString('hex').slice(0, 36)}`;
    const th = t.world.store.write(
      owner.actorId,
      (tx) => {
        const thread = tx.chat.openThread({ kind: 'assistant', agent: 'assistant' });
        tx.chat.append({ threadId: thread.id, authorKind: 'owner', channel: 'web', content: 'một' });
        tx.chat.append({ threadId: thread.id, authorKind: 'owner', channel: 'web', content: `hai ${secret}` });
        const m3 = tx.chat.append({ threadId: thread.id, authorKind: 'owner', channel: 'web', content: 'ba' });
        tx.chat.redact(m3.id, 'test');
        return thread;
      },
      { channel: 'web' },
    );
    const p1 = await t.as('A.admin').call('SYS-18', { params: { threadRef: th.display_id }, query: { limit: '2' } });
    expect(p1.status, p1.text).toBe(200);
    const b1 = p1.json as { items: Array<{ content: string; status: string }>; nextCursor: string | null };
    expect(b1.items.map((m) => m.status)).toEqual(['redacted', 'final']);
    expect(b1.items[0]?.content).toBe('');
    expect(b1.items[1]?.content).toMatch(/^hai \[REDACTED:/);
    expect(p1.text).not.toContain(secret);
    const p2 = await t
      .as('A.admin')
      .call('SYS-18', { params: { threadRef: th.display_id }, query: { cursor: b1.nextCursor as string } });
    expect((p2.json as { items: Array<{ content: string }> }).items.map((m) => m.content)).toEqual(['một']);
  });
});
