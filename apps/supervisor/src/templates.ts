import { createHash } from 'node:crypto';
import { CONTAINER_TEMPLATES, type Consumer, type ContainerTemplate } from '@ga/contracts';
import { SupervisorError } from './errors.ts';

// MẪU CONTAINER CÓ VERSION (BUILD-PLAN §B.3, CNS-166): supervisor KHÔNG nhận spec Docker từ ga-app — chỉ nhận tên mẫu + consumer
// + danh sách volume /auth, rồi dựng body Docker từ mẫu ở đây. Mẫu không có version (vd `role`) bị từ chối. Mỗi body sau đó
// còn qua policy.ts (chốt chặn độc lập) trước khi tới Docker.
// Mẫu NỘI BỘ (không lộ qua RPC): engine-install.v1 (container cài CLI, ga-engines RW), volume-init.v1 (gieo quyền sở hữu
// volume mới cho uid 10001 bằng copy-up của Docker — không cần tiến trình root).

export const MANAGED_BY = 'ga-supervisor';
export const LABELS = {
  kind: 'genagents.kind',
  managedBy: 'genagents.managed-by',
  template: 'genagents.template',
  consumer: 'genagents.consumer',
  specHash: 'genagents.spec-hash',
  accounts: 'genagents.accounts',
} as const;

export const INTERNAL_TEMPLATES = ['engine-install.v1', 'volume-init.v1'] as const;
export type InternalTemplate = (typeof INTERNAL_TEMPLATES)[number];
export type AnyTemplate = ContainerTemplate | InternalTemplate;
export const ALL_TEMPLATES: readonly string[] = [...CONTAINER_TEMPLATES, ...INTERNAL_TEMPLATES];

export const RUNTIME_USER = '10001:10001';
export const SEED_DIRS = { auth: '/opt/ga/seed-auth', engines: '/opt/ga/seed-engines' } as const;
export const MOUNTS = { authRoot: '/auth', engines: '/opt/engines' } as const;
export const TMPFS: Readonly<Record<string, string>> = {
  // exec vẫn cho phép trên tmpfs: CLI đóng gói (bun / node SEA) có thể cần nạp module gốc từ thư mục tạm — chưa kiểm, Spike 1c
  '/run/ga': 'rw,nosuid,nodev,size=268435456,uid=10001,gid=10001,mode=0700',
  '/tmp': 'rw,nosuid,nodev,size=268435456,uid=10001,gid=10001,mode=1777',
};
/** Tài nguyên mỗi container [ĐỀ XUẤT — L-RT]. Policy so KHỚP CHÍNH XÁC. */
export const LIMITS = { memory: 2 * 1024 ** 3, nanoCpus: 2_000_000_000, pids: 512 } as const;
export const IDLE_CMD = ['sleep', 'infinity'] as const;
export const WORKING_DIR = '/tmp';
export const CONTAINER_LANG = 'C.UTF-8';
/** Không tự khởi động lại (supervisor reconcile quyết định). Policy so KHỚP CHÍNH XÁC. */
export const RESTART_POLICY: Readonly<{ Name: 'no' }> = { Name: 'no' };
/** Log driver cục bộ duy nhất (driver gửi log ra ngoài — syslog / gelf / fluentd… — vòng qua egress). Policy so KHỚP CHÍNH XÁC. */
export const LOG_CONFIG: Readonly<{ Type: 'json-file'; Config: Readonly<Record<string, string>> }> = {
  Type: 'json-file',
  Config: { 'max-size': '1m', 'max-file': '1' },
};

export interface TemplateEnv {
  runtimeImage: string;
  rolesNetwork: string;
  enginesVolume: string;
  egressProxyUrl: string;
  noProxy: string;
  fakeEngineSourceUrl: string | null;
}

const AUTH_VOLUME_RE = /^ga-auth-en-([0-9]{4,12})$/;
const ROLE_DISPLAY_RE = /^RL-[0-9]{4,12}$/;
const WS_CODE_RE = /^[A-Za-z0-9]{4}$/;
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** `ga-auth-en-0001` ⇒ `EN-0001` (thư mục /auth/EN-0001). Tên không theo dạng số ⇒ không mount được (fail-closed). */
export function accountOfVolume(volume: string): string {
  const m = AUTH_VOLUME_RE.exec(volume);
  if (!m) throw new SupervisorError('bad_request', 'tên volume /auth phải là ga-auth-en-<số> (ánh xạ tới EN-<số>)');
  return `EN-${m[1]}`;
}

