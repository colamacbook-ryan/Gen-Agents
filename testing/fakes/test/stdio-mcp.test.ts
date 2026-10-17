// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
//
// Máy chủ MCP `stdio` (dạng adapter ghi, Gen duyệt 2026-10-16): CLI giả spawn lệnh khai trong cấu hình và nói MCP qua stdio;
// cầu giả `bridge-bin/ga-runner mcp-bridge --url … --ticket-file …` chuyển sang gateway giả với vé đọc từ tệp. Ca âm: máy chủ
// không có trong cấu hình ⇒ không spawn, không gọi gì; agy `--allowed-tools` (AGY-T03) ngoài tiền tố ⇒ không gọi.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { agyStateDir, seedCredentials } from '../lib/creds.ts';
import { cliEnv, FAKES_DIR, lines, runCli, startMockMcp, tmp } from './helpers.ts';

const BRIDGE_PATH = `${join(FAKES_DIR, 'bridge-bin')}:${process.env.PATH ?? ''}`;
const TICKET = 'TICKET-0123456789abcdef0123456789abcdef';
const calls = [{ tool: 'recall', args: { query: 'Mai' } }];
const script = (c = calls) => JSON.stringify({ name: 'ok', script: { reply: 'xong', calls: c } });

function setup(engine: 'agy' | 'claude') {
  const home = tmp();
  const env = cliEnv(home, { PATH: BRIDGE_PATH });
  seedCredentials(engine, env);
  const ticket = join(home, 'ticket');
  writeFileSync(ticket, `${TICKET}\n`, { mode: 0o400 });
  return { home, env, ticket };
}

function bridgeServer(url: string, ticket: string) {
  return { type: 'stdio', command: 'ga-runner', args: ['mcp-bridge', '--url', url, '--ticket-file', ticket], env: {} };
}

type Ev = { type: string; message?: { content?: Array<{ type: string; is_error?: boolean; name?: string }> } };

describe('MCP stdio qua cầu (fake-claude)', () => {
  it('--mcp-config máy chủ stdio ⇒ CLI giả spawn cầu, gateway nhận tools/call kèm vé từ tệp; vé không nằm trong cấu hình', async () => {
    const mcp = await startMockMcp();
    try {
      const { home, env, ticket } = setup('claude');
      const cfgPath = join(home, 'mcp.json');
      const cfg = JSON.stringify({ mcpServers: { ga: bridgeServer(mcp.url, ticket) } });
      writeFileSync(cfgPath, cfg);
      expect(cfg).not.toContain(TICKET);
      const r = await runCli(
        'claude',
        ['--mcp-config', cfgPath, '--strict-mcp-config', '--output-format', 'stream-json', '--verbose', '-p', 'hi'],
        { env: { ...env, GA_FAKE_SCENARIO: script() }, cwd: home },
      );
      expect(r.code).toBe(0);
      expect(mcp.calls).toEqual([{ name: 'recall', args: { query: 'Mai' }, authorization: `Bearer ${TICKET}` }]);
      expect(mcp.methods[0]).toBe('initialize');
      const uses = (lines(r.stdout) as Ev[]).flatMap((e) => (e.type === 'assistant' ? (e.message?.content ?? []) : []));
      expect(uses.find((c) => c.type === 'tool_use')).toMatchObject({ name: 'mcp__ga__recall' });
    } finally {
      await mcp.close();
    }
  });

  it('ca âm: cấu hình không có máy chủ nào / GA_FAKE_MCP_SERVER chọn tên không có ⇒ không spawn, gateway nhận 0 thông điệp', async () => {
    const mcp = await startMockMcp();
    try {
      const { home, env, ticket } = setup('claude');
      const empty = JSON.stringify({ mcpServers: {} });
      const r1 = await runCli(
        'claude',
        ['--mcp-config', empty, '--output-format', 'stream-json', '--verbose', '-p', 'hi'],
        {
          env: { ...env, GA_FAKE_SCENARIO: script() },
          cwd: home,
        },
      );
      const other = JSON.stringify({ mcpServers: { ga: bridgeServer(mcp.url, ticket) } });
      const r2 = await runCli(
        'claude',
        ['--mcp-config', other, '--output-format', 'stream-json', '--verbose', '-p', 'hi'],
        {
          env: { ...env, GA_FAKE_SCENARIO: script(), GA_FAKE_MCP_SERVER: 'khong-co' },
          cwd: home,
        },
      );
      for (const r of [r1, r2]) {
        expect(r.code).toBe(0);
        const res = (lines(r.stdout) as Ev[])
          .flatMap((e) => (e.type === 'user' ? (e.message?.content ?? []) : []))
          .find((c) => c.type === 'tool_result');
        expect(res).toMatchObject({ is_error: true });
      }
      expect(mcp.methods).toEqual([]);
    } finally {
      await mcp.close();
    }
  });
});

