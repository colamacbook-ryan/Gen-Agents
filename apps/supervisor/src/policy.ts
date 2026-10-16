import { CONTAINER_KINDS, EXEC_ARGV, findCredentialLike, isAllowedExecArgv } from '@ga/contracts';
import {
  ALL_TEMPLATES,
  CONTAINER_LANG,
  IDLE_CMD,
  LABELS,
  LIMITS,
  LOG_CONFIG,
  MANAGED_BY,
  MOUNTS,
  RESTART_POLICY,
  RUNTIME_USER,
  SEED_DIRS,
  type TemplateEnv,
  TMPFS,
  WORKING_DIR,
} from './templates.ts';

// CHỐT CHẶN cuối trước Docker API (TCB; BUILD-PLAN §B.3, §C.6 "mỗi luật một ca, chỉ chính luật đó chặn"). Áp lên CHÍNH body
// gửi Docker (không phải lên yêu cầu của ga-app) ⇒ kể cả mẫu có lỗi cũng không lọt.
// MẶC ĐỊNH TỪ CHỐI (STD-11, security review MEDIUM authorization-policy-bypass): MỌI khoá trong body phải KHỚP CHÍNH XÁC mẫu
// (hằng số của templates.ts / cấu hình) hoặc thuộc allowlist có giá trị cụ thể — không khoá nào được "bỏ qua". Khoá HostConfig
// mà mẫu không dùng ⇒ vi phạm khi CÓ MẶT (kể cả giá trị rỗng). Mỗi vi phạm một mã luật ổn định — test âm kiểm đúng một mã.

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
  'working_dir',
  'init',
  'restart_policy',
  'log_config',
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

export type PolicyConfig = Pick<
  TemplateEnv,
  'runtimeImage' | 'rolesNetwork' | 'enginesVolume' | 'egressProxyUrl' | 'noProxy' | 'fakeEngineSourceUrl'
> & {
  /** Giá trị không bao giờ được xuất hiện trong env container (khoá của chính supervisor, dạng hex / base64). */
  forbiddenValues: readonly string[];
};

