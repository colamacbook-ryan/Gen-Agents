// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { credentialPath, seedCredentials } from '../lib/creds.ts';
import { cliEnv, FAKES_DIR, lines, runCli, startCli, startMockMcp, tmp, waitFor } from './helpers.ts';

const data = (n: string) => readFileSync(join(FAKES_DIR, 'agy/dumps', n), 'utf8');
const CANARY = /GA-CANARY-[0-9a-f-]{36}/;

function loggedInHome(): { home: string; env: NodeJS.ProcessEnv } {
  const home = tmp();
  const env = cliEnv(home);
  seedCredentials('agy', env);
  return { home, env };
}

describe('fake-agy: bề mặt lấy nguyên văn từ Spike 1b', () => {
  it('--version / --help / help <sub> in đúng byte của dữ liệu', async () => {
    const env = cliEnv(tmp());
    expect((await runCli('agy', ['--version'], { env })).stdout).toBe(data('version.txt'));
    expect((await runCli('agy', ['--help'], { env })).stdout).toBe(data('help.txt'));
    expect((await runCli('agy', ['help'], { env })).stdout).toBe(data('help.txt'));
    expect((await runCli('agy', ['help', 'models'], { env })).stdout).toBe(data('help-models.txt'));
    expect((await runCli('agy', ['models', '--help'], { env })).stdout).toBe(data('help-models.txt'));
    expect((await runCli('agy', ['mcp', 'add', '--help'], { env })).stdout).toBe(data('help-mcp-add.txt'));
    expect((await runCli('agy', ['help', 'remote-control'], { env })).stdout).toBe(data('help-remote-control.txt'));
  });

  it('GA_FAKE_HELP_STREAM=stderr chuyển help sang stderr (stream thật chưa biết: ASSUMPTIONS AG-HELP-1)', async () => {
    const r = await runCli('agy', ['--help'], { env: cliEnv(tmp(), { GA_FAKE_HELP_STREAM: 'stderr' }) });
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(data('help.txt'));
  });

  it('agy models: chưa đăng nhập = exit 1 + câu "Please sign in" của Spike; đã đăng nhập = 11 dòng TSV', async () => {
    const out = await runCli('agy', ['models'], { env: cliEnv(tmp()) });
    expect(out.code).toBe(1);
    expect(out.stdout + out.stderr).toBe(
      'Fetching available models...\nError: Please sign in to view available models. Launch the CLI without arguments to sign in.\n',
    );
    const ok = await runCli('agy', ['models'], { env: loggedInHome().env });
    expect(ok.code).toBe(0);
    expect(ok.stdout).toBe(`Fetching available models...\n${data('models.tsv')}`);
    expect(ok.stdout.trim().split('\n')).toHaveLength(12);
  });

  it('agy mcp list rỗng in đúng "No MCP servers configured."; mcp add http rồi list/remove', async () => {
    const env = cliEnv(tmp());
    expect((await runCli('agy', ['mcp', 'list'], { env })).stdout).toBe('No MCP servers configured.\n');
    const add = await runCli(
      'agy',
      ['mcp', 'add', '-t', 'http', '--header', 'Authorization: Bearer t', 'gw', 'http://gw:7401/mcp'],
      { env },
    );
    expect(add.code).toBe(0);
    expect((await runCli('agy', ['mcp', 'list'], { env })).stdout).toContain('gw\thttp\thttp://gw:7401/mcp');
    expect((await runCli('agy', ['mcp', 'remove', 'gw'], { env })).code).toBe(0);
    expect((await runCli('agy', ['mcp', 'list'], { env })).stdout).toBe('No MCP servers configured.\n');
    expect((await runCli('agy', ['mcp', 'remove', 'gw'], { env })).code).toBe(1);
  });

  it('ca âm: cờ lạ ⇒ exit 2 (đúng quy ước Go flag + changelog 1.3.x); output-format sai ⇒ exit 2; -p + -i ⇒ exit 2', async () => {
    const env = cliEnv(tmp());
    const bad = await runCli('agy', ['--no-such-flag'], { env });
    expect(bad.code).toBe(2);
    expect(bad.stderr).toContain('flag provided but not defined: --no-such-flag');
    expect((await runCli('agy', ['-p', 'x', '--output-format', 'xml'], { env })).code).toBe(2);
    expect((await runCli('agy', ['-p', 'x', '--input-format', 'stream-json'], { env })).code).toBe(2);
    expect((await runCli('agy', ['-p', 'x', '-i', 'y'], { env })).code).toBe(2);
    expect((await runCli('agy', ['-p', 'x', '--print-timeout', 'abc'], { env: loggedInHome().env })).code).toBe(2);
  });
});

