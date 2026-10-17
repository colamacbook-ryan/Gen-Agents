import { StringDecoder } from 'node:string_decoder';
import {
  AuthGcResult,
  type Clock,
  CONTAINER_TEMPLATES,
  EngineInstallStatus,
  type EngineInstallStatusResponse,
  EXEC_ARGV,
  type ExecFrame,
  type ExecRequest,
  execEnv,
  execStdinPayload,
  parseRunnerStdout,
  RunnerReport,
} from '@ga/contracts';
import type { z } from 'zod';
import { SupervisorError } from './errors.ts';
import type { Logger } from './log.ts';
import { absoluteArgv, type ExecSpec } from './policy.ts';
import type { Broker, ContainerInfo, ExecSession } from './runtime.ts';
import {
  type BuiltContainer,
  buildConsumerContainer,
  buildInstallerContainer,
  buildVolumeInitContainer,
  consumerIdOf,
  containerNameOf,
  LABELS,
  RUNTIME_USER,
  type TemplateEnv,
} from './templates.ts';
import type { DesiredContainer, ObservedState } from './types.ts';

// Các phương thức RPC (contracts SUPERVISOR_METHODS). Supervisor không có DB: trạng thái cài CLI đang chạy giữ trong RAM,
// trạng thái bền nằm trong volume ga-engines (status.json do ga-engine-install ghi) — app ghi engine_installs bằng actor system.

export interface ServiceConfig extends TemplateEnv {
  gatewayUrl: string;
  version: string;
}

type EnsureResponse = { container: { name: string }; observed: ObservedState; rolesNetworkIp: string | null };

function viewOf(c: ContainerInfo | null, name: string, rolesNetwork: string): EnsureResponse {
  return {
    container: { name },
    observed: c ? c.state : 'absent',
    rolesNetworkIp: c?.running ? (c.networks[rolesNetwork] ?? null) : null,
  };
}

/** Chờ luồng stdout đã phát hết dữ liệu (exec kết thúc có thể tới trước sự kiện 'data' cuối). Trần 5 s. */
function drained(r: NodeJS.ReadableStream & { readableEnded?: boolean; destroyed?: boolean }): Promise<void> {
  if (r.readableEnded || r.destroyed) return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(resolve, 5000);
    const done = () => {
      clearTimeout(t);
      resolve();
    };
    r.once('end', done);
    r.once('close', done);
  });
}

/** Một lần exec nội bộ: ghi stdin, gom stdout có trần, chờ xong / hết giờ. */
export async function runCollect(
  broker: Broker,
  c: ContainerInfo,
  spec: ExecSpec,
  stdin: string | null,
  timeoutMs: number,
  onStdoutLine?: (line: string) => void,
): Promise<{ stdout: string; exitCode: number | null; timedOut: boolean }> {
  const s = await broker.exec(c, spec);
  if (stdin !== null) s.write(stdin);
  let stdout = '';
  let partial = '';
  const dec = new StringDecoder('utf8');
  s.stdout.on('data', (b: Buffer) => {
    const t = dec.write(b);
    if (stdout.length < 1_048_576) stdout += t;
    if (onStdoutLine) {
      partial += t;
      let nl = partial.indexOf('\n');
      while (nl >= 0) {
        onStdoutLine(partial.slice(0, nl));
        partial = partial.slice(nl + 1);
        nl = partial.indexOf('\n');
      }
    }
  });
  s.stderr?.resume();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    s.destroy();
  }, timeoutMs);
  await s.done;
  await drained(s.stdout);
  clearTimeout(timer);
  const i = timedOut ? { exitCode: null } : await s.inspect();
  return { stdout, exitCode: i.exitCode, timedOut };
}

export class SupervisorService {
  readonly broker: Broker;
  private readonly cfg: ServiceConfig;
  private readonly log: Logger;
  private readonly clock: Clock;
  /** Lần cài đang chạy (theo slug): trạng thái gần nhất. */
  private readonly installing = new Map<string, z.infer<typeof EngineInstallStatus>>();

