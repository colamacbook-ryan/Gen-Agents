import { z } from 'zod';
import {
  CAPABILITY_AUTH_MODES,
  CAPABILITY_CONFIDENCE,
  CAPABILITY_KINDS,
  EngineInstallStatus,
  TokenUsage,
  TurnClassification,
} from '../engine.ts';
import {
  AGENT_KINDS,
  NATIVE_MEMORY_STATES,
  SESSION_PHASES,
  SESSION_STATUSES,
  SESSION_TRIGGERS,
  TURN_REJECTIONS,
} from '../sessions.ts';
import { DesiredState, ObservedState, PTY } from '../supervisor.ts';
import {
  ConfirmName,
  IdOf,
  idShape,
  Job,
  Json,
  KeyStr,
  list,
  Nat,
  PageOf,
  pageQueryShape,
  Ref,
  SecretInput,
  str,
  Ts,
} from './common.ts';
import { accepted, defineLane, noContent, ok, okNoStore } from './define.ts';
import { Redacted } from './masking.ts';
import {
  AccountRow,
  Budget,
  ConsentInput,
  ConsumerView,
  ContainerState,
  EffortKey,
  EngineSlug,
  ModelKey,
} from './shapes.ts';

// L-GW — engine, tài khoản, đăng nhập (PTY), probe, compiler, phiên, quyền tool (BACKEND-TRIAL §3.4: 32 route).
// Route ghi credential hoặc mở PTY là `O` (cổng người ghi, STD-11). O4 `core` = khi đang ở chế độ khắc phục, chỉ mở với
// TÀI KHOẢN CORE AGENT (route đọc thì chỉ trả hàng của tài khoản đó).
// Không có endpoint HTTP cho MCP gateway (`:7410`, mạng `ga-roles`) và `sessions.runTurn`: hợp đồng nội bộ đã đóng băng
// (`mcp.ts`, `sessions.ts`), không đi qua edge.

const gw = defineLane('L-GW');

const ENGINE_COMPAT = ['tested', 'untested', 'unknown'] as const;
const TOOL_MODES = ['allow', 'ask', 'deny'] as const;
const SELECTION_STATES = ['valid', 'stale', 'unavailable', 'unknown'] as const;
/** `compiled_prompt_segments.layer` / `.source_kind` (đặc tả ghi một `kind` gộp; DB tách `layer` + `source_kind` + `is_conditional` ⇒ theo DB). */
export const PROMPT_SEGMENT_LAYERS = [
  'values',
  'house_rules',
  'persona',
  'style',
  'drive',
  'position',
  'skills',
  'polaris',
  'frame',
] as const;
export const PROMPT_SEGMENT_SOURCE_KINDS = [
  'dna_field',
  'instruction',
  'skill_index',
  'polaris_rules',
  'polaris',
  'frame',
] as const;
/** `tools.kind` / `.risk_level` / `.allowed_agents` / `.status`. */
export const TOOL_KINDS = ['gateway_builtin', 'mcp_server', 'integration'] as const;
export const TOOL_RISK_LEVELS = ['low', 'medium', 'high'] as const;
export const TOOL_ALLOWED_AGENTS = ['role', 'system', 'both'] as const;
export const TOOL_STATUSES = ['active', 'disabled'] as const;
/** Trạng thái một lượt probe (= `probe.result` của SSE). */
const PROBE_STATUSES = ['running', 'ok', 'partial', 'failed'] as const;
const PERMISSION_STATUSES = ['pending', 'approved', 'denied', 'expired', 'cancelled'] as const;
/** `consumer` ở query: AI Hệ thống (`system`) hoặc một Role. */
const ConsumerFilter = z.union([z.literal('system'), Ref('RL')]);
const SHA256_HEX = z
  .string()
  .length(64)
  .regex(/^[0-9a-f]{64}$/)
  .meta({ example: 'a'.repeat(64) });

// ---------------------------------------------------------------- GW-01…04 engine (CLI hãng)
export const EngineRow = z.strictObject({
  slug: EngineSlug,
  nameKey: str(96, 1),
  adapterStatus: z.enum(['ready', 'coming_soon']),
  coreCapable: z.boolean(),
  requiresConsent: z.boolean(),
  noticeVersion: str(32, 1).nullable(),
  install: EngineInstallStatus,
  pinnedVersion: str(64, 1).nullable(),
  latestVersion: str(64, 1).nullable(),
  testedVersions: list(str(64, 1), 64),
  compat: z.enum(ENGINE_COMPAT),
});
const EngineParams = z.strictObject({ engineSlug: EngineSlug });

