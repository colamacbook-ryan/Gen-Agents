import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ProbeOutcome, TurnPlan, TurnStreamEvent } from '@ga/contracts';
import { afterAll, describe, expect, it } from 'vitest';
import { detectedFlags, type EngineAdapterExt, interpretLoginCheck, runCapabilityScan } from '../src/index.ts';
import { ADAPTERS, ALL_DECLARED_FLAGS, cases } from './helpers.ts';

// Chạy kế hoạch của adapter trên CLI GIẢ CHUNG (testing/fakes — L-FAKE, PR #2) thay cho fixture riêng: argv do adapter dựng
// (argv[0] /opt/engines/<slug>/… được thay bằng launcher của CLI giả), cwd + HOME = tmpfs giả của lần chạy, env = env của plan
// + biến kịch bản của CLI giả (GA_FAKE_*, chỉ có ở test). Mọi hành vi CLI giả là giả định ghi ở testing/fakes/ASSUMPTIONS.md.

const ROOT = join(import.meta.dirname, '..', '..', '..');
const FAKES = join(ROOT, 'testing', 'fakes');
const WORK = mkdtempSync(join(tmpdir(), 'ga-engines-fake-'));
afterAll(() => rmSync(WORK, { recursive: true, force: true }));

let seq = 0;
function freshDirs(): { dir: string; home: string } {
  const dir = join(WORK, `run-${++seq}`);
  const home = join(dir, 'home');
  mkdirSync(home, { recursive: true });
  return { dir, home };
}

function fakeBin(adapter: EngineAdapterExt): string {
  return join(FAKES, 'bin', adapter.install.binaryName);
}

/** Cờ mà CLI giả hiện có (đọc --help của chính nó — như probe thật, STD-10). */
function fakeHelpFlags(adapter: EngineAdapterExt, home: string): string[] {
  const r = spawnSync(fakeBin(adapter), ['--help'], {
    env: { PATH: process.env.PATH ?? '', HOME: home },
    encoding: 'utf8',
  });
  const outcome: ProbeOutcome = {
    kind: 'cli',
    exitCode: r.status,
    signal: r.signal,
    stdout: r.stdout,
    stderr: r.stderr,
    timedOut: false,
    durationMs: 0,
  };
  return detectedFlags(adapter.parseCapabilitiesFor([outcome, outcome], { authMode: 'none' }));
}

interface RunOpts {
  dir: string;
  home: string;
  env?: Record<string, string>;
  /** Bỏ cờ giới hạn công cụ khi CLI giả chưa khai (chỉ để kiểm parser trên output của CLI giả, không phải đường chạy thật). */
  dropFlags?: readonly string[];
}

type CliOutcome = Extract<ProbeOutcome, { kind: 'cli' }>;

function run(adapter: EngineAdapterExt, plan: TurnPlan, o: RunOpts): CliOutcome {
  if (plan.kind !== 'cli') throw new Error('plan không phải cli');
  for (const f of plan.files) {
    const p = join(o.dir, f.path);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, f.content, { mode: 0o600 });
  }
  const args: string[] = [];
  const rest = plan.argv.slice(1);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] ?? '';
    if (o.dropFlags?.includes(a)) {
      if (adapter.flagTable.flags[a] === 'value') i++;
      continue;
    }
    args.push(a);
  }
  const t0 = Date.now();
  const r = spawnSync(fakeBin(adapter), args, {
    cwd: o.dir,
    env: { PATH: process.env.PATH ?? '', HOME: o.home, ...plan.env, ...o.env },
    input: '',
    encoding: 'utf8',
    timeout: Math.min(plan.timeoutMs, 30_000),
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    kind: 'cli',
    exitCode: r.status,
    signal: r.signal,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    timedOut: r.error !== undefined && (r.error as NodeJS.ErrnoException).code === 'ETIMEDOUT',
    durationMs: Date.now() - t0,
  };
}

function seed(adapter: EngineAdapterExt, home: string): void {
  const r = spawnSync(process.execPath, [join(FAKES, 'seed-auth.ts'), adapter.install.binaryName], {
    env: { PATH: process.env.PATH ?? '', HOME: home },
    encoding: 'utf8',
  });
  expect(r.status, r.stderr).toBe(0);
}

function probeIn(dir: string, home: string) {
  return { probeId: '01JABCDEFGHJKMNPQRSTVWXYZ1', probeDir: dir, homeDir: home, authDir: join(dir, 'auth') };
}

function turnIn(dir: string, home: string, over: Record<string, unknown> = {}) {
  return {
    turnId: '01JABCDEFGHJKMNPQRSTVWXYZ0',
    prompt: 'Xin chào',
    promptFile: join(dir, 'prompt', 'user.md'),
    systemPrompt: null,
    systemPromptFile: null,
    model: null,
    effort: null,
    gatewayUrl: 'http://127.0.0.1:9/mcp',
    turnDir: dir,
    homeDir: home,
    ticketFile: join(dir, 'ticket'),
    authDir: join(dir, 'auth'),
    detectedFlags: ALL_DECLARED_FLAGS,
    ...over,
  };
}

const FAST = { GA_FAKE_LOGIN_TIMEOUT_MS: '300', GA_FAKE_VENDOR_TIMEOUT_MS: '2000' };

