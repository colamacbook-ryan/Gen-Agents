import { z } from 'zod';

// Hợp đồng EngineAdapter (BUILD-PLAN §B.5, §B.7, §D.3; CNS-132, 137, 142, 160).
// - Adapter là HÀM THUẦN (packages/engines): dựng argv / tệp / env, parse output. Không tự chạy tiến trình, không I/O.
// - turnPlan / loginCheck / capabilityScan / loginArgv CHẠY TRONG ga-runner (adapter đóng sẵn trong image runner), KHÔNG ở
//   control plane: ga-app chỉ gửi ý định có schema đóng (bundle ở runner.ts), không bao giờ gửi argv / lệnh. Runner kiểm argv
//   do adapter dựng bằng engineArgvViolations() trước khi spawn (HIGH allowlist-semantic-escape — Gen quyết 2026-10-16).
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

// ---------------------------------------------------------------- argv do runner dựng: cổng cuối trước spawn
// Gen quyết 2026-10-16 (HIGH allowlist-semantic-escape): argv chỉ được dựng TRONG ga-runner từ adapter đóng sẵn; runner gọi
// engineArgvViolations(argv, slug, adapter.flagTable) cho MỌI argv (lượt, kiểm đăng nhập, quét khả năng, đăng nhập PTY) và
// từ chối nếu khác rỗng. Hàm thuần trên chuỗi: runner phải gọi lại isSafeEngineArgv0 với realpath(argv[0]) (chặn symlink
// trỏ ra ngoài volume engine).

/** Volume ga-engines (mount CHỈ ĐỌC): binary của engine `<slug>` nằm dưới `/opt/engines/<slug>/`. */
export const ENGINES_ROOT = '/opt/engines' as const;

/** slug của engine: chữ thường, số, gạch ngang; dùng làm tên thư mục nên không có `/`, `.`, `..`. */
export const ENGINE_SLUG_RE = /^[a-z][a-z0-9-]{0,31}$/;

/**
 * Tên chương trình KHÔNG BAO GIỜ được làm argv[0] (shell, interpreter, trình bọc chạy lệnh khác), so sánh không phân biệt hoa
 * thường, sau khi bỏ hậu tố phiên bản (`python3.12` → `python`, `node22` → `node`). CLI viết bằng ngôn ngữ thông dịch phải
 * được exec qua tệp vào có shebang, không qua `<interpreter> <script>`. Gồm cả công cụ mạng / container (thoát egress) và
 * chương trình của chính hệ (`ga-*`, kiểm riêng theo tiền tố) — ⊇ danh sách gốc của runner (L-RT 2b19a58, test giữ fixture).
 */
export const FORBIDDEN_ARGV0_NAMES: ReadonlySet<string> = new Set([
  'sh',
  'bash',
  'dash',
  'zsh',
  'ash',
  'ksh',
  'mksh',
  'csh',
  'tcsh',
  'fish',
  'busybox',
  'toybox',
  'env',
  'xargs',
  'sudo',
  'su',
  'doas',
  'nohup',
  'timeout',
  'nice',
  'setsid',
  'stdbuf',
  'chroot',
  'unshare',
  'nsenter',
  'script',
  'expect',
  'strace',
  'ltrace',
  'gdb',
  'ld.so',
  'ld-linux',
  'node',
  'nodejs',
  'deno',
  'bun',
  'npx',
  'npm',
  'pnpm',
  'yarn',
  'corepack',
  'python',
  'pypy',
  'perl',
  'ruby',
  'irb',
  'php',
  'lua',
  'luajit',
  'tclsh',
  'wish',
  'java',
  'jshell',
  'osascript',
  'pwsh',
  'powershell',
  'awk',
  'gawk',
  'mawk',
  'nawk',
  'sed',
  'find',
  'make',
  'python2',
  'python3',
  'ionice',
  'socat',
  'nc',
  'ncat',
  'netcat',
  'curl',
  'wget',
  'ssh',
  'scp',
  'docker',
  'ga-runner',
  'ga-engine-install',
]);

