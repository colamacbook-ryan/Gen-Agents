// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { credentialPath, seedCredentials } from '../lib/creds.ts';
import { cliEnv, FAKES_DIR, lines, runCli, startMockMcp, tmp } from './helpers.ts';

const data = (n: string) => readFileSync(join(FAKES_DIR, 'claude/dumps', n), 'utf8');
const CANARY = /GA-CANARY-[0-9a-f-]{36}/;

function loggedIn(extra: Record<string, string> = {}): { home: string; cwd: string; env: NodeJS.ProcessEnv } {
  const home = tmp();
  const cwd = tmp('ga-cwd-');
  const env = cliEnv(home, extra);
  seedCredentials('claude', env);
  return { home, cwd, env };
}

type Ev = {
  type: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  message?: { content: Array<Record<string, unknown>> };
  event?: { type: string };
  rate_limit_info?: { status: string; resetsAt: number | null };
};

describe('fake-claude: bề mặt lấy nguyên văn từ Spike 1b', () => {
  it('--version / --help đúng byte; -p "/model" và "/usage" đúng văn bản của dump', async () => {
    const { env, cwd } = loggedIn();
    expect((await runCli('claude', ['--version'], { env })).stdout).toBe(data('version.txt'));
    expect((await runCli('claude', ['-v'], { env })).stdout).toBe(data('version.txt'));
    expect((await runCli('claude', ['--help'], { env })).stdout).toBe(data('help.txt'));
    const model = JSON.parse(
      (await runCli('claude', ['-p', '/model', '--output-format', 'json'], { env, cwd })).stdout,
    );
    expect(model).toMatchObject({ type: 'result', subtype: 'success', is_error: false, local_command: 'model' });
    expect(model.result).toBe(
      'Current model: `Sonnet 5.5 (default)`\nUsage: /model <name>. Available: sonnet, opus, haiku, fable, best, sonnet[1m], opus[1m], fable[1m], opusplan, default, or a full model ID.',
    );
    const usage = JSON.parse(
      (await runCli('claude', ['-p', '/usage', '--output-format', 'json'], { env, cwd })).stdout,
    );
    expect(usage.result).toBe(
      'Total cost:            $0.0000\nTotal duration (API):  0s\nTotal duration (wall): 1s\nTotal code changes:    0 lines added, 0 lines removed\nUsage:                 0 input, 0 output, 0 cache read, 0 cache write',
    );
  });

  it('cờ suy từ chính help.txt: cờ lạ ⇒ exit 1 "unknown option"; thiếu giá trị ⇒ exit 1; cờ variadic nuốt nhiều giá trị', async () => {
    const { env, cwd } = loggedIn();
    const bad = await runCli('claude', ['-p', 'x', '--no-such-flag'], { env, cwd });
    expect(bad.code).toBe(1);
    expect(bad.stderr).toBe("error: unknown option '--no-such-flag'\n");
    expect((await runCli('claude', ['-p', 'x', '--model'], { env, cwd })).code).toBe(1);
    expect((await runCli('claude', ['-p', 'x', '--output-format', 'xml'], { env, cwd })).code).toBe(1);
    const ok = await runCli('claude', ['-p', 'x', '--allowed-tools', 'Bash(git *)', 'Edit', '--model', 'm'], {
      env,
      cwd,
    });
    expect(ok.code).toBe(0);
    expect(ok.stdout).toBe('(fake-vendor) ok\n');
  });

  it('ca âm: -p không có prompt ⇒ exit 1; stream-json thiếu --verbose ⇒ exit 1 (giả định CL-STREAM-1)', async () => {
    const { env, cwd } = loggedIn();
    expect((await runCli('claude', ['-p'], { env, cwd })).code).toBe(1);
    const r = await runCli('claude', ['-p', 'x', '--output-format', 'stream-json'], { env, cwd });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('requires --verbose');
  });

  it('prompt có thể đến từ stdin khi -p không kèm đối số', async () => {
    const { env, cwd } = loggedIn();
    const r = await runCli('claude', ['-p'], { env, cwd, input: 'hỏi qua stdin\n' });
    expect(r.code).toBe(0);
  });
});

