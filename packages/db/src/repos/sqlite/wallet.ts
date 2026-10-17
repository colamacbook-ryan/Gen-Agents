// Họ ví / sổ cái ₲ trên SQLite (DATABASE §5.10, §9.4). Repo tính số dư sau bút toán trong giao dịch (writer duy nhất ⇒
// tất định); trigger DB kiểm lại mọi luật kinh tế, cập nhật wallets, mở / đóng Trọng thương. recorded_by = actor giao dịch.
import { invalidInput, notFound } from '../errors.ts';
import type { AuditRow, LeaderboardView, LedgerEntryRow, RoleRow, RoleWoundRow, WalletRow } from '../types.ts';
import type { PostLedgerInput, WalletRepo } from '../wallet.ts';
import {
  actorOf,
  allow,
  audited,
  type Ctx,
  getRow,
  insertRow,
  mustGetRow,
  OWNER_ADMIN_SYSTEM,
  pageOf,
  ref,
  selectAll,
  selectOne,
  Where,
} from './ctx.ts';

export function walletRepo(ctx: Ctx): WalletRepo {
  const live = () => new Where(ctx, { live: true });
  const special = (kind: 'treasury' | 'sink') => {
    const w = selectOne<WalletRow>(ctx, 'wallets', live().eq('owner_kind', kind));
    if (w === null) throw notFound(`ví ${kind}`);
    return w;
  };
  return {
    get: (id) => getRow<WalletRow>(ctx, 'wallets', id),
    forRole: (roleId) =>
      selectOne<WalletRow>(
        ctx,
        'wallets',
        live().add("owner_kind = 'role'").eq('role_id', roleId).add("status <> 'closed'"),
      ),
    treasury: () => special('treasury'),
    sink: () => special('sink'),
    entry: (id) => getRow<LedgerEntryRow>(ctx, 'ledger_entries', id),
    entryByIdempotencyKey: (k) =>
      selectOne<LedgerEntryRow>(ctx, 'ledger_entries', new Where(ctx).eq('idempotency_key', k)),
    entries: (f) => {
      const w = new Where(ctx).eq('role_id', f.roleId);
      if (f.walletId !== undefined) w.add('(debit_wallet_id = ? OR credit_wallet_id = ?)', f.walletId, f.walletId);
      return pageOf<LedgerEntryRow>(ctx, 'ledger_entries', w, f.page);
    },
    leaderboard: () => ctx.r.all<LeaderboardView>('SELECT * FROM v_leaderboard WHERE workspace_id = ?', [ctx.ws]),
    openWound: (roleId) =>
      selectOne<RoleWoundRow>(ctx, 'role_wounds', new Where(ctx).eq('role_id', roleId).add('ended_at IS NULL')),
    wounds: (roleId) => selectAll<RoleWoundRow>(ctx, 'role_wounds', new Where(ctx).eq('role_id', roleId)),
    openRoleWallet: (roleId) => {
      allow(ctx, 'wallet.openRoleWallet', OWNER_ADMIN_SYSTEM);
      mustGetRow<RoleRow>(ctx, 'roles', roleId);
      const row = insertRow<WalletRow>(ctx, 'wallets', { owner_kind: 'role', role_id: roleId });
      return audited(ctx, { action: 'wallet.open', table: 'wallets', row, roleId });
    },
    post: (i: PostLedgerInput) => {
      allow(ctx, 'wallet.post', OWNER_ADMIN_SYSTEM);
      ref(ctx, 'roles', i.roleId);
      ref(ctx, 'tasks', i.taskId);
      ref(ctx, 'sessions', i.sessionId);
      ref(ctx, 'commitments', i.commitmentId);
      ref(ctx, 'skills', i.skillId);
      ref(ctx, 'employee_cards', i.cardId);
      ref(ctx, 'ledger_entries', i.reversesEntryId);
      const actor = actorOf(ctx);
      if (!Number.isSafeInteger(i.amountMinor) || i.amountMinor <= 0)
        throw invalidInput('amountMinor phải là số nguyên > 0');
      if (i.reason.trim().length === 0) throw invalidInput('bút toán cần lý do');
      if (i.debitWalletId === i.creditWalletId) throw invalidInput('ví nợ và ví có phải khác nhau');
      const debit = mustGetRow<WalletRow>(ctx, 'wallets', i.debitWalletId);
      const credit = mustGetRow<WalletRow>(ctx, 'wallets', i.creditWalletId);
      let basis: number | null = null;
      if (i.penalty?.rateBp !== undefined && i.penalty.rateBp !== null) {
        basis = debit.balance_minor;
        const expected = Math.floor((basis * i.penalty.rateBp + 5000) / 10000);
        if (expected !== i.amountMinor) {
          throw invalidInput(`phạt ${i.penalty.rateBp} bp trên số dư ${basis} ⇒ amountMinor phải = ${expected}`);
        }
      }
      let evidence: AuditRow | null = null;
      if (i.evidenceAuditId !== undefined && i.evidenceAuditId !== null) {
        evidence = getRow<AuditRow>(ctx, 'audit_log', i.evidenceAuditId);
        if (evidence === null) throw notFound(`bằng chứng audit ${i.evidenceAuditId}`);
      }
      const row = insertRow<LedgerEntryRow>(ctx, 'ledger_entries', {
        entry_type: i.entryType,
        debit_wallet_id: debit.id,
        credit_wallet_id: credit.id,
        amount_minor: i.amountMinor,
        debit_balance_after: debit.balance_minor - i.amountMinor,
        credit_balance_after: credit.balance_minor + i.amountMinor,
        role_id: i.roleId ?? debit.role_id ?? credit.role_id ?? null,
        reason: i.reason,
        task_id: i.taskId ?? null,
        session_id: i.sessionId ?? null,
        commitment_id: i.commitmentId ?? null,
        skill_id: i.skillId ?? null,
        card_id: i.cardId ?? null,
        penalty_class: i.penalty?.penaltyClass ?? null,
        penalty_rate_bp: i.penalty?.rateBp ?? null,
        basis_balance_minor: basis,
        evidence_audit_id: evidence?.id ?? null,
        evidence_audit_display_id: evidence?.display_id ?? null,
        evidence_hash: evidence?.row_hash ?? null,
        reverses_entry_id: i.reversesEntryId ?? null,
        recorded_by: actor.id,
        approved_by: null, // không nhận từ tham số — xem repos/wallet.ts
        idempotency_key: i.idempotencyKey ?? null,
      });
      return audited(ctx, {
        action: `ledger.${row.entry_type}`,
        table: 'ledger_entries',
        row,
        roleId: row.role_id,
        reason: i.reason,
      });
    },
  };
}
