// CNS-168 + HIGH allowlist-semantic-escape (Gen quyết 2026-10-16): bundle chỉ mang Ý ĐỊNH có schema đóng (không argv / lệnh
// / env / danh sách tệp); ga-runner tự dựng argv từ adapter đóng sẵn và kiểm bằng engineArgvViolations trước khi spawn.
import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import {
  AuthGcBundle,
  AuthGcRequest,
  CapabilityScanBundle,
  type EngineAdapter,
  type EngineFlagTable,
  EngineInstallBundle,
  EngineInstallStatusRequest,
  EnginePlan,
  EXEC_ARGV,
  ExecRequest,
  ExecRun,
  engineArgvViolations,
  engineEnvViolations,
  execEnv,
  execStdinPayload,
  FORBIDDEN_ARGV0_NAMES,
  InstallEngineRequest,
  isAllowedExecArgv,
  isForbiddenArgv0Name,
  isForbiddenRuntimeEnvName,
  isSafeEngineArgv0,
  isSafePromptPath,
  LoginBundle,
  LoginCheckBundle,
  MAX_ENGINE_ARGV,
  MAX_ENGINE_ENV_VALUE,
  PROBE_EXEC,
  PROBE_KINDS,
  ProbeBundle,
  type ProbePlan,
  parseRunnerStdout,
  promptDir,
  RUNNER_CLI_LINE_MAX_CHARS,
  RUNNER_OPS,
  RUNNER_STDOUT_LINE_MAX_CHARS,
  RunnerReport,
  runnerBundleSchemas,
  runnerReportLine,
  runnerStdoutLine,
  TermTicketClaims,
  TURN_EXEC,
  TurnBundle,
  type TurnPlanInput,
  TurnStreamEvent,
} from '../src/index.ts';

const ULID = '01JABCDEFGHJKMNPQRSTVWXYZ0';
const TS = '2026-10-14T08:00:00.000Z';
const SLUGS = ['alpha', 'beta'] as const;
const strict = runnerBundleSchemas(SLUGS);

const turn = (over: Record<string, unknown> = {}) => ({
  v: 2,
  op: 'turn',
  turnId: ULID,
  sessionId: ULID,
  engineSlug: 'alpha',
  engineAccount: 'EN-0002',
  params: { model: 'vendor-model-4.5', effort: 'high' },
  authMethod: 'subscription',
  detectedFlags: ['--model', '--effort', '-p'],
  prompt: { user: { path: 'user.md', content: 'xin chào' }, system: { path: 'system.md', content: 'quy tắc' } },
  timeoutMs: 600_000,
  measure: null,
  nativeMemoryPolicy: 'tmpfs-per-turn',
  expiresAt: TS,
  ...over,
});
const loginCheck = (over: Record<string, unknown> = {}) => ({
  v: 2,
  op: 'login_check',
  probeId: ULID,
  engineSlug: 'alpha',
  engineAccount: 'EN-0001',
  authMethod: 'subscription',
  expiresAt: TS,
  ...over,
});
const capScan = (over: Record<string, unknown> = {}) => ({
  v: 2,
  op: 'probe:capability_scan',
  probeId: ULID,
  engineSlug: 'alpha',
  engineAccount: 'EN-0001',
  authMode: 'oauth',
  expiresAt: TS,
  ...over,
});
const req = (run: unknown, over: Record<string, unknown> = {}) => ({
  container: { name: 'ga-sys-7k2q' },
  run,
  timeoutMs: 30_000,
  ...over,
});

