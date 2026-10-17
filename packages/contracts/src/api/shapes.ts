import { z } from 'zod';
import { AUTH_METHODS, ENGINE_INSTALL_STATES, LOGIN_CHECK_STATUSES } from '../engine.ts';
import { EFFORT_RE, EngineSlugFormat, MODEL_ID_MAX, MODEL_ID_RE } from '../runner.ts';
import { ObservedState } from '../supervisor.ts';
import { IdOf, Int, idShape, KeyStr, Lang, Nat, Pct, str, Ts } from './common.ts';

// Kiểu dùng chung giữa các lane (một nơi, không lặp). Kiểu của MỘT lane nằm trong tệp lane đó.

/** Mức nghiêm trọng (= CHECK `notifications.severity`). */
export const Severity = z.enum(['ok', 'info', 'warn', 'danger']);

// ---------------------------------------------------------------- enum trùng CHECK của bảng DB
// Quy ước M0: enum của contracts TRÙNG `CHECK (col IN (...))` của bảng (db/spec/schema_v2_2.sql); test `db-parity` đối chiếu.
// Chỗ đặc tả BACKEND-TRIAL ghi tên khác DB (vd `pending` ↔ `queued`) thì LẤY THEO DB (Gen duyệt ở báo cáo L-API).

/** `engine_accounts.login_status` (khác `LOGIN_CHECK_STATUSES` của probe: DB có `error`, không có `logged_out`). */
export const ACCOUNT_LOGIN_STATUSES = ['logged_in', 'expired', 'suspended', 'error', 'unknown', 'in_progress'] as const;
/** `chat_messages.author_kind`. */
export const CHAT_AUTHOR_KINDS = [
  'owner',
  'user',
  'role',
  'interviewer',
  'trainer',
  'assistant',
  'system',
  'external',
] as const;
export const CHAT_CHANNELS = ['web', 'telegram', 'system'] as const;
export const CHAT_MESSAGE_STATUSES = ['streaming', 'final', 'failed', 'redacted'] as const;
/** `chat_threads.kind` ở MVP (DB còn `workspace` — GĐ2). */
export const THREAD_KINDS = ['interview', 'training', 'assistant', 'telegram', 'tree'] as const;
export const THREAD_STATUSES = ['open', 'paused', 'closed', 'archived'] as const;
export const THREAD_AGENTS = ['interviewer', 'trainer', 'assistant', 'role'] as const;
export const ANCHOR_KINDS = ['pin', 'reference', 'annotate', 'proposal', 'quote'] as const;
export const ANCHOR_STATES = ['ok', 'changed', 'gone', 'unknown'] as const;
/** `change_sets.status`. */
export const CHANGE_SET_STATUSES = ['open', 'applied', 'partially_applied', 'rejected', 'expired'] as const;
/** `change_set_items.op`. */
export const CHANGE_ITEM_OPS = ['create', 'update', 'delete'] as const;
export const TAXONOMY_KINDS = ['skill', 'knowledge'] as const;
/** `taxonomy_nodes.level` / `.status`. */
export const TAXONOMY_LEVELS = ['group', 'branch', 'category'] as const;
export const TAXONOMY_STATUSES = ['active', 'proposed', 'obsolete'] as const;
/** `knowledge_items.processing_state`. */
export const KNOWLEDGE_PROCESSING_STATES = [
  'uploaded',
  'extracting',
  'summarizing',
  'indexing',
  'ready',
  'failed',
] as const;
/** `trial_runs.status` (đặc tả ghi `queued`; DB là `pending` ⇒ theo DB). */
export const TRIAL_STATES = ['pending', 'running', 'passed', 'failed', 'skipped'] as const;
/** `ledger_entries.entry_type`. */
export const LEDGER_ENTRY_TYPES = [
  'activation_grant',
  'grant',
  'reward',
  'honesty_reward',
  'penalty',
  'token_cost',
  'adjustment',
  'reversal',
  'transfer',
  'opening',
] as const;
/** `notifications.kind`. */
export const NOTIFICATION_KINDS = [
  'failover',
  'quota_low',
  'update_available',
  'role_error',
  'field_pending',
  'permission_request',
  'memory_proposal',
  'telegram_rejected',
  'brain_drift',
  'backup_failed',
  'pii_in_history',
  'integrity',
  'role_wounded',
  'lessons_proposed',
  'native_memory',
  'core_agent_incident',
] as const;

/** `roles.runtime_state` (= `role.state` của SSE). */
export const ROLE_RUNTIMES = ['none', 'sleeping', 'starting', 'running', 'error', 'stopped'] as const;

/** Telegram user id (số nguyên dạng chuỗi, tối đa 20 chữ số — vượt 2^53 nên không dùng number). */
export const TgUserId = z
  .string()
  .min(1)
  .max(20)
  .regex(/^\d{1,20}$/)
  .meta({ example: '123456789' });

/**
 * Thành viên workspace dạng AN TOÀN để liệt kê / hiển thị: `{id, displayId, name}` (join `workspace_members`). KHÔNG BAO GIỜ trả
 * bản ghi `US` thô (email, username, mật khẩu băm) — `RECORD_ACCESS.US = 'deny'` (HANDLER-OBLIGATIONS #1).
 */
