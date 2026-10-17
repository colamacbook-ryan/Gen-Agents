// Ca âm cho từng HỌ guard của DB ở tầng TS (BUILD-PLAN §C.4, việc 9 của L-DB): mỗi guard quan trọng có ít nhất một ca đi qua
// tầng TS và nhận ĐÚNG mã ổn định (DbRuleError.rule) của bảng ánh xạ.
//   - "qua repo": hàm repo cho đi (actor có quyền ở repo) và DB là chốt chặn;
//   - "qua conn.write": repo đã chặn trước (nhiều lớp) nên dựng câu lệnh tay trong giao dịch ghi để chứng minh DB vẫn chặn —
//     lỗi đổi mã qua withDbErrors như store thật.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addTenant, createFixture, type Fixture } from '../../src/repos/fixture/index.ts';
import { DbRuleError, dml, type RoleRow, withDbErrors } from '../../src/repos/index.ts';

let f: Fixture;
let role: RoleRow;
beforeEach(() => {
  f = createFixture({ roles: 1 });
  role = f.roles[0] as RoleRow;
});
afterEach(() => f.close());

const rule = (r: string) => expect.objectContaining({ rule: r });
/** Câu lệnh tay trong conn.write của actor (app_actor() = actor) — đổi lỗi như store thật. */
const raw = (actor: string, sql: string, ...params: unknown[]) =>
  withDbErrors(() => f.writer.write(actor, (w) => dml(w).write(sql, params)));
/** Loại CLI không đòi consent (đọc từ danh mục — test không viết tên CLI). */
const noConsentEngine = () =>
  f.store.read(f.workspaceId, (tx) => tx.engines.catalog().find((e) => e.requires_consent === 0)?.slug as string);
const roleActor = () => f.store.read(f.workspaceId, (tx) => tx.workspace.actorForRole(role.id)?.id as string);

function secret(actor = f.ownerActorId) {
  return f.store.write(actor, (tx) =>
    tx.secrets.create({
      kind: 'telegram_bot_token',
      label: 's',
      ciphertext: Buffer.from([1]),
      nonce: Buffer.from([1]),
      wrappedDek: Buffer.from([1]),
      dekNonce: Buffer.from([1]),
      kekId: 'k',
      fingerprint: 'f',
    }),
  );
}

