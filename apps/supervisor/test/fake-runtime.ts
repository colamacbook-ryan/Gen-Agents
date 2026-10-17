import { PassThrough } from 'node:stream';
import type { ExecSpec } from '../src/policy.ts';
import type { ContainerInfo, ExecSession, Runtime } from '../src/runtime.ts';

// Runtime giả trong bộ nhớ cho unit test của supervisor (IT dùng Docker thật).

export interface FakeExec {
  containerId: string;
  spec: ExecSpec;
  stdin: string[];
  resizes: [number, number][];
  stdout: PassThrough;
  stderr: PassThrough | null;
  running: boolean;
  exitCode: number | null;
  finish(code?: number): void;
  destroyed: boolean;
}

export class FakeRuntime implements Runtime {
  containers = new Map<string, ContainerInfo>();
  volumes = new Map<string, Record<string, string>>();
  created: { name: string; body: Record<string, unknown> }[] = [];
  removed: string[] = [];
  execs: FakeExec[] = [];
  /** Hành vi exec: gọi khi exec mới được tạo (test tự ghi stdout / kết thúc). */
  onExec: (e: FakeExec) => void = (e) => e.finish(0);
  reachable = true;
  private n = 0;

  async ping() {
    return this.reachable;
  }
  async inspectContainer(nameOrId: string) {
    for (const c of this.containers.values()) if (c.id === nameOrId || c.name === nameOrId) return structuredClone(c);
    return null;
  }
  async listContainers(labelFilters: readonly string[]) {
    return [...this.containers.values()]
      .filter((c) =>
        labelFilters.every((f) => {
          const [k, v] = f.split('=');
          return c.labels[k ?? ''] === v;
        }),
      )
      .map((c) => structuredClone(c));
  }
  async createContainer(name: string, body: Record<string, unknown>) {
    if ([...this.containers.values()].some((c) => c.name === name)) {
      throw Object.assign(new Error('conflict'), { statusCode: 409 });
    }
    const id = `id${++this.n}`.padEnd(64, '0');
    this.created.push({ name, body });
    const host = body.HostConfig as {
      Mounts?: { Source: string; Target: string; ReadOnly: boolean }[];
      NetworkMode: string;
    };
    this.containers.set(id, {
      id,
      name,
      labels: (body.Labels as Record<string, string>) ?? {},
      state: 'created',
      running: false,
      mounts: (host.Mounts ?? []).map((m) => ({
        type: 'volume',
        name: m.Source,
        destination: m.Target,
        rw: !m.ReadOnly,
      })),
      image: String(body.Image),
      networks: { [host.NetworkMode]: null },
      env: (body.Env as string[]) ?? [],
    });
    return id;
  }
  /** Container ngoài sự quản lý (vd ga-app) để thử ca âm. */
  addForeign(name: string, labels: Record<string, string> = {}, running = true) {
    const id = `foreign${++this.n}`.padEnd(64, 'f');
    this.containers.set(id, {
      id,
      name,
      labels,
      state: running ? 'running' : 'exited',
      running,
      mounts: [],
      image: 'x',
      networks: {},
      env: [],
    });
    return id;
  }
  async startContainer(id: string) {
    const c = this.containers.get(id);
    if (!c) throw Object.assign(new Error('nf'), { statusCode: 404 });
    c.running = true;
    c.state = 'running';
    for (const k of Object.keys(c.networks)) c.networks[k] = `172.30.0.${this.n}`;
  }
  async stopContainer(id: string) {
    const c = this.containers.get(id);
    if (!c) throw Object.assign(new Error('nf'), { statusCode: 404 });
    c.running = false;
    c.state = 'exited';
  }
  async removeContainer(id: string) {
    this.removed.push(this.containers.get(id)?.name ?? id);
    this.containers.delete(id);
  }
  async ensureVolume(name: string, labels: Record<string, string>) {
    if (this.volumes.has(name)) return false;
    this.volumes.set(name, labels);
    return true;
  }
  async exec(containerId: string, spec: ExecSpec): Promise<ExecSession> {
    let resolveDone: () => void = () => {};
    const done = new Promise<void>((r) => {
      resolveDone = r;
    });
    const e: FakeExec = {
      containerId,
      spec,
      stdin: [],
      resizes: [],
      stdout: new PassThrough(),
      stderr: spec.Tty ? null : new PassThrough(),
      running: true,
      exitCode: null,
      destroyed: false,
      finish: (code = 0) => {
        if (!e.running) return;
        e.running = false;
        e.exitCode = code;
        e.stdout.end();
        e.stderr?.end();
        resolveDone();
      },
    };
    this.execs.push(e);
    const session: ExecSession = {
      id: `exec${this.execs.length}`,
      stdout: e.stdout,
      stderr: e.stderr,
      write: (d) => {
        e.stdin.push(String(d));
      },
      resize: async (cols, rows) => {
        e.resizes.push([cols, rows]);
      },
      inspect: async () => ({ running: e.running, exitCode: e.exitCode }),
      destroy: () => {
        e.destroyed = true;
        resolveDone();
      },
      done,
    };
    queueMicrotask(() => this.onExec(e));
    return session;
  }
}