describe('fake-claude: auth', () => {
  it('auth status: chưa đăng nhập ⇒ loggedIn=false + exit 1; không in danh tính theo mặc định (Spike 1b: chưa thấy trường email)', async () => {
    const r = await runCli('claude', ['auth', 'status'], { env: cliEnv(tmp()) });
    expect(r.code).toBe(1);
    expect(JSON.parse(r.stdout)).toEqual({ loggedIn: false, authMethod: 'none', apiProvider: 'firstParty' });
  });

  it('auth login: in URL, dán mã ⇒ credential `.credentials.json` có canary ⇒ status loggedIn', async () => {
    const home = tmp();
    const env = cliEnv(home);
    const r = await runCli('claude', ['auth', 'login'], { env, input: 'CODE\n' });
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/https:\/\/auth\.fake-claude\.invalid\/oauth\/authorize\?/);
    expect(r.stdout).toContain('Login successful.');
    expect(readFileSync(join(home, '.claude/.credentials.json'), 'utf8')).toMatch(CANARY);
    const st = await runCli('claude', ['auth', 'status'], { env });
    expect(st.code).toBe(0);
    expect(JSON.parse(st.stdout)).toEqual({ loggedIn: true, authMethod: 'oauth_token', apiProvider: 'firstParty' });
  });

  it('auth login: không dán mã ⇒ hết hạn exit 1, không có credential; login_abandoned bỏ qua cả mã đã dán', async () => {
    const home = tmp();
    const base = { GA_FAKE_LOGIN_TIMEOUT_MS: '300' };
    const none = await runCli('claude', ['auth', 'login'], { env: cliEnv(home, base) });
    expect(none.code).toBe(1);
    const ab = await runCli('claude', ['auth', 'login'], {
      env: cliEnv(home, { ...base, GA_FAKE_SCENARIO: 'login_abandoned' }),
      input: 'CODE\n',
    });
    expect(ab.code).toBe(1);
    expect(existsSync(join(home, '.claude/.credentials.json'))).toBe(false);
  });

  it('auth logout xoá credential ⇒ status quay về loggedIn=false', async () => {
    const { env, home } = loggedIn();
    expect((await runCli('claude', ['auth', 'status'], { env })).code).toBe(0);
    expect((await runCli('claude', ['auth', 'logout'], { env })).stdout).toBe('Logged out.\n');
    expect(existsSync(join(home, '.claude/.credentials.json'))).toBe(false);
    expect((await runCli('claude', ['auth', 'status'], { env })).code).toBe(1);
  });

  it('CLAUDE_CONFIG_DIR đổi nơi cấu hình; GA_FAKE_PRINT_IDENTITY=1 + identity_changed thêm trường email đổi theo', async () => {
    const cfg = join(tmp(), 'cfg');
    const env = cliEnv(tmp(), { CLAUDE_CONFIG_DIR: cfg, GA_FAKE_PRINT_IDENTITY: '1' });
    await runCli('claude', ['auth', 'login'], { env, input: 'c\n' });
    expect(existsSync(join(cfg, '.credentials.json'))).toBe(true);
    expect(JSON.parse((await runCli('claude', ['auth', 'status'], { env })).stdout).email).toBe(
      'fake-account-a@example.invalid',
    );
    const changed = await runCli('claude', ['auth', 'status'], {
      env: { ...env, GA_FAKE_SCENARIO: 'identity_changed' },
    });
    expect(JSON.parse(changed.stdout).email).toBe('fake-account-b@example.invalid');
  });

  it('chưa đăng nhập + -p ⇒ "Not logged in" exit 1 (giả định CL-ERR-2); ANTHROPIC_API_KEY / CLAUDE_CODE_OAUTH_TOKEN coi như đã đăng nhập', async () => {
    const home = tmp();
    const r = await runCli('claude', ['-p', 'hi', '--output-format', 'json'], { env: cliEnv(home), cwd: home });
    expect(r.code).toBe(1);
    expect(JSON.parse(r.stdout)).toMatchObject({ is_error: true, result: 'Not logged in · Please run /login' });
    for (const k of ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN']) {
      expect((await runCli('claude', ['-p', 'hi'], { env: cliEnv(home, { [k]: 'x' }), cwd: home })).code).toBe(0);
    }
  });
});

