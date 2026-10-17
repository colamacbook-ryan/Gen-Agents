// Đối chiếu Polaris (PC-, DATABASE §5.10): DB đòi hàng polaris_checks có TRƯỚC chủ thể (tin chủ động / đề xuất của Role /
// nhận việc / xin quyền — trigger *_polaris). Repo cấp id chủ thể trước, ghi PC- trỏ id đó (FK hoãn tới COMMIT), rồi mới
// ghi chủ thể — cùng một giao dịch.
// Dữ liệu bằng chứng do SERVER tính (review bảo mật MEDIUM 2026-10-17): balance_minor_at = số dư ví Role, rank_at = hạng
// trong v_leaderboard, đọc ngay trong giao dịch ghi; session_id / audit_id phải thuộc workspace của giao dịch,
// audit_display_id chụp từ chính hàng audit. Người gọi truyền balanceMinorAt / rankAt ⇒ TỪ CHỐI (không lặng lẽ bỏ qua:
// người gọi tưởng giá trị của mình được dùng là lỗi cần lộ ra sớm).
import { DbRuleError, invalidInput } from '../errors.ts';
import type { AuditRow, PolarisCheckInput, PolarisCheckRow } from '../types.ts';
import { type Ctx, insertRow, ref, refRow } from './ctx.ts';

export type PolarisSubject =
  | { kind: 'proactive'; proactiveSendId: string }
  | { kind: 'proposal'; changeSetId: string }
  | { kind: 'task_accept'; taskId: string }
  | { kind: 'permission_request'; permissionRequestId: string };

const SERVER_FIELDS = ['balanceMinorAt', 'rankAt', 'balance_minor_at', 'rank_at', 'auditDisplayId', 'audit_display_id'];

export function insertPolarisCheck(
  ctx: Ctx,
  roleId: string,
  subject: PolarisSubject,
  p: PolarisCheckInput,
): PolarisCheckRow {
  for (const k of SERVER_FIELDS) {
    if (Object.hasOwn(p, k)) throw invalidInput(`polaris.${k}: server tự tính, không nhận từ người gọi`);
  }
  if (!Number.isSafeInteger(p.expectedGainMinor) || p.expectedGainMinor < 0) {
    throw invalidInput('polaris.expectedGainMinor phải là số nguyên ≥ 0');
  }
  if (typeof p.rulesApplied !== 'string' || p.rulesApplied.trim().length === 0 || p.rulesApplied.length > 200) {
    throw invalidInput('polaris.rulesApplied không được rỗng (≤ 200 ký tự)');
  }
  ref(ctx, 'roles', roleId);
  ref(ctx, 'sessions', p.sessionId);
  const evidence = p.auditId === undefined || p.auditId === null ? null : refRow<AuditRow>(ctx, 'audit_log', p.auditId);
  const wallet = ctx.r.get<{ balance_minor: number }>(
    "SELECT balance_minor FROM wallets WHERE workspace_id = ? AND owner_kind = 'role' AND role_id = ? AND status <> 'closed' AND deleted_at IS NULL",
    [ctx.ws, roleId],
  );
  const rank = ctx.r.get<{ rank: number | null }>(
    'SELECT rank FROM v_leaderboard WHERE workspace_id = ? AND role_id = ?',
    [ctx.ws, roleId],
  );
  if (rank !== undefined && rank.rank !== null && !Number.isSafeInteger(rank.rank)) {
    throw new DbRuleError('repo.invalid_input', 'v_leaderboard.rank không phải số nguyên');
  }
  return insertRow<PolarisCheckRow>(ctx, 'polaris_checks', {
    role_id: roleId,
    subject_kind: subject.kind,
    proactive_send_id: subject.kind === 'proactive' ? subject.proactiveSendId : null,
    change_set_id: subject.kind === 'proposal' ? subject.changeSetId : null,
    task_id: subject.kind === 'task_accept' ? subject.taskId : null,
    permission_request_id: subject.kind === 'permission_request' ? subject.permissionRequestId : null,
    expected_gain_minor: p.expectedGainMinor,
    rules_applied: p.rulesApplied.trim(),
    rationale: p.rationale ?? null,
    balance_minor_at: wallet?.balance_minor ?? null,
    rank_at: rank?.rank ?? null,
    session_id: p.sessionId ?? null,
    audit_id: evidence?.id ?? null,
    audit_display_id: evidence?.display_id ?? null,
  });
}
