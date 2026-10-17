import { z } from 'zod';
import { BOUNDS } from './bounds.ts';
import { AUTH_METHODS, ENGINES_ROOT, EngineInstallStatus } from './engine.ts';
import { ULID_RE } from './ids.ts';
import {
  AuthGcResult,
  CapabilityScanBundle,
  EngineSlugFormat,
  LOGIN_EXEC,
  LoginCheckBundle,
  PROBE_EXEC,
  RUNNER_STDOUT_LINE_MAX_CHARS,
  type RunnerCommand,
} from './runner.ts';

// Hợp đồng ga-app ↔ ga-supervisor và trình duyệt ↔ relay PTY (BUILD-PLAN §B.2, §B.3, §B.6, §D.3).
// Supervisor là nơi DUY NHẤT cầm Docker API (qua socket-proxy) và là TCB: chỉ thao tác container có nhãn genagents.kind=role|sys,
// tạo container theo MẪU CÓ VERSION, exec chỉ chương trình trong allowlist (CNS-143, 166).

// ---------------------------------------------------------------- RPC ký HMAC (ga-app → supervisor)
/** Header ký: HMAC-SHA256(GA_SUPERVISOR_KEY, `${ts}\n${method}\n${path}\n${sha256hex(body)}`); lệch đồng hồ tối đa SKEW. */
export const SUPERVISOR_RPC = {
  headers: { timestamp: 'x-ga-ts', signature: 'x-ga-sig' },
  maxSkewSeconds: 30,
  basePath: '/rpc/v1',
} as const;

export function supervisorSigningString(ts: string, method: string, path: string, bodySha256Hex: string): string {
  return `${ts}\n${method.toUpperCase()}\n${path}\n${bodySha256Hex}`;
}

// ---------------------------------------------------------------- mẫu container + nhãn
export const CONTAINER_LABEL_KIND = 'genagents.kind' as const;
export const CONTAINER_KINDS = ['role', 'sys'] as const;
export type ContainerKind = (typeof CONTAINER_KINDS)[number];

/** Mẫu container có version (CNS-166). Mẫu không có version bị từ chối; GĐ2 thêm /workspace bằng mẫu mới có review. */
export const CONTAINER_TEMPLATES = ['role.v1', 'sys.v1'] as const;
export const ContainerTemplate = z.enum(CONTAINER_TEMPLATES);
export type ContainerTemplate = z.infer<typeof ContainerTemplate>;

/**
 * Chương trình exec được phép (§B.3): CHỈ `ga-runner <lệnh>` và `ga-engine-install <lệnh>`, ĐÚNG HAI phần tử — kể cả PTY
 * đăng nhập (`ga-runner login`). Không bao giờ exec CLI của hãng trực tiếp; không đối số thêm (CNS-168; HIGH
 * allowlist-semantic-escape, Gen quyết 2026-10-16). Dữ liệu cho runner đi bằng bundle có schema đóng qua stdin / env cố định.
 */
export const EXEC_ALLOWLIST = ['ga-runner', 'ga-engine-install'] as const;

/** Bảng argv cố định theo lệnh — supervisor tra bảng này, KHÔNG nhận argv từ ga-app. */
export const EXEC_ARGV = {
  turn: ['ga-runner', 'turn'],
  'login-check': ['ga-runner', 'login-check'],
  probe: ['ga-runner', 'probe'],
  'auth-gc': ['ga-runner', 'auth-gc'],
  login: ['ga-runner', 'login'],
  'engine-install': ['ga-engine-install', 'install'],
  'engine-status': ['ga-engine-install', 'status'],
} as const satisfies Record<RunnerCommand | 'engine-install' | 'engine-status', readonly [string, string]>;

/** Cổng cuối của supervisor trước `docker exec`: argv phải TRÙNG KHÍT một dòng của EXEC_ARGV. */
export function isAllowedExecArgv(argv: readonly string[]): boolean {
  return (
    argv.length === 2 &&
    Object.values(EXEC_ARGV).some(([program, command]) => argv[0] === program && argv[1] === command)
  );
}

// ---------------------------------------------------------------- định danh định tuyến (review tay M0, LOW: không chuỗi tự do)
/** Volume credential của một tài khoản engine: `ga-auth-en-<số của EN->` (mount RW vào container có binding). */
export const AuthVolumeName = z.string().regex(/^ga-auth-en-\d{4,12}$/);
/** display_id của Role. */
export const RoleDisplayId = z.string().regex(/^RL-\d{4,12}$/);
/** workspaces.short_code (4 ký tự chữ / số). */
export const WorkspaceCode = z.string().regex(/^[A-Za-z0-9]{4}$/);
const UlidId = z.string().regex(ULID_RE);

