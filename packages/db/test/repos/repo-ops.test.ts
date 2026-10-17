// Repo SQLite thật — engines / sessions / chat / tasks / jobs / ví / Telegram trên fixture (Core agent sẵn sàng).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFixture, type Fixture } from '../../src/repos/fixture/index.ts';
import type { RoleRow } from '../../src/repos/index.ts';

let f: Fixture;
let role: RoleRow;
beforeEach(() => {
  f = createFixture({ roles: 1 });
  role = f.roles[0] as RoleRow;
});
afterEach(() => f.close());

const rule = (r: string) => expect.objectContaining({ rule: r });

describe('engines', () => {
  it('Core agent: view sẵn sàng, mốc khoá loại; kiểm đăng nhập mới nhất; capability upsert + missing', () => {
    const acc = f.coreAccount as NonNullable<Fixture['coreAccount']>;
    f.store.read(f.workspaceId, (tx) => {
      expect(tx.engines.coreAgentStatus()?.mode).toBe('ok');
      expect(tx.workspace.get().core_agent_locked_at).not.toBeNull();
      expect(tx.engines.latestLoginCheck(acc.id)?.status).toBe('ok');
      expect(tx.engines.systemBindings()).toHaveLength(1);
      expect(tx.engines.install(f.coreEngine)?.install_state).toBe('installed');
    });
    const probe = f.store.write(f.systemActorId, (tx) =>
      tx.engines.startProbe({
        engineAccountId: acc.id,
        trigger: 'install',
        authMode: 'oauth',
        containerId: f.systemContainerId,
      }),
    );
    const caps = (items: { k: string; state: 'known' | 'unknown' }[]) =>
      f.store.write(f.systemActorId, (tx) =>
        tx.engines.upsertCapabilities({
          engineAccountId: acc.id,
          probeRunId: probe.id,
          authMode: 'oauth',
          items: items.map((x, i) => ({
            kind: 'model' as const,
            itemKey: x.k,
            valueState: x.state,
            unknownReason: x.state === 'unknown' ? 'chưa kiểm' : null,
            source: 'probe',
            confidence: 'direct' as const,
            ordinal: i,
          })),
        }),
      );
    expect(
      caps([
        { k: 'm-a', state: 'known' },
        { k: 'm-b', state: 'unknown' },
      ]),
    ).toEqual({ inserted: 2, updated: 0, missing: 0 });
    expect(caps([{ k: 'm-a', state: 'known' }])).toEqual({ inserted: 0, updated: 1, missing: 1 });
    f.store.write(f.systemActorId, (tx) => tx.engines.finishProbe(probe.id, { status: 'ok' }));
    expect(() =>
      f.store.write(f.systemActorId, (tx) => tx.engines.finishProbe(probe.id, { status: 'failed' })),
    ).toThrow(rule('repo.version_conflict'));
  });

  it('owner bấm đăng nhập lại ⇒ in_progress + login_started_at = app_now(); kết quả chỉ actor system', () => {
    const acc = f.coreAccount as NonNullable<Fixture['coreAccount']>;
    const a = f.store.write(f.ownerActorId, (tx) => tx.engines.beginLogin(acc.id));
    expect(a.login_status).toBe('in_progress');
    expect(f.store.read(f.workspaceId, (tx) => tx.engines.account(acc.id)?.login_started_at)).toBe(
      f.clock.now().toISOString(),
    );
    expect(() =>
      f.store.write(f.ownerActorId, (tx) => tx.engines.recordLoginResult(acc.id, { loginStatus: 'logged_in' })),
    ).toThrow(rule('permission.denied'));
  });
});

describe('sessions + chat', () => {
  it('phiên Role: start → phase → finish (một lần); tin streaming → final → redacted', () => {
    const s = f.store.write(f.systemActorId, (tx) =>
      tx.sessions.start({ agentKind: 'role', trigger: 'chat', roleId: role.id }),
    );
    expect(s.status).toBe('running');
    f.store.write(f.systemActorId, (tx) => tx.sessions.setPhase(s.id, 'acting'));
    const done = f.store.write(f.systemActorId, (tx) =>
      tx.sessions.finish(s.id, { status: 'ok', usage: { tokensInput: 10, tokensOutput: 5 } }),
    );
    expect(done).toMatchObject({ status: 'ok', tokens_input: 10, phase: 'acting' });
    expect(() => f.store.write(f.systemActorId, (tx) => tx.sessions.finish(s.id, { status: 'error' }))).toThrow(
      rule('repo.version_conflict'),
    );
    const th = f.store.write(f.ownerActorId, (tx) =>
      tx.chat.openThread({ kind: 'workspace', agent: 'role', roleId: role.id }),
    );
    const m = f.store.write(f.ownerActorId, (tx) =>
      tx.chat.append({ threadId: th.id, authorKind: 'owner', channel: 'web', content: 'chào', status: 'streaming' }),
    );
    expect(f.store.read(f.workspaceId, (tx) => tx.chat.thread(th.id)?.message_count)).toBe(1);
    f.store.write(f.ownerActorId, (tx) => tx.chat.finalize(m.id, { status: 'final', content: 'chào bạn' }));
    const red = f.store.write(f.ownerActorId, (tx) => tx.chat.redact(m.id, 'lỡ gửi'));
    expect(red).toMatchObject({ status: 'redacted', content: '', redact_reason: 'lỡ gửi' });
    // audit bảng nhạy cảm chỉ có hash
    const a = f.store.read(f.workspaceId, (tx) => tx.audit.list({ action: 'chat_message.append' }).items[0]);
    expect(a?.after_json).not.toContain('chào');
    expect(a?.after_json).toContain('sha256:');
  });
});

