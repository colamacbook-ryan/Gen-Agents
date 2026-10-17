// Họ audit (DATABASE §5.18, §9.6): append-only tuyệt đối, chuỗi HMAC theo workspace. Repo nối chuỗi trong giao dịch ghi
// (writer duy nhất ⇒ thứ tự tất định): display_seq = đầu chuỗi + 1, prev_hash = row_hash của dòng trước,
// row_hash = HMAC-SHA256(K_audit, prev_hash ‖ JCS(cột nghiệp vụ)) — xem audit-writer/. Người ghi = actor giao dịch.
import type { AuditChannel, AuditResult, AuditRow, Page, PageRequest } from './types.ts';

export interface AuditEntryInput {
  /** `<thực thể>.<động từ>` (vd 'dna_field.confirm', 'telegram.rejected'). */
  action: string;
  /** Mặc định 'ok'; gateway ghi cả 'denied'. */
  result?: AuditResult;
  roleId?: string | null;
  entity?: { type: string; id: string; displayId?: string | null } | null;
  /** Chỉ cột đổi; bảng nhạy cảm truyền hash thay giá trị (§9.6). */
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  detail?: Record<string, unknown> | null;
  reason?: string | null;
  /** Mặc định theo WriteOptions của giao dịch. */
  channel?: AuditChannel;
  tool?: string | null;
  sessionId?: string | null;
  taskId?: string | null;
  tokensTotal?: number | null;
  costMicroUsd?: number | null;
}

export interface AuditReads {
  get(auditId: string): AuditRow | null;
  getByDisplayId(displayId: string): AuditRow | null;
  list(filter?: {
    action?: string;
    roleId?: string;
    entityId?: string;
    requestId?: string;
    page?: PageRequest;
  }): Page<AuditRow>;
  /** Đầu chuỗi hiện tại (cho neo audit_anchor). */
  head(): { displaySeq: number; rowHash: string; createdAt: string } | null;
}

export interface AuditRepo extends AuditReads {
  append(entry: AuditEntryInput): AuditRow;
}
