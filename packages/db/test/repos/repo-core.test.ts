// Repo SQLite thật — họ workspace / users / auth / settings / secrets / roles / avatar / change set → revision.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFixture, type Fixture } from '../../src/repos/fixture/index.ts';
import { DbRuleError } from '../../src/repos/index.ts';

let f: Fixture;
beforeEach(() => {
  f = createFixture({ roles: 1 });
});
afterEach(() => f.close());

const rule = (r: string) => expect.objectContaining({ rule: r });

describe('workspace / users / auth_sessions', () => {
  it('owner, actor system, thành viên; users chỉ trong phạm vi workspace', () => {
    f.store.read(f.workspaceId, (tx) => {
      const o = tx.workspace.owner();
      expect(o?.user.id).toBe(f.ownerUserId);
      expect(o?.actor.id).toBe(f.ownerActorId);
      expect(tx.workspace.systemActor().id).toBe(f.systemActorId);
      expect(tx.workspace.systemActor('scheduler').kind).toBe('system');
      expect(tx.users.byUsername('owner')?.id).toBe(f.ownerUserId);
    });
    const u = f.store.write(f.ownerActorId, (tx) => tx.users.recordLoginFailure(f.ownerUserId, { lockUntil: null }));
    expect(u.failed_login_count).toBe(1);
    const s = f.store.write(f.ownerActorId, (tx) =>
      tx.authSessions.create({ userId: f.ownerUserId, tokenHash: 'h1', expiresAt: '2026-10-18T08:00:00.000Z' }),
    );
    expect(f.store.read(f.workspaceId, (tx) => tx.authSessions.byTokenHash('h1')?.id)).toBe(s.id);
    expect(f.store.write(f.ownerActorId, (tx) => tx.authSessions.revokeAllForUser(f.ownerUserId))).toBe(1);
  });

  it('workspace.update ghi audit; workspace lạ ⇒ repo.not_found', () => {
    const w = f.store.write(f.ownerActorId, (tx) => tx.workspace.update({ name: 'Afi 2' }), {
      channel: 'web',
      requestId: 'r-1',
    });
    expect(w.name).toBe('Afi 2');
    const audit = f.store.read(f.workspaceId, (tx) => tx.audit.list({ requestId: 'r-1' }).items);
    expect(audit.map((a) => a.action)).toEqual(['workspace.update']);
    expect(JSON.parse(audit[0]?.after_json ?? '{}')).toEqual({ name: 'Afi 2' });
    expect(() => f.store.read('01JZZZ00000000000000000000', () => 1)).toThrow(rule('repo.not_found'));
  });
});

describe('settings', () => {
  it('get = mặc định / seed; set chèn ST- mới hoặc sửa; remove về mặc định', () => {
    f.store.read(f.workspaceId, (tx) => {
      expect(tx.settings.get('economy.initial_grant_minor')).toBe(100_000);
      expect(tx.settings.get('avatar.transient_seconds')).toBe(20);
    });
    const a = f.store.write(f.ownerActorId, (tx) => tx.settings.set('avatar.transient_seconds', 30));
    expect(a.display_id).toBe('ST-0019');
    const b = f.store.write(f.ownerActorId, (tx) => tx.settings.set('avatar.transient_seconds', 40));
    expect(b.id).toBe(a.id);
    expect(b.version).toBe(a.version + 1);
    expect(b.updated_by).toBe(f.ownerActorId);
    f.store.write(f.ownerActorId, (tx) => tx.settings.remove('avatar.transient_seconds'));
    expect(f.store.read(f.workspaceId, (tx) => tx.settings.get('avatar.transient_seconds'))).toBe(20);
  });

  it('giá trị sai schema ⇒ repo.invalid_input trước khi chạm DB', () => {
    expect(() =>
      f.store.write(f.ownerActorId, (tx) => tx.settings.set('avatar.transient_seconds', 9999 as never)),
    ).toThrow(rule('repo.invalid_input'));
  });
});