describe('exec allowlist: argv cố định theo lệnh, đúng hai phần tử', () => {
  it('mọi dòng EXEC_ARGV được phép; CLI thô, shell, lệnh lạ, đối số thêm ⇒ từ chối', () => {
    for (const argv of Object.values(EXEC_ARGV)) expect(isAllowedExecArgv(argv), argv.join(' ')).toBe(true);
    for (const argv of [
      ['vendor-cli', 'auth', 'status'],
      ['sh', '-c', 'id'],
      ['ga-runner', 'sh'],
      ['ga-runner'],
      ['ga-runner', 'turn', '--evil'],
      ['ga-runner', 'auth-gc', 'EN-0001'],
      ['ga-engine-install', 'rm'],
      ['ga-engine-install', 'turn'],
      ['/usr/bin/ga-runner', 'turn'],
    ]) {
      expect(isAllowedExecArgv(argv), argv.join(' ')).toBe(false);
    }
  });

  it('ExecRequest: ga-app chọn lệnh trong enum + bundle đúng loại; không argv, không env, không lệnh lạ', () => {
    expect(ExecRequest.safeParse(req({ command: 'login-check', bundle: loginCheck() })).success).toBe(true);
    expect(ExecRequest.safeParse(req({ command: 'probe', bundle: capScan() })).success).toBe(true);
    // lệch loại bundle ↔ lệnh
    expect(ExecRequest.safeParse(req({ command: 'login-check', bundle: capScan() })).success).toBe(false);
    expect(ExecRequest.safeParse(req({ command: 'probe', bundle: loginCheck() })).success).toBe(false);
    // lệnh ngoài enum (auth-gc / install có RPC riêng; login chỉ qua PTY)
    for (const command of ['auth-gc', 'login', 'engine-install', 'sh']) {
      expect(ExecRequest.safeParse(req({ command, bundle: loginCheck() })).success, command).toBe(false);
    }
    // ga-app không gửi được argv / env / stdin tự do
    const ok = { command: 'probe', bundle: capScan() };
    expect(ExecRequest.safeParse(req(ok, { argv: ['ga-runner', 'probe'] })).success).toBe(false);
    expect(ExecRequest.safeParse(req(ok, { env: { NODE_OPTIONS: '--require /tmp/x.js' } })).success).toBe(false);
    expect(ExecRequest.safeParse(req(ok, { stdin: { kind: 'none' } })).success).toBe(false);
  });

  it('env do supervisor đặt là tập đóng; stdin = JSON bundle parse lại được', () => {
    const run = ExecRun.parse({ command: 'probe', bundle: capScan() });
    expect(execEnv(run, 'http://gw')).toEqual({ [PROBE_EXEC.envProbeId]: ULID });
    expect(CapabilityScanBundle.parse(JSON.parse(execStdinPayload(run)))).toEqual(capScan());
  });

  it('auth-gc / cài CLI: không danh sách tệp, slug đúng định dạng (chặn ../)', () => {
    const c = { name: 'ga-role-rl-0001' };
    expect(AuthGcRequest.safeParse({ container: c, engineSlug: 'alpha', engineAccount: 'EN-0001' }).success).toBe(true);
    expect(
      AuthGcRequest.safeParse({ container: c, engineSlug: 'alpha', engineAccount: 'EN-0001', allowlist: ['a'] })
        .success,
    ).toBe(false);
    for (const engineSlug of ['../x', 'x/y', 'X', '', '-x', 'a'.repeat(33)]) {
      expect(InstallEngineRequest.safeParse({ container: c, engineSlug, source: 'official' }).success, engineSlug).toBe(
        false,
      );
      expect(EngineInstallStatusRequest.safeParse({ container: c, engineSlug }).success, engineSlug).toBe(false);
    }
  });
});

