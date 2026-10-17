// Họ việc (tasks) + hàng đợi / outbox (jobs) trên SQLite (DATABASE §5.9, §5.18).
import { toDbTimestamp } from '@ga/contracts';
import { displaySeqFor } from '../../ids/index.ts';
import { DbRuleError, invalidInput } from '../errors.ts';
import { dml } from '../sql.ts';
import type { JobRow, TaskRow } from '../types.ts';
import type { EnqueueJobInput, JobRepo, TaskRepo } from '../work.ts';
import {
  actorOf,
  audited,
  type Ctx,
  getByDisplayId,
  getRow,
  insertRow,
  mustGetRow,
  nowTs,
  pageOf,
  requireW,
  softDeleteRow,
  updateRow,
  Where,
} from './ctx.ts';

const TERMINAL: ReadonlySet<TaskRow['status']> = new Set(['done', 'failed', 'cancelled']);

export function taskRepo(ctx: Ctx): TaskRepo {
  return {
    get: (id) => getRow<TaskRow>(ctx, 'tasks', id),
    getByDisplayId: (d) => getByDisplayId<TaskRow>(ctx, 'tasks', displaySeqFor('tasks', d)),
    list: (f) =>
      pageOf<TaskRow>(
        ctx,
        'tasks',
        new Where(ctx, { live: f?.includeDeleted !== true })
          .eq('assignee_role_id', f?.assigneeRoleId)
          .in('status', f?.status),
        f?.page,
      ),
    create: (i) => {
      if (i.title.trim().length === 0) throw invalidInput('việc cần tiêu đề');
      const row = insertRow<TaskRow>(ctx, 'tasks', {
        title: i.title.trim(),
        description: i.description ?? null,
        source: i.source,
        requested_by: i.requestedBy ?? actorOf(ctx).id,
        assignee_role_id: i.assigneeRoleId ?? null,
        position_id: i.positionId ?? null,
        priority: i.priority,
        due_at: i.dueAt ?? null,
        status: i.status,
        thread_id: i.threadId ?? null,
        commitment_id: i.commitmentId ?? null,
        parent_task_id: i.parentTaskId ?? null,
        source_message_id: i.sourceMessageId ?? null,
      });
      return audited(ctx, { action: 'task.create', table: 'tasks', row, roleId: row.assignee_role_id });
    },
    update: (id, p, expectedVersion) => {
      const before = mustGetRow<TaskRow>(ctx, 'tasks', id);
      const row = updateRow<TaskRow>(
        ctx,
        'tasks',
        id,
        {
          title: p.title,
          description: p.description,
          priority: p.priority,
          due_at: p.dueAt,
          assignee_role_id: p.assigneeRoleId,
        },
        { expectedVersion },
      );
      return audited(ctx, { action: 'task.update', table: 'tasks', row, before });
    },
    transition: (id, to, o) => {
      const before = mustGetRow<TaskRow>(ctx, 'tasks', id);
      if (TERMINAL.has(before.status) && before.status !== to) {
        throw new DbRuleError('repo.version_conflict', `việc ${before.display_id} đã kết thúc (${before.status})`);
      }
      const row = updateRow<TaskRow>(
        ctx,
        'tasks',
        id,
        {
          status: to,
          status_detail: o?.detail ?? null,
          result_summary: o?.resultSummary,
          started_at: to === 'running' && before.started_at === null ? nowTs(ctx) : undefined,
          completed_at: TERMINAL.has(to) ? nowTs(ctx) : undefined,
        },
        { expectedVersion: o?.expectedVersion },
      );
      return audited(ctx, { action: 'task.transition', table: 'tasks', row, before });
    },
    verify: (id, verdict) => {
      const before = mustGetRow<TaskRow>(ctx, 'tasks', id);
      const ok = verdict === 'verified';
      const row = updateRow<TaskRow>(ctx, 'tasks', id, {
        verification: verdict,
        verified_by: ok ? actorOf(ctx).id : null,
        verified_at: ok ? nowTs(ctx) : null,
      });
      return audited(ctx, { action: 'task.verify', table: 'tasks', row, before });
    },
    recordFailureDisclosure: (id, i) => {
      const before = mustGetRow<TaskRow>(ctx, 'tasks', id);
      const row = updateRow<TaskRow>(ctx, 'tasks', id, {
        failure_disclosure: i.disclosure,
        failure_report_audit_id: i.auditId ?? null,
        failure_reported_at: nowTs(ctx),
      });
      return audited(ctx, { action: 'task.failure_disclosure', table: 'tasks', row, before });
    },
    addUsage: (id, i) => {
      if (
        !Number.isSafeInteger(i.tokens) ||
        i.tokens < 0 ||
        !Number.isSafeInteger(i.costMicroUsd) ||
        i.costMicroUsd < 0
      ) {
        throw invalidInput('token / chi phí phải là số nguyên ≥ 0');
      }
      const before = mustGetRow<TaskRow>(ctx, 'tasks', id);
      return updateRow<TaskRow>(
        ctx,
        'tasks',
        id,
        { tokens_total: before.tokens_total + i.tokens, cost_micro_usd: before.cost_micro_usd + i.costMicroUsd },
        { bumpVersion: false },
      );
    },
    softDelete: (id) => {
      const before = mustGetRow<TaskRow>(ctx, 'tasks', id);
      const row = softDeleteRow<TaskRow>(ctx, 'tasks', id);
      audited(ctx, { action: 'task.delete', table: 'tasks', row, before });
    },
  };
}

