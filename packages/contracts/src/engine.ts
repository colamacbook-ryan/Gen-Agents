import { z } from 'zod';

// Hợp đồng EngineAdapter (BUILD-PLAN §B.5, §B.7, §D.3; CNS-132, 137, 142, 160).
// - Adapter là HÀM THUẦN (packages/engines): dựng argv / tệp / env, parse output. Không tự chạy tiến trình, không I/O.
// - Tên CLI / model cụ thể chỉ nằm trong packages/engines/src/adapters (STD-10, INT-05; lint `no-model-cli-names`).
// - KHÔNG có hàm resume: không dùng resume native của CLI; ngữ cảnh mỗi lượt dựng từ DB (CNS-132).
// - Trạng thái native (HOME của CLI) nằm ở tmpfs riêng của lượt, xoá khi lượt xong; /auth/<en> chỉ giữ tệp trong authAllowlist.

// ---------------------------------------------------------------- tên biến môi trường được tiêm vào tiến trình trong container
/** Tên env cấm: token phiên / OAuth không bao giờ đi qua env (CNS-142); khoá nội bộ của control plane không bao giờ vào container. */
export const FORBIDDEN_ENV_NAME_PATTERNS: readonly RegExp[] = [
  /SESSION/i,
  /_OAUTH_TOKEN/i,
  /^GENAGENTS_MASTER_KEY$/,
  /^GA_(SUPERVISOR|TERM_TICKET|UPDATER|EGRESS)_KEY$/,
];

export const ENV_NAME_RE = /^[A-Z_][A-Z0-9_]*$/;

export function isForbiddenEnvName(name: string): boolean {
  return FORBIDDEN_ENV_NAME_PATTERNS.some((re) => re.test(name));
}

export const EnvMap = z.record(z.string(), z.string()).superRefine((env, ctx) => {
  for (const name of Object.keys(env)) {
    if (!ENV_NAME_RE.test(name)) {
      ctx.addIssue({ code: 'custom', message: `tên env không hợp lệ: ${name}`, path: [name] });
    } else if (isForbiddenEnvName(name)) {
      ctx.addIssue({ code: 'custom', message: `env bị cấm tiêm vào container: ${name}`, path: [name] });
    }
  }
});
export type EnvMap = z.infer<typeof EnvMap>;

// ---------------------------------------------------------------- chạy một lệnh không tương tác
/** Một lần chạy lệnh không tương tác: stdin đóng, không TTY, timeout tường minh (STD-10 §4). */
export const ExecPlan = z.strictObject({
  argv: z.array(z.string().min(1)).min(1),
  env: EnvMap,
  timeoutMs: z.number().int().positive().max(3_600_000),
});
export type ExecPlan = z.infer<typeof ExecPlan>;

export const ExecResult = z.strictObject({
  exitCode: z.number().int().nullable(),
  signal: z.string().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  timedOut: z.boolean(),
  durationMs: z.number().int().nonnegative(),
});
export type ExecResult = z.infer<typeof ExecResult>;

// ---------------------------------------------------------------- trạng thái cài CLI (CNS-137)
// = bảng DB `engine_installs` (DATABASE v2.3.1): install_state + failure_reason; THIẾU HÀNG nghĩa là chưa cài (fail-closed).
export const ENGINE_INSTALL_STATES = ['not_installed', 'installing', 'installed', 'failed'] as const;
export type EngineInstallState = (typeof ENGINE_INSTALL_STATES)[number];

/** Lý do cài lỗi (= engine_installs.failure_reason): domain hãng bị chặn, sai kiến trúc máy, mạng, checksum lệch, chưa phân loại. */
export const ENGINE_INSTALL_FAILURE_REASONS = [
  'domain_blocked',
  'unsupported_arch',
  'network',
  'checksum_mismatch',
  'unknown',
] as const;

export const EngineInstallStatus = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('not_installed') }),
  z.strictObject({
    state: z.literal('installing'),
    /** null khi trình cài chưa biết tổng dung lượng. */
    progressPct: z.number().int().min(0).max(100).nullable(),
    version: z.string().nullable(),
  }),
  z.strictObject({ state: z.literal('installed'), version: z.string().min(1), installedAt: z.string() }),
  z.strictObject({
    state: z.literal('failed'),
    reason: z.enum(ENGINE_INSTALL_FAILURE_REASONS),
    detail: z.string().max(500),
  }),
]);
export type EngineInstallStatus = z.infer<typeof EngineInstallStatus>;

/** Lý do O4 khi CLI của Core agent chưa cài (= v_core_agent_status.reason, DATABASE v2.3.1; chữ cho owner lấy từ view / i18n). */
export const ENGINE_NOT_INSTALLED_REASON = 'engine_not_installed' as const;