describe('MCP stdio qua cầu (fake-agy) + --allowed-tools (AGY-T03)', () => {
  function writeAgyMcp(home: string, server: unknown) {
    const dir = agyStateDir({ HOME: home });
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'mcp_servers.json'), JSON.stringify({ ga: server }));
  }

  it('mcp_servers.json (dạng phẳng như `mcp add`) máy chủ stdio + --allowed-tools mcp__ga ⇒ gọi qua cầu với vé', async () => {
    const mcp = await startMockMcp();
    try {
      const { home, env, ticket } = setup('agy');
      writeAgyMcp(home, bridgeServer(mcp.url, ticket));
      const r = await runCli('agy', ['--output-format', 'stream-json', '--allowed-tools', 'mcp__ga', '-p', 'hi'], {
        env: { ...env, GA_FAKE_SCENARIO: script() },
        cwd: home,
      });
      expect(r.code, r.stderr).toBe(0);
      expect(mcp.calls).toEqual([{ name: 'recall', args: { query: 'Mai' }, authorization: `Bearer ${TICKET}` }]);
      const evs = lines(r.stdout) as Array<{ type: string; name?: string; is_error?: boolean }>;
      expect(evs.find((e) => e.type === 'tool_call')).toMatchObject({ name: 'recall' });
      expect(evs.find((e) => e.type === 'tool_result')).toMatchObject({ is_error: false });
    } finally {
      await mcp.close();
    }
  });

  it('ca âm: --allowed-tools với tiền tố khác ⇒ không spawn cầu, gateway nhận 0 thông điệp, tool_result lỗi', async () => {
    const mcp = await startMockMcp();
    try {
      const { home, env, ticket } = setup('agy');
      writeAgyMcp(home, bridgeServer(mcp.url, ticket));
      const r = await runCli('agy', ['--output-format', 'stream-json', '--allowed-tools', 'mcp__other', '-p', 'hi'], {
        env: { ...env, GA_FAKE_SCENARIO: script() },
        cwd: home,
      });
      expect(r.code).toBe(0);
      const res = (lines(r.stdout) as Array<{ type: string; is_error?: boolean; text?: string }>).find(
        (e) => e.type === 'tool_result',
      );
      expect(res).toMatchObject({ is_error: true });
      expect(res?.text).toContain('--allowed-tools');
      expect(mcp.methods).toEqual([]);
    } finally {
      await mcp.close();
    }
  });

  it('ca âm: không có máy chủ trong cấu hình ⇒ không gọi gì', async () => {
    const mcp = await startMockMcp();
    try {
      const { home, env } = setup('agy');
      const r = await runCli('agy', ['--output-format', 'stream-json', '-p', 'hi'], {
        env: { ...env, GA_FAKE_SCENARIO: script() },
        cwd: home,
      });
      expect(r.code).toBe(0);
      expect(mcp.methods).toEqual([]);
    } finally {
      await mcp.close();
    }
  });
});

describe('cầu MCP giả: ca âm đầu vào', () => {
  const run = (args: string[]) =>
    spawnSync(join(FAKES_DIR, 'bridge-bin', 'ga-runner'), args, { encoding: 'utf8', input: '', timeout: 10_000 });
  it('lệnh con khác mcp-bridge / thiếu vé / URL không phải http / cờ lạ ⇒ exit 2, có lý do', () => {
    const t = join(tmp(), 'ticket');
    writeFileSync(t, 'T');
    for (const args of [
      ['turn'],
      ['mcp-bridge', '--url', 'http://127.0.0.1:9/mcp'],
      ['mcp-bridge', '--url', 'file:///etc/passwd', '--ticket-file', t],
      ['mcp-bridge', '--url', 'http://127.0.0.1:9/mcp', '--ticket-file', t, '--evil', 'x'],
    ]) {
      const r = run(args);
      expect(r.status, args.join(' ')).toBe(2);
      expect(r.stderr).toContain('fake mcp-bridge');
    }
  });
});
