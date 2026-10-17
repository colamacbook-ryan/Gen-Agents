import { z } from 'zod';
import { BOUNDS } from '../bounds.ts';
import { EngineInstallStatus } from '../engine.ts';
import { FIXED_CODES } from '../ids.ts';
import { Anchor } from '../mcp.ts';
import { TURN_REJECTIONS } from '../sessions.ts';
import { ReadableAnchor } from './access.ts';
import {
  AnyId,
  IanaTimezone,
  IdempotencyHeaders,
  IdOf,
  Int,
  idShape,
  Job,
  Json,
  KeyStr,
  Lang,
  list,
  Nat,
  PageOf,
  pageQueryShape,
  queryBool,
  Ref,
  str,
  Ts,
  Ulid,
} from './common.ts';
import { accepted, defineLane, noContent, ok, sse } from './define.ts';
import { Redacted } from './masking.ts';
import {
  AccountSummary,
  ANCHOR_KINDS,
  ANCHOR_STATES,
  Budget,
  CHANGE_ITEM_OPS,
  CHANGE_SET_STATUSES,
  CHAT_AUTHOR_KINDS,
  CHAT_CHANNELS,
  CHAT_MESSAGE_STATUSES,
  ConsentInput,
  ContainerState,
  EffortKey,
  EngineSlug,
  I18nParams,
  ModelKey,
  NOTIFICATION_KINDS,
  RouteIdRef,
  Severity,
  ShortCode,
  THREAD_AGENTS,
  THREAD_KINDS,
  THREAD_STATUSES,
} from './shapes.ts';
import { StreamEvent } from './sse.ts';
import { UiActionRow } from './ui-actions.ts';

// L-SYS — onboarding, O4, AI Hệ thống, chat Ghim & Soi, change set, tổng quan, thông báo, SSE (BACKEND-TRIAL §3.3).
// SYS-01…29 và SYS-80…85 ở đây (35 route); SYS-30…79 ở `hr.ts` (L-HR, lane tách mới).
// Chữ giao diện KHÔNG nằm ở API (CNS-179): response trả khoá enum / khoá i18n + tham số.

const sys = defineLane('L-SYS');

/** Trần độ dài tin chat người dùng (SYS-19). */
export const CHAT_TEXT_MAX = BOUNDS.chatText;
/** Trần tin trả về (AI có thể dài hơn tin người dùng). */
export const CHAT_CONTENT_MAX = 65_536;
export const ATTACHMENT_PURPOSES = ['chat', 'knowledge', 'avatar', 'skill_import'] as const;
/** Avatar upload tối đa 5 MB (SYS-21 / SYS-68 → `upload.too_large`); các mục đích khác theo `chat.attachment_max_bytes` (ST-0018). */
export const AVATAR_UPLOAD_MAX_BYTES = 5_242_880;

const CoreMode = z.enum(['setup', 'ok', 'recovery']);
const AuthMethodChoice = z.enum(['subscription', 'api_key']);
const ChecklistCode = z.enum(FIXED_CODES.onboardingChecklist);
const TurnReasons = TURN_REJECTIONS;

// ---------------------------------------------------------------- SYS-01…07 onboarding (G2)
const OnboardingOwner = z.strictObject({
  name: str(60, 1),
  workspaceName: str(80, 1),
  shortCode: ShortCode,
  lang: Lang,
  timezone: IanaTimezone,
  instanceName: str(60, 1),
});

export const SYS_01 = sys({
  id: 'SYS-01',
  method: 'GET',
  path: '/onboarding',
  auth: 'A',
  o4: 'setup',
  response: ok(
    z.strictObject({
      step: z.union([z.number().int().min(1).max(5), z.literal('done')]),
      owner: OnboardingOwner.nullable(),
      coreAgent: z.strictObject({
        engineSlug: EngineSlug.nullable(),
        account: IdOf('EN').nullable(),
        lockedAt: Ts.nullable(),
        mode: CoreMode,
      }),
    }),
  ),
  cli: ['setup'],
});

