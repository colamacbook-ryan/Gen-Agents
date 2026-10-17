import { z } from 'zod';
import { FIXED_CODES } from '../ids.ts';
import {
  AnyId,
  Bp,
  IdempotencyHeaders,
  IdOf,
  idShape,
  Job,
  KeyStr,
  list,
  Minor,
  Nat,
  OpaqueId,
  PageOf,
  PosMinor,
  pageQueryShape,
  queryCsv,
  queryInt,
  Ref,
  SecretInput,
  SMinor,
  str,
  Ts,
} from './common.ts';
import { accepted, defineLane, noContent, ok } from './define.ts';
import { EngineSlug, I18nParams, LEDGER_ENTRY_TYPES, ROLE_RUNTIMES, TgUserId } from './shapes.ts';

// L-WORK — Telegram, chủ động, việc, kinh tế (₲), Polaris, Trọng thương, Brain (BACKEND-TRIAL §3.5: 43 route).
// Bot Telegram KHÔNG gọi HTTP: nó gọi cùng dịch vụ (service layer) mà các route này dùng (§3.9) nên hành vi một nguồn.
// Mọi POST tạo bút toán ₲ (WRK-23…26) bắt buộc `Idempotency-Key` → `ledger_entries.idempotency_key` (UNIQUE).
// B-REL (Q-B5): KHÔNG có nút duyệt nhanh trên Telegram; duyệt bài học / quyền tool / đề xuất bằng CLI.
// "Không trừ" (FS Chương 8) KHÔNG có endpoint: DB không có cột cho việc này (chỉ là thao tác đóng thẻ ở giao diện).

const work = defineLane('L-WORK');

const MemoryScope = z.enum(['personal', 'position']);
export const MEMORY_KINDS = ['fact', 'lesson', 'person', 'commitment', 'procedure'] as const;
/** `memories.status` (DB: active | proposed | superseded | obsolete) + `deleted` = `deleted_at` đặt (thùng rác, WRK-40/41). Đặc tả ghi `stale` ⇒ theo DB: `obsolete`. */
export const MEMORY_STATUSES = ['active', 'proposed', 'superseded', 'obsolete', 'deleted'] as const;
/** `memories.source_type`, `.sensitivity`. */
export const MEMORY_SOURCE_TYPES = [
  'conversation',
  'owner',
  'consolidation',
  'training',
  'system',
  'reflection',
] as const;
export const SENSITIVITIES = ['normal', 'personal', 'confidential'] as const;
/** `tasks.verification`. */
export const TASK_VERIFICATIONS = ['unverified', 'verified', 'disputed', 'rejected'] as const;
/** `commitments.status` / `.counterparty_kind`. */
export const COMMITMENT_STATUSES = ['open', 'kept', 'missed', 'cancelled', 'renegotiated'] as const;
export const COMMITMENT_COUNTERPARTIES = ['owner', 'user', 'external', 'role'] as const;
/** `telegram_bots.status`, `telegram_allowlist.added_via`. */
export const TELEGRAM_BOT_STATUSES = ['pending', 'active', 'paused', 'revoked', 'error'] as const;
export const ALLOWLIST_ADDED_VIA = ['capture', 'manual', 'default_setting'] as const;
/** `proactive_policies.break_quiet_level` (đặc tả ghi never | urgent | high ⇒ theo DB). */
export const BREAK_QUIET_LEVELS = ['never', 'urgent_only', 'high_and_above'] as const;
/**
 * `proactive_sends.status` ở mức API: DB có `suppressed_quiet | suppressed_cap | suppressed_disabled | suppressed_wounded`;
 * API gộp thành `blocked` + `blockReason` (quiet | cap | disabled | wounded) — ánh xạ một chiều, đối chiếu ở test db-parity.
 */
export const PROACTIVE_SEND_STATUSES = ['reserved', 'sent', 'failed', 'expired', 'blocked', 'test'] as const;
export const SEND_BLOCK_REASONS = ['quiet', 'cap', 'disabled', 'wounded'] as const;
/** `polaris_checks.subject_kind`. */
export const POLARIS_CHECK_KINDS = ['proposal', 'permission_request', 'proactive', 'task_accept'] as const;
export const TASK_STATUSES = [
  'todo',
  'queued',
  'running',
  'waiting_approval',
  'waiting_permission',
  'blocked',
  'done',
  'failed',
  'cancelled',
] as const;
export const TASK_SOURCES = ['telegram', 'web', 'schedule', 'proactive', 'system', 'training'] as const;
export const TASK_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
const RANGES = ['today', '7d', '30d'] as const;
export const PENALTY_CLASSES = ['self_reported', 'dissatisfaction', 'concealment', 'harness_violation'] as const;
const WOUND_CONDITION = z.enum(['normal', 'wounded']);
export const PROACTIVE_TRIGGERS = [
  'commitment_reminder',
  'task_done',
  'opportunity',
  'incident',
  'heartbeat_digest',
] as const;
/** Bằng chứng của án phạt: một việc (TK) hoặc một dòng audit (AU). */
const EvidenceRef = Ref(['TK', 'AU']);
const Reason500 = str(500, 1);
const MemoryContent = str(4000, 1);