export const Consumer = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('role'), roleId: UlidId, roleDisplayId: RoleDisplayId }),
  z.strictObject({ kind: z.literal('sys'), workspaceId: UlidId, workspaceCode: WorkspaceCode }),
]);
export type Consumer = z.infer<typeof Consumer>;

export const ContainerRef = z.strictObject({
  name: z
    .string()
    .max(63)
    .regex(/^ga-(role|sys)-[A-Za-z0-9-]+$/),
});
export type ContainerRef = z.infer<typeof ContainerRef>;

export const ObservedState = z.enum([
  'absent',
  'creating',
  'created',
  'running',
  'exited',
  'paused',
  'error',
  'unknown',
]);
export const DesiredState = z.enum(['absent', 'sleeping', 'running', 'stopped']);

export const EnsureContainerRequest = z.strictObject({
  consumer: Consumer,
  template: ContainerTemplate,
  /** Tên volume ga-auth-en-* được mount RW (một mỗi tài khoản có binding bật — v_container_mounts). */
  authVolumes: z.array(AuthVolumeName).max(64),
});
export const EnsureContainerResponse = z.strictObject({
  container: ContainerRef,
  observed: ObservedState,
  /** IP trên mạng ga-roles — gateway kiểm IP nguồn của vé lượt (§B.3). */
  // IPv4 / IPv6 (≤ 45 ký tự).
  rolesNetworkIp: z.string().max(45).nullable(),
});

// ---------------------------------------------------------------- exec headless (lượt, kiểm đăng nhập, quét khả năng)
/** Vé lượt 256-bit dạng base64url (mcp.ts TURN_TICKET). */
const TurnTicket = z.string().regex(/^[A-Za-z0-9_-]{43,256}$/);

/**
 * Việc cần chạy — ga-app chỉ chọn LỆNH trong enum + dữ liệu có schema đóng; không có argv, không có env tự do.
 * Vé lượt đi qua STDIN rồi ga-runner ghi vào /run/ga/<lượt>/ticket (0400) — không qua env vì env của exec đọc được qua
 * Docker API (CNS-142). Bundle kiểm đăng nhập / quét khả năng đi qua STDIN dạng JSON.
 */
export const ExecRun = z.discriminatedUnion('command', [
  z.strictObject({ command: z.literal('turn'), turnId: z.string().regex(ULID_RE), ticket: TurnTicket }),
  z.strictObject({ command: z.literal('login-check'), bundle: LoginCheckBundle }),
  z.strictObject({ command: z.literal('probe'), bundle: CapabilityScanBundle }),
]);
export type ExecRun = z.infer<typeof ExecRun>;

export const ExecRequest = z.strictObject({
  container: ContainerRef,
  run: ExecRun,
  timeoutMs: z.number().int().positive().max(3_600_000),
});
export type ExecRequest = z.infer<typeof ExecRequest>;

/**
 * Env supervisor đặt cho exec — ĐÚNG các biến này, giá trị lấy từ id đã kiểm schema và cấu hình của chính supervisor
 * (`gatewayUrl`), không bao giờ từ ga-app (chặn LD_PRELOAD / NODE_OPTIONS / PATH… do ga-app bị chiếm tiêm vào).
 */
export function execEnv(run: ExecRun, gatewayUrl: string): Record<string, string> {
  switch (run.command) {
    case 'turn':
      return { [TURN_EXEC.envTurnId]: run.turnId, [TURN_EXEC.envGatewayUrl]: gatewayUrl };
    case 'login-check':
    case 'probe':
      return { [PROBE_EXEC.envProbeId]: run.bundle.probeId };
  }
}

/** Nội dung stdin của exec: vé (lượt) hoặc JSON của bundle (kiểm đăng nhập / quét khả năng). */
export function execStdinPayload(run: ExecRun): string {
  return run.command === 'turn' ? run.ticket : JSON.stringify(run.bundle);
}

/** Khung NDJSON trả về từ POST /rpc/v1/exec (luồng). stdout đã đi qua bộ lọc che bí mật ở ga-runner. */
export const ExecFrame = z.discriminatedUnion('type', [
  // Một khung = một dòng stdout / stderr đã bọc: trần = trần dòng stdout của giao thức runner.
  z.strictObject({ type: z.literal('stdout'), data: z.string().max(RUNNER_STDOUT_LINE_MAX_CHARS) }),
  z.strictObject({ type: z.literal('stderr'), data: z.string().max(RUNNER_STDOUT_LINE_MAX_CHARS) }),
  z.strictObject({
    type: z.literal('exit'),
    exitCode: z.number().int().nullable(),
    signal: z.string().max(BOUNDS.signal).nullable(),
    timedOut: z.boolean(),
    durationMs: z.number().int().nonnegative(),
  }),
  z.strictObject({
    type: z.literal('error'),
    code: z.string().max(BOUNDS.code),
    message: z.string().max(BOUNDS.message),
  }),
]);
export type ExecFrame = z.infer<typeof ExecFrame>;