const IO_KEYS = ['AttachStdin', 'AttachStdout', 'AttachStderr', 'Tty', 'OpenStdin'] as const;
const TOP_KEYS = new Set([
  'Image',
  'Cmd',
  'User',
  'WorkingDir',
  'Env',
  'Labels',
  'HostConfig',
  'NetworkingConfig',
  ...IO_KEYS,
]);
/** Khoá HostConfig mẫu dùng — MỖI khoá có kiểm giá trị riêng bên dưới (bắt buộc có mặt, khớp mẫu). */
const HOST_KEYS = new Set([
  'NetworkMode',
  'Mounts',
  'Tmpfs',
  'CapDrop',
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
/** Khoá HostConfig mẫu KHÔNG dùng nhưng có mã luật riêng (cho ca âm rõ nghĩa). Có mặt ⇒ vi phạm, bất kể giá trị. */
const SPECIFIC_HOST_KEYS: Record<string, CreateRule> = {
  CapAdd: 'cap_add',
  Binds: 'bind_mount',
  VolumesFrom: 'volume_mount',
  VolumeDriver: 'volume_mount',
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
  Links: 'network_mode',
  ExtraHosts: 'network_mode',
  Dns: 'network_mode',
  DnsOptions: 'network_mode',
  DnsSearch: 'network_mode',
  MaskedPaths: 'security_opt',
  ReadonlyPaths: 'security_opt',
  Sysctls: 'security_opt',
  GroupAdd: 'user',
};
const LABEL_KEYS = new Set<string>(Object.values(LABELS));
const LABEL_VALUE_RE: Readonly<Record<string, RegExp>> = {
  [LABELS.consumer]: /^[A-Za-z0-9._-]{1,128}$/,
  [LABELS.specHash]: /^[0-9a-f]{32}$/,
  [LABELS.accounts]: /^(?:EN-[0-9]{4,12}(?:,EN-[0-9]{4,12}){0,15})?$/,
};

type V = { rule: CreateRule; detail: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** So sánh cấu trúc JSON chặt (cùng tập khoá, cùng kiểu, cùng giá trị; không phụ thuộc thứ tự khoá). */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameJson(x, b[i]));
  }
  if (!isObj(a) || !isObj(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && sameJson(a[k], b[k]));
}

function mentionsDockerSocket(s: unknown): boolean {
  return (
    typeof s === 'string' &&
    (s.includes('docker.sock') || s.includes('/var/run/docker') || s.includes('containerd.sock'))
  );
}

/** Env container mà MẪU sinh ra (khẳng định độc lập với templates.ts, từ cấu hình) — so như tập, đúng giá trị. */
function expectedEnv(template: unknown, cfg: PolicyConfig): string[] {
  if (template === 'volume-init.v1') return [`LANG=${CONTAINER_LANG}`];
  const env = [
    `HTTPS_PROXY=${cfg.egressProxyUrl}`,
    `HTTP_PROXY=${cfg.egressProxyUrl}`,
    `NO_PROXY=${cfg.noProxy}`,
    `LANG=${CONTAINER_LANG}`,
  ];
  if (template === 'engine-install.v1' && cfg.fakeEngineSourceUrl) {
    env.push(`GA_FAKE_ENGINE_SOURCE_URL=${cfg.fakeEngineSourceUrl}`);
  }
  return env;
}

/** Kiểm body tạo container. Trả DANH SÁCH vi phạm (rỗng = cho phép). */
export function checkCreate(name: string, body: Record<string, unknown>, cfg: PolicyConfig): V[] {
  const out: V[] = [];
  const add = (rule: CreateRule, detail: string) => out.push({ rule, detail });

  for (const k of Object.keys(body)) {
    if (!TOP_KEYS.has(k)) add(k === 'ExposedPorts' ? 'ports' : 'unknown_field', `khoá ${k.slice(0, 40)}`);
  }
  for (const k of IO_KEYS) if (body[k] !== false) add('container_io', k);
  if (body.Image !== cfg.runtimeImage) add('image_not_allowed', 'ảnh ngoài allowlist digest');

  // nhãn: đúng tập khoá genagents.*, giá trị đúng dạng
  const labels = isObj(body.Labels) ? (body.Labels as Record<string, unknown>) : {};
  const kind = labels[LABELS.kind];
  const template = labels[LABELS.template];
  const badLabel = Object.entries(labels).some(
    ([k, v]) => !LABEL_KEYS.has(k) || typeof v !== 'string' || (LABEL_VALUE_RE[k] && !LABEL_VALUE_RE[k].test(v)),
  );
  if (
    !isObj(body.Labels) ||
    badLabel ||
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
  if (body.WorkingDir !== WORKING_DIR) add('working_dir', 'WorkingDir ngoài mẫu');

  const wantCmd = template === 'volume-init.v1' ? ['true'] : [...IDLE_CMD];
  if (!sameJson(body.Cmd, wantCmd)) add('cmd', 'Cmd ngoài mẫu');

  // env: ĐÚNG tập biến + giá trị mẫu sinh từ cấu hình (proxy trỏ nơi khác = vòng qua egress); cấm giá trị giống credential
  const env = Array.isArray(body.Env) ? body.Env.map(String) : null;
  if (env === null) add('env', 'Env thiếu / sai dạng');
  else {
    const want = expectedEnv(template, cfg).sort();
    const got = [...env].sort();
    if (!sameJson(got, want)) {
      const names = got.filter((e) => !want.includes(e)).map((e) => e.split('=')[0]?.slice(0, 40));
      add('env', `Env lệch mẫu (${names.join(',') || 'thiếu biến'})`);
    }
    for (const e of env) {
      const eq = e.indexOf('=');
      const val = eq > 0 ? e.slice(eq + 1) : '';
      if (findCredentialLike(val) || cfg.forbiddenValues.some((f) => f.length > 0 && val.includes(f))) {
        add('env', `giá trị ${e.slice(0, Math.max(0, Math.min(eq, 40)))} giống credential / khoá nội bộ`);
      }
    }
  }

  const host = isObj(body.HostConfig) ? body.HostConfig : null;
  if (!host) {
    add('unknown_field', 'thiếu HostConfig');
    return out;
  }
  for (const [k, v] of Object.entries(host)) {
    if (HOST_KEYS.has(k)) continue; // kiểm giá trị từng khoá bên dưới
    const specific = SPECIFIC_HOST_KEYS[k];
    if (k === 'Binds' && Array.isArray(v) && v.some(mentionsDockerSocket)) add('docker_socket', 'Binds docker.sock');
    else add(specific ?? 'unknown_field', `HostConfig.${k.slice(0, 40)} (mẫu không dùng)`);
  }
  if (host.Privileged !== false) add('privileged', 'Privileged phải là false');
  if (!sameJson(host.CapDrop, ['ALL'])) add('cap_drop', 'CapDrop phải là ["ALL"]');
  if (!sameJson(host.SecurityOpt, ['no-new-privileges:true'])) add('security_opt', 'SecurityOpt');
  if (host.ReadonlyRootfs !== true) add('readonly_rootfs', 'ReadonlyRootfs');
  if (host.Init !== true) add('init', 'Init phải là true (tini)');
  if (!sameJson(host.RestartPolicy, RESTART_POLICY)) add('restart_policy', 'RestartPolicy ngoài mẫu');
  if (!sameJson(host.LogConfig, LOG_CONFIG)) add('log_config', 'LogConfig ngoài mẫu (chỉ json-file cục bộ)');
  if (
    host.Memory !== LIMITS.memory ||
    host.MemorySwap !== LIMITS.memory ||
    host.NanoCpus !== LIMITS.nanoCpus ||
    host.PidsLimit !== LIMITS.pids
  ) {
    add('resources', 'CPU / RAM / swap / pids khác mẫu');
  }

  // mạng: đúng mạng của mẫu (roles; volume-init không mạng); endpoint KHÔNG mang tuỳ chọn (alias / IP tĩnh / MAC / link…
  // cho phép giả danh service khác trên mạng nội bộ)
  const wantNet = template === 'volume-init.v1' ? 'none' : cfg.rolesNetwork;
  if (host.NetworkMode !== wantNet) add('network_mode', `NetworkMode ${String(host.NetworkMode).slice(0, 40)}`);
  const wantNc = wantNet === 'none' ? undefined : { EndpointsConfig: { [wantNet]: {} } };
  if (!sameJson(body.NetworkingConfig, wantNc)) add('network_mode', 'NetworkingConfig ngoài mẫu (mạng / endpoint)');

  // tmpfs: đúng tập của mẫu
  const wantTmpfs = template === 'volume-init.v1' ? {} : TMPFS;
  if (!sameJson(host.Tmpfs, wantTmpfs)) add('tmpfs_mount', 'Tmpfs ngoài mẫu');

  // mount
  const mounts = Array.isArray(host.Mounts) ? host.Mounts : null;
  if (mounts === null) add('mount_type', 'Mounts thiếu / sai dạng');
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
    if (typeof m.ReadOnly !== 'boolean') add('volume_mount', 'ReadOnly phải là boolean');
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
  // hình dạng tập mount của mẫu: role / sys đúng MỘT mount ga-engines (≤ 16 /auth); cài / init đúng MỘT mount; không trùng đích
  if (mounts) {
    const objs = mounts.filter(isObj);
    const targets = objs.map((m) => String(m.Target));
    const engines = objs.filter((m) => m.Source === cfg.enginesVolume).length;
    const single = template === 'engine-install.v1' || template === 'volume-init.v1';
    if (
      new Set(targets).size !== targets.length ||
      mounts.length > 17 ||
      (single ? mounts.length !== 1 : engines !== 1)
    ) {
      add('volume_mount', 'tập mount lệch mẫu (thiếu / thừa / trùng đích)');
    }
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