// ---------------------------------------------------------------- WRK-01…09 Telegram (A3.T)
const AllowlistRow = z.strictObject({
  ...idShape('AL'),
  displayName: str(120),
  tgUserId: TgUserId,
  isOwner: z.boolean(),
  status: z.enum(['active', 'removed']),
  addedVia: z.enum(ALLOWLIST_ADDED_VIA),
  addedAt: Ts,
});
const OWNER_CHANGE_STATES = ['captured', 'verifying', 'verified'] as const;
const CAPTURE_STATES = ['waiting', 'captured', 'expired', 'confirmed', 'cancelled'] as const;
const CaptureId = z.strictObject({ captureId: OpaqueId });
const OwnerChangeId = z.strictObject({ ownerChangeId: OpaqueId });

export const WRK_01 = work({
  id: 'WRK-01',
  method: 'GET',
  path: '/roles/{roleRef}/telegram',
  auth: 'A',
  o4: 'blocked',
  request: { params: z.strictObject({ roleRef: Ref('RL') }) },
  // Token KHÔNG bao giờ có trong response (chỉ `tokenLast4`).
  response: ok(
    z.strictObject({
      bot: z
        .strictObject({
          ...idShape('TG'),
          username: str(64, 1),
          getMe: z.enum(['ok', 'error', 'unknown']),
          tokenLast4: str(4, 1),
          status: z.enum(TELEGRAM_BOT_STATUSES),
        })
        .nullable(),
      allowlist: list(AllowlistRow, 64),
      ownerChange: z.strictObject({ id: OpaqueId, state: z.enum(OWNER_CHANGE_STATES) }).nullable(),
    }),
  ),
  cli: ['telegram <role>'],
});

export const WRK_02 = work({
  id: 'WRK-02',
  method: 'PUT',
  path: '/roles/{roleRef}/telegram/bot',
  auth: 'O',
  touchesCredential: true,
  o4: 'blocked',
  // Chỉ body. Gọi `getMe`; thay bot thì bot cũ bị xoá mềm. CLI: ô ẩn hoặc `--stdin`.
  request: {
    params: z.strictObject({ roleRef: Ref('RL') }),
    body: z.strictObject({ token: SecretInput('bot_token') }),
  },
  response: ok(
    z.strictObject({
      bot: z.strictObject({ ...idShape('TG'), username: str(64, 1) }),
      replaced: IdOf('TG').nullable(),
    }),
  ),
  errors: ['telegram.token_invalid'],
  cli: ['telegram connect', 'REPL /telegram'],
});

export const WRK_03 = work({
  id: 'WRK-03',
  method: 'POST',
  path: '/telegram/bots/{botRef}/captures',
  auth: 'A',
  ownerWhen: { in: 'body', field: 'purpose', equals: 'owner_change' },
  o4: 'blocked',
  request: {
    params: z.strictObject({ botRef: Ref('TG') }),
    body: z.strictObject({ purpose: z.enum(['allowlist', 'owner_change']) }),
  },
  // Cửa sổ 5 phút; rồi SSE `telegram.capture`. `owner_change` chỉ owner (`auth.forbidden`).
  response: ok(z.strictObject({ captureId: OpaqueId, expiresAt: Ts })),
  cli: ['telegram connect', 'telegram allow', 'telegram owner-change'],
});

export const WRK_04 = work({
  id: 'WRK-04',
  method: 'GET',
  path: '/telegram/captures/{captureId}',
  auth: 'A',
  o4: 'blocked',
  request: { params: CaptureId },
  // Thăm dò khi SSE rớt.
  response: ok(
    z.strictObject({
      state: z.enum(CAPTURE_STATES),
      candidate: z.strictObject({ displayName: str(120), tgUserId: TgUserId }).nullable(),
      expiresAt: Ts,
    }),
  ),
  noCli: 'thăm dò nội bộ khi SSE rớt',
});

export const WRK_05 = work({
  id: 'WRK-05',
  method: 'POST',
  path: '/telegram/captures/{captureId}/confirm',
  auth: 'A',
  ownerWhen: { in: 'body', field: 'asOwner', equals: true },
  o4: 'blocked',
  request: { params: CaptureId, body: z.strictObject({ asOwner: z.boolean().optional() }) },
  // `owner_change`: thêm hàng owner mới, bot gửi mã 6 chữ số (hạn 10 phút).
  response: ok(
    z.strictObject({
      allowlist: IdOf('AL'),
      ownerChange: z.strictObject({ id: OpaqueId, codeExpiresAt: Ts }).nullable(),
    }),
  ),
  errors: ['telegram.capture_expired', 'db.*'],
  cli: ['trả lời y'],
});

export const WRK_06 = work({
  id: 'WRK-06',
  method: 'POST',
  path: '/telegram/captures/{captureId}/cancel',
  auth: 'A',
  o4: 'blocked',
  request: { params: CaptureId },
  // `owner_change`: gỡ hàng owner mới nếu đã thêm.
  response: noContent(),
  cli: ['trả lời n', 'Ctrl-C'],
});

