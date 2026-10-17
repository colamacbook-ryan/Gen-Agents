// Dựng dữ liệu cho test L-HR qua repo thật (actor owner của tenant A) + gọi API qua client testkit.
import type { WriteTx } from '@ga/db/repos';
import { handlers } from '../../src/hr/handlers.ts';
import { makeTestApp, type TestApp } from '../http/harness.ts';

export function makeHrApp(): TestApp {
  return makeTestApp({ handlers });
}

let n = 0;
export const uniq = (p: string) => `${p} ${++n}`;

export function ownerWrite<T>(t: TestApp, fn: (tx: WriteTx) => T): T {
  return t.world.store.write(t.world.tenants.A.users.owner.actorId, fn, { channel: 'web' });
}

export function mkRole(t: TestApp, name = uniq('Hr role')) {
  return ownerWrite(t, (tx) => tx.roles.create({ name, color: 'jade' }));
}

/** Tạo một trường DNA theo khoá định nghĩa (qua change set, nguồn owner; lõi ⇒ note). */
export function addDna(t: TestApp, roleId: string, key: string, value: unknown) {
  return ownerWrite(t, (tx) => {
    const def = tx.dna.defs().find((d) => d.key === key);
    if (def === undefined) throw new Error(`thiếu def ${key}`);
    const { changeSet } = tx.changeSets.propose({
      scope: 'role',
      roleId,
      title: `seed ${key}`,
      items: [
        {
          target: 'dna',
          op: 'create',
          defId: def.id,
          valueJson: JSON.stringify(value),
          valueNum: typeof value === 'number' ? value : null,
          tokenCount: 3,
          tokenizer: 'test',
          source: 'owner',
        },
      ],
    });
    tx.changeSets.apply(changeSet.id, def.is_core === 1 ? { note: 'seed lõi' } : {});
    const f = tx.dna.fields(roleId).find((x) => x.def_id === def.id);
    if (f === undefined) throw new Error('không thấy trường vừa tạo');
    return f;
  });
}

export function addInstruction(
  t: TestApp,
  scope: { roleId: string } | { positionId: string } | { workspace: true },
  layer: 'values' | 'persona' | 'style' | 'drive' | 'position' | 'house_rules',
  name = uniq('IN'),
) {
  return ownerWrite(t, (tx) => {
    const { changeSet } = tx.changeSets.propose({
      scope: 'roleId' in scope ? 'role' : 'positionId' in scope ? 'position' : 'workspace',
      ...('roleId' in scope ? { roleId: scope.roleId } : {}),
      ...('positionId' in scope ? { positionId: scope.positionId } : {}),
      title: `seed ${name}`,
      items: [
        {
          target: 'instruction',
          op: 'create',
          layer,
          ordinal: 1,
          name,
          content: 'nội dung seed',
          tokenCount: 3,
          tokenizer: 'test',
          source: 'owner',
        },
      ],
    });
    tx.changeSets.apply(changeSet.id, layer === 'values' || layer === 'persona' ? { note: 'seed lõi' } : {});
    const rows = tx.instructions
      .list({
        ...('roleId' in scope ? { roleId: scope.roleId } : {}),
        ...('positionId' in scope ? { positionId: scope.positionId } : {}),
        layer,
      })
      .filter((r) => r.name === name);
    const row = rows[0];
    if (row === undefined) throw new Error('không thấy IN vừa tạo');
    return row;
  });
}
