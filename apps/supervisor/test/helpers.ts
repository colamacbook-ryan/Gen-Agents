import { randomBytes } from 'node:crypto';
import type { Clock } from '@ga/contracts';
import { silentLogger } from '../src/log.ts';
import { PtyRelay } from '../src/pty.ts';
import { Broker } from '../src/runtime.ts';
import { SupervisorService } from '../src/service.ts';
import type { TemplateEnv } from '../src/templates.ts';
import { FakeRuntime } from './fake-runtime.ts';

export const IMAGE = `sha256:${'a'.repeat(64)}`;
export const ENV: TemplateEnv = {
  runtimeImage: IMAGE,
  rolesNetwork: 'ga-rt_roles',
  enginesVolume: 'ga-engines',
  egressProxyUrl: 'http://ga-egress:3128',
  noProxy: 'ga-app',
  fakeEngineSourceUrl: null,
};
export const WS_ID = '01JABCDEFGHJKMNPQRSTVWXYZ0';
export const ROLE_ID = '01JABCDEFGHJKMNPQRSTVWXYZ1';
export const SYS = { kind: 'sys', workspaceId: WS_ID, workspaceCode: 'AB12' } as const;
export const ROLE = { kind: 'role', roleId: ROLE_ID, roleDisplayId: 'RL-0001' } as const;

export class FakeClock implements Clock {
  t: number;
  constructor(iso = '2026-10-16T10:00:00.000Z') {
    this.t = Date.parse(iso);
  }
  now() {
    return new Date(this.t);
  }
  advance(ms: number) {
    this.t += ms;
  }
}

export function setup(over: Partial<TemplateEnv> = {}, maxDurationSeconds = 600) {
  const rt = new FakeRuntime();
  const supervisorKey = randomBytes(32);
  const termKey = randomBytes(32);
  const clock = new FakeClock();
  const env = { ...ENV, ...over };
  const broker = new Broker(
    rt,
    {
      runtimeImage: env.runtimeImage,
      rolesNetwork: env.rolesNetwork,
      enginesVolume: env.enginesVolume,
      egressProxyUrl: env.egressProxyUrl,
      noProxy: env.noProxy,
      fakeEngineSourceUrl: env.fakeEngineSourceUrl,
      forbiddenValues: [supervisorKey.toString('hex'), termKey.toString('hex')],
    },
    silentLogger,
  );
  const svc = new SupervisorService(
    broker,
    { ...env, gatewayUrl: 'http://ga-app:7410', version: 'test' },
    silentLogger,
    clock,
  );
  const pty = new PtyRelay(svc, { termKey, allowedOrigins: [], maxDurationSeconds, clock, log: silentLogger });
  return { rt, broker, svc, pty, supervisorKey, termKey, clock, env };
}