describe('họ guard → mã ổn định', () => {
  it('owner allowlist Telegram: gỡ chủ sở hữu cuối ⇒ telegram.owner_invariant; capture owner thứ hai bởi system ⇒ telegram.owner_capture', () => {
    const s = secret();
    const bot = f.store.write(f.ownerActorId, (tx) =>
      tx.telegram.createBot({ roleId: role.id, botUsername: 'b', secretId: s.id }),
    );
    const owner = f.store.write(f.systemActorId, (tx) =>
      tx.telegram.captureOwner(bot.id, { tgUserId: 1, displayName: 'Chủ' }),
    );
    expect(() => f.store.write(f.ownerActorId, (tx) => tx.telegram.removeAllowed(owner.id))).toThrow(
      rule('telegram.owner_invariant'),
    );
    expect(() =>
      f.store.write(f.systemActorId, (tx) => tx.telegram.captureOwner(bot.id, { tgUserId: 2, displayName: 'Giả' })),
    ).toThrow(rule('telegram.owner_capture'));
  });

  it('Core agent: chưa sẵn sàng ⇒ core_agent.not_ready; gỡ binding Core agent cuối ⇒ core_agent.last_binding', () => {
    const binding = f.store.read(f.workspaceId, (tx) => tx.engines.systemBindings()[0]?.id as string);
    expect(() => f.store.write(f.ownerActorId, (tx) => tx.engines.removeBinding(binding))).toThrow(
      rule('core_agent.last_binding'),
    );
    const g = createFixture({ coreAgentReady: false });
    try {
      expect(() => g.store.write(g.ownerActorId, (tx) => tx.roles.create({ name: 'x', color: 'jade' }))).toThrow(
        rule('core_agent.not_ready'),
      );
    } finally {
      g.close();
    }
  });

  it('consent: tài khoản loại CLI đòi đồng ý mà không có consent ⇒ consent.required', () => {
    const needs = f.store.read(f.workspaceId, (tx) => tx.engines.engine(f.coreEngine)?.requires_consent);
    expect(needs).toBe(1);
    expect(() =>
      f.store.write(f.ownerActorId, (tx) =>
        tx.engines.createAccount({
          engineSlug: f.coreEngine,
          label: 'x',
          authMethod: 'subscription',
          authVolume: 'ga-auth-x-0002',
        }),
      ),
    ).toThrow(rule('consent.required'));
  });

  it('ví: âm quỹ ⇒ ledger.insufficient_funds; actor system ghi thưởng ⇒ ledger.signer; Trọng thương ⇒ role.wounded', () => {
    const { w, ev } = f.store.write(f.ownerActorId, (tx) => ({
      w: tx.wallet.openRoleWallet(role.id),
      ev: tx.audit.append({ action: 'wallet.grant_request', entity: { type: 'roles', id: role.id } }),
    }));
    const grant = (actor: string, amount: number) =>
      f.store.write(actor, (tx) =>
        tx.wallet.post({
          entryType: 'grant',
          debitWalletId: tx.wallet.treasury().id,
          creditWalletId: w.id,
          amountMinor: amount,
          reason: 'cấp',
          evidenceAuditId: ev.id,
        }),
      );
    expect(() => grant(f.systemActorId, 100)).toThrow(rule('ledger.signer'));
    grant(f.ownerActorId, 100);
    const adjust = (amount: number) =>
      f.store.write(f.ownerActorId, (tx) =>
        tx.wallet.post({
          entryType: 'adjustment',
          debitWalletId: w.id,
          creditWalletId: tx.wallet.sink().id,
          amountMinor: amount,
          reason: 'điều chỉnh',
          evidenceAuditId: ev.id,
        }),
      );
    expect(() => adjust(101)).toThrow(rule('ledger.insufficient_funds'));
    adjust(100); // về 0 ⇒ Trọng thương
    expect(f.store.read(f.workspaceId, (tx) => tx.wallet.openWound(role.id))).not.toBeNull();
    expect(() =>
      f.store.write(f.ownerActorId, (tx) => tx.tasks.create({ title: 'x', source: 'web', assigneeRoleId: role.id })),
    ).toThrow(rule('role.wounded'));
    // sửa số dư trực tiếp (ngoài ledger) ⇒ ledger.direct_balance
    expect(() => raw(f.ownerActorId, 'UPDATE wallets SET balance_minor = 999 WHERE id = ?', w.id)).toThrow(
      rule('ledger.direct_balance'),
    );
  });

  it('chuỗi audit: prev_hash sai ⇒ audit.chain; sửa audit ⇒ append_only', () => {
    const head = f.store.read(f.workspaceId, (tx) => tx.audit.head());
    expect(() =>
      raw(
        f.systemActorId,
        "INSERT INTO audit_log (id, workspace_id, display_id, display_seq, created_by, actor_id, actor_label, actor_kind, action, result, channel, request_id, hash_key_id, prev_hash, row_hash) VALUES (?, ?, ?, ?, ?, ?, 'x', 'system', 'x.y', 'ok', 'system', 'r', 'k', ?, ?)",
        '01JZZZZZZZZZZZZZZZZZZZZZZZ',
        f.workspaceId,
        `AU-${String((head?.displaySeq ?? 0) + 1).padStart(5, '0')}`,
        (head?.displaySeq ?? 0) + 1,
        f.systemActorId,
        f.systemActorId,
        '0'.repeat(64),
        '1'.repeat(64),
      ),
    ).toThrow(rule('audit.chain'));
    expect(() =>
      raw(f.systemActorId, "UPDATE audit_log SET reason = 'x' WHERE workspace_id = ?", f.workspaceId),
    ).toThrow(rule('append_only'));
  });

  it('chống REPLACE: INSERT OR REPLACE trùng khoá ⇒ unique.duplicate', () => {
    expect(() =>
      raw(
        f.ownerActorId,
        'INSERT OR REPLACE INTO roles (id, workspace_id, display_id, display_seq, created_by, name, name_norm, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        '01JZZZZZZZZZZZZZZZZZZZZZZY',
        f.workspaceId,
        role.display_id,
        role.display_seq,
        f.ownerActorId,
        'x',
        'x',
        'jade',
      ),
    ).toThrow(rule('unique.duplicate'));
  });

  it('tenant: secret của workspace khác ⇒ tenant.cross (DB, khi repo bị lách)', () => {
    const t = addTenant(f, { slug: 'b', shortCode: 'BBBB', username: 'ob', roles: 0 });
    const sB = f.store.write(t.ownerActorId, (tx) =>
      tx.secrets.create({
        kind: 'telegram_bot_token',
        label: 's',
        ciphertext: Buffer.from([1]),
        nonce: Buffer.from([1]),
        wrappedDek: Buffer.from([1]),
        dekNonce: Buffer.from([1]),
        kekId: 'k',
        fingerprint: 'f',
      }),
    );
    expect(() =>
      raw(
        f.ownerActorId,
        "INSERT INTO telegram_bots (id, workspace_id, display_id, display_seq, created_by, role_id, bot_username, secret_id) VALUES (?, ?, 'TG-0099', 99, ?, ?, 'x', ?)",
        '01JZZZZZZZZZZZZZZZZZZZZZZX',
        f.workspaceId,
        f.ownerActorId,
        role.id,
        sB.id,
      ),
    ).toThrow(rule('tenant.cross'));
  });

  it('cổng người ghi: owner ghi login_status ⇒ permission.system_only; Role tạo tài khoản ⇒ permission.credential_writer; created_by giả ⇒ writer.actor_mismatch', () => {
    expect(() =>
      raw(f.ownerActorId, "UPDATE engine_accounts SET login_status = 'logged_in' WHERE id = ?", f.coreAccount?.id),
    ).toThrow(rule('permission.system_only'));
    expect(() =>
      raw(
        roleActor(),
        "INSERT INTO engine_accounts (id, workspace_id, display_id, display_seq, created_by, engine_slug, label, auth_method, auth_volume) VALUES (?, ?, 'EN-0099', 99, ?, ?, 'x', 'subscription', 'ga-auth-x-0099')",
        '01JZZZZZZZZZZZZZZZZZZZZZZW',
        f.workspaceId,
        roleActor(),
        noConsentEngine(),
      ),
    ).toThrow(rule('permission.credential_writer'));
    expect(() =>
      raw(
        f.ownerActorId,
        "INSERT INTO tasks (id, workspace_id, display_id, display_seq, created_by, requested_by, source, title) VALUES (?, ?, 'TK-0099', 99, ?, ?, 'web', 'x')",
        '01JZZZZZZZZZZZZZZZZZZZZZZV',
        f.workspaceId,
        f.systemActorId,
        f.ownerActorId,
      ),
    ).toThrow(rule('writer.actor_mismatch'));
  });

  it('identity bất biến ⇒ identity.immutable; UPDATE không đổi updated_at ⇒ writer.stale_updated_at; kind bí mật ⇒ secret.kind_immutable', () => {
    expect(() =>
      raw(f.ownerActorId, 'UPDATE roles SET display_seq = 77, updated_by = ? WHERE id = ?', f.ownerActorId, role.id),
    ).toThrow(rule('identity.immutable'));
    expect(() =>
      raw(
        f.ownerActorId,
        "UPDATE roles SET description = 'x', updated_by = ?, updated_at = updated_at WHERE id = ?",
        f.ownerActorId,
        role.id,
      ),
    ).toThrow(rule('writer.stale_updated_at'));
    const s = secret();
    expect(() =>
      raw(
        f.ownerActorId,
        "UPDATE secrets SET kind = 'integration_token', updated_by = ?, updated_at = '2030-01-01T00:00:00.000Z' WHERE id = ?",
        f.ownerActorId,
        s.id,
      ),
    ).toThrow(rule('secret.kind_immutable'));
  });

  it('settings: giá trị sai qua đường tay ⇒ settings.rule', () => {
    expect(() =>
      raw(
        f.ownerActorId,
        "INSERT INTO settings (id, workspace_id, display_id, display_seq, created_by, key, value_json) VALUES (?, ?, 'ST-0099', 99, ?, 'avatar.transient_seconds', '9999')",
        '01JZZZZZZZZZZZZZZZZZZZZZZT',
        f.workspaceId,
        f.ownerActorId,
      ),
    ).toThrow(rule('settings.rule'));
  });

  it('change set: Role đề xuất Nội quy (scope workspace) ⇒ role.proposal_scope', () => {
    expect(() =>
      f.store.write(roleActor(), (tx) =>
        tx.changeSets.propose({
          scope: 'workspace',
          title: 'nội quy',
          polaris: { expectedGainMinor: 0, rulesApplied: 'P1' },
          items: [
            {
              target: 'instruction',
              op: 'create',
              layer: 'house_rules',
              ordinal: 1,
              name: 'x',
              content: 'x',
              tokenCount: 1,
              tokenizer: 't',
              source: 'ai_inferred',
            },
          ],
        }),
      ),
    ).toThrow(rule('role.proposal_scope'));
  });

  it('revision: semver sai ⇒ revision.semver', () => {
    expect(() =>
      raw(
        f.ownerActorId,
        "INSERT INTO revisions (id, workspace_id, display_id, display_seq, created_by, scope, role_id, seq, major, minor, kind, snapshot_json, snapshot_hash, prompt_tokens) VALUES (?, ?, 'RV-0099', 99, ?, 'role', ?, 2, 5, 0, 'edit', '{}', 'h', 0)",
        '01JZZZZZZZZZZZZZZZZZZZZZZS',
        f.workspaceId,
        f.ownerActorId,
        role.id,
      ),
    ).toThrow(rule('revision.semver'));
  });

  it('mọi lỗi trên là DbRuleError có dbMessage (chuỗi gốc chỉ để log) và code của contracts', () => {
    try {
      raw(f.systemActorId, "UPDATE audit_log SET reason = 'x' WHERE workspace_id = ?", f.workspaceId);
    } catch (e) {
      expect(e).toBeInstanceOf(DbRuleError);
      expect((e as DbRuleError).dbMessage).toMatch(/^append-only/);
      expect((e as DbRuleError).code).toBe('db.append_only');
    }
  });
});
