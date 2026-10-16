import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import {
  AuthGcResult,
  LOGIN_EXEC,
  PROBE_EXEC,
  type ProbeOutcome,
  runnerBundleSchemas,
  runnerReportLine,
  runnerStdoutLine,
  ULID_RE,
} from '@ga/contracts';
import { type AdapterRegistry, requireAdapter } from './adapters.ts';
import { authGc } from './auth-gc.ts';
import { writeNewFileInside } from './fsutil.ts';
import { getText } from './http.ts';
import { isTurnTicket, RunnerError, type RunnerRoots, TICKET_FILE_MODE, TURN_ENV } from './paths.ts';
import { EXIT_RUNNER_ERROR, emitError, exitCodeOf } from './report.ts';
import { CappedText, checkPlan, outcomeOf, runPlan } from './run-plan.ts';
import { createSessionDir, finishSession, prepareSession, type Session, type SessionFile } from './session.ts';
import { readFirstLine } from './stdin.ts';

// Lệnh của ga-runner (contracts RUNNER_COMMANDS). Bundle = Ý ĐỊNH có schema đóng (slug là enum của registry trong image);
// argv / env / tệp do adapter dựng TRONG runner (Gen quyết, HIGH allowlist-semantic-escape).
// Báo cáo cuối = DÒNG CUỐI của stdout, contracts RunnerReport (`$ga: 'report'`).

export interface RunnerIo {
  env: NodeJS.ProcessEnv;
  stdin: Readable;
  stdout: Writable;
  stderr: Writable;
  now(): Date;
}

export interface RunnerContext {
  roots: RunnerRoots;
  registry: AdapterRegistry;
  io: RunnerIo;
}

const BUNDLE_MAX_BYTES = 9 * 1024 * 1024;

function schemasOf(ctx: RunnerContext) {
  return runnerBundleSchemas(ctx.registry.slugs);
}

function parseWith<T>(
  schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } },
  raw: string,
  what: string,
): T {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    throw new RunnerError('bad_bundle', `${what} không phải JSON`);
  }
  const r = schema.safeParse(v);
  if (!r.success)
    throw new RunnerError('bad_bundle', `${what} sai schema (trường lạ / slug ngoài registry / giá trị sai mẫu)`);
  return r.data;
}

function assertNotExpired(expiresAt: string, now: Date): void {
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t) || t <= now.getTime()) throw new RunnerError('bundle_expired', 'bundle đã hết hạn');
}

// Giao thức stdout (contracts, phương án B — output-injection): MỌI dòng là JSON do runner dựng — `{"$ga":"line","l":…}` bọc
// dòng CLI đã che, hoặc report (đúng một, dòng cuối). Lỗi trước khi có report ⇒ KHÔNG in report (bên đọc fail-closed qua
// parseRunnerStdout: thiếu report = runner_protocol_error); chi tiết lỗi ở stderr (`ga_runner` event).
function writeReport(io: RunnerIo, report: Parameters<typeof runnerReportLine>[0]): void {
  io.stdout.write(`${runnerReportLine(report)}\n`);
}

/** Dòng CLI (đã che, kết thúc '\n') ⇒ một dòng `line` của giao thức. */
function wrapCliLine(io: RunnerIo): (s: string) => void {
  return (s) => io.stdout.write(`${runnerStdoutLine(s.endsWith('\n') ? s.slice(0, -1) : s)}\n`);
}