describe('fake-agy: đăng nhập OAuth giả', () => {
  it('chưa đăng nhập + -p ⇒ in URL + "paste the authorization code"; không dán, hết hạn ⇒ exit 1 + JSON lỗi của Spike', async () => {
    const r = await runCli('agy', ['-p', 'hi', '--output-format', 'json'], {
      env: cliEnv(tmp(), { GA_FAKE_LOGIN_TIMEOUT_MS: '300' }),
    });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(
      /^Authentication required\. Please visit the URL to log in:\n {2}https:\/\/accounts\.google\.com\/o\/oauth2\/auth\?/,
    );
    expect(r.stderr).toContain(
      'Waiting for authentication (timeout 60s)...\nOr, paste the authorization code here and press Enter:\n',
    );
    expect(r.stderr).toContain('Error: authentication timed out.\nerror: authentication failed or timed out\n');
    expect(JSON.parse(r.stdout)).toEqual({
      conversation_id: '',
      status: 'ERROR',
      response: '',
      error: 'authentication failed or timed out',
      duration_seconds: 0,
      num_turns: 0,
      usage: { input_tokens: 0, output_tokens: 0, thinking_tokens: 0, cache_read_tokens: 0, total_tokens: 0 },
    });
  });

  it('-p + dán mã vào stdin ⇒ ghi credential có canary vào thư mục trạng thái rồi chạy tiếp lượt', async () => {
    const home = tmp();
    const env = cliEnv(home);
    const r = await runCli('agy', ['-p', 'hi', '--output-format', 'json'], { env, input: 'FAKE-CODE\n' });
    expect(r.code).toBe(0);
    const cred = readFileSync(credentialPath('agy', env), 'utf8');
    expect(cred).toMatch(CANARY);
    expect(cred).toContain('ya29.FAKE-');
    expect(cred).toContain('1//0FAKE-');
    expect(JSON.parse(r.stdout)).toMatchObject({ status: 'SUCCESS', num_turns: 1, error: '' });
  });

  it('canary xác định được bằng GA_FAKE_CANARY; GA_FAKE_AUTH_DIR đặt riêng tệp credential (kiểu nối bằng env tới /auth/<en>)', async () => {
    const home = tmp();
    const auth = join(tmp(), 'auth-en-0001');
    const env = cliEnv(home, {
      GA_FAKE_CANARY: 'GA-CANARY-00000000-0000-4000-8000-000000000001',
      GA_FAKE_AUTH_DIR: auth,
    });
    await runCli('agy', ['-p', 'hi'], { env, input: 'c\n' });
    expect(readdirSync(auth)).toEqual(['oauth_creds.json']);
    expect(readFileSync(join(auth, 'oauth_creds.json'), 'utf8')).toContain(
      'GA-CANARY-00000000-0000-4000-8000-000000000001',
    );
    expect(existsSync(join(home, '.gemini/antigravity-cli/oauth_creds.json'))).toBe(false);
  });

  it('login_abandoned: có dán mã cũng không bao giờ đăng nhập được ⇒ hết hạn exit 1, không có credential', async () => {
    const home = tmp();
    const env = cliEnv(home, { GA_FAKE_LOGIN_TIMEOUT_MS: '400', GA_FAKE_SCENARIO: 'login_abandoned' });
    const r = await runCli('agy', ['-p', 'hi'], { env, input: 'CODE\n' });
    expect(r.code).toBe(1);
    expect(existsSync(credentialPath('agy', env))).toBe(false);
  });

  it('bị SIGTERM giữa lúc chờ mã ⇒ "authentication interrupted" (đúng dòng của Spike) + JSON lỗi trước khi chết', async () => {
    const child = startCli('agy', ['-p', 'hi', '--output-format', 'json'], { env: cliEnv(tmp()) });
    await waitFor(() => child.err().includes('paste the authorization code'), 5000, 'lời nhắc dán mã');
    child.kill('SIGTERM');
    await new Promise((r) => child.on('close', r));
    expect(child.err()).toContain('\nError: authentication interrupted.\nerror: authentication failed or timed out\n');
    expect(JSON.parse(child.out())).toMatchObject({ status: 'ERROR', error: 'authentication failed or timed out' });
  });

  it('SAU OAuth agy giả VẪN CHẠY như agent tương tác (supervisor phải tự đóng exec); đóng stdin thì thoát', async () => {
    const env = cliEnv(tmp());
    const child = startCli('agy', [], { env });
    await waitFor(() => child.err().includes('paste the authorization code'), 5000, 'lời nhắc dán mã');
    child.stdin?.write('CODE\n');
    await waitFor(() => child.out().includes('Agent session started'), 5000, 'agent khởi động sau OAuth');
    expect(readFileSync(credentialPath('agy', env), 'utf8')).toMatch(CANARY);
    await new Promise((r) => setTimeout(r, 600));
    expect(child.exitCode).toBeNull(); // vẫn chạy 600 ms sau OAuth
    child.stdin?.write('hello\n');
    await waitFor(() => child.out().includes('received 5 chars'), 5000, 'phản hồi tương tác');
    child.kill('SIGTERM');
    await new Promise((r) => child.on('close', r));
  });

  it('exitAfterLogin: biến thể agy thoát ngay sau OAuth', async () => {
    const env = cliEnv(tmp(), { GA_FAKE_SCENARIO: '{"name":"ok","exitAfterLogin":true}' });
    const r = await runCli('agy', [], { env, input: 'CODE\n' });
    expect(r.code).toBe(0);
    expect(r.stdout).not.toContain('Agent session started');
  });
});