export const SYS_02 = sys({
  id: 'SYS-02',
  method: 'PUT',
  path: '/onboarding/owner',
  auth: 'O',
  o4: 'setup',
  request: {
    body: z.strictObject({
      ownerName: str(60, 1),
      workspaceName: str(80, 1),
      workspaceSlug: str(64, 1)
        .regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
        .meta({ example: 'my-workspace' })
        .optional(),
      lang: Lang,
      timezone: IanaTimezone,
      instanceName: str(60, 1),
    }),
  },
  response: ok(
    z.strictObject({
      // workspace chưa có prefix display_id trong ENTITY_TYPES ⇒ `{id}` + mã ngắn.
      workspace: z.strictObject({ id: Ulid, shortCode: ShortCode, registryPrefix: str(16, 1) }),
      owner: IdOf('US'),
      instanceSetting: IdOf('ST'),
    }),
  ),
  cli: ['setup'],
});

export const SYS_03 = sys({
  id: 'SYS-03',
  method: 'GET',
  path: '/onboarding/core-agent/options',
  auth: 'A',
  o4: 'setup',
  response: ok(
    list(
      z.strictObject({
        engineSlug: EngineSlug,
        nameKey: str(96, 1),
        adapterStatus: z.enum(['ready', 'coming_soon']),
        isDefault: z.boolean(),
        requiresConsent: z.boolean(),
        noticeVersion: str(32, 1).nullable(),
        install: EngineInstallStatus,
        selectable: z.boolean(),
        blockedReason: z.enum(['coming_soon', 'not_installed', 'installing', 'failed']).nullable(),
      }),
      64,
    ),
  ),
  cli: ['setup'],
});

export const SYS_04 = sys({
  id: 'SYS-04',
  method: 'POST',
  path: '/onboarding/core-agent',
  auth: 'O',
  // Tạo tài khoản + binding + container của Core agent (volume `/auth`) và ghi đồng ý Clause 6.
  touchesCredential: true,
  o4: 'setup',
  request: {
    body: z.strictObject({
      engineSlug: EngineSlug,
      label: str(60, 1),
      authMethod: AuthMethodChoice,
      consent: ConsentInput.optional(),
    }),
  },
  // EN·EB·CN một transaction; container dựng sau commit.
  response: ok(
    z.strictObject({
      account: IdOf('EN'),
      binding: IdOf('EB'),
      consent: IdOf('CN').nullable(),
      container: ContainerState,
    }),
  ),
  errors: ['consent.required', 'consent.notice_mismatch', 'engine.not_installed', 'db.core_agent_rule'],
  cli: ['setup'],
});

export const SYS_05 = sys({
  id: 'SYS-05',
  method: 'DELETE',
  path: '/onboarding/core-agent',
  auth: 'O',
  touchesCredential: true,
  o4: 'setup',
  // Gỡ tài khoản + binding chưa khoá ("Chọn loại khác").
  response: noContent(),
  errors: ['db.core_agent_rule'],
  cli: ['setup'],
});

export const SYS_06 = sys({
  id: 'SYS-06',
  method: 'GET',
  path: '/onboarding/checklist',
  auth: 'V',
  o4: 'open',
  response: ok(
    list(
      z.strictObject({
        code: ChecklistCode,
        state: z.enum(['ok', 'warn', 'err']),
        // CNS-179 / T7: chữ hiển thị lấy từ i18n theo `detailKey` + `detailParams`. `detail` = nguyên văn `check_detail` của
        // `v_setup_checklist` — CHỈ để đối chiếu với DB (FS G2), KHÔNG hiển thị trực tiếp.
        detailKey: KeyStr,
        detailParams: I18nParams,
        detail: str(500),
        evidence: AnyId.nullable(),
      }),
      16,
    ),
  ),
  cli: ['setup', 'onboarding checklist'],
});

export const SYS_07 = sys({
  id: 'SYS-07',
  method: 'POST',
  path: '/onboarding/complete',
  auth: 'O',
  o4: 'setup',
  response: ok(z.strictObject({ done: z.literal(true) })),
  errors: ['gate.onboarding_incomplete'],
  cli: ['setup'],
});