describe('roles', () => {
  it('tạo Role + actor role; name_norm bỏ dấu; trùng tên ⇒ unique.duplicate', () => {
    const r = f.store.write(f.ownerActorId, (tx) => tx.roles.create({ name: 'Đặng Hoà', color: 'teal' }));
    expect(r.name_norm).toBe('dang hoa');
    expect(r.created_by).toBe(f.ownerActorId);
    expect(f.store.read(f.workspaceId, (tx) => tx.workspace.actorForRole(r.id)?.kind)).toBe('role');
    expect(f.store.read(f.workspaceId, (tx) => tx.roles.getByDisplayId(r.display_id)?.id)).toBe(r.id);
    expect(() => f.store.write(f.ownerActorId, (tx) => tx.roles.create({ name: 'đặng hoà', color: 'teal' }))).toThrow(
      rule('unique.duplicate'),
    );
  });

  it('version lạc quan; runtime state không tăng version; xoá mềm', () => {
    const r0 = f.roles[0] as NonNullable<(typeof f.roles)[0]>;
    const r1 = f.store.write(f.ownerActorId, (tx) => tx.roles.update(r0.id, { color: 'rose' }, r0.version));
    expect(r1.version).toBe(r0.version + 1);
    expect(() => f.store.write(f.ownerActorId, (tx) => tx.roles.update(r0.id, { color: 'iris' }, r0.version))).toThrow(
      rule('repo.version_conflict'),
    );
    const r2 = f.store.write(f.systemActorId, (tx) => tx.roles.setRuntimeState(r0.id, 'sleeping'));
    expect(r2.version).toBe(r1.version);
    f.store.write(f.ownerActorId, (tx) => tx.roles.softDelete(r0.id));
    expect(f.store.read(f.workspaceId, (tx) => tx.roles.list().length)).toBe(0);
  });
});

