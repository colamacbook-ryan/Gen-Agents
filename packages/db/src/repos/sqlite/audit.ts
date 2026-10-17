// Họ audit trên SQLite: đọc (lưới A8) + append (chuỗi HMAC qua audit-writer). Append-only do DB ép.
import { displaySeqFor } from '../../ids/index.ts';
import type { AuditRepo } from '../audit.ts';
import { permissionDenied } from '../errors.ts';
import type { AuditRow } from '../types.ts';
import { allow, audit, type Ctx, getByDisplayId, getRow, pageOf, ref, STAFF_SYSTEM, Where } from './ctx.ts';

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
    append: (e) => {
      const actor = allow(ctx, 'audit.append', [...STAFF_SYSTEM, 'role']);
      // hành động 'audit.*' (niêm phong retention, xoay khoá, neo) do hệ thống ghi — bộ kiểm chuỗi tin các dòng này
      if (e.action.startsWith('audit.') && actor.kind !== 'system') {
        throw permissionDenied(`audit.append: ${e.action} chỉ actor system`);
      }
      ref(ctx, 'roles', e.roleId);
      ref(ctx, 'sessions', e.sessionId);
      ref(ctx, 'tasks', e.taskId);
      return audit(ctx, e);
    },
  };
}
