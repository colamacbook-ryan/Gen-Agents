// CNS-168: kiểm đăng nhập / quét khả năng đi qua `ga-runner login-check | probe` (HOME tmpfs + auth-gc như `turn`);
// adapter chỉ trả EnginePlan (cli | http); supervisor chỉ exec ga-runner / ga-engine-install; bundle có schema.
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  type EngineAdapter,
  ExecRequest,
  isAllowedExecArgv,
  PROBE_EXEC,
  ProbeBundle,
  type ProbePlan,
  RunnerReport,
  TURN_EXEC,
  TurnBundle,
} from '../src/index.ts';

const ULID = '01JABCDEFGHJKMNPQRSTVWXYZ0';
const TS = '2026-10-14T08:00:00.000Z';
const cliPlan = { kind: 'cli', files: [], argv: ['vendor-cli', 'auth', 'status'], env: {}, timeoutMs: 10_000 } as const;
const bundle = (kind: 'login_check' | 'capability_scan', plans: unknown[] = [cliPlan]) => ({
  v: 1,
  probeId: ULID,
  kind,
  engineSlug: 'x',
  engineAccount: 'EN-0001',
  plans,
  authAllowlist: ['credentials.json'],
  expiresAt: TS,
});
const exec = (argv: string[], stdin: unknown) => ({
  container: { name: 'ga-sys-7k2q' },
  argv,
  env: { [PROBE_EXEC.envProbeId]: ULID },
  stdin,
  timeoutMs: 30_000,
});

describe('exec allowlist: chỉ ga-runner <lệnh> / ga-engine-install <lệnh>', () => {
  it('CLI thô, shell, lệnh runner lạ ⇒ từ chối', () => {
    for (const argv of [
      ['vendor-cli', 'auth', 'status'],
      ['sh', '-c', 'id'],
      ['ga-runner', 'sh'],
      ['ga-runner'],
      ['ga-engine-install', 'rm'],
    ]) {
      expect(isAllowedExecArgv(argv), argv.join(' ')).toBe(false);
    }
    for (const argv of [
      ['ga-runner', 'turn'],
      ['ga-runner', 'login-check'],
      ['ga-runner', 'probe'],
      ['ga-runner', 'auth-gc', 'EN-0001'],
      ['ga-engine-install', 'status'],
    ]) {
      expect(isAllowedExecArgv(argv), argv.join(' ')).toBe(true);
    }
  });

  it('login-check / probe nhận bundle qua stdin, đúng loại; turn nhận vé; lệnh khác không có stdin', () => {
    expect(
      ExecRequest.safeParse(
        exec([...PROBE_EXEC.argv('login_check')], { kind: 'probe-bundle', bundle: bundle('login_check') }),
      ).success,
    ).toBe(true);
    expect(
      ExecRequest.safeParse(
        exec([...PROBE_EXEC.argv('capability_scan')], {
          kind: 'probe-bundle',
          bundle: bundle('capability_scan', [cliPlan, cliPlan]),
        }),
      ).success,
    ).toBe(true);
    // lệch loại
    expect(
      ExecRequest.safeParse(
        exec(['ga-runner', 'login-check'], { kind: 'probe-bundle', bundle: bundle('capability_scan') }),
      ).success,
    ).toBe(false);
    // login-check không có bundle
    expect(ExecRequest.safeParse(exec(['ga-runner', 'login-check'], { kind: 'none' })).success).toBe(false);
    // turn phải có vé
    expect(ExecRequest.safeParse(exec([...TURN_EXEC.argv], { kind: 'none' })).success).toBe(false);
    // auth-gc không có stdin
    expect(ExecRequest.safeParse(exec(['ga-runner', 'auth-gc', 'EN-0001'], { kind: 'none' })).success).toBe(true);
  });
});

describe('ProbeBundle / TurnBundle / RunnerReport', () => {
  it('login_check đúng một plan; env của plan qua EnvMap (cấm *SESSION*, HOME do runner đặt)', () => {
    expect(ProbeBundle.safeParse(bundle('login_check', [cliPlan, cliPlan])).success).toBe(false);
    expect(ProbeBundle.safeParse(bundle('login_check', [{ ...cliPlan, env: { APP_SESSION: 'x' } }])).success).toBe(
      false,
    );
    expect(ProbeBundle.safeParse(bundle('login_check', [{ ...cliPlan, env: { HOME: '/root' } }])).success).toBe(false);
    const http = {
      kind: 'http',
      endpoint: 'http://engine.local/v1/whoami',
      request: { method: 'POST', headers: {}, body: '{}' },
      timeoutMs: 5000,
    };
    expect(ProbeBundle.safeParse(bundle('capability_scan', [http])).success).toBe(true);
  });

  it('TurnBundle = plan + id + allowlist + chính sách tmpfs-per-turn + hạn', () => {
    const tb = {
      v: 1,
      turnId: ULID,
      sessionId: ULID,
      engineSlug: 'x',
      engineAccount: 'EN-0002',
      plan: cliPlan,
      authAllowlist: 'unknown',
      nativeMemoryPolicy: 'tmpfs-per-turn',
      expiresAt: TS,
    };
    expect(TurnBundle.safeParse(tb).success).toBe(true);
    expect(TurnBundle.safeParse({ ...tb, nativeMemoryPolicy: 'resume' }).success).toBe(false);
    expect(TurnBundle.safeParse({ ...tb, ticket: 'x' }).success).toBe(false);
  });

  it('báo cáo cuối của runner có auth-gc; login-check đúng một kết quả', () => {
    const outcome = {
      kind: 'cli',
      exitCode: 0,
      signal: null,
      stdout: '{"loggedIn":true}',
      stderr: '',
      timedOut: false,
      durationMs: 120,
    };
    const authGc = { removed: 2, nativeMemory: 'off' };
    expect(
      RunnerReport.safeParse({ $ga: 'report', command: 'login-check', probeId: ULID, outcomes: [outcome], authGc })
        .success,
    ).toBe(true);
    expect(
      RunnerReport.safeParse({
        $ga: 'report',
        command: 'login-check',
        probeId: ULID,
        outcomes: [outcome, outcome],
        authGc,
      }).success,
    ).toBe(false);
    expect(
      RunnerReport.safeParse({
        $ga: 'report',
        command: 'probe',
        probeId: ULID,
        outcomes: [outcome],
        authGc: { removed: 0, nativeMemory: 'unknown' },
      }).success,
    ).toBe(true);
  });

  it('đường tmpfs của lần kiểm tách khỏi lượt', () => {
    expect(PROBE_EXEC.homeDir(ULID)).toBe(`/run/ga/probe-${ULID}/home`);
    expect(PROBE_EXEC.homeDir(ULID)).not.toBe(TURN_EXEC.homeDir(ULID));
  });

  it('adapter trả ProbePlan (cli | http) cho kiểm đăng nhập / quét khả năng, không còn lệnh exec thô', () => {
    expectTypeOf<ReturnType<EngineAdapter['loginCheck']>['plan']>().toEqualTypeOf<ProbePlan>();
    expectTypeOf<ReturnType<EngineAdapter['capabilityScan']>>().toEqualTypeOf<readonly ProbePlan[]>();
  });
});