describe('fake-agy: lượt -p', () => {
  it('thành công: text / json / stream-json; ghi trạng thái native; usage cộng đúng', async () => {
    const { home, env } = loggedInHome();
    const text = await runCli('agy', ['-p', 'xin chào'], { env });
    expect(text.code).toBe(0);
    expect(text.stdout).toBe('(fake-vendor) ok\n');

    const j = JSON.parse(
      (await runCli('agy', ['-p', 'xin chào', '--output-format', 'json', '--model', 'm-1'], { env })).stdout,
    );
    expect(j).toMatchObject({ status: 'SUCCESS', response: '(fake-vendor) ok', error: '', num_turns: 1 });
    expect(j.usage.total_tokens).toBe(j.usage.input_tokens + j.usage.output_tokens + j.usage.thinking_tokens);

    const s = lines((await runCli('agy', ['-p', 'x', '--output-format', 'stream-json'], { env })).stdout) as Array<{
      type: string;
    }>;
    expect(s.map((e) => e.type)).toEqual(['init', 'delta', 'result']);

    // trạng thái native: hội thoại (có prompt) + log — IT kiểm "sau lượt không còn" khi HOME là tmpfs của lượt
    const conv = join(home, '.gemini/antigravity-cli/conversations');
    expect(readdirSync(conv)).toHaveLength(3);
    expect(readFileSync(join(conv, readdirSync(conv)[0] as string), 'utf8')).toContain('"prompt"');
    expect(existsSync(join(home, '.gemini/antigravity-cli/log/agy.log'))).toBe(true);
  });

  const CASES: Array<
    [string, Record<string, unknown>, { http: number; status: string; retryable: boolean; kind: string }]
  > = [
    [
      'quota_exhausted',
      { resetAt: '2026-10-16T19:00:00Z' },
      { http: 429, status: 'RESOURCE_EXHAUSTED', retryable: false, kind: 'http' },
    ],
    ['account_suspended', {}, { http: 403, status: 'PERMISSION_DENIED', retryable: false, kind: 'http' }],
    ['login_expired', {}, { http: 401, status: 'UNAUTHENTICATED', retryable: false, kind: 'http' }],
    ['outage', {}, { http: 503, status: 'UNAVAILABLE', retryable: true, kind: 'http' }],
    ['outage', { status: 502 }, { http: 502, status: 'UNAVAILABLE', retryable: true, kind: 'http' }],
    ['network_down', {}, { http: 0, status: 'UNAVAILABLE', retryable: true, kind: 'network' }],
    ['malformed_json', {}, { http: 0, status: 'INTERNAL', retryable: false, kind: 'decode' }],
  ];
  for (const [name, params, want] of CASES) {
    it(`kịch bản ${name}${params.status ? ` (${params.status})` : ''} ⇒ exit 3 + JSON ERROR + dòng AGY_ERROR đọc được bằng máy`, async () => {
      const { env } = loggedInHome();
      const sc = JSON.stringify({ name, ...params });
      const r = await runCli('agy', ['-p', 'hi', '--output-format', 'json'], { env: { ...env, GA_FAKE_SCENARIO: sc } });
      expect(r.code).toBe(3);
      const out = JSON.parse(r.stdout);
      expect(out).toMatchObject({ status: 'ERROR', response: '' });
      const agyErr = /^AGY_ERROR: (.+)$/m.exec(r.stderr);
      expect(agyErr).not.toBeNull();
      const meta = JSON.parse(agyErr?.[1] as string);
      expect(meta).toMatchObject({
        status: want.status,
        error_code: want.http,
        code_kind: want.kind,
        retryable: want.retryable,
      });
      expect(meta.short_error).toBe(out.error);
      expect(meta.error_id).toMatch(/^[0-9a-f-]{36}-1$/);
      expect(r.stderr).toContain(`error: ${out.error}\n`);
    });
  }

  it('quota_exhausted có resetAt ⇒ thông điệp nêu giờ reset; không có ⇒ không nêu', async () => {
    const { env } = loggedInHome();
    const withReset = await runCli('agy', ['-p', 'x', '--output-format', 'json'], {
      env: { ...env, GA_FAKE_SCENARIO: '{"name":"quota_exhausted","resetAt":"2026-10-16T19:00:00Z"}' },
    });
    expect(JSON.parse(withReset.stdout).error).toContain('2026-10-16T19:00:00Z');
    const without = await runCli('agy', ['-p', 'x', '--output-format', 'json'], {
      env: { ...env, GA_FAKE_SCENARIO: 'quota_exhausted' },
    });
    expect(JSON.parse(without.stdout).error).not.toMatch(/resets at/);
  });

  it('GEMINI_API_KEY bắt đầu "invalid" ⇒ đúng lỗi API_KEY_INVALID (exit 3) của Spike 1b', async () => {
    const r = await runCli('agy', ['-p', 'hi', '--output-format', 'json'], {
      env: cliEnv(tmp(), { GEMINI_API_KEY: 'invalid-key' }),
    });
    expect(r.code).toBe(3);
    expect(r.stderr).toContain('reason:API_KEY_INVALID');
    expect(JSON.parse(/^AGY_ERROR: (.+)$/m.exec(r.stderr)?.[1] as string)).toMatchObject({
      status: 'INVALID_ARGUMENT',
      error_code: 400,
    });
  });

  it('hang + --print-timeout ⇒ CLI tự dừng exit 3 (code_kind timeout); không có timeout thì treo tới khi bị kill', async () => {
    const { env } = loggedInHome();
    const r = await runCli('agy', ['-p', 'x', '--output-format', 'json', '--print-timeout', '300ms'], {
      env: { ...env, GA_FAKE_SCENARIO: 'hang' },
      timeoutMs: 5000,
    });
    expect(r.code).toBe(3);
    expect(r.stderr).toContain('"code_kind":"timeout"');
    await expect(
      runCli('agy', ['-p', 'x'], { env: { ...env, GA_FAKE_SCENARIO: 'hang' }, timeoutMs: 600 }),
    ).rejects.toThrow(/treo quá/);
  });

  it('version_drift ⇒ --version khác bản đã kiểm; GA_FAKE_VERSION ép version tuỳ ý', async () => {
    const drift = await runCli('agy', ['--version'], { env: cliEnv(tmp(), { GA_FAKE_SCENARIO: 'version_drift' }) });
    expect(drift.stdout).toBe('1.4.0\n');
    expect((await runCli('agy', ['--version'], { env: cliEnv(tmp(), { GA_FAKE_VERSION: '2.0.0' }) })).stdout).toBe(
      '2.0.0\n',
    );
  });

  it('/usage: đăng nhập OAuth có groups (giả định AG-USAGE-1); quota_exhausted ⇒ remaining 0 + giờ reset', async () => {
    const { env } = loggedInHome();
    const ok = JSON.parse((await runCli('agy', ['-p', '/usage', '--output-format', 'json'], { env })).stdout);
    expect(ok.status).toBe('SUCCESS');
    expect(ok.command).toMatchObject({ name: 'usage', data: { groups: [{ remaining_fraction: 0.75 }] } });
    const q = JSON.parse(
      (
        await runCli('agy', ['-p', '/usage', '--output-format', 'json'], {
          env: { ...env, GA_FAKE_SCENARIO: '{"name":"quota_exhausted","resetAt":"2026-10-16T19:00:00Z"}' },
        })
      ).stdout,
    );
    expect(q.command.data.groups[0]).toMatchObject({ remaining_fraction: 0, reset_time: '2026-10-16T19:00:00Z' });
  });

  it('GA_FAKE_PRINT_IDENTITY=1 + identity_changed ⇒ danh tính in ra đổi (mặc định KHÔNG in, như Spike 1b)', async () => {
    const { env } = loggedInHome();
    expect((await runCli('agy', ['models'], { env })).stderr).toBe('');
    const same = await runCli('agy', ['models'], { env: { ...env, GA_FAKE_PRINT_IDENTITY: '1' } });
    expect(same.stderr).toBe('Signed in as fake-account-a@example.invalid\n');
    const changed = await runCli('agy', ['models'], {
      env: { ...env, GA_FAKE_PRINT_IDENTITY: '1', GA_FAKE_SCENARIO: 'identity_changed' },
    });
    expect(changed.stderr).toBe('Signed in as fake-account-b@example.invalid\n');
  });

  it('GA_FAKE_ROTATE_CREDS=1: xoay token bằng rename ⇒ THAY symlink credential bằng tệp thường (rủi ro §B.5 bước 4)', async () => {
    const home = tmp();
    const auth = tmp(); // đóng vai /auth/<en>
    const env = cliEnv(home, { GA_FAKE_ROTATE_CREDS: '1' });
    seedCredentials('agy', { ...env, GA_FAKE_AUTH_DIR: auth });
    const link = credentialPath('agy', env);
    mkdirSync(join(link, '..'), { recursive: true });
    symlinkSync(join(auth, 'oauth_creds.json'), link);
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    const before = readFileSync(join(auth, 'oauth_creds.json'), 'utf8');
    expect((await runCli('agy', ['-p', 'x'], { env })).code).toBe(0);
    expect(lstatSync(link).isSymbolicLink()).toBe(false); // symlink đã bị thay
    expect(readFileSync(join(auth, 'oauth_creds.json'), 'utf8')).toBe(before); // token mới KHÔNG về /auth
    expect(readFileSync(link, 'utf8')).not.toBe(before);
    expect(readFileSync(link, 'utf8')).toMatch(CANARY);
  });
});