/** Nguồn cài chính chủ (CNS-137). Image không chứa CLI của hãng; ga-engine-install tải vào volume ga-engines (mount chỉ đọc). */
export const InstallSpec = z.strictObject({
  source: z.literal('official'),
  /** URL manifest / trình cài chính chủ mà adapter khai (mô tả để audit; supervisor là bên tải). */
  origin: z.string().url(),
  checksum: z.strictObject({
    algorithm: z.enum(['sha256', 'sha512', 'unknown']),
    from: z.enum(['manifest', 'pinned', 'unknown']),
  }),
  /** CLI có tự cập nhật vào thư mục chỉ đọc không: chưa kiểm thì `unknown` (Spike 1c). */
  selfUpdate: z.enum(['disabled', 'enabled', 'unknown']),
  /** Domain egress cần mở cho lần cài (allowlist ga-egress). */
  egressDomains: z.array(z.string().min(1)),
});
export type InstallSpec = z.infer<typeof InstallSpec>;

// ---------------------------------------------------------------- đăng nhập + kiểm đăng nhập (§B.6, §B.7)
export const AUTH_METHODS = ['subscription', 'api_key', 'adc'] as const;
export type AuthMethod = (typeof AUTH_METHODS)[number];

export const LOGIN_CHECK_STATUSES = ['logged_in', 'logged_out', 'expired', 'suspended', 'unknown'] as const;

export const LoginCheckResult = z.strictObject({
  status: z.enum(LOGIN_CHECK_STATUSES),
  /** Danh tính đã che, CHỈ khi CLI tự in ra (G-23); không in thì null và luật "đổi danh tính" chưa chạy. */
  accountHint: z.string().max(120).nullable(),
  detail: z.string().max(500).nullable(),
});
export type LoginCheckResult = z.infer<typeof LoginCheckResult>;

export interface LoginCheck {
  plan: ExecPlan;
  parse(result: ExecResult): LoginCheckResult;
}

// ---------------------------------------------------------------- capability registry (STD-10 §3)
export const CAPABILITY_CONFIDENCE = ['direct', 'indirect', 'static_catalog'] as const;
export const CAPABILITY_AUTH_MODES = ['oauth', 'api_key', 'adc', 'none', 'unknown'] as const;

/** Một giá trị quét được. Không quét được ⇒ valueState 'unknown' + lý do, KHÔNG điền mặc định. scanned_at / cli_version do bộ probe gắn. */
export const CapabilityEntry = z.discriminatedUnion('valueState', [
  z.strictObject({
    key: z.string().min(1),
    valueState: z.literal('known'),
    value: z.json(),
    source: z.string().min(1),
    confidence: z.enum(CAPABILITY_CONFIDENCE),
    authMode: z.enum(CAPABILITY_AUTH_MODES),
  }),
  z.strictObject({
    key: z.string().min(1),
    valueState: z.literal('unknown'),
    /** vd `unknown_requires_login`, `unknown: CLI không cung cấp usage ở phiên bản này`. */
    unknownReason: z.string().min(1),
    source: z.string().min(1),
    authMode: z.enum(CAPABILITY_AUTH_MODES),
  }),
]);
export type CapabilityEntry = z.infer<typeof CapabilityEntry>;

// ---------------------------------------------------------------- một lượt chạy
/** Phân loại kết quả lượt (BUILD-PLAN §B.5 bước 7). Bảng mã lỗi → lý do của từng CLI nằm trong adapter. */
export const TURN_OUTCOMES = [
  'ok',
  'AUTH_REQUIRED',
  'login_expired',
  'outage',
  'quota_exhausted',
  'account_suspended',
  'transient',
] as const;
export type TurnOutcome = (typeof TURN_OUTCOMES)[number];

export const TurnClassification = z.strictObject({
  outcome: z.enum(TURN_OUTCOMES),
  /** Giờ reset quota nếu CLI báo (dạng ts DB), không thì null. */
  resetAt: z.string().nullable(),
  detail: z.string().max(500).nullable(),
});
export type TurnClassification = z.infer<typeof TurnClassification>;

export const TokenUsage = z.strictObject({
  input: z.number().int().nonnegative().nullable(),
  output: z.number().int().nonnegative().nullable(),
  cacheRead: z.number().int().nonnegative().nullable(),
  cacheWrite: z.number().int().nonnegative().nullable(),
  thinking: z.number().int().nonnegative().nullable(),
  costMicroUsd: z.number().int().nonnegative().nullable(),
});
export type TokenUsage = z.infer<typeof TokenUsage>;

/** Một dòng stdout đã parse. Adapter trả null cho dòng không mang thông tin. */
export const TurnStreamEvent = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('delta'), text: z.string() }),
  z.strictObject({
    type: z.literal('tool'),
    stage: z.enum(['call', 'result']),
    name: z.string().min(1),
    callId: z.string().nullable(),
  }),
  z.strictObject({ type: z.literal('usage'), usage: TokenUsage }),
  /** Model thực chạy nếu CLI tự báo (vd sự kiện khởi tạo) — nguồn cho G-08 / registry. */
  z.strictObject({ type: z.literal('model'), model: z.string().min(1) }),
  z.strictObject({ type: z.literal('error'), code: z.string().min(1), message: z.string() }),
]);
export type TurnStreamEvent = z.infer<typeof TurnStreamEvent>;

