import { EXEC_ARGV } from '@ga/contracts';
import { describe, expect, it } from 'vitest';
import { absoluteArgv, checkCreate, checkExec, type ExecSpec, type PolicyConfig, sameJson } from '../src/policy.ts';
import { buildConsumerContainer, buildInstallerContainer, buildVolumeInitContainer } from '../src/templates.ts';
import { ENV, ROLE, SYS } from './helpers.ts';

// Policy = chốt chặn cuối trước Docker. MỖI LUẬT MỘT CA ÂM và chỉ chính luật đó chặn (BUILD-PLAN §C.6): mỗi ca lấy body hợp lệ
// từ mẫu rồi đổi đúng MỘT chỗ, kỳ vọng tập mã vi phạm = đúng một mã.

const SECRET = 'f'.repeat(64);
const CFG: PolicyConfig = {
  runtimeImage: ENV.runtimeImage,
  rolesNetwork: ENV.rolesNetwork,
  enginesVolume: ENV.enginesVolume,
  egressProxyUrl: ENV.egressProxyUrl,
  noProxy: ENV.noProxy,
  fakeEngineSourceUrl: 'http://fake-source:8080',
  forbiddenValues: [SECRET],
};

const rules = (name: string, body: Record<string, unknown>) => [
  ...new Set(checkCreate(name, body, CFG).map((v) => v.rule)),
];

function roleBody() {
  return buildConsumerContainer('role.v1', ROLE, ['ga-auth-en-0001', 'ga-auth-en-0002'], ENV);
}
function host(b: Record<string, unknown>) {
  return b.HostConfig as Record<string, unknown>;
}

describe('mẫu hợp lệ không vi phạm', () => {
  const noFake: PolicyConfig = { ...CFG, fakeEngineSourceUrl: null };
  it.each([
    ['role.v1', () => roleBody(), CFG],
    ['sys.v1', () => buildConsumerContainer('sys.v1', SYS, ['ga-auth-en-0003'], ENV), CFG],
    ['engine-install.v1', () => buildInstallerContainer('demo-cli', ENV), noFake],
    [
      'engine-install.v1 (nguồn fake)',
      () => buildInstallerContainer('demo', { ...ENV, fakeEngineSourceUrl: 'http://fake-source:8080' }),
      CFG,
    ],
    ['volume-init.v1 auth', () => buildVolumeInitContainer('ga-auth-en-0001', 'auth', ENV), CFG],
    ['volume-init.v1 engines', () => buildVolumeInitContainer('ga-engines', 'engines', ENV), CFG],
  ] as const)('%s', (_n, build, cfg) => {
    const b = build();
    expect(checkCreate(b.name, b.body, cfg)).toEqual([]);
  });
  it('cấu hình có nguồn fake mà container cài không mang (hoặc ngược lại) ⇒ env', () => {
    const b = buildInstallerContainer('demo-cli', ENV);
    expect(rules(b.name, b.body)).toEqual(['env']);
    const f = buildInstallerContainer('demo', { ...ENV, fakeEngineSourceUrl: 'http://fake-source:8080' });
    expect([...new Set(checkCreate(f.name, f.body, noFake).map((v) => v.rule))]).toEqual(['env']);
  });
});