  constructor(broker: Broker, cfg: ServiceConfig, log: Logger, clock: Clock) {
    this.broker = broker;
    this.cfg = cfg;
    this.log = log;
    this.clock = clock;
  }

  // ---------------------------------------------------------------- volume
  /** Tạo volume nếu chưa có rồi gieo quyền sở hữu uid 10001 bằng copy-up (container volume-init.v1 không chạy). */
  async ensureSeededVolume(name: string, kind: 'auth' | 'engines'): Promise<void> {
    await this.broker.rt.ensureVolume(name, { [LABELS.managedBy]: 'ga-supervisor', 'genagents.volume': kind });
    const init = buildVolumeInitContainer(name, kind, this.cfg);
    const stale = await this.broker.findManaged(init.name);
    if (stale) await this.broker.remove(stale);
    const id = await this.broker.create(init.name, init.body);
    await this.broker.rt.removeContainer(id);
  }

  // ---------------------------------------------------------------- container
  private async createFrom(built: BuiltContainer, authVolumes: readonly string[]): Promise<ContainerInfo> {
    for (const v of authVolumes) await this.ensureSeededVolume(v, 'auth');
    await this.ensureSeededVolume(this.cfg.enginesVolume, 'engines');
    await this.broker.create(built.name, built.body);
    return this.broker.resolveManaged(built.name);
  }

  /** Dựng (hoặc dựng lại khi lệch mẫu / mount) container của consumer. Không start. */
  async ensureContainer(req: {
    consumer: Parameters<typeof containerNameOf>[0];
    template: string;
    authVolumes: string[];
  }): Promise<{ response: EnsureResponse; action: 'none' | 'created' }> {
    const built = buildConsumerContainer(req.template, req.consumer, req.authVolumes, this.cfg);
    const existing = await this.broker.findManaged(built.name);
    if (existing) {
      if (existing.labels[LABELS.consumer] !== consumerIdOf(req.consumer)) {
        throw new SupervisorError('name_conflict', 'container trùng tên thuộc consumer khác');
      }
      if (existing.labels[LABELS.specHash] === built.specHash) {
        return { response: viewOf(existing, built.name, this.cfg.rolesNetwork), action: 'none' };
      }
      // lệch mẫu / mount (vd gỡ binding ⇒ gỡ mount ở lần đối soát — DATABASE §9.5 bước 8): dựng lại
      this.log.log('info', 'recreate_drift', { container: built.name });
      await this.broker.remove(existing);
    }
    const c = await this.createFrom(built, req.authVolumes);
    return { response: viewOf(c, built.name, this.cfg.rolesNetwork), action: 'created' };
  }

  async start(name: string): Promise<EnsureResponse> {
    const c = await this.broker.resolveManaged(name);
    await this.broker.start(c);
    return viewOf(await this.broker.resolveManaged(name), name, this.cfg.rolesNetwork);
  }
  async stop(name: string): Promise<EnsureResponse> {
    const c = await this.broker.resolveManaged(name);
    await this.broker.stop(c);
    return viewOf(await this.broker.resolveManaged(name), name, this.cfg.rolesNetwork);
  }
  async remove(name: string): Promise<EnsureResponse> {
    const c = await this.broker.resolveManaged(name);
    await this.broker.remove(c);
    return viewOf(null, name, this.cfg.rolesNetwork);
  }