export const GW_01 = gw({
  id: 'GW-01',
  method: 'GET',
  path: '/engines',
  auth: 'V',
  o4: 'open',
  response: ok(list(EngineRow, 64)),
  cli: ['engines', 'setup'],
});

export const GW_02 = gw({
  id: 'GW-02',
  method: 'POST',
  path: '/engines/{engineSlug}/install',
  auth: 'A',
  o4: 'open',
  request: { params: EngineParams },
  // Rồi SSE `engine.install`. `conflict` khi đang cài.
  response: accepted(z.strictObject({ install: EngineInstallStatus })),
  cli: ['engines install', 'core fix'],
});

export const GW_03 = gw({
  id: 'GW-03',
  method: 'PUT',
  path: '/engines/{engineSlug}/pin',
  // Ghim phiên bản CLI hãng chạy trong container của mọi Role ⇒ owner (Gen: mọi update / pin = owner).
  // Dịch vụ KHÔNG nội suy slug / version vào shell: chỉ dùng EXEC_ARGV cố định (HANDLER-OBLIGATIONS #16).
  auth: 'O',
  o4: 'blocked',
  request: {
    params: EngineParams,
    body: z.strictObject({
      // Chỉ ký tự của semver / tag (không khoảng trắng, không ký tự shell); `null` = bỏ ghim.
      version: z
        .string()
        .regex(/^[0-9A-Za-z.+-]{1,64}$/)
        .meta({ example: '1.2.3' })
        .nullable(),
    }),
  },
  response: ok(EngineRow),
  cli: ['engines pin'],
});

export const GW_04 = gw({
  id: 'GW-04',
  method: 'POST',
  path: '/engines/{engineSlug}/update',
  // Cập nhật CLI hãng = chạy mã mới trong container có credential ⇒ owner (Gen: mọi update / pin = owner). Slug chỉ đi qua
  // EXEC_ARGV, không vào shell (HANDLER-OBLIGATIONS #16).
  auth: 'O',
  o4: 'blocked',
  request: { params: EngineParams },
  // Bản mới ngoài `testedVersions` thì gắn cờ "chưa kiểm tương thích" (`compat`).
  response: accepted(z.strictObject({ install: EngineInstallStatus })),
  cli: ['engines update'],
});

// ---------------------------------------------------------------- GW-05…17 tài khoản, đăng nhập, probe
const AccountParams = z.strictObject({ accountRef: Ref('EN') });

export const GW_05 = gw({
  id: 'GW-05',
  method: 'GET',
  path: '/engine-accounts',
  auth: 'V',
  o4: 'core',
  request: { query: z.strictObject({ consumer: ConsumerFilter.optional() }) },
  response: ok(list(AccountRow, 200)),
  cli: ['accounts', 'engine <role>', 'dash'],
});

export const GW_06 = gw({
  id: 'GW-06',
  method: 'GET',
  path: '/engine-accounts/{accountRef}',
  auth: 'V',
  o4: 'core',
  request: { params: AccountParams },
  response: ok(
    AccountRow.extend({
      consents: list(
        z.strictObject({
          ...idShape('CN'),
          noticeVersion: str(32, 1),
          acceptedAt: Ts,
          revokedAt: Ts.nullable(),
          accountHint: str(120).nullable(),
        }),
        100,
      ),
      probes: list(
        z.strictObject({
          ...idShape('PB'),
          kind: z.enum(['login_check', 'capability_scan']),
          status: z.enum(PROBE_STATUSES),
          at: Ts,
        }),
        100,
      ),
      bindings: list(IdOf('EB'), 64),
      needsConsent: z.boolean(),
      loginBlockedReason: KeyStr.nullable(),
    }),
  ),
  cli: ['login (bước 1)', 'engine show'],
});