/** Lượt headless: argv cố định, env chỉ có hai biến này (không vé, không token). */
export const TURN_EXEC = {
  argv: EXEC_ARGV.turn,
  envTurnId: 'GA_TURN_ID',
  envGatewayUrl: 'GA_GATEWAY_URL',
  /** Thư mục tmpfs của lượt + tệp vé + HOME native (xoá khi lượt xong). */
  turnDir: (turnId: string) => `/run/ga/${turnId}`,
  ticketFile: (turnId: string) => `/run/ga/${turnId}/ticket`,
  homeDir: (turnId: string) => `/run/ga/${turnId}/home`,
  ticketFileMode: 0o400,
  authRoot: '/auth',
  enginesRoot: ENGINES_ROOT,
} as const;

// ---------------------------------------------------------------- cài CLI (CNS-137)
// Supervisor exec EXEC_ARGV['engine-install' | 'engine-status'], stdin = EngineInstallBundle (JSON); ga-engine-install kiểm
// slug bằng enum registry của nó (runnerBundleSchemas) rồi mới dựng đường /opt/engines/<slug>/.
export const InstallEngineRequest = z.strictObject({
  container: ContainerRef,
  engineSlug: EngineSlugFormat,
  /** `fake` chỉ có ở image test (testkit) — image phát hành từ chối. */
  source: z.enum(['official', 'fake']),
});
export const EngineInstallStatusRequest = z.strictObject({ container: ContainerRef, engineSlug: EngineSlugFormat });
export const EngineInstallStatusResponse = z.strictObject({
  engineSlug: EngineSlugFormat,
  status: EngineInstallStatus,
});

// ---------------------------------------------------------------- auth-gc (§B.5 bước 8)
/**
 * Supervisor exec EXEC_ARGV['auth-gc'], stdin = AuthGcBundle. KHÔNG có danh sách tệp: runner dùng authAllowlist của adapter
 * (`'unknown'` ⇒ không xoá gì, native_memory = 'unknown', báo owner).
 */
export const AuthGcRequest = z.strictObject({
  container: ContainerRef,
  engineSlug: EngineSlugFormat,
  /** Mã tài khoản EN- (thư mục /auth/<en>). */
  engineAccount: z.string().regex(/^EN-\d{4,12}$/),
});
export const AuthGcResponse = AuthGcResult;

// ---------------------------------------------------------------- reconcile / status
export const DesiredContainer = z.strictObject({
  consumer: Consumer,
  template: ContainerTemplate,
  desired: DesiredState,
  authVolumes: z.array(AuthVolumeName).max(64),
});
export const ReconcileRequest = z.strictObject({ desired: z.array(DesiredContainer).max(BOUNDS.mediumList) });
export const ReconcileReport = z.strictObject({
  items: z
    .array(
      z.strictObject({
        container: ContainerRef,
        desired: DesiredState,
        observed: ObservedState,
        action: z.enum(['none', 'created', 'started', 'stopped', 'removed', 'failed']),
        error: z.string().max(BOUNDS.message).nullable(),
      }),
    )
    .max(BOUNDS.mediumList),
});
export const SupervisorStatus = z.strictObject({
  version: z.string().max(BOUNDS.version),
  dockerReachable: z.boolean(),
  templates: z.array(ContainerTemplate).max(BOUNDS.smallList),
  containers: z.array(z.strictObject({ container: ContainerRef, observed: ObservedState })).max(BOUNDS.mediumList),
});

/** Bề mặt RPC (ga-app gọi qua supervisor-client). Mỗi phương thức một POST dưới SUPERVISOR_RPC.basePath. */
export const SUPERVISOR_METHODS = [
  'ensureContainer',
  'start',
  'stop',
  'remove',
  'exec',
  'installEngine',
  'engineInstallStatus',
  'reconcile',
  'status',
  'authGc',
] as const;
export type SupervisorMethod = (typeof SUPERVISOR_METHODS)[number];

// ---------------------------------------------------------------- PTY đăng nhập (§A.2-3, §B.6; CNS-134)
/**
 * Vòng đời PTY đăng nhập:
 * 1. ga-app ký vé (khoá GA_TERM_TICKET_KEY, TTL 60 s, nonce dùng một lần), vé không lưu ở đâu.
 * 2. Trình duyệt mở WebSocket tới /term với vé trong `Sec-WebSocket-Protocol` — KHÔNG trong URL / path / query.
 * 3. Supervisor kiểm vé, `docker exec` Tty:true đúng `ga-runner login` (EXEC_ARGV.login) với env loginExecEnv(claims);
 *    ga-runner kiểm bundle bằng enum registry, dựng loginArgv từ adapter đóng sẵn, kiểm engineArgvViolations rồi exec
 *    (không shell). Supervisor chỉ chuyển byte, không log payload.
 * 4. Supervisor ĐÓNG exec khi: kiểm đăng nhập đạt · owner bấm "Tôi đã xong" · WebSocket đóng · hết trần thời gian.
 */
