import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { parseRunnerStdout, type RunnerReport } from '@ga/contracts';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type AdapterRegistry, type RunnerAdapter, registryOf } from '../src/adapters.ts';
import { main } from '../src/cli.ts';
import { cmdAuthGc, cmdProbe, cmdTurn, parseLoginEnv, type RunnerContext } from '../src/commands.ts';
import { engineInstallMain } from '../src/engine-install/cli.ts';
import { BIN, fakeAdapter } from './fixtures/fake-adapter.ts';
import { ACCOUNT, Capture, type Sandbox, sandbox, stdinOf, TICKET, TURN_ID } from './helpers.ts';

// Lệnh ga-runner với bundle ý định (contracts v2) + adapter đóng sẵn. Gateway giả trả TurnBundle theo vé.

const NOW = new Date('2026-10-16T10:00:00.000Z');
const LATER = '2026-10-16T11:00:00.000Z';
const PROBE_ID = '01JABCDEFGHJKMNPQRSTVWXYZ9';

let gw: Server;
let gwUrl = '';
let bundleBody: unknown = null;
let bundleStatus = 200;
const seenAuth: string[] = [];

beforeAll(async () => {
  gw = createServer((req, res) => {
    seenAuth.push(String(req.headers.authorization));
    if (req.url !== '/turn/bundle' || req.headers.authorization !== `Bearer ${TICKET}`) {
      res.writeHead(401).end();
      return;
    }
    res.writeHead(bundleStatus, { 'content-type': 'application/json' }).end(JSON.stringify(bundleBody));
  });
  await new Promise<void>((r) => gw.listen(0, '127.0.0.1', r));
  gwUrl = `http://127.0.0.1:${(gw.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise((r) => gw.close(r));
});

let sb: Sandbox;
beforeEach(() => {
  sb = sandbox();
  bundleStatus = 200;
  seenAuth.length = 0;
  writeFileSync(join(sb.authDir, 'cred.json'), 'v1', { mode: 0o600 });
  mkdirSync(join(sb.authDir, '.junk'), { recursive: true });
  writeFileSync(join(sb.authDir, '.junk', 'history.jsonl'), 'cũ');
});
afterEach(() => sb.cleanup());

function turnBundle(over: Record<string, unknown> = {}) {
  return {
    v: 2,
    op: 'turn',
    turnId: TURN_ID,
    sessionId: '01JABCDEFGHJKMNPQRSTVWXYZ1',
    engineSlug: 'fake',
    engineAccount: ACCOUNT,
    params: { model: null, effort: null },
    authMethod: 'subscription',
    detectedFlags: [],
    prompt: { user: { path: 'user.md', content: 'xin chào' }, system: null },
    timeoutMs: 60_000,
    measure: null,
    nativeMemoryPolicy: 'tmpfs-per-turn',
    expiresAt: LATER,
    ...over,
  };
}

function ctx(o: { stdin?: string | null; env?: Record<string, string>; registry?: AdapterRegistry } = {}) {
  const stdout = new Capture();
  const stderr = new Capture();
  const c: RunnerContext = {
    roots: sb.roots,
    registry: o.registry ?? registryOf([fakeAdapter()]),
    io: {
      env: o.env ?? { GA_TURN_ID: TURN_ID, GA_GATEWAY_URL: gwUrl, HTTPS_PROXY: 'http://ga-egress:3128' },
      stdin: stdinOf(o.stdin === undefined ? `${TICKET}\n` : o.stdin),
      stdout,
      stderr,
      now: () => NOW,
    },
  };
  return { c, stdout, stderr };
}

/** Đọc stdout bằng parseRunnerStdout của contracts (bên đọc thật cũng vậy). */
function protocol(out: Capture): { lines: Record<string, unknown>[]; report: RunnerReport } {
  const p = parseRunnerStdout(out.lines());
  if (!p.ok) throw new Error(`runner_protocol_error: ${p.reason} @${p.lineNo}`);
  return {
    lines: p.lines.flatMap((l) => {
      try {
        return [JSON.parse(l) as Record<string, unknown>];
      } catch {
        return [];
      }
    }),
    report: p.report,
  };
}
const lastReport = (out: Capture) => protocol(out).report;
const runDirEmpty = () => readdirSync(sb.roots.run).length === 0;

describe('ga-runner turn — bundle ý định, argv / env / tệp do adapter dựng', () => {
  it('lượt đầy đủ: vé 0400 chỉ trong tmpfs, env CLI không có vé / GA_*, transcript bị xoá, /auth chỉ còn allowlist', async () => {
    bundleBody = turnBundle();
    const { c, stdout } = ctx();
    expect(await cmdTurn(c)).toBe(0);
    expect(seenAuth).toEqual([`Bearer ${TICKET}`]);
    const { lines } = protocol(stdout);
    expect(lines.some((l) => l.type === 'env')).toBe(true);
    const dump = join(sb.roots.run, 'env-dump.json');
    const envLine = JSON.parse(readFileSync(dump, 'utf8')) as { names: string[]; values: string[]; ticketMode: string };
    rmSync(dump);
    expect(envLine.ticketMode).toBe('400');
    // GEN-03: cwd của CLI = thư mục lượt
    expect((envLine as unknown as { cwd: string }).cwd).toBe(join(sb.roots.run, TURN_ID));
    // PWD do /bin/sh của launcher thử nghiệm tự đặt (không phải runner)
    expect(envLine.names.filter((n) => n !== 'PWD')).toEqual([
      'HOME',
      'HTTPS_PROXY',
      'LANG',
      'NO_COLOR',
      'PATH',
      'TMPDIR',
    ]);
    expect(envLine.values.join('\n')).not.toContain(TICKET);
    // canary trong output CLI ⇒ cả dòng bị thay
    expect(stdout.data).not.toContain('GA-CANARY-');
    expect(lines.some((l) => l.$ga === 'line_redacted')).toBe(true);
    const report = lastReport(stdout);
    expect(report).toMatchObject({ command: 'turn', turnId: TURN_ID, exit: { exitCode: 0 } });
    expect(report.authGc).toEqual({ removed: 1, nativeMemory: 'off' });
    expect(runDirEmpty()).toBe(true);
    expect(readdirSync(sb.authDir).sort()).toEqual(['cred.json']);
    // CLI xoay token bằng rename ⇒ chép ngược về /auth
    expect(readFileSync(join(sb.authDir, 'cred.json'), 'utf8')).toBe('{"token":"rotated-v2"}');
    expect(lstatSync(join(sb.authDir, 'cred.json')).isFile()).toBe(true);
  });

  const bad: [string, () => void, Partial<{ registry: AdapterRegistry; stdin: string }>][] = [
    ['bundle có trường lạ (argv)', () => (bundleBody = { ...turnBundle(), argv: ['/bin/sh'] }), {}],
    ['bundle có env tự do', () => (bundleBody = { ...turnBundle(), env: { LD_PRELOAD: '/x' } }), {}],
    ['slug ngoài enum registry', () => (bundleBody = turnBundle({ engineSlug: 'other' })), {}],
    ['model dạng cờ', () => (bundleBody = turnBundle({ params: { model: '--dangerously-skip', effort: null } })), {}],
    ['effort dạng cờ', () => (bundleBody = turnBundle({ params: { model: null, effort: '-x' } })), {}],
    [
      'prompt path thoát tmpfs (..)',
      () =>
        (bundleBody = turnBundle({
          prompt: { user: { path: '../../auth/EN-0001/cred.json', content: 'x' }, system: null },
        })),
      {},
    ],
    [
      'prompt path tuyệt đối',
      () => (bundleBody = turnBundle({ prompt: { user: { path: '/etc/passwd', content: 'x' }, system: null } })),
      {},
    ],
    ['turnId lệch env', () => (bundleBody = turnBundle({ turnId: '01JABCDEFGHJKMNPQRSTVWXYZ2' })), {}],
    ['bundle hết hạn', () => (bundleBody = turnBundle({ expiresAt: '2026-10-16T09:00:00.000Z' })), {}],
    [
      'adapter dựng argv[0] là shell',
      () => (bundleBody = turnBundle()),
      {
        registry: registryOf([
          fakeAdapter({
            turnPlan: () => ({ kind: 'cli', files: [], argv: ['/bin/sh', '-c', 'id'], env: {}, timeoutMs: 1000 }),
          }),
        ]),
      },
    ],
    [
      'adapter dựng cờ ngoài bảng',
      () => (bundleBody = turnBundle()),
      {
        registry: registryOf([
          fakeAdapter({
            turnPlan: () => ({ kind: 'cli', files: [], argv: [BIN, 'turn', '--evil'], env: {}, timeoutMs: 1000 }),
          }),
        ]),
      },
    ],
    [
      'adapter khai nhầm LD_PRELOAD trong bảng env',
      () => (bundleBody = turnBundle()),
      {
        registry: registryOf([
          fakeAdapter({
            flagTable: { subcommands: ['turn'], flags: {}, env: ['LD_PRELOAD'] },
            turnPlan: () => ({
              kind: 'cli',
              files: [],
              argv: [BIN, 'turn'],
              env: { LD_PRELOAD: '/tmp/x.so' },
              timeoutMs: 1000,
            }),
          }),
        ]),
      },
    ],
    ['vé sai dạng trên stdin', () => (bundleBody = turnBundle()), { stdin: 'không-phải-vé\n' }],
  ];
  it.each(bad)('từ chối: %s ⇒ 125, không chạy CLI, tmpfs đã dọn', async (_n, setup, o) => {
    setup();
    const { c, stdout, stderr } = ctx(o);
    expect(await cmdTurn(c)).toBe(125);
    // lỗi trước khi có report ⇒ không in report ⇒ bên đọc fail-closed
    expect(parseRunnerStdout(stdout.lines())).toMatchObject({ ok: false, code: 'runner_protocol_error' });
    expect(stdout.data).not.toContain('"type":"env"');
    expect(stderr.json().at(-1)).toMatchObject({ ga_runner: { event: 'error' } });
    expect(runDirEmpty()).toBe(true);
    expect(existsSync(join(sb.authDir, '.junk'))).toBe(true); // không chạy ⇒ không gc
  });

  it('gateway từ chối vé (401) ⇒ 125, tmpfs (vé) đã xoá', async () => {
    bundleStatus = 401;
    bundleBody = turnBundle();
    const { c } = ctx();
    expect(await cmdTurn(c)).toBe(125);
    expect(runDirEmpty()).toBe(true);
  });
});

function probeBundle(op: 'login_check' | 'probe:capability_scan', over: Record<string, unknown> = {}) {
  const base =
    op === 'login_check'
      ? {
          v: 2,
          op,
          probeId: PROBE_ID,
          engineSlug: 'fake',
          engineAccount: ACCOUNT,
          authMethod: 'subscription',
          expiresAt: LATER,
        }
      : {
          v: 2,
          op,
          probeId: PROBE_ID,
          engineSlug: 'fake',
          engineAccount: ACCOUNT,
          authMode: 'oauth',
          expiresAt: LATER,
        };
  return `${JSON.stringify({ ...base, ...over })}\n`;
}

describe('ga-runner login-check / probe — bundle qua stdin, plan của adapter, HOME tmpfs + auth-gc', () => {
  it('login-check: một outcome, auth-gc theo allowlist adapter', async () => {
    const { c, stdout } = ctx({ stdin: probeBundle('login_check'), env: { GA_PROBE_ID: PROBE_ID } });
    expect(await cmdProbe(c, 'login-check')).toBe(0);
    const r = lastReport(stdout);
    expect(r.command).toBe('login-check');
    if (r.command !== 'login-check') throw new Error('sai lệnh');
    expect(r.outcomes).toHaveLength(1);
    expect(r.outcomes[0]).toMatchObject({ kind: 'cli', exitCode: 0, stdout: '{"arg":"logged-in"}\n' });
    expect(r.authGc).toEqual({ removed: 1, nativeMemory: 'off' });
    expect(runDirEmpty()).toBe(true);
  });

  it('probe: nhiều plan ⇒ nhiều outcome theo thứ tự', async () => {
    const { c, stdout } = ctx({ stdin: probeBundle('probe:capability_scan'), env: { GA_PROBE_ID: PROBE_ID } });
    expect(await cmdProbe(c, 'probe')).toBe(0);
    const r = lastReport(stdout);
    if (r.command !== 'probe') throw new Error('sai lệnh');
    expect(r.outcomes.map((o) => (o.kind === 'cli' ? o.stdout.trim() : ''))).toEqual([
      '{"arg":"v1"}',
      '{"arg":"help"}',
    ]);
  });

  it.each([
    ['op lệch lệnh', 'login-check', probeBundle('probe:capability_scan'), PROBE_ID],
    ['probeId lệch env', 'login-check', probeBundle('login_check'), '01JABCDEFGHJKMNPQRSTVWXYZ8'],
    ['trường lạ (plans)', 'login-check', probeBundle('login_check', { plans: [] }), PROBE_ID],
    ['slug ngoài enum', 'login-check', probeBundle('login_check', { engineSlug: 'nope' }), PROBE_ID],
    ['authMethod lạ', 'login-check', probeBundle('login_check', { authMethod: 'shell' }), PROBE_ID],
  ] as const)('từ chối: %s', async (_n, cmd, stdin, probeEnv) => {
    const { c } = ctx({ stdin, env: { GA_PROBE_ID: probeEnv } });
    expect(await cmdProbe(c, cmd)).toBe(125);
    expect(runDirEmpty()).toBe(true);
  });
});

describe('ga-runner auth-gc — allowlist CỦA ADAPTER, ga-app không gửi danh sách tệp', () => {
  it('dọn theo allowlist adapter', async () => {
    const { c, stdout } = ctx({ stdin: `${JSON.stringify({ v: 2, engineSlug: 'fake', engineAccount: ACCOUNT })}\n` });
    expect(await cmdAuthGc(c)).toBe(0);
    expect(stdout.json()[0]).toEqual({ removed: 1, nativeMemory: 'off' });
    expect(readdirSync(sb.authDir)).toEqual(['cred.json']);
  });
  it("adapter allowlist 'unknown' ⇒ không xoá gì", async () => {
    const reg = registryOf([fakeAdapter({ authAllowlist: 'unknown' } as Partial<RunnerAdapter>)]);
    const { c, stdout } = ctx({
      stdin: `${JSON.stringify({ v: 2, engineSlug: 'fake', engineAccount: ACCOUNT })}\n`,
      registry: reg,
    });
    expect(await cmdAuthGc(c)).toBe(0);
    expect(stdout.json()[0]).toEqual({ removed: 0, nativeMemory: 'unknown' });
    expect(existsSync(join(sb.authDir, '.junk'))).toBe(true);
  });
  it('bundle mang allowlist riêng ⇒ từ chối', async () => {
    const { c } = ctx({
      stdin: `${JSON.stringify({ v: 2, engineSlug: 'fake', engineAccount: ACCOUNT, allowlist: ['.junk/history.jsonl'] })}\n`,
    });
    expect(await cmdAuthGc(c)).toBe(125);
  });
});

describe('ga-runner main — đúng hai phần tử argv', () => {
  it.each([[['turn', '--extra']], [['sh']], [['pty-kill']], [[]]])('từ chối argv %j', async (argv) => {
    expect(await main(argv, { roots: sb.roots, registry: registryOf([fakeAdapter()]) })).toBe(125);
  });
});

describe('ga-runner login — ý định từ ba biến env (vé PTY đã ký), argv do adapter dựng', () => {
  const env = (o: Record<string, string>) => ({
    GA_ENGINE_SLUG: 'fake',
    GA_ENGINE_ACCOUNT: ACCOUNT,
    GA_AUTH_METHOD: 'subscription',
    ...o,
  });
  it('env hợp lệ ⇒ LoginBundle', () => {
    const { c } = ctx({ env: env({}) });
    expect(parseLoginEnv(c)).toEqual({ v: 2, engineSlug: 'fake', engineAccount: ACCOUNT, authMethod: 'subscription' });
  });
  it.each([
    ['slug ngoài enum', { GA_ENGINE_SLUG: 'nope' }],
    ['tài khoản sai dạng', { GA_ENGINE_ACCOUNT: 'EN-1;id' }],
    ['cách đăng nhập lạ', { GA_AUTH_METHOD: 'shell' }],
  ])('từ chối: %s', (_n, o) => {
    const { c } = ctx({ env: env(o) });
    expect(() => parseLoginEnv(c)).toThrow();
  });
});

describe('ga-engine-install — bundle qua stdin, công thức của adapter', () => {
  it('status: slug trong registry, chưa cài ⇒ not_installed', async () => {
    const out: unknown[] = [];
    const code = await engineInstallMain(['status'], {
      roots: sb.roots,
      registry: registryOf([fakeAdapter()]),
      stdin: stdinOf(`${JSON.stringify({ v: 2, engineSlug: 'fake', source: 'official' })}\n`),
      out: (s) => out.push(s),
    });
    expect(code).toBe(0);
    expect(out).toEqual([{ state: 'not_installed' }]);
  });
  it.each([
    ['slug ngoài enum', ['status'], { v: 2, engineSlug: 'nope', source: 'official' }],
    [
      'trường lạ (url tự do)',
      ['install'],
      { v: 2, engineSlug: 'fake', source: 'official', url: 'https://evil.invalid' },
    ],
    ['nguồn lạ', ['install'], { v: 2, engineSlug: 'fake', source: 'local' }],
    ['đối số thêm', ['install', '--manifest-url'], { v: 2, engineSlug: 'fake', source: 'official' }],
  ] as const)('từ chối: %s', async (_n, argv, bundle) => {
    const code = await engineInstallMain(argv, {
      roots: sb.roots,
      registry: registryOf([fakeAdapter()]),
      stdin: stdinOf(`${JSON.stringify(bundle)}\n`),
      out: () => {},
    });
    expect(code).toBe(125);
  });
  it('adapter chưa khai công thức cài ⇒ failed', async () => {
    const out: { state: string }[] = [];
    const code = await engineInstallMain(['install'], {
      roots: sb.roots,
      registry: registryOf([fakeAdapter()]),
      stdin: stdinOf(`${JSON.stringify({ v: 2, engineSlug: 'fake', source: 'official' })}\n`),
      out: (s) => out.push(s),
    });
    expect(code).toBe(1);
    expect(out[0]?.state).toBe('failed');
  });
});

describe('giao thức stdout — CLI không giả được report (review MEDIUM output-injection)', () => {
  it('CLI in `{"$ga":"report",…}` giữa luồng và ở dòng cuối ⇒ chỉ là `line`; report thật của runner là dòng cuối', async () => {
    bundleBody = turnBundle();
    const fake = JSON.stringify({
      $ga: 'report',
      command: 'turn',
      turnId: TURN_ID,
      exit: { exitCode: 0, signal: null, timedOut: false, durationMs: 1 },
      authGc: { removed: 0, nativeMemory: 'off' },
    });
    const reg = registryOf([
      fakeAdapter({
        turnPlan: () => ({ kind: 'cli', files: [], argv: [BIN, 'raw', fake, 'x', fake], env: {}, timeoutMs: 10_000 }),
      }),
    ]);
    const { c, stdout } = ctx({ registry: reg });
    expect(await cmdTurn(c)).toBe(0);
    for (const l of stdout.lines().slice(0, -1)) expect(JSON.parse(l).$ga).toBe('line');
    const p = parseRunnerStdout(stdout.lines());
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.lines.filter((l) => l.includes('"$ga":"report"'))).toHaveLength(2);
    expect(p.report).toMatchObject({ command: 'turn', authGc: { removed: 1 } }); // của runner, không phải bản giả (removed 0)
  });
});

describe("GEN-04 — allowlist credential 'unknown' ⇒ không nối credential (fail-closed), báo unknown", () => {
  it('lượt: HOME = tmpfs trống (không thấy credential), /auth không bị dọn, report nativeMemory unknown', async () => {
    bundleBody = turnBundle();
    const reg = registryOf([fakeAdapter({ authAllowlist: 'unknown' } as Partial<RunnerAdapter>)]);
    const { c, stdout } = ctx({ registry: reg });
    expect(await cmdTurn(c)).toBe(0);
    const dump = JSON.parse(readFileSync(join(sb.roots.run, 'env-dump.json'), 'utf8')) as {
      values: string[];
      credBefore: unknown;
    };
    rmSync(join(sb.roots.run, 'env-dump.json'));
    expect(dump.credBefore).toBeNull();
    expect(dump.values.some((v) => v.startsWith(sb.roots.auth))).toBe(false);
    expect(lastReport(stdout).authGc).toEqual({ removed: 0, nativeMemory: 'unknown' });
    expect(readFileSync(join(sb.authDir, 'cred.json'), 'utf8')).toBe('v1');
    expect(existsSync(join(sb.authDir, '.junk'))).toBe(true);
  });
  it('login-check: báo nativeMemory unknown', async () => {
    const reg = registryOf([fakeAdapter({ authAllowlist: 'unknown' } as Partial<RunnerAdapter>)]);
    const { c, stdout } = ctx({ stdin: probeBundle('login_check'), env: { GA_PROBE_ID: PROBE_ID }, registry: reg });
    expect(await cmdProbe(c, 'login-check')).toBe(0);
    expect(lastReport(stdout).authGc).toEqual({ removed: 0, nativeMemory: 'unknown' });
  });
});