export const MemberView = z.strictObject({ ...idShape('US'), name: str(60, 1) });

/** Slug loại CLI (registry engines): đúng hình dạng của contracts (`ENGINE_SLUG_RE`). */
export const EngineSlug = EngineSlugFormat.meta({ example: 'engine-x' });
/** id model từ capability registry (STD-10): đúng `MODEL_ID_RE`, không bao giờ dạng cờ `-…`. */
export const ModelKey = z.string().max(MODEL_ID_MAX).regex(MODEL_ID_RE).meta({ example: 'model-1' });
export const EffortKey = z.string().max(16).regex(EFFORT_RE).meta({ example: 'high' });

/** `workspaces.short_code` (4 ký tự chữ / số). */
export const ShortCode = z
  .string()
  .length(4)
  .regex(/^[A-Za-z0-9]{4}$/)
  .meta({ example: 'GA01' });

/** Tham số i18n của một khoá hiển thị (`{count: 3, name: 'x'}`): API trả khoá + tham số, KHÔNG trả câu đã dịch (CNS-179). */
export const I18nParams = z
  .record(str(32, 1), z.union([str(200), Int]))
  .refine((o) => Object.keys(o).length <= 16, 'quá nhiều tham số');

/** Mã route (`SYS-19`, `GW-12`…): hành động gợi ý của `v_attention` trỏ route nào. */
export const RouteIdRef = z
  .string()
  .max(10)
  .regex(/^(?:SYS|GW|WRK|OPS|EXT)-\d{2}$/)
  .meta({ example: 'SYS-09' });

/** Mã hash văn bản điều khoản (`noticeHash`): chuỗi hex / base64 ngắn; hợp đồng không ép thuật toán. */
export const NoticeHash = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9+/=_-]+$/)
  .meta({ example: 'abcdef0123456789abcdef0123456789' });

/** Đồng ý Clause 6 (SYS-04, SYS-11, GW-07, GW-11): `accepted` luôn `true` — không đồng ý thì không gửi khối này. */
export const ConsentInput = z.strictObject({
  accepted: z.literal(true),
  noticeVersion: str(32, 1),
  noticeHash: NoticeHash,
  lang: Lang,
});

/** Container + trạng thái quan sát: `{…Id(CT), observed}`. */
export const ContainerState = z.strictObject({ ...idShape('CT'), observed: ObservedState });

/** `consumer` của tài khoản / container: AI Hệ thống (`system`) hoặc một Role. */
export const ConsumerView = z.strictObject({
  kind: z.enum(['system', 'role']),
  role: IdOf('RL').nullable(),
});

/** Ngân sách prompt theo `v_role_prompt_budget` (GW-22). Frontend / CLI KHÔNG tự cộng. */
export const Budget = z.strictObject({
  totalDefault: Nat,
  worst: Nat,
  budget: Nat,
  state: z.enum(['green', 'yellow', 'red']),
  promptLabel: z.enum(['measured', 'estimated']),
  overheadLabel: KeyStr,
  signOk: z.boolean(),
  cardOk: z.boolean(),
  cardBlockReason: KeyStr.nullable(),
  breakdown: z.strictObject({
    dn: Nat,
    in: Nat,
    houseRules: Nat,
    position: Nat,
    skillIndex: Nat,
    frame: Nat,
    polaris: Nat,
    runtime: Nat,
  }),
  pendingDelta: Int,
  ifApplyAll: z.strictObject({ worst: Nat, state: z.enum(['green', 'yellow', 'red']) }),
});

/** Quota một cửa sổ. Không đọc được ⇒ `utilizationPct = null` + `unknownReason` (không bịa số). */
export const QuotaView = z.strictObject({
  window: KeyStr,
  utilizationPct: Pct.nullable(),
  resetAt: Ts.nullable(),
  source: KeyStr,
  unknownReason: KeyStr.nullable(),
});

/** Hàng tài khoản engine (GW-05, GW-06; SYS-80 dùng bản rút gọn). */
export const AccountRow = z.strictObject({
  ...idShape('EN'),
  label: str(60, 1),
  engineSlug: EngineSlug,
  consumer: ConsumerView,
  isCoreAgent: z.boolean(),
  authMethod: z.enum(AUTH_METHODS),
  loginStatus: z.enum(ACCOUNT_LOGIN_STATUSES),
  reloginRequired: z.boolean(),
  lastLoginCheck: z.strictObject({ probe: IdOf('PB'), status: z.enum(LOGIN_CHECK_STATUSES), at: Ts }).nullable(),
  /** Danh tính CLI tự in ra, ĐÃ CHE. */
  accountHint: str(120).nullable(),
  quota: z.strictObject({ long: QuotaView, short: QuotaView }),
  overhead: z.strictObject({
    tokens: Nat.nullable(),
    label: z.enum(['measured', 'estimated']),
    measuredAt: Ts.nullable(),
  }),
  cli: z.strictObject({ state: z.enum(ENGINE_INSTALL_STATES), version: str(64).nullable() }),
  container: ContainerState,
});
export const AccountSummary = AccountRow.pick({
  id: true,
  displayId: true,
  label: true,
  engineSlug: true,
  consumer: true,
  isCoreAgent: true,
  loginStatus: true,
  reloginRequired: true,
  quota: true,
});
