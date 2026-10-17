// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
//
// Gọi CLI giả ĐÚNG KIỂU ga-runner: argv do adapter dựng, env tối thiểu (chỉ HOME của lượt, không PATH, không GA_FAKE_*), cwd = thư mục lượt,
// credential nối vào HOME bằng symlink từ /auth/<en>, binary là launcher cài bởi engine-source dưới <engines>/<slug>/<version>/bin/.
// Mọi cấu hình test (vendor, kịch bản, vé, MCP) đi qua tệp config.json cạnh mã CLI giả (/opt/ga-fakes trong image test).
import { execFile } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installEngine } from '../engine-source/client.ts';
import { type FakeEngineSource, startEngineSource } from '../engine-source/server.ts';
import { seedCredentials } from '../lib/creds.ts';
import { type FakeVendor, startVendor } from '../vendor/server.ts';
import { FAKES_DIR, lines, type MockMcp, startMockMcp, tmp } from './helpers.ts';

interface Ctx {
  root: string;
  fakes: string;
  engines: string;
  src: FakeEngineSource;
  vendor: FakeVendor;
  mcp: MockMcp;
}
let c: Ctx;

beforeEach(async () => {
  const root = tmp('ga-runner-');
  const fakes = join(root, 'opt/ga-fakes'); // đúng như image test chép testing/fakes vào /opt/ga-fakes
  for (const d of ['lib', 'agy', 'claude']) cpSync(join(FAKES_DIR, d), join(fakes, d), { recursive: true });
  const engines = join(root, 'opt/engines');
  const src = await startEngineSource({ fakesRoot: fakes, nodeBin: process.execPath });
  for (const slug of ['agy', 'claude']) {
    const r = await installEngine({ baseUrl: src.url, slug, destDir: engines, platform: 'linux_amd64' });
    expect(r.state).toBe('installed');
  }
  c = { root, fakes, engines, src, vendor: await startVendor(), mcp: await startMockMcp() };
});
afterEach(async () => {
  await Promise.all([c.src.close(), c.vendor.close(), c.mcp.close()]);
});

const writeConfig = (cfg: Record<string, string>) => writeFileSync(join(c.fakes, 'config.json'), JSON.stringify(cfg));

/** Một lượt kiểu runner: HOME tmpfs của lượt, vé 0400, credential symlink từ /auth/<en>. Trả về các đường quan trọng. */
function newTurn(engine: 'agy' | 'claude') {
  const turnDir = join(c.root, 'run/ga', `T-${Math.random().toString(36).slice(2, 8)}`);
  const home = join(turnDir, 'home');
  mkdirSync(home, { recursive: true });
  writeFileSync(join(turnDir, 'ticket'), 'ticket-of-this-turn\n', { mode: 0o400 });
  const auth = join(c.root, 'auth', 'en-0001');
  seedCredentials(engine, { HOME: home, GA_FAKE_AUTH_DIR: auth });
  const credName = engine === 'claude' ? '.credentials.json' : 'oauth_creds.json';
  const credDir = engine === 'claude' ? join(home, '.claude') : join(home, '.gemini/antigravity-cli');
  mkdirSync(credDir, { recursive: true });
  symlinkSync(join(auth, credName), join(credDir, credName)); // "nối bằng symlink" (§B.5 bước 4)
  return { turnDir, home, auth, ticket: join(turnDir, 'ticket') };
}

function runLikeRunner(engine: 'agy' | 'claude', argv: string[], turn: { turnDir: string; home: string }) {
  const bin = join(c.engines, engine, engine === 'agy' ? '1.3.5' : '2.1.299', 'bin', engine);
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    // env CHỈ có HOME: không PATH, không GA_FAKE_*, không proxy — mọi thứ test cần phải tới được qua config.json
    execFile(bin, argv, { env: { HOME: turn.home }, cwd: turn.turnDir, timeout: 20_000 }, (e, stdout, stderr) =>
      resolve({ code: e ? ((e as { code?: number }).code ?? 1) : 0, stdout, stderr }),
    );
  });
}