/** Một đoạn đường dưới /opt/engines/<slug>/: bắt đầu bằng chữ/số (không `.`, `..`, rỗng, không bắt đầu bằng `-`). */
const ENGINE_PATH_SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/;
const ENGINE_PATH_MAX_SEGMENTS = 8;

/** Tên chương trình (basename) có thuộc nhóm cấm không — đã bỏ hậu tố phiên bản `[0-9.]` ở cuối; mọi `ga-*` đều cấm. */
export function isForbiddenArgv0Name(basename: string): boolean {
  const lower = basename.toLowerCase();
  if (lower.startsWith('ga-')) return true;
  let end = lower.length;
  while (end > 0 && '0123456789.'.includes(lower[end - 1] ?? '')) end--;
  return FORBIDDEN_ARGV0_NAMES.has(lower) || FORBIDDEN_ARGV0_NAMES.has(lower.slice(0, end));
}

/** argv[0] hợp lệ: tuyệt đối, nằm dưới `/opt/engines/<slug>/`, mọi đoạn an toàn, basename không phải shell / interpreter. */
export function isSafeEngineArgv0(argv0: string, engineSlug: string): boolean {
  if (!ENGINE_SLUG_RE.test(engineSlug)) return false;
  const prefix = `${ENGINES_ROOT}/${engineSlug}/`;
  if (argv0.length > 1024 || !argv0.startsWith(prefix)) return false;
  const segments = argv0.slice(prefix.length).split('/');
  if (segments.length > ENGINE_PATH_MAX_SEGMENTS || !segments.every((s) => ENGINE_PATH_SEGMENT_RE.test(s)))
    return false;
  return !isForbiddenArgv0Name(segments[segments.length - 1] ?? '');
}

/**
 * Bảng ĐÓNG của adapter: argv chỉ được chứa lệnh con / cờ khai ở đây. Lệnh con chỉ đứng liền sau argv[0]; cờ `value`
 * nhận giá trị ở đối số kế tiếp (không bắt đầu bằng `-`) hoặc dạng `--cờ=giá trị`; toán hạng không bắt đầu bằng `-`.
 * `env`: tên biến môi trường adapter được đặt cho tiến trình CLI (ngoài các biến runner tự đặt) — vẫn bị chặn cứng nếu
 * thuộc nhóm loader / interpreter / bí mật (isForbiddenRuntimeEnvName, isForbiddenEnvName).
 */
export interface EngineFlagTable {
  readonly subcommands: readonly string[];
  readonly flags: Readonly<Record<string, 'switch' | 'value'>>;
  readonly env: readonly string[];
}

// ---------------------------------------------------------------- env của tiến trình CLI
// Runner spawn CLI với env DỰNG MỚI (không kế thừa env của runner): biến runner tự đặt (RUNNER_OWNED_ENV, giá trị cố định /
// tmpfs của lần chạy) + plan.env đã qua engineEnvViolations(plan.env, adapter.flagTable).

/** Biến runner tự đặt cho CLI; adapter / ga-app không được đặt. */
export const RUNNER_OWNED_ENV = ['HOME', 'PATH', 'LANG', 'TERM', 'TZ'] as const;

/**
 * Chặn cứng (kể cả khi adapter khai trong bảng): biến khiến loader / interpreter / shell nạp mã khác, đổi nơi tìm chương
 * trình, đổi CA / proxy (MITM, thoát egress), hay khiến CLI gọi chương trình ngoài (EDITOR, PAGER…).
 */