  async reconcile(desired: readonly DesiredContainer[]) {
    const items = [];
    for (const d of desired) {
      let name = '?';
      try {
        name = containerNameOf(d.consumer);
        let action: 'none' | 'created' | 'started' | 'stopped' | 'removed' = 'none';
        if (d.desired === 'absent') {
          const c = await this.broker.findManaged(name);
          if (c) {
            await this.broker.remove(c);
            action = 'removed';
          }
          items.push({ container: { name }, desired: d.desired, observed: 'absent' as const, action, error: null });
          continue;
        }
        const r = await this.ensureContainer({
          consumer: d.consumer,
          template: d.template,
          authVolumes: d.authVolumes,
        });
        action = r.action;
        let c = await this.broker.resolveManaged(name);
        if (d.desired === 'running' && !c.running) {
          await this.broker.start(c);
          action = action === 'created' ? 'created' : 'started';
          c = await this.broker.resolveManaged(name);
        } else if (d.desired === 'stopped' && c.running) {
          await this.broker.stop(c);
          action = 'stopped';
          c = await this.broker.resolveManaged(name);
        }
        // 'sleeping': chỉ cần tồn tại; không dừng container đang chạy (có thể đang có lượt)
        items.push({ container: { name }, desired: d.desired, observed: c.state, action, error: null });
      } catch (e) {
        const code = e instanceof SupervisorError ? e.code : 'internal';
        items.push({
          container: { name: /^ga-(role|sys)-[A-Za-z0-9-]+$/.test(name) ? name : 'ga-sys-invalid' },
          desired: d.desired,
          observed: 'unknown' as const,
          action: 'failed' as const,
          error: code,
        });
      }
    }
    return { items };
  }

  async status() {
    const dockerReachable = await this.broker.rt.ping();
    const containers = dockerReachable
      ? (await this.broker.listManaged())
          .filter((c) => (CONTAINER_TEMPLATES as readonly string[]).includes(c.labels[LABELS.template] ?? ''))
          .map((c) => ({ container: { name: c.name }, observed: c.state }))
      : [];
    return { version: this.cfg.version, dockerReachable, templates: [...CONTAINER_TEMPLATES], containers };
  }

  // ---------------------------------------------------------------- exec lượt / kiểm đăng nhập / quét khả năng
  /**
   * argv = EXEC_ARGV[lệnh] (ga-app không chọn được chương trình), env = execEnv(run, gatewayUrl của SUPERVISOR), stdin = vé /
   * bundle + '\n'. Khung NDJSON ExecFrame; stdout đã che ở ga-runner.
   */
  async exec(req: ExecRequest, emit: (f: ExecFrame) => void, abort: AbortSignal): Promise<void> {
    const c = await this.broker.resolveManaged(req.container.name);
    const env = execEnv(req.run, this.cfg.gatewayUrl);
    const spec: ExecSpec = {
      Cmd: absoluteArgv(EXEC_ARGV[req.run.command]),
      Env: Object.entries(env).map(([k, v]) => `${k}=${v}`),
      User: RUNTIME_USER,
      Tty: false,
      Privileged: false,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: '/',
    };
    const started = this.clock.now().getTime();
    const s: ExecSession = await this.broker.exec(c, spec);
    s.write(`${execStdinPayload(req.run)}\n`);
    const out = new StringDecoder('utf8');
    const err = new StringDecoder('utf8');
    // giữ stdout để kiểm giao thức của runner (parseRunnerStdout) khi xong; quá trần ⇒ coi là lỗi giao thức
    const MAX_KEEP = 64 * 1024 * 1024;
    let kept = '';
    let overflow = false;
    s.stdout.on('data', (b: Buffer) => {
      const data = out.write(b);
      if (!data) return;
      if (!overflow && kept.length + data.length <= MAX_KEEP) kept += data;
      else overflow = true;
      emit({ type: 'stdout', data });
    });
    s.stderr?.on('data', (b: Buffer) => {
      const data = err.write(b);
      if (data) emit({ type: 'stderr', data });
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      s.destroy();
    }, req.timeoutMs);
    const onAbort = () => s.destroy();
    abort.addEventListener('abort', onAbort);
    await s.done;
    await drained(s.stdout);
    clearTimeout(timer);
    abort.removeEventListener('abort', onAbort);
    let exitCode: number | null = null;
    if (!timedOut && !abort.aborted) {
      try {
        exitCode = (await s.inspect()).exitCode;
      } catch {
        exitCode = null;
      }
    }
    // Bên đọc chỉ tin stdout qua parseRunnerStdout (contracts, fail-closed): đúng MỘT report ở dòng cuối, mọi dòng khác là
    // `line` do runner bọc. Lệch ⇒ khung error `runner_protocol_error` TRƯỚC khung exit — ga-app coi lượt là thất bại.
    kept += out.end();
    const lines = kept.endsWith('\n') ? kept.slice(0, -1).split('\n') : kept.length ? kept.split('\n') : [];
    const p = overflow ? null : parseRunnerStdout(lines);
    if (!p?.ok) {
      const reason = p && !p.ok ? p.reason : 'stdout quá trần';
      this.log.log('warn', 'runner_protocol_error', { container: c.name, command: req.run.command, reason });
      emit({ type: 'error', code: 'runner_protocol_error', message: reason });
    } else if (p.report.command === 'error') {
      // runner báo lỗi có mã (contracts RUNNER_ERROR_CODES) ⇒ khung error mang ĐÚNG mã đó trước exit — ga-app coi lượt thất bại
      this.log.log('warn', 'runner_error', { container: c.name, command: req.run.command, code: p.report.code });
      emit({ type: 'error', code: p.report.code, message: p.report.message });
    }
    emit({
      type: 'exit',
      exitCode,
      signal: null,
      timedOut,
      durationMs: Math.max(0, this.clock.now().getTime() - started),
    });
  }