type Mut = [string, (b: Record<string, unknown>) => void, string];
const MUTATIONS: Mut[] = [
  ['privileged', (b) => (host(b).Privileged = true), 'privileged'],
  ['cap_add', (b) => (host(b).CapAdd = ['SYS_ADMIN']), 'cap_add'],
  ['bỏ cap_drop ALL', (b) => (host(b).CapDrop = []), 'cap_drop'],
  [
    'mount docker.sock qua Binds',
    (b) => (host(b).Binds = ['/var/run/docker.sock:/var/run/docker.sock']),
    'docker_socket',
  ],
  [
    'mount docker.sock qua Mounts bind',
    (b) =>
      (host(b).Mounts as unknown[]).push({
        Type: 'bind',
        Source: '/var/run/docker.sock',
        Target: '/s',
        ReadOnly: true,
      }),
    'docker_socket',
  ],
  ['bind host path qua Binds', (b) => (host(b).Binds = ['/etc:/host-etc:ro']), 'bind_mount'],
  [
    'bind host path qua Mounts',
    (b) => (host(b).Mounts as unknown[]).push({ Type: 'bind', Source: '/', Target: '/host', ReadOnly: false }),
    'bind_mount',
  ],
  ['host network', (b) => (host(b).NetworkMode = 'host'), 'network_mode'],
  ['mạng container:ga-app', (b) => (host(b).NetworkMode = 'container:ga-app'), 'network_mode'],
  [
    'thêm mạng core qua NetworkingConfig',
    (b) => (b.NetworkingConfig = { EndpointsConfig: { [ENV.rolesNetwork]: {}, 'ga-rt_core': {} } }),
    'network_mode',
  ],
  ['ảnh lạ', (b) => (b.Image = 'busybox:1.37'), 'image_not_allowed'],
  ['ảnh theo tag (không digest)', (b) => (b.Image = 'ghcr.io/x/gen-agents-runtime:latest'), 'image_not_allowed'],
  ['PID host', (b) => (host(b).PidMode = 'host'), 'host_namespace'],
  ['IPC host', (b) => (host(b).IpcMode = 'host'), 'host_namespace'],
  ['userns host', (b) => (host(b).UsernsMode = 'host'), 'host_namespace'],
  [
    'thiết bị /dev',
    (b) => (host(b).Devices = [{ PathOnHost: '/dev/sda', PathInContainer: '/dev/sda', CgroupPermissions: 'rwm' }]),
    'devices',
  ],
  ['GPU', (b) => (host(b).DeviceRequests = [{ Count: -1, Capabilities: [['gpu']] }]), 'devices'],
  [
    'seccomp unconfined',
    (b) => (host(b).SecurityOpt = ['no-new-privileges:true', 'seccomp=unconfined']),
    'security_opt',
  ],
  ['bỏ no-new-privileges', (b) => (host(b).SecurityOpt = []), 'security_opt'],
  ['rootfs ghi được', (b) => (host(b).ReadonlyRootfs = false), 'readonly_rootfs'],
  ['chạy root', (b) => (b.User = '0:0'), 'user'],
  ['bỏ giới hạn RAM', (b) => (host(b).Memory = 0), 'resources'],
  ['vượt trần pids', (b) => (host(b).PidsLimit = 100_000), 'resources'],
  ['mở cổng', (b) => (host(b).PortBindings = { '22/tcp': [{ HostPort: '2222' }] }), 'ports'],
  ['ExposedPorts', (b) => (b.ExposedPorts = { '22/tcp': {} }), 'ports'],
  ['thiếu nhãn genagents.kind', (b) => delete (b.Labels as Record<string, string>)['genagents.kind'], 'labels'],
  ['nhãn managed-by lạ', (b) => ((b.Labels as Record<string, string>)['genagents.managed-by'] = 'x'), 'labels'],
  ['env khoá chủ', (b) => (b.Env as string[]).push('GENAGENTS_MASTER_KEY=abc'), 'env'],
  ['env biến lạ', (b) => (b.Env as string[]).push('LD_PRELOAD=/x.so'), 'env'],
  ['env mang khoá nội bộ của supervisor', (b) => ((b.Env as string[])[0] = `HTTPS_PROXY=http://x:1/${SECRET}`), 'env'],
  ['env mang chuỗi giống credential', (b) => ((b.Env as string[])[0] = `NO_PROXY=GA-CANARY-${'0'.repeat(8)}`), 'env'],
  ['env nguồn fake ngoài container cài', (b) => (b.Env as string[]).push('GA_FAKE_ENGINE_SOURCE_URL=http://x'), 'env'],
  ['Cmd lạ', (b) => (b.Cmd = ['sh', '-c', 'id']), 'cmd'],
  [
    'volume lạ',
    (b) =>
      (host(b).Mounts as unknown[]).push({
        Type: 'volume',
        Source: 'gen-agents_data',
        Target: '/data',
        ReadOnly: false,
      }),
    'volume_mount',
  ],
  [
    'ga-engines ghi được trong container Role',
    (b) =>
      ((host(b).Mounts as { ReadOnly: boolean }[])[2] = {
        ...(host(b).Mounts as object[])[2],
        ReadOnly: false,
      } as never),
    'volume_mount',
  ],
  [
    'volume /auth gắn sai thư mục (tài khoản khác)',
    (b) =>
      ((host(b).Mounts as { Target: string }[])[0] = {
        ...(host(b).Mounts as object[])[0],
        Target: '/auth/EN-0009',
      } as never),
    'volume_mount',
  ],
  ['VolumesFrom', (b) => (host(b).VolumesFrom = ['ga-app']), 'volume_mount'],
  ['tmpfs lạ', (b) => ((host(b).Tmpfs as Record<string, string>)['/etc'] = 'rw'), 'tmpfs_mount'],
  [
    'mount npipe',
    (b) => (host(b).Mounts as unknown[]).push({ Type: 'npipe', Source: 'x', Target: '/x' }),
    'mount_type',
  ],
  ['Sysctls', (b) => (host(b).Sysctls = { 'net.ipv4.ip_forward': '1' }), 'security_opt'],
  ['MaskedPaths rỗng (mở /proc)', (b) => (host(b).MaskedPaths = []), 'security_opt'],
  ['ExtraHosts (đổi DNS)', (b) => (host(b).ExtraHosts = ['api.vendor.invalid:1.2.3.4']), 'network_mode'],
  ['Dns riêng', (b) => (host(b).Dns = ['1.1.1.1']), 'network_mode'],
  ['HostConfig khoá lạ (Runtime)', (b) => (host(b).Runtime = 'runc'), 'unknown_field'],
  ['HostConfig khoá lạ (AutoRemove)', (b) => (host(b).AutoRemove = true), 'unknown_field'],
  ['PidMode rỗng vẫn bị từ chối (khoá mẫu không dùng)', (b) => (host(b).PidMode = ''), 'host_namespace'],
  ['CapAdd rỗng vẫn bị từ chối', (b) => (host(b).CapAdd = []), 'cap_add'],
  ['GroupAdd', (b) => (host(b).GroupAdd = ['docker']), 'user'],
  // (a) endpoint mạng: chỉ `{}` — alias / IP tĩnh / MAC / link cho phép giả danh service khác (vd alias = ga-app)
  ...(
    [
      ['Aliases trùng gateway', { Aliases: ['ga-app'] }],
      ['IPAMConfig IP tĩnh', { IPAMConfig: { IPv4Address: '172.30.0.2' } }],
      ['IPAddress', { IPAddress: '172.30.0.2' }],
      ['MacAddress', { MacAddress: '02:42:ac:11:00:02' }],
      ['Links', { Links: ['ga-app:ga-app'] }],
      ['DriverOpts', { DriverOpts: { 'com.docker.network.endpoint.sysctls': 'x' } }],
      ['DNSNames', { DNSNames: ['ga-app'] }],
    ] as const
  ).map(
    ([n, ep]): Mut => [
      `endpoint ${n}`,
      (b) => (b.NetworkingConfig = { EndpointsConfig: { [ENV.rolesNetwork]: { ...ep } } }),
      'network_mode',
    ],
  ),
  ['bỏ NetworkingConfig', (b) => delete b.NetworkingConfig, 'network_mode'],
  // (b) RestartPolicy / LogConfig KHỚP CHÍNH XÁC mẫu
  ['RestartPolicy always', (b) => (host(b).RestartPolicy = { Name: 'always' }), 'restart_policy'],
  [
    'RestartPolicy on-failure',
    (b) => (host(b).RestartPolicy = { Name: 'on-failure', MaximumRetryCount: 3 }),
    'restart_policy',
  ],
  ['bỏ RestartPolicy', (b) => delete host(b).RestartPolicy, 'restart_policy'],
  ...(
    [
      ['syslog ra host ngoài', { Type: 'syslog', Config: { 'syslog-address': 'tcp://203.0.113.9:514' } }],
      ['gelf', { Type: 'gelf', Config: { 'gelf-address': 'udp://203.0.113.9:12201' } }],
      ['fluentd', { Type: 'fluentd', Config: { 'fluentd-address': '203.0.113.9:24224' } }],
      ['json-file max-size khác', { Type: 'json-file', Config: { 'max-size': '10g', 'max-file': '1' } }],
      ['json-file thêm tuỳ chọn', { Type: 'json-file', Config: { 'max-size': '1m', 'max-file': '1', tag: 'x' } }],
      ['json-file thiếu Config', { Type: 'json-file' }],
    ] as const
  ).map(([n, lc]): Mut => [`LogConfig ${n}`, (b) => (host(b).LogConfig = structuredClone(lc)), 'log_config']),
  ['bỏ LogConfig (driver mặc định của host)', (b) => delete host(b).LogConfig, 'log_config'],
  ['Init false', (b) => (host(b).Init = false), 'init'],
  ['WorkingDir khác', (b) => (b.WorkingDir = '/'), 'working_dir'],
  ['swap không giới hạn', (b) => (host(b).MemorySwap = -1), 'resources'],
  ['RAM nhỏ hơn mẫu', (b) => (host(b).Memory = 1024 ** 3), 'resources'],
  [
    'nhãn ngoài genagents.*',
    (b) => ((b.Labels as Record<string, string>)['com.docker.compose.project'] = 'x'),
    'labels',
  ],
  ['proxy trỏ nơi khác (vòng egress)', (b) => ((b.Env as string[])[0] = 'HTTPS_PROXY=http://ga-app:7401'), 'env'],
  ['NO_PROXY = *', (b) => ((b.Env as string[])[2] = 'NO_PROXY=*'), 'env'],
  ['env trùng biến', (b) => (b.Env as string[]).push((b.Env as string[])[0] as string), 'env'],
  ['bỏ biến proxy', (b) => (b.Env as string[]).splice(0, 1), 'env'],
  ['bỏ Mounts', (b) => delete host(b).Mounts, 'mount_type'],
  ['thiếu mount ga-engines', (b) => (host(b).Mounts as unknown[]).pop(), 'volume_mount'],
  ['bỏ AttachStdin (phải là false)', (b) => delete b.AttachStdin, 'container_io'],
  ['Entrypoint', (b) => (b.Entrypoint = ['/bin/sh']), 'unknown_field'],
  ['Tty / stdin mở', (b) => (b.OpenStdin = true), 'container_io'],
];