export const FORBIDDEN_RUNTIME_ENV_PREFIXES = [
  'LD_',
  'DYLD_',
  'NODE_',
  'NPM_CONFIG_',
  'PYTHON',
  'PERL',
  'RUBY',
  'BASH_FUNC_',
  'GIT_',
  'JAVA_',
  '_JAVA_',
  'JDK_JAVA_',
  'LUA_',
  'XDG_',
  'GCONV_',
  'GLIBC_',
  'MALLOC_',
] as const;
export const FORBIDDEN_RUNTIME_ENV_NAMES: ReadonlySet<string> = new Set([
  ...RUNNER_OWNED_ENV,
  'SHELL',
  'ENV',
  'BASH_ENV',
  'SHELLOPTS',
  'BASHOPTS',
  'PS4',
  'PROMPT_COMMAND',
  'IFS',
  'CDPATH',
  'GLOBIGNORE',
  'CLASSPATH',
  'LOCPATH',
  'NLSPATH',
  'HOSTALIASES',
  'RESOLV_HOST_CONF',
  'TMPDIR',
  'EDITOR',
  'VISUAL',
  'PAGER',
  'BROWSER',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'CURL_CA_BUNDLE',
  'REQUESTS_CA_BUNDLE',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
]);

export function isForbiddenRuntimeEnvName(name: string): boolean {
  const upper = name.toUpperCase();
  return FORBIDDEN_RUNTIME_ENV_NAMES.has(upper) || FORBIDDEN_RUNTIME_ENV_PREFIXES.some((p) => upper.startsWith(p));
}

/** Trần số biến / độ dài giá trị adapter đặt. */
export const MAX_ENGINE_ENV_VARS = 32;
export const MAX_ENGINE_ENV_VALUE = 4096;

/** Lỗi của env so với chính sách (rỗng = được spawn). Chỉ trả tên biến, không trả giá trị. */
export function engineEnvViolations(env: Readonly<Record<string, string>>, table: EngineFlagTable): string[] {
  const out: string[] = [];
  const names = Object.keys(env);
  if (names.length > MAX_ENGINE_ENV_VARS) out.push(`env quá ${MAX_ENGINE_ENV_VARS} biến`);
  for (const name of names) {
    const value = env[name] ?? '';
    if (!ENV_NAME_RE.test(name)) out.push(`env: tên không hợp lệ (${name.slice(0, 64)})`);
    else if (isForbiddenEnvName(name)) out.push(`env ${name}: tên bí mật / khoá nội bộ bị cấm`);
    else if (isForbiddenRuntimeEnvName(name))
      out.push(`env ${name}: nhóm loader / interpreter / runner tự đặt — chặn cứng`);
    else if (!table.env.includes(name)) out.push(`env ${name}: ngoài bảng env của adapter`);
    if (value.length > MAX_ENGINE_ENV_VALUE || value.includes('\0'))
      out.push(`env ${name}: giá trị quá dài hoặc chứa NUL`);
  }
  return out;
}

/** Trần số phần tử argv (chặn bom đối số; prompt dài đi bằng tệp, không bằng nhiều đối số). */
export const MAX_ENGINE_ARGV = 64;

/** Lỗi của argv so với chính sách (rỗng = được spawn). Không trả giá trị đối số (có thể là prompt), chỉ vị trí / tên cờ. */
export function engineArgvViolations(argv: readonly string[], engineSlug: string, table: EngineFlagTable): string[] {
  const out: string[] = [];
  const [argv0] = argv;
  if (argv0 === undefined) return ['argv rỗng'];
  if (argv.length > MAX_ENGINE_ARGV) out.push(`argv quá ${MAX_ENGINE_ARGV} phần tử`);
  if (!isSafeEngineArgv0(argv0, engineSlug)) {
    out.push(`argv[0] phải nằm dưới ${ENGINES_ROOT}/<slug>/ và không phải shell / interpreter`);
  }
  if (argv.some((a) => a.includes('\0'))) out.push('đối số chứa NUL');
  let i = 1;
  while (i < argv.length && table.subcommands.includes(argv[i] ?? '')) i++;
  for (; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (!a.startsWith('-')) continue; // toán hạng
    const eq = a.indexOf('=');
    const name = eq === -1 ? a : a.slice(0, eq);
    const kind = Object.hasOwn(table.flags, name) ? table.flags[name] : undefined;
    if (kind === undefined) {
      out.push(`argv[${i}]: cờ ngoài bảng của adapter`);
    } else if (kind === 'switch') {
      if (eq !== -1) out.push(`argv[${i}]: cờ ${name} không nhận giá trị`);
    } else if (eq === -1) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('-')) out.push(`argv[${i}]: cờ ${name} thiếu giá trị (hoặc giá trị dạng cờ)`);
      i++;
    } else if (eq === a.length - 1) {
      out.push(`argv[${i}]: cờ ${name} có giá trị rỗng`);
    }
  }
  return out;
}

