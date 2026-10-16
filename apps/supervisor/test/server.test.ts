import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildTermWebSocketInit, ExecFrame, PTY, SUPERVISOR_RPC } from '@ga/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { signRpc, signTicketForTest } from '../src/auth.ts';
import { silentLogger } from '../src/log.ts';
import { LOGIN_CLOSE_WINSIZE } from '../src/pty.ts';
import { createSupervisorServer } from '../src/server.ts';
import { SYS, setup } from './helpers.ts';

// HTTP của supervisor: RPC ký HMAC + relay PTY trên /term (runtime giả).

let server: Server | null = null;
afterEach(async () => {
  if (server) await new Promise((r) => server?.close(r));
  server = null;
});

async function boot(maxDuration = 600) {
  const s = setup({}, maxDuration);
  server = createSupervisorServer({
    svc: s.svc,
    pty: s.pty,
    supervisorKey: s.supervisorKey,
    clock: s.clock,
    log: silentLogger,
  });
  await new Promise<void>((r) => server?.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const rpc = async (method: string, body: unknown, opts: { key?: Buffer; ts?: string; sigOverride?: string } = {}) => {
    const path = `${SUPERVISOR_RPC.basePath}/${method}`;
    const raw = JSON.stringify(body);
    const ts = opts.ts ?? String(Math.floor(s.clock.now().getTime() / 1000));
    const sig = opts.sigOverride ?? signRpc(opts.key ?? s.supervisorKey, ts, 'POST', path, raw);
    const r = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ga-ts': ts, 'x-ga-sig': sig },
      body: raw,
    });
    return { status: r.status, text: await r.text() };
  };
  return { ...s, base, rpc };
}

describe('RPC — HMAC, schema chặt', () => {
  it('status ký đúng ⇒ 200', async () => {
    const b = await boot();
    const r = await b.rpc('status', {});
    expect(r.status).toBe(200);
    expect(JSON.parse(r.text)).toMatchObject({ dockerReachable: true, templates: ['role.v1', 'sys.v1'] });
  });
  it.each([
    ['không chữ ký', { sigOverride: '' }],
    ['khoá khác', { key: randomBytes(32) }],
    ['giờ quá lệch', { ts: '1000' }],
  ])('%s ⇒ 401', async (_n, o) => {
    const b = await boot();
    expect((await b.rpc('status', {}, o)).status).toBe(401);
  });
  it('phát lại đúng yêu cầu đã ký ⇒ 401', async () => {
    const b = await boot();
    const ts = String(Math.floor(b.clock.now().getTime() / 1000));
    const sig = signRpc(b.supervisorKey, ts, 'POST', '/rpc/v1/status', '{}');
    expect((await b.rpc('status', {}, { ts, sigOverride: sig })).status).toBe(200);
    expect((await b.rpc('status', {}, { ts, sigOverride: sig })).status).toBe(401);
  });
  it.each([
    ['mẫu không version', 'ensureContainer', { consumer: SYS, template: 'sys', authVolumes: [] }],
    [
      'spec Docker tự do (privileged)',
      'ensureContainer',
      { consumer: SYS, template: 'sys.v1', authVolumes: [], privileged: true },
    ],
    [
      'exec vào ga-app',
      'exec',
      {
        container: { name: 'ga-app' },
        run: { command: 'turn', turnId: '01JABCDEFGHJKMNPQRSTVWXYZ0', ticket: 'T'.repeat(43) },
        timeoutMs: 1000,
      },
    ],
    [
      'exec chương trình tự do',
      'exec',
      { container: { name: 'ga-sys-AB12' }, run: { command: 'sh' }, timeoutMs: 1000 },
    ],
    ['exec argv tự do', 'exec', { container: { name: 'ga-sys-AB12' }, argv: ['sh', '-c', 'id'], timeoutMs: 1000 }],
    ['stop ga-updater', 'stop', { container: { name: 'ga-updater' } }],
    [
      'authGc kèm danh sách tệp',
      'authGc',
      { container: { name: 'ga-sys-AB12' }, engineSlug: 'x', engineAccount: 'EN-0001', allowlist: [] },
    ],
  ])('%s ⇒ 400', async (_n, method, body) => {
    const b = await boot();
    expect((await b.rpc(method, body)).status).toBe(400);
  });
  it('stop container lạ trùng mẫu tên (không nhãn) ⇒ 403 not_managed', async () => {
    const b = await boot();
    b.rt.addForeign('ga-sys-ZZZZ');
    const r = await b.rpc('stop', { container: { name: 'ga-sys-ZZZZ' } });
    expect(r.status).toBe(403);
    expect(JSON.parse(r.text).error).toBe('not_managed');
  });
  it('phương thức lạ ⇒ 404', async () => {
    const b = await boot();
    expect((await b.rpc('inspect', { container: { name: 'ga-app' } })).status).toBe(404);
  });
});

