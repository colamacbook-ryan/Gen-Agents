import type { Socket } from 'node:net';
import { PassThrough } from 'node:stream';
import { DockerApi, DockerApiError, demuxDockerStream, endpointFromHost } from './docker-api.ts';
import { SupervisorError } from './errors.ts';
import type { ExecSpec } from './policy.ts';
import type { ContainerInfo, ExecSession, Runtime } from './runtime.ts';
import type { ObservedState } from './types.ts';

// Driver `docker`: Docker Engine API qua docker-socket-proxy (BUILD-PLAN §B.2: proxy bật CONTAINERS, EXEC, IMAGES, NETWORKS,
// VOLUMES, POST, INFO, VERSION) bằng máy khách tối thiểu docker-api.ts. Không có logic policy: mọi lời gọi đều qua Broker.

/** Phần của `GET /containers/{id}/json` supervisor đọc. */
interface InspectInfo {
  Id: string;
  Name?: string;
  Image: string;
  Config?: { Labels?: Record<string, string> | null; Env?: string[] | null };
  State?: { Status?: string; Running?: boolean };
  Mounts?: { Type?: string; Name?: string; Destination: string; RW?: boolean }[] | null;
  NetworkSettings?: { Networks?: Record<string, { IPAddress?: string } | null> | null };
}

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

const statusOf = (e: unknown) => (e instanceof DockerApiError ? e.statusCode : null);

function wrap(e: unknown): SupervisorError {
  if (e instanceof SupervisorError) return e;
  const status = statusOf(e);
  if (status === 404) return new SupervisorError('not_found', 'docker: không thấy đối tượng');
  if (status === 409) return new SupervisorError('name_conflict', 'docker: xung đột trạng thái / tên');
  if (status === 403) return new SupervisorError('docker_error', 'docker-socket-proxy chặn lời gọi');
  return new SupervisorError('docker_error', `docker: lỗi ${status ?? 'kết nối'}`);
}

const id = (s: string) => encodeURIComponent(s);

export function dockerFromHost(dockerHost: string): DockerApi {
  return new DockerApi(endpointFromHost(dockerHost));
}

export class DockerRuntime implements Runtime {
  private readonly d: DockerApi;
  constructor(d: DockerApi) {
    this.d = d;
  }

  async ping(): Promise<boolean> {
    try {
      const r = await this.d.call('GET', '/_ping', { timeoutMs: 5_000 });
      return r.status === 200;
    } catch {
      return false;
    }
  }

  async inspectContainer(nameOrId: string): Promise<ContainerInfo | null> {
    try {
      const r = await this.d.json<InspectInfo>('GET', `/containers/${id(nameOrId)}/json`, [200]);
      if (!r.value) throw new DockerApiError(200, 'inspect rỗng');
      return infoOf(r.value);
    } catch (e) {
      if (statusOf(e) === 404) return null;
      throw wrap(e);
    }
  }

  async listContainers(labelFilters: readonly string[]): Promise<ContainerInfo[]> {
    let list: { Id: string }[];
    try {
      const r = await this.d.json<{ Id: string }[]>('GET', '/containers/json', [200], {
        query: { all: true, filters: JSON.stringify({ label: [...labelFilters] }) },
      });
      list = r.value ?? [];
    } catch (e) {
      throw wrap(e);
    }
    const out: ContainerInfo[] = [];
    for (const c of list) {
      const i = await this.inspectContainer(c.Id);
      if (i) out.push(i);
    }
    return out;
  }

  async createContainer(name: string, body: Record<string, unknown>): Promise<string> {
    try {
      const r = await this.d.json<{ Id?: string }>('POST', '/containers/create', [201], { query: { name }, body });
      if (typeof r.value?.Id !== 'string') throw new DockerApiError(r.status, 'Docker không trả Id container');
      return r.value.Id;
    } catch (e) {
      throw wrap(e);
    }
  }

  async startContainer(cid: string): Promise<void> {
    try {
      await this.d.json('POST', `/containers/${id(cid)}/start`, [204, 304]); // 304 = đã chạy
    } catch (e) {
      throw wrap(e);
    }
  }

  async stopContainer(cid: string, timeoutSec: number): Promise<void> {
    try {
      await this.d.json('POST', `/containers/${id(cid)}/stop`, [204, 304], {
        query: { t: timeoutSec },
        timeoutMs: (timeoutSec + 30) * 1000,
      }); // 304 = đã dừng
    } catch (e) {
      throw wrap(e);
    }
  }

  async removeContainer(cid: string): Promise<void> {
    try {
      await this.d.json('DELETE', `/containers/${id(cid)}`, [204, 404], { query: { force: true, v: false } });
    } catch (e) {
      throw wrap(e);
    }
  }

  async ensureVolume(name: string, labels: Record<string, string>): Promise<boolean> {
    try {
      const r = await this.d.call('GET', `/volumes/${id(name)}`);
      if (r.status === 200) return false;
      if (r.status !== 404) throw new DockerApiError(r.status, `Docker trả ${r.status}`);
      await this.d.json('POST', '/volumes/create', [201], { body: { Name: name, Driver: 'local', Labels: labels } });
      return true;
    } catch (e) {
      throw wrap(e);
    }
  }

  async exec(containerId: string, spec: ExecSpec): Promise<ExecSession> {
    let execId: string;
    let stream: Socket;
    try {
      const r = await this.d.json<{ Id?: string }>('POST', `/containers/${id(containerId)}/exec`, [201], {
        body: {
          Cmd: spec.Cmd,
          Env: spec.Env,
          User: spec.User,
          Tty: spec.Tty,
          Privileged: spec.Privileged,
          AttachStdin: spec.AttachStdin,
          AttachStdout: spec.AttachStdout,
          AttachStderr: spec.AttachStderr,
          WorkingDir: spec.WorkingDir,
        },
      });
      if (typeof r.value?.Id !== 'string') throw new DockerApiError(r.status, 'Docker không trả Id exec');
      execId = r.value.Id;
      stream = await this.d.hijack(`/exec/${id(execId)}/start`, { Detach: false, Tty: spec.Tty });
    } catch (e) {
      throw wrap(e);
    }
    const stdout = new PassThrough();
    const stderr = spec.Tty ? null : new PassThrough();
    if (spec.Tty) stream.pipe(stdout);
    else demuxDockerStream(stream, stdout, stderr as PassThrough);
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
    return {
      id: execId,
      stdout,
      stderr,
      write: (data) => {
        if (!stream.destroyed) stream.write(data);
      },
      resize: async (cols, rows) => {
        try {
          await this.d.json('POST', `/exec/${id(execId)}/resize`, [200, 201], { query: { h: rows, w: cols } });
        } catch (e) {
          throw wrap(e);
        }
      },
      inspect: async () => {
        try {
          const i = await this.d.json<{ Running?: boolean; ExitCode?: number | null }>(
            'GET',
            `/exec/${id(execId)}/json`,
            [200],
          );
          return {
            running: i.value?.Running === true,
            exitCode: typeof i.value?.ExitCode === 'number' ? i.value.ExitCode : null,
          };
        } catch (e) {
          throw wrap(e);
        }
      },
      destroy: () => stream.destroy(),
      done,
    };
  }
}
