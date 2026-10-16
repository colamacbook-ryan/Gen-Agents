import { z } from 'zod';
import { EngineInstallStatus, EnvMap } from './engine.ts';

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

/** Chương trình exec được phép ngoài argv đăng nhập lấy từ vé đã ký (§B.3). */
export const EXEC_ALLOWLIST = ['ga-runner', 'ga-engine-install'] as const;

export const Consumer = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('role'), roleId: z.string().length(26), roleDisplayId: z.string() }),
  z.strictObject({ kind: z.literal('sys'), workspaceId: z.string().length(26), workspaceCode: z.string().length(4) }),
]);
export type Consumer = z.infer<typeof Consumer>;

export const ContainerRef = z.strictObject({ name: z.string().regex(/^ga-(role|sys)-[A-Za-z0-9-]+$/) });
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
  authVolumes: z.array(z.string().regex(/^ga-auth-en-[a-z0-9-]{1,48}$/)),
});
export const EnsureContainerResponse = z.strictObject({
  container: ContainerRef,
  observed: ObservedState,
  /** IP trên mạng ga-roles — gateway kiểm IP nguồn của vé lượt (§B.3). */
  rolesNetworkIp: z.string().nullable(),
});

// ---------------------------------------------------------------- exec (lượt headless, cài CLI, auth-gc)
/**
 * stdin của exec: vé lượt đi qua STDIN rồi ga-runner ghi vào /run/ga/<lượt>/ticket (0400) — không qua env vì env của exec
 * đọc được qua Docker API (CNS-142). `none` = stdin đóng ngay.
 */
export const ExecStdin = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({ kind: z.literal('turn-ticket'), ticket: z.string().min(43) }),
]);

export const ExecRequest = z.strictObject({
  container: ContainerRef,
  /** argv[0] phải thuộc EXEC_ALLOWLIST (supervisor ép). */
  argv: z
    .array(z.string().min(1))
    .min(1)
    .refine((a) => (EXEC_ALLOWLIST as readonly string[]).includes(a[0] ?? ''), 'argv[0] ngoài allowlist exec'),
  env: EnvMap,
  stdin: ExecStdin,
  timeoutMs: z.number().int().positive().max(3_600_000),
});
export type ExecRequest = z.infer<typeof ExecRequest>;

/** Khung NDJSON trả về từ POST /rpc/v1/exec (luồng). stdout đã đi qua bộ lọc che bí mật ở ga-runner. */
export const ExecFrame = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('stdout'), data: z.string() }),
  z.strictObject({ type: z.literal('stderr'), data: z.string() }),
  z.strictObject({
    type: z.literal('exit'),
    exitCode: z.number().int().nullable(),
    signal: z.string().nullable(),
    timedOut: z.boolean(),
    durationMs: z.number().int().nonnegative(),
  }),
  z.strictObject({ type: z.literal('error'), code: z.string(), message: z.string() }),
]);
export type ExecFrame = z.infer<typeof ExecFrame>;

/** Lượt headless: argv cố định, env chỉ có hai biến này (không vé, không token). */
export const TURN_EXEC = {
  argv: ['ga-runner', 'turn'] as const,
  envTurnId: 'GA_TURN_ID',
  envGatewayUrl: 'GA_GATEWAY_URL',
  /** Thư mục tmpfs của lượt + tệp vé + HOME native (xoá khi lượt xong). */
  turnDir: (turnId: string) => `/run/ga/${turnId}`,
  ticketFile: (turnId: string) => `/run/ga/${turnId}/ticket`,
  homeDir: (turnId: string) => `/run/ga/${turnId}/home`,
  ticketFileMode: 0o400,
  authRoot: '/auth',
  enginesRoot: '/opt/engines',
} as const;

// ---------------------------------------------------------------- cài CLI (CNS-137)
export const InstallEngineRequest = z.strictObject({
  container: ContainerRef,
  engineSlug: z.string().min(1),
  /** `fake` chỉ có ở image test (testkit) — image phát hành từ chối. */
  source: z.enum(['official', 'fake']),
});
export const EngineInstallStatusRequest = z.strictObject({ container: ContainerRef, engineSlug: z.string().min(1) });
export const EngineInstallStatusResponse = z.strictObject({ engineSlug: z.string(), status: EngineInstallStatus });

// ---------------------------------------------------------------- auth-gc (§B.5 bước 8)
export const AuthGcRequest = z.strictObject({
  container: ContainerRef,
  /** Mã tài khoản EN- (thư mục /auth/<en>). */
  engineAccount: z.string().regex(/^EN-\d{4,}$/),
  /** 'unknown' ⇒ không xoá gì, native_memory = 'unknown', báo owner. */
  allowlist: z.union([z.array(z.string().min(1)), z.literal('unknown')]),
});
export const AuthGcResponse = z.strictObject({
  /** Số mục đã xoá (chỉ đếm, không trả tên tệp / nội dung). */
  removed: z.number().int().nonnegative(),
  nativeMemory: z.enum(['off', 'unknown']),
});

// ---------------------------------------------------------------- reconcile / status
export const DesiredContainer = z.strictObject({
  consumer: Consumer,
  template: ContainerTemplate,
  desired: DesiredState,
  authVolumes: z.array(z.string()),
});
export const ReconcileRequest = z.strictObject({ desired: z.array(DesiredContainer) });
export const ReconcileReport = z.strictObject({
  items: z.array(
    z.strictObject({
      container: ContainerRef,
      desired: DesiredState,
      observed: ObservedState,
      action: z.enum(['none', 'created', 'started', 'stopped', 'removed', 'failed']),
      error: z.string().nullable(),
    }),
  ),
});
export const SupervisorStatus = z.strictObject({
  version: z.string(),
  dockerReachable: z.boolean(),
  templates: z.array(ContainerTemplate),
  containers: z.array(z.strictObject({ container: ContainerRef, observed: ObservedState })),
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
 * 3. Supervisor kiểm vé, `docker exec` Tty:true đúng argv đăng nhập (không shell), chỉ chuyển byte, không log payload.
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

/** Nội dung vé (đã ký). argv đăng nhập do adapter dựng và nằm TRONG vé — supervisor không nhận argv từ trình duyệt. */
export const TermTicketClaims = z.strictObject({
  v: z.literal(1),
  /** Mã tài khoản EN- */
  acc: z.string().regex(/^EN-\d{4,}$/),
  container: ContainerRef.shape.name,
  argvLogin: z.array(z.string().min(1)).min(1),
  /** Băm phiên GUI của owner (không phải token phiên). */
  guiSessionHash: z.string().regex(/^[0-9a-f]{64}$/),
  /** epoch giây */
  exp: z.number().int().positive(),
  nonce: z.string().min(16),
});
export type TermTicketClaims = z.infer<typeof TermTicketClaims>;

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
