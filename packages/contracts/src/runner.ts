import { z } from 'zod';
import { NATIVE_MEMORY_POLICY, ProbeOutcome, ProbePlan, TurnPlan } from './engine.ts';

// Giao thức ga-app ↔ ga-runner (chạy TRONG container Role / hệ thống) — BUILD-PLAN §B.5, §B.7; CNS-168.
// Mọi lần chạy CLI đi qua một trong các lệnh con dưới đây, cùng một chính sách:
//   tmpfs riêng của lần chạy (/run/ga/<id>/ hoặc /run/ga/probe-<id>/) làm cwd + HOME; nối (không đọc) tệp authAllowlist từ
//   /auth/<en> vào HOME; spawn plan (stdin đóng, không TTY, timeout); xoá tmpfs; auth-gc /auth/<en> theo allowlist
//   ('unknown' ⇒ không xoá gì, native_memory = 'unknown'). Supervisor chỉ exec `ga-runner <lệnh>` / `ga-engine-install`.

const Ulid = z.string().length(26);
const EngineAccount = z.string().regex(/^EN-\d{4,}$/);
const AuthAllowlist = z.union([z.array(z.string().min(1)), z.literal('unknown')]);

export const RUNNER_COMMANDS = ['turn', 'login-check', 'probe', 'auth-gc'] as const;
export type RunnerCommand = (typeof RUNNER_COMMANDS)[number];
export const ENGINE_INSTALL_COMMANDS = ['install', 'status'] as const;

/** Bundle của một lượt: phản hồi `GET /turn/bundle` của gateway (runner gửi vé lượt đọc từ tệp tmpfs). */
export const TurnBundle = z.strictObject({
  v: z.literal(1),
  turnId: Ulid,
  sessionId: Ulid,
  engineSlug: z.string().min(1),
  engineAccount: EngineAccount,
  plan: TurnPlan,
  authAllowlist: AuthAllowlist,
  nativeMemoryPolicy: z.literal(NATIVE_MEMORY_POLICY),
  /** Hết hạn cùng vé lượt (ts DB 24 ký tự). */
  expiresAt: z.string().length(24),
});
export type TurnBundle = z.infer<typeof TurnBundle>;

export const PROBE_KINDS = ['login_check', 'capability_scan'] as const;
export type ProbeKind = (typeof PROBE_KINDS)[number];

/**
 * Bundle của một lần kiểm đăng nhập / quét khả năng — đi qua STDIN của exec (không qua env, không qua URL).
 * Không chứa bí mật: env của plan đã qua EnvMap (cấm *SESSION*, *_OAUTH_TOKEN, khoá nội bộ, HOME).
 */
export const ProbeBundle = z
  .strictObject({
    v: z.literal(1),
    probeId: Ulid,
    kind: z.enum(PROBE_KINDS),
    engineSlug: z.string().min(1),
    engineAccount: EngineAccount,
    plans: z.array(ProbePlan).min(1).max(16),
    authAllowlist: AuthAllowlist,
    expiresAt: z.string().length(24),
  })
  .refine((b) => b.kind !== 'login_check' || b.plans.length === 1, 'login_check có đúng một plan');
export type ProbeBundle = z.infer<typeof ProbeBundle>;

export const AuthGcResult = z.strictObject({
  /** Chỉ đếm, không trả tên tệp / nội dung. */
  removed: z.number().int().nonnegative(),
  nativeMemory: z.enum(['off', 'unknown']),
});
export type AuthGcResult = z.infer<typeof AuthGcResult>;

/**
 * Báo cáo cuối của ga-runner: DÒNG CUỐI của stdout, một object JSON có `$ga: 'report'` (để tách khỏi luồng JSONL của CLI).
 */
export const RunnerReport = z.discriminatedUnion('command', [
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

/** Lệnh exec + đường tmpfs cho kiểm đăng nhập / quét khả năng (tương đương TURN_EXEC của lượt). */
export const PROBE_EXEC = {
  argv: (kind: ProbeKind) => ['ga-runner', kind === 'login_check' ? 'login-check' : 'probe'] as const,
  envProbeId: 'GA_PROBE_ID',
  probeDir: (probeId: string) => `/run/ga/probe-${probeId}`,
  homeDir: (probeId: string) => `/run/ga/probe-${probeId}/home`,
} as const;