export const GW_07 = gw({
  id: 'GW-07',
  method: 'POST',
  path: '/roles/{roleRef}/engine-accounts',
  // Tạo tài khoản engine (+ volume `/auth`, + đồng ý Clause 6 trong body) = chạm credential ⇒ owner (đặc tả §3.4 ghi `A`; đã nâng
  // `O` theo rà soát bảo mật 2026-10-17, fail-closed).
  auth: 'O',
  touchesCredential: true,
  o4: 'blocked',
  request: {
    params: z.strictObject({ roleRef: Ref('RL') }),
    body: z.strictObject({
      engineSlug: EngineSlug,
      label: str(60, 1),
      authMethod: z.enum(['subscription', 'api_key']),
      consent: ConsentInput.optional(),
    }),
  },
  // Một transaction; tài khoản Core agent không bao giờ là lựa chọn. Container ở trạng thái quan sát ban đầu
  // (đặc tả ghi "sleeping" nhưng `ObservedState` của supervisor không có giá trị đó — dùng ObservedState, L-GW chốt).
  response: ok(
    z.strictObject({
      account: IdOf('EN'),
      binding: z.strictObject({ ...idShape('EB'), priority: Nat }),
      consent: IdOf('CN').nullable(),
      container: ContainerState,
    }),
  ),
  errors: ['consent.required', 'consent.notice_mismatch', 'db.conflict', 'db.core_agent_rule'],
  cli: ['engine add'],
});

export const GW_08 = gw({
  id: 'GW-08',
  method: 'DELETE',
  path: '/engine-accounts/{accountRef}',
  // Gỡ tài khoản kèm credential (volume `/auth`) mà owner đã đăng nhập: admin không được (rà soát bảo mật 2026-10-17, MEDIUM).
  auth: 'O',
  touchesCredential: true,
  o4: 'blocked',
  request: { params: AccountParams, body: z.strictObject({ confirmLabel: ConfirmName }) },
  // Gỡ binding + tài khoản của Role. `db.core_agent_rule`: tài khoản Core agent sau mốc khoá.
  response: noContent(),
  errors: ['confirm.mismatch', 'db.core_agent_rule'],
  cli: ['engine remove'],
});

export const GW_09 = gw({
  id: 'GW-09',
  method: 'PUT',
  path: '/roles/{roleRef}/engine-bindings/order',
  auth: 'A',
  o4: 'blocked',
  request: {
    params: z.strictObject({ roleRef: Ref('RL') }),
    // `validation.failed` khi thiếu / thừa binding.
    body: z.strictObject({ order: z.array(Ref('EB')).min(1).max(16) }),
  },
  response: ok(list(z.strictObject({ ...idShape('EB'), priority: Nat }), 16)),
  cli: ['engine order'],
});

export const GW_10 = gw({
  id: 'GW-10',
  method: 'PATCH',
  path: '/engine-bindings/{bindingRef}',
  auth: 'A',
  // BẬT binding (`enabled = true`) gắn volume `/auth` của tài khoản vào container của Role = NỚI ⇒ owner; tắt / đổi model / effort
  // giữ A. Binding phải thuộc đúng workspace (HANDLER-OBLIGATIONS #1, #2).
  ownerWhen: { in: 'body', field: 'enabled', equals: true },
  o4: 'blocked',
  request: {
    params: z.strictObject({ bindingRef: Ref('EB') }),
    body: z.strictObject({
      modelKey: ModelKey.optional(),
      effort: EffortKey.optional(),
      enabled: z.boolean().optional(),
    }),
  },
  response: ok(
    z.strictObject({
      ...idShape('EB'),
      modelKey: ModelKey.nullable(),
      effort: EffortKey.nullable(),
      selectionState: z.enum(SELECTION_STATES),
    }),
  ),
  errors: ['capability.unavailable'],
  cli: ['engine model'],
});

export const GW_11 = gw({
  id: 'GW-11',
  method: 'POST',
  path: '/engine-accounts/{accountRef}/consents',
  auth: 'O',
  touchesCredential: true,
  o4: 'core',
  request: { params: AccountParams, body: ConsentInput },
  response: ok(z.strictObject({ consent: IdOf('CN') })),
  errors: ['consent.notice_mismatch'],
  cli: ['consent', 'login (khi cần)', 'core fix'],
});

export const GW_12 = gw({
  id: 'GW-12',
  method: 'PUT',
  path: '/engine-accounts/{accountRef}/api-key',
  auth: 'O',
  touchesCredential: true,
  o4: 'core',
  // Chỉ body; lưu mã hoá envelope, tự kiểm đăng nhập. CLI: ô ẩn hoặc `--stdin`, không bao giờ qua argv / query.
  request: { params: AccountParams, body: z.strictObject({ apiKey: SecretInput('api_key') }) },
  response: ok(z.strictObject({ last4: str(4, 1), secret: IdOf('SEC'), loginCheck: IdOf('PB') })),
  errors: ['consent.required'],
  cli: ['apikey set'],
});