export const PTY = {
  path: '/term',
  /** Subprotocol thứ nhất là phiên bản giao thức; thứ hai mang vé (base64url). */
  protocol: 'ga-term.v1',
  ticketProtocolPrefix: 'ga-ticket.',
  ticketTtlSeconds: 60,
  /** G-26 [Gen quyết 2026-10-16]. */
  maxDurationSeconds: 600,
  loginCheckIntervalSeconds: 5,
  /** Bỏ dở quá mốc này ⇒ login_stalled (DATABASE, CONTRACT-r8d). */
  loginStalledAfterSeconds: 900,
} as const;

export const PTY_CLOSE_REASONS = ['login_ok', 'owner_done', 'ws_closed', 'max_duration'] as const;
export const PtyCloseReason = z.enum(PTY_CLOSE_REASONS);
export type PtyCloseReason = z.infer<typeof PtyCloseReason>;

/**
 * Nội dung vé (đã ký). Vé mang Ý ĐỊNH đăng nhập (slug + cách đăng nhập), KHÔNG mang argv: ga-app bị chiếm ký được vé nhưng
 * không chọn được chương trình / cờ (HIGH allowlist-semantic-escape, Gen quyết 2026-10-16).
 */
export const TermTicketClaims = z.strictObject({
  v: z.literal(2),
  /** Mã tài khoản EN- */
  acc: z.string().regex(/^EN-\d{4,12}$/),
  container: ContainerRef.shape.name,
  engineSlug: EngineSlugFormat,
  authMethod: z.enum(AUTH_METHODS),
  /** Băm phiên GUI của owner (không phải token phiên). */
  guiSessionHash: z.string().regex(/^[0-9a-f]{64}$/),
  /** epoch giây */
  exp: z.number().int().positive(),
  nonce: z.string().min(16).max(128),
});
export type TermTicketClaims = z.infer<typeof TermTicketClaims>;

/** Env của exec PTY `ga-runner login` — chỉ ba biến LOGIN_EXEC.env, giá trị từ claims đã kiểm (enum / pattern). */
export function loginExecEnv(claims: TermTicketClaims): Record<string, string> {
  return {
    [LOGIN_EXEC.env.engineSlug]: claims.engineSlug,
    [LOGIN_EXEC.env.engineAccount]: claims.acc,
    [LOGIN_EXEC.env.authMethod]: claims.authMethod,
  };
}

/** Khung điều khiển dạng text JSON trên WS (byte PTY đi bằng khung binary). */
export const PtyClientMessage = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('resize'),
    cols: z.number().int().min(1).max(1000),
    rows: z.number().int().min(1).max(1000),
  }),
  z.strictObject({ type: z.literal('owner_done') }),
]);
export const PtyServerMessage = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('opened'), maxDurationSeconds: z.number().int() }),
  z.strictObject({ type: z.literal('closed'), reason: PtyCloseReason }),
]);

/** Vé = base64url(claims) + '.' + base64url(HMAC) — chỉ ký tự hợp lệ của token HTTP. */
const TICKET_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * Dựng tham số mở WebSocket: URL không bao giờ chứa vé (không vào access log, lịch sử, HAR).
 * Trình duyệt: `new WebSocket(url, protocols)`.
 */
export function buildTermWebSocketInit(origin: string, ticket: string): { url: string; protocols: string[] } {
  if (!TICKET_RE.test(ticket)) throw new Error('vé phải gồm ký tự base64url và dấu chấm');
  const u = new URL(PTY.path, origin);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return { url: u.toString(), protocols: [PTY.protocol, `${PTY.ticketProtocolPrefix}${ticket}`] };
}

/** Phía supervisor: lấy vé từ header Sec-WebSocket-Protocol; trả null nếu thiếu / sai giao thức. */
export function extractTermTicket(secWebSocketProtocol: string | null | undefined): string | null {
  if (!secWebSocketProtocol) return null;
  const parts = secWebSocketProtocol.split(',').map((s) => s.trim());
  if (!parts.includes(PTY.protocol)) return null;
  const t = parts.find((p) => p.startsWith(PTY.ticketProtocolPrefix));
  if (!t) return null;
  const ticket = t.slice(PTY.ticketProtocolPrefix.length);
  return TICKET_RE.test(ticket) ? ticket : null;
}
