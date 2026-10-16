import { z } from 'zod';
import { AUTH_METHODS, CAPABILITY_AUTH_MODES, ENGINE_SLUG_RE, NATIVE_MEMORY_POLICY, ProbeOutcome } from './engine.ts';
import { ULID_RE } from './ids.ts';
import { MEASURE_KINDS } from './sessions.ts';

// Giao thức ga-app ↔ ga-runner (chạy TRONG container Role / hệ thống) — BUILD-PLAN §B.5, §B.7; CNS-168.
//
// Gen quyết 2026-10-16 (HIGH allowlist-semantic-escape): bundle KHÔNG mang argv / lệnh / tên tệp credential. ga-app chỉ gửi
// Ý ĐỊNH có schema đóng: slug engine, loại thao tác, id tài khoản, tham số đã chuẩn hoá (model / effort theo pattern chặt),
// tệp prompt (đường tương đối dưới thư mục prompt của tmpfs). ga-runner tự dựng argv từ adapter @ga/engines đóng sẵn trong
// image runner, kiểm bằng engineArgvViolations() (argv[0] dưới /opt/engines/<slug>/, cấm shell / interpreter, chỉ cờ trong
// bảng đóng của adapter), lấy authAllowlist của chính adapter. ga-app bị chiếm cũng không chọn được chương trình hay cờ.
//
// Hai mức schema cùng một hình:
//   - RunnerBundles (module-level): slug chỉ kiểm định dạng — dùng ở supervisor (không phụ thuộc @ga/engines) để chuyển tiếp.
//   - runnerBundleSchemas(slugs): slug là ENUM lấy từ registry adapter — ga-runner (và ga-app trước khi gửi) PHẢI dùng bản này.
//
// Chính sách chạy (không đổi): tmpfs riêng của lần chạy (/run/ga/<id>/ hoặc /run/ga/probe-<id>/) làm cwd + HOME; nối (không
// đọc) tệp authAllowlist của adapter từ /auth/<en> vào HOME; spawn (stdin đóng, không TTY, timeout); xoá tmpfs; auth-gc.

const Ulid = z.string().regex(ULID_RE);
const EngineAccount = z.string().regex(/^EN-\d{4,12}$/);
/** ts DB 24 ký tự. */
const DbTs = z.string().length(24);

export const RUNNER_COMMANDS = ['turn', 'login-check', 'probe', 'auth-gc', 'login'] as const;
export type RunnerCommand = (typeof RUNNER_COMMANDS)[number];
export const ENGINE_INSTALL_COMMANDS = ['install', 'status'] as const;

// ---------------------------------------------------------------- loại thao tác
export const PROBE_KINDS = ['capability_scan'] as const;
export type ProbeKind = (typeof PROBE_KINDS)[number];
/** `turn` | `login_check` | `probe:<kind>` — enum đóng; thao tác mới = thêm vào đây + adapter + test. */
export const RUNNER_OPS = ['turn', 'login_check', 'probe:capability_scan'] as const;
export type RunnerOp = (typeof RUNNER_OPS)[number];
export type ProbeOp = Exclude<RunnerOp, 'turn'>;

// ---------------------------------------------------------------- tham số đã chuẩn hoá
/** Định dạng slug (không enum) — mức chuyển tiếp. */
export const EngineSlugFormat = z.string().max(32).regex(ENGINE_SLUG_RE);
export type EngineSlugList = readonly [string, ...string[]];

/**
 * id model lấy từ capability registry: bắt đầu bằng chữ / số (không bao giờ dạng cờ `-…`), chỉ `[A-Za-z0-9._:/-]`, ≤ 96 ký tự
 * (không khoảng trắng, `=`, nháy, ký tự điều khiển), + hậu tố hẹp tuỳ chọn `[<1–8 chữ thường / số>]` ở CUỐI (vd biến thể
 * ngữ cảnh `…[1m]`; L-ENG đề xuất, Gen duyệt). Giá trị đi vào argv thành một phần tử riêng (không qua shell). Adapter còn
 * kiểm thuộc registry và chỉ đặt làm GIÁ TRỊ của cờ khai.
 */
export const MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,95}(?:\[[0-9a-z]{1,8}\])?$/;
export const MODEL_ID_MAX = 106;
/** Mức effort: chữ thường bắt đầu, ≤ 16 ký tự. */
export const EFFORT_RE = /^[a-z][a-z0-9_-]{0,15}$/;