export const WRK_07 = work({
  id: 'WRK-07',
  method: 'POST',
  path: '/telegram/owner-changes/{ownerChangeId}/verify',
  auth: 'O',
  // Đổi chủ Telegram = đổi người điều khiển bot (định tuyến credential).
  touchesCredential: true,
  o4: 'blocked',
  // Mã 6 chữ số gửi qua Telegram; sai 5 lần thì huỷ, hết hạn 10 phút (hàng mới bị gỡ). Chỉ body; server không log.
  request: {
    params: OwnerChangeId,
    body: z.strictObject({
      code: z
        .string()
        .length(6)
        .regex(/^\d{6}$/)
        .meta({ example: '123456' }),
    }),
  },
  response: ok(z.strictObject({ state: z.literal('verified') })),
  errors: ['telegram.code_invalid', 'telegram.code_expired'],
  cli: ['telegram owner-change (bước 2)'],
});

export const WRK_08 = work({
  id: 'WRK-08',
  method: 'POST',
  path: '/telegram/owner-changes/{ownerChangeId}/remove-old',
  auth: 'O',
  touchesCredential: true,
  o4: 'blocked',
  request: { params: OwnerChangeId },
  // `conflict` khi chưa xác minh.
  response: ok(z.strictObject({ state: z.literal('done'), removed: IdOf('AL') })),
  cli: ['telegram owner-change (bước 3)'],
});

export const WRK_09 = work({
  id: 'WRK-09',
  method: 'DELETE',
  path: '/telegram/allowlist/{allowlistRef}',
  auth: 'A',
  o4: 'open',
  request: { params: z.strictObject({ allowlistRef: Ref('AL') }) },
  // `db.rule_violation`: hàng owner (bất biến ≥ 1 owner `active`).
  response: noContent(),
  errors: ['db.rule_violation'],
  cli: ['telegram remove', 'emergency'],
});

// ---------------------------------------------------------------- WRK-10…14 chủ động (A3.P)
const MinuteOfDay = z.number().int().min(0).max(1439);
const QuietWindow = z.strictObject({ start: MinuteOfDay, end: MinuteOfDay });
const ProactiveTriggers = z.strictObject({
  commitment_reminder: z.boolean(),
  task_done: z.boolean(),
  opportunity: z.boolean(),
  incident: z.boolean(),
  heartbeat_digest: z.boolean(),
});
const PolicyView = z.strictObject({
  ...idShape('PP'),
  version: Nat,
  enabled: z.boolean(),
  maxPerDay: z.number().int().min(0).max(20),
  quietHours: z.strictObject({ start: MinuteOfDay, end: MinuteOfDay, weekend: QuietWindow.nullable() }),
  triggers: ProactiveTriggers,
  breakQuiet: z.enum(BREAK_QUIET_LEVELS),
  channel: z.literal('telegram'),
});
const PolicyResult = z.strictObject({ policy: PolicyView });
const RoleParams = z.strictObject({ roleRef: Ref('RL') });

export const WRK_10 = work({
  id: 'WRK-10',
  method: 'GET',
  path: '/roles/{roleRef}/proactive',
  auth: 'V',
  o4: 'blocked',
  // `sendsCursor` phân trang `sends` (cùng kiểu `checksCursor` của WRK-27).
  request: {
    params: RoleParams,
    query: z.strictObject({ sendsCursor: str(256, 1).optional() }),
  },
  response: ok(
    z.strictObject({
      policy: PolicyView,
      summary: z.strictObject({ key: KeyStr, params: I18nParams }),
      today: z.strictObject({ used: Nat, max: Nat, lastAt: Ts.nullable() }),
      last7d: z.strictObject({ sent: Nat, blocked: Nat }),
      jobs: list(z.strictObject({ ...idShape('PA'), kind: KeyStr, nextRunAt: Ts.nullable() }), 100),
      sends: PageOf(
        z.strictObject({
          ...idShape('PN'),
          trigger: z.enum(PROACTIVE_TRIGGERS),
          status: z.enum(PROACTIVE_SEND_STATUSES),
          blockReason: z.enum(SEND_BLOCK_REASONS).nullable(),
          at: Ts,
        }),
      ),
      locked: z.enum(['wounded', 'no_card']).nullable(),
    }),
  ),
  cli: ['proactive <role>'],
});

export const WRK_11 = work({
  id: 'WRK-11',
  method: 'PUT',
  path: '/roles/{roleRef}/proactive',
  auth: 'A',
  o4: 'blocked',
  request: {
    params: RoleParams,
    body: z.strictObject({
      enabled: z.boolean(),
      maxPerDay: z.number().int().min(0).max(20),
      quietHours: z.strictObject({ start: MinuteOfDay, end: MinuteOfDay, weekend: QuietWindow.nullable() }),
      triggers: ProactiveTriggers,
      breakQuiet: z.enum(BREAK_QUIET_LEVELS),
    }),
  },
  // Version mới. `db.*`: Trọng thương khoá.
  response: ok(PolicyResult),
  errors: ['db.*'],
  cli: ['proactive set'],
});