export function containerNameOf(consumer: Consumer): string {
  if (consumer.kind === 'sys') {
    if (!WS_CODE_RE.test(consumer.workspaceCode) || !ULID_RE.test(consumer.workspaceId)) {
      throw new SupervisorError('bad_request', 'consumer sys sai dạng');
    }
    return `ga-sys-${consumer.workspaceCode}`;
  }
  if (!ROLE_DISPLAY_RE.test(consumer.roleDisplayId) || !ULID_RE.test(consumer.roleId)) {
    throw new SupervisorError('bad_request', 'consumer role sai dạng');
  }
  // display_id chỉ duy nhất trong workspace ⇒ thêm ULID (duy nhất toàn cục)
  return `ga-role-${consumer.roleDisplayId}-${consumer.roleId.toLowerCase()}`;
}

export function consumerIdOf(consumer: Consumer): string {
  return consumer.kind === 'sys' ? consumer.workspaceId : consumer.roleId;
}

function proxyEnv(env: TemplateEnv): string[] {
  return [
    `HTTPS_PROXY=${env.egressProxyUrl}`,
    `HTTP_PROXY=${env.egressProxyUrl}`,
    `NO_PROXY=${env.noProxy}`,
    `LANG=${CONTAINER_LANG}`,
  ];
}

function baseHostConfig(networkMode: string, mounts: unknown[], tmpfs: Record<string, string>) {
  return {
    NetworkMode: networkMode,
    Mounts: mounts,
    Tmpfs: tmpfs,
    CapDrop: ['ALL'],
    SecurityOpt: ['no-new-privileges:true'],
    ReadonlyRootfs: true,
    Privileged: false,
    Init: true,
    Memory: LIMITS.memory,
    MemorySwap: LIMITS.memory,
    NanoCpus: LIMITS.nanoCpus,
    PidsLimit: LIMITS.pids,
    RestartPolicy: { ...RESTART_POLICY },
    LogConfig: { Type: LOG_CONFIG.Type, Config: { ...LOG_CONFIG.Config } },
  };
}

export interface BuiltContainer {
  name: string;
  body: Record<string, unknown>;
  specHash: string;
}

function finalize(name: string, body: Record<string, unknown>, hashInput: unknown): BuiltContainer {
  const specHash = createHash('sha256').update(JSON.stringify(hashInput)).digest('hex').slice(0, 32);
  (body.Labels as Record<string, string>)[LABELS.specHash] = specHash;
  return { name, body, specHash };
}

/** role.v1 / sys.v1: container ngủ của consumer — /auth/<en> RW mỗi tài khoản, ga-engines CHỈ ĐỌC, tmpfs /run/ga. */
export function buildConsumerContainer(
  template: string,
  consumer: Consumer,
  authVolumes: readonly string[],
  env: TemplateEnv,
): BuiltContainer {
  if (!(CONTAINER_TEMPLATES as readonly string[]).includes(template)) {
    throw new SupervisorError('bad_request', 'mẫu container không có version / không hỗ trợ', ['template_unversioned']);
  }
  const kind = template === 'sys.v1' ? 'sys' : 'role';
  if (kind !== consumer.kind) throw new SupervisorError('bad_request', 'mẫu không khớp loại consumer');
  const name = containerNameOf(consumer);
  const vols = [...new Set(authVolumes)].sort();
  if (vols.length > 16) throw new SupervisorError('bad_request', 'quá nhiều volume /auth');
  const accounts = vols.map(accountOfVolume);
  const mounts = [
    ...vols.map((v, i) => ({
      Type: 'volume',
      Source: v,
      Target: `${MOUNTS.authRoot}/${accounts[i]}`,
      ReadOnly: false,
    })),
    { Type: 'volume', Source: env.enginesVolume, Target: MOUNTS.engines, ReadOnly: true },
  ];
  const body: Record<string, unknown> = {
    Image: env.runtimeImage,
    Cmd: [...IDLE_CMD],
    User: RUNTIME_USER,
    WorkingDir: WORKING_DIR,
    Env: proxyEnv(env),
    Labels: {
      [LABELS.kind]: kind,
      [LABELS.managedBy]: MANAGED_BY,
      [LABELS.template]: template,
      [LABELS.consumer]: consumerIdOf(consumer),
      [LABELS.accounts]: accounts.join(','),
    },
    AttachStdin: false,
    AttachStdout: false,
    AttachStderr: false,
    Tty: false,
    OpenStdin: false,
    HostConfig: baseHostConfig(env.rolesNetwork, mounts, { ...TMPFS }),
    NetworkingConfig: { EndpointsConfig: { [env.rolesNetwork]: {} } },
  };
  return finalize(name, body, { template, consumer, vols, env: { ...env, fakeEngineSourceUrl: null } });
}