// ---------------------------------------------------------------- SYS-08…13 Core agent / O4
const CORE_FIX_TARGETS = ['a5.system', 'a5.container'] as const;

export const SYS_08 = sys({
  id: 'SYS-08',
  method: 'GET',
  path: '/core-agent/status',
  auth: 'V',
  o4: 'open',
  // `v_core_agent_status`; KHÔNG trả `reason_text` / `overlay_text` (CNS-179): chữ lấy từ i18n theo `reason` / `subReason`.
  response: ok(
    z.strictObject({
      mode: CoreMode,
      blocksAdmin: z.boolean(),
      reason: KeyStr.nullable(),
      subReason: KeyStr.nullable(),
      autoRecheck: z.boolean(),
      fixTarget: z.enum(CORE_FIX_TARGETS).nullable(),
      isIncident: z.boolean(),
      nextRecheckAt: Ts.nullable(),
      quotaResetAt: Ts.nullable(),
      channel: z.enum(['telegram', 'none']),
      engineSlug: EngineSlug,
      account: IdOf('EN').nullable(),
      lockedAt: Ts.nullable(),
    }),
  ),
  cli: ['core status', 'mọi lệnh (kiểm trước)'],
});

export const SYS_09 = sys({
  id: 'SYS-09',
  method: 'POST',
  path: '/core-agent/recheck',
  auth: 'A',
  o4: 'open',
  // Rồi SSE `probe.result`, `core_agent.status`.
  response: accepted(z.strictObject({ probe: IdOf('PB') })),
  errors: ['engine.not_installed'],
  errorReasons: { 'engine.not_installed': ['not_installed', 'installing', 'failed'] },
  cli: ['core recheck'],
});

export const SYS_10 = sys({
  id: 'SYS-10',
  method: 'GET',
  path: '/core-agent/type-options',
  auth: 'O',
  o4: 'open',
  // Bỏ loại hiện tại.
  response: ok(
    list(
      z.strictObject({
        engineSlug: EngineSlug,
        selectable: z.boolean(),
        reenableBinding: IdOf('EB').nullable(),
        needsConsent: z.boolean(),
        blockedReason: KeyStr.nullable(),
      }),
      64,
    ),
  ),
  errors: ['recovery.not_incident'],
  cli: ['core change-type'],
});

export const SYS_11 = sys({
  id: 'SYS-11',
  method: 'POST',
  path: '/core-agent/type-change',
  auth: 'O',
  // Đổi loại Core agent: tắt binding cũ, tạo / bật tài khoản + đồng ý mới.
  touchesCredential: true,
  o4: 'open',
  request: {
    body: z.strictObject({ targetEngineSlug: EngineSlug, consent: ConsentInput.optional() }),
  },
  // Một transaction: tắt binding cũ, ST-0017 = loại đích, SA → `stale`, sự kiện `core_agent.type_changed`. Sau đó client gọi GW-14.
  response: ok(
    z.strictObject({
      reason: z.enum(['type_change_in_progress', 'relogin_in_progress']),
      account: IdOf('EN'),
      binding: IdOf('EB'),
      reenabled: z.boolean(),
      consent: IdOf('CN').nullable(),
    }),
  ),
  errors: ['recovery.not_incident', 'consent.required', 'consent.notice_mismatch', 'engine.not_installed'],
  cli: ['core change-type <slug>'],
});

export const SYS_12 = sys({
  id: 'SYS-12',
  method: 'POST',
  path: '/core-agent/container/rebuild',
  auth: 'A',
  o4: 'open',
  response: accepted(z.strictObject({ container: ContainerState })),
  cli: ['core fix'],
});

