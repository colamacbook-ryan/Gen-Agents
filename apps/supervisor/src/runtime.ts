import type { Readable } from 'node:stream';
import { CONTAINER_KINDS, ContainerRef } from '@ga/contracts';
import { SupervisorError } from './errors.ts';
import type { Logger } from './log.ts';
import { checkCreate, checkExec, type ExecSpec, type PolicyConfig } from './policy.ts';
import { ALL_TEMPLATES, LABELS, MANAGED_BY } from './templates.ts';
import type { ObservedState } from './types.ts';

// Hai lớp: Runtime = thao tác Docker thô (driver docker | local); Broker = CỔNG DUY NHẤT supervisor dùng — mọi create / exec đi
// qua policy, mọi thao tác theo tên đi qua resolveManaged (chỉ container nhãn genagents.* do chính supervisor dựng; sau đó dùng
// ID đã kiểm, không dùng lại tên ⇒ không TOCTOU đổi tên).

export interface MountInfo {
  type: string;
  name: string | null;
  destination: string;
  rw: boolean;
}

export interface ContainerInfo {
  id: string;
  /** Không có dấu '/' đầu. */
  name: string;
  labels: Record<string, string>;
  state: ObservedState;
  running: boolean;
  mounts: MountInfo[];
  image: string;
  /** IP theo mạng. */
  networks: Record<string, string | null>;
  env: string[];
}

export interface ExecSession {
  readonly id: string;
  /** Không TTY: stdout đã tách; TTY: luồng thô hai chiều. */
  readonly stdout: Readable;
  readonly stderr: Readable | null;
  write(data: Buffer | string): void;
  resize(cols: number, rows: number): Promise<void>;
  inspect(): Promise<{ running: boolean; exitCode: number | null }>;
  /** Cắt kết nối exec (không giết được tiến trình trong container — Docker API không có). */
  destroy(): void;
  /** Hoàn tất khi luồng exec kết thúc. */
  readonly done: Promise<void>;
}

export interface Runtime {
  ping(): Promise<boolean>;
  inspectContainer(nameOrId: string): Promise<ContainerInfo | null>;
  listContainers(labelFilters: readonly string[]): Promise<ContainerInfo[]>;
  createContainer(name: string, body: Record<string, unknown>): Promise<string>;
  startContainer(id: string): Promise<void>;
  stopContainer(id: string, timeoutSec: number): Promise<void>;
  removeContainer(id: string): Promise<void>;
  /** Tạo volume nếu chưa có; trả true nếu vừa tạo. */
  ensureVolume(name: string, labels: Record<string, string>): Promise<boolean>;
  exec(containerId: string, spec: ExecSpec): Promise<ExecSession>;
}

export function isManaged(c: ContainerInfo): boolean {
  return (
    (CONTAINER_KINDS as readonly string[]).includes(c.labels[LABELS.kind] ?? '') &&
    c.labels[LABELS.managedBy] === MANAGED_BY &&
    ALL_TEMPLATES.includes(c.labels[LABELS.template] ?? '')
  );
}

export class Broker {
  readonly rt: Runtime;
  private readonly policy: PolicyConfig;
  private readonly log: Logger;
  constructor(rt: Runtime, policy: PolicyConfig, log: Logger) {
    this.rt = rt;
    this.policy = policy;
    this.log = log;
  }

  /**
   * Chỉ container do supervisor quản: tên đúng mẫu ContainerRef, tồn tại, tên khớp CHÍNH XÁC (không khớp tiền tố ID),
   * nhãn genagents.kind ∈ {role, sys} + managed-by + mẫu đã biết. Mọi container khác (ga-app, ga-updater, container lạ đặt
   * tên giống) ⇒ not_managed / not_found.
   */
  async resolveManaged(name: string): Promise<ContainerInfo> {
    if (!ContainerRef.safeParse({ name }).success)
      throw new SupervisorError('not_managed', 'tên container ngoài phạm vi quản');
    const c = await this.rt.inspectContainer(name);
    if (!c) throw new SupervisorError('not_found', 'không có container');
    if (c.name !== name || !isManaged(c)) {
      this.log.log('warn', 'reject_unmanaged', { container: name });
      throw new SupervisorError('not_managed', 'container không do supervisor quản (thiếu nhãn genagents.*)');
    }
    return c;
  }

  /** null nếu chưa có; lỗi nếu có nhưng không do supervisor quản (không đè container lạ). */
  async findManaged(name: string): Promise<ContainerInfo | null> {
    const c = await this.rt.inspectContainer(name);
    if (!c) return null;
    if (c.name !== name || !isManaged(c)) throw new SupervisorError('name_conflict', 'tên đã bị container khác chiếm');
    return c;
  }

  async create(name: string, body: Record<string, unknown>): Promise<string> {
    const v = checkCreate(name, body, this.policy);
    if (v.length > 0) {
      this.log.log('warn', 'policy_reject_create', { container: name, rules: v.map((x) => x.rule).join(',') });
      throw new SupervisorError('policy_violation', 'spec container vi phạm policy', [
        ...new Set(v.map((x) => x.rule)),
      ]);
    }
    return this.rt.createContainer(name, body);
  }

  async exec(c: ContainerInfo, spec: ExecSpec): Promise<ExecSession> {
    if (!isManaged(c)) throw new SupervisorError('not_managed', 'container không do supervisor quản');
    const v = checkExec(spec);
    if (v.length > 0) {
      this.log.log('warn', 'policy_reject_exec', { container: c.name, rules: v.map((x) => x.rule).join(',') });
      throw new SupervisorError('policy_violation', 'exec vi phạm policy', [...new Set(v.map((x) => x.rule))]);
    }
    if (!c.running) throw new SupervisorError('container_not_running', 'container chưa chạy');
    return this.rt.exec(c.id, spec);
  }

  async start(c: ContainerInfo): Promise<void> {
    if (!isManaged(c)) throw new SupervisorError('not_managed', 'container không do supervisor quản');
    await this.rt.startContainer(c.id);
  }
  async stop(c: ContainerInfo): Promise<void> {
    if (!isManaged(c)) throw new SupervisorError('not_managed', 'container không do supervisor quản');
    await this.rt.stopContainer(c.id, 10);
  }
  async remove(c: ContainerInfo): Promise<void> {
    if (!isManaged(c)) throw new SupervisorError('not_managed', 'container không do supervisor quản');
    await this.rt.removeContainer(c.id);
  }

  async listManaged(): Promise<ContainerInfo[]> {
    const all = await this.rt.listContainers([`${LABELS.managedBy}=${MANAGED_BY}`]);
    return all.filter(isManaged);
  }
}