describe('RPC exec — EXEC_ARGV, env do supervisor đặt, vé qua stdin, luồng NDJSON', () => {
  it('turn: argv cố định, env đúng 2 biến (gateway của supervisor), vé chỉ ở stdin', async () => {
    const b = await boot();
    await b.svc.ensureContainer({ consumer: SYS, template: 'sys.v1', authVolumes: [] });
    await b.svc.start('ga-sys-AB12');
    b.rt.onExec = (e) => {
      e.stdout.write('{"$ga":"line"}\n');
      e.finish(0);
    };
    const ticket = 'T'.repeat(43);
    const r = await b.rpc('exec', {
      container: { name: 'ga-sys-AB12' },
      run: { command: 'turn', turnId: '01JABCDEFGHJKMNPQRSTVWXYZ0', ticket },
      timeoutMs: 5000,
    });
    expect(r.status).toBe(200);
    const frames = r.text
      .trim()
      .split('\n')
      .map((l) => ExecFrame.parse(JSON.parse(l)));
    expect(frames.at(-1)).toMatchObject({ type: 'exit', exitCode: 0, timedOut: false });
    const e = b.rt.execs[0];
    expect(e?.spec.Cmd).toEqual(['/usr/local/bin/ga-runner', 'turn']);
    expect(e?.spec.Env).toEqual(['GA_TURN_ID=01JABCDEFGHJKMNPQRSTVWXYZ0', 'GA_GATEWAY_URL=http://ga-app:7410']);
    expect(e?.spec.Env.join(' ')).not.toContain(ticket);
    expect(e?.stdin.join('')).toBe(`${ticket}\n`);
  });
  it('container chưa chạy ⇒ 409', async () => {
    const b = await boot();
    await b.svc.ensureContainer({ consumer: SYS, template: 'sys.v1', authVolumes: [] });
    const r = await b.rpc('exec', {
      container: { name: 'ga-sys-AB12' },
      run: { command: 'turn', turnId: '01JABCDEFGHJKMNPQRSTVWXYZ0', ticket: 'T'.repeat(43) },
      timeoutMs: 5000,
    });
    expect(r.status).toBe(409);
  });
});