  // ---------------------------------------------------------------- auth-gc
  async authGc(req: { container: { name: string }; engineSlug: string; engineAccount: string }) {
    const c = await this.broker.resolveManaged(req.container.name);
    if (!c.mounts.some((m) => m.destination === `/auth/${req.engineAccount}` && m.rw)) {
      throw new SupervisorError('bad_request', 'container không mount /auth của tài khoản này');
    }
    const r = await runCollect(
      this.broker,
      c,
      this.internalSpec(EXEC_ARGV['auth-gc']),
      `${JSON.stringify({ v: 2, engineSlug: req.engineSlug, engineAccount: req.engineAccount })}\n`,
      60_000,
    );
    // auth-gc không chạy CLI ⇒ stdout phải là ĐÚNG MỘT dòng AuthGcResult ở dạng JSON chuẩn (không lấy "dòng cuối" tuỳ ý)
    const lines = r.stdout.endsWith('\n') ? r.stdout.slice(0, -1).split('\n') : [r.stdout];
    let parsed: unknown = null;
    try {
      parsed = lines.length === 1 ? JSON.parse(lines[0] as string) : null;
    } catch {
      parsed = null;
    }
    if (parsed === null || JSON.stringify(parsed) !== lines[0]) {
      throw new SupervisorError('internal', 'ga-runner auth-gc không trả kết quả hợp lệ');
    }
    const failed = RunnerReport.safeParse(parsed);
    if (failed.success && failed.data.command === 'error') {
      throw new SupervisorError('internal', `ga-runner auth-gc lỗi: ${failed.data.code}`);
    }
    const res = AuthGcResult.safeParse(parsed);
    if (r.exitCode !== 0 || !res.success) throw new SupervisorError('internal', 'ga-runner auth-gc thất bại');
    return res.data;
  }

  internalSpec(argv: readonly [string, string], env: Record<string, string> = {}, tty = false): ExecSpec {
    return {
      Cmd: absoluteArgv(argv),
      Env: Object.entries(env).map(([k, v]) => `${k}=${v}`),
      User: RUNTIME_USER,
      Tty: tty,
      Privileged: false,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: '/',
    };
  }

