// Họ công cụ / quyền tool / egress trên SQLite. Luật harness ngoài tầm Role: mọi hàm ghi chỉ owner / admin (Role, operator,
// viewer, actor system ⇒ 'permission.denied'); mọi id tham chiếu phải thuộc workspace của giao dịch.
import { invalidInput } from '../errors.ts';
import type { ToolMode, ToolRepo } from '../tools.ts';
import type { EgressRuleRow, ToolGrantRow, ToolRow } from '../types.ts';
import {
  allow,
  audited,
  type Ctx,
  getRow,
  insertRow,
  mustGetRow,
  nowTs,
  OWNER_ADMIN,
  ref,
  selectAll,
  selectOne,
  softDeleteRow,
  updateRow,
  Where,
} from './ctx.ts';

const LABEL_RE = /^[a-z0-9-]{1,63}$/;

/** Hostname chữ thường (nhãn a–z0–9-), tuỳ chọn tiền tố '*.'; kiểm bằng code, không regex lồng. */
export function validDomainPattern(p: string): boolean {
  if (p.length === 0 || p.length > 253) return false;
  const body = p.startsWith('*.') ? p.slice(2) : p;
  const labels = body.split('.');
  return labels.length >= 1 && labels.every((l) => LABEL_RE.test(l) && !l.startsWith('-') && !l.endsWith('-'));
}

function checkPort(port: number | null | undefined): void {
  if (port !== undefined && port !== null && (!Number.isSafeInteger(port) || port < 1 || port > 65535)) {
    throw invalidInput('port 1–65535');
  }
}

export function toolRepo(ctx: Ctx): ToolRepo {
  const live = () => new Where(ctx, { live: true });
  const notExpired = (w: Where) => w.add('(expires_at IS NULL OR expires_at > ?)', nowTs(ctx));
  return {
    list: (f) => selectAll<ToolRow>(ctx, 'tools', live().eq('status', f?.status)),
    get: (id) => getRow<ToolRow>(ctx, 'tools', id),
    bySlug: (slug) => selectOne<ToolRow>(ctx, 'tools', live().eq('slug', slug)),
    grants: (f) => {
      const w = live().eq('role_id', f?.roleId).eq('position_id', f?.positionId).eq('tool_id', f?.toolId);
      return selectAll<ToolGrantRow>(ctx, 'tool_grants', f?.includeExpired ? w : notExpired(w));
    },
    effectiveMode: (roleId, toolId): ToolMode => {
      const tool = getRow<ToolRow>(ctx, 'tools', toolId);
      if (tool === null || tool.deleted_at !== null || tool.status !== 'active' || tool.allowed_agents === 'system') {
        return 'deny';
      }
      const own = selectOne<ToolGrantRow>(
        ctx,
        'tool_grants',
        notExpired(live().eq('tool_id', toolId).eq('role_id', roleId)),
        'display_seq DESC',
      );
      if (own !== null) return own.mode;
      const pos = ctx.r.get<{ mode: ToolMode }>(
        'SELECT g.mode FROM tool_grants g JOIN assignments a ON a.position_id = g.position_id AND a.workspace_id = g.workspace_id ' +
          "WHERE g.workspace_id = ? AND g.tool_id = ? AND a.role_id = ? AND a.status = 'active' AND a.deleted_at IS NULL " +
          'AND g.deleted_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > ?) ORDER BY g.display_seq DESC LIMIT 1',
        [ctx.ws, toolId, roleId, nowTs(ctx)],
      );
      return pos?.mode ?? tool.default_mode;
    },
    egressRules: (f) =>
      selectAll<EgressRuleRow>(
        ctx,
        'egress_rules',
        live().eq('applies_to', f?.appliesTo).eq('role_id', f?.roleId).eq('tool_id', f?.toolId),
      ),
    setToolStatus: (toolId, status) => {
      allow(ctx, 'tools.setToolStatus', OWNER_ADMIN);
      const before = mustGetRow<ToolRow>(ctx, 'tools', toolId);
      const row = updateRow<ToolRow>(ctx, 'tools', toolId, { status });
      return audited(ctx, { action: 'tool.status', table: 'tools', row, before });
    },
    grant: (i) => {
      allow(ctx, 'tools.grant', OWNER_ADMIN);
      const hasRole = i.roleId !== undefined && i.roleId !== null;
      const hasPosition = i.positionId !== undefined && i.positionId !== null;
      if (hasRole === hasPosition) {
        throw invalidInput('grant cần đúng một trong roleId / positionId');
      }
      const row = insertRow<ToolGrantRow>(ctx, 'tool_grants', {
        tool_id: ref(ctx, 'tools', i.toolId),
        role_id: ref(ctx, 'roles', i.roleId) ?? null,
        position_id: ref(ctx, 'positions', i.positionId) ?? null,
        mode: i.mode,
        expires_at: i.expiresAt ?? null,
        note: i.note ?? null,
        source_request_id: ref(ctx, 'permission_requests', i.sourceRequestId) ?? null,
      });
      return audited(ctx, { action: 'tool_grant.create', table: 'tool_grants', row });
    },
    revokeGrant: (grantId) => {
      allow(ctx, 'tools.revokeGrant', OWNER_ADMIN);
      const before = mustGetRow<ToolGrantRow>(ctx, 'tool_grants', grantId);
      const row = softDeleteRow<ToolGrantRow>(ctx, 'tool_grants', grantId);
      audited(ctx, { action: 'tool_grant.revoke', table: 'tool_grants', row, before });
    },
    addEgressRule: (i) => {
      allow(ctx, 'tools.addEgressRule', OWNER_ADMIN);
      if (!validDomainPattern(i.domainPattern)) throw invalidInput('domainPattern không hợp lệ');
      checkPort(i.port);
      const row = insertRow<EgressRuleRow>(ctx, 'egress_rules', {
        domain_pattern: i.domainPattern,
        port: i.port ?? null,
        applies_to: i.appliesTo,
        role_id: ref(ctx, 'roles', i.roleId) ?? null,
        position_id: ref(ctx, 'positions', i.positionId) ?? null,
        tool_id: ref(ctx, 'tools', i.toolId) ?? null,
        action: i.action,
        note: i.note ?? null,
      });
      return audited(ctx, { action: 'egress_rule.create', table: 'egress_rules', row });
    },
    updateEgressRule: (ruleId, p) => {
      allow(ctx, 'tools.updateEgressRule', OWNER_ADMIN);
      if (p.domainPattern !== undefined && !validDomainPattern(p.domainPattern))
        throw invalidInput('domainPattern không hợp lệ');
      checkPort(p.port);
      const before = mustGetRow<EgressRuleRow>(ctx, 'egress_rules', ruleId);
      if (before.is_builtin === 1) throw invalidInput('luật egress dựng sẵn không sửa được');
      const row = updateRow<EgressRuleRow>(ctx, 'egress_rules', ruleId, {
        domain_pattern: p.domainPattern,
        port: p.port,
        action: p.action,
        note: p.note,
      });
      return audited(ctx, { action: 'egress_rule.update', table: 'egress_rules', row, before });
    },
    removeEgressRule: (ruleId) => {
      allow(ctx, 'tools.removeEgressRule', OWNER_ADMIN);
      const before = mustGetRow<EgressRuleRow>(ctx, 'egress_rules', ruleId);
      if (before.is_builtin === 1) throw invalidInput('luật egress dựng sẵn không xoá được');
      const row = softDeleteRow<EgressRuleRow>(ctx, 'egress_rules', ruleId);
      audited(ctx, { action: 'egress_rule.remove', table: 'egress_rules', row, before });
    },
  };
}
