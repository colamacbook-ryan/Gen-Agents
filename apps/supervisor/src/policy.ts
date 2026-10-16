import { CONTAINER_KINDS, EXEC_ARGV, findCredentialLike, isAllowedExecArgv } from '@ga/contracts';
import {
  ALL_TEMPLATES,
  IDLE_CMD,
  LABELS,
  LIMITS,
  MANAGED_BY,
  MOUNTS,
  RUNTIME_USER,
  SEED_DIRS,
  TMPFS,
} from './templates.ts';

// CHỐT CHẶN cuối trước Docker API (TCB; BUILD-PLAN §B.3, §C.6 "mỗi luật một ca, chỉ chính luật đó chặn"). Áp lên CHÍNH body
// gửi Docker (không phải lên yêu cầu của ga-app) ⇒ kể cả mẫu có lỗi cũng không lọt. Mặc định từ chối: khoá lạ ⇒ vi phạm.
// Mỗi vi phạm một mã luật ổn định — test âm kiểm đúng một mã cho mỗi ca.

export const CREATE_RULES = [
  'unknown_field',
  'container_io',
  'image_not_allowed',
  'privileged',
  'cap_add',
  'cap_drop',
  'docker_socket',
  'bind_mount',
  'volume_mount',
  'tmpfs_mount',
  'mount_type',
  'network_mode',
  'host_namespace',
  'devices',
  'security_opt',
  'readonly_rootfs',
  'user',
  'resources',
  'ports',
  'labels',
  'env',
  'cmd',
] as const;
export type CreateRule = (typeof CREATE_RULES)[number];

export const EXEC_RULES = [
  'exec_program',
  'exec_privileged',
  'exec_user',
  'exec_env',
  'exec_tty',
  'exec_field',
] as const;
export type ExecRule = (typeof EXEC_RULES)[number];

export interface PolicyConfig {
  runtimeImage: string;
  rolesNetwork: string;
  enginesVolume: string;
  /** Giá trị không bao giờ được xuất hiện trong env container (khoá của chính supervisor, dạng hex / base64). */
  forbiddenValues: readonly string[];
}