for (const adapter of ADAPTERS) {
  const c = cases(adapter.slug);
  const available = existsSync(fakeBin(adapter));

  describe.runIf(available)(`CLI giả chung: ${adapter.slug}`, () => {
    const restrictionFlags = adapter.toolRestriction?.requiredFlags ?? [];
    const fakeFlags = fakeHelpFlags(adapter, freshDirs().home);
    const fakeHasRestriction = restrictionFlags.every((f) => fakeFlags.includes(f));
    const drop = fakeHasRestriction ? [] : restrictionFlags;

    it('quét khả năng chưa đăng nhập: version = bản đã kiểm, cờ / effort đọc từ --help của CLI giả', async () => {
      const { dir, home } = freshDirs();
      const scan = await runCapabilityScan(adapter, { authMode: 'none', ...probeIn(dir, home) }, async (p) =>
        run(adapter, p, { dir, home, env: FAST }),
      );
      expect(scan.cliVersion).toBe(adapter.testedVersions[0]);
      const keys = new Set(scan.entries.filter((e) => e.valueState === 'known').map((e) => e.key));
      for (const f of ['-p', '--output-format', '--model', '--effort']) expect(keys.has(`flag:${f}`), f).toBe(true);
      expect([...keys].some((k) => k.startsWith('effort:'))).toBe(true);
      expect(scan.missingTurnFlags).toEqual(restrictionFlags.filter((f) => !fakeFlags.includes(f)));
      const model = scan.entries.find((e) => e.key === 'model:*');
      expect(model?.valueState === 'unknown' ? model.unknownReason : null).toBe('unknown_requires_login');
    });

    it('kiểm đăng nhập: chưa đăng nhập ⇒ hết hạn (cần đăng nhập lại); seed credential ⇒ đã đăng nhập, account_hint null', async () => {
      const { dir, home } = freshDirs();
      const input = { authMethod: 'subscription' as const, ...probeIn(dir, home) };
      const before = interpretLoginCheck(
        adapter,
        'subscription',
        run(adapter, adapter.loginCheck(input).plan, { dir, home }),
      );
      expect(before.loginStatus).toBe('expired');
      seed(adapter, home);
      const after = interpretLoginCheck(
        adapter,
        'subscription',
        run(adapter, adapter.loginCheck(input).plan, { dir, home }),
      );
      expect(after.loginStatus).toBe('logged_in');
      expect(after.result.accountHint).toBeNull();
    });

    it('kiểm đăng nhập khi CLI giả in danh tính: chỉ ghi dạng che (hoặc null nếu adapter chưa biết dạng in)', () => {
      const { dir, home } = freshDirs();
      seed(adapter, home);
      const input = { authMethod: 'subscription' as const, ...probeIn(dir, home) };
      const out = run(adapter, adapter.loginCheck(input).plan, { dir, home, env: { GA_FAKE_PRINT_IDENTITY: '1' } });
      const r = interpretLoginCheck(adapter, 'subscription', out);
      expect(r.loginStatus).toBe('logged_in');
      if (r.result.accountHint !== null) {
        expect(r.result.accountHint).toMatch(/^.\*\*\*@[^@\s]+$/);
        expect(out.stdout + out.stderr).not.toContain(r.result.accountHint);
      }
    });

    it('lượt chưa đăng nhập ⇒ AUTH_REQUIRED', () => {
      const { dir, home } = freshDirs();
      const plan = adapter.turnPlan(turnIn(dir, home));
      const out = run(adapter, plan, { dir, home, env: FAST, dropFlags: drop });
      expect(adapter.classify(out, out.stdout, out.stderr).outcome).toBe('AUTH_REQUIRED');
    });

    for (const [scenario, want] of Object.entries(c.fakeScenarios)) {
      it(`kịch bản ${scenario} ⇒ ${want.outcome}${want.resetAt ? ` (reset ${want.resetAt})` : ''}`, () => {
        const { dir, home } = freshDirs();
        seed(adapter, home);
        const plan = adapter.turnPlan(turnIn(dir, home));
        const sc =
          scenario === 'quota_exhausted'
            ? JSON.stringify({ name: scenario, resetAt: '2026-10-16T19:00:00Z' })
            : scenario;
        const out = run(adapter, plan, { dir, home, env: { ...FAST, GA_FAKE_SCENARIO: sc }, dropFlags: drop });
        const d = adapter.classifyDetailed(out, out.stdout, out.stderr);
        expect({ outcome: d.classification.outcome, resetAt: d.classification.resetAt }, d.ruleId).toEqual(want);
        if (scenario === 'ok') {
          const parser = adapter.createLineParser();
          const events: TurnStreamEvent[] = out.stdout.split('\n').flatMap((l) => parser.push(l));
          const text = events.flatMap((e) => (e.type === 'delta' ? [e.text] : [])).join('');
          expect(text.length).toBeGreaterThan(0);
          expect(events.some((e) => e.type === 'usage')).toBe(true);
          expect(parser.stats.unparsable).toBe(0);
        }
      });
    }

    it(`cơ chế giới hạn công cụ: CLI giả ${fakeHasRestriction ? 'có' : 'CHƯA khai'} cờ ⇒ turnPlan với cờ đã quét ${fakeHasRestriction ? 'chạy' : 'bị từ chối (engine_unrestricted)'}`, () => {
      const { dir, home } = freshDirs();
      const plan = () => adapter.turnPlan(turnIn(dir, home, { detectedFlags: fakeFlags }));
      if (fakeHasRestriction) expect(plan).not.toThrow();
      else expect(plan).toThrow(/giới hạn công cụ/);
    });
  });
}
