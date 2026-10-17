// Họ audit trên SQLite: đọc (lưới A8) + append (chuỗi HMAC qua audit-writer). Append-only do DB ép.
import { displaySeqFor } from '../../ids/index.ts';
import type { AuditRepo } from '../audit.ts';
import type { AuditRow } from '../types.ts';
import { audit, type Ctx, getByDisplayId, getRow, pageOf, Where } from './ctx.ts';

export function auditRepo(ctx: Ctx): AuditRepo {
  return {
    get: (id) => getRow<AuditRow>(ctx, 'audit_log', id),
    getByDisplayId: (d) => getByDisplayId<AuditRow>(ctx, 'audit_log', displaySeqFor('audit_log', d)),
    list: (f) =>
      pageOf<AuditRow>(
        ctx,
        'audit_log',
        new Where(ctx)
          .eq('action', f?.action)
          .eq('role_id', f?.roleId)
          .eq('entity_id', f?.entityId)
          .eq('request_id', f?.requestId),
        f?.page,
      ),
    head: () => {
      const h = ctx.r.get<{ display_seq: number; row_hash: string; created_at: string }>(
        'SELECT display_seq, row_hash, created_at FROM audit_log WHERE workspace_id = ? ORDER BY display_seq DESC LIMIT 1',
        [ctx.ws],
      );
      return h === undefined ? null : { displaySeq: h.display_seq, rowHash: h.row_hash, createdAt: h.created_at };
    },
    append: (e) => audit(ctx, e),
  };
}