describe('bundle = ý định có schema đóng', () => {
  it('bundle hợp lệ ở cả mức chuyển tiếp lẫn mức enum', () => {
    for (const s of [{ TurnBundle, ProbeBundle }, strict]) {
      expect(s.TurnBundle.safeParse(turn()).success).toBe(true);
      expect(s.ProbeBundle.safeParse(loginCheck()).success).toBe(true);
      expect(s.ProbeBundle.safeParse(capScan()).success).toBe(true);
    }
    expect(
      TurnBundle.safeParse(
        turn({ params: { model: null, effort: null }, prompt: { user: { path: 'u', content: '' }, system: null } }),
      ).success,
    ).toBe(true);
  });

  it('trường lạ bị từ chối (strict) — argv / plan / authAllowlist / env / ticket / cmd', () => {
    const extras = {
      argv: ['/bin/sh', '-c', 'id'],
      plan: { kind: 'cli', files: [], argv: ['x'], env: {}, timeoutMs: 1 },
      plans: [],
      authAllowlist: ['../../etc/shadow'],
      env: { LD_PRELOAD: '/tmp/x.so' },
      ticket: 'x'.repeat(43),
      cmd: 'id',
    };
    for (const [k, v] of Object.entries(extras)) {
      expect(TurnBundle.safeParse(turn({ [k]: v })).success, `turn.${k}`).toBe(false);
      expect(ProbeBundle.safeParse(loginCheck({ [k]: v })).success, `login_check.${k}`).toBe(false);
      expect(ProbeBundle.safeParse(capScan({ [k]: v })).success, `capability_scan.${k}`).toBe(false);
      expect(strict.TurnBundle.safeParse(turn({ [k]: v })).success, `strict turn.${k}`).toBe(false);
    }
    expect(TurnBundle.safeParse(turn({ params: { model: null, effort: null, flags: ['--x'] } })).success).toBe(false);
    expect(TurnBundle.safeParse(turn({ v: 1 })).success).toBe(false);
    // detectedFlags: chỉ tên cờ hợp lệ, ≤ 256 phần tử; authMethod enum
    for (const f of ['--x=1', 'a b', '--', 'model', '-', '--a;b', `--${'a'.repeat(64)}`]) {
      expect(TurnBundle.safeParse(turn({ detectedFlags: [f] })).success, f).toBe(false);
    }
    expect(TurnBundle.safeParse(turn({ detectedFlags: Array.from({ length: 257 }, () => '--x') })).success).toBe(false);
    expect(TurnBundle.safeParse(turn({ detectedFlags: [] })).success).toBe(true);
    expect(TurnBundle.safeParse(turn({ authMethod: 'password' })).success).toBe(false);
    // phiên đo: enum đóng (CNS-178); thiếu trường measure ⇒ từ chối
    expect(TurnBundle.safeParse(turn({ measure: 'overhead_bare' })).success).toBe(true);
    expect(TurnBundle.safeParse(turn({ measure: '--bare' })).success).toBe(false);
    const { measure: _m, ...noMeasure } = turn();
    expect(TurnBundle.safeParse(noMeasure).success).toBe(false);
    expect(ProbeBundle.safeParse(loginCheck({ op: 'probe:shell' })).success).toBe(false);
    expect(ProbeBundle.safeParse(loginCheck({ authMethod: 'password' })).success).toBe(false);
  });

  it('engineSlug ngoài enum registry ⇒ từ chối ở mức enum (mức chuyển tiếp chỉ kiểm định dạng)', () => {
    expect(strict.TurnBundle.safeParse(turn({ engineSlug: 'gamma' })).success).toBe(false);
    expect(strict.ProbeBundle.safeParse(loginCheck({ engineSlug: 'gamma' })).success).toBe(false);
    expect(strict.ProbeBundle.safeParse(capScan({ engineSlug: 'gamma' })).success).toBe(false);
    for (const s of [strict.AuthGcBundle, AuthGcBundle]) {
      expect(s.safeParse({ v: 2, engineSlug: '../alpha', engineAccount: 'EN-0001' }).success).toBe(false);
    }
    expect(strict.AuthGcBundle.safeParse({ v: 2, engineSlug: 'gamma', engineAccount: 'EN-0001' }).success).toBe(false);
    expect(strict.EngineInstallBundle.safeParse({ v: 2, engineSlug: 'gamma', source: 'official' }).success).toBe(false);
    expect(EngineInstallBundle.safeParse({ v: 2, engineSlug: 'gamma', source: 'official' }).success).toBe(true);
    expect(
      strict.LoginBundle.safeParse({ v: 2, engineSlug: 'gamma', engineAccount: 'EN-0001', authMethod: 'api_key' })
        .success,
    ).toBe(false);
    expect(TurnBundle.safeParse(turn({ engineSlug: 'gamma' })).success).toBe(true);
    for (const engineSlug of ['../x', 'Alpha', 'a b', '', 'a/b']) {
      expect(TurnBundle.safeParse(turn({ engineSlug })).success, engineSlug).toBe(false);
    }
    // registry hỏng ⇒ fail-closed khi khởi tạo
    expect(() => runnerBundleSchemas([])).toThrow();
    expect(() => runnerBundleSchemas(['alpha', 'alpha'])).toThrow();
    expect(() => runnerBundleSchemas(['../x'])).toThrow();
  });

  it('model / effort có ký tự lạ hoặc dạng cờ ⇒ từ chối', () => {
    const badModels = [
      '--model',
      '-m',
      '--dangerously-skip-permissions',
      'a b',
      'a;id',
      'a$(id)',
      'a`id`',
      'a\nb',
      'a=b',
      "a'b",
      '',
      'x'.repeat(97),
      '.hidden',
      '/abs',
      // hậu tố [..] chỉ dạng hẹp ở cuối
      'a[',
      'a[]',
      'a[x y]',
      'a]',
      'a[1M]',
      'a[123456789]',
      'a[1m][2m]',
      'a[1m]x',
      '[1m]',
      'a[--x]',
    ];
    for (const model of badModels) {
      expect(TurnBundle.safeParse(turn({ params: { model, effort: null } })).success, JSON.stringify(model)).toBe(
        false,
      );
    }
    for (const effort of ['--high', '-h', 'HIGH', 'hi gh', 'high;id', '', 'x'.repeat(17), '1high']) {
      expect(TurnBundle.safeParse(turn({ params: { model: null, effort } })).success, JSON.stringify(effort)).toBe(
        false,
      );
    }
    for (const model of [
      'vendor-model-4.5',
      'models/x-1',
      'q3:32b',
      'A1',
      'model-x[1m]',
      `${'m'.repeat(96)}[12345678]`,
    ]) {
      expect(TurnBundle.safeParse(turn({ params: { model, effort: 'xhigh' } })).success, model).toBe(true);
    }
  });

  it('tệp prompt thoát khỏi thư mục prompt của tmpfs ⇒ từ chối', () => {
    const bad = [
      '..',
      '../ticket',
      'a/../../ticket',
      '/etc/passwd',
      '/run/ga/x/ticket',
      './x',
      '.',
      'a//b',
      'a/',
      '-x',
      '.hidden',
      'a\\..\\b',
      'a/b/c/d/e',
      '',
      `${'a'.repeat(64)}x`,
    ];
    for (const path of bad) {
      expect(isSafePromptPath(path), JSON.stringify(path)).toBe(false);
      expect(
        TurnBundle.safeParse(turn({ prompt: { user: { path, content: 'x' }, system: null } })).success,
        JSON.stringify(path),
      ).toBe(false);
    }
    for (const path of ['user.md', 'ctx/part-1.md', 'a/b/c/d.txt']) expect(isSafePromptPath(path), path).toBe(true);
    // user / system trùng tệp
    expect(
      TurnBundle.safeParse(
        turn({ prompt: { user: { path: 'p.md', content: 'a' }, system: { path: 'p.md', content: 'b' } } }),
      ).success,
    ).toBe(false);
    expect(promptDir(ULID)).toBe(`/run/ga/${ULID}/prompt`);
    expect(promptDir(ULID).startsWith(TURN_EXEC.turnDir(ULID))).toBe(true);
    expect(promptDir(ULID)).not.toBe(TURN_EXEC.homeDir(ULID));
  });

  it('loại thao tác: turn | login_check | probe:<kind>', () => {
    expect([...RUNNER_OPS]).toEqual(['turn', 'login_check', ...PROBE_KINDS.map((k) => `probe:${k}`)]);
  });
});

