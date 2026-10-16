// IT runtime (BUILD-PLAN §E.2 DoD phần L-RT) — Docker THẬT: supervisor (driver docker qua socket-proxy), image runtime-test,
// egress, CLI giả của L-FAKE, adapter thật của L-ENG. Chạy: pnpm --filter @ga/supervisor test:it:runtime
import { randomBytes } from 'node:crypto';
import { request } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildConsumerContainer, type SupervisorError, signTicketForTest } from '../../../apps/supervisor/src/index.ts';
import {
  buildTermWebSocketInit,
  EngineInstallStatusResponse,
  ExecFrame,
  PTY,
  parseRunnerStdout,
} from '../../../packages/contracts/src/index.ts';
import { adapterFor } from '../../../packages/engines/src/index.ts';
import {
  buildImages,
  COMPOSE,
  cexec,
  cleanupManaged,
  composeDown,
  composeUp,
  containerIp,
  docker,
  ENGINES_VOLUME,
  PROJECT,
  RELEASE_IMAGE,
  ROLES_NET,
  type Supervisor,
  startSupervisor,
  waitHttp,
} from './harness.ts';

const WS = { kind: 'sys', workspaceId: '01JRT000000000000000000001', workspaceCode: 'RT01' } as const;
const SYS = 'ga-sys-RT01';
const ROLE = { kind: 'role', roleId: '01JRT000000000000000000002', roleDisplayId: 'RL-0001' } as const;
const VOL_AGY = 'ga-auth-en-9001';
const VOL_CLAUDE = 'ga-auth-en-9002';
const VOL_ROLE = 'ga-auth-en-9003';
const AGY = 'antigravity';
const CLAUDE = 'claude-code';

let sup: Supervisor;
let image = '';
let stubHost = '';
let sourceHost = '';
const turnTicket = randomBytes(32).toString('base64url');
const usedTickets: string[] = [];

const ulid = () => {
  const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  return `01JRT${Array.from(randomBytes(21), (b) => A[b % 32]).join('')}`;
};
const expiresAt = () => new Date(Date.now() + 10 * 60_000).toISOString();

async function rpcJson(method: string, body: unknown) {
  const r = await sup.rpc(method, body);
  return {
    status: r.status,
    json: r.text ? (JSON.parse(r.text.split('\n')[0] as string) as Record<string, unknown>) : null,
    text: r.text,
  };
}
const frames = (text: string) =>
  text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => ExecFrame.parse(JSON.parse(l)));
const stdoutOf = (fs: ExecFrame[]) => fs.map((f) => (f.type === 'stdout' ? f.data : '')).join('');
const protocol = (fs: ExecFrame[]) => {
  const s = stdoutOf(fs);
  return parseRunnerStdout(s.endsWith('\n') ? s.slice(0, -1).split('\n') : s ? s.split('\n') : []);
};

function ticket(over: Record<string, unknown> = {}) {
  const t = signTicketForTest(
    {
      v: 2,
      acc: 'EN-9001',
      container: SYS,
      engineSlug: AGY,
      authMethod: 'subscription',
      guiSessionHash: 'a'.repeat(64),
      exp: Math.floor(Date.now() / 1000) + 60,
      nonce: randomBytes(16).toString('base64url'),
      ...over,
    },
    sup.termKey,
  );
  usedTickets.push(t);
  return t;
}

interface Term {
  ws: WebSocket;
  text: () => string;
  control: Record<string, unknown>[];
  closed: Promise<number>;
}
function openTerm(t: string): Promise<Term> {
  const init = buildTermWebSocketInit(sup.base, t);
  const ws = new WebSocket(init.url, init.protocols);
  ws.binaryType = 'arraybuffer';
  let buf = '';
  const control: Record<string, unknown>[] = [];
  const closed = new Promise<number>((r) => ws.addEventListener('close', (e) => r(e.code)));
  ws.addEventListener('message', (e) => {
    if (typeof e.data === 'string') control.push(JSON.parse(e.data) as Record<string, unknown>);
    else buf += Buffer.from(e.data as ArrayBuffer).toString('utf8');
  });
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve({ ws, text: () => buf, control, closed }));
    ws.addEventListener('error', () => reject(new Error('ws error')));
  });
}