describe('tasks + jobs', () => {
  it('việc: tạo, chuyển trạng thái, đánh giá; hết trạng thái cuối thì không mở lại', () => {
    const t = f.store.write(f.ownerActorId, (tx) => tx.tasks.create({ title: 'Báo cáo tuần', source: 'web' }));
    expect(t).toMatchObject({ display_id: 'TK-0001', status: 'todo', requested_by: f.ownerActorId });
    f.store.write(f.ownerActorId, (tx) => tx.tasks.transition(t.id, 'done', { resultSummary: 'xong' }));
    const v = f.store.write(f.ownerActorId, (tx) => tx.tasks.verify(t.id, 'verified'));
    expect(v).toMatchObject({ verification: 'verified', verified_by: f.ownerActorId });
    expect(() => f.store.write(f.ownerActorId, (tx) => tx.tasks.transition(t.id, 'queued'))).toThrow(
      rule('repo.version_conflict'),
    );
    expect(f.store.read(f.workspaceId, (tx) => tx.tasks.getByDisplayId('TK-0001')?.id)).toBe(t.id);
  });

  it('jobs: dedupe queued, claim theo hạn + lease, heartbeat chủ khác bị từ chối, fail → dead, reap', () => {
    const sys = f.systemActorId;
    const a = f.store.write(sys, (tx) =>
      tx.jobs.enqueue({ kind: 'probe', payload: { n: 1 }, dedupeKey: 'p:1', maxAttempts: 2 }),
    );
    expect(
      f.store.write(sys, (tx) => tx.jobs.enqueue({ kind: 'probe', payload: { n: 2 }, dedupeKey: 'p:1' })).deduped,
    ).toBe(true);
    f.store.write(sys, (tx) => tx.jobs.enqueue({ kind: 'probe', payload: {}, runAfter: '2026-10-18T00:00:00.000Z' }));
    const claimed = f.store.write(sys, (tx) => tx.jobs.claim({ leaseOwner: 'w1', leaseMs: 1000, limit: 5 }));
    expect(claimed.map((j) => j.id)).toEqual([a.job.id]);
    expect(() => f.store.write(sys, (tx) => tx.jobs.heartbeat(a.job.id, 'w2', 1000))).toThrow(
      rule('repo.version_conflict'),
    );
    expect(f.store.write(sys, (tx) => tx.jobs.fail(a.job.id, 'w1', { error: 'x', retryAfterMs: 100 })).status).toBe(
      'queued',
    );
    f.clock.advance(200);
    f.store.write(sys, (tx) => tx.jobs.claim({ leaseOwner: 'w1', leaseMs: 1000 }));
    f.clock.advance(5000);
    expect(f.store.write(sys, (tx) => tx.jobs.reapExpiredLeases())).toBe(1);
    expect(f.store.read(f.workspaceId, (tx) => tx.jobs.get(a.job.id)?.status)).toBe('dead');
  });
});

describe('ví', () => {
  it('cấp ₲ có bằng chứng audit (hash chụp lại) ⇒ số dư; sao kê theo ví', () => {
    const { w, ev } = f.store.write(f.ownerActorId, (tx) => ({
      w: tx.wallet.openRoleWallet(role.id),
      ev: tx.audit.append({ action: 'wallet.grant_request', entity: { type: 'roles', id: role.id } }),
    }));
    const e = f.store.write(f.ownerActorId, (tx) =>
      tx.wallet.post({
        entryType: 'grant',
        debitWalletId: tx.wallet.treasury().id,
        creditWalletId: w.id,
        amountMinor: 5000,
        reason: 'cấp vốn',
        evidenceAuditId: ev.id,
      }),
    );
    expect(e).toMatchObject({
      evidence_hash: ev.row_hash,
      evidence_audit_display_id: ev.display_id,
      recorded_by: f.ownerActorId,
    });
    expect(f.store.read(f.workspaceId, (tx) => tx.wallet.forRole(role.id)?.balance_minor)).toBe(5000);
    expect(f.store.read(f.workspaceId, (tx) => tx.wallet.entries({ walletId: w.id }).items)).toHaveLength(1);
  });
});

