// Harness IT runtime (L-RT): build image runtime + runtime-test, dựng compose (socket-proxy, egress, stub-app, fake-source),
// chạy supervisor TRONG tiến trình test với driver docker thật (qua socket-proxy). Chỉ dùng trong test.
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Broker,
  createSupervisorServer,
  DockerRuntime,
  dockerFromHost,
  PtyRelay,
  SupervisorService,
  signRpc,
  stderrLogger,
} from '../../../apps/supervisor/src/index.ts';
import { type Clock, SUPERVISOR_RPC, systemClock } from '../../../packages/contracts/src/index.ts';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '../../..');
export const PROJECT = 'ga-rt';
export const ROLES_NET = `${PROJECT}_roles`;
export const ENGINES_VOLUME = `${PROJECT}-engines`;
export const COMPOSE = ['compose', '-p', PROJECT, '-f', join(HERE, 'compose.it.yml')];
export const RELEASE_IMAGE = 'gen-agents-runtime:local';
export const TEST_IMAGE = 'gen-agents-runtime-test:local';
export const FAKE_SOURCE_URL = 'http://fake-source.ga.test:8080';

export function docker(args: readonly string[], opts: { input?: string; allowFail?: boolean } = {}): string {
  const r = spawnSync('docker', args, { input: opts.input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 && !opts.allowFail) {
    throw new Error(`docker ${args.slice(0, 3).join(' ')} thất bại (${r.status}): ${(r.stderr ?? '').slice(0, 2000)}`);
  }
  return (r.stdout ?? '').trim();
}

/** Lệnh trong container (bằng docker CLI trực tiếp — quyền của harness, KHÔNG qua supervisor), user 10001. */
export function cexec(container: string, cmd: readonly string[], opts: { input?: string; user?: string } = {}) {
  const r = spawnSync('docker', ['exec', '-i', '-u', opts.user ?? '10001:10001', container, ...cmd], {
    input: opts.input,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

export function buildImages(): string {
  execFileSync('docker', ['build', '-q', '-f', 'deploy/docker/Dockerfile.runtime', '-t', RELEASE_IMAGE, '.'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, DOCKER_BUILDKIT: '1' },
  });
  execFileSync(
    'docker',
    [
      'build',
      '-q',
      '-f',
      'deploy/docker/Dockerfile.runtime-test',
      '--build-arg',
      `BASE=${RELEASE_IMAGE}`,
      '-t',
      TEST_IMAGE,
      '.',
    ],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, DOCKER_BUILDKIT: '1' } },
  );
  return docker(['image', 'inspect', TEST_IMAGE, '--format', '{{.Id}}']);
}

export function composeUp(): void {
  docker([...COMPOSE, 'up', '-d', '--quiet-pull']);
}

export function composeDown(): void {
  docker([...COMPOSE, 'down', '-v', '--remove-orphans'], { allowFail: true });
}

/** Dọn container / volume do supervisor tạo trong lần chạy (nhãn genagents.managed-by + volume tên đã biết). */
export function cleanupManaged(volumes: readonly string[]): void {
  const ids = docker(['ps', '-aq', '--filter', 'label=genagents.managed-by=ga-supervisor'], { allowFail: true });
  if (ids) docker(['rm', '-f', ...ids.split('\n')], { allowFail: true });
  for (const v of [...volumes, ENGINES_VOLUME]) docker(['volume', 'rm', '-f', v], { allowFail: true });
}

export function containerIp(service: string, network: string): string {
  const id = docker([...COMPOSE, 'ps', '-q', service]);
  return docker(['inspect', id, '--format', `{{(index .NetworkSettings.Networks "${network}").IPAddress}}`]);
}

export async function waitHttp(url: string, ms = 60_000): Promise<void> {
  const end = Date.now() + ms;
  for (;;) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {
      // chưa lên
    }
    if (Date.now() > end) throw new Error(`chờ ${url} quá ${ms} ms`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

export interface Supervisor {
  server: Server;
  base: string;
  svc: SupervisorService;
  pty: PtyRelay;
  broker: Broker;
  supervisorKey: Buffer;
  termKey: Buffer;
  clock: Clock;
  rpc(method: string, body: unknown): Promise<{ status: number; text: string }>;
  close(): Promise<void>;
}

export async function startSupervisor(o: {
  image: string;
  proxyIp: string;
  ptyMaxSeconds?: number;
}): Promise<Supervisor> {
  const supervisorKey = randomBytes(32);
  const termKey = randomBytes(32);
  const log = stderrLogger('supervisor-it', () => {});
  const broker = new Broker(
    new DockerRuntime(dockerFromHost(`tcp://${o.proxyIp}:2375`)),
    {
      runtimeImage: o.image,
      rolesNetwork: ROLES_NET,
      enginesVolume: ENGINES_VOLUME,
      egressProxyUrl: 'http://ga-egress:3128',
      noProxy: 'ga-app',
      fakeEngineSourceUrl: FAKE_SOURCE_URL,
      forbiddenValues: [
        supervisorKey.toString('hex'),
        supervisorKey.toString('base64'),
        termKey.toString('hex'),
        termKey.toString('base64'),
      ],
    },
    log,
  );
  const svc = new SupervisorService(
    broker,
    {
      runtimeImage: o.image,
      rolesNetwork: ROLES_NET,
      enginesVolume: ENGINES_VOLUME,
      egressProxyUrl: 'http://ga-egress:3128',
      noProxy: 'ga-app',
      fakeEngineSourceUrl: FAKE_SOURCE_URL,
      gatewayUrl: 'http://ga-app:7410',
      version: 'it',
    },
    log,
    systemClock,
  );
  const pty = new PtyRelay(svc, {
    termKey,
    allowedOrigins: [],
    maxDurationSeconds: o.ptyMaxSeconds ?? 600,
    clock: systemClock,
    log,
  });
  const server = createSupervisorServer({ svc, pty, supervisorKey, clock: systemClock, log });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const rpc = async (method: string, body: unknown) => {
    const path = `${SUPERVISOR_RPC.basePath}/${method}`;
    const raw = JSON.stringify(body);
    const ts = String(Math.floor(Date.now() / 1000));
    const r = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ga-ts': ts,
        'x-ga-sig': signRpc(supervisorKey, ts, 'POST', path, raw),
      },
      body: raw,
    });
    return { status: r.status, text: await r.text() };
  };
  return {
    server,
    base,
    svc,
    pty,
    broker,
    supervisorKey,
    termKey,
    clock: systemClock,
    rpc,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