export const GW_13 = gw({
  id: 'GW-13',
  method: 'DELETE',
  path: '/engine-accounts/{accountRef}/api-key',
  auth: 'O',
  touchesCredential: true,
  o4: 'core',
  request: { params: AccountParams },
  // Thu hồi khỏi kho bí mật và container.
  response: noContent(),
  cli: ['apikey revoke'],
});

/** Vé PTY (`ga-term.v1`): base64url(claims) + '.' + base64url(HMAC). Dùng một lần, TTL 60 giây, không lưu. */
const TermTicket = z
  .string()
  .min(3)
  .max(2048)
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  .meta({ example: 'eyJ2IjoyfQ.c2lnbmF0dXJl' });

export const GW_14 = gw({
  id: 'GW-14',
  method: 'POST',
  path: '/engine-accounts/{accountRef}/login-sessions',
  auth: 'O',
  touchesCredential: true,
  o4: 'core',
  request: { params: AccountParams, body: z.strictObject({ mode: z.enum(['login', 'relogin']) }) },
  // `Cache-Control: no-store`. Đặt `login_status = in_progress` (Core agent: `relogin_in_progress`). WebSocket mở bằng vé
  // trong `Sec-WebSocket-Protocol` (EXT-05), KHÔNG trong URL.
  response: okNoStore(
    z.strictObject({
      ticket: TermTicket,
      wsPath: z.literal(PTY.path),
      protocol: z.literal(PTY.protocol),
      expiresAt: Ts,
      maxDurationSeconds: z.literal(PTY.maxDurationSeconds),
      container: IdOf('CT'),
    }),
  ),
  errors: ['engine.not_installed', 'consent.required', 'engine.login_busy'],
  errorReasons: { 'engine.not_installed': ['not_installed', 'installing', 'failed'] },
  cli: ['login', 'setup', 'core fix', 'core change-type'],
});

export const GW_15 = gw({
  id: 'GW-15',
  method: 'POST',
  path: '/engine-accounts/{accountRef}/login-check',
  auth: 'A',
  o4: 'core',
  request: { params: AccountParams },
  // Rồi SSE `probe.result`.
  response: accepted(z.strictObject({ probe: IdOf('PB') })),
  errors: ['engine.not_installed'],
  cli: ['login-check', 'setup'],
});

export const GW_16 = gw({
  id: 'GW-16',
  method: 'POST',
  path: '/engine-accounts/{accountRef}/capability-scan',
  auth: 'A',
  o4: 'core',
  request: { params: AccountParams },
  response: accepted(z.strictObject({ probe: IdOf('PB') })),
  // `turn.rejected` khi chưa đăng nhập.
  errors: ['engine.not_installed', 'turn.rejected'],
  cli: ['scan', 'setup (bước 3)'],
});

export const GW_17 = gw({
  id: 'GW-17',
  method: 'POST',
  path: '/engine-accounts/rescan',
  auth: 'A',
  o4: 'blocked',
  request: { body: z.strictObject({ consumer: ConsumerFilter.optional() }) },
  response: accepted(z.strictObject({ probes: list(IdOf('PB'), 200) })),
  cli: ['scan --all'],
});

// ---------------------------------------------------------------- GW-18 capability registry
export const GW_18 = gw({
  id: 'GW-18',
  method: 'GET',
  path: '/capabilities',
  auth: 'V',
  o4: 'open',
  request: {
    query: z.strictObject({ accountRef: Ref('EN').optional(), kind: z.enum(CAPABILITY_KINDS).optional() }),
  },
  // Không quét được ⇒ `valueState = unknown` + `unknownReason`, KHÔNG điền mặc định (STD-10).
  response: ok(
    list(
      z.strictObject({
        ...idShape('CAP'),
        account: IdOf('EN'),
        kind: z.enum(CAPABILITY_KINDS),
        key: str(128, 1),
        valueState: z.enum(['known', 'unknown']),
        value: Json.nullable(),
        unknownReason: str(200).nullable(),
        source: KeyStr,
        confidence: z.enum(CAPABILITY_CONFIDENCE).nullable(),
        authMode: z.enum(CAPABILITY_AUTH_MODES),
        cliVersion: str(64),
        scannedAt: Ts,
        missingSince: Ts.nullable(),
      }),
      2000,
    ),
  ),
  cli: ['capabilities', 'setup (bước 3)'],
});