describe('argv do runner dựng: argv[0] dưới /opt/engines/<slug>/, cấm shell / interpreter, cờ trong bảng đóng', () => {
  const table: EngineFlagTable = {
    subcommands: ['auth', 'status'],
    flags: { '--model': 'value', '--effort': 'value', '--json': 'switch', '-p': 'value' },
    // adapter khai cả biến nguy hiểm: vẫn phải bị chặn cứng
    env: ['NO_COLOR', 'VENDOR_CONFIG_DIR', 'LD_PRELOAD', 'NODE_OPTIONS', 'PATH', 'PYTHONPATH', 'BASH_ENV'],
  };
  const BIN = '/opt/engines/alpha/current/vendor-cli';

  it('argv[0] là shell / interpreter / ngoài volume engine / sai slug ⇒ từ chối', () => {
    const bad = [
      '/bin/sh',
      'sh',
      'bash',
      '/usr/bin/env',
      '/opt/engines/alpha/current/bash',
      '/opt/engines/alpha/current/sh',
      '/opt/engines/alpha/bin/python3.12',
      '/opt/engines/alpha/current/node',
      '/opt/engines/alpha/current/NODE22',
      '/opt/engines/alpha/current/env',
      '/opt/engines/alpha/current/busybox',
      '/opt/engines/alpha/../../bin/sh',
      '/opt/engines/alpha/./vendor-cli',
      '/opt/engines/alpha/',
      '/opt/engines/alpha//vendor-cli',
      '/opt/engines/alpha/-vendor-cli',
      '/opt/engines/beta/current/vendor-cli',
      '/opt/engines/alphax/vendor-cli',
      'opt/engines/alpha/vendor-cli',
    ];
    for (const a0 of bad) {
      expect(isSafeEngineArgv0(a0, 'alpha'), a0).toBe(false);
      expect(engineArgvViolations([a0, '--json'], 'alpha', table).length, a0).toBeGreaterThan(0);
    }
    expect(isSafeEngineArgv0(BIN, '../alpha')).toBe(false);
    expect(isSafeEngineArgv0(BIN, 'alpha')).toBe(true);
    for (const n of ['sh', 'bash5', 'python3', 'python3.12', 'Node', 'nodejs', 'perl5.36', 'xargs', 'env']) {
      expect(isForbiddenArgv0Name(n), n).toBe(true);
    }
    for (const n of ['vendor-cli', 'shell-tool', 'nodex', 'envoy']) expect(isForbiddenArgv0Name(n), n).toBe(false);
  });

  it('danh sách cấm chung ⊇ danh sách gốc của runner (L-RT 2b19a58); mỗi tên bổ sung bị isSafeEngineArgv0 chặn', () => {
    // fixture = FORBIDDEN_ARGV0 của apps/runner/src/paths.ts @ 2b19a58 (feat/m1-rt) — không sửa, chỉ thêm
    const RUNNER_2B19A58 = [
      'sh',
      'bash',
      'dash',
      'ash',
      'zsh',
      'ksh',
      'mksh',
      'csh',
      'tcsh',
      'fish',
      'busybox',
      'toybox',
      'env',
      'node',
      'nodejs',
      'deno',
      'bun',
      'python',
      'python2',
      'python3',
      'perl',
      'ruby',
      'php',
      'lua',
      'tclsh',
      'wish',
      'awk',
      'gawk',
      'mawk',
      'nawk',
      'sed',
      'xargs',
      'find',
      'script',
      'expect',
      'su',
      'sudo',
      'doas',
      'nohup',
      'timeout',
      'nice',
      'ionice',
      'setsid',
      'stdbuf',
      'chroot',
      'unshare',
      'nsenter',
      'strace',
      'gdb',
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
    ];
    expect(RUNNER_2B19A58.filter((n) => !FORBIDDEN_ARGV0_NAMES.has(n))).toEqual([]);
    for (const n of RUNNER_2B19A58) {
      expect(isForbiddenArgv0Name(n), n).toBe(true);
      expect(isSafeEngineArgv0(`/opt/engines/alpha/current/${n}`, 'alpha'), n).toBe(false);
    }
    const added = [
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
    ];
    for (const n of added) {
      expect(isSafeEngineArgv0(`/opt/engines/alpha/bin/${n}`, 'alpha'), n).toBe(false);
      expect(engineArgvViolations([`/opt/engines/alpha/bin/${n}`], 'alpha', table).length, n).toBeGreaterThan(0);
    }
    // mọi chương trình của hệ (ga-*) đều cấm, kể cả tên mới
    expect(isForbiddenArgv0Name('ga-supervisor')).toBe(true);
    expect(isForbiddenArgv0Name('curl8')).toBe(true);
  });

  it('chỉ cờ / lệnh con trong bảng; giá trị không dạng cờ; toán hạng không bắt đầu bằng -', () => {
    expect(engineArgvViolations([BIN, 'auth', 'status', '--json'], 'alpha', table)).toEqual([]);
    expect(engineArgvViolations([BIN, '--model', 'm-1', '--effort=high', '-p', 'xin chào'], 'alpha', table)).toEqual(
      [],
    );
    const bad: string[][] = [
      [BIN, '--dangerously-skip-permissions'],
      [BIN, '--json=1'],
      [BIN, '--model='],
      [BIN, '--model'],
      [BIN, '--model', '--json'],
      [BIN, '-p', '-x'],
      [BIN, 'prompt', '-e'],
      [BIN, '--json', 'auth', '--settings', '{}'],
      [BIN, 'x\0y'],
      [BIN, ...Array.from({ length: MAX_ENGINE_ARGV }, () => 'x')],
    ];
    for (const argv of bad) {
      expect(engineArgvViolations(argv, 'alpha', table).length, JSON.stringify(argv.slice(0, 4))).toBeGreaterThan(0);
    }
    // lỗi không lộ giá trị đối số (có thể là prompt)
    expect(engineArgvViolations([BIN, '-p', 'BÍ-MẬT', '--nope'], 'alpha', table).join(' ')).not.toContain('BÍ-MẬT');
    expect(engineArgvViolations([], 'alpha', table)).toEqual(['argv rỗng']);
  });

  it('env: chỉ biến trong bảng env của adapter; nhóm loader / interpreter / runner tự đặt / bí mật chặn cứng', () => {
    expect(engineEnvViolations({ NO_COLOR: '1', VENDOR_CONFIG_DIR: '/run/ga/x/home/.cfg' }, table)).toEqual([]);
    const blocked = [
      'LD_PRELOAD',
      'LD_LIBRARY_PATH',
      'LD_AUDIT',
      'DYLD_INSERT_LIBRARIES',
      'NODE_OPTIONS',
      'NODE_PATH',
      'NODE_EXTRA_CA_CERTS',
      'PYTHONPATH',
      'PYTHONSTARTUP',
      'PERL5OPT',
      'RUBYOPT',
      'BASH_ENV',
      'ENV',
      'BASH_FUNC_X%%',
      'JAVA_TOOL_OPTIONS',
      '_JAVA_OPTIONS',
      'GIT_SSH_COMMAND',
      'GCONV_PATH',
      'GLIBC_TUNABLES',
      'PATH',
      'HOME',
      'SHELL',
      'EDITOR',
      'PAGER',
      'SSL_CERT_FILE',
      'HTTPS_PROXY',
      'XDG_CONFIG_HOME',
      'APP_SESSION',
      'X_OAUTH_TOKEN',
      'UNDECLARED_VAR',
      'lower_case',
    ];
    for (const name of blocked) {
      expect(engineEnvViolations({ [name]: 'v' }, table).length, name).toBeGreaterThan(0);
    }
    for (const name of ['LD_PRELOAD', 'NODE_OPTIONS', 'PATH', 'PYTHONPATH', 'BASH_ENV', 'ld_preload']) {
      expect(isForbiddenRuntimeEnvName(name), name).toBe(true);
    }
    expect(isForbiddenRuntimeEnvName('NO_COLOR')).toBe(false);
    expect(engineEnvViolations({ NO_COLOR: 'a\0b' }, table).length).toBe(1);
    expect(engineEnvViolations({ NO_COLOR: 'x'.repeat(MAX_ENGINE_ENV_VALUE + 1) }, table).length).toBe(1);
    expect(engineEnvViolations({ LD_PRELOAD: 'BÍ-MẬT.so' }, table).join(' ')).not.toContain('BÍ-MẬT');
    // schema của plan cũng chặn cứng (lớp thứ hai)
    for (const name of ['LD_PRELOAD', 'NODE_OPTIONS', 'PATH', 'HOME', 'PYTHONPATH']) {
      const plan = { kind: 'cli', files: [], argv: ['/opt/engines/alpha/x'], env: { [name]: 'v' }, timeoutMs: 1 };
      expect(EnginePlan.safeParse(plan).success, name).toBe(false);
    }
    expect(
      EnginePlan.safeParse({ kind: 'cli', files: [], argv: ['x'], env: { NO_COLOR: '1' }, timeoutMs: 1 }).success,
    ).toBe(true);
  });

  it('adapter: parseStreamLine trả mảng; TurnPlanInput có timeoutMs / authMethod / detectedFlags', () => {
    expectTypeOf<ReturnType<EngineAdapter['parseStreamLine']>>().toEqualTypeOf<readonly TurnStreamEvent[]>();
    expectTypeOf<TurnPlanInput['timeoutMs']>().toEqualTypeOf<number>();
    expectTypeOf<TurnPlanInput['authMethod']>().toEqualTypeOf<'subscription' | 'api_key' | 'adc'>();
    expectTypeOf<TurnPlanInput['detectedFlags']>().toEqualTypeOf<readonly string[]>();
    expect(
      TurnStreamEvent.safeParse({
        type: 'quota',
        quota: { window: 'five_hour', status: 'rejected', resetAt: TS, utilizationPct: null },
      }).success,
    ).toBe(true);
    expect(
      TurnStreamEvent.safeParse({
        type: 'quota',
        quota: { window: '5h', status: 'rejected', resetAt: null, utilizationPct: null },
      }).success,
    ).toBe(false);
  });

  it('adapter khai bảng cờ; turnPlan / loginCheck / capabilityScan trả ProbePlan (chạy trong runner)', () => {
    expectTypeOf<EngineAdapter['flagTable']>().toEqualTypeOf<EngineFlagTable>();
    expectTypeOf<ReturnType<EngineAdapter['loginCheck']>['plan']>().toEqualTypeOf<ProbePlan>();
    expectTypeOf<ReturnType<EngineAdapter['capabilityScan']>>().toEqualTypeOf<readonly ProbePlan[]>();
  });
});

