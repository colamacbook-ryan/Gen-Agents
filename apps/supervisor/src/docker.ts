import { type Duplex, PassThrough } from 'node:stream';
import Docker from 'dockerode';
import { SupervisorError } from './errors.ts';
import type { ExecSpec } from './policy.ts';
import type { ContainerInfo, ExecSession, Runtime } from './runtime.ts';
import type { ObservedState } from './types.ts';

// Driver `docker`: Docker Engine API qua docker-socket-proxy (BUILD-PLAN §B.2: proxy bật CONTAINERS, EXEC, IMAGES, NETWORKS,
// VOLUMES, POST, INFO, VERSION). Chỉ module này import dockerode (lint dockerode-only-in-supervisor). Không có logic policy:
// mọi lời gọi đều qua Broker.

type InspectInfo = Awaited<ReturnType<Docker.Container['inspect']>>;

function stateOf(s: InspectInfo['State'] | undefined): ObservedState {
  switch (s?.Status) {
    case 'created':
      return 'created';
    case 'running':
    case 'restarting':
      return 'running';
    case 'exited':
    case 'dead':
      return 'exited';
    case 'paused':
      return 'paused';
    case 'removing':
      return 'unknown';
    default:
      return 'unknown';
  }
}

function infoOf(i: InspectInfo): ContainerInfo {
  const nets: Record<string, string | null> = {};
  for (const [n, v] of Object.entries(i.NetworkSettings?.Networks ?? {})) nets[n] = v?.IPAddress || null;
  return {
    id: i.Id,
    name: (i.Name ?? '').replace(/^\//, ''),
    labels: i.Config?.Labels ?? {},
    state: stateOf(i.State),
    running: i.State?.Running === true,
    mounts: (i.Mounts ?? []).map((m) => ({
      type: String(m.Type),
      name: m.Name ?? null,
      destination: m.Destination,
      rw: m.RW === true,
    })),
    image: i.Image,
    networks: nets,
    env: i.Config?.Env ?? [],
  };
}

function wrap(e: unknown): SupervisorError {
  const status = (e as { statusCode?: number }).statusCode;
  if (status === 404) return new SupervisorError('not_found', 'docker: không thấy đối tượng');
  if (status === 409) return new SupervisorError('name_conflict', 'docker: xung đột trạng thái / tên');
  if (status === 403) return new SupervisorError('docker_error', 'docker-socket-proxy chặn lời gọi');
  return new SupervisorError('docker_error', `docker: lỗi ${status ?? 'kết nối'}`);
}

export function dockerFromHost(dockerHost: string): Docker {
  if (dockerHost.startsWith('unix://')) return new Docker({ socketPath: dockerHost.slice('unix://'.length) });
  const u = new URL(dockerHost.replace(/^tcp:/, 'http:'));
  return new Docker({ host: u.hostname, port: Number(u.port), protocol: 'http' });
}

export class DockerRuntime implements Runtime {
  private readonly d: Docker;
  constructor(d: Docker) {
    this.d = d;
  }

  async ping(): Promise<boolean> {
    try {
      await this.d.ping();
      return true;
    } catch {
      return false;
    }
  }

  async inspectContainer(nameOrId: string): Promise<ContainerInfo | null> {
    try {
      return infoOf(await this.d.getContainer(nameOrId).inspect());
    } catch (e) {
      if ((e as { statusCode?: number }).statusCode === 404) return null;
      throw wrap(e);
    }
  }

  async listContainers(labelFilters: readonly string[]): Promise<ContainerInfo[]> {
    try {
      const list = await this.d.listContainers({ all: true, filters: { label: [...labelFilters] } });
      const out: ContainerInfo[] = [];
      for (const c of list) {
        const i = await this.inspectContainer(c.Id);
        if (i) out.push(i);
      }
      return out;
    } catch (e) {
      throw e instanceof SupervisorError ? e : wrap(e);
    }
  }

  async createContainer(name: string, body: Record<string, unknown>): Promise<string> {
    try {
      const c = await this.d.createContainer({ ...(body as Docker.ContainerCreateOptions), name });
      return c.id;
    } catch (e) {
      throw wrap(e);
    }
  }

  async startContainer(id: string): Promise<void> {
    try {
      await this.d.getContainer(id).start();
    } catch (e) {
      if ((e as { statusCode?: number }).statusCode === 304) return; // đã chạy
      throw wrap(e);
    }
  }

  async stopContainer(id: string, timeoutSec: number): Promise<void> {
    try {
      await this.d.getContainer(id).stop({ t: timeoutSec });
    } catch (e) {
      if ((e as { statusCode?: number }).statusCode === 304) return; // đã dừng
      throw wrap(e);
    }
  }

  async removeContainer(id: string): Promise<void> {
    try {
      await this.d.getContainer(id).remove({ force: true, v: false });
    } catch (e) {
      if ((e as { statusCode?: number }).statusCode === 404) return;
      throw wrap(e);
    }
  }

  async ensureVolume(name: string, labels: Record<string, string>): Promise<boolean> {
    try {
      await this.d.getVolume(name).inspect();
      return false;
    } catch (e) {
      if ((e as { statusCode?: number }).statusCode !== 404) throw wrap(e);
    }
    try {
      await this.d.createVolume({ Name: name, Driver: 'local', Labels: labels });
      return true;
    } catch (e) {
      throw wrap(e);
    }
  }

  async exec(containerId: string, spec: ExecSpec): Promise<ExecSession> {
    let stream: Duplex;
    let exec: Docker.Exec;
    try {
      exec = await this.d.getContainer(containerId).exec({
        Cmd: spec.Cmd,
        Env: spec.Env,
        User: spec.User,
        Tty: spec.Tty,
        Privileged: spec.Privileged,
        AttachStdin: spec.AttachStdin,
        AttachStdout: spec.AttachStdout,
        AttachStderr: spec.AttachStderr,
        WorkingDir: spec.WorkingDir,
      });
      stream = (await exec.start({ hijack: true, stdin: spec.AttachStdin, Tty: spec.Tty })) as unknown as Duplex;
    } catch (e) {
      throw wrap(e);
    }
    const stdout = new PassThrough();
    const stderr = spec.Tty ? null : new PassThrough();
    if (spec.Tty) stream.pipe(stdout);
    else this.d.modem.demuxStream(stream, stdout, stderr as PassThrough);
    const done = new Promise<void>((resolve) => {
      let finished = false;
      const fin = () => {
        if (finished) return;
        finished = true;
        if (!spec.Tty) {
          stdout.end();
          stderr?.end();
        }
        resolve();
      };
      stream.on('end', fin);
      stream.on('close', fin);
      stream.on('error', fin);
    });
    const ex = exec;
    return {
      id: ex.id,
      stdout,
      stderr,
      write: (data) => {
        if (!stream.destroyed) stream.write(data);
      },
      resize: async (cols, rows) => {
        try {
          await ex.resize({ h: rows, w: cols });
        } catch (e) {
          throw wrap(e);
        }
      },
      inspect: async () => {
        try {
          const i = await ex.inspect();
          return { running: i.Running === true, exitCode: typeof i.ExitCode === 'number' ? i.ExitCode : null };
        } catch (e) {
          throw wrap(e);
        }
      },
      destroy: () => stream.destroy(),
      done,
    };
  }
}