describe('mỗi luật một ca âm — chỉ chính luật đó chặn', () => {
  it.each(MUTATIONS)('%s', (_n, mutate, rule) => {
    const b = roleBody();
    const body = structuredClone(b.body);
    mutate(body);
    expect(rules(b.name, body)).toEqual([rule]);
  });
  it('tên không khớp loại (role body, tên ga-sys-…) ⇒ labels', () => {
    const b = roleBody();
    expect(rules('ga-sys-AB12', b.body)).toEqual(['labels']);
  });
  it('mỗi luật trong danh sách có ít nhất một ca âm', async () => {
    const { CREATE_RULES } = await import('../src/policy.ts');
    const covered = new Set([...MUTATIONS.map((m) => m[2]), 'labels']);
    expect(CREATE_RULES.filter((r) => !covered.has(r))).toEqual([]);
  });
});

// ---------------------------------------------------------------- test meta: mặc định từ chối, không khoá nào bị bỏ qua
// Danh sách khoá của Docker Engine API (v1.47+): ContainerConfig + HostConfig (gồm Resources). Khoá mới của Docker mà policy
// chưa biết vẫn bị từ chối (unknown_field) — danh sách này chỉ để chứng minh từng khoá đã biết.
const DOCKER_TOP_KEYS = [
  'Hostname',
  'Domainname',
  'User',
  'AttachStdin',
  'AttachStdout',
  'AttachStderr',
  'ExposedPorts',
  'Tty',
  'OpenStdin',
  'StdinOnce',
  'Env',
  'Cmd',
  'Healthcheck',
  'ArgsEscaped',
  'Image',
  'Volumes',
  'WorkingDir',
  'Entrypoint',
  'NetworkDisabled',
  'MacAddress',
  'OnBuild',
  'Labels',
  'StopSignal',
  'StopTimeout',
  'Shell',
  'HostConfig',
  'NetworkingConfig',
];
const DOCKER_HOST_KEYS = [
  // Resources
  'CpuShares',
  'Memory',
  'CgroupParent',
  'BlkioWeight',
  'BlkioWeightDevice',
  'BlkioDeviceReadBps',
  'BlkioDeviceWriteBps',
  'BlkioDeviceReadIOps',
  'BlkioDeviceWriteIOps',
  'CpuPeriod',
  'CpuQuota',
  'CpuRealtimePeriod',
  'CpuRealtimeRuntime',
  'CpusetCpus',
  'CpusetMems',
  'Devices',
  'DeviceCgroupRules',
  'DeviceRequests',
  'KernelMemoryTCP',
  'MemoryReservation',
  'MemorySwap',
  'MemorySwappiness',
  'NanoCpus',
  'OomKillDisable',
  'Init',
  'PidsLimit',
  'Ulimits',
  'CpuCount',
  'CpuPercent',
  'IOMaximumIOps',
  'IOMaximumBandwidth',
  // HostConfig
  'Binds',
  'ContainerIDFile',
  'LogConfig',
  'NetworkMode',
  'PortBindings',
  'RestartPolicy',
  'AutoRemove',
  'VolumeDriver',
  'VolumesFrom',
  'Mounts',
  'ConsoleSize',
  'Annotations',
  'CapAdd',
  'CapDrop',
  'CgroupnsMode',
  'Dns',
  'DnsOptions',
  'DnsSearch',
  'ExtraHosts',
  'GroupAdd',
  'IpcMode',
  'Cgroup',
  'Links',
  'OomScoreAdj',
  'PidMode',
  'Privileged',
  'PublishAllPorts',
  'ReadonlyRootfs',
  'SecurityOpt',
  'StorageOpt',
  'Tmpfs',
  'UTSMode',
  'UsernsMode',
  'ShmSize',
  'Sysctls',
  'Runtime',
  'Isolation',
  'MaskedPaths',
  'ReadonlyPaths',
];
const CANDIDATES: unknown[] = [null, 0, 1, -1, '', 'x', true, false, [], ['x'], {}, { x: 1 }];
const META_BODIES: [string, () => { name: string; body: Record<string, unknown> }][] = [
  ['role.v1', () => roleBody()],
  ['sys.v1', () => buildConsumerContainer('sys.v1', SYS, ['ga-auth-en-0003'], ENV)],
  [
    'engine-install.v1',
    () => buildInstallerContainer('demo', { ...ENV, fakeEngineSourceUrl: 'http://fake-source:8080' }),
  ],
  ['volume-init.v1', () => buildVolumeInitContainer('ga-auth-en-0001', 'auth', ENV)],
];