// ---------------------------------------------------------------- hợp đồng: không schema bundle nào mang lệnh
type ZodDef = { type: string } & Record<string, unknown>;
const defOf = (s: unknown): ZodDef => (s as { _zod: { def: ZodDef } })._zod.def;
const COMMANDISH_KEY_RE =
  /^(?:argv\w*|cmd\w*|args|arguments|shell|program|binary|plans?|exec\w*|allowlist|authAllowlist)$/i;
const LEAF_TYPES = new Set(['string', 'number', 'int', 'boolean', 'literal', 'enum', 'null', 'never', 'bigint']);
/**
 * Ngoại lệ CÓ CHỦ ĐÍCH (duyệt từng đường): mảng chuỗi chỉ được phép ở đây và phần tử phải là chuỗi có regex neo ^…$ + max.
 * `detectedFlags`: cờ đã quét, chỉ làm cổng — không bao giờ vào argv (contracts engine.ts TurnPlanInput.detectedFlags).
 */
const ALLOWED_STRING_ARRAYS = new Set(['$.detectedFlags']);
const isAnchoredStrictString = (s: unknown): boolean => {
  const checks = (defOf(s).checks ?? []) as Array<{
    _zod: { def: { check: string; format?: string; pattern?: RegExp } };
  }>;
  const re = checks.find((c) => c._zod.def.format === 'regex')?._zod.def.pattern;
  return (
    defOf(s).type === 'string' &&
    re !== undefined &&
    re.source.startsWith('^') &&
    re.source.endsWith('$') &&
    checks.some((c) => c._zod.def.check === 'max_length')
  );
};