export const WRK_12 = work({
  id: 'WRK-12',
  method: 'POST',
  path: '/roles/{roleRef}/proactive/reset',
  auth: 'A',
  o4: 'blocked',
  request: { params: RoleParams },
  // Về mặc định `proactive.defaults`.
  response: ok(PolicyResult),
  cli: ['proactive reset'],
});

export const WRK_13 = work({
  id: 'WRK-13',
  method: 'POST',
  path: '/roles/{roleRef}/proactive/test-send',
  auth: 'A',
  o4: 'blocked',
  request: { params: RoleParams },
  // Đánh dấu `[thử]`, không tính vào trần. `conflict` khi Telegram lỗi hoặc chưa có thẻ.
  response: ok(z.strictObject({ send: IdOf('PN') })),
  cli: ['proactive test'],
});

export const WRK_14 = work({
  id: 'WRK-14',
  method: 'PUT',
  path: '/roles/{roleRef}/proactive/enabled',
  auth: 'A',
  o4: 'open',
  request: { params: RoleParams, body: z.strictObject({ enabled: z.boolean() }) },
  response: ok(PolicyResult),
  cli: ['proactive on', 'proactive off', 'emergency'],
});

// ---------------------------------------------------------------- WRK-15…20 việc, cam kết
const TaskRow = z.strictObject({
  ...idShape('TK'),
  role: IdOf('RL').nullable(),
  title: str(200, 1),
  source: z.enum(TASK_SOURCES),
  status: z.enum(TASK_STATUSES),
  statusDetail: str(200).nullable(),
  priority: z.enum(TASK_PRIORITIES),
  dueAt: Ts.nullable(),
  startedAt: Ts.nullable(),
  completedAt: Ts.nullable(),
  tokensTotal: Nat,
  engineSlug: EngineSlug.nullable(),
  verification: z.enum(TASK_VERIFICATIONS),
  failureDisclosure: KeyStr.nullable(),
  pausedByWound: IdOf('RW').nullable(),
  penaltyAllowed: z.boolean(),
  penaltyBlockedReason: KeyStr.nullable(),
});
const TaskParams = z.strictObject({ taskRef: Ref('TK') });

export const WRK_15 = work({
  id: 'WRK-15',
  method: 'GET',
  path: '/tasks',
  auth: 'V',
  o4: 'blocked',
  request: {
    query: z.strictObject({
      roleRef: Ref('RL').optional(),
      // Danh sách trạng thái phân tách bằng dấu phẩy: `status=running,queued`.
      status: queryCsv(TASK_STATUSES, TASK_STATUSES.length).optional(),
      source: z.enum(TASK_SOURCES).optional(),
      range: z.enum(RANGES).optional(),
      // Ngữ pháp ô truy vấn DATABASE §8.1 (lưới TK).
      q: str(500, 1).optional(),
      ...pageQueryShape(),
    }),
  },
  response: ok(PageOf(TaskRow)),
  cli: ['tasks', 'Telegram /tasks'],
});

export const WRK_16 = work({
  id: 'WRK-16',
  method: 'GET',
  path: '/tasks/{taskRef}',
  auth: 'V',
  o4: 'blocked',
  request: { params: TaskParams },
  response: ok(
    TaskRow.extend({
      description: str(20_000).nullable(),
      resultSummary: str(8000).nullable(),
      commitment: IdOf('CM').nullable(),
      sessions: list(IdOf('SS'), 200),
      polarisCheck: IdOf('PC').nullable(),
      failureReportAudit: IdOf('AU').nullable(),
      ledger: list(IdOf('LG'), 200),
    }),
  ),
  cli: ['task show'],
});

export const WRK_17 = work({
  id: 'WRK-17',
  method: 'POST',
  path: '/tasks/{taskRef}/reassign',
  auth: 'A',
  o4: 'blocked',
  request: { params: TaskParams, body: z.strictObject({ toRoleRef: Ref('RL') }) },
  // `db.wounded`: Role đích đang Trọng thương.
  response: ok(TaskRow),
  errors: ['db.wounded'],
  cli: ['task reassign'],
});

export const WRK_18 = work({
  id: 'WRK-18',
  method: 'POST',
  path: '/tasks/{taskRef}/stop',
  auth: 'A',
  o4: 'blocked',
  request: { params: TaskParams },
  // `cancelled`, huỷ phiên đang chạy. `conflict` khi việc không chạy.
  response: ok(TaskRow),
  cli: ['task stop', 'Telegram /stop'],
});

export const WRK_19 = work({
  id: 'WRK-19',
  method: 'POST',
  path: '/tasks/{taskRef}/verify',
  auth: 'A',
  o4: 'blocked',
  request: {
    params: TaskParams,
    body: z.strictObject({ verdict: z.enum(['verified', 'disputed', 'rejected']), note: str(500, 1).optional() }),
  },
  response: ok(TaskRow),
  errors: ['db.check_failed'],
  cli: ['task verify'],
});

