// Đối chiếu Polaris (PC-, DATABASE §5.10): DB đòi hàng polaris_checks có TRƯỚC chủ thể (tin chủ động / đề xuất của Role /
// nhận việc / xin quyền — trigger *_polaris). Repo cấp id chủ thể trước, ghi PC- trỏ id đó (FK hoãn tới COMMIT), rồi mới
// ghi chủ thể — cùng một giao dịch.
import { invalidInput } from '../errors.ts';
import type { PolarisCheckInput, PolarisCheckRow } from '../types.ts';
import { type Ctx, insertRow } from './ctx.ts';

export type PolarisSubject =
  | { kind: 'proactive'; proactiveSendId: string }
  | { kind: 'proposal'; changeSetId: string }
  | { kind: 'task_accept'; taskId: string }
  | { kind: 'permission_request'; permissionRequestId: string };

export function insertPolarisCheck(
  ctx: Ctx,
  roleId: string,
  subject: PolarisSubject,
  p: PolarisCheckInput,
): PolarisCheckRow {
  if (!Number.isSafeInteger(p.expectedGainMinor) || p.expectedGainMinor < 0) {
    throw invalidInput('polaris.expectedGainMinor phải là số nguyên ≥ 0');
  }
  if (p.rulesApplied.trim().length === 0) throw invalidInput('polaris.rulesApplied không được rỗng');
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
    balance_minor_at: p.balanceMinorAt ?? null,
    rank_at: p.rankAt ?? null,
    session_id: p.sessionId ?? null,
    audit_id: p.auditId ?? null,
  });
}