// ---------------------------------------------------------------- kết quả một lần chạy không tương tác
// Adapter KHÔNG trả lệnh CLI thô cho supervisor: mọi lần chạy CLI (lượt, kiểm đăng nhập, quét khả năng) đi qua `ga-runner`
// trong container với HOME tmpfs riêng + auth-gc (CNS-168). Adapter (chạy trong runner) trả EnginePlan (turnPlan / probePlan).
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
// = bảng DB `engine_installs` (DATABASE v2.3.1+): install_state + failure_reason; THIẾU HÀNG nghĩa là chưa cài (fail-closed).
// v2.3.2: chỉ actor system được ghi (engine_installs_writer_i/_u) ⇒ app ghi created_by / updated_by = actor system của workspace.
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

/** Kiểm đăng nhập: một ProbePlan (dựng và chạy TRONG ga-runner login-check) + hàm thuần đọc kết quả. */
export interface LoginCheck {
  plan: ProbePlan;
  parse(outcome: ProbeOutcome): LoginCheckResult;
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

/** Tệp adapter muốn ghi vào thư mục tmpfs của lượt / lần kiểm (prompt, cấu hình MCP trỏ gateway, tắt trí nhớ native). */
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
 * Kế hoạch chạy engine — DÙNG CHUNG cho lượt (turnPlan) và kiểm đăng nhập / quét khả năng (probePlan): union `cli | http`
 * (CNS-160, CNS-168). ga-runner thực thi trong container: HOME = tmpfs riêng của lần chạy (runner đặt — plan không được
 * đặt HOME), cwd = thư mục tmpfs, stdin đóng, không TTY, timeout tường minh; xong thì xoá tmpfs + auth-gc.
 * Vé lượt KHÔNG nằm trong plan: ga-runner đọc vé từ stdin rồi ghi vào tệp tmpfs 0400 (CNS-142).
 */
export const EnginePlan = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('cli'),
    files: z.array(TurnPlanFile),
    argv: z.array(z.string().min(1)).min(1),
    /** Runner còn kiểm theo bảng env của adapter (engineEnvViolations); schema chặn cứng nhóm loader / interpreter / HOME. */
    env: EnvMap.refine(
      (env) => !Object.keys(env).some(isForbiddenRuntimeEnvName),
      'env của plan chứa biến loader / interpreter / runner tự đặt (HOME, PATH…) — bị chặn cứng',
    ),
    timeoutMs: z.number().int().positive().max(3_600_000),
  }),
  z.strictObject({
    kind: z.literal('http'),
    endpoint: z.string().url(),
    request: z.strictObject({
      method: z.literal('POST'),
      headers: z.record(z.string(), z.string()),
      body: z.string(),
    }),
    timeoutMs: z.number().int().positive().max(3_600_000),
  }),
]);
export type EnginePlan = z.infer<typeof EnginePlan>;
export const TurnPlan = EnginePlan;
export type TurnPlan = EnginePlan;
export const ProbePlan = EnginePlan;
export type ProbePlan = EnginePlan;

/** Kết quả một ProbePlan do ga-runner trả (stdout / stderr đã qua bộ lọc che bí mật trong runner). */
export const ProbeOutcome = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('cli'),
    exitCode: z.number().int().nullable(),
    signal: z.string().nullable(),
    stdout: z.string(),
    stderr: z.string(),
    timedOut: z.boolean(),
    durationMs: z.number().int().nonnegative(),
  }),
  z.strictObject({
    kind: z.literal('http'),
    status: z.number().int().nullable(),
    body: z.string(),
    timedOut: z.boolean(),
    durationMs: z.number().int().nonnegative(),
  }),
]);
export type ProbeOutcome = z.infer<typeof ProbeOutcome>;