export const WRK_20 = work({
  id: 'WRK-20',
  method: 'GET',
  path: '/commitments',
  auth: 'V',
  o4: 'blocked',
  request: { query: z.strictObject({ roleRef: Ref('RL').optional(), status: z.enum(COMMITMENT_STATUSES).optional() }) },
  response: ok(
    list(
      z.strictObject({
        ...idShape('CM'),
        position: IdOf('PS'),
        promisedBy: IdOf('RL').nullable(),
        counterpartyKind: z.enum(COMMITMENT_COUNTERPARTIES),
        counterpartyLabel: str(120),
        statement: str(2000),
        dueAt: Ts,
        status: z.enum(COMMITMENT_STATUSES),
        progressPct: z.number().int().min(0).max(100).nullable(),
        rewardMinor: Minor.nullable(),
        nextReminderAt: Ts.nullable(),
      }),
    ),
  ),
  cli: ['commitments', 'Telegram /tasks'],
});

// ---------------------------------------------------------------- WRK-21…26 ví ₲, phạt, thưởng, đảo
const LedgerEntry = z.strictObject({
  ...idShape('LG'),
  entryType: z.enum(LEDGER_ENTRY_TYPES),
  signedAmountMinor: SMinor,
  balanceAfterMinor: Minor,
  reason: str(500),
  penaltyClass: KeyStr.nullable(),
  evidence: AnyId.nullable(),
  recordedBy: IdOf('US').nullable(),
  reverses: IdOf('LG').nullable(),
  at: Ts,
});

export const WRK_21 = work({
  id: 'WRK-21',
  method: 'GET',
  path: '/roles/{roleRef}/wallet',
  auth: 'V',
  o4: 'blocked',
  request: { params: RoleParams, query: z.strictObject(pageQueryShape()) },
  // `v_ledger_by_role`. Telegram `/wallet`: 5 dòng, chỉ owner (PS §6.2 cấm lộ ₲ cho người ngoài owner).
  response: ok(
    z.strictObject({
      wallet: z.strictObject({
        ...idShape('WL'),
        balanceMinor: Minor,
        rank: Nat.nullable(),
        rankTotal: Nat,
        condition: WOUND_CONDITION,
      }),
      entries: PageOf(LedgerEntry),
    }),
  ),
  cli: ['wallet', 'Telegram /wallet'],
});

const PENALTY_LOCK_REASONS = ['self_reported_first', 'machine_detected_first', 'evidence_required'] as const;

export const WRK_22 = work({
  id: 'WRK-22',
  method: 'GET',
  path: '/penalty-presets',
  auth: 'A',
  o4: 'blocked',
  request: { query: z.strictObject({ roleRef: Ref('RL'), evidenceRef: EvidenceRef }) },
  // `v_penalty_presets` + luật khoá theo thứ tự audit.
  response: ok(
    z.strictObject({
      classes: list(
        z.strictObject({
          class: z.enum(PENALTY_CLASSES),
          settingKey: KeyStr,
          maxBp: Bp.nullable(),
          minBp: Bp.nullable(),
          fixedBp: Bp.nullable(),
          suggestionsBp: list(Bp, 16),
          allowed: z.boolean(),
          lockReason: z.enum(PENALTY_LOCK_REASONS).nullable(),
          minAmountMinor: Minor,
          maxAmountMinor: Minor,
        }),
        8,
      ),
      forcedClass: z.enum(PENALTY_CLASSES).nullable(),
    }),
  ),
  cli: ['penalize (in biên trước khi hỏi)'],
});

const PenaltyBase = { evidenceRef: EvidenceRef, class: z.enum(PENALTY_CLASSES), reason: Reason500 };

export const WRK_23 = work({
  id: 'WRK-23',
  method: 'POST',
  path: '/roles/{roleRef}/ledger/penalties',
  auth: 'A',
  o4: 'blocked',
  idempotent: true,
  request: {
    params: RoleParams,
    headers: IdempotencyHeaders,
    // Đúng MỘT trong `pctBp` / `amountMinor`.
    body: z.union([
      z.strictObject({ ...PenaltyBase, pctBp: Bp }),
      z.strictObject({ ...PenaltyBase, amountMinor: PosMinor }),
    ]),
  },
  response: ok(
    z.strictObject({
      entry: IdOf('LG'),
      balanceAfterMinor: Minor,
      rankAfter: Nat.nullable(),
      wound: IdOf('RW').nullable(),
    }),
  ),
  // `db.ledger_rule`: ngoài biên của hạng; sai hạng theo thứ tự audit. `db.wounded`: ví đã 0.
  errors: ['db.ledger_rule', 'db.wounded'],
  cli: ['penalize'],
});

export const WRK_24 = work({
  id: 'WRK-24',
  method: 'POST',
  path: '/roles/{roleRef}/ledger/grants',
  auth: 'A',
  o4: 'blocked',
  idempotent: true,
  request: {
    params: RoleParams,
    headers: IdempotencyHeaders,
    body: z.strictObject({ amountMinor: PosMinor, reason: Reason500 }),
  },
  response: ok(
    z.strictObject({ entry: IdOf('LG'), balanceAfterMinor: Minor, revived: z.boolean(), rankAfter: Nat.nullable() }),
  ),
  errors: ['db.ledger_rule'],
  cli: ['grant'],
});