describe('fake-claude: lượt -p + transcript native', () => {
  it('GHI transcript native giống CLI thật: projects/<cwd>/<session>.jsonl + history.jsonl dưới thư mục cấu hình (CNS-132)', async () => {
    const { home, cwd, env } = loggedIn();
    const r = await runCli(
      'claude',
      [
        '-p',
        'nội dung bí mật của lượt',
        '--output-format',
        'json',
        '--session-id',
        '11111111-2222-4333-8444-555555555555',
      ],
      { env, cwd },
    );
    expect(r.code).toBe(0);
    const proj = join(home, '.claude/projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
    expect(readdirSync(proj)).toEqual(['11111111-2222-4333-8444-555555555555.jsonl']);
    const t = readFileSync(join(proj, '11111111-2222-4333-8444-555555555555.jsonl'), 'utf8');
    expect(t).toContain('nội dung bí mật của lượt');
    expect((lines(t) as Array<{ type: string; sessionId: string }>).map((l) => [l.type, l.sessionId])).toEqual([
      ['user', '11111111-2222-4333-8444-555555555555'],
      ['assistant', '11111111-2222-4333-8444-555555555555'],
    ]);
    expect(readFileSync(join(home, '.claude/history.jsonl'), 'utf8')).toContain('nội dung bí mật của lượt');
    expect(readdirSync(join(home, '.claude')).sort()).toEqual(['.credentials.json', 'history.jsonl', 'projects']);
  });

  it('--no-session-persistence ⇒ không ghi transcript (CLI thật có cờ này)', async () => {
    const { home, cwd, env } = loggedIn();
    await runCli('claude', ['-p', 'x', '--no-session-persistence'], { env, cwd });
    expect(existsSync(join(home, '.claude/projects'))).toBe(false);
  });

  it('CLAUDE_CONFIG_DIR=/auth/<en>: transcript rơi VÀO thư mục credential ⇒ chính là thứ auth-gc phải dọn', async () => {
    const auth = join(tmp(), 'auth-en-0001');
    const cwd = tmp('ga-cwd-');
    const env = cliEnv(tmp(), { CLAUDE_CONFIG_DIR: auth });
    seedCredentials('claude', env);
    await runCli('claude', ['-p', 'x'], { env, cwd });
    expect(readdirSync(auth).sort()).toEqual(['.credentials.json', 'history.jsonl', 'projects']);
  });

  it('stream-json: system/init → assistant → rate_limit_event → result; --include-partial-messages thêm stream_event', async () => {
    const { cwd, env } = loggedIn();
    const r = await runCli(
      'claude',
      ['-p', 'hi', '--output-format', 'stream-json', '--verbose', '--model', 'claude-test-1'],
      { env, cwd },
    );
    expect(r.code).toBe(0);
    const ev = lines(r.stdout) as Ev[];
    expect(ev.map((e) => e.type)).toEqual(['system', 'assistant', 'rate_limit_event', 'result']);
    expect(ev[0]).toMatchObject({ subtype: 'init', model: 'claude-test-1', claude_code_version: '2.1.299' });
    expect(ev[2]?.rate_limit_info?.status).toBe('allowed');
    const partial = lines(
      (
        await runCli(
          'claude',
          ['-p', 'hi', '--output-format', 'stream-json', '--verbose', '--include-partial-messages'],
          { env, cwd },
        )
      ).stdout,
    ) as Ev[];
    expect(partial.filter((e) => e.type === 'stream_event').map((e) => e.event?.type)).toEqual([
      'message_start',
      'content_block_start',
      'content_block_delta',
      'content_block_stop',
      'message_delta',
      'message_stop',
    ]);
  });

  const CASES: Array<[string, string, RegExp]> = [
    [
      'quota_exhausted',
      '{"name":"quota_exhausted","resetAt":"2026-10-16T19:00:00Z"}',
      /^You've hit your limit · resets 19:00 \(UTC\)$/,
    ],
    ['account_suspended', '{"name":"account_suspended"}', /^API Error: 403 .*permission_error.*suspended/],
    ['login_expired', '{"name":"login_expired"}', /^Please run \/login · API Error: 401 .*authentication_error/],
    ['outage', '{"name":"outage"}', /^API Error: 503 .*Temporarily|^API Error: 503 .*temporarily/],
    ['outage 529', '{"name":"outage","status":529}', /^API Error: 529 /],
    ['network_down', '{"name":"network_down"}', /^API Error: Unable to connect to API/],
    ['malformed_json', '{"name":"malformed_json"}', /^API Error: Unexpected token/],
  ];
  for (const [label, sc, re] of CASES) {
    it(`kịch bản ${label} ⇒ exit 1 + result is_error (json / stream-json / text nhất quán)`, async () => {
      const { cwd, env } = loggedIn({ GA_FAKE_SCENARIO: sc });
      const json = await runCli('claude', ['-p', 'hi', '--output-format', 'json'], { env, cwd });
      expect(json.code).toBe(1);
      const o = JSON.parse(json.stdout);
      expect(o).toMatchObject({ type: 'result', is_error: true, num_turns: 0 });
      expect(o.result).toMatch(re);
      const stream = lines(
        (await runCli('claude', ['-p', 'hi', '--output-format', 'stream-json', '--verbose'], { env, cwd })).stdout,
      ) as Ev[];
      const last = stream.at(-1);
      expect(last).toMatchObject({ type: 'result', is_error: true });
      expect(last?.result).toBe(o.result);
      const text = await runCli('claude', ['-p', 'hi'], { env, cwd });
      expect(text.code).toBe(1);
      expect(text.stdout).toBe(`${o.result}\n`);
    });
  }

  it('quota_exhausted trong stream-json phát rate_limit_event "rejected" kèm resetsAt (giả định CL-QUOTA-1)', async () => {
    const { cwd, env } = loggedIn({ GA_FAKE_SCENARIO: '{"name":"quota_exhausted","resetAt":"2026-10-16T19:00:00Z"}' });
    const ev = lines(
      (await runCli('claude', ['-p', 'x', '--output-format', 'stream-json', '--verbose'], { env, cwd })).stdout,
    ) as Ev[];
    expect(ev.find((e) => e.type === 'rate_limit_event')?.rate_limit_info).toEqual({
      status: 'rejected',
      resetsAt: Date.parse('2026-10-16T19:00:00Z') / 1000,
      rateLimitType: 'five_hour',
    });
  });

  it('hang ⇒ treo tới khi bị kill (không có timeout tự thân); version_drift ⇒ --version đổi', async () => {
    const { cwd, env } = loggedIn({ GA_FAKE_SCENARIO: 'hang' });
    await expect(runCli('claude', ['-p', 'x'], { env, cwd, timeoutMs: 500 })).rejects.toThrow(/treo quá/);
    const drift = await runCli('claude', ['--version'], { env: cliEnv(tmp(), { GA_FAKE_SCENARIO: 'version_drift' }) });
    expect(drift.stdout).toBe('2.2.0 (Claude Code)\n');
  });

  it('GA_FAKE_ROTATE_CREDS=1 ⇒ rename nguyên tử thay symlink credential (token mới không về /auth)', async () => {
    const home = tmp();
    const auth = tmp();
    const cwd = tmp('ga-cwd-');
    const env = cliEnv(home, { GA_FAKE_ROTATE_CREDS: '1' });
    seedCredentials('claude', { ...env, GA_FAKE_AUTH_DIR: auth });
    const link = credentialPath('claude', env);
    mkdirSync(join(link, '..'), { recursive: true });
    symlinkSync(join(auth, '.credentials.json'), link);
    const before = readFileSync(join(auth, '.credentials.json'), 'utf8');
    expect((await runCli('claude', ['-p', 'x'], { env, cwd })).code).toBe(0);
    expect(lstatSync(link).isSymbolicLink()).toBe(false);
    expect(readFileSync(join(auth, '.credentials.json'), 'utf8')).toBe(before);
  });
});

describe('fake-claude: gọi tool MCP theo kịch bản', () => {
  const script = (calls: Array<{ tool: string; args: unknown }>, reply?: string) =>
    JSON.stringify({ name: 'ok', script: { ...(reply ? { reply } : {}), calls } });

  it('--mcp-config (file hoặc JSON) + headers dạng biến môi trường + ticketFile ⇒ gọi tool, sự kiện tool_use / tool_result trong stream-json', async () => {
    const mcp = await startMockMcp();
    try {
      const { cwd, env } = loggedIn();
      const ticket = join(tmp(), 'ticket');
      writeFileSync(ticket, 'ticket-xyz\n', { mode: 0o400 });
      const cfg = JSON.stringify({ mcpServers: { ga: { type: 'http', url: mcp.url, ticketFile: ticket } } });
      const calls = [{ tool: 'set_field', args: { field: 'name', value: 'Mai' } }];
      const r = await runCli(
        'claude',
        ['-p', 'hi', '--output-format', 'stream-json', '--verbose', '--mcp-config', cfg],
        { env: { ...env, GA_FAKE_SCENARIO: script(calls, 'Xong') }, cwd },
      );
      expect(r.code).toBe(0);
      expect(mcp.calls).toEqual([
        { name: 'set_field', args: { field: 'name', value: 'Mai' }, authorization: 'Bearer ticket-xyz' },
      ]);
      const ev = lines(r.stdout) as Ev[];
      const use = ev
        .flatMap((e) => (e.type === 'assistant' ? (e.message?.content ?? []) : []))
        .find((c) => c.type === 'tool_use');
      expect(use).toMatchObject({ name: 'mcp__ga__set_field' });
      expect(
        ev.flatMap((e) => (e.type === 'user' ? (e.message?.content ?? []) : [])).find((c) => c.type === 'tool_result'),
      ).toMatchObject({ is_error: false, content: 'ok' });
      expect(ev.at(-1)?.result).toBe('Xong');
      // header ${VAR}
      const cfg2 = JSON.stringify({
        mcpServers: { ga: { type: 'http', url: mcp.url, headers: { authorization: `Bearer ${'$'}{GA_TEST_T}` } } },
      });
      await runCli('claude', ['-p', 'hi', '--mcp-config', cfg2], {
        env: { ...env, GA_TEST_T: 'from-env', GA_FAKE_SCENARIO: script(calls) },
        cwd,
      });
      expect(mcp.calls.at(-1)?.authorization).toBe('Bearer from-env');
    } finally {
      await mcp.close();
    }
  });

  it('ca injection (CNS-133): "$AUTH" ⇒ 4 tool bị gateway giả từ chối; stdout / transcript native không chứa canary NGOÀI thư mục credential', async () => {
    const mcp = await startMockMcp();
    try {
      const { home, cwd, env } = loggedIn();
      const cfg = JSON.stringify({ mcpServers: { ga: { type: 'http', url: mcp.url } } });
      const calls = ['send_telegram', 'remember', 'report_task', 'propose_change'].map((tool) => ({
        tool,
        args: { text: '$AUTH' },
      }));
      const r = await runCli(
        'claude',
        ['-p', 'hi', '--output-format', 'stream-json', '--verbose', '--mcp-config', cfg],
        { env: { ...env, GA_FAKE_SCENARIO: script(calls) }, cwd },
      );
      expect(r.code).toBe(0);
      for (const c of mcp.calls) expect(JSON.stringify(c.args)).toMatch(CANARY);
      const results = (lines(r.stdout) as Ev[])
        .flatMap((e) => (e.type === 'user' ? (e.message?.content ?? []) : []))
        .filter((c) => c.type === 'tool_result');
      expect(results.map((c) => c.content)).toEqual(Array(4).fill('denied: credential_like_payload'));
      expect(r.stdout + r.stderr).not.toMatch(CANARY);
      const transcript = readFileSync(
        join(
          home,
          '.claude/projects',
          cwd.replace(/[^a-zA-Z0-9]/g, '-'),
          readdirSync(join(home, '.claude/projects', cwd.replace(/[^a-zA-Z0-9]/g, '-')))[0] as string,
        ),
        'utf8',
      );
      expect(transcript).not.toMatch(CANARY);
      // công tắc thử bộ lọc stdout của runner: in args thật
      const echo = await runCli(
        'claude',
        ['-p', 'hi', '--output-format', 'stream-json', '--verbose', '--mcp-config', cfg],
        { env: { ...env, GA_FAKE_ECHO_TOOL_ARGS: '1', GA_FAKE_SCENARIO: script(calls.slice(0, 1)) }, cwd },
      );
      expect(echo.stdout).toContain('"$AUTH"');
    } finally {
      await mcp.close();
    }
  });

  it('ca âm: tool không có máy chủ MCP ⇒ lỗi từng bước, lượt không chết; --mcp-config JSON hỏng ⇒ lỗi nội bộ rõ ràng (không nuốt)', async () => {
    const { cwd, env } = loggedIn();
    const calls = [{ tool: 'recall', args: { query: 'x' } }];
    const r = await runCli('claude', ['-p', 'x', '--output-format', 'stream-json', '--verbose'], {
      env: { ...env, GA_FAKE_SCENARIO: script(calls) },
      cwd,
    });
    expect(r.code).toBe(0);
    const res = (lines(r.stdout) as Ev[])
      .flatMap((e) => (e.type === 'user' ? (e.message?.content ?? []) : []))
      .find((c) => c.type === 'tool_result');
    expect(res).toMatchObject({ is_error: true });
    const bad = await runCli('claude', ['-p', 'x', '--mcp-config', '{not json'], { env, cwd });
    expect(bad.code).toBe(70);
    expect(bad.stderr).toContain('fake-claude: lỗi nội bộ');
  });
});