/** Đầu vào để adapter dựng ProbePlan: đường tmpfs của LẦN KIỂM (không dùng HOME / thư mục credential thật làm HOME). */
export interface ProbePlanInput {
  /** ULID của lần kiểm. */
  probeId: string;
  /** Tuyệt đối: /run/ga/probe-<probeId>/ — tmpfs riêng, xoá khi xong. */
  probeDir: string;
  /** Tuyệt đối: /run/ga/probe-<probeId>/home/ — HOME của CLI trong lần kiểm (runner nối tệp allowlist từ authDir vào). */
  homeDir: string;
  /** Thư mục credential /auth/<en> (chỉ đọc tên tệp allowlist; runner không đọc nội dung). */
  authDir: string;
}

/** Runner dựng từ TurnBundle (đã kiểm bằng schema có enum slug) — control plane không gọi turnPlan. */
export interface TurnPlanInput {
  /** ULID của lần chạy (một lượt có thể chạy lại khi fallback ⇒ mỗi lần một turnId). */
  turnId: string;
  /** Prompt đã biên dịch ở revision đã ghim + ngữ cảnh hội thoại dựng từ DB (không resume native). */
  prompt: string;
  /** Tuyệt đối: tệp runner đã ghi nội dung `prompt` (dưới /run/ga/<turnId>/prompt/), cho adapter dùng cờ đọc tệp. */
  promptFile: string;
  /** Khối hệ thống (Polaris động…) nếu adapter tách riêng. */
  systemPrompt: string | null;
  /** Tuyệt đối: tệp chứa systemPrompt, null khi không có. */
  systemPromptFile: string | null;
  /** Phiên đo (CNS-178): 'overhead_bare' ⇒ KHÔNG cấu hình MCP / tool gateway (CLI trần); khác ⇒ như lượt thường. */
  measure: 'overhead_bare' | 'overhead_shell' | 'prompt_worst' | null;
  /** Lấy từ registry (STD-10), null = để CLI tự chọn. Đã qua MODEL_ID_RE / EFFORT_RE; adapter vẫn chỉ đặt làm GIÁ TRỊ của cờ khai. */
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
  /** Bảng cờ đóng: mọi argv adapter trả (loginArgv, plan cli) phải qua engineArgvViolations(argv, slug, flagTable). */
  readonly flagTable: EngineFlagTable;
  /** Argv đăng nhập — runner (`ga-runner login`, PTY) gọi trong container; đúng lệnh đăng nhập, không shell. */
  loginArgv(input: LoginArgvInput): readonly string[];
  /** Kiểm đăng nhập: runner (`ga-runner login-check`) gọi trong container (HOME tmpfs + auth-gc), không exec CLI thô. */
  loginCheck(input: LoginArgvInput & ProbePlanInput): LoginCheck;
  /** Quét khả năng: runner (`ga-runner probe`) gọi trong container (cùng chính sách HOME tmpfs + auth-gc). */
  capabilityScan(input: CapabilityScanInput & ProbePlanInput): readonly ProbePlan[];
  parseCapabilities(outcomes: readonly ProbeOutcome[]): CapabilityEntry[];
  parseStreamLine(line: string): TurnStreamEvent | null;
  classify(
    exit: Pick<ExecResult, 'exitCode' | 'signal' | 'timedOut'>,
    stdout: string,
    stderr: string,
  ): TurnClassification;
  /** Runner (`ga-runner turn`) gọi trong container từ TurnBundle; control plane không gọi. */
  turnPlan(input: TurnPlanInput): TurnPlan;
}

/** Chính sách trạng thái native duy nhất được chấp nhận (CNS-132). */
export const NATIVE_MEMORY_POLICY = 'tmpfs-per-turn' as const;