/**
 * Đường của mọi trường "mang lệnh": tên kiểu argv / cmd / args…, MẢNG CHUỖI ở bất kỳ đâu, record tự do (env). Kiểu zod
 * chưa biết ⇒ ném lỗi (fail-closed: wrapper mới của zod không được lọt qua im lặng).
 */
function commandLikeFields(schema: unknown, path = '$', seen = new Set<unknown>()): string[] {
  if (seen.has(schema)) return [];
  seen.add(schema);
  const def = defOf(schema);
  const walk = (s: unknown, p: string) => commandLikeFields(s, p, seen);
  if (LEAF_TYPES.has(def.type)) return [];
  switch (def.type) {
    case 'object': {
      const out: string[] = [];
      for (const [k, v] of Object.entries(def.shape as Record<string, unknown>)) {
        if (COMMANDISH_KEY_RE.test(k)) out.push(`${path}.${k}`);
        out.push(...walk(v, `${path}.${k}`));
      }
      if (def.catchall !== undefined) out.push(...walk(def.catchall, `${path}.*`));
      return out;
    }
    case 'array': {
      let el = def.element;
      while (['nullable', 'optional', 'readonly', 'default'].includes(defOf(el).type)) el = defOf(el).innerType;
      if (defOf(el).type === 'string') {
        return ALLOWED_STRING_ARRAYS.has(path) && isAnchoredStrictString(el) ? [] : [`${path}[] (mảng chuỗi)`];
      }
      return walk(def.element, `${path}[]`);
    }
    case 'tuple':
      return [
        ...(def.items as unknown[]).flatMap((s, i) => walk(s, `${path}[${i}]`)),
        ...(def.rest ? walk(def.rest, `${path}[...]`) : []),
      ];
    case 'record':
      return [`${path} (record tự do)`];
    case 'union':
      return (def.options as unknown[]).flatMap((s, i) => walk(s, `${path}|${i}`));
    case 'intersection':
      return [...walk(def.left, path), ...walk(def.right, path)];
    case 'nullable':
    case 'optional':
    case 'readonly':
    case 'default':
    case 'prefault':
    case 'nonoptional':
    case 'catch':
      return walk(def.innerType, path);
    case 'pipe':
      return [...walk(def.in, path), ...walk(def.out, path)];
    case 'lazy':
      return walk((def.getter as () => unknown)(), path);
    default:
      throw new Error(`walker chưa hỗ trợ kiểu zod "${def.type}" ở ${path}`);
  }
}

