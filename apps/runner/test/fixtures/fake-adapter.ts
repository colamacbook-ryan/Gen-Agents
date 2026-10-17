import type { EnginePlan, ProbePlanInput, TurnPlanInput } from '@ga/contracts';
import type { RunnerAdapter } from '../../src/adapters.ts';

// Adapter giả cho unit test của ga-runner (slug `fake`, binary /opt/engines/fake/current/fake-cli). Không mang tên CLI thật.

export const BIN = '/opt/engines/fake/current/fake-cli';

const cli = (argv: string[], over: Partial<Extract<EnginePlan, { kind: 'cli' }>> = {}): EnginePlan => ({
  kind: 'cli',
  files: [],
  argv,
  env: {},
  timeoutMs: 10_000,
  ...over,
});

export function fakeAdapter(over: Partial<RunnerAdapter> = {}): RunnerAdapter {
  const base: RunnerAdapter = {
    slug: 'fake',
    adapterVersion: '0.0.1',
    testedVersions: ['1.0.0'],
    authAllowlist: ['cred.json'],
    nativeStatePaths: ['.native'],
    nativeMemoryPolicy: 'tmpfs-per-turn',
    installSpec: {
      source: 'official',
      origin: 'https://vendor.invalid/m',
      checksum: { algorithm: 'sha512', from: 'manifest' },
      selfUpdate: 'unknown',
      egressDomains: ['vendor.invalid'],
      platforms: [{ arch: 'x64', libc: 'glibc', key: 'linux-x64' }],
    },
    flagTable: {
      subcommands: ['turn', 'print', 'raw', 'sleep', 'exit'],
      flags: { '--model': 'value' },
      env: ['NO_COLOR'],
    },
    loginArgv: () => [BIN, 'print', 'login'],
    loginCheck: (_i: ProbePlanInput) => ({
      plan: cli([BIN, 'print', 'logged-in']),
      parse: () => ({ status: 'logged_in', accountHint: null, detail: null }),
    }),
    capabilityScan: () => [cli([BIN, 'print', 'v1']), cli([BIN, 'print', 'help'])],
    parseCapabilities: () => [],
    parseStreamLine: () => [],
    classify: () => ({ outcome: 'ok', resetAt: null, detail: null }),
    turnPlan: (i: TurnPlanInput) =>
      cli([BIN, 'turn', ...(i.model ? ['--model', i.model] : [])], {
        files: [{ path: 'home/.native/settings.json', content: '{"memory":false}', mode: 0o600 }],
        env: { NO_COLOR: '1' },
        timeoutMs: 30_000,
      }),
  };
  return { ...base, ...over };
}
