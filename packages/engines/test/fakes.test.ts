import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ProbeOutcome, TurnPlan, TurnStreamEvent } from '@ga/contracts';
import { afterAll, describe, expect, it } from 'vitest';
import { detectedFlags, type EngineAdapterExt, interpretLoginCheck, runCapabilityScan } from '../src/index.ts';
import { ADAPTERS, ALL_DECLARED_FLAGS, cases } from './helpers.ts';

// Chạy kế hoạch của adapter trên CLI GIẢ CHUNG (testing/fakes — L-FAKE, PR #2) thay cho fixture riêng: argv do adapter dựng
// (argv[0] /opt/engines/<slug>/… được thay bằng launcher của CLI giả, mọi cờ GIỮ NGUYÊN kể cả cờ giới hạn công cụ), cwd + HOME =
// tmpfs giả của lần chạy, env = env của plan + biến kịch bản của CLI giả (GA_FAKE_*, chỉ có ở test). MCP: cấu hình adapter ghi
// (máy chủ stdio = `ga-runner mcp-bridge`) chạy qua cầu giả testing/fakes/bridge-bin tới gateway giả dựng trong test.
// Mọi hành vi CLI giả là giả định ghi ở testing/fakes/ASSUMPTIONS.md.

const ROOT = join(import.meta.dirname, '..', '..', '..');
const FAKES = join(ROOT, 'testing', 'fakes');
/** Cầu MCP giả (`ga-runner mcp-bridge`) cho tới khi L-RT có cầu thật — chỉ thư mục này lên đầu PATH. */
const PATH_WITH_BRIDGE = `${join(FAKES, 'bridge-bin')}:${process.env.PATH ?? ''}`;
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
  return join(FAKES, 'bin', adapter.installSource.binaryName);
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
}

type CliOutcome = Extract<ProbeOutcome, { kind: 'cli' }>;

function writeFiles(plan: TurnPlan, dir: string): string[] {
  if (plan.kind !== 'cli') throw new Error('plan không phải cli');
  for (const f of plan.files) {
    const p = join(dir, f.path);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, f.content, { mode: 0o600 });
  }
  // argv nguyên vẹn của adapter, chỉ thay argv[0] (binary trong /opt/engines) bằng launcher của CLI giả.
  return plan.argv.slice(1);
}

function spawnEnv(plan: TurnPlan, o: RunOpts): NodeJS.ProcessEnv {
  return { PATH: PATH_WITH_BRIDGE, HOME: o.home, ...(plan.kind === 'cli' ? plan.env : {}), ...o.env };
}

function run(adapter: EngineAdapterExt, plan: TurnPlan, o: RunOpts): CliOutcome {
  const args = writeFiles(plan, o.dir);
  const t0 = Date.now();
  const r = spawnSync(fakeBin(adapter), args, {
    cwd: o.dir,
    env: spawnEnv(plan, o),
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

/** Như run nhưng không chặn event loop (gateway giả chạy trong cùng tiến trình test). */
function runAsync(adapter: EngineAdapterExt, plan: TurnPlan, o: RunOpts): Promise<CliOutcome> {
  const args = writeFiles(plan, o.dir);
  const t0 = Date.now();
  return new Promise((resolve) => {
    const child = spawn(fakeBin(adapter), args, {
      cwd: o.dir,
      env: spawnEnv(plan, o),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => {
      stdout += c.toString('utf8');
    });
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString('utf8');
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), 30_000);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ kind: 'cli', exitCode: code, signal, stdout, stderr, timedOut: false, durationMs: Date.now() - t0 });
    });
  });
}

/** Gateway MCP giả tối giản (Streamable HTTP, JSON): ghi mọi thông điệp + header Authorization. */
async function startGateway(): Promise<{
  url: string;
  calls: Array<{ name: string; authorization: string | undefined }>;
  methods: string[];
  close(): Promise<void>;
}> {
  const calls: Array<{ name: string; authorization: string | undefined }> = [];
  const methods: string[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const msg = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        id?: number;
        method: string;
        params?: { name?: string };
      };
      methods.push(msg.method);
      if (msg.id === undefined) {
        res.writeHead(202);
        return res.end();
      }
      if (msg.method === 'tools/call')
        calls.push({ name: String(msg.params?.name), authorization: req.headers.authorization });
      const result =
        msg.method === 'initialize'
          ? { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'gw', version: '0' } }
          : { content: [{ type: 'text', text: 'ok' }], isError: false };
      res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 's1' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    calls,
    methods,
    close: () =>
      new Promise<void>((r) => {
        server.close(() => r());
        server.closeAllConnections();
      }),
  };
}