// ---------------------------------------------------------------- PTY
async function ptyBoot(maxDuration = 600) {
  const b = await boot(maxDuration);
  await b.svc.ensureContainer({ consumer: SYS, template: 'sys.v1', authVolumes: ['ga-auth-en-0001'] });
  await b.svc.start('ga-sys-AB12');
  b.rt.onExec = () => {}; // phiên login chạy tới khi bị đóng
  const now = Math.floor(b.clock.now().getTime() / 1000);
  const ticket = (over: Record<string, unknown> = {}) =>
    signTicketForTest(
      {
        v: 2,
        acc: 'EN-0001',
        container: 'ga-sys-AB12',
        engineSlug: 'demo',
        authMethod: 'subscription',
        guiSessionHash: 'a'.repeat(64),
        exp: now + 60,
        nonce: randomBytes(16).toString('base64url'),
        ...over,
      },
      b.termKey,
    );
  const open = (t: string, url?: string) => {
    const init = buildTermWebSocketInit(b.base, t);
    const ws = new WebSocket(url ?? init.url, init.protocols);
    return new Promise<{ ws: WebSocket; msgs: string[]; bin: Buffer[] }>((resolve, reject) => {
      const msgs: string[] = [];
      const bin: Buffer[] = [];
      ws.on('message', (d, isBin) => (isBin ? bin.push(d as Buffer) : msgs.push(String(d))));
      ws.on('open', () => resolve({ ws, msgs, bin }));
      ws.on('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
      ws.on('error', reject);
    });
  };
  return { ...b, ticket, open };
}

const until = async (f: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!f() && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
  return f();
};

describe('PTY /term — vé trong subprotocol, exec ga-runner login, đóng theo 4 lý do', () => {
  it('mở: exec đúng `ga-runner login` + 3 biến env từ vé; chỉ vọng lại subprotocol phiên bản; chuyển byte hai chiều', async () => {
    const b = await ptyBoot();
    const c = await b.open(b.ticket());
    expect(c.ws.protocol).toBe(PTY.protocol);
    await until(() => c.msgs.length > 0);
    expect(JSON.parse(c.msgs[0] as string)).toEqual({ type: 'opened', maxDurationSeconds: 600 });
    const e = b.rt.execs[0];
    expect(e?.spec).toMatchObject({ Cmd: ['/usr/local/bin/ga-runner', 'login'], Tty: true, User: '10001:10001' });
    expect(e?.spec.Env).toEqual(['GA_ENGINE_SLUG=demo', 'GA_ENGINE_ACCOUNT=EN-0001', 'GA_AUTH_METHOD=subscription']);
    e?.stdout.write('https://login.vendor.invalid/oauth\r\n');
    c.ws.send(Buffer.from('MÃ-123\r'), { binary: true });
    await until(() => c.bin.length > 0 && (e?.stdin.length ?? 0) > 0);
    expect(Buffer.concat(c.bin).toString()).toContain('oauth');
    expect(e?.stdin.join('')).toBe('MÃ-123\r');
    c.ws.close();
  });

  it.each(['owner_done', 'login_ok'] as const)(
    'đóng vì %s: gửi closed + reason, đổi cửa sổ sang kích thước "đóng phiên", ghi sự kiện',
    async (reason) => {
      const b = await ptyBoot();
      const c = await b.open(b.ticket());
      const e = b.rt.execs[0];
      if (!e) throw new Error('không có exec');
      let rpc: Promise<boolean> | null = null;
      if (reason === 'owner_done') c.ws.send(JSON.stringify({ type: 'owner_done' }));
      else rpc = b.pty.closeByRpc('ga-sys-AB12', 'EN-0001', 'login_ok');
      await until(() => e.resizes.length > 0);
      e.finish(0); // ga-runner login nhận SIGWINCH và thoát
      if (rpc) expect(await rpc).toBe(true);
      await until(() => b.pty.eventsSince(0).events.length > 0);
      expect(e.resizes[0]).toEqual([LOGIN_CLOSE_WINSIZE.cols, LOGIN_CLOSE_WINSIZE.rows]);
      expect(c.msgs.map((m) => JSON.parse(m))).toContainEqual({ type: 'closed', reason });
      expect(b.pty.eventsSince(0).events[0]).toMatchObject({ reason, execStopped: true, engineAccount: 'EN-0001' });
    },
  );

  it('WebSocket đóng ⇒ ws_closed, exec bị đóng', async () => {
    const b = await ptyBoot();
    const c = await b.open(b.ticket());
    const e = b.rt.execs[0];
    if (!e) throw new Error('không có exec');
    c.ws.close();
    await until(() => e.resizes.length > 0);
    e.finish(0);
    await until(() => b.pty.eventsSince(0).events.length > 0);
    expect(b.pty.eventsSince(0).events[0]).toMatchObject({ reason: 'ws_closed', execStopped: true });
  });

  it('hết trần thời gian ⇒ max_duration', async () => {
    const b = await ptyBoot(2);
    const c = await b.open(b.ticket());
    const e = b.rt.execs[0];
    if (!e) throw new Error('không có exec');
    await until(() => e.resizes.length > 0, 4000);
    e.finish(0);
    await until(() => b.pty.eventsSince(0).events.length > 0);
    expect(b.pty.eventsSince(0).events[0]?.reason).toBe('max_duration');
    expect(c.msgs.map((m) => JSON.parse(m))).toContainEqual({ type: 'closed', reason: 'max_duration' });
  });

  it('khung resize từ trình duyệt chỉ trong 1..1000 (không giả được tín hiệu đóng phiên)', async () => {
    const b = await ptyBoot();
    const c = await b.open(b.ticket());
    const e = b.rt.execs[0];
    c.ws.send(JSON.stringify({ type: 'resize', cols: LOGIN_CLOSE_WINSIZE.cols, rows: LOGIN_CLOSE_WINSIZE.rows }));
    c.ws.send(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }));
    await until(() => (e?.resizes.length ?? 0) > 0);
    expect(e?.resizes).toEqual([[120, 40]]);
    c.ws.close();
  });

  it('vé phát lại ⇒ 401', async () => {
    const b = await ptyBoot();
    const t = b.ticket();
    const c = await b.open(t);
    c.ws.close();
    await expect(b.open(t)).rejects.toThrow('HTTP 401');
  });
  it.each([
    [
      'vé hết hạn',
      (b: Awaited<ReturnType<typeof ptyBoot>>) => b.ticket({ exp: Math.floor(b.clock.now().getTime() / 1000) - 1 }),
      'HTTP 401',
    ],
    [
      'vé ký khoá khác',
      (_b: Awaited<ReturnType<typeof ptyBoot>>) => signTicketForTest({ v: 2 }, randomBytes(32)),
      'HTTP 401',
    ],
    [
      'vé của tài khoản không mount vào container',
      (b: Awaited<ReturnType<typeof ptyBoot>>) => b.ticket({ acc: 'EN-0002' }),
      'HTTP 403',
    ],
    [
      'vé nhắm container không quản (ga-sys-ZZZZ)',
      (b: Awaited<ReturnType<typeof ptyBoot>>) => {
        b.rt.addForeign('ga-sys-ZZZZ');
        return b.ticket({ container: 'ga-sys-ZZZZ' });
      },
      'HTTP 403',
    ],
  ])('%s ⇒ %s', async (_n, make, err) => {
    const b = await ptyBoot();
    await expect(b.open(make(b))).rejects.toThrow(err);
    expect(b.rt.execs).toHaveLength(0);
  });
  it('vé đặt trong URL (query) ⇒ 400, không exec', async () => {
    const b = await ptyBoot();
    const t = b.ticket();
    await expect(b.open(t, `${b.base.replace('http', 'ws')}/term?ticket=${t}`)).rejects.toThrow('HTTP 400');
    expect(b.rt.execs).toHaveLength(0);
  });
  it('phiên thứ hai cùng (container, tài khoản) ⇒ 403', async () => {
    const b = await ptyBoot();
    const c = await b.open(b.ticket());
    await expect(b.open(b.ticket())).rejects.toThrow('HTTP 403');
    c.ws.close();
  });
});