describe('fake-claude gọi kiểu runner', () => {
  it('argv của adapter + env chỉ có HOME + cấu hình qua config.json: lượt chạy, gọi tool với vé, transcript chỉ nằm trong HOME', async () => {
    const t = newTurn('claude');
    writeFileSync(
      join(t.turnDir, 'mcp.json'),
      JSON.stringify({ mcpServers: { ga: { type: 'http', url: c.mcp.url } } }),
    );
    const script = { reply: 'Xin chào anh.', calls: [{ tool: 'set_field', args: { field: 'name', value: 'Mai' } }] };
    writeConfig({
      GA_FAKE_VENDOR_URL: c.vendor.url,
      GA_FAKE_TICKET_FILE: t.ticket,
      GA_FAKE_SCENARIO: JSON.stringify({ name: 'ok', script }),
    });
    const argv = [
      '-p',
      'Hãy tự giới thiệu',
      '--output-format',
      'stream-json',
      '--verbose',
      '--model',
      'adapter-chosen-model',
      '--mcp-config',
      join(t.turnDir, 'mcp.json'),
      '--append-system-prompt',
      'Bạn là Mai.',
    ];
    const r = await runLikeRunner('claude', argv, t);
    expect(r.stderr).toBe('');
    expect(r.code).toBe(0);
    expect((lines(r.stdout) as Array<{ type: string }>).map((e) => e.type)).toEqual([
      'system',
      'assistant',
      'user',
      'assistant',
      'rate_limit_event',
      'result',
    ]);
    expect(c.mcp.calls).toEqual([
      { name: 'set_field', args: { field: 'name', value: 'Mai' }, authorization: 'Bearer ticket-of-this-turn' },
    ]);
    expect(c.vendor.log).toMatchObject([{ engine: 'claude', model: 'adapter-chosen-model', status: 200 }]); // vendor URL chỉ có trong config.json

    // sau lượt: transcript ở HOME (tmpfs), /auth chỉ còn tệp credential, symlink vẫn trỏ đúng
    expect(existsSync(join(t.home, '.claude/projects'))).toBe(true);
    expect(readdirSync(t.auth)).toEqual(['.credentials.json']);
    expect(lstatSync(join(t.home, '.claude/.credentials.json')).isSymbolicLink()).toBe(true);
    rmSync(t.home, { recursive: true }); // runner xoá /run/ga/<lượt>
    expect(readdirSync(t.auth)).toEqual(['.credentials.json']);
  });

  it('đổi config.json giữa các lượt đổi hành vi (hết quota → ok) mà không đụng env / container', async () => {
    const t1 = newTurn('claude');
    writeConfig({
      GA_FAKE_VENDOR_URL: c.vendor.url,
      GA_FAKE_SCENARIO: '{"name":"quota_exhausted","resetAt":"2026-10-16T19:00:00Z"}',
    });
    const argv = ['-p', 'x', '--output-format', 'json'];
    const bad = await runLikeRunner('claude', argv, t1);
    expect(bad.code).toBe(1);
    expect(JSON.parse(bad.stdout)).toMatchObject({ is_error: true, result: expect.stringContaining('19:00') });
    writeConfig({ GA_FAKE_VENDOR_URL: c.vendor.url });
    const ok = await runLikeRunner('claude', argv, newTurn('claude'));
    expect(ok.code).toBe(0);
  });

  it('không có config.json: CLI vẫn chạy (kịch bản ok, tự đóng vai hãng); cấu hình hỏng ⇒ exit 70', async () => {
    const t = newTurn('claude');
    const argv = ['-p', 'x'];
    expect((await runLikeRunner('claude', argv, t)).code).toBe(0);
    writeConfig({ PATH: '/x' });
    const bad = await runLikeRunner('claude', argv, newTurn('claude'));
    expect(bad.code).toBe(70);
  });
});