describe('meta — mọi khoá phải KHỚP mẫu; khoá mẫu không dùng ⇒ từ chối', () => {
  it.each(META_BODIES)(
    '%s: mọi khoá HostConfig của Docker — thêm (mẫu không dùng) / đổi / xoá (mẫu dùng) ⇒ vi phạm',
    (_t, build) => {
      const b = build();
      const tpl = host(b.body);
      const misses: string[] = [];
      for (const k of DOCKER_HOST_KEYS) {
        const inTemplate = Object.hasOwn(tpl, k);
        const variants = CANDIDATES.filter((v) => !inTemplate || !sameJson(v, tpl[k]));
        for (const v of variants) {
          const body = structuredClone(b.body);
          host(body)[k] = structuredClone(v);
          if (checkCreate(b.name, body, CFG).length === 0) misses.push(`${k}=${JSON.stringify(v)}`);
        }
        if (inTemplate) {
          const body = structuredClone(b.body);
          delete host(body)[k];
          if (checkCreate(b.name, body, CFG).length === 0) misses.push(`xoá ${k}`);
        }
      }
      expect(misses).toEqual([]);
    },
  );
  it.each(META_BODIES)('%s: mọi khoá cấp trên của Docker — thêm / đổi / xoá ⇒ vi phạm', (_t, build) => {
    const b = build();
    const misses: string[] = [];
    for (const k of DOCKER_TOP_KEYS) {
      const inTemplate = Object.hasOwn(b.body, k);
      for (const v of CANDIDATES.filter((c) => !inTemplate || !sameJson(c, b.body[k]))) {
        const body = structuredClone(b.body);
        body[k] = structuredClone(v);
        if (checkCreate(b.name, body, CFG).length === 0) misses.push(`${k}=${JSON.stringify(v)}`);
      }
      if (inTemplate) {
        const body = structuredClone(b.body);
        delete body[k];
        if (checkCreate(b.name, body, CFG).length === 0) misses.push(`xoá ${k}`);
      }
    }
    expect(misses).toEqual([]);
  });
  it.each([
    ['HostConfig.privileged', (b: Record<string, unknown>) => (host(b).privileged = true)],
    ['HostConfig.logconfig', (b: Record<string, unknown>) => (host(b).logconfig = { Type: 'syslog' })],
    ['HostConfig.networkmode', (b: Record<string, unknown>) => (host(b).networkmode = 'host')],
    ['hostconfig cấp trên', (b: Record<string, unknown>) => (b.hostconfig = { Privileged: true })],
  ])(
    'Docker (Go encoding/json) so tên khoá KHÔNG phân biệt hoa thường ⇒ biến thể chữ thường %s bị từ chối',
    (_n, mutate) => {
      const b = roleBody();
      const body = structuredClone(b.body);
      mutate(body);
      expect(rules(b.name, body)).toEqual(['unknown_field']);
    },
  );
  it('endpoint `aliases` viết thường ⇒ network_mode', () => {
    const b = roleBody();
    const body = structuredClone(b.body);
    body.NetworkingConfig = { EndpointsConfig: { [ENV.rolesNetwork]: { aliases: ['ga-app'] } } };
    expect(rules(b.name, body)).toEqual(['network_mode']);
  });
  it('volume-init.v1 (không mạng) thêm NetworkingConfig ⇒ network_mode', () => {
    const b = buildVolumeInitContainer('ga-engines', 'engines', ENV);
    const body = structuredClone(b.body);
    body.NetworkingConfig = { EndpointsConfig: { [ENV.rolesNetwork]: {} } };
    expect(rules(b.name, body)).toEqual(['network_mode']);
  });
  it('sameJson: chặt về kiểu / tập khoá, không phụ thuộc thứ tự khoá', () => {
    expect(sameJson({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(sameJson({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(sameJson([1], { 0: 1 })).toBe(false);
    expect(sameJson('1', 1)).toBe(false);
  });
});

function spec(over: Partial<ExecSpec> = {}): ExecSpec {
  return {
    Cmd: absoluteArgv(EXEC_ARGV.turn),
    Env: ['GA_TURN_ID=01JABCDEFGHJKMNPQRSTVWXYZ0', 'GA_GATEWAY_URL=http://ga-app:7410'],
    User: '10001:10001',
    Tty: false,
    Privileged: false,
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: '/',
    ...over,
  };
}

describe('exec — chỉ ga-runner <lệnh> / ga-engine-install <lệnh> theo EXEC_ARGV, đường tuyệt đối', () => {
  it.each(Object.entries(EXEC_ARGV))('dòng %s hợp lệ', (cmd, argv) => {
    const env =
      cmd === 'turn'
        ? spec().Env
        : cmd === 'login-check' || cmd === 'probe'
          ? ['GA_PROBE_ID=01JABCDEFGHJKMNPQRSTVWXYZ0']
          : cmd === 'login'
            ? ['GA_ENGINE_SLUG=x', 'GA_ENGINE_ACCOUNT=EN-0001', 'GA_AUTH_METHOD=subscription']
            : [];
    expect(checkExec(spec({ Cmd: absoluteArgv(argv), Env: env, Tty: cmd === 'login' }))).toEqual([]);
  });
  it.each([
    ['shell', { Cmd: ['/bin/sh', '-c', 'id'] }, 'exec_program'],
    ['ga-runner theo PATH (không tuyệt đối)', { Cmd: ['ga-runner', 'turn'] }, 'exec_program'],
    ['lệnh con ngoài EXEC_ARGV', { Cmd: ['/usr/local/bin/ga-runner', 'pty-kill'] }, 'exec_program'],
    ['thêm đối số', { Cmd: ['/usr/local/bin/ga-runner', 'turn', '--x'] }, 'exec_program'],
    ['CLI của hãng trực tiếp', { Cmd: ['/opt/engines/x/current/cli', 'auth', 'status'] }, 'exec_program'],
    ['privileged', { Privileged: true }, 'exec_privileged'],
    ['root', { User: 'root' }, 'exec_user'],
    ['env lạ cho turn', { Env: ['GA_TURN_ID=x', 'LD_PRELOAD=/x.so'] }, 'exec_env'],
    ['vé lượt trong env', { Env: ['GA_TURN_ID=x', 'GA_TURN_TICKET=abc'] }, 'exec_env'],
    ['TTY cho turn', { Tty: true }, 'exec_tty'],
  ] as const)('từ chối: %s', (_n, over, rule) => {
    expect([...new Set(checkExec(spec(over as Partial<ExecSpec>)).map((v) => v.rule))]).toEqual([rule]);
  });
  it('khoá lạ trong spec ⇒ exec_field', () => {
    expect(checkExec({ ...spec(), DetachKeys: 'x' } as ExecSpec).map((v) => v.rule)).toEqual(['exec_field']);
  });
});