export const WRK_25 = work({
  id: 'WRK-25',
  method: 'POST',
  path: '/roles/{roleRef}/ledger/rewards',
  auth: 'A',
  o4: 'blocked',
  idempotent: true,
  request: {
    params: RoleParams,
    headers: IdempotencyHeaders,
    body: z
      .strictObject({
        kind: z.enum(['reward', 'honesty_reward']),
        taskRef: Ref('TK').optional(),
        commitmentRef: Ref('CM').optional(),
        auditRef: Ref('AU').optional(),
        amountMinor: PosMinor,
        reason: Reason500,
      })
      // Ít nhất một bằng chứng.
      .refine((b) => b.taskRef !== undefined || b.commitmentRef !== undefined || b.auditRef !== undefined, {
        message: 'cần ít nhất một bằng chứng',
      }),
  },
  response: ok(z.strictObject({ entry: IdOf('LG'), balanceAfterMinor: Minor })),
  // `db.ledger_rule`: việc chưa `verified`; vượt `reward_cap_minor` của Position.
  errors: ['db.ledger_rule'],
  cli: ['reward', 'reward --honesty'],
});

export const WRK_26 = work({
  id: 'WRK-26',
  method: 'POST',
  path: '/ledger/{ledgerRef}/reversal',
  auth: 'A',
  o4: 'blocked',
  idempotent: true,
  request: {
    params: z.strictObject({ ledgerRef: Ref('LG') }),
    headers: IdempotencyHeaders,
    body: z.strictObject({ reason: Reason500 }),
  },
  // `db.ledger_rule`: đã đảo, hoặc loại không đảo được.
  response: ok(z.strictObject({ entry: IdOf('LG') })),
  errors: ['db.ledger_rule'],
  cli: ['reverse'],
});

// ---------------------------------------------------------------- WRK-27…33 Polaris, Trọng thương, bảng xếp hạng
export const WRK_27 = work({
  id: 'WRK-27',
  method: 'GET',
  path: '/roles/{roleRef}/polaris',
  auth: 'V',
  o4: 'blocked',
  request: { params: RoleParams, query: z.strictObject({ checksCursor: str(256, 1).optional() }) },
  // `v_role_polaris`, `polaris_checks`, `compiled_prompt_segments`. `block.text` = nguyên văn compiler (văn bản gửi model,
  // KHÔNG phải chữ giao diện).
  response: ok(
    z.strictObject({
      position: z.strictObject({
        goalKey: KeyStr,
        balanceMinor: Minor,
        rank: Nat.nullable(),
        rankTotal: Nat,
        gapAboveMinor: Minor.nullable(),
        delta7dMinor: SMinor,
        earned7dMinor: Minor,
        lastPenalty: z
          .strictObject({ ledger: IdOf('LG'), class: KeyStr, at: Ts, lesson: IdOf('MM').nullable() })
          .nullable(),
        wound: IdOf('RW').nullable(),
        opportunities: list(IdOf('TK'), 100),
      }),
      block: z.strictObject({
        text: str(16_384),
        rulesTokens: Nat,
        dynamicTokens: Nat,
        total: Nat,
        target: Nat,
      }),
      rules: list(z.strictObject({ code: z.enum(FIXED_CODES.polarisRules), params: I18nParams }), 4),
      checks: PageOf(
        z.strictObject({
          ...idShape('PC'),
          kind: z.enum(POLARIS_CHECK_KINDS),
          subject: AnyId.nullable(),
          expectedMinor: SMinor,
          rule: str(64),
          reason: str(500),
          rankAtTime: Nat.nullable(),
          audit: IdOf('AU'),
        }),
      ),
      woundHistory: list(IdOf('RW'), 200),
      state: z.enum(['active', 'wounded', 'no_card']),
    }),
  ),
  cli: ['polaris'],
});

export const WRK_28 = work({
  id: 'WRK-28',
  method: 'GET',
  path: '/roles/{roleRef}/wound',
  auth: 'V',
  o4: 'blocked',
  request: { params: RoleParams },
  // `v_role_wounds`, `v_wound_messages`.
  response: ok(
    z.strictObject({
      wound: z.strictObject({ ...idShape('RW'), since: Ts, cause: IdOf('LG'), durationS: Nat }).nullable(),
      reflection: z.strictObject({
        job: Job.nullable(),
        session: IdOf('SS').nullable(),
        attempts: Nat,
        maxAttempts: Nat,
        lessons: list(
          z.strictObject({
            ...idShape('MM'),
            context: str(2000),
            mistake: str(2000),
            correction: str(2000),
            evidence: list(AnyId, 20),
            status: z.enum(MEMORY_STATUSES),
          }),
          50,
        ),
      }),
      pausedTasks: list(IdOf('TK'), 200),
      commitmentsDue: list(IdOf('CM'), 200),
      messages: list(
        z.strictObject({
          ...idShape('MSG'),
          fromKind: z.enum(['owner', 'allowlisted']),
          at: Ts,
          isPending: z.boolean(),
        }),
        200,
      ),
      suggestedGrantMinor: Minor,
      rankIfRevived: Nat.nullable(),
    }),
  ),
  cli: ['wound'],
});