describe('hợp đồng: không schema bundle / yêu cầu runner nào có argv / cmd / args / mảng chuỗi / env tự do', () => {
  const schemas: Record<string, unknown> = {
    TurnBundle,
    LoginCheckBundle,
    CapabilityScanBundle,
    ProbeBundle,
    AuthGcBundle,
    EngineInstallBundle,
    LoginBundle,
    ...Object.fromEntries(Object.entries(strict).map(([k, v]) => [`strict.${k}`, v])),
    ExecRun,
    ExecRequest,
    AuthGcRequest,
    InstallEngineRequest,
    EngineInstallStatusRequest,
    TermTicketClaims,
  };
  for (const [name, schema] of Object.entries(schemas)) {
    it(name, () => {
      expect(commandLikeFields(schema)).toEqual([]);
    });
  }

  it('walker không rỗng: bắt được hình bundle cũ (plan.argv, env, allowlist) qua union / nullable / lazy / pipe', () => {
    const oldBundle = z.strictObject({
      plans: z.array(EnginePlan),
      authAllowlist: z.union([z.array(z.string().min(1)), z.literal('unknown')]),
    });
    const found = commandLikeFields(oldBundle);
    expect(found).toEqual(expect.arrayContaining(['$.plans', '$.authAllowlist', '$.authAllowlist|0[] (mảng chuỗi)']));
    expect(found.some((p) => p.endsWith('.argv'))).toBe(true);
    expect(found.some((p) => p.endsWith('.env (record tự do)'))).toBe(true);
    expect(commandLikeFields(z.strictObject({ x: z.array(z.string().min(1)).nullable().optional() }))).toEqual([
      '$.x[] (mảng chuỗi)',
    ]);
    expect(commandLikeFields(z.strictObject({ y: z.lazy(() => z.strictObject({ cmd: z.string() })) }))).toEqual([
      '$.y.cmd',
    ]);
    expect(commandLikeFields(z.strictObject({ files: z.array(z.string().nullable()) }))).toEqual([
      '$.files[] (mảng chuỗi)',
    ]);
    expect(
      commandLikeFields(
        z
          .array(z.string())
          .pipe(z.array(z.string().min(1)))
          .optional(),
      ),
    ).toEqual(['$[] (mảng chuỗi)', '$[] (mảng chuỗi)']);
    expect(() => commandLikeFields(z.date())).toThrow(/walker chưa hỗ trợ/);
    // ngoại lệ detectedFlags chỉ đúng đường + đúng dạng: chuỗi tự do / regex không neo / đường khác ⇒ vẫn bị bắt
    expect(commandLikeFields(z.strictObject({ detectedFlags: z.array(z.string()) }))).toEqual([
      '$.detectedFlags[] (mảng chuỗi)',
    ]);
    expect(commandLikeFields(z.strictObject({ detectedFlags: z.array(z.string().max(9).regex(/--x/)) }))).toEqual([
      '$.detectedFlags[] (mảng chuỗi)',
    ]);
    expect(commandLikeFields(z.strictObject({ flags: z.array(z.string().max(9).regex(/^--x$/)) }))).toEqual([
      '$.flags[] (mảng chuỗi)',
    ]);
    expect(commandLikeFields(z.strictObject({ detectedFlags: z.array(z.string().max(9).regex(/^--x$/)) }))).toEqual([]);
  });
});

