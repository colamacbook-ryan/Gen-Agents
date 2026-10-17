// Mục audit của repo (AuditEntryInput) → dòng audit_log có chữ ký HMAC (audit-writer). Người ghi = actor của giao dịch;
// kênh / request_id / ip_hash / lý do mặc định lấy từ WriteOptions của giao dịch.
import { canonicalJson, toDbTimestamp } from '@ga/contracts';
import { type AuditKeyring, appendAuditRow } from '../../audit-writer/index.ts';
import type { WriteContext } from '../../connection.ts';
import type { AuditEntryInput } from '../audit.ts';
import { invalidInput } from '../errors.ts';
import type { ActorRow, AuditRow } from '../types.ts';
import type { Ctx } from './ctx.ts';

export interface AppendAuditDeps {
  keyring: AuditKeyring;
}

/** `<thực thể>.<động từ>`: ≥ 2 đoạn chữ thường / số / `_` nối bằng `.` (kiểm bằng code, không regex lồng). */
const ACTION_PART_RE = /^[a-z0-9_]+$/;
const ACTION_MAX = 120;

function validAction(action: string): boolean {
  if (action.length === 0 || action.length > ACTION_MAX) return false;
  const parts = action.split('.');
  return parts.length >= 2 && parts.every((p) => ACTION_PART_RE.test(p));
}

/** JSON chuẩn hoá (JCS); bỏ khoá undefined như JSON.stringify trước khi chuẩn hoá. */
const json = (v: Record<string, unknown> | null | undefined): string | null =>
  v === null || v === undefined ? null : canonicalJson(JSON.parse(JSON.stringify(v)));

export function appendAuditFromEntry(ctx: Ctx, w: WriteContext, actor: ActorRow, e: AuditEntryInput): AuditRow {
  if (!validAction(e.action)) {
    throw invalidInput(`audit action không đúng dạng <thực thể>.<động từ>: ${e.action.slice(0, 40)}`);
  }
  const o = ctx.options;
  return appendAuditRow(w, ctx.auditDeps.keyring, {
    workspaceId: ctx.ws,
    id: ctx.newId(),
    createdAt: toDbTimestamp(ctx.clock.now()),
    draft: {
      actorLabel: actor.label,
      actorKind: actor.kind,
      action: e.action,
      result: e.result ?? 'ok',
      roleId: e.roleId ?? null,
      entityType: e.entity?.type ?? null,
      entityId: e.entity?.id ?? null,
      entityDisplayId: e.entity?.displayId ?? null,
      beforeJson: json(e.before),
      afterJson: json(e.after),
      detailJson: json(e.detail),
      reason: e.reason ?? o.reason ?? null,
      tool: e.tool ?? o.tool ?? null,
      sessionId: e.sessionId ?? o.sessionId ?? null,
      taskId: e.taskId ?? o.taskId ?? null,
      channel: e.channel ?? o.channel,
      requestId: o.requestId,
      ipHash: o.ipHash ?? null,
      tokensTotal: e.tokensTotal ?? null,
      costMicroUsd: e.costMicroUsd ?? null,
    },
  });
}