describe('Telegram', () => {
  it('bot pending (owner), getMe chỉ system, capture owner, allowlist, offset chỉ tiến', () => {
    const secret = f.store.write(f.ownerActorId, (tx) =>
      tx.secrets.create({
        kind: 'telegram_bot_token',
        label: 'bot',
        ciphertext: Buffer.from([1]),
        nonce: Buffer.from([2]),
        wrappedDek: Buffer.from([3]),
        dekNonce: Buffer.from([4]),
        kekId: 'k1',
        fingerprint: 'fp',
      }),
    );
    const bot = f.store.write(f.ownerActorId, (tx) =>
      tx.telegram.createBot({ roleId: role.id, botUsername: 'mai_bot', secretId: secret.id, tokenLast4: 'Q7x1' }),
    );
    expect(bot.status).toBe('pending');
    expect(() =>
      f.store.write(f.ownerActorId, (tx) => tx.telegram.recordGetMe(bot.id, { ok: true, botTgId: 42 })),
    ).toThrow(rule('permission.denied'));
    expect(
      f.store.write(f.systemActorId, (tx) => tx.telegram.recordGetMe(bot.id, { ok: true, botTgId: 42 })).status,
    ).toBe('active');
    const owner = f.store.write(f.ownerActorId, (tx) =>
      tx.telegram.captureOwner(bot.id, { tgUserId: 1001, displayName: 'Chủ' }),
    );
    const guest = f.store.write(f.ownerActorId, (tx) =>
      tx.telegram.addAllowed(bot.id, { tgUserId: 2002, displayName: 'Khách', addedVia: 'manual' }),
    );
    f.store.read(f.workspaceId, (tx) => {
      expect(tx.telegram.allowed(bot.id, 1001)?.id).toBe(owner.id);
      expect(tx.telegram.allowed(bot.id, 3003)).toBeNull();
      expect(tx.telegram.owners(bot.id)).toHaveLength(1);
    });
    f.store.write(f.ownerActorId, (tx) => tx.telegram.removeAllowed(guest.id));
    f.store.write(f.systemActorId, (tx) => tx.telegram.advanceOffset(bot.id, 10));
    expect(() => f.store.write(f.systemActorId, (tx) => tx.telegram.advanceOffset(bot.id, 9))).toThrow(
      rule('repo.invalid_input'),
    );
  });

  it('outbox proactive_sends: giữ chỗ → gửi; idempotency trùng ⇒ unique.duplicate; hết hạn ⇒ expired', () => {
    const sys = f.systemActorId;
    const base = {
      roleId: role.id,
      triggerKind: 'task_done' as const,
      urgency: 'normal' as const,
      channel: 'telegram' as const,
      dayLocal: '2026-10-17',
      reservedUntil: '2026-10-17T08:05:00.000Z',
      polaris: { expectedGainMinor: 0, rulesApplied: 'P1', rationale: 'báo việc xong' },
      policyId: null as string | null,
    };
    expect(() => f.store.write(sys, (tx) => tx.telegram.reserveSend({ ...base, idempotencyKey: 'k0' }))).toThrow(
      rule('proactive.daily_cap'),
    );
    const policy = f.store.write(f.ownerActorId, (tx) =>
      tx.telegram.setProactivePolicy(role.id, {
        maxPerDay: 2,
        quietStartMin: 22 * 60,
        quietEndMin: 7 * 60,
        timezone: 'Asia/Ho_Chi_Minh',
      }),
    );
    base.policyId = policy.id;
    const s1 = f.store.write(sys, (tx) => tx.telegram.reserveSend({ ...base, idempotencyKey: 'k1' }));
    expect(() => f.store.write(sys, (tx) => tx.telegram.reserveSend({ ...base, idempotencyKey: 'k1' }))).toThrow(
      rule('unique.duplicate'),
    );
    f.store.write(sys, (tx) => tx.telegram.markSent(s1.id));
    f.store.write(sys, (tx) => tx.telegram.reserveSend({ ...base, idempotencyKey: 'k2' }));
    expect(f.store.read(f.workspaceId, (tx) => tx.telegram.sentCount(role.id, '2026-10-17'))).toBe(2);
    f.clock.advance(10 * 60_000);
    expect(f.store.write(sys, (tx) => tx.telegram.expireReservations())).toBe(1);
    // trần 2 / ngày đã đủ (sent + expired) ⇒ chặn
    expect(() => f.store.write(sys, (tx) => tx.telegram.reserveSend({ ...base, idempotencyKey: 'k3' }))).toThrow(
      rule('proactive.daily_cap'),
    );
  });
});