// ---------------------------------------------------------------- GW-19…24 đo token, compiler, ngân sách, thứ hạng model
export const GW_19 = gw({
  id: 'GW-19',
  method: 'POST',
  path: '/engine-accounts/{accountRef}/measure-overhead',
  auth: 'A',
  o4: 'blocked',
  request: { params: AccountParams },
  // `overhead_bare` + `overhead_shell`, không fallback; kết quả ở `overhead` của GW-06.
  response: accepted(z.strictObject({ job: Job, sessions: z.array(IdOf('SS')).length(2) })),
  errors: ['turn.rejected'],
  errorReasons: { 'turn.rejected': TURN_REJECTIONS },
  cli: ['measure'],
});

export const GW_20 = gw({
  id: 'GW-20',
  method: 'POST',
  path: '/roles/{roleRef}/measure-prompt',
  auth: 'A',
  o4: 'blocked',
  // Đo trên MỘT BINDING của chính Role (mặc định binding ưu tiên 1). Đặc tả cũ nhận `accountRef` (bất kỳ tài khoản): đổi sang
  // `bindingRef` để không chạy phiên đo trên tài khoản Core agent hay tài khoản của Role khác (HANDLER-OBLIGATIONS #2: dịch vụ
  // vẫn PHẢI kiểm binding ∈ bindings của Role này).
  request: {
    params: z.strictObject({ roleRef: Ref('RL') }),
    body: z.strictObject({ bindingRef: Ref('EB').optional() }),
  },
  // Phiên `prompt_worst`.
  response: accepted(z.strictObject({ job: Job, session: IdOf('SS') })),
  errors: ['turn.rejected'],
  errorReasons: { 'turn.rejected': TURN_REJECTIONS },
  cli: ['measure'],
});

export const GW_21 = gw({
  id: 'GW-21',
  method: 'GET',
  path: '/roles/{roleRef}/compiled-prompt',
  // Prompt đã biên dịch = DNA + trí nhớ + tri thức nguyên văn ⇒ A (review PR #7, round 6): viewer không cần đọc; fail-closed.
  auth: 'A',
  o4: 'blocked',
  request: {
    params: z.strictObject({ roleRef: Ref('RL') }),
    query: z.strictObject({ engine: EngineSlug.optional(), context: z.enum(['default', 'worst']).optional() }),
  },
  response: ok(
    z.strictObject({
      ...idShape('GC'),
      compilerVersion: str(32, 1),
      engineSlug: EngineSlug,
      account: IdOf('EN').nullable(),
      prefixSha256: SHA256_HEX,
      segments: list(
        z.strictObject({
          ordinal: Nat,
          layer: z.enum(PROMPT_SEGMENT_LAYERS),
          sourceKind: z.enum(PROMPT_SEGMENT_SOURCE_KINDS),
          isConditional: z.boolean(),
          // `source_display`: display_id của DN / IN / SK, hoặc nhãn khối (`frame`, `polaris`).
          source: str(64, 1),
          text: str(200_000),
          tokens: Nat,
        }),
        500,
      ),
      totals: z.strictObject({
        compiled: Nat,
        frame: Nat,
        polarisRules: Nat,
        polarisDynamic: Nat,
        runtimeOverhead: Nat,
        runtimeLabel: z.enum(['measured', 'estimated']),
        total: Nat,
      }),
    }),
  ),
  cli: ['prompt', 'REPL /prompt'],
});

export const GW_22 = gw({
  id: 'GW-22',
  method: 'GET',
  path: '/roles/{roleRef}/prompt-budget',
  auth: 'V',
  o4: 'blocked',
  request: { params: z.strictObject({ roleRef: Ref('RL') }) },
  // `v_role_prompt_budget`; frontend / CLI KHÔNG tự cộng.
  response: ok(Budget),
  cli: ['budget', 'REPL /budget'],
});

const ModelRankRow = z.strictObject({
  ...idShape('MR'),
  engineSlug: EngineSlug,
  modelKey: ModelKey,
  rank: Nat,
  source: z.enum(['owner', 'suggested']),
  reason: str(200),
});

export const GW_23 = gw({
  id: 'GW-23',
  method: 'GET',
  path: '/model-ranks',
  auth: 'V',
  o4: 'blocked',
  request: { query: z.strictObject({ engine: EngineSlug.optional() }) },
  response: ok(list(ModelRankRow, 500)),
  cli: ['model-ranks'],
});