export const SYS_13 = sys({
  id: 'SYS-13',
  method: 'GET',
  path: '/emergency/roles',
  auth: 'A',
  o4: 'open',
  // Chỉ Role có thẻ; rỗng thì không in khối.
  response: ok(
    list(
      z.strictObject({
        role: z.strictObject({ ...idShape('RL'), name: str(60, 1) }),
        card: z.strictObject({ ...idShape('CD'), status: z.enum(['issued', 'suspended']) }),
        proactiveEnabled: z.boolean(),
        allowlist: list(
          z.strictObject({
            ...idShape('AL'),
            displayName: str(120),
            isOwner: z.boolean(),
            status: z.enum(['active', 'removed']),
          }),
          64,
        ),
      }),
    ),
  ),
  cli: ['emergency'],
});

// ---------------------------------------------------------------- SYS-14, 15 AI Hệ thống
const SYSTEM_AGENT_KINDS = ['interviewer', 'trainer', 'consolidator', 'judge'] as const;
export const SystemAgentRow = z.strictObject({
  ...idShape('SA'),
  kind: z.enum(SYSTEM_AGENT_KINDS),
  // Tài khoản chỉ đọc (= tài khoản Core agent).
  account: IdOf('EN'),
  modelKey: ModelKey.nullable(),
  effort: EffortKey.nullable(),
  source: KeyStr,
  selectionState: z.enum(['valid', 'stale', 'unavailable', 'unknown']),
  enabled: z.boolean(),
});

export const SYS_14 = sys({
  id: 'SYS-14',
  method: 'GET',
  path: '/system-agents',
  auth: 'V',
  o4: 'open',
  response: ok(list(SystemAgentRow, 16)),
  cli: ['agents', 'setup'],
});

export const SYS_15 = sys({
  id: 'SYS-15',
  method: 'PATCH',
  path: '/system-agents/{systemAgentRef}',
  auth: 'A',
  o4: 'open',
  request: {
    params: z.strictObject({ systemAgentRef: Ref('SA') }),
    body: z.strictObject({ modelKey: ModelKey.optional(), effort: EffortKey.optional() }),
  },
  response: ok(SystemAgentRow),
  errors: ['capability.unavailable'],
  cli: ['agents set'],
});

// ---------------------------------------------------------------- SYS-16…24 chat Ghim & Soi (ChatPanel)
const CREATABLE_THREAD_KINDS = ['interview', 'training', 'tree', 'assistant'] as const;

export const ThreadRow = z.strictObject({
  ...idShape('TH'),
  kind: z.enum(THREAD_KINDS),
  agent: z.enum(THREAD_AGENTS),
  role: IdOf('RL').nullable(),
  title: str(200),
  status: z.enum(THREAD_STATUSES),
  progress: z.strictObject({ groupsDone: Nat, groupsTotal: Nat }).nullable(),
  lastMessageAt: Ts.nullable(),
  messageCount: Nat,
});

export const SYS_16 = sys({
  id: 'SYS-16',
  method: 'GET',
  path: '/threads',
  // Nội dung hội thoại với AI: cùng mức với RECORD_ACCESS TH / MSG và SSE `chat.*` = A (review PR #7, round 5).
  auth: 'A',
  o4: 'blocked',
  request: {
    query: z.strictObject({
      roleRef: Ref('RL').optional(),
      kind: z.enum(THREAD_KINDS).optional(),
      status: z.enum(THREAD_STATUSES).optional(),
      ...pageQueryShape(),
    }),
  },
  response: ok(PageOf(ThreadRow)),
  cli: ['birth <role>', 'chat'],
});

export const SYS_17 = sys({
  id: 'SYS-17',
  method: 'POST',
  path: '/threads',
  auth: 'A',
  o4: 'blocked',
  request: {
    body: z.strictObject({
      kind: z.enum(CREATABLE_THREAD_KINDS),
      roleRef: Ref('RL').optional(),
      screenRoute: str(200).optional(),
      // "Nhờ AI chỉnh" = intent `adjust`.
      context: z.strictObject({ intent: z.literal('adjust'), anchors: z.array(ReadableAnchor).max(20) }).optional(),
    }),
  },
  response: ok(ThreadRow),
  errors: ['gate.core_agent_not_ready'],
  cli: ['chat --role --kind', 'train'],
});

