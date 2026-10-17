import { describe, expect, it } from 'vitest';
import { SupervisorError } from '../src/errors.ts';
import { buildConsumerContainer, containerNameOf, LABELS } from '../src/templates.ts';
import { ENV, ROLE, SYS, setup } from './helpers.ts';

// Broker: cổng duy nhất tới Docker. Chỉ container do supervisor quản; mọi create / exec qua policy.

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof SupervisorError ? `${e.code}${e.rules.length ? `:${e.rules.join(',')}` : ''}` : 'other';
  }
}

describe('resolveManaged — từ chối container ngoài sự quản lý (ga-app, ga-updater, container lạ trùng tên)', () => {
  it.each([
    ['ga-app (tên ngoài mẫu)', 'ga-app', {}],
    ['ga-updater', 'ga-updater', {}],
    ['container lạ đặt tên ga-sys-…, không nhãn', 'ga-sys-ZZZZ', {}],
    [
      'nhãn kind đúng nhưng managed-by lạ',
      'ga-sys-YYYY',
      { [LABELS.kind]: 'sys', [LABELS.managedBy]: 'evil', [LABELS.template]: 'sys.v1' },
    ],
    ['mẫu lạ', 'ga-sys-XXXX', { [LABELS.kind]: 'sys', [LABELS.managedBy]: 'ga-supervisor', [LABELS.template]: 'sys' }],
  ])('%s ⇒ not_managed', async (_n, name, labels) => {
    const { rt, broker } = setup();
    rt.addForeign(name, labels);
    expect(await code(broker.resolveManaged(name))).toBe('not_managed');
  });
  it('không có ⇒ not_found', async () => {
    const { broker } = setup();
    expect(await code(broker.resolveManaged('ga-sys-NONE'))).toBe('not_found');
  });
});

describe('create / exec qua policy — runtime KHÔNG được gọi khi vi phạm', () => {
  it('body vi phạm (privileged) ⇒ policy_violation:privileged, không tạo', async () => {
    const { rt, broker } = setup();
    const b = buildConsumerContainer('sys.v1', SYS, [], ENV);
    (b.body.HostConfig as Record<string, unknown>).Privileged = true;
    expect(await code(broker.create(b.name, b.body))).toBe('policy_violation:privileged');
    expect(rt.created).toEqual([]);
  });
  it('exec vào container không quản ⇒ not_managed, không exec', async () => {
    const { rt, broker } = setup();
    rt.addForeign('ga-app');
    const c = await rt.inspectContainer('ga-app');
    expect(await code(broker.exec(c as never, { Cmd: ['/usr/local/bin/ga-runner', 'auth-gc'] } as never))).toBe(
      'not_managed',
    );
    expect(rt.execs).toEqual([]);
  });
  it('exec chương trình ngoài allowlist vào container được quản ⇒ policy_violation:exec_program', async () => {
    const { rt, broker, svc } = setup();
    await svc.ensureContainer({ consumer: SYS, template: 'sys.v1', authVolumes: [] });
    const c = await broker.resolveManaged('ga-sys-AB12');
    await broker.start(c);
    const spec = { ...svc.internalSpec(['ga-runner', 'auth-gc']), Cmd: ['/bin/sh', '-c', 'id'] };
    expect(await code(broker.exec(await broker.resolveManaged('ga-sys-AB12'), spec))).toBe(
      'policy_violation:exec_program',
    );
    expect(rt.execs).toEqual([]);
  });
});

describe('ensureContainer — mẫu có version, nhãn, volume gieo quyền, dựng lại khi lệch', () => {
  it('dựng sys.v1: nhãn genagents.*, volume /auth + ga-engines được tạo và gieo (volume-init tạo rồi xoá)', async () => {
    const { rt, svc } = setup();
    const r = await svc.ensureContainer({ consumer: SYS, template: 'sys.v1', authVolumes: ['ga-auth-en-0001'] });
    expect(r).toEqual({
      action: 'created',
      response: { container: { name: 'ga-sys-AB12' }, observed: 'created', rolesNetworkIp: null },
    });
    expect([...rt.volumes.keys()].sort()).toEqual(['ga-auth-en-0001', 'ga-engines']);
    expect(rt.created.filter((c) => c.name.startsWith('ga-sys-volinit-'))).toHaveLength(2);
    const c = await rt.inspectContainer('ga-sys-AB12');
    expect(c?.labels).toMatchObject({
      'genagents.kind': 'sys',
      'genagents.template': 'sys.v1',
      'genagents.accounts': 'EN-0001',
    });
    expect(c?.mounts).toEqual([
      { type: 'volume', name: 'ga-auth-en-0001', destination: '/auth/EN-0001', rw: true },
      { type: 'volume', name: 'ga-engines', destination: '/opt/engines', rw: false },
    ]);
  });
  it('gọi lại cùng spec ⇒ none; đổi tập volume (gỡ binding) ⇒ dựng lại', async () => {
    const { rt, svc } = setup();
    await svc.ensureContainer({
      consumer: ROLE,
      template: 'role.v1',
      authVolumes: ['ga-auth-en-0001', 'ga-auth-en-0002'],
    });
    expect(
      (
        await svc.ensureContainer({
          consumer: ROLE,
          template: 'role.v1',
          authVolumes: ['ga-auth-en-0002', 'ga-auth-en-0001'],
        })
      ).action,
    ).toBe('none');
    const r = await svc.ensureContainer({ consumer: ROLE, template: 'role.v1', authVolumes: ['ga-auth-en-0001'] });
    expect(r.action).toBe('created');
    expect(rt.removed).toContain(containerNameOf(ROLE));
  });
  it('mẫu không version ⇒ bad_request (template_unversioned)', async () => {
    const { svc } = setup();
    expect(await code(svc.ensureContainer({ consumer: SYS, template: 'sys', authVolumes: [] }))).toBe(
      'bad_request:template_unversioned',
    );
  });
  it('tên bị container lạ chiếm ⇒ name_conflict (không đè)', async () => {
    const { rt, svc } = setup();
    rt.addForeign('ga-sys-AB12');
    expect(await code(svc.ensureContainer({ consumer: SYS, template: 'sys.v1', authVolumes: [] }))).toBe(
      'name_conflict',
    );
  });
  it('volume /auth không ánh xạ được EN-<số> ⇒ bad_request', async () => {
    const { svc } = setup();
    expect(
      await code(svc.ensureContainer({ consumer: SYS, template: 'sys.v1', authVolumes: ['ga-auth-en-abc'] })),
    ).toBe('bad_request');
  });
});