/** Thêm job vào hàng đợi trong giao dịch đang mở (outbox). Trùng dedupeKey với job 'queued' ⇒ trả job đang chờ. */
export function enqueueJob(ctx: Ctx, i: EnqueueJobInput): { job: JobRow; deduped: boolean } {
  requireW(ctx);
  if (i.dedupeKey !== undefined && i.dedupeKey !== null) {
    const dup = ctx.r.get<JobRow>(
      "SELECT * FROM jobs WHERE workspace_id = ? AND status = 'queued' AND dedupe_key = ? LIMIT 1",
      [ctx.ws, i.dedupeKey],
    );
    if (dup !== undefined) return { job: dup, deduped: true };
  }
  if (i.maxAttempts !== undefined && (!Number.isSafeInteger(i.maxAttempts) || i.maxAttempts < 1)) {
    throw invalidInput('maxAttempts ≥ 1');
  }
  const job = insertRow<JobRow>(ctx, 'jobs', {
    kind: i.kind,
    payload_json: JSON.stringify(i.payload),
    run_after: i.runAfter ?? nowTs(ctx),
    priority: i.priority,
    max_attempts: i.maxAttempts,
    dedupe_key: i.dedupeKey ?? null,
  });
  return { job, deduped: false };
}

const after = (ctx: Ctx, ms: number) => toDbTimestamp(new Date(ctx.clock.now().getTime() + ms));

export function jobRepo(ctx: Ctx): JobRepo {
  const held = (id: string, owner: string): JobRow => {
    const job = mustGetRow<JobRow>(ctx, 'jobs', id);
    if (job.status !== 'running' || job.lease_owner !== owner) {
      throw new DbRuleError('repo.version_conflict', `job ${job.display_id} không còn do ${owner} giữ (${job.status})`);
    }
    return job;
  };
  const leaseGuard = (owner: string) => ({ sql: "status = 'running' AND lease_owner IS ?", params: [owner] });
  return {
    get: (id) => getRow<JobRow>(ctx, 'jobs', id),
    list: (f) => pageOf<JobRow>(ctx, 'jobs', new Where(ctx).eq('kind', f?.kind).in('status', f?.status), f?.page),
    enqueue: (i) => enqueueJob(ctx, i),
    claim: (i) => {
      const w = requireW(ctx);
      if (!Number.isSafeInteger(i.leaseMs) || i.leaseMs <= 0) throw invalidInput('leaseMs > 0');
      const limit = Math.min(Math.max(Math.trunc(i.limit ?? 1), 1), 100);
      const now = nowTs(ctx);
      const kinds = i.kinds ?? null;
      const kindSql =
        kinds === null ? '' : kinds.length === 0 ? ' AND 0' : ` AND kind IN (${kinds.map(() => '?').join(', ')})`;
      return dml(w).write(
        "UPDATE jobs SET status = 'running', lease_owner = ?, lease_until = ?, attempts = attempts + 1, started_at = ?, " +
          'updated_at = ? WHERE id IN (SELECT id FROM jobs WHERE workspace_id = ? AND status = ' +
          `'queued' AND run_after <= ?${kindSql} ORDER BY priority DESC, run_after, display_seq LIMIT ?) RETURNING *`,
        [i.leaseOwner, after(ctx, i.leaseMs), now, now, ctx.ws, now, ...(kinds ?? []), limit],
      ).rows as JobRow[];
    },
    heartbeat: (id, owner, leaseMs) => {
      held(id, owner);
      return updateRow<JobRow>(
        ctx,
        'jobs',
        id,
        { lease_until: after(ctx, leaseMs) },
        { extraWhere: leaseGuard(owner) },
      );
    },
    succeed: (id, owner, result) => {
      held(id, owner);
      return updateRow<JobRow>(
        ctx,
        'jobs',
        id,
        {
          status: 'succeeded',
          result_json: result === undefined || result === null ? null : JSON.stringify(result),
          finished_at: nowTs(ctx),
          lease_owner: null,
          lease_until: null,
        },
        { extraWhere: leaseGuard(owner) },
      );
    },
    fail: (id, owner, i) => {
      const job = held(id, owner);
      const dead = job.attempts >= job.max_attempts;
      return updateRow<JobRow>(
        ctx,
        'jobs',
        id,
        {
          status: dead ? 'dead' : 'queued',
          last_error: i.error.slice(0, 4000),
          run_after: dead ? undefined : after(ctx, Math.max(0, i.retryAfterMs ?? 0)),
          finished_at: dead ? nowTs(ctx) : null,
          lease_owner: null,
          lease_until: null,
        },
        { extraWhere: leaseGuard(owner) },
      );
    },
    cancel: (id) => {
      const job = mustGetRow<JobRow>(ctx, 'jobs', id);
      if (job.status === 'succeeded' || job.status === 'dead' || job.status === 'cancelled') {
        throw new DbRuleError('repo.version_conflict', `job ${job.display_id} đã kết thúc (${job.status})`);
      }
      const row = updateRow<JobRow>(ctx, 'jobs', id, {
        status: 'cancelled',
        finished_at: nowTs(ctx),
        lease_owner: null,
        lease_until: null,
      });
      return audited(ctx, { action: 'job.cancel', table: 'jobs', row, before: job });
    },
    reapExpiredLeases: () => {
      const w = requireW(ctx);
      const now = nowTs(ctx);
      return dml(w).write(
        "UPDATE jobs SET status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'queued' END, " +
          "finished_at = CASE WHEN attempts >= max_attempts THEN ? ELSE NULL END, last_error = 'lease hết hạn', " +
          "lease_owner = NULL, lease_until = NULL, updated_at = ? WHERE workspace_id = ? AND status = 'running' AND lease_until < ?",
        [now, now, ctx.ws, now],
      ).changes;
    },
  };
}