export const GW_24 = gw({
  id: 'GW-24',
  method: 'PUT',
  path: '/model-ranks',
  auth: 'A',
  o4: 'blocked',
  // `order`: mọi model phải có trong registry (`capability.unavailable` nếu không).
  request: { body: z.strictObject({ engineSlug: EngineSlug, order: z.array(ModelKey).min(1).max(200) }) },
  response: ok(list(ModelRankRow, 500)),
  errors: ['capability.unavailable'],
  cli: ['model-ranks set'],
});

// ---------------------------------------------------------------- GW-25…27 container, phiên
export const GW_25 = gw({
  id: 'GW-25',
  method: 'GET',
  path: '/containers',
  auth: 'V',
  o4: 'open',
  // `containers` + `v_container_mounts`.
  response: ok(
    list(
      z.strictObject({
        ...idShape('CT'),
        consumer: ConsumerView,
        desired: DesiredState,
        observed: ObservedState,
        health: KeyStr,
        image: str(255, 1),
        mounts: list(IdOf('EN'), 64),
      }),
      200,
    ),
  ),
  cli: ['containers', 'core fix'],
});

const SessionRow = z.strictObject({
  ...idShape('SS'),
  agentKind: z.enum(AGENT_KINDS),
  trigger: z.enum(SESSION_TRIGGERS),
  role: IdOf('RL').nullable(),
  task: IdOf('TK').nullable(),
  engineSlug: EngineSlug,
  modelKey: ModelKey.nullable(),
  effort: EffortKey.nullable(),
  status: z.enum(SESSION_STATUSES),
  phase: z.enum(SESSION_PHASES).nullable(),
  tokens: TokenUsage,
  failoverCount: Nat,
  nativeMemory: z.enum(NATIVE_MEMORY_STATES),
  startedAt: Ts,
  endedAt: Ts.nullable(),
});

export const GW_26 = gw({
  id: 'GW-26',
  method: 'GET',
  path: '/sessions',
  auth: 'V',
  o4: 'blocked',
  request: {
    query: z.strictObject({
      roleRef: Ref('RL').optional(),
      taskRef: Ref('TK').optional(),
      agentKind: z.enum(AGENT_KINDS).optional(),
      status: z.enum(SESSION_STATUSES).optional(),
      ...pageQueryShape(),
    }),
  },
  response: ok(PageOf(SessionRow)),
  cli: ['sessions', 'task show', 'diag'],
});

export const GW_27 = gw({
  id: 'GW-27',
  method: 'GET',
  path: '/sessions/{sessionRef}',
  auth: 'V',
  o4: 'blocked',
  request: { params: z.strictObject({ sessionRef: Ref('SS') }) },
  response: ok(
    SessionRow.extend({
      compiledPrompt: IdOf('GC').nullable(),
      container: IdOf('CT').nullable(),
      classification: TurnClassification.nullable(),
      toolCalls: list(z.strictObject({ tool: str(64, 1), audit: IdOf('AU'), denied: z.boolean() }), 500),
    }),
  ),
  cli: ['session show'],
});

// ---------------------------------------------------------------- GW-28…32 quyền tool
const PermissionRow = z.strictObject({
  ...idShape('PM'),
  role: IdOf('RL'),
  tool: IdOf('TL').nullable(),
  requestedToolSlug: str(64, 1),
  scope: str(200),
  reason: str(500),
  task: IdOf('TK').nullable(),
  polarisCheck: IdOf('PC'),
  status: z.enum(PERMISSION_STATUSES),
  createdAt: Ts,
});
const GrantRow = z.strictObject({
  ...idShape('GR'),
  tool: z.strictObject({ slug: KeyStr, kind: z.enum(TOOL_KINDS), riskLevel: z.enum(TOOL_RISK_LEVELS) }),
  mode: z.enum(TOOL_MODES),
  via: z.enum(['role', 'position']),
  expiresAt: Ts.nullable(),
});

export const GW_28 = gw({
  id: 'GW-28',
  method: 'GET',
  path: '/permission-requests',
  auth: 'V',
  o4: 'blocked',
  request: { query: z.strictObject({ status: z.enum(PERMISSION_STATUSES).optional() }) },
  response: ok(list(PermissionRow)),
  cli: ['perms'],
});