const TOP_KEYS = new Set([
  'Image',
  'Cmd',
  'User',
  'WorkingDir',
  'Env',
  'Labels',
  'HostConfig',
  'NetworkingConfig',
  'AttachStdin',
  'AttachStdout',
  'AttachStderr',
  'Tty',
  'OpenStdin',
]);
/** Khoá HostConfig được phép; khoá nguy hiểm có luật riêng (kiểm trước) để ca âm ra đúng mã. */
const HOST_KEYS = new Set([
  'NetworkMode',
  'Mounts',
  'Tmpfs',
  'CapDrop',
  'CapAdd',
  'SecurityOpt',
  'ReadonlyRootfs',
  'Privileged',
  'Init',
  'Memory',
  'MemorySwap',
  'NanoCpus',
  'PidsLimit',
  'RestartPolicy',
  'LogConfig',
]);
const SPECIFIC_HOST_KEYS: Record<string, CreateRule> = {
  Binds: 'bind_mount',
  VolumesFrom: 'volume_mount',
  PortBindings: 'ports',
  PublishAllPorts: 'ports',
  PidMode: 'host_namespace',
  IpcMode: 'host_namespace',
  UTSMode: 'host_namespace',
  UsernsMode: 'host_namespace',
  CgroupnsMode: 'host_namespace',
  Devices: 'devices',
  DeviceRequests: 'devices',
  DeviceCgroupRules: 'devices',
};
const CONTAINER_ENV_NAMES = new Set(['HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'LANG', 'GA_FAKE_ENGINE_SOURCE_URL']);

type V = { rule: CreateRule; detail: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const nonEmpty = (v: unknown) =>
  v !== undefined &&
  v !== null &&
  v !== false &&
  !(Array.isArray(v) && v.length === 0) &&
  !(isObj(v) && Object.keys(v).length === 0) &&
  v !== '';

function mentionsDockerSocket(s: unknown): boolean {
  return (
    typeof s === 'string' &&
    (s.includes('docker.sock') || s.includes('/var/run/docker') || s.includes('containerd.sock'))
  );
}

/** Kiểm body tạo container. Trả DANH SÁCH vi phạm (rỗng = cho phép). */
export function checkCreate(name: string, body: Record<string, unknown>, cfg: PolicyConfig): V[] {
  const out: V[] = [];
  const add = (rule: CreateRule, detail: string) => out.push({ rule, detail });

  for (const k of Object.keys(body)) {
    if (!TOP_KEYS.has(k)) add(k === 'ExposedPorts' ? 'ports' : 'unknown_field', `khoá ${k}`);
  }
  for (const k of ['AttachStdin', 'AttachStdout', 'AttachStderr', 'Tty', 'OpenStdin']) {
    if (body[k] !== undefined && body[k] !== false) add('container_io', k);
  }
  if (body.Image !== cfg.runtimeImage) add('image_not_allowed', 'ảnh ngoài allowlist digest');

  const labels = isObj(body.Labels) ? (body.Labels as Record<string, unknown>) : {};
  const kind = labels[LABELS.kind];
  const template = labels[LABELS.template];
  if (
    !(CONTAINER_KINDS as readonly unknown[]).includes(kind) ||
    labels[LABELS.managedBy] !== MANAGED_BY ||
    typeof template !== 'string' ||
    !ALL_TEMPLATES.includes(template) ||
    !name.startsWith(`ga-${String(kind)}-`) ||
    !/^ga-(role|sys)-[A-Za-z0-9-]{1,120}$/.test(name)
  ) {
    add('labels', 'nhãn genagents.* / tên không hợp lệ');
  }

  if (body.User !== RUNTIME_USER) add('user', 'phải chạy uid:gid 10001');

  const cmd = body.Cmd;
  const wantCmd = template === 'volume-init.v1' ? ['true'] : [...IDLE_CMD];
  if (!Array.isArray(cmd) || JSON.stringify(cmd) !== JSON.stringify(wantCmd)) add('cmd', 'Cmd ngoài mẫu');

  const env = Array.isArray(body.Env) ? body.Env : body.Env === undefined ? [] : null;
  if (env === null) add('env', 'Env sai dạng');
  for (const e of env ?? []) {
    const s = String(e);
    const eq = s.indexOf('=');
    const n = eq > 0 ? s.slice(0, eq) : s;
    const val = eq > 0 ? s.slice(eq + 1) : '';
    if (!CONTAINER_ENV_NAMES.has(n)) add('env', `biến ${n.slice(0, 40)} ngoài allowlist env container`);
    else if (n === 'GA_FAKE_ENGINE_SOURCE_URL' && template !== 'engine-install.v1')
      add('env', 'nguồn giả chỉ ở container cài');
    if (findCredentialLike(val) || cfg.forbiddenValues.some((f) => f.length > 0 && val.includes(f))) {
      add('env', `giá trị ${n.slice(0, 40)} giống credential / khoá nội bộ`);
    }
  }

  const host = isObj(body.HostConfig) ? body.HostConfig : null;
  if (!host) {
    add('unknown_field', 'thiếu HostConfig');
    return out;
  }
  for (const [k, v] of Object.entries(host)) {
    if (HOST_KEYS.has(k)) continue;
    const specific = SPECIFIC_HOST_KEYS[k];
    if (specific) {
      if (!nonEmpty(v) || (k.endsWith('Mode') && (v === 'private' || v === ''))) continue;
      if (k === 'Binds' && Array.isArray(v) && v.some(mentionsDockerSocket)) add('docker_socket', 'Binds docker.sock');
      else add(specific, `HostConfig.${k}`);
    } else {
      add('unknown_field', `HostConfig.${k}`);
    }
  }
  if (host.Privileged !== false && host.Privileged !== undefined) add('privileged', 'Privileged');
  if (nonEmpty(host.CapAdd)) add('cap_add', 'CapAdd');
  if (JSON.stringify(host.CapDrop) !== '["ALL"]') add('cap_drop', 'CapDrop phải là ["ALL"]');
  if (JSON.stringify(host.SecurityOpt) !== '["no-new-privileges:true"]') add('security_opt', 'SecurityOpt');
  if (host.ReadonlyRootfs !== true) add('readonly_rootfs', 'ReadonlyRootfs');
  const lim = (v: unknown, max: number) => typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= max;
  if (!lim(host.Memory, LIMITS.memory) || !lim(host.NanoCpus, LIMITS.nanoCpus) || !lim(host.PidsLimit, LIMITS.pids)) {
    add('resources', 'thiếu / vượt trần CPU, RAM, pids');
  }
  if (host.MemorySwap !== undefined && host.MemorySwap !== host.Memory) add('resources', 'MemorySwap ≠ Memory');

  // mạng: đúng mạng của mẫu (roles; volume-init không mạng)
  const wantNet = template === 'volume-init.v1' ? 'none' : cfg.rolesNetwork;
  if (host.NetworkMode !== wantNet) add('network_mode', `NetworkMode ${String(host.NetworkMode).slice(0, 40)}`);
  const nc = body.NetworkingConfig;
  if (nc !== undefined) {
    const eps = isObj(nc) && isObj(nc.EndpointsConfig) ? Object.keys(nc.EndpointsConfig) : null;
    const extraKeys = isObj(nc) ? Object.keys(nc).filter((k) => k !== 'EndpointsConfig') : ['?'];
    if (!eps || extraKeys.length > 0 || eps.some((n) => n !== wantNet) || wantNet === 'none') {
      add('network_mode', 'NetworkingConfig ngoài mạng của mẫu');
    }
  }

  // tmpfs
  if (host.Tmpfs !== undefined) {
    if (!isObj(host.Tmpfs)) add('tmpfs_mount', 'Tmpfs sai dạng');
    else
      for (const [t, opt] of Object.entries(host.Tmpfs))
        if (TMPFS[t] !== opt) add('tmpfs_mount', `tmpfs ${t.slice(0, 40)}`);
  }

  // mount
  const mounts = Array.isArray(host.Mounts) ? host.Mounts : host.Mounts === undefined ? [] : null;
  if (mounts === null) add('mount_type', 'Mounts sai dạng');
  for (const m of mounts ?? []) {
    if (!isObj(m)) {
      add('mount_type', 'mount sai dạng');
      continue;
    }
    const mk = Object.keys(m).filter((k) => !['Type', 'Source', 'Target', 'ReadOnly'].includes(k));
    if (m.Type === 'bind') {
      add(
        mentionsDockerSocket(m.Source) || mentionsDockerSocket(m.Target) ? 'docker_socket' : 'bind_mount',
        'mount bind',
      );
      continue;
    }
    if (m.Type === 'tmpfs') {
      add('tmpfs_mount', 'mount tmpfs qua Mounts (chỉ qua HostConfig.Tmpfs)');
      continue;
    }
    if (m.Type !== 'volume') {
      add('mount_type', `mount ${String(m.Type).slice(0, 20)}`);
      continue;
    }
    if (mk.length > 0) add('volume_mount', `tuỳ chọn volume ${mk.join(',').slice(0, 40)}`);
    const src = String(m.Source);
    const dst = String(m.Target);
    const ro = m.ReadOnly === true;
    const authMatch = /^ga-auth-en-([0-9]{4,12})$/.exec(src);
    let ok = false;
    if (template === 'role.v1' || template === 'sys.v1') {
      ok =
        (authMatch !== null && dst === `${MOUNTS.authRoot}/EN-${authMatch[1]}` && !ro) ||
        (src === cfg.enginesVolume && dst === MOUNTS.engines && ro);
    } else if (template === 'engine-install.v1') {
      ok = src === cfg.enginesVolume && dst === MOUNTS.engines && !ro;
    } else if (template === 'volume-init.v1') {
      ok = (authMatch !== null && dst === SEED_DIRS.auth) || (src === cfg.enginesVolume && dst === SEED_DIRS.engines);
    }
    if (!ok) add('volume_mount', `volume ${src.slice(0, 40)} → ${dst.slice(0, 40)}`);
  }
  return out;
}

export interface ExecSpec {
  Cmd: string[];
  Env: string[];
  User: string;
  Tty: boolean;
  Privileged: boolean;
  AttachStdin: boolean;
  AttachStdout: boolean;
  AttachStderr: boolean;
  WorkingDir: string;
}

/** Đường tuyệt đối của chương trình trong image runtime (không để PATH quyết định). */
export const PROGRAM_PATHS: Readonly<Record<string, string>> = {
  'ga-runner': '/usr/local/bin/ga-runner',
  'ga-engine-install': '/usr/local/bin/ga-engine-install',
};

/** Env được phép theo lệnh (contracts execEnv / loginExecEnv) — mọi biến khác ⇒ exec_env. */
const EXEC_ENV: Readonly<Record<string, readonly string[]>> = {
  'ga-runner turn': ['GA_TURN_ID', 'GA_GATEWAY_URL'],
  'ga-runner login-check': ['GA_PROBE_ID'],
  'ga-runner probe': ['GA_PROBE_ID'],
  'ga-runner login': ['GA_ENGINE_SLUG', 'GA_ENGINE_ACCOUNT', 'GA_AUTH_METHOD'],
  'ga-runner auth-gc': [],
  'ga-engine-install install': [],
  'ga-engine-install status': [],
};

/** Dựng argv tuyệt đối từ dòng EXEC_ARGV (đúng 2 phần tử). */
export function absoluteArgv(argv: readonly [string, string] | readonly string[]): string[] {
  const [p, c] = argv;
  return [PROGRAM_PATHS[p ?? ''] ?? String(p), String(c)];
}

export function checkExec(spec: ExecSpec): { rule: ExecRule; detail: string }[] {
  const out: { rule: ExecRule; detail: string }[] = [];
  const keys = Object.keys(spec).filter(
    (k) =>
      ![
        'Cmd',
        'Env',
        'User',
        'Tty',
        'Privileged',
        'AttachStdin',
        'AttachStdout',
        'AttachStderr',
        'WorkingDir',
      ].includes(k),
  );
  if (keys.length > 0) out.push({ rule: 'exec_field', detail: keys.join(',') });
  const cmd = Array.isArray(spec.Cmd) ? spec.Cmd : [];
  const program = Object.entries(PROGRAM_PATHS).find(([, abs]) => abs === cmd[0])?.[0];
  const logical = program ? [program, cmd[1] ?? ''] : [];
  const programOk = cmd.length === 2 && program !== undefined && isAllowedExecArgv(logical);
  if (!programOk) out.push({ rule: 'exec_program', detail: 'chương trình / lệnh ngoài EXEC_ARGV' });
  if (spec.Privileged !== false) out.push({ rule: 'exec_privileged', detail: 'Privileged' });
  if (spec.User !== RUNTIME_USER) out.push({ rule: 'exec_user', detail: 'User' });
  // env / TTY phụ thuộc lệnh: lệnh đã sai thì chỉ báo exec_program (đã đủ để chặn)
  if (!programOk) return out;
  const allowedEnv = EXEC_ENV[logical.join(' ')] ?? [];
  for (const e of spec.Env ?? []) {
    const n = String(e).split('=')[0] ?? '';
    if (!allowedEnv.includes(n)) out.push({ rule: 'exec_env', detail: `biến ${n.slice(0, 40)}` });
  }
  const isLogin = logical[0] === EXEC_ARGV.login[0] && logical[1] === EXEC_ARGV.login[1];
  if (spec.Tty !== isLogin) out.push({ rule: 'exec_tty', detail: 'Tty chỉ cho ga-runner login' });
  return out;
}