const MessageAnchorView = z.strictObject({
  anchor: Anchor,
  kind: z.enum(ANCHOR_KINDS),
  entityDisplayId: str(20, 1).nullable(),
  column: str(8, 1).nullable(),
  state: z.enum(ANCHOR_STATES),
});
export const ATTACHMENT_SCAN_STATUSES = ['pending', 'clean', 'rejected', 'error'] as const;

export const MessageRow = z.strictObject({
  ...idShape('MSG'),
  authorKind: z.enum(CHAT_AUTHOR_KINDS),
  channel: z.enum(CHAT_CHANNELS),
  // Đã che credential.
  content: str(CHAT_CONTENT_MAX),
  status: z.enum(CHAT_MESSAGE_STATUSES),
  contextTokens: Nat.nullable(),
  tokensIn: Nat.nullable(),
  tokensOut: Nat.nullable(),
  session: IdOf('SS').nullable(),
  anchors: list(MessageAnchorView, 20),
  attachments: list(
    z.strictObject({
      ...idShape('AT'),
      fileName: str(255, 1),
      mime: str(127, 1),
      sizeBytes: Nat,
      scanStatus: z.enum(ATTACHMENT_SCAN_STATUSES),
    }),
    10,
  ),
  tools: list(
    z.strictObject({
      name: str(64, 1),
      stage: z.enum(['call', 'result']),
      ok: z.boolean(),
      deniedCode: str(64).nullable(),
    }),
    64,
  ),
  uiActionCount: Nat,
  certainty: z.enum(['sure', 'unsure']).nullable(),
  at: Ts,
});

export const SYS_18 = sys({
  id: 'SYS-18',
  method: 'GET',
  path: '/threads/{threadRef}/messages',
  // Nội dung hội thoại với AI: cùng mức với RECORD_ACCESS TH / MSG và SSE `chat.*` = A (review PR #7, round 5).
  auth: 'A',
  o4: 'blocked',
  request: {
    params: z.strictObject({ threadRef: Ref('TH') }),
    query: z.strictObject(pageQueryShape()),
  },
  response: ok(PageOf(MessageRow)),
  cli: ['REPL (lịch sử)'],
});

export const SYS_19 = sys({
  id: 'SYS-19',
  method: 'POST',
  path: '/threads/{threadRef}/messages',
  auth: 'A',
  o4: 'blocked',
  idempotent: true,
  request: {
    params: z.strictObject({ threadRef: Ref('TH') }),
    headers: IdempotencyHeaders,
    body: z.strictObject({
      text: str(CHAT_TEXT_MAX, 1),
      // ReadableAnchor: không ghim bản ghi US / SEC / BK vào chat (snapshot sẽ vào prompt model) — review bảo mật PR #7.
      anchors: z.array(ReadableAnchor).max(20),
      attachmentRefs: z.array(Ref('AT')).max(10),
      screen: z.strictObject({
        route: str(200, 1),
        roleRef: Ref('RL').optional(),
        tab: str(64, 1).optional(),
        filters: str(500, 1).optional(),
      }),
    }),
  },
  // Phản hồi đi qua SSE `chat.message`, `chat.delta`, `chat.tool`, `ui.action`, `chat.turn`. Server tự tính snapshot anchor (SYS-23).
  response: accepted(
    z.strictObject({
      message: IdOf('MSG'),
      turn: z.strictObject({ state: z.enum(['queued', 'running']), job: Job.nullable() }),
    }),
  ),
  errors: ['turn.rejected', 'upload.not_clean', 'gate.core_agent_not_ready'],
  errorReasons: { 'turn.rejected': TurnReasons },
  cli: ['REPL (gõ chữ)'],
});

export const SYS_20 = sys({
  id: 'SYS-20',
  method: 'POST',
  path: '/threads/{threadRef}/cancel',
  auth: 'A',
  o4: 'blocked',
  request: { params: z.strictObject({ threadRef: Ref('TH') }) },
  response: ok(z.strictObject({ turn: z.enum(['cancelled', 'idle']) })),
  cli: ['REPL /stop'],
});