/** Trạng thái HTTP của bắt tay /term (để thấy 401 / 403 / 400). */
function upgradeStatus(t: string | null, path = PTY.path): Promise<number> {
  const u = new URL(sup.base);
  return new Promise((resolve, reject) => {
    const req = request({
      host: u.hostname,
      port: u.port,
      path,
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-version': '13',
        'sec-websocket-key': randomBytes(16).toString('base64'),
        ...(t ? { 'sec-websocket-protocol': `${PTY.protocol}, ${PTY.ticketProtocolPrefix}${t}` } : {}),
      },
    });
    req.on('response', (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('upgrade', (res, socket) => {
      socket.destroy();
      resolve(res.statusCode ?? 101);
    });
    req.on('error', reject);
    req.end();
  });
}

const until = async (f: () => boolean | Promise<boolean>, ms: number, what: string) => {
  const end = Date.now() + ms;
  while (!(await f())) {
    if (Date.now() > end) throw new Error(`chờ quá ${ms} ms: ${what}`);
    await new Promise((r) => setTimeout(r, 200));
  }
};

function processes(container: string): string {
  return docker(['top', container, '-eo', 'pid,args'], { allowFail: true });
}

beforeAll(async () => {
  composeDown();
  cleanupManaged([VOL_AGY, VOL_CLAUDE, VOL_ROLE]);
  docker(['rm', '-f', 'ga-sys-ZZZZ'], { allowFail: true });
  image = buildImages();
  composeUp();
  stubHost = containerIp('stub-app', `${PROJECT}_hostlink`);
  sourceHost = containerIp('fake-source', `${PROJECT}_hostlink`);
  await waitHttp(`http://${stubHost}:7499/_test/ips`);
  await waitHttp(`http://${sourceHost}:8080/_test/requests`);
  sup = await startSupervisor({ image, proxyIp: containerIp('socket-proxy', `${PROJECT}_hostlink`) });
}, 600_000);

afterAll(async () => {
  await sup?.close();
  cleanupManaged([VOL_AGY, VOL_CLAUDE, VOL_ROLE]);
  docker(['rm', '-f', 'ga-sys-ZZZZ'], { allowFail: true });
  composeDown();
}, 180_000);

describe.sequential('IT runtime — Docker thật', () => {
  it('supervisor dựng ga-sys theo sys.v1 (nhãn, cap_drop ALL, rootfs chỉ đọc, user 10001, chỉ mạng roles, mount đúng)', async () => {
    const r = await rpcJson('ensureContainer', {
      consumer: WS,
      template: 'sys.v1',
      authVolumes: [VOL_AGY, VOL_CLAUDE],
    });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ container: { name: SYS }, observed: 'created' });
    const s = await rpcJson('start', { container: { name: SYS } });
    expect(s.json).toMatchObject({ observed: 'running' });
    expect(String(s.json?.rolesNetworkIp)).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    const i = JSON.parse(docker(['inspect', SYS]))[0];
    expect(i.Config.Labels).toMatchObject({
      'genagents.kind': 'sys',
      'genagents.template': 'sys.v1',
      'genagents.managed-by': 'ga-supervisor',
    });
    expect(i.Config.User).toBe('10001:10001');
    expect(i.Image).toBe(image);
    expect(i.HostConfig).toMatchObject({
      Privileged: false,
      ReadonlyRootfs: true,
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges:true'],
      NetworkMode: ROLES_NET,
      Init: true,
    });
    expect(i.HostConfig.CapAdd ?? []).toEqual([]);
    expect(i.HostConfig.Binds ?? []).toEqual([]);
    expect(Object.keys(i.NetworkSettings.Networks)).toEqual([ROLES_NET]);
    const mounts = i.Mounts.filter((m: { Type: string }) => m.Type === 'volume').map(
      (m: { Name: string; Destination: string; RW: boolean }) => `${m.Name}:${m.Destination}:${m.RW}`,
    );
    expect(mounts.sort()).toEqual(
      [
        `${ENGINES_VOLUME}:/opt/engines:false`,
        `${VOL_AGY}:/auth/EN-9001:true`,
        `${VOL_CLAUDE}:/auth/EN-9002:true`,
      ].sort(),
    );
    expect(i.Mounts.filter((m: { Type: string }) => m.Type === 'bind')).toEqual([]);
    expect(Object.keys(i.HostConfig.Tmpfs).sort()).toEqual(['/run/ga', '/tmp']);
    // volume /auth đã gieo quyền uid 10001 (copy-up), container ghi được
    expect(
      cexec(SYS, [
        'sh',
        '-c',
        'touch /auth/EN-9001/.w && rm /auth/EN-9001/.w && stat -c %u:%a /auth/EN-9001',
      ]).stdout.trim(),
    ).toBe('10001:700');
    expect(cexec(SYS, ['sh', '-c', 'touch /opt/engines/x']).code).not.toBe(0); // ga-engines chỉ đọc
    expect(cexec(SYS, ['sh', '-c', 'touch /usr/x']).code).not.toBe(0); // rootfs chỉ đọc
  });

  it('từ chối spec / thao tác nguy hiểm — mỗi loại một ca, đúng luật đó, không có gì tới Docker', async () => {
    const evil = { kind: 'sys', workspaceId: '01JRT000000000000000000009', workspaceCode: 'EVIL' } as const;
    const base = () =>
      buildConsumerContainer('sys.v1', evil, [], {
        runtimeImage: image,
        rolesNetwork: ROLES_NET,
        enginesVolume: ENGINES_VOLUME,
        egressProxyUrl: 'http://ga-egress:3128',
        noProxy: 'ga-app',
        fakeEngineSourceUrl: null,
      });
    const cases: [string, (b: Record<string, unknown>) => void, string][] = [
      ['privileged', (b) => ((b.HostConfig as Record<string, unknown>).Privileged = true), 'privileged'],
      [
        'mount docker.sock',
        (b) => ((b.HostConfig as Record<string, unknown>).Binds = ['/var/run/docker.sock:/var/run/docker.sock']),
        'docker_socket',
      ],
      [
        'bind host path',
        (b) => ((b.HostConfig as Record<string, unknown>).Binds = ['/etc:/host-etc:ro']),
        'bind_mount',
      ],
      ['host network', (b) => ((b.HostConfig as Record<string, unknown>).NetworkMode = 'host'), 'network_mode'],
      ['cap_add', (b) => ((b.HostConfig as Record<string, unknown>).CapAdd = ['SYS_ADMIN']), 'cap_add'],
      ['ảnh lạ', (b) => (b.Image = 'busybox:1.37'), 'image_not_allowed'],
    ];
    for (const [name, mutate, rule] of cases) {
      const b = base();
      mutate(b.body);
      let got: SupervisorError | null = null;
      try {
        await sup.broker.create(b.name, b.body);
      } catch (e) {
        got = e as SupervisorError;
      }
      expect(got?.code, name).toBe('policy_violation');
      expect(got?.rules, name).toEqual([rule]);
    }
    expect(docker(['ps', '-aq', '--filter', 'name=ga-sys-EVIL'])).toBe('');
    // qua RPC: mẫu không version, exec chương trình tự do, exec / thao tác vào ga-app / ga-updater
    expect((await sup.rpc('ensureContainer', { consumer: evil, template: 'sys', authVolumes: [] })).status).toBe(400);
    expect((await sup.rpc('exec', { container: { name: SYS }, run: { command: 'sh' }, timeoutMs: 5000 })).status).toBe(
      400,
    );
    expect(
      (
        await sup.rpc('exec', {
          container: { name: 'ga-app' },
          run: { command: 'turn', turnId: ulid(), ticket: turnTicket },
          timeoutMs: 5000,
        })
      ).status,
    ).toBe(400);
    expect((await sup.rpc('stop', { container: { name: 'ga-updater' } })).status).toBe(400);
    // container lạ trùng mẫu tên (không nhãn genagents.*) ⇒ not_managed — inspect / exec bị từ chối
    docker(['run', '-d', '--name', 'ga-sys-ZZZZ', '--network', 'none', 'busybox:1.37', 'sleep', '600']);
    const r = await rpcJson('exec', {
      container: { name: 'ga-sys-ZZZZ' },
      run: { command: 'turn', turnId: ulid(), ticket: turnTicket },
      timeoutMs: 5000,
    });
    expect(r.status).toBe(403);
    expect(r.json?.error).toBe('not_managed');
    // container thật của hệ (stub ga-app của IT) ⇒ not_managed khi resolve bằng tên
    const stubName = docker(['inspect', docker([...COMPOSE, 'ps', '-q', 'stub-app']), '--format', '{{.Name}}']).replace(
      /^\//,
      '',
    );
    await expect(sup.broker.resolveManaged(stubName)).rejects.toMatchObject({ code: 'not_managed' });
    // status chỉ liệt kê container do supervisor quản
    const st = await rpcJson('status', {});
    const listed = (st.json?.containers ?? []) as { container: { name: string } }[];
    expect(listed.map((c) => c.container.name)).toEqual([SYS]);
  });

  it('cài CLI giả qua ga-engine-install (nguồn fake qua egress): lỗi checksum ⇒ failed + lý do; ok ⇒ % rồi installed', async () => {
    const install = async (slug: string) => {
      const r = await sup.rpc('installEngine', { container: { name: SYS }, engineSlug: slug, source: 'fake' });
      expect(r.status).toBe(200);
      return r.text
        .trim()
        .split('\n')
        .map((l) => EngineInstallStatusResponse.parse(JSON.parse(l)).status);
    };
    await fetch(`http://${sourceHost}:8080/_test/scenario`, {
      method: 'POST',
      body: JSON.stringify({ name: 'checksum_mismatch' }),
    });
    const bad = await install(CLAUDE);
    expect(bad.at(-1)).toMatchObject({ state: 'failed', reason: 'checksum_mismatch' });
    await fetch(`http://${sourceHost}:8080/_test/scenario`, {
      method: 'POST',
      body: JSON.stringify({ name: 'ok', chunkDelayMs: 5 }),
    });
    for (const slug of [CLAUDE, AGY]) {
      const st = await install(slug);
      const pcts = st
        .filter((s) => s.state === 'installing')
        .map((s) => (s as { progressPct: number | null }).progressPct);
      expect(new Set(pcts).size, slug).toBeGreaterThan(3);
      expect(st.at(-1), slug).toMatchObject({ state: 'installed' });
    }
    const status = await rpcJson('engineInstallStatus', { container: { name: SYS }, engineSlug: CLAUDE });
    expect(status.json).toMatchObject({ engineSlug: CLAUDE, status: { state: 'installed', version: '2.1.299' } });
    // engine-source chỉ được gọi QUA egress (container cài không có đường thẳng)
    const reqs = (await (await fetch(`http://${sourceHost}:8080/_test/requests`)).json()) as { path: string }[];
    expect(
      reqs.some(
        (q) => q.path === `/${CLAUDE}/manifests/linux_amd64.json` || q.path === `/${CLAUDE}/manifests/linux_arm64.json`,
      ),
    ).toBe(true);
  });

  it('PTY: client WS (vé trong subprotocol) chạy hết OAuth giả của fake-agy ⇒ credential + canary trong /auth; login_ok ⇒ exec bị đóng dù agy giả vẫn chạy', async () => {
    const t = ticket();
    const term = await openTerm(t);
    expect(term.ws.protocol).toBe(PTY.protocol);
    await until(() => term.text().includes('paste the authorization code'), 30_000, 'lời nhắc dán mã của agy');
    expect(term.text()).toContain('https://');
    term.ws.send(Buffer.from('FAKE-AUTH-CODE-123\r'));
    // agy giả ghi credential vào HOME (= /auth/EN-9001 vì allowlist 'unknown') rồi tiếp tục như agent tương tác
    await until(
      () => cexec(SYS, ['sh', '-c', 'grep -rl GA-CANARY- /auth/EN-9001 | wc -l']).stdout.trim() !== '0',
      20_000,
      'credential + canary trong /auth',
    );
    await until(() => processes(SYS).includes('agy/main.ts'), 10_000, 'agy giả còn chạy');
    // kiểm đăng nhập qua ga-runner login-check: agy có allowlist 'unknown' ⇒ GEN-04 không nối credential ⇒ chưa đạt
    const lc = await sup.rpc('exec', {
      container: { name: SYS },
      run: {
        command: 'login-check',
        bundle: {
          v: 2,
          op: 'login_check',
          probeId: ulid(),
          engineSlug: AGY,
          engineAccount: 'EN-9001',
          authMethod: 'subscription',
          expiresAt: expiresAt(),
        },
      },
      timeoutMs: 60_000,
    });
    const lcp = protocol(frames(lc.text));
    expect(lcp.ok).toBe(true);
    if (!lcp.ok || lcp.report.command !== 'login-check') throw new Error('login-check không có report');
    expect(lcp.report.authGc).toEqual({ removed: 0, nativeMemory: 'unknown' });
    // "kiểm đăng nhập đạt" do harness (đóng vai ga-app) xác nhận bằng credential có trong /auth ⇒ ga-app báo login_ok
    const close = await rpcJson('ptyClose', { container: { name: SYS }, engineAccount: 'EN-9001', reason: 'login_ok' });
    expect(close.json).toEqual({ closed: true });
    expect(term.control).toContainEqual({ type: 'closed', reason: 'login_ok' });
    await term.closed;
    const ev = (await rpcJson('ptyEvents', { sinceSeq: 0 })).json as {
      events: { reason: string; execStopped: boolean; engineAccount: string }[];
    };
    expect(ev.events.at(-1)).toMatchObject({ reason: 'login_ok', execStopped: true, engineAccount: 'EN-9001' });
    expect(processes(SYS)).not.toContain('agy/main.ts');
    expect(processes(SYS)).not.toContain('ga-runner login');
  }, 120_000);

  it('vé phát lại / hết hạn / tài khoản không mount / vé trong URL ⇒ bị từ chối', async () => {
    expect(await upgradeStatus(usedTickets[0] as string)).toBe(401); // phát lại
    expect(await upgradeStatus(ticket({ exp: Math.floor(Date.now() / 1000) - 1 }))).toBe(401);
    expect(await upgradeStatus(ticket({ acc: 'EN-9003' }))).toBe(403);
    expect(await upgradeStatus(null, `${PTY.path}?ticket=${ticket()}`)).toBe(400);
    expect(await upgradeStatus(null)).toBe(401);
  });

  it('PTY fake-claude `auth login` ⇒ credential vào /auth (nối symlink + chép ngược khi CLI rename); login-check đạt', async () => {
    const term = await openTerm(ticket({ acc: 'EN-9002', engineSlug: CLAUDE }));
    await until(() => term.text().includes('Paste code here'), 30_000, 'lời nhắc dán mã của claude');
    term.ws.send(Buffer.from('FAKE-CODE-456\r'));
    await until(() => term.text().includes('Login successful'), 20_000, 'claude đăng nhập xong');
    await term.closed; // claude giả tự thoát sau đăng nhập ⇒ exec kết thúc
    await until(
      () => cexec(SYS, ['test', '-f', '/auth/EN-9002/.claude/.credentials.json']).code === 0,
      10_000,
      'credential trong /auth',
    );
    expect(
      cexec(SYS, ['sh', '-c', 'grep -c GA-CANARY- /auth/EN-9002/.claude/.credentials.json']).stdout.trim(),
    ).not.toBe('0');
    const adapter = adapterFor(CLAUDE);
    if (!adapter) throw new Error('thiếu adapter');
    const lc = await sup.rpc('exec', {
      container: { name: SYS },
      run: {
        command: 'login-check',
        bundle: {
          v: 2,
          op: 'login_check',
          probeId: ulid(),
          engineSlug: CLAUDE,
          engineAccount: 'EN-9002',
          authMethod: 'subscription',
          expiresAt: expiresAt(),
        },
      },
      timeoutMs: 60_000,
    });
    const p = protocol(frames(lc.text));
    if (!p.ok || p.report.command !== 'login-check') throw new Error(`login-check: ${JSON.stringify(p)}`);
    const parse = adapter.loginCheck({
      authMethod: 'subscription',
      probeId: ulid(),
      probeDir: '/run/ga/probe-x',
      homeDir: '/run/ga/probe-x/home',
      authDir: '/auth/EN-9002',
    }).parse;
    expect(parse(p.report.outcomes[0] as never)).toMatchObject({ status: 'logged_in' });
    expect(p.report.authGc.nativeMemory).toBe('off');
  }, 120_000);

  it('sau lượt fake-claude: /auth chỉ còn tệp allowlist, transcript native không còn, tmpfs lượt đã xoá', async () => {
    // rác native còn sót (vd từ lần đăng nhập / CLI cũ)
    expect(
      cexec(SYS, [
        'sh',
        '-c',
        'mkdir -p /auth/EN-9002/.claude/projects/x && echo hội-thoại > /auth/EN-9002/.claude/projects/x/s.jsonl && echo h > /auth/EN-9002/.claude/history.jsonl && echo d > /auth/EN-9002/cache.db',
      ]).code,
    ).toBe(0);
    const adapter = adapterFor(CLAUDE);
    const turnId = ulid();
    const bundle = {
      v: 2,
      op: 'turn',
      turnId,
      sessionId: ulid(),
      engineSlug: CLAUDE,
      engineAccount: 'EN-9002',
      params: { model: null, effort: null },
      authMethod: 'subscription',
      detectedFlags: [...(adapter?.requiredTurnFlags ?? [])],
      prompt: { user: { path: 'user.md', content: 'Xin chào, tóm tắt hôm nay.' }, system: null },
      timeoutMs: 120_000,
      measure: null,
      nativeMemoryPolicy: 'tmpfs-per-turn',
      expiresAt: expiresAt(),
    };
    await fetch(`http://${stubHost}:7499/_test/bundle`, {
      method: 'POST',
      body: JSON.stringify({ ticket: turnTicket, bundle }),
    });
    const r = await sup.rpc('exec', {
      container: { name: SYS },
      run: { command: 'turn', turnId, ticket: turnTicket },
      timeoutMs: 180_000,
    });
    expect(r.status).toBe(200);
    const fs = frames(r.text);
    expect(fs.some((f) => f.type === 'error')).toBe(false);
    const p = protocol(fs);
    if (!p.ok || p.report.command !== 'turn')
      throw new Error(
        `lượt: ${JSON.stringify(p).slice(0, 2000)} ${fs
          .map((f) => (f.type === 'stderr' ? f.data : ''))
          .join('')
          .slice(0, 2000)}`,
      );
    expect(p.report.exit.exitCode).toBe(0);
    expect(p.report.authGc).toMatchObject({ nativeMemory: 'off' });
    expect(p.report.authGc.removed).toBeGreaterThanOrEqual(2);
    // vé không xuất hiện trong output
    expect(r.text).not.toContain(turnTicket);
    expect(cexec(SYS, ['find', '/auth/EN-9002', '-type', 'f']).stdout.trim().split('\n')).toEqual([
      '/auth/EN-9002/.claude/.credentials.json',
    ]);
    expect(cexec(SYS, ['sh', '-c', `test -e /run/ga/${turnId} && echo còn || echo không`]).stdout.trim()).toBe('không');
    expect(
      cexec(SYS, ['sh', '-c', "find / -xdev -name '*.jsonl' 2>/dev/null | grep -v '^/opt/ga' | wc -l"]).stdout.trim(),
    ).toBe('0');
    // gateway đã thấy đúng một lần lấy bundle bằng vé
    const reqs = (await (await fetch(`http://${stubHost}:7499/_test/requests`)).json()) as {
      path: string;
      auth: boolean;
    }[];
    expect(reqs.filter((q) => q.path === '/turn/bundle' && q.auth)).toHaveLength(1);
  }, 240_000);

  it('container Role: không docker.sock, không gọi được 7401, bị chặn example.com (cả qua egress lẫn đi thẳng)', async () => {
    const e = await rpcJson('ensureContainer', { consumer: ROLE, template: 'role.v1', authVolumes: [VOL_ROLE] });
    const name = String((e.json?.container as { name?: string } | undefined)?.name);
    await rpcJson('start', { container: { name } });
    const ips = (await (await fetch(`http://${stubHost}:7499/_test/ips`)).json()) as {
      rolesIps: string[];
      hostlinkIps: string[];
    };
    const probe = `
      const net = require('node:net'); const fs = require('node:fs');
      const tryConnect = (host, port) => new Promise((r) => { const s = net.connect({ host, port, timeout: 3000 });
        s.on('connect', () => { s.destroy(); r('connected'); }); s.on('timeout', () => { s.destroy(); r('timeout'); }); s.on('error', (e) => r(e.code)); });
      const viaEgress = (target) => new Promise((r) => { const s = net.connect(3128, 'ga-egress', () => s.write('CONNECT ' + target + ' HTTP/1.1\\r\\nHost: ' + target + '\\r\\n\\r\\n'));
        s.once('data', (d) => { r(d.toString().split('\\r\\n\\r\\n')[0]); s.destroy(); }); s.on('error', (e) => r(e.code)); });
      (async () => {
        const out = {};
        out.sock = ['/var/run/docker.sock', '/run/docker.sock'].map((p) => fs.existsSync(p));
        out.dockerHost = process.env.DOCKER_HOST ?? null;
        out.app7401roles = await tryConnect('ga-app', 7401);
        out.app7401hostlink = await tryConnect('${ips.hostlinkIps[0]}', 7401);
        out.egressExample = await viaEgress('example.com:443');
        out.directExample = await tryConnect('example.com', 443);
        out.directIp = await tryConnect('93.184.216.34', 80);
        out.gateway7410 = await tryConnect('ga-app', 7410);
        process.stdout.write(JSON.stringify(out));
      })();`;
    const res = cexec(name, ['node', '-e', probe]);
    const o = JSON.parse(res.stdout) as Record<string, unknown>;
    expect(o.sock).toEqual([false, false]);
    expect(o.dockerHost).toBeNull();
    expect(o.app7401roles).toBe('ECONNREFUSED');
    expect(['timeout', 'EHOSTUNREACH', 'ENETUNREACH']).toContain(o.app7401hostlink);
    expect(String(o.egressExample)).toMatch(/^HTTP\/1\.1 403/);
    expect(String(o.egressExample).toLowerCase()).toContain('x-ga-egress: blocked');
    expect(['ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'timeout']).toContain(o.directExample);
    expect(['ENETUNREACH', 'EHOSTUNREACH', 'timeout']).toContain(o.directIp);
    expect(o.gateway7410).toBe('connected'); // đường hợp lệ duy nhất: gateway
  }, 60_000);

  it('docker inspect: không bí mật trong env của mọi container (khoá nội bộ, vé, canary, tên khoá)', () => {
    const ids = [
      ...docker(['ps', '-aq', '--filter', `label=com.docker.compose.project=${PROJECT}`]).split('\n'),
      ...docker(['ps', '-aq', '--filter', 'label=genagents.managed-by=ga-supervisor']).split('\n'),
    ].filter(Boolean);
    expect(ids.length).toBeGreaterThanOrEqual(5);
    const secrets = [
      sup.supervisorKey.toString('hex'),
      sup.supervisorKey.toString('base64'),
      sup.termKey.toString('hex'),
      sup.termKey.toString('base64'),
      turnTicket,
      ...usedTickets,
    ];
    for (const id of ids) {
      const env: string[] = JSON.parse(docker(['inspect', id, '--format', '{{json .Config.Env}}'])) ?? [];
      const joined = env.join('\n');
      for (const s of secrets) expect(joined.includes(s), id).toBe(false);
      expect(joined).not.toMatch(
        /GA-CANARY-|GENAGENTS_MASTER_KEY|GA_(SUPERVISOR|TERM_TICKET|UPDATER|EGRESS)_KEY|_OAUTH_TOKEN/,
      );
      // SESSION=0 là cấu hình của image upstream docker-socket-proxy (bật / tắt API /session), không phải bí mật
      const ours = env.filter((e) => !/^SESSION=[01]$/.test(e)).join('\n');
      expect(ours).not.toMatch(/SESSION/);
    }
    // image phát hành không có nguồn cài giả
    expect(
      docker([
        'run',
        '--rm',
        '--entrypoint',
        'sh',
        RELEASE_IMAGE,
        '-c',
        'test -e /opt/ga/app/apps/runner/src/engine-install/fake-source.ts && echo có || echo không',
      ]),
    ).toBe('không');
  });
});
