// Họ việc (tasks, TK-) + hàng đợi / outbox trong DB (jobs, JB-) — DATABASE §5.9, §5.18; BUILD-PLAN §B.4 scheduler.
// Job được INSERT cùng giao dịch với thay đổi dữ liệu (transactional outbox). Dedupe chỉ trên hàng 'queued'.
// Worker một tiến trình: claim = UPDATE nguyên tử trong giao dịch ghi; lease hết hạn = worker coi như đã chết.
import type {
  JobKind,
  JobRow,
  JobStatus,
  Page,
  PageRequest,
  TaskPriority,
  TaskRow,
  TaskSource,
  TaskStatus,
} from './types.ts';

export interface TaskReads {
  get(taskId: string): TaskRow | null;
  getByDisplayId(displayId: string): TaskRow | null;
  list(filter?: {
    assigneeRoleId?: string;
    status?: readonly TaskStatus[];
    includeDeleted?: boolean;
    page?: PageRequest;
  }): Page<TaskRow>;
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  source: TaskSource;
  /** Mặc định = actor của giao dịch. */
  requestedBy?: string;
  assigneeRoleId?: string | null;
  positionId?: string | null;
  priority?: TaskPriority;
  dueAt?: string | null;
  /** Mặc định 'todo'. */
  status?: Extract<TaskStatus, 'todo' | 'queued'>;
  threadId?: string | null;
  commitmentId?: string | null;
  parentTaskId?: string | null;
  sourceMessageId?: string | null;
}

export interface TaskRepo extends TaskReads {
  /** DB chặn giao cho Role Trọng thương ('role.wounded') / thiếu Polaris ('polaris.rule'). */
  create(input: CreateTaskInput): TaskRow;
  update(
    taskId: string,
    patch: {
      title?: string;
      description?: string | null;
      priority?: TaskPriority;
      dueAt?: string | null;
      assigneeRoleId?: string | null;
    },
    expectedVersion?: number,
  ): TaskRow;
  /** Chuyển trạng thái; running ⇒ started_at, done / failed / cancelled ⇒ completed_at (= app_now()). */
  transition(
    taskId: string,
    to: TaskStatus,
    opts?: { detail?: string | null; resultSummary?: string | null; expectedVersion?: number },
  ): TaskRow;
  /** Đánh giá kết quả (owner / admin): verified ⇒ verified_by = actor giao dịch, verified_at. */
  verify(taskId: string, verdict: Exclude<TaskRow['verification'], 'unverified'>): TaskRow;
  /** Ghi ai phát hiện thất bại (MỘT lần). self_reported cần audit report_task của chính Role (DB ép). */
  recordFailureDisclosure(
    taskId: string,
    input: { disclosure: NonNullable<TaskRow['failure_disclosure']>; auditId?: string | null },
  ): TaskRow;
  /** Cộng dồn token / chi phí của lượt (cột cache). */
  addUsage(taskId: string, input: { tokens: number; costMicroUsd: number }): TaskRow;
  softDelete(taskId: string): void;
}

export interface JobReads {
  get(jobId: string): JobRow | null;
  list(filter?: { kind?: JobKind; status?: readonly JobStatus[]; page?: PageRequest }): Page<JobRow>;
}

export interface EnqueueJobInput {
  kind: JobKind;
  /** Đối tượng JSON (stringify ở repo). */
  payload: Record<string, unknown>;
  /** Mặc định app_now(). */
  runAfter?: string;
  priority?: number;
  maxAttempts?: number;
  /** Trùng job 'queued' cùng dedupeKey ⇒ không tạo mới, trả job đang chờ (deduped = true). */
  dedupeKey?: string | null;
}

export interface JobRepo extends JobReads {
  enqueue(input: EnqueueJobInput): { job: JobRow; deduped: boolean };
  /**
   * Lấy tối đa `limit` job 'queued' đến hạn (run_after ≤ app_now()), ưu tiên priority cao rồi run_after sớm; đặt
   * running + lease (lease_owner, lease_until = now + leaseMs), attempts + 1.
   */
  claim(input: { leaseOwner: string; leaseMs: number; kinds?: readonly JobKind[]; limit?: number }): JobRow[];
  /** Gia hạn lease; lease_owner khác ⇒ 'repo.version_conflict' (job đã bị worker khác lấy lại). */
  heartbeat(jobId: string, leaseOwner: string, leaseMs: number): JobRow;
  succeed(jobId: string, leaseOwner: string, result?: Record<string, unknown> | null): JobRow;
  /** Lỗi: còn lượt ⇒ về 'queued' với run_after = now + retryAfterMs; hết lượt ⇒ 'dead'. */
  fail(jobId: string, leaseOwner: string, input: { error: string; retryAfterMs?: number }): JobRow;
  cancel(jobId: string): JobRow;
  /** Job 'running' có lease_until < now ⇒ về 'queued' (hoặc 'dead' nếu hết lượt). Trả số job đã xử lý. */
  reapExpiredLeases(): number;
}