export const WRK_29 = work({
  id: 'WRK-29',
  method: 'POST',
  path: '/roles/{roleRef}/wound/reflection/rerun',
  auth: 'A',
  o4: 'blocked',
  request: { params: RoleParams },
  // `conflict` khi lượt trước chưa thất bại; `gate.core_agent_not_ready` ⇒ job chờ.
  response: accepted(z.strictObject({ job: Job })),
  errors: ['reflection.limit', 'gate.core_agent_not_ready'],
  cli: ['reflection rerun'],
});

export const WRK_30 = work({
  id: 'WRK-30',
  method: 'POST',
  path: '/wound-messages/{messageRef}/reassign',
  auth: 'A',
  o4: 'blocked',
  request: {
    params: z.strictObject({ messageRef: Ref('MSG') }),
    body: z.strictObject({ toRoleRef: Ref('RL').optional() }),
  },
  // `source_message_id` = tin.
  response: ok(z.strictObject({ task: IdOf('TK') })),
  errors: ['db.wounded'],
  cli: ['wound-msg reassign'],
});

export const WRK_31 = work({
  id: 'WRK-31',
  method: 'GET',
  path: '/leaderboard',
  auth: 'V',
  o4: 'blocked',
  // `v_leaderboard`.
  response: ok(
    z.strictObject({
      totals: z.strictObject({
        balanceMinor: Minor,
        earned7dMinor: Minor,
        ownerGranted7dMinor: Minor,
        penalized7dMinor: Minor,
        net7dMinor: SMinor,
      }),
      rows: list(
        z.strictObject({
          rank: Nat,
          role: z.strictObject({ ...idShape('RL'), name: str(60, 1) }),
          balanceMinor: Minor,
          gapAboveMinor: Minor.nullable(),
          delta7dMinor: SMinor,
          earned7dMinor: Minor,
          condition: WOUND_CONDITION,
          runtime: z.enum(ROLE_RUNTIMES),
          positionTitle: str(120),
        }),
        500,
      ),
      unranked: list(z.strictObject({ role: IdOf('RL'), reason: z.literal('no_card') }), 500),
    }),
  ),
  cli: ['leaderboard'],
});

export const WRK_32 = work({
  id: 'WRK-32',
  method: 'GET',
  path: '/penalties',
  auth: 'V',
  o4: 'blocked',
  // `days` mặc định 7.
  request: { query: z.strictObject({ days: queryInt(1, 90).optional(), roleRef: Ref('RL').optional() }) },
  response: ok(
    list(
      z.strictObject({
        ledger: IdOf('LG'),
        role: IdOf('RL'),
        class: KeyStr,
        amountMinor: Minor,
        reason: str(500),
        evidence: AnyId,
        at: Ts,
      }),
    ),
  ),
  cli: ['penalties'],
});

export const WRK_33 = work({
  id: 'WRK-33',
  method: 'GET',
  path: '/roles/{roleRef}/balance-history',
  auth: 'V',
  o4: 'blocked',
  request: { params: RoleParams, query: z.strictObject({ days: queryInt(1, 90).optional() }) },
  response: ok(list(z.strictObject({ at: Ts, balanceMinor: Minor }), 2000)),
  cli: ['wallet --history'],
});

// ---------------------------------------------------------------- WRK-34…43 Brain (trí nhớ)
const MemoryRow = z.strictObject({
  ...idShape('MM'),
  role: IdOf('RL').nullable(),
  position: IdOf('PS').nullable(),
  scope: MemoryScope,
  kind: z.enum(MEMORY_KINDS),
  // Che theo quyền (`confidential` với viewer).
  content: str(8000),
  status: z.enum(MEMORY_STATUSES),
  supersededBy: IdOf('MM').nullable(),
  confidence: z.number().min(0).max(1),
  sourceType: z.enum(MEMORY_SOURCE_TYPES),
  session: IdOf('SS').nullable(),
  sensitivity: z.enum(SENSITIVITIES),
  createdAt: Ts,
  lastRecalledAt: Ts.nullable(),
  recallCount: Nat,
});
const MemoryParams = z.strictObject({ memoryRef: Ref('MM') });

export const WRK_34 = work({
  id: 'WRK-34',
  method: 'GET',
  path: '/memories',
  auth: 'V',
  o4: 'blocked',
  request: {
    query: z.strictObject({
      roleRef: Ref('RL').optional(),
      scope: MemoryScope.optional(),
      status: z.enum(MEMORY_STATUSES).optional(),
      // Ngữ pháp ô truy vấn DATABASE §8.1 (lưới MM).
      q: str(500, 1).optional(),
      ...pageQueryShape(),
    }),
  },
  response: ok(
    PageOf(MemoryRow).extend({
      consolidator: z.strictObject({ lastRunAt: Ts.nullable(), merged: Nat, replaced: Nat }),
    }),
  ),
  cli: ['brain'],
});