/** Tên cờ CLI quét được (capability `flag:*`): `-x` / `--long-flag`, ≤ 65 ký tự, không `=` / khoảng trắng. */
export const DETECTED_FLAG_RE = /^--?[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;
export const DetectedFlags = z.array(z.string().max(65).regex(DETECTED_FLAG_RE)).max(256);

export const TurnParams = z.strictObject({
  model: z.string().max(MODEL_ID_MAX).regex(MODEL_ID_RE).nullable(),
  effort: z.string().max(16).regex(EFFORT_RE).nullable(),
});
export type TurnParams = z.infer<typeof TurnParams>;

// ---------------------------------------------------------------- tệp prompt
/**
 * Tệp prompt nằm dưới `/run/ga/<turnId>/prompt/` — thư mục RIÊNG, tách khỏi `ticket` và `home/` (không ghi đè được vé hay
 * cấu hình CLI trong HOME). Đường tương đối, ≤ 4 đoạn; mỗi đoạn bắt đầu bằng chữ / số ⇒ không tuyệt đối, không `.` / `..`,
 * không rỗng, không dạng cờ.
 */
export const PROMPT_DIR = 'prompt' as const;
const PROMPT_PATH_SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const PROMPT_PATH_MAX_SEGMENTS = 4;
/** Trần nội dung một tệp prompt (đơn vị UTF-16 của JS) — giới hạn trước khi xử lý. */
export const PROMPT_FILE_MAX_CHARS = 4_000_000;

export function isSafePromptPath(path: string): boolean {
  if (path.length === 0 || path.length > 255) return false;
  const segments = path.split('/');
  return segments.length <= PROMPT_PATH_MAX_SEGMENTS && segments.every((s) => PROMPT_PATH_SEGMENT_RE.test(s));
}

export const PromptFile = z.strictObject({
  path: z.string().max(255).refine(isSafePromptPath, 'đường tệp prompt phải tương đối, an toàn, ≤ 4 đoạn'),
  content: z.string().max(PROMPT_FILE_MAX_CHARS),
});
export type PromptFile = z.infer<typeof PromptFile>;

// ---------------------------------------------------------------- bundle (ý định) theo slug
function buildRunnerBundles<Slug extends z.ZodType<string>>(engineSlug: Slug) {
  /** Bundle của một lượt: phản hồi `GET /turn/bundle` của gateway (runner gửi vé lượt đọc từ tệp tmpfs). */
  const TurnBundle = z.strictObject({
    v: z.literal(2),
    op: z.literal('turn'),
    turnId: Ulid,
    sessionId: Ulid,
    engineSlug,
    engineAccount: EngineAccount,
    params: TurnParams,
    /** Cách đăng nhập của tài khoản (adapter cấu hình CLI theo đó). */
    authMethod: z.enum(AUTH_METHODS),
    /**
     * Cờ đã quét của phiên bản CLI đang cài — CHỈ làm cổng (cơ chế giới hạn công cụ phải có đủ cờ), không bao giờ vào argv
     * (argv chỉ từ flagTable; engineArgvViolations). Ngoại lệ có chủ đích duy nhất của luật "bundle không có mảng chuỗi".
     */
    detectedFlags: DetectedFlags,
    prompt: z
      .strictObject({ user: PromptFile, system: PromptFile.nullable() })
      .refine(
        (p) => p.system === null || p.system.path !== p.user.path,
        'prompt user / system phải là hai tệp khác nhau',
      ),
    timeoutMs: z.number().int().positive().max(3_600_000),
    /** Phiên đo (CNS-178): 'overhead_bare' ⇒ adapter dựng plan KHÔNG có cấu hình MCP / tool gateway. null = lượt thường. */
    measure: z.enum(MEASURE_KINDS).nullable(),
    nativeMemoryPolicy: z.literal(NATIVE_MEMORY_POLICY),
    /** Hết hạn cùng vé lượt. */
    expiresAt: DbTs,
  });

  const LoginCheckBundle = z.strictObject({
    v: z.literal(2),
    op: z.literal('login_check'),
    probeId: Ulid,
    engineSlug,
    engineAccount: EngineAccount,
    authMethod: z.enum(AUTH_METHODS),
    expiresAt: DbTs,
  });

  const CapabilityScanBundle = z.strictObject({
    v: z.literal(2),
    op: z.literal('probe:capability_scan'),
    probeId: Ulid,
    engineSlug,
    engineAccount: EngineAccount,
    authMode: z.enum(CAPABILITY_AUTH_MODES),
    expiresAt: DbTs,
  });

  /** Kiểm đăng nhập / quét khả năng — đi qua STDIN của exec (không qua env, không qua URL). */
  const ProbeBundle = z.discriminatedUnion('op', [LoginCheckBundle, CapabilityScanBundle]);

  /** `ga-runner auth-gc` (stdin): runner dọn /auth/<en> theo authAllowlist CỦA ADAPTER — ga-app không gửi danh sách tệp. */
  const AuthGcBundle = z.strictObject({ v: z.literal(2), engineSlug, engineAccount: EngineAccount });

  /** `ga-engine-install install|status` (stdin). `fake` chỉ có ở image test (testkit) — image phát hành từ chối. */
  const EngineInstallBundle = z.strictObject({
    v: z.literal(2),
    engineSlug,
    source: z.enum(['official', 'fake']),
  });

  /** `ga-runner login` (PTY, TTY): lấy từ claims của vé PTY đã ký, đi qua env LOGIN_EXEC.env; runner dựng loginArgv. */
  const LoginBundle = z.strictObject({
    v: z.literal(2),
    engineSlug,
    engineAccount: EngineAccount,
    authMethod: z.enum(AUTH_METHODS),
  });

  return {
    EngineSlug: engineSlug,
    TurnBundle,
    LoginCheckBundle,
    CapabilityScanBundle,
    ProbeBundle,
    AuthGcBundle,
    EngineInstallBundle,
    LoginBundle,
  };
}

/** Mức chuyển tiếp (slug chỉ kiểm định dạng). Runner KHÔNG dùng bản này để quyết chạy gì. */
export const RunnerBundles = buildRunnerBundles(EngineSlugFormat);

/**
 * Bản có enum slug từ registry adapter (vd `runnerBundleSchemas(BUILTIN_ADAPTERS.map(a => a.slug))` trong ga-runner).
 * Danh sách rỗng, trùng, hoặc slug sai định dạng ⇒ ném lỗi khi khởi tạo (fail-closed).
 */
export function runnerBundleSchemas(engineSlugs: readonly string[]) {
  const [first, ...rest] = engineSlugs;
  if (first === undefined) throw new Error('registry engine rỗng');
  if (new Set(engineSlugs).size !== engineSlugs.length) throw new Error('registry engine có slug trùng');
  for (const s of engineSlugs) if (!ENGINE_SLUG_RE.test(s)) throw new Error(`slug engine sai định dạng: ${s}`);
  const slugs: EngineSlugList = [first, ...rest];
  return buildRunnerBundles(z.enum(slugs));
}

export const TurnBundle = RunnerBundles.TurnBundle;
export type TurnBundle = z.infer<typeof TurnBundle>;
export const LoginCheckBundle = RunnerBundles.LoginCheckBundle;
export type LoginCheckBundle = z.infer<typeof LoginCheckBundle>;
export const CapabilityScanBundle = RunnerBundles.CapabilityScanBundle;
export type CapabilityScanBundle = z.infer<typeof CapabilityScanBundle>;
export const ProbeBundle = RunnerBundles.ProbeBundle;
export type ProbeBundle = z.infer<typeof ProbeBundle>;
export const AuthGcBundle = RunnerBundles.AuthGcBundle;
export type AuthGcBundle = z.infer<typeof AuthGcBundle>;
export const EngineInstallBundle = RunnerBundles.EngineInstallBundle;
export type EngineInstallBundle = z.infer<typeof EngineInstallBundle>;
export const LoginBundle = RunnerBundles.LoginBundle;
export type LoginBundle = z.infer<typeof LoginBundle>;

// ---------------------------------------------------------------- kết quả
export const AuthGcResult = z.strictObject({
  /** Chỉ đếm, không trả tên tệp / nội dung. */
  removed: z.number().int().nonnegative(),
  nativeMemory: z.enum(['off', 'unknown']),
});
export type AuthGcResult = z.infer<typeof AuthGcResult>;

/**
 * Báo cáo cuối của ga-runner: DÒNG CUỐI của stdout (dạng `$ga: 'report'`). Mọi dòng khác là `$ga: 'line'` bọc dòng CLI —
 * xem giao thức stdout bên dưới (parseRunnerStdout).
 */
/**
 * Mã lỗi của chính ga-runner / ga-engine-install (lỗi TRƯỚC hoặc NGOÀI CLI) — enum đóng (L-RT đề xuất, Gen duyệt).
 * Không mang nội dung credential / vé / output CLI.
 */
export const RUNNER_ERROR_CODES = [
  'usage',
  'internal',
  'argv_rejected',
  'forbidden_env',
  'unsafe_path',
  'auth_dir_missing',
  'bad_account',
  'bad_adapter',
  'bad_allowlist',
  'bad_bundle',
  'bad_cli',
  'bad_engine',
  'unknown_engine',
  'bad_slug',
  'bad_gateway_url',
  'bad_plan',
  'plan_conflicts_auth',
  'http_plan_unsupported',
  'bad_pty_id',
  'bad_ticket',
  'bad_ticket_file',
  'bad_turn_id',
  'bundle_expired',
  'bundle_rejected',
  'cli_not_installed',
  'spawn_failed',
  'stdin_error',
  'stdin_timeout',
  'stdin_too_large',
  'timeout',
  'network',
  'bad_url',
  'bad_version',
  'no_previous',
  'response_too_large',
  'too_many_entries',
] as const;
export type RunnerErrorCode = (typeof RUNNER_ERROR_CODES)[number];

export const RunnerReport = z.discriminatedUnion('command', [
  /** Runner hỏng trước / ngoài CLI: report `error` (vẫn đúng một report, là dòng cuối). */
  z.strictObject({
    $ga: z.literal('report'),
    command: z.literal('error'),
    code: z.enum(RUNNER_ERROR_CODES),
    message: z.string().max(500),
  }),
  z.strictObject({
    $ga: z.literal('report'),
    command: z.literal('turn'),
    turnId: Ulid,
    exit: z.strictObject({
      exitCode: z.number().int().nullable(),
      signal: z.string().nullable(),
      timedOut: z.boolean(),
      durationMs: z.number().int().nonnegative(),
    }),
    authGc: AuthGcResult,
  }),
  z.strictObject({
    $ga: z.literal('report'),
    command: z.literal('login-check'),
    probeId: Ulid,
    outcomes: z.array(ProbeOutcome).length(1),
    authGc: AuthGcResult,
  }),
  z.strictObject({
    $ga: z.literal('report'),
    command: z.literal('probe'),
    probeId: Ulid,
    outcomes: z.array(ProbeOutcome).min(1),
    authGc: AuthGcResult,
  }),
]);
export type RunnerReport = z.infer<typeof RunnerReport>;

// ---------------------------------------------------------------- đường tmpfs + env
/** Env + đường tmpfs cho kiểm đăng nhập / quét khả năng (tương đương TURN_EXEC của lượt). */
export const PROBE_EXEC = {
  envProbeId: 'GA_PROBE_ID',
  probeDir: (probeId: string) => `/run/ga/probe-${probeId}`,
  homeDir: (probeId: string) => `/run/ga/probe-${probeId}/home`,
} as const;

/** Thư mục tệp prompt của lượt: /run/ga/<turnId>/prompt — runner ghép `PromptFile.path` dưới thư mục này. */
export const promptDir = (turnId: string) => `/run/ga/${turnId}/${PROMPT_DIR}`;

/** `ga-runner login` (PTY): bundle đi qua đúng ba biến env này (stdin là terminal); runner kiểm bằng LoginBundle có enum. */
export const LOGIN_EXEC = {
  env: { engineSlug: 'GA_ENGINE_SLUG', engineAccount: 'GA_ENGINE_ACCOUNT', authMethod: 'GA_AUTH_METHOD' },
} as const;

// ---------------------------------------------------------------- giao thức stdout của ga-runner (phương án B — bọc mọi dòng)
// Gen quyết 2026-10-16 (security review MEDIUM output-injection): MỌI dòng runner ghi ra stdout là JSON do runner dựng bằng
// JSON.stringify, thuộc đúng một trong hai dạng:
//   {"$ga":"line","l":"<dòng CLI nguyên văn, đã che bí mật>"}   — nội dung CLI (model kiểm soát) LUÔN nằm trong một chuỗi
//   {"$ga":"report",…}                                            — RunnerReport, đúng một lần, là dòng cuối
// ⇒ CLI không giả được object cấp trên (`{"$ga":"report",…}` do CLI in ra chỉ là giá trị của `l`). Bên đọc (supervisor /
// ga-app) dùng parseRunnerStdout: fail-closed, chặn kích thước trước khi parse, chỉ nhận JSON dạng chuẩn (không khoá trùng).

/** Trần một dòng CLI sau khi che (runner cắt / tách dòng dài hơn trước khi bọc). */
export const RUNNER_CLI_LINE_MAX_CHARS = 262_144;
/** Trần một dòng stdout (đã bọc) — kiểm TRƯỚC khi parse; đủ cho dòng CLI tối đa sau escape JSON (≤ 6 ký tự / ký tự). */
export const RUNNER_STDOUT_LINE_MAX_CHARS = 6 * RUNNER_CLI_LINE_MAX_CHARS + 64;
/** Trần số dòng một lần chạy. */
export const RUNNER_STDOUT_MAX_LINES = 200_000;

export const RunnerStdoutLine = z.strictObject({
  $ga: z.literal('line'),
  l: z.string().max(RUNNER_CLI_LINE_MAX_CHARS),
});
export type RunnerStdoutLine = z.infer<typeof RunnerStdoutLine>;

/** Runner: bọc một dòng CLI (đã che) — luôn dùng hàm này, không ghi dòng thô. */
export function runnerStdoutLine(cliLine: string): string {
  return JSON.stringify(RunnerStdoutLine.parse({ $ga: 'line', l: cliLine }));
}

/** Runner: dòng report (dòng cuối cùng). */
export function runnerReportLine(report: RunnerReport): string {
  return JSON.stringify(RunnerReport.parse(report));
}

export type RunnerStdoutParse =
  | { ok: true; lines: string[]; report: RunnerReport }
  | { ok: false; code: 'runner_protocol_error'; reason: string; lineNo: number | null };

const protocolError = (reason: string, lineNo: number | null): RunnerStdoutParse => ({
  ok: false,
  code: 'runner_protocol_error',
  reason,
  lineNo,
});

/**
 * Đọc stdout của ga-runner (đã tách theo '\n', KHÔNG gồm phần rỗng sau '\n' cuối). Mỗi dòng phải là JSON dạng chuẩn
 * (= JSON.stringify(JSON.parse(dòng)) — chặn khoá trùng, khoảng trắng, escape lạ) và đúng một trong hai dạng; phải có ĐÚNG
 * MỘT report và nó là dòng cuối. Mọi lệch ⇒ `runner_protocol_error` (không trả report nào — fail-closed).
 */
export function parseRunnerStdout(lines: readonly string[]): RunnerStdoutParse {
  if (lines.length > RUNNER_STDOUT_MAX_LINES) return protocolError(`quá ${RUNNER_STDOUT_MAX_LINES} dòng`, null);
  const out: string[] = [];
  let report: RunnerReport | null = null;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] as string;
    const lineNo = i + 1;
    if (raw.length > RUNNER_STDOUT_LINE_MAX_CHARS) return protocolError('dòng quá cỡ', lineNo);
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return protocolError('dòng không phải JSON do runner dựng', lineNo);
    }
    if (JSON.stringify(value) !== raw)
      return protocolError('JSON không ở dạng chuẩn (khoá trùng / khoảng trắng / escape)', lineNo);
    const kind =
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as { $ga?: unknown }).$ga
        : undefined;
    if (kind === 'line') {
      const parsed = RunnerStdoutLine.safeParse(value);
      if (!parsed.success) return protocolError('dòng `line` sai schema', lineNo);
      if (report !== null) return protocolError('report không phải dòng cuối', lineNo);
      out.push(parsed.data.l);
    } else if (kind === 'report') {
      if (report !== null) return protocolError('nhiều hơn một report', lineNo);
      const parsed = RunnerReport.safeParse(value);
      if (!parsed.success) return protocolError('report sai schema', lineNo);
      report = parsed.data;
    } else {
      return protocolError('dòng lạ (không phải line / report)', lineNo);
    }
  }
  if (report === null) return protocolError('thiếu report', null);
  return { ok: true, lines: out, report };
}
