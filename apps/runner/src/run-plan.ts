import { type EngineFlagTable, EnginePlan, engineArgvViolations, type ProbeOutcome } from '@ga/contracts';
import type { RunnerAdapter } from './adapters.ts';
import { RedactingLineWriter } from './lines.ts';
import { RunnerError, type RunnerRoots } from './paths.ts';
import { buildCliEnv, type Session, type SessionFile } from './session.ts';
import { type RunCliResult, resolveCliBin, runCli } from './spawn.ts';

// Cổng cuối trước spawn (Gen quyết, HIGH allowlist-semantic-escape): plan do adapter ĐÓNG SẴN trong image dựng, runner vẫn
//   1. kiểm schema EnginePlan (contracts: tệp tương đối, env không đặt HOME, timeout ≤ 1 giờ);
//   2. chỉ chạy plan `cli` (plan `http` là GĐ2);
//   3. engineArgvViolations: argv[0] dưới /opt/engines/<slug>/, không shell / interpreter, chỉ lệnh con / cờ trong bảng đóng;
//   4. resolveCliBin: realpath của argv[0] vẫn nằm dưới /opt/engines/<slug>/, basename không bị cấm, có quyền chạy;
//   5. env: allowlist bảng adapter + chặn cứng (assertPlanEnv trong buildCliEnv).

export interface CliPlan {
  argv: string[];
  files: SessionFile[];
  env: Record<string, string>;
  timeoutMs: number;
}

export function checkPlan(raw: unknown, slug: string, table: EngineFlagTable): CliPlan {
  const parsed = EnginePlan.safeParse(raw);
  if (!parsed.success) throw new RunnerError('bad_plan', 'plan của adapter sai schema');
  const p = parsed.data;
  if (p.kind !== 'cli') throw new RunnerError('http_plan_unsupported', 'plan http chưa hỗ trợ ở MVP');
  const v = engineArgvViolations(p.argv, slug, table);
  if (v.length > 0) throw new RunnerError('argv_rejected', `argv của plan bị từ chối: ${v.slice(0, 3).join('; ')}`);
  return { argv: p.argv, files: p.files, env: p.env, timeoutMs: p.timeoutMs };
}

export interface RunOptions {
  roots: RunnerRoots;
  slug: string;
  adapter: RunnerAdapter;
  session: Session;
  plan: CliPlan;
  containerEnv: NodeJS.ProcessEnv;
  onStdoutLine?(line: string): void;
  onStderrLine?(line: string): void;
  onSpawn?(pid: number): void;
}

/** Chạy một plan trong phiên đã dựng; output đi qua bộ che theo dòng. */
export async function runPlan(o: RunOptions): Promise<RunCliResult> {
  const binPath = resolveCliBin(o.roots, o.slug, o.plan.argv[0] as string);
  const env = buildCliEnv(
    o.roots,
    o.slug,
    o.session.cliHome,
    o.session.tmp,
    o.containerEnv,
    o.plan.env,
    o.adapter.flagTable,
  );
  const out = new RedactingLineWriter((s) => o.onStdoutLine?.(s));
  const err = new RedactingLineWriter((s) => o.onStderrLine?.(s));
  const r = await runCli({
    binPath,
    argv: o.plan.argv,
    env,
    cwd: o.session.dir,
    timeoutMs: o.plan.timeoutMs,
    onStdout: (c) => out.push(c),
    onStderr: (c) => err.push(c),
    onSpawn: o.onSpawn,
  });
  out.end();
  err.end();
  return r;
}

/** Gom output đã che vào chuỗi có trần (ProbeOutcome). */
export class CappedText {
  private parts: string[] = [];
  private size = 0;
  private truncated = false;
  private readonly cap: number;
  constructor(cap = 256 * 1024) {
    this.cap = cap;
  }
  add = (s: string): void => {
    if (this.size + s.length > this.cap) {
      this.truncated = true;
      return;
    }
    this.parts.push(s);
    this.size += s.length;
  };
  toString(): string {
    return this.parts.join('') + (this.truncated ? '{"$ga":"truncated"}\n' : '');
  }
}

export function outcomeOf(r: RunCliResult, stdout: CappedText, stderr: CappedText): ProbeOutcome {
  return {
    kind: 'cli',
    exitCode: r.exitCode,
    signal: r.signal,
    stdout: stdout.toString(),
    stderr: stderr.toString(),
    timedOut: r.timedOut,
    durationMs: r.durationMs,
  };
}