export const SYS_21 = sys({
  id: 'SYS-21',
  method: 'POST',
  path: '/attachments',
  auth: 'A',
  o4: 'blocked',
  // multipart: phần `file` + các trường của `body`. Trần: `chat.attachment_max_bytes` (ST-0018); avatar 5 MB.
  request: { bodyKind: 'multipart', body: z.strictObject({ purpose: z.enum(ATTACHMENT_PURPOSES) }) },
  response: ok(
    z.strictObject({
      ...idShape('AT'),
      fileName: str(255, 1),
      mime: str(127, 1),
      sizeBytes: Nat,
      sha256: z
        .string()
        .length(64)
        .regex(/^[0-9a-f]{64}$/)
        .meta({ example: 'a'.repeat(64) }),
      scanStatus: z.enum(ATTACHMENT_SCAN_STATUSES),
      rejectReason: KeyStr.nullable(),
    }),
  ),
  errors: ['upload.too_large', 'upload.type_rejected'],
  cli: ['/attach', 'kn add', 'avatar --upload', 'skill import'],
});

export const SYS_22 = sys({
  id: 'SYS-22',
  method: 'GET',
  path: '/threads/{threadRef}/ui-actions',
  // Nội dung hội thoại với AI: cùng mức với RECORD_ACCESS TH / MSG và SSE `chat.*` = A (review PR #7, round 5).
  auth: 'A',
  o4: 'blocked',
  request: {
    params: z.strictObject({ threadRef: Ref('TH') }),
    query: z.strictObject({ messageRef: Ref('MSG').optional() }),
  },
  // Replay (§3.8): tuần tự theo thời gian.
  response: ok(list(UiActionRow)),
  cli: ['REPL /replay MSG-…'],
});

export const SYS_23 = sys({
  id: 'SYS-23',
  method: 'GET',
  path: '/anchors/resolve',
  auth: 'V',
  o4: 'blocked',
  // ReadableAnchor: không resolve ra bản ghi deny; prefix mức A (AL / TG…) dịch vụ kiểm bằng `effectiveReadAuth` (HANDLER-OBLIGATIONS #8).
  request: { query: z.strictObject({ anchor: ReadableAnchor }) },
  response: ok(
    z.strictObject({
      state: z.enum(['ok', 'changed', 'gone']),
      entityType: str(64, 1),
      entityDisplayId: str(20, 1),
      column: str(8, 1).nullable(),
      label: str(200),
      // Đã cắt theo ngân sách token.
      snapshot: str(16_384),
      snapshotHash: str(128, 1),
      version: Nat.nullable(),
      redacted: Redacted,
    }),
  ),
  cli: ['REPL (in đích của ghim / Soi)'],
});

export const SYS_24 = sys({
  id: 'SYS-24',
  method: 'POST',
  path: '/messages/{messageRef}/redact',
  auth: 'A',
  o4: 'blocked',
  request: {
    params: z.strictObject({ messageRef: Ref('MSG') }),
    body: z.strictObject({ reason: str(200, 1) }),
  },
  response: ok(z.strictObject({ status: z.literal('redacted'), relatedMemories: list(IdOf('MM'), 200) })),
  cli: ['chat redact'],
});

// ---------------------------------------------------------------- SYS-25…29 change set (khay "N đề xuất chờ duyệt")
const BudgetState = z.enum(['green', 'yellow', 'red']);

export const ChangeSetRow = z.strictObject({
  ...idShape('CS'),
  role: IdOf('RL').nullable(),
  source: z.enum(['ai', 'owner', 'import', 'reflection']),
  kind: KeyStr,
  title: str(200),
  reason: str(2000),
  isCore: z.boolean(),
  tokenDelta: Int.nullable(),
  budgetIfApplied: z.strictObject({ total: Nat, worst: Nat, state: BudgetState }).nullable(),
  status: z.enum(CHANGE_SET_STATUSES),
  sourceMessage: IdOf('MSG').nullable(),
  createdAt: Ts,
  // Viewer: `reason` (lời giải thích của AI, có thể trích nội dung nhạy cảm) bị che — V_MASKED_FIELDS.
  redacted: Redacted,
});

