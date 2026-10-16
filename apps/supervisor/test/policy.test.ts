import { EXEC_ARGV } from '@ga/contracts';
import { describe, expect, it } from 'vitest';
import { absoluteArgv, checkCreate, checkExec, type ExecSpec, type PolicyConfig } from '../src/policy.ts';
import { buildConsumerContainer, buildInstallerContainer, buildVolumeInitContainer } from '../src/templates.ts';
import { ENV, ROLE, SYS } from './helpers.ts';

// Policy = chốt chặn cuối trước Docker. MỖI LUẬT MỘT CA ÂM và chỉ chính luật đó chặn (BUILD-PLAN §C.6): mỗi ca lấy body hợp lệ
// từ mẫu rồi đổi đúng MỘT chỗ, kỳ vọng tập mã vi phạm = đúng một mã.

const SECRET = 'f'.repeat(64);
const CFG: PolicyConfig = {
  runtimeImage: ENV.runtimeImage,
  rolesNetwork: ENV.rolesNetwork,
  enginesVolume: ENV.enginesVolume,
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
  it.each([
    ['role.v1', () => roleBody()],
    ['sys.v1', () => buildConsumerContainer('sys.v1', SYS, ['ga-auth-en-0003'], ENV)],
    ['engine-install.v1', () => buildInstallerContainer('demo-cli', ENV)],
    [
      'engine-install.v1 (nguồn fake)',
      () => buildInstallerContainer('demo', { ...ENV, fakeEngineSourceUrl: 'http://fake-source:8080' }),
    ],
    ['volume-init.v1 auth', () => buildVolumeInitContainer('ga-auth-en-0001', 'auth', ENV)],
    ['volume-init.v1 engines', () => buildVolumeInitContainer('ga-engines', 'engines', ENV)],
  ])('%s', (_n, build) => {
    const b = build();
    expect(checkCreate(b.name, b.body, CFG)).toEqual([]);
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
  ['HostConfig khoá lạ (Sysctls)', (b) => (host(b).Sysctls = { 'net.ipv4.ip_forward': '1' }), 'unknown_field'],
  ['ExtraHosts (đổi DNS)', (b) => (host(b).ExtraHosts = ['api.vendor.invalid:1.2.3.4']), 'unknown_field'],
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