export const WRK_35 = work({
  id: 'WRK-35',
  method: 'GET',
  path: '/memories/{memoryRef}',
  auth: 'V',
  o4: 'blocked',
  request: { params: MemoryParams },
  // `chain` = `v_memory_chain`.
  response: ok(
    MemoryRow.extend({
      chain: list(IdOf('MM'), 100),
      recalls: list(z.strictObject({ session: IdOf('SS'), at: Ts }), 200),
    }),
  ),
  cli: ['memory show'],
});

export const WRK_36 = work({
  id: 'WRK-36',
  method: 'POST',
  path: '/roles/{roleRef}/memories',
  auth: 'A',
  o4: 'blocked',
  request: {
    params: RoleParams,
    body: z.strictObject({
      scope: MemoryScope,
      kind: z.enum(MEMORY_KINDS),
      content: MemoryContent,
      sensitivity: z.enum(SENSITIVITIES).optional(),
    }),
  },
  response: ok(z.strictObject({ memory: IdOf('MM') })),
  cli: ['memory add'],
});

export const WRK_37 = work({
  id: 'WRK-37',
  method: 'PATCH',
  path: '/memories/{memoryRef}',
  auth: 'A',
  o4: 'blocked',
  request: { params: MemoryParams, body: z.strictObject({ content: MemoryContent }) },
  // Không ghi đè: tạo hàng mới + supersede.
  response: ok(z.strictObject({ memory: IdOf('MM'), supersedes: IdOf('MM') })),
  cli: ['memory edit'],
});

export const WRK_38 = work({
  id: 'WRK-38',
  method: 'POST',
  path: '/memories/{memoryRef}/decision',
  auth: 'A',
  o4: 'blocked',
  request: { params: MemoryParams, body: z.strictObject({ action: z.enum(['approve', 'reject', 'undo']) }) },
  response: ok(MemoryRow),
  cli: ['memory approve', 'memory reject', 'lesson approve', 'lesson reject', 'lesson undo'],
});

export const WRK_39 = work({
  id: 'WRK-39',
  method: 'PATCH',
  path: '/memories/{memoryRef}/attrs',
  auth: 'A',
  o4: 'blocked',
  request: {
    params: MemoryParams,
    body: z.strictObject({ scope: MemoryScope.optional(), status: z.literal('obsolete').optional() }),
  },
  response: ok(MemoryRow),
  cli: ['memory scope', 'memory stale'],
});

export const WRK_40 = work({
  id: 'WRK-40',
  method: 'DELETE',
  path: '/memories/{memoryRef}',
  auth: 'A',
  o4: 'blocked',
  request: { params: MemoryParams },
  // Thùng rác `purge.grace_days`.
  response: noContent(),
  cli: ['memory delete'],
});

export const WRK_41 = work({
  id: 'WRK-41',
  method: 'POST',
  path: '/memories/{memoryRef}/restore',
  auth: 'A',
  o4: 'blocked',
  request: { params: MemoryParams },
  // `conflict` khi đã purge.
  response: ok(MemoryRow),
  cli: ['memory restore'],
});

export const WRK_42 = work({
  id: 'WRK-42',
  method: 'POST',
  path: '/memories/from-knowledge',
  auth: 'A',
  o4: 'blocked',
  request: { body: z.strictObject({ knowledgeRef: Ref('KN'), roleRef: Ref('RL'), scope: MemoryScope }) },
  // Trạng thái `proposed`.
  response: ok(z.strictObject({ memory: IdOf('MM') })),
  cli: ['memory from-kn'],
});

export const WRK_43 = work({
  id: 'WRK-43',
  method: 'POST',
  path: '/consolidator/run',
  auth: 'A',
  o4: 'blocked',
  request: { body: z.strictObject({ roleRef: Ref('RL').optional() }) },
  response: accepted(z.strictObject({ job: Job })),
  errors: ['gate.core_agent_not_ready'],
  cli: ['consolidate'],
});

export const WORK_ROUTES = [
  WRK_01,
  WRK_02,
  WRK_03,
  WRK_04,
  WRK_05,
  WRK_06,
  WRK_07,
  WRK_08,
  WRK_09,
  WRK_10,
  WRK_11,
  WRK_12,
  WRK_13,
  WRK_14,
  WRK_15,
  WRK_16,
  WRK_17,
  WRK_18,
  WRK_19,
  WRK_20,
  WRK_21,
  WRK_22,
  WRK_23,
  WRK_24,
  WRK_25,
  WRK_26,
  WRK_27,
  WRK_28,
  WRK_29,
  WRK_30,
  WRK_31,
  WRK_32,
  WRK_33,
  WRK_34,
  WRK_35,
  WRK_36,
  WRK_37,
  WRK_38,
  WRK_39,
  WRK_40,
  WRK_41,
  WRK_42,
  WRK_43,
] as const;