export const SYS_25 = sys({
  id: 'SYS-25',
  method: 'GET',
  path: '/change-sets',
  auth: 'V',
  o4: 'blocked',
  request: {
    query: z.strictObject({
      roleRef: Ref('RL').optional(),
      status: z.enum(CHANGE_SET_STATUSES).optional(),
      kind: KeyStr.optional(),
      ...pageQueryShape(),
    }),
  },
  response: ok(PageOf(ChangeSetRow).extend({ ifApplyAll: z.strictObject({ worst: Nat, state: BudgetState }) })),
  cli: ['proposals'],
});

export const SYS_26 = sys({
  id: 'SYS-26',
  method: 'GET',
  path: '/change-sets/{changeSetRef}',
  auth: 'V',
  o4: 'blocked',
  request: { params: z.strictObject({ changeSetRef: Ref('CS') }) },
  response: ok(
    ChangeSetRow.extend({
      items: list(
        z.strictObject({
          target: AnyId.nullable(),
          op: z.enum(CHANGE_ITEM_OPS),
          field: str(128, 1),
          // Viewer: che khi mục thuộc lớp nhạy cảm (V_MASKED_FIELDS, HANDLER-OBLIGATIONS #5).
          before: Json,
          after: Json,
          redacted: Redacted,
        }),
        500,
      ),
    }),
  ),
  cli: ['proposal show'],
});

export const SYS_27 = sys({
  id: 'SYS-27',
  method: 'POST',
  path: '/change-sets/{changeSetRef}/apply',
  auth: 'A',
  o4: 'blocked',
  request: {
    params: z.strictObject({ changeSetRef: Ref('CS') }),
    // `reason` bắt buộc khi `isCore` (dịch vụ kiểm — `isCore` không có trong request).
    body: z.strictObject({ reason: str(500, 1).optional() }),
  },
  response: ok(z.strictObject({ revision: IdOf('RV').nullable(), budget: Budget })),
  // db.*: danh sách cho phép, trần.
  errors: ['db.*'],
  cli: ['proposal apply', 'REPL /apply'],
});

export const SYS_28 = sys({
  id: 'SYS-28',
  method: 'POST',
  path: '/change-sets/{changeSetRef}/reject',
  auth: 'A',
  o4: 'blocked',
  request: {
    params: z.strictObject({ changeSetRef: Ref('CS') }),
    body: z.strictObject({ note: str(500, 1).optional() }),
  },
  response: noContent(),
  cli: ['proposal reject', 'REPL /reject'],
});

export const SYS_29 = sys({
  id: 'SYS-29',
  method: 'POST',
  path: '/change-sets/apply-all',
  auth: 'A',
  o4: 'blocked',
  request: { body: z.strictObject({ roleRef: Ref('RL'), kind: KeyStr.optional() }) },
  response: ok(z.strictObject({ applied: list(IdOf('CS'), 200), revision: IdOf('RV').nullable(), budget: Budget })),
  errors: ['db.*'],
  cli: ['proposal apply --all'],
});

// ---------------------------------------------------------------- SYS-80…85 tổng quan, chú ý, sự kiện, thông báo, SSE
const OVERVIEW_RANGES = ['today', '7d', '30d'] as const;
const KPI_KEYS = ['roles_active', 'tokens', 'cache_hit', 'proactive', 'engine_errors', 'failovers'] as const;

export const SYS_80 = sys({
  id: 'SYS-80',
  method: 'GET',
  path: '/overview',
  auth: 'V',
  o4: 'blocked',
  request: { query: z.strictObject({ range: z.enum(OVERVIEW_RANGES) }) },
  response: ok(
    z.strictObject({
      kpis: list(z.strictObject({ key: z.enum(KPI_KEYS), value: z.number(), sub: Json }), 16),
      taskCounts: z.strictObject({ today: Nat, d7: Nat, d30: Nat }),
      // Hàng GW-05 rút gọn kèm quota.
      engines: list(AccountSummary, 64),
    }),
  ),
  cli: ['dash'],
});