describe('stdout của ga-runner: bọc mọi dòng, đúng một report ở cuối (output-injection)', () => {
  const report = {
    $ga: 'report',
    command: 'turn',
    turnId: ULID,
    exit: { exitCode: 0, signal: null, timedOut: false, durationMs: 1200 },
    authGc: { removed: 1, nativeMemory: 'off' },
  } as const;
  const REPORT = runnerReportLine(report);
  const L = runnerStdoutLine;

  it('luồng hợp lệ: các dòng CLI (đã bọc) + report cuối', () => {
    const r = parseRunnerStdout([L('{"type":"delta","text":"xin chào"}'), L(''), REPORT]);
    expect(r).toEqual({ ok: true, lines: ['{"type":"delta","text":"xin chào"}', ''], report });
  });

  it('dòng CLI chứa {"$ga":"report",…} vẫn chỉ là line — không thành report', () => {
    const forged = L(REPORT);
    expect(parseRunnerStdout([forged, REPORT])).toMatchObject({ ok: true, lines: [REPORT] });
    // runner chết trước khi in report thật: report giả trong `l` KHÔNG được tin
    expect(parseRunnerStdout([L('x'), forged])).toMatchObject({
      ok: false,
      code: 'runner_protocol_error',
      reason: 'thiếu report',
    });
  });

  it('thiếu report / hai report / report giữa luồng ⇒ runner_protocol_error', () => {
    expect(parseRunnerStdout([])).toMatchObject({ ok: false, reason: 'thiếu report' });
    expect(parseRunnerStdout([L('a'), L('b')])).toMatchObject({ ok: false, reason: 'thiếu report' });
    expect(parseRunnerStdout([REPORT, REPORT])).toMatchObject({ ok: false, reason: 'nhiều hơn một report', lineNo: 2 });
    expect(parseRunnerStdout([L('a'), REPORT, L('b')])).toMatchObject({ ok: false, lineNo: 3 });
  });

  it('dòng thô không bọc / JSON không chuẩn (khoá trùng, khoảng trắng) / trường lạ / dòng rỗng ⇒ lỗi giao thức', () => {
    const bad = [
      'hello từ CLI',
      '{"type":"delta","text":"x"}',
      '{"$ga":"line","l":"a","l":"b"}',
      '{"$ga": "line", "l": "x"}',
      '{"l":"x","$ga":"line","extra":1}',
      '{"$ga":"line","l":1}',
      '{"$ga":"log","l":"x"}',
      '["$ga","line"]',
      'null',
      '',
    ];
    for (const raw of bad) {
      const r = parseRunnerStdout([raw, REPORT]);
      expect(r.ok, raw).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe('runner_protocol_error');
        expect(r.lineNo, raw).toBe(1);
      }
    }
    // report có khoá trùng (bản sau ghi đè bản trước khi JSON.parse) ⇒ từ chối
    const dupReport = REPORT.replace('"exitCode":0', '"exitCode":1,"exitCode":0');
    expect(parseRunnerStdout([dupReport])).toMatchObject({ ok: false, lineNo: 1 });
  });

  it('dòng quá cỡ bị chặn TRƯỚC khi parse; runner không bọc được dòng CLI vượt trần', () => {
    const huge = 'x'.repeat(RUNNER_STDOUT_LINE_MAX_CHARS + 1);
    expect(parseRunnerStdout([huge, REPORT])).toMatchObject({ ok: false, reason: 'dòng quá cỡ', lineNo: 1 });
    expect(() => runnerStdoutLine('y'.repeat(RUNNER_CLI_LINE_MAX_CHARS + 1))).toThrow();
    // dòng CLI tối đa toàn ký tự phải escape vẫn nằm trong trần dòng stdout
    expect(runnerStdoutLine('\u0001'.repeat(RUNNER_CLI_LINE_MAX_CHARS)).length).toBeLessThanOrEqual(
      RUNNER_STDOUT_LINE_MAX_CHARS,
    );
  });
});

describe('RunnerReport + đường tmpfs', () => {
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
});