describe('fake-agy gọi kiểu runner', () => {
  it('argv của adapter (--model/--effort/--print-timeout) + MCP qua tệp + vé; native state chỉ trong HOME; /auth chỉ còn credential', async () => {
    const t = newTurn('agy');
    const mcpFile = join(t.turnDir, 'mcp.json');
    writeFileSync(mcpFile, JSON.stringify({ mcpServers: { ga: { type: 'http', url: c.mcp.url } } }));
    const script = { reply: 'Đã ghi.', calls: [{ tool: 'recall', args: { query: 'x' } }] };
    writeConfig({
      GA_FAKE_VENDOR_URL: c.vendor.url,
      GA_FAKE_TICKET_FILE: t.ticket,
      GA_FAKE_MCP_CONFIG: mcpFile,
      GA_FAKE_SCENARIO: JSON.stringify({ name: 'ok', script }),
    });
    const argv = [
      '-p',
      'Hãy tự giới thiệu',
      '--output-format',
      'stream-json',
      '--model',
      'adapter-chosen-model',
      '--effort',
      'low',
      '--print-timeout',
      '30s',
    ];
    const r = await runLikeRunner('agy', argv, t);
    expect(r.stderr).toBe('');
    expect(r.code).toBe(0);
    expect((lines(r.stdout) as Array<{ type: string }>).map((e) => e.type)).toEqual([
      'init',
      'tool_call',
      'tool_result',
      'delta',
      'result',
    ]);
    expect(c.mcp.calls).toEqual([
      { name: 'recall', args: { query: 'x' }, authorization: 'Bearer ticket-of-this-turn' },
    ]);
    expect(existsSync(join(t.home, '.gemini/antigravity-cli/conversations'))).toBe(true);
    expect(readdirSync(t.auth)).toEqual(['oauth_creds.json']);
    rmSync(t.home, { recursive: true });
    expect(readdirSync(t.auth)).toEqual(['oauth_creds.json']);
  });

  it('GA_FAKE_ROTATE_CREDS qua config.json: xoay token thay symlink trong HOME, tệp ở /auth giữ token cũ (bằng chứng cho IT chọn cách nối)', async () => {
    const t = newTurn('agy');
    writeConfig({ GA_FAKE_ROTATE_CREDS: '1' });
    expect((await runLikeRunner('agy', ['-p', 'x'], t)).code).toBe(0);
    expect(lstatSync(join(t.home, '.gemini/antigravity-cli/oauth_creds.json')).isSymbolicLink()).toBe(false);
  });

  it('GA_FAKE_SELF_UPDATE: tự cập nhật thử ghi CẠNH launcher đã cài (<engines>/agy/<ver>/bin), không phải cạnh mã', async () => {
    const t = newTurn('agy');
    writeConfig({ GA_FAKE_SELF_UPDATE: 'warn' });
    expect((await runLikeRunner('agy', ['--version'], t)).stdout).toBe('1.3.5\n');
    expect(existsSync(join(c.engines, 'agy/1.3.5/bin/.fake-self-update'))).toBe(true);
    expect(existsSync(join(c.fakes, 'agy/.fake-self-update'))).toBe(false);
  });

  it('hết hạn đăng nhập (kịch bản trong config.json) ⇒ exit 3 + AGY_ERROR; chưa đăng nhập (không credential) ⇒ OAuth, exit 1', async () => {
    const t = newTurn('agy');
    writeConfig({ GA_FAKE_VENDOR_URL: c.vendor.url, GA_FAKE_SCENARIO: 'login_expired' });
    const r = await runLikeRunner('agy', ['-p', 'x', '--output-format', 'json'], t);
    expect(r.code).toBe(3);
    expect(r.stderr).toContain('AGY_ERROR:');
    // HOME mới, không credential, hết hạn chờ mã sớm nhờ config
    const fresh = join(c.root, 'run/ga/T-fresh');
    mkdirSync(join(fresh, 'home'), { recursive: true });
    writeConfig({ GA_FAKE_LOGIN_TIMEOUT_MS: '300' });
    const o = await runLikeRunner('agy', ['-p', 'x', '--output-format', 'json'], {
      turnDir: fresh,
      home: join(fresh, 'home'),
    });
    expect(o.code).toBe(1);
    expect(o.stderr).toContain('Authentication required. Please visit the URL to log in:');
  });
});

describe('launcher không phụ thuộc PATH', () => {
  it('thiếu node ở mọi nơi ⇒ exit 127 + thông báo rõ (không treo, không im lặng)', async () => {
    const src = await startEngineSource({ fakesRoot: c.fakes, nodeBin: '/khong/co/node' });
    try {
      const r = await installEngine({
        baseUrl: src.url,
        slug: 'agy',
        destDir: join(c.root, 'opt/e2'),
        platform: 'linux_amd64',
      });
      expect(r.state).toBe('installed');
      if (r.state !== 'installed') return;
      const out = await new Promise<{ code: number | null; stderr: string }>((resolve) =>
        execFile(r.path, ['--version'], { env: {} }, (e, _o, stderr) =>
          resolve({ code: e ? ((e as { code?: number }).code ?? 1) : 0, stderr }),
        ),
      );
      expect(out.code).toBe(127);
      expect(out.stderr).toContain('không tìm thấy node');
    } finally {
      await src.close();
    }
  });
});