describe('change set → revision', () => {
  it('đề xuất DN + IN, áp ⇒ revision v1.0 (birth), hàng chính active, version accepted, brain_sync', () => {
    const role = f.roles[0] as NonNullable<(typeof f.roles)[0]>;
    const def = f.store.read(f.workspaceId, (tx) => tx.dna.defs().find((d) => d.is_core === 0 && d.is_list === 0));
    expect(def).toBeDefined();
    const { changeSet, items } = f.store.write(f.ownerActorId, (tx) =>
      tx.changeSets.propose({
        scope: 'role',
        roleId: role.id,
        title: 'Khai sinh',
        items: [
          {
            target: 'dna',
            op: 'create',
            defId: (def as NonNullable<typeof def>).id,
            valueJson: '"giá trị"',
            prose: 'câu',
            tokenCount: 5,
            tokenizer: 'test',
            source: 'owner',
          },
          {
            target: 'instruction',
            op: 'create',
            layer: 'style',
            ordinal: 1,
            name: 'Phong cách',
            content: 'Ngắn gọn.',
            tokenCount: 7,
            tokenizer: 'test',
            source: 'owner',
          },
        ],
      }),
    );
    expect(items).toHaveLength(2);
    expect(changeSet.proposed_by).toBe(f.ownerActorId);
    const res = f.store.write(f.ownerActorId, (tx) => tx.changeSets.apply(changeSet.id));
    expect(res.changeSet.status).toBe('applied');
    expect(res.revision).toMatchObject({ seq: 1, major: 1, minor: 0, kind: 'birth', is_core: 0 });
    expect(res.revision.snapshot_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    f.store.read(f.workspaceId, (tx) => {
      expect(tx.roles.get(role.id)?.current_revision_id).toBe(res.revision.id);
      const fields = tx.dna.fields(role.id);
      expect(fields.map((x) => x.status)).toEqual(['active']);
      expect(tx.dna.versions(fields[0]?.id as string).map((v) => [v.status, v.version])).toEqual([['accepted', 1]]);
      expect(tx.instructions.list({ roleId: role.id }).map((x) => x.status)).toEqual(['active']);
      expect(tx.jobs.list({ kind: 'brain_sync' }).items).toHaveLength(1);
    });
    // sửa thường ⇒ v1.1
    const ins = f.store.read(f.workspaceId, (tx) => tx.instructions.list({ roleId: role.id })[0]);
    const cs2 = f.store.write(f.ownerActorId, (tx) =>
      tx.changeSets.propose({
        scope: 'role',
        roleId: role.id,
        title: 'Sửa',
        items: [
          {
            target: 'instruction',
            op: 'update',
            instructionId: ins?.id as string,
            baseVersion: ins?.version as number,
            patch: { content: 'Rất ngắn gọn.' },
            tokenCount: 8,
          },
        ],
      }),
    );
    const res2 = f.store.write(f.ownerActorId, (tx) => tx.changeSets.apply(cs2.changeSet.id));
    expect(res2.revision).toMatchObject({ seq: 2, major: 1, minor: 1, kind: 'edit' });
    const after = f.store.read(f.workspaceId, (tx) => tx.instructions.get(ins?.id as string));
    expect(after?.content).toBe('Rất ngắn gọn.');
    expect(after?.version).toBe((ins?.version as number) + 1);
    // jobs brain_sync dedupe trên hàng đang chờ
    expect(f.store.read(f.workspaceId, (tx) => tx.jobs.list({ kind: 'brain_sync' }).items)).toHaveLength(1);
  });

  it('mục đã cũ (base_version lệch) ⇒ stale + partially_applied; lõi không lý do ⇒ invalid_input', () => {
    const role = f.roles[0] as NonNullable<(typeof f.roles)[0]>;
    const mk = (content: string, ordinal = 1) =>
      f.store.write(f.ownerActorId, (tx) =>
        tx.changeSets.propose({
          scope: 'role',
          roleId: role.id,
          title: content,
          items: [
            {
              target: 'instruction',
              op: 'create',
              layer: 'style',
              ordinal,
              name: content,
              content,
              tokenCount: 1,
              tokenizer: 't',
              source: 'owner',
            },
          ],
        }),
      );
    const first = mk('A');
    f.store.write(f.ownerActorId, (tx) => tx.changeSets.apply(first.changeSet.id));
    const ins = f.store.read(f.workspaceId, (tx) => tx.instructions.list({ roleId: role.id })[0]);
    const upd = (c: string) =>
      f.store.write(f.ownerActorId, (tx) =>
        tx.changeSets.propose({
          scope: 'role',
          roleId: role.id,
          title: c,
          items: [
            {
              target: 'instruction',
              op: 'update',
              instructionId: ins?.id as string,
              baseVersion: ins?.version as number,
              patch: { content: c },
              tokenCount: 1,
            },
          ],
        }),
      );
    const x = upd('X');
    const y = upd('Y');
    f.store.write(f.ownerActorId, (tx) => tx.changeSets.apply(x.changeSet.id));
    // y cùng base_version ⇒ đã cũ; mọi mục cũ ⇒ không có gì để áp
    expect(() => f.store.write(f.ownerActorId, (tx) => tx.changeSets.apply(y.changeSet.id))).toThrow(DbRuleError);
    const rej = f.store.write(f.ownerActorId, (tx) => tx.changeSets.reject(y.changeSet.id, 'cũ'));
    expect(rej.status).toBe('rejected');
    // khối lõi (persona) không lý do ⇒ từ chối trước khi chạm DB
    const core = f.store.write(f.ownerActorId, (tx) =>
      tx.changeSets.propose({
        scope: 'role',
        roleId: role.id,
        title: 'lõi',
        items: [
          {
            target: 'instruction',
            op: 'create',
            layer: 'persona',
            ordinal: 1,
            name: 'P',
            content: 'P',
            tokenCount: 1,
            tokenizer: 't',
            source: 'owner',
          },
        ],
      }),
    );
    expect(() => f.store.write(f.ownerActorId, (tx) => tx.changeSets.apply(core.changeSet.id))).toThrow(
      rule('repo.invalid_input'),
    );
    const ok = f.store.write(f.ownerActorId, (tx) => tx.changeSets.apply(core.changeSet.id, { note: 'đổi tính cách' }));
    expect(ok.revision).toMatchObject({ is_core: 1, minor: 0, kind: 'core_edit' });
    expect(ok.revision.major).toBeGreaterThan(1);
  });
});

describe('avatar + Kho nhân vật', () => {
  it('gán ảnh thư viện (chép license / sha256), monogram, khôi phục AV cũ', () => {
    const role = f.roles[0] as NonNullable<(typeof f.roles)[0]>;
    const skin = f.store.read(f.workspaceId, (tx) => tx.avatar.library()[0]);
    const a1 = f.store.write(f.ownerActorId, (tx) => tx.avatar.assignLibrary(role.id, skin?.skin_asset_id as string));
    expect(a1.avatar.skin_sha256).toBe(skin?.sha256);
    expect(a1.role.avatar_id).toBe(a1.avatar.id);
    const a2 = f.store.write(f.ownerActorId, (tx) => tx.avatar.assignMonogram(role.id));
    expect(f.store.read(f.workspaceId, (tx) => tx.avatar.history(role.id).length)).toBe(2);
    f.store.write(f.ownerActorId, (tx) => tx.avatar.restore(role.id, a1.avatar.id));
    expect(f.store.read(f.workspaceId, (tx) => tx.avatar.current(role.id)?.id)).toBe(a1.avatar.id);
    void a2;
    // nhân vật đã tắt trong Kho ⇒ không gán mới
    f.store.write(f.ownerActorId, (tx) => tx.avatar.setSkinEnabled(skin?.skin_asset_id as string, false));
    expect(() =>
      f.store.write(f.ownerActorId, (tx) => tx.avatar.assignLibrary(role.id, skin?.skin_asset_id as string)),
    ).toThrow(rule('character_library.disabled'));
  });
});