export const GW_29 = gw({
  id: 'GW-29',
  method: 'POST',
  path: '/permission-requests/{permissionRef}/decision',
  auth: 'A',
  // NỚI hàng rào = owner (Gen, fail-closed): `decision` ∈ {allow, ask} cấp / mở quyền tool cho Role ⇒ O; `deny` siết ⇒ A.
  // Dịch vụ còn PHẢI (HANDLER-OBLIGATIONS #3): quyền thật đọc từ trạng thái phía máy chủ; KÉO DÀI `expiresAt` của một grant
  // đang có (hoặc bỏ hạn) cũng là nới ⇒ O (hợp đồng không biểu đạt được: so với `expiresAt` đã lưu); ref cùng workspace (#1).
  ownerWhen: { in: 'body', field: 'decision', equalsAny: ['allow', 'ask'] },
  writesAccessPolicy: ['tool_grants'],
  o4: 'blocked',
  request: {
    params: z.strictObject({ permissionRef: Ref('PM') }),
    body: z.strictObject({
      decision: z.enum(TOOL_MODES),
      expiresAt: Ts.optional(),
      note: str(500, 1).optional(),
    }),
  },
  // `conflict` khi đã quyết. B-REL: duyệt bằng CLI (Q-B5: không có nút duyệt nhanh trên Telegram).
  response: ok(z.strictObject({ request: PermissionRow, grant: IdOf('GR').nullable() })),
  cli: ['perm allow', 'perm ask', 'perm deny'],
});

export const GW_30 = gw({
  id: 'GW-30',
  method: 'GET',
  path: '/roles/{roleRef}/tool-grants',
  auth: 'V',
  o4: 'blocked',
  request: { params: z.strictObject({ roleRef: Ref('RL') }) },
  response: ok(list(GrantRow)),
  cli: ['grants'],
});

export const GW_31 = gw({
  id: 'GW-31',
  method: 'PUT',
  path: '/roles/{roleRef}/tool-grants/{toolSlug}',
  auth: 'A',
  // NỚI hàng rào = owner (Gen, fail-closed): `mode` ∈ {allow, ask} cấp / mở quyền tool cho Role ⇒ O; `deny` siết ⇒ A.
  // Dịch vụ còn PHẢI (HANDLER-OBLIGATIONS #3): quyền thật đọc từ trạng thái phía máy chủ; KÉO DÀI `expiresAt` của một grant
  // đang có (hoặc bỏ hạn) cũng là nới ⇒ O (hợp đồng không biểu đạt được: so với `expiresAt` đã lưu); ref cùng workspace (#1).
  ownerWhen: { in: 'body', field: 'mode', equalsAny: ['allow', 'ask'] },
  writesAccessPolicy: ['tool_grants'],
  o4: 'blocked',
  request: {
    params: z.strictObject({ roleRef: Ref('RL'), toolSlug: KeyStr }),
    body: z.strictObject({ mode: z.enum(TOOL_MODES), expiresAt: Ts.optional() }),
  },
  response: ok(GrantRow),
  errors: ['db.*'],
  cli: ['grants set'],
});

export const GW_32 = gw({
  id: 'GW-32',
  method: 'GET',
  path: '/tools',
  auth: 'V',
  o4: 'blocked',
  response: ok(
    list(
      z.strictObject({
        ...idShape('TL'),
        slug: KeyStr,
        name: str(120, 1),
        kind: z.enum(TOOL_KINDS),
        riskLevel: z.enum(TOOL_RISK_LEVELS),
        defaultMode: z.enum(TOOL_MODES),
        // `tools.allowed_agents`: một giá trị (đặc tả ghi mảng; DB là enum role | system | both ⇒ theo DB).
        allowedAgents: z.enum(TOOL_ALLOWED_AGENTS),
        definitionTokens: Nat,
        isBuiltin: z.boolean(),
        status: z.enum(TOOL_STATUSES),
      }),
    ),
  ),
  cli: ['tools'],
});

export const GW_ROUTES = [
  GW_01,
  GW_02,
  GW_03,
  GW_04,
  GW_05,
  GW_06,
  GW_07,
  GW_08,
  GW_09,
  GW_10,
  GW_11,
  GW_12,
  GW_13,
  GW_14,
  GW_15,
  GW_16,
  GW_17,
  GW_18,
  GW_19,
  GW_20,
  GW_21,
  GW_22,
  GW_23,
  GW_24,
  GW_25,
  GW_26,
  GW_27,
  GW_28,
  GW_29,
  GW_30,
  GW_31,
  GW_32,
] as const;
