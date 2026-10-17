import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { PassThrough } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DockerRuntime } from '../src/docker.ts';
import {
  DOCKER_API_LIMITS,
  DockerApi,
  DockerApiError,
  demuxDockerStream,
  endpointFromHost,
} from '../src/docker-api.ts';
import { SupervisorError } from '../src/errors.ts';

// Máy khách Docker Engine API tối thiểu (thay dockerode): kiểm trên máy chủ HTTP giả đóng vai daemon / socket-proxy.

const frame = (type: number, data: string | Buffer) => {
  const b = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const h = Buffer.alloc(8);
  h[0] = type;
  h.writeUInt32BE(b.length, 4);
  return Buffer.concat([h, b]);
};

const seen: { method: string; url: string; body: string }[] = [];
let stdinSeen = '';
let server: Server;
let api: DockerApi;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((r) => {
    let s = '';
    req.on('data', (c) => {
      s += c;
    });
    req.on('end', () => r(s));
  });
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const body = await readBody(req);
    seen.push({ method: req.method ?? '', url: req.url ?? '', body });
    const u = new URL(req.url ?? '/', 'http://x');
    const json = (status: number, v: unknown) =>
      res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(v));
    if (u.pathname === '/_ping') return void res.writeHead(200).end('OK');
    if (u.pathname === '/containers/json') return json(200, [{ Id: 'c1' }]);
    if (u.pathname === '/containers/c1/json')
      return json(200, {
        Id: 'c1',
        Name: '/ga-sys-AB12',
        Image: 'sha256:x',
        Config: { Labels: { a: 'b' }, Env: ['LANG=C.UTF-8'] },
        State: { Status: 'running', Running: true },
        Mounts: [{ Type: 'volume', Name: 'ga-engines', Destination: '/opt/engines', RW: false }],
        NetworkSettings: { Networks: { roles: { IPAddress: '172.30.0.5' } } },
      });
    if (u.pathname === '/containers/missing/json') return json(404, { message: 'No such container' });
    if (u.pathname === '/containers/create') return json(201, { Id: 'new1', Warnings: [] });
    if (u.pathname === '/containers/c1/start') return void res.writeHead(304).end();
    if (u.pathname === '/containers/busy/start') return json(409, { message: 'conflict' });
    if (u.pathname === '/containers/c1/exec') return json(201, { Id: 'e1' });
    if (u.pathname === '/exec/e1/json') return json(200, { Running: false, ExitCode: 3 });
    if (u.pathname === '/exec/e1/resize') return void res.writeHead(200).end();
    if (u.pathname === '/exec/nope/start') return json(404, { message: 'no such exec' });
    if (u.pathname === '/huge') {
      res.writeHead(200);
      res.end(Buffer.alloc(DOCKER_API_LIMITS.maxBodyBytes + 1, 0x61));
      return;
    }
    if (u.pathname === '/notjson') return void res.writeHead(200).end('<html>');
    res.writeHead(404).end();
  });
  // hijack: 101 rồi khung exec; gửi sẵn một phần khung ngay sau header (đi vào `head` của sự kiện upgrade)
  server.on('upgrade', (req: IncomingMessage, socket: Socket) => {
    seen.push({ method: req.method ?? '', url: req.url ?? '', body: '' });
    if (req.url !== '/exec/e1/start') {
      // như Docker thật: exec không tồn tại ⇒ 404 thường, KHÔNG nâng cấp
      const b = '{"message":"no such exec"}';
      socket.end(`HTTP/1.1 404 Not Found\r\nContent-Type: application/json\r\nContent-Length: ${b.length}\r\n\r\n${b}`);
      return;
    }
    const out = Buffer.concat([frame(1, 'xin chào '), frame(2, 'cảnh báo'), frame(1, 'thế giới')]);
    socket.write(
      'HTTP/1.1 101 UPGRADED\r\nContent-Type: application/vnd.docker.raw-stream\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n',
    );
    socket.write(out.subarray(0, 5)); // nửa header khung đầu (đi vào `head` của sự kiện upgrade phía client)
    let sent = false;
    let gotStdin = false;
    const maybeEnd = () => {
      if (sent && gotStdin) socket.end();
    };
    setTimeout(() => {
      socket.write(out.subarray(5));
      sent = true;
      maybeEnd();
    }, 20);
    socket.on('data', (d) => {
      stdinSeen += d.toString();
      if (stdinSeen.includes('\n')) {
        gotStdin = true;
        maybeEnd();
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  api = new DockerApi({ host: '127.0.0.1', port: (server.address() as AddressInfo).port });
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
});

describe('endpointFromHost', () => {
  it.each([
    ['tcp://socket-proxy:2375', { host: 'socket-proxy', port: 2375 }],
    ['unix:///var/run/docker.sock', { socketPath: '/var/run/docker.sock' }],
  ])('%s', (h, want) => {
    expect(endpointFromHost(h)).toEqual(want);
  });
  it.each(['tcp://proxy', 'http://u:p@proxy:2375', 'tcp://proxy:2375/v1.40', 'unix://rel.sock', 'ssh://x', 'rác'])(
    'từ chối %s',
    (h) => {
      expect(() => endpointFromHost(h)).toThrow(DockerApiError);
    },
  );
});

describe('DockerApi.call / json', () => {
  it('mã ngoài danh sách ⇒ DockerApiError(mã); thân rỗng ⇒ null', async () => {
    await expect(api.json('GET', '/containers/missing/json', [200])).rejects.toMatchObject({ statusCode: 404 });
    expect(await api.json('POST', '/containers/c1/start', [204, 304])).toEqual({ status: 304, value: null });
  });
  it('phản hồi quá cỡ ⇒ lỗi (không nạp hết vào RAM); không phải JSON ⇒ lỗi', async () => {
    await expect(api.call('GET', '/huge')).rejects.toMatchObject({ statusCode: null });
    await expect(api.json('GET', '/notjson', [200])).rejects.toThrow(/không phải JSON/);
  });
  it('máy chủ không tồn tại ⇒ DockerApiError(null)', async () => {
    const dead = new DockerApi({ host: '127.0.0.1', port: 1 });
    await expect(dead.call('GET', '/_ping')).rejects.toMatchObject({ statusCode: null });
  });
  it('hijack bị từ chối (không 101) ⇒ DockerApiError(mã)', async () => {
    await expect(api.hijack('/exec/nope/start', {})).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('demuxDockerStream — khung 8 byte, cắt ở mọi vị trí', () => {
  const payload = Buffer.concat([frame(1, 'abc'), frame(2, 'ERR'), frame(1, ''), frame(1, 'ạđ')]);
  it.each(Array.from({ length: payload.length }, (_, i) => i + 1))('cắt sau byte %i', (cut) => {
    const src = new PassThrough();
    const out = new PassThrough();
    const err = new PassThrough();
    const o: Buffer[] = [];
    const e: Buffer[] = [];
    out.on('data', (c) => o.push(c));
    err.on('data', (c) => e.push(c));
    demuxDockerStream(src, out, err);
    src.write(payload.subarray(0, cut));
    src.write(payload.subarray(cut));
    expect(Buffer.concat(o).toString()).toBe('abcạđ');
    expect(Buffer.concat(e).toString()).toBe('ERR');
  });
  it('loại khung lạ ⇒ hủy luồng nguồn (fail-closed)', async () => {
    const src = new PassThrough();
    const errSeen = new Promise((r) => src.on('error', r));
    demuxDockerStream(src, new PassThrough(), new PassThrough());
    src.write(frame(7, 'x'));
    expect(await errSeen).toBeInstanceOf(DockerApiError);
    expect(src.destroyed).toBe(true);
  });
});

describe('DockerRuntime trên máy khách tối thiểu', () => {
  const rt = () => new DockerRuntime(api);
  it('ping / inspect / list (filters mã hoá JSON) / create (?name=) / start 304 / lỗi 409 ⇒ name_conflict', async () => {
    seen.length = 0;
    expect(await rt().ping()).toBe(true);
    expect(await rt().inspectContainer('missing')).toBeNull();
    const list = await rt().listContainers(['genagents.managed-by=ga-supervisor']);
    expect(list).toEqual([
      {
        id: 'c1',
        name: 'ga-sys-AB12',
        labels: { a: 'b' },
        state: 'running',
        running: true,
        mounts: [{ type: 'volume', name: 'ga-engines', destination: '/opt/engines', rw: false }],
        image: 'sha256:x',
        networks: { roles: '172.30.0.5' },
        env: ['LANG=C.UTF-8'],
      },
    ]);
    const lq = new URL(seen.find((s) => s.url.startsWith('/containers/json'))?.url ?? '', 'http://x').searchParams;
    expect(lq.get('all')).toBe('1');
    expect(JSON.parse(lq.get('filters') ?? '')).toEqual({ label: ['genagents.managed-by=ga-supervisor'] });
    expect(await rt().createContainer('ga-sys-AB12', { Image: 'sha256:x' })).toBe('new1');
    const cr = seen.find((s) => s.url.startsWith('/containers/create'));
    expect(cr?.url).toBe('/containers/create?name=ga-sys-AB12');
    expect(JSON.parse(cr?.body ?? '')).toEqual({ Image: 'sha256:x' });
    await expect(rt().startContainer('c1')).resolves.toBeUndefined();
    await expect(rt().startContainer('busy')).rejects.toMatchObject({ code: 'name_conflict' });
    await expect(rt().startContainer('busy')).rejects.toBeInstanceOf(SupervisorError);
  });
  it('id có ký tự lạ được mã hoá trong đường dẫn (không thoát ra đường khác)', async () => {
    seen.length = 0;
    await rt().inspectContainer('../../_ping');
    expect(seen[0]?.url).toBe('/containers/..%2F..%2F_ping/json');
  });
  it('exec: tạo → hijack (khung tới cả trong `head`) → stdout / stderr tách đúng; stdin tới container; resize; inspect', async () => {
    stdinSeen = '';
    const s = await rt().exec('c1', {
      Cmd: ['/usr/local/bin/ga-runner', 'turn'],
      Env: [],
      User: '10001:10001',
      Tty: false,
      Privileged: false,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: '/',
    });
    const o: Buffer[] = [];
    const e: Buffer[] = [];
    s.stdout.on('data', (c) => o.push(c));
    s.stderr?.on('data', (c) => e.push(c));
    s.write('vé-lượt\n');
    await s.done;
    expect(Buffer.concat(o).toString()).toBe('xin chào thế giới');
    expect(Buffer.concat(e).toString()).toBe('cảnh báo');
    expect(stdinSeen).toBe('vé-lượt\n');
    await s.resize(4093, 4091);
    expect(seen.some((q) => q.url === '/exec/e1/resize?h=4091&w=4093')).toBe(true);
    expect(await s.inspect()).toEqual({ running: false, exitCode: 3 });
    const start = seen.find((q) => q.url === '/exec/e1/start');
    expect(start?.method).toBe('POST');
  });
});