export const SYS_81 = sys({
  id: 'SYS-81',
  method: 'GET',
  path: '/attention',
  auth: 'V',
  o4: 'open',
  // `v_attention`: hàng Core agent, tác tử không hợp lệ, "Cần đăng nhập lại", neo lỗi…
  response: ok(
    list(
      z.strictObject({
        severity: z.enum(['info', 'warn', 'danger']),
        kind: KeyStr,
        target: AnyId.nullable(),
        params: I18nParams,
        actions: list(z.strictObject({ key: KeyStr, routeId: RouteIdRef }), 8),
      }),
    ),
  ),
  cli: ['attention', 'dash'],
});

export const SYS_82 = sys({
  id: 'SYS-82',
  method: 'GET',
  path: '/events',
  auth: 'V',
  o4: 'open',
  request: {
    query: z.strictObject({
      roleRef: Ref('RL').optional(),
      kind: KeyStr.optional(),
      since: Ts.optional(),
      ...pageQueryShape(),
    }),
  },
  response: ok(
    PageOf(
      z.strictObject({
        ...idShape('EV'),
        role: IdOf('RL').nullable(),
        kind: KeyStr,
        subject: AnyId.nullable(),
        result: KeyStr,
        severity: Severity,
        at: Ts,
      }),
    ),
  ),
  cli: ['events'],
});

export const SYS_83 = sys({
  id: 'SYS-83',
  scope: 'self',
  method: 'GET',
  path: '/notifications',
  auth: 'V',
  o4: 'open',
  request: { query: z.strictObject({ unread: queryBool().optional(), ...pageQueryShape() }) },
  response: ok(
    PageOf(
      z.strictObject({
        ...idShape('NT'),
        kind: z.enum(NOTIFICATION_KINDS),
        severity: Severity,
        params: I18nParams,
        target: AnyId.nullable(),
        at: Ts,
        readAt: Ts.nullable(),
      }),
    ),
  ),
  cli: ['notifications'],
});

export const SYS_84 = sys({
  id: 'SYS-84',
  scope: 'self',
  method: 'POST',
  path: '/notifications/read',
  auth: 'V',
  o4: 'open',
  // Một trong: danh sách mã, hoặc tất cả.
  request: {
    body: z.union([
      z.strictObject({ refs: z.array(Ref('NT')).min(1).max(200) }),
      z.strictObject({ all: z.literal(true) }),
    ]),
  },
  response: ok(z.strictObject({ updated: Nat })),
  cli: ['notifications read'],
});

export const SYS_85 = sys({
  id: 'SYS-85',
  method: 'GET',
  path: '/stream',
  auth: 'V',
  o4: 'open',
  // `text/event-stream` gồm `StreamEvent` (§3.7); nhịp giữ kết nối 15 giây; gặp khoảng trống thì `resync`.
  request: { headers: z.strictObject({ 'last-event-id': str(64, 1).optional() }) },
  response: sse(StreamEvent),
  cli: ['events -f', '--watch', 'REPL'],
});

export const SYS_ROUTES = [
  SYS_01,
  SYS_02,
  SYS_03,
  SYS_04,
  SYS_05,
  SYS_06,
  SYS_07,
  SYS_08,
  SYS_09,
  SYS_10,
  SYS_11,
  SYS_12,
  SYS_13,
  SYS_14,
  SYS_15,
  SYS_16,
  SYS_17,
  SYS_18,
  SYS_19,
  SYS_20,
  SYS_21,
  SYS_22,
  SYS_23,
  SYS_24,
  SYS_25,
  SYS_26,
  SYS_27,
  SYS_28,
  SYS_29,
  SYS_80,
  SYS_81,
  SYS_82,
  SYS_83,
  SYS_84,
  SYS_85,
] as const;
