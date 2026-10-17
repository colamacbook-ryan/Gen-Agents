// Họ công cụ / quyền tool / egress (DATABASE §5.15): tools (TL-), tool_grants (GR-), egress_rules (EG-). Đây là luật harness
// nằm NGOÀI tầm Role (§9.7): chỉ owner / admin ghi; Role không tự cấp quyền hay mở egress (rào ở repo + cổng DB v2.3.5).
import type { EgressRuleRow, ToolGrantRow, ToolRow } from './types.ts';

export type ToolMode = ToolGrantRow['mode'];

export interface ToolReads {
  list(filter?: { status?: ToolRow['status'] }): ToolRow[];
  get(toolId: string): ToolRow | null;
  bySlug(slug: string): ToolRow | null;
  /** Grant sống (chưa xoá mềm); mặc định bỏ grant đã hết hạn. */
  grants(filter?: { roleId?: string; positionId?: string; toolId?: string; includeExpired?: boolean }): ToolGrantRow[];
  /**
   * Quyền hiệu lực của Role với tool: tool tắt / chỉ dành cho hệ thống ⇒ 'deny'; grant của Role (mới nhất, còn hạn) > grant
   * của vị trí Role đang giữ (assignment active) > default_mode của tool.
   */
  effectiveMode(roleId: string, toolId: string): ToolMode;
  egressRules(filter?: { appliesTo?: EgressRuleRow['applies_to']; roleId?: string; toolId?: string }): EgressRuleRow[];
}

export interface ToolRepo extends ToolReads {
  setToolStatus(toolId: string, status: ToolRow['status']): ToolRow;
  /** Đúng một trong roleId / positionId (CHECK). */
  grant(input: {
    toolId: string;
    roleId?: string | null;
    positionId?: string | null;
    mode: ToolMode;
    expiresAt?: string | null;
    note?: string | null;
    sourceRequestId?: string | null;
  }): ToolGrantRow;
  revokeGrant(grantId: string): void;
  /** domain_pattern: hostname chữ thường, tuỳ chọn tiền tố '*.'; port 1–65535. */
  addEgressRule(input: {
    domainPattern: string;
    port?: number | null;
    appliesTo: EgressRuleRow['applies_to'];
    roleId?: string | null;
    positionId?: string | null;
    toolId?: string | null;
    action?: EgressRuleRow['action'];
    note?: string | null;
  }): EgressRuleRow;
  updateEgressRule(
    ruleId: string,
    patch: { domainPattern?: string; port?: number | null; action?: EgressRuleRow['action']; note?: string | null },
  ): EgressRuleRow;
  removeEgressRule(ruleId: string): void;
}