/** Tệp adapter muốn ghi vào thư mục tmpfs của lượt (prompt, cấu hình MCP trỏ gateway, cấu hình tắt trí nhớ native). */
export const TurnPlanFile = z.strictObject({
  /** Đường tương đối trong /run/ga/<lượt>/ (không tuyệt đối, không `..`). */
  path: z
    .string()
    .min(1)
    .refine((p) => !p.startsWith('/') && !p.split('/').includes('..'), 'path phải tương đối và không chứa ..'),
  content: z.string(),
  mode: z.union([z.literal(0o400), z.literal(0o600)]),
});
export type TurnPlanFile = z.infer<typeof TurnPlanFile>;

/**
 * Kế hoạch một lượt: union `cli | http` (CNS-160) — engine nhận prompt qua HTTP (GĐ2) không phải đổi hợp đồng.
 * Vé lượt KHÔNG nằm trong plan: ga-runner đọc vé từ stdin rồi ghi vào tệp tmpfs 0400 (CNS-142).
 */
export const TurnPlan = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('cli'),
    files: z.array(TurnPlanFile),
    argv: z.array(z.string().min(1)).min(1),
    env: EnvMap,
    timeoutMs: z.number().int().positive(),
  }),
  z.strictObject({
    kind: z.literal('http'),
    endpoint: z.string().url(),
    request: z.strictObject({
      method: z.literal('POST'),
      headers: z.record(z.string(), z.string()),
      body: z.string(),
    }),
    timeoutMs: z.number().int().positive(),
  }),
]);
export type TurnPlan = z.infer<typeof TurnPlan>;

export interface TurnPlanInput {
  /** ULID của lần chạy (một lượt có thể chạy lại khi fallback ⇒ mỗi lần một turnId). */
  turnId: string;
  /** Prompt đã biên dịch ở revision đã ghim + ngữ cảnh hội thoại dựng từ DB (không resume native). */
  prompt: string;
  /** Khối hệ thống (Polaris động…) nếu adapter tách riêng. */
  systemPrompt: string | null;
  /** Lấy từ registry (STD-10), null = để CLI tự chọn. */
  model: string | null;
  effort: string | null;
  /** URL MCP gateway trên mạng ga-roles. */
  gatewayUrl: string;
  /** Tuyệt đối: /run/ga/<turnId>/ — tmpfs riêng của lượt. */
  turnDir: string;
  /** Tuyệt đối: /run/ga/<turnId>/home/ — HOME của tiến trình CLI (trạng thái native), xoá khi lượt xong. */
  homeDir: string;
  /** Tuyệt đối: /run/ga/<turnId>/ticket (0400). Cấu hình MCP đọc vé từ tệp này, không nhúng vé. */
  ticketFile: string;
  /** Thư mục credential /auth/<en> (chỉ tệp trong authAllowlist được nối vào HOME). */
  authDir: string;
}

export interface LoginArgvInput {
  authMethod: AuthMethod;
}

export interface CapabilityScanInput {
  authMode: (typeof CAPABILITY_AUTH_MODES)[number];
}

/**
 * Adapter của một loại CLI. Không có thành viên `resume*` (test kiểu ở contracts bảo đảm).
 * `authAllowlist = 'unknown'` ⇒ auth-gc KHÔNG xoá gì và sessions.native_memory = 'unknown', báo owner (DATABASE D18).
 */
export interface EngineAdapter {
  /** slug trong danh mục `engines` (dữ liệu DB, không phải hằng ở ngoài adapter). */
  readonly slug: string;
  readonly adapterVersion: string;
  /** Version CLI đã kiểm tương thích; version khác ⇒ cờ "chưa kiểm tương thích". */
  readonly testedVersions: readonly string[];
  /** Tên tệp (tương đối trong /auth/<en>) được giữ lại; mọi thứ khác bị auth-gc xoá (không đọc nội dung). */
  readonly authAllowlist: readonly string[] | 'unknown';
  /** Đường (tương đối HOME) nơi CLI ghi transcript / trạng thái native. */
  readonly nativeStatePaths: readonly string[] | 'unknown';
  readonly nativeMemoryPolicy: 'tmpfs-per-turn';
  readonly installSpec: InstallSpec;
  /** Argv đăng nhập chạy trong PTY (đúng lệnh đăng nhập, không shell). */
  loginArgv(input: LoginArgvInput): readonly string[];
  loginCheck(input: LoginArgvInput): LoginCheck;
  capabilityScan(input: CapabilityScanInput): readonly ExecPlan[];
  parseCapabilities(results: readonly ExecResult[]): CapabilityEntry[];
  parseStreamLine(line: string): TurnStreamEvent | null;
  classify(
    exit: Pick<ExecResult, 'exitCode' | 'signal' | 'timedOut'>,
    stdout: string,
    stderr: string,
  ): TurnClassification;
  turnPlan(input: TurnPlanInput): TurnPlan;
}

/** Chính sách trạng thái native duy nhất được chấp nhận (CNS-132). */
export const NATIVE_MEMORY_POLICY = 'tmpfs-per-turn' as const;