function seed(adapter: EngineAdapterExt, home: string): void {
  const r = spawnSync(process.execPath, [join(FAKES, 'seed-auth.ts'), adapter.installSource.binaryName], {
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
    measure: null,
    timeoutMs: 600_000,
    authMethod: 'subscription' as const,
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
      const gen04 = adapter.authAllowlist === 'unknown';
      expect(before.loginStatus).toBe(gen04 ? 'unknown' : 'expired');
      seed(adapter, home);
      const after = interpretLoginCheck(
        adapter,
        'subscription',
        run(adapter, adapter.loginCheck(input).plan, { dir, home }),
      );
      expect(after.loginStatus).toBe(gen04 ? 'unknown' : 'logged_in');
      expect(after.result.accountHint).toBeNull();
    });

    it('kiểm đăng nhập khi CLI giả in danh tính: chỉ ghi dạng che (hoặc null nếu adapter chưa biết dạng in)', () => {
      const { dir, home } = freshDirs();
      seed(adapter, home);
      const input = { authMethod: 'subscription' as const, ...probeIn(dir, home) };
      const out = run(adapter, adapter.loginCheck(input).plan, { dir, home, env: { GA_FAKE_PRINT_IDENTITY: '1' } });
      const r = interpretLoginCheck(adapter, 'subscription', out);
      expect(r.loginStatus).toBe(adapter.authAllowlist === 'unknown' ? 'unknown' : 'logged_in');
      if (r.result.accountHint !== null) {
        expect(r.result.accountHint).toMatch(/^.\*\*\*@[^@\s]+$/);
        expect(out.stdout + out.stderr).not.toContain(r.result.accountHint);
      }
    });

    it('lượt chưa đăng nhập ⇒ AUTH_REQUIRED', () => {
      const { dir, home } = freshDirs();
      const plan = adapter.turnPlan(turnIn(dir, home));
      const out = run(adapter, plan, { dir, home, env: FAST });
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
        const out = run(adapter, plan, { dir, home, env: { ...FAST, GA_FAKE_SCENARIO: sc } });
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

    it('lượt có gọi công cụ: cấu hình MCP của adapter (stdio = cầu) ⇒ gateway nhận tools/call kèm vé từ tệp; pha acting', async () => {
      const gw = await startGateway();
      try {
        const { dir, home } = freshDirs();
        seed(adapter, home);
        writeFileSync(join(dir, 'ticket'), 'TICKET-ENGINES-TEST-0001\n', { mode: 0o400 });
        const plan = adapter.turnPlan(turnIn(dir, home, { gatewayUrl: gw.url, detectedFlags: fakeFlags }));
        const sc = JSON.stringify({
          name: 'ok',
          script: { reply: 'đã tra', calls: [{ tool: 'recall', args: { q: 'x' } }] },
        });
        const out = await runAsync(adapter, plan, { dir, home, env: { ...FAST, GA_FAKE_SCENARIO: sc } });
        expect(adapter.classify(out, out.stdout, out.stderr).outcome, out.stderr).toBe('ok');
        expect(gw.calls).toEqual([{ name: 'recall', authorization: 'Bearer TICKET-ENGINES-TEST-0001' }]);
        const parser = adapter.createLineParser();
        const events = out.stdout.split('\n').flatMap((l) => parser.push(l));
        expect(events.some((e) => e.type === 'tool' && e.stage === 'call')).toBe(true);
        expect(events.some((e) => e.type === 'tool' && e.stage === 'result')).toBe(true);
        expect(parser.phase).toBe('acting');
        expect(JSON.stringify(plan)).not.toContain('TICKET-ENGINES-TEST-0001');
      } finally {
        await gw.close();
      }
    });

    it('ca âm: máy chủ MCP không có trong cấu hình (GA_FAKE_MCP_SERVER chọn tên không có) ⇒ không gọi gì', async () => {
      const gw = await startGateway();
      try {
        const { dir, home } = freshDirs();
        seed(adapter, home);
        writeFileSync(join(dir, 'ticket'), 'T\n', { mode: 0o400 });
        const plan = adapter.turnPlan(turnIn(dir, home, { gatewayUrl: gw.url, detectedFlags: fakeFlags }));
        const sc = JSON.stringify({ name: 'ok', script: { calls: [{ tool: 'recall', args: {} }] } });
        await runAsync(adapter, plan, {
          dir,
          home,
          env: { ...FAST, GA_FAKE_SCENARIO: sc, GA_FAKE_MCP_SERVER: 'khong-co' },
        });
        expect(gw.methods).toEqual([]);
      } finally {
        await gw.close();
      }
    });

    it(`cơ chế giới hạn công cụ: CLI giả ${fakeHasRestriction ? 'có' : 'CHƯA khai'} cờ ⇒ turnPlan với cờ đã quét ${fakeHasRestriction ? 'chạy' : 'bị từ chối (engine_unrestricted)'}`, () => {
      const { dir, home } = freshDirs();
      const plan = () => adapter.turnPlan(turnIn(dir, home, { detectedFlags: fakeFlags }));
      // CLI giả chung khai đủ cờ giới hạn của mọi adapter (agy: AGY-T03) ⇒ plan thật chạy được trên CLI giả.
      expect(fakeHasRestriction).toBe(true);
      expect(plan).not.toThrow();
    });
  });
}