describe('fake-agy: gọi tool MCP theo kịch bản (BUILD-PLAN §C.2)', () => {
  it('đọc máy chủ từ `agy mcp add`, gọi tool theo script, SSE cũng parse được; stdout không chứa args', async () => {
    for (const sse of [false, true]) {
      const mcp = await startMockMcp({ sse });
      try {
        const { env } = loggedInHome();
        await runCli('agy', ['mcp', 'add', '-t', 'http', '-H', 'Authorization: Bearer ticket-1', 'ga', mcp.url], {
          env,
        });
        const script = {
          reply: 'Đã ghi 2 field.',
          calls: [
            { tool: 'set_field', args: { field: 'name', value: 'Mai' } },
            { tool: 'recall', args: { query: 'x' } },
          ],
        };
        const r = await runCli('agy', ['-p', 'hi', '--output-format', 'stream-json'], {
          env: { ...env, GA_FAKE_SCENARIO: JSON.stringify({ name: 'ok', script }) },
        });
        expect(r.code).toBe(0);
        expect(mcp.calls.map((c) => c.name)).toEqual(['set_field', 'recall']);
        expect(mcp.calls[0]?.authorization).toBe('Bearer ticket-1');
        const ev = lines(r.stdout) as Array<{ type: string; text?: string; name?: string; is_error?: boolean }>;
        expect(ev.map((e) => e.type)).toEqual([
          'init',
          'tool_call',
          'tool_result',
          'tool_call',
          'tool_result',
          'delta',
          'result',
        ]);
        expect(ev.find((e) => e.type === 'delta')?.text).toBe('Đã ghi 2 field.');
        expect(ev.filter((e) => e.type === 'tool_result').every((e) => e.is_error === false)).toBe(true);
      } finally {
        await mcp.close();
      }
    }
  });

  it('ca injection (CNS-133): "$AUTH" = nội dung /auth đưa vào payload tool ⇒ gateway giả từ chối, lượt vẫn kết thúc, stdout KHÔNG có canary', async () => {
    const mcp = await startMockMcp();
    try {
      const { env } = loggedInHome();
      await runCli('agy', ['mcp', 'add', '-t', 'http', 'ga', mcp.url], { env });
      const script = {
        calls: ['send_telegram', 'remember', 'report_task', 'propose_change'].map((tool) => ({
          tool,
          args: { text: '$AUTH' },
        })),
      };
      const r = await runCli('agy', ['-p', 'hi', '--output-format', 'stream-json'], {
        env: { ...env, GA_FAKE_SCENARIO: JSON.stringify({ name: 'ok', script }) },
      });
      expect(r.code).toBe(0);
      expect(mcp.calls).toHaveLength(4);
      for (const c of mcp.calls) expect(JSON.stringify(c.args)).toMatch(CANARY); // payload thật sự mang credential
      const denied = (lines(r.stdout) as Array<{ type: string; text?: string }>).filter(
        (e) => e.type === 'tool_result',
      );
      expect(denied.map((e) => e.text)).toEqual(Array(4).fill('denied: credential_like_payload'));
      expect(r.stdout + r.stderr).not.toMatch(CANARY);
    } finally {
      await mcp.close();
    }
  });

  it('ca âm: không có máy chủ MCP ⇒ mỗi bước ghi lỗi, lượt không chết; MCP chết ⇒ lỗi từng bước', async () => {
    const { env } = loggedInHome();
    const script = { calls: [{ tool: 'recall', args: { query: 'x' } }] };
    const noServer = await runCli('agy', ['-p', 'x', '--output-format', 'stream-json'], {
      env: { ...env, GA_FAKE_SCENARIO: JSON.stringify({ name: 'ok', script }) },
    });
    expect(noServer.code).toBe(0);
    expect(
      (lines(noServer.stdout) as Array<{ type: string; is_error?: boolean; text?: string }>).find(
        (e) => e.type === 'tool_result',
      ),
    ).toMatchObject({ is_error: true, text: 'không có máy chủ MCP trong cấu hình' });
    await runCli('agy', ['mcp', 'add', 'ga', 'http://127.0.0.1:9/mcp'], { env });
    const dead = await runCli('agy', ['-p', 'x', '--output-format', 'stream-json'], {
      env: { ...env, GA_FAKE_SCENARIO: JSON.stringify({ name: 'ok', script }) },
    });
    expect(dead.code).toBe(0);
    expect(
      (lines(dead.stdout) as Array<{ type: string; is_error?: boolean }>).find((e) => e.type === 'tool_result')
        ?.is_error,
    ).toBe(true);
  });
});