  // ---------------------------------------------------------------- cài CLI
  /**
   * Cài trong container RIÊNG (engine-install.v1: ga-engines RW — chỗ duy nhất; container Role / hệ thống mount chỉ đọc).
   * `container` của yêu cầu phải là container do supervisor quản (ngữ cảnh consumer). Mỗi slug một lần cài cùng lúc.
   */
  async installEngine(
    req: { container: { name: string }; engineSlug: string; source: 'official' | 'fake' },
    emit: (s: z.infer<typeof EngineInstallStatusResponse>) => void,
  ): Promise<z.infer<typeof EngineInstallStatus>> {
    await this.broker.resolveManaged(req.container.name);
    if (req.source === 'fake' && !this.cfg.fakeEngineSourceUrl) {
      throw new SupervisorError('bad_request', 'nguồn fake chỉ có ở bản test');
    }
    const slug = req.engineSlug;
    const running = this.installing.get(slug);
    if (running) {
      emit({ engineSlug: slug, status: running });
      return running;
    }
    const set = (s: z.infer<typeof EngineInstallStatus>) => {
      this.installing.set(slug, s);
      emit({ engineSlug: slug, status: s });
    };
    set({ state: 'installing', progressPct: 0, version: null });
    let final: z.infer<typeof EngineInstallStatus> = {
      state: 'failed',
      reason: 'unknown',
      detail: 'trình cài không trả kết quả',
    };
    let installer: ContainerInfo | null = null;
    try {
      await this.ensureSeededVolume(this.cfg.enginesVolume, 'engines');
      const built = buildInstallerContainer(slug, this.cfg);
      const stale = await this.broker.findManaged(built.name);
      if (stale) await this.broker.remove(stale);
      await this.broker.create(built.name, built.body);
      installer = await this.broker.resolveManaged(built.name);
      await this.broker.start(installer);
      installer = await this.broker.resolveManaged(built.name);
      const r = await runCollect(
        this.broker,
        installer,
        this.internalSpec(EXEC_ARGV['engine-install']),
        `${JSON.stringify({ v: 2, engineSlug: slug, source: req.source })}\n`,
        30 * 60_000,
        (line) => {
          let v: unknown;
          try {
            v = JSON.parse(line);
          } catch {
            return;
          }
          const p = EngineInstallStatus.safeParse(v);
          if (!p.success) return;
          if (p.data.state === 'installing') set(p.data);
          else final = p.data;
        },
      );
      if (r.timedOut) final = { state: 'failed', reason: 'network', detail: 'cài quá 30 phút' };
    } catch (e) {
      final = { state: 'failed', reason: 'unknown', detail: e instanceof SupervisorError ? e.code : 'lỗi supervisor' };
    } finally {
      if (installer) {
        try {
          await this.broker.remove(installer);
        } catch {
          this.log.log('warn', 'installer_remove_failed', { engineSlug: slug });
        }
      }
      this.installing.delete(slug);
    }
    emit({ engineSlug: slug, status: final });
    this.log.log('info', 'engine_install', { engineSlug: slug, state: final.state });
    return final;
  }

  async engineInstallStatus(req: { container: { name: string }; engineSlug: string }) {
    const running = this.installing.get(req.engineSlug);
    if (running) return { engineSlug: req.engineSlug, status: running };
    const c = await this.broker.resolveManaged(req.container.name);
    if (!c.running) throw new SupervisorError('container_not_running', 'container chưa chạy');
    const r = await runCollect(
      this.broker,
      c,
      this.internalSpec(EXEC_ARGV['engine-status']),
      `${JSON.stringify({ v: 2, engineSlug: req.engineSlug, source: 'official' })}\n`,
      30_000,
    );
    const line = r.stdout.trim().split('\n').at(-1) ?? '';
    let v: unknown;
    try {
      v = JSON.parse(line);
    } catch {
      v = null;
    }
    const p = EngineInstallStatus.safeParse(v);
    if (!p.success) throw new SupervisorError('internal', 'ga-engine-install status không trả kết quả hợp lệ');
    return { engineSlug: req.engineSlug, status: p.data };
  }
}