/** engine-install.v1: container cài CLI một lần — ga-engines RW (DUY NHẤT chỗ này), đi ra qua egress. */
export function buildInstallerContainer(slug: string, env: TemplateEnv): BuiltContainer {
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(slug)) throw new SupervisorError('bad_request', 'engineSlug sai dạng');
  const extraEnv = env.fakeEngineSourceUrl ? [`GA_FAKE_ENGINE_SOURCE_URL=${env.fakeEngineSourceUrl}`] : [];
  const body: Record<string, unknown> = {
    Image: env.runtimeImage,
    Cmd: [...IDLE_CMD],
    User: RUNTIME_USER,
    WorkingDir: WORKING_DIR,
    Env: [...proxyEnv(env), ...extraEnv],
    Labels: {
      [LABELS.kind]: 'sys',
      [LABELS.managedBy]: MANAGED_BY,
      [LABELS.template]: 'engine-install.v1',
      [LABELS.consumer]: slug,
    },
    AttachStdin: false,
    AttachStdout: false,
    AttachStderr: false,
    Tty: false,
    OpenStdin: false,
    HostConfig: baseHostConfig(
      env.rolesNetwork,
      [{ Type: 'volume', Source: env.enginesVolume, Target: MOUNTS.engines, ReadOnly: false }],
      { '/tmp': TMPFS['/tmp'] as string, '/run/ga': TMPFS['/run/ga'] as string },
    ),
    NetworkingConfig: { EndpointsConfig: { [env.rolesNetwork]: {} } },
  };
  return finalize(`ga-sys-install-${slug}`, body, { t: 'engine-install.v1', slug, env });
}

/** volume-init.v1: KHÔNG chạy; chỉ tạo để Docker copy-up quyền sở hữu thư mục mồi (uid 10001) sang volume mới, rồi xoá. */
export function buildVolumeInitContainer(volume: string, kind: 'auth' | 'engines', env: TemplateEnv): BuiltContainer {
  const body: Record<string, unknown> = {
    Image: env.runtimeImage,
    Cmd: ['true'],
    User: RUNTIME_USER,
    WorkingDir: WORKING_DIR,
    Env: [`LANG=${CONTAINER_LANG}`],
    Labels: {
      [LABELS.kind]: 'sys',
      [LABELS.managedBy]: MANAGED_BY,
      [LABELS.template]: 'volume-init.v1',
      [LABELS.consumer]: volume,
    },
    AttachStdin: false,
    AttachStdout: false,
    AttachStderr: false,
    Tty: false,
    OpenStdin: false,
    HostConfig: baseHostConfig(
      'none',
      [{ Type: 'volume', Source: volume, Target: SEED_DIRS[kind], ReadOnly: false }],
      {},
    ),
  };
  const hash = createHash('sha256').update(volume).digest('hex').slice(0, 12);
  return finalize(`ga-sys-volinit-${hash}`, body, { t: 'volume-init.v1', volume, kind });
}

export function isContractTemplate(t: string): t is ContainerTemplate {
  return (CONTAINER_TEMPLATES as readonly string[]).includes(t);
}

export type { AnyTemplate as Template };