/** Dọn phiên khi lỗi giữa chừng: vẫn chép ngược + xoá tmpfs + auth-gc; tối thiểu xoá thư mục (vé). */
export function cleanupOnError(roots: RunnerRoots, session: Session | null, dir: string | null, io: RunnerIo): void {
  if (session) {
    try {
      finishSession(roots, session);
    } catch (e) {
      emitError(io.stderr, e);
    }
  } else if (dir) {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- turn
export async function cmdTurn(ctx: RunnerContext): Promise<number> {
  const { roots, io } = ctx;
  let dir: string | null = null;
  let session: Session | null = null;
  try {
    const turnId = io.env[TURN_ENV.turnId] ?? '';
    const gatewayUrl = io.env[TURN_ENV.gatewayUrl] ?? '';
    if (!ULID_RE.test(turnId)) throw new RunnerError('bad_turn_id', `${TURN_ENV.turnId} không hợp lệ`);
    if (!/^https?:\/\/[A-Za-z0-9.-]{1,253}(:[0-9]{1,5})?$/.test(gatewayUrl)) {
      throw new RunnerError('bad_gateway_url', `${TURN_ENV.gatewayUrl} không hợp lệ`);
    }
    const ticket = await readFirstLine(io.stdin, 1024, 10_000);
    if (!isTurnTicket(ticket)) throw new RunnerError('bad_ticket', 'vé lượt không hợp lệ');
    dir = createSessionDir(roots, turnId);
    writeNewFileInside(dir, 'ticket', ticket, TICKET_FILE_MODE);

    const res = await getText(
      `${gatewayUrl}/turn/bundle`,
      { authorization: `Bearer ${ticket}`, accept: 'application/json' },
      { timeoutMs: 15_000, maxBytes: BUNDLE_MAX_BYTES },
    );
    if (res.status !== 200) throw new RunnerError('bundle_rejected', `gateway trả ${res.status} cho gói lượt`);
    const b = parseWith(schemasOf(ctx).TurnBundle, res.body, 'TurnBundle');
    if (b.turnId !== turnId) throw new RunnerError('bad_bundle', 'turnId của bundle lệch env');
    assertNotExpired(b.expiresAt, io.now());
    const adapter = requireAdapter(ctx.registry, b.engineSlug);

    // tệp prompt: dưới /run/ga/<lượt>/prompt/ (schema đã chặn đường thoát ra)
    const promptFile = writeNewFileInside(dir, `prompt/${b.prompt.user.path}`, b.prompt.user.content, 0o400);
    const systemFile = b.prompt.system
      ? writeNewFileInside(dir, `prompt/${b.prompt.system.path}`, b.prompt.system.content, 0o400)
      : null;
    const plan = checkPlan(
      adapter.turnPlan({
        turnId,
        prompt: b.prompt.user.content,
        promptFile,
        systemPrompt: b.prompt.system?.content ?? null,
        systemPromptFile: systemFile,
        model: b.params.model,
        effort: b.params.effort,
        gatewayUrl,
        turnDir: dir,
        homeDir: join(dir, 'home'),
        ticketFile: join(dir, 'ticket'),
        authDir: join(roots.auth, b.engineAccount),
      }),
      b.engineSlug,
      adapter.flagTable,
    );
    plan.timeoutMs = Math.min(plan.timeoutMs, b.timeoutMs);
    session = prepareSession(roots, dir, b.engineAccount, adapter.authAllowlist, plan.files);
    const sessionDir = dir;
    const r = await runPlan({
      roots,
      slug: b.engineSlug,
      adapter,
      session,
      plan,
      containerEnv: io.env,
      onStdoutLine: wrapCliLine(io),
      onStderrLine: (s) => io.stderr.write(s),
      onSpawn: (pid) => writeNewFileInside(sessionDir, 'pid', String(pid), 0o600),
    });
    const s = session;
    session = null;
    dir = null;
    const end = finishSession(roots, s);
    writeReport(io, {
      $ga: 'report',
      command: 'turn',
      turnId,
      exit: { exitCode: r.exitCode, signal: r.signal, timedOut: r.timedOut, durationMs: r.durationMs },
      authGc: end.gc,
    });
    return exitCodeOf(r);
  } catch (e) {
    emitError(io.stderr, e);
    return EXIT_RUNNER_ERROR;
  } finally {
    cleanupOnError(roots, session, dir, io);
  }
}

// ---------------------------------------------------------------- login-check | probe
export async function cmdProbe(ctx: RunnerContext, command: 'login-check' | 'probe'): Promise<number> {
  const { roots, io } = ctx;
  let dir: string | null = null;
  let session: Session | null = null;
  try {
    const raw = await readFirstLine(io.stdin, 256 * 1024, 10_000);
    const b = parseWith(schemasOf(ctx).ProbeBundle, raw, 'ProbeBundle');
    const wantOp = command === 'login-check' ? 'login_check' : 'probe:capability_scan';
    if (b.op !== wantOp) throw new RunnerError('bad_bundle', `bundle ${b.op} không khớp lệnh ${command}`);
    if (io.env[PROBE_EXEC.envProbeId] !== b.probeId) throw new RunnerError('bad_bundle', 'probeId lệch env');
    assertNotExpired(b.expiresAt, io.now());
    const adapter = requireAdapter(ctx.registry, b.engineSlug);

    dir = createSessionDir(roots, `probe-${b.probeId}`);
    const base = {
      probeId: b.probeId,
      probeDir: dir,
      homeDir: join(dir, 'home'),
      authDir: join(roots.auth, b.engineAccount),
    };
    const rawPlans: unknown[] =
      b.op === 'login_check'
        ? [adapter.loginCheck({ ...base, authMethod: b.authMethod }).plan]
        : [...adapter.capabilityScan({ ...base, authMode: b.authMode })];
    if (rawPlans.length < 1 || rawPlans.length > 16)
      throw new RunnerError('bad_plan', 'số plan của adapter ngoài 1..16');
    const plans = rawPlans.map((p) => checkPlan(p, b.engineSlug, adapter.flagTable));
    // tệp của mọi plan ghi một lần, trùng đường mà khác nội dung ⇒ lỗi
    const files = new Map<string, SessionFile>();
    for (const f of plans.flatMap((p) => p.files)) {
      const prev = files.get(f.path);
      if (prev && (prev.content !== f.content || prev.mode !== f.mode))
        throw new RunnerError('bad_plan', 'hai plan ghi cùng tệp');
      files.set(f.path, f);
    }
    session = prepareSession(roots, dir, b.engineAccount, adapter.authAllowlist, [...files.values()]);
    const outcomes: ProbeOutcome[] = [];
    for (const plan of plans) {
      const so = new CappedText();
      const se = new CappedText();
      const r = await runPlan({
        roots,
        slug: b.engineSlug,
        adapter,
        session,
        plan,
        containerEnv: io.env,
        onStdoutLine: so.add,
        onStderrLine: se.add,
      });
      outcomes.push(outcomeOf(r, so, se));
    }
    const s = session;
    session = null;
    dir = null;
    const end = finishSession(roots, s);
    writeReport(io, { $ga: 'report', command, probeId: b.probeId, outcomes, authGc: end.gc });
    return 0;
  } catch (e) {
    emitError(io.stderr, e);
    return EXIT_RUNNER_ERROR;
  } finally {
    cleanupOnError(roots, session, dir, io);
  }
}

// ---------------------------------------------------------------- auth-gc
export async function cmdAuthGc(ctx: RunnerContext): Promise<number> {
  const { roots, io } = ctx;
  try {
    const raw = await readFirstLine(io.stdin, 4096, 10_000);
    const b = parseWith(schemasOf(ctx).AuthGcBundle, raw, 'AuthGcBundle');
    const adapter = requireAdapter(ctx.registry, b.engineSlug);
    // allowlist CỦA ADAPTER — ga-app không gửi danh sách tệp
    const r = AuthGcResult.parse(authGc(roots, b.engineAccount, adapter.authAllowlist));
    io.stdout.write(`${JSON.stringify(r)}\n`);
    return 0;
  } catch (e) {
    emitError(io.stderr, e);
    return EXIT_RUNNER_ERROR;
  }
}

// ---------------------------------------------------------------- login (PTY) — chuẩn bị; vòng đời ở login.ts
export function parseLoginEnv(ctx: RunnerContext) {
  const env = ctx.io.env;
  const raw = JSON.stringify({
    v: 2,
    engineSlug: env[LOGIN_EXEC.env.engineSlug] ?? '',
    engineAccount: env[LOGIN_EXEC.env.engineAccount] ?? '',
    authMethod: env[LOGIN_EXEC.env.authMethod] ?? '',
  });
  return parseWith(schemasOf(ctx).LoginBundle, raw, 'LoginBundle');
}

export function newRunId(): string {
  return randomBytes(12).toString('hex');
}
