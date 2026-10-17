// Phạm vi change set (review bảo mật MEDIUM — nhánh create từng bỏ qua kiểm phạm vi, cùng lớp L-39) + ai được ÁP thay đổi
// chạm lõi / Nội quy (Values > Nội quy > Polaris: đất của owner).
//   1. Quét TOÀN BỘ scope × lớp × op (bảng, không chọn tay) trên repo SQLite VÀ fake: ngoài phạm vi ⇒ repo.invalid_input,
//      trong phạm vi ⇒ đề xuất được. Kỳ vọng tính bằng oracle viết riêng trong test (không gọi lại hàm của src).
//   2. ÁP mục chạm lõi (giá trị / tính cách, DN lõi) hoặc Nội quy ⇒ chỉ owner, BẤT KỂ ai đề xuất (admin đề xuất được, không tự áp).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DB_ENUMS } from '../../src/generated/enums.ts';
import { allocateDisplayId, newUlid, sequentialIds } from '../../src/ids/index.ts';
import { createFakeStore } from '../../src/repos/fake/index.ts';
import { createFixture, type Fixture } from '../../src/repos/fixture/index.ts';
import {
  type ChangeItemInput,
  type ChangeSetScope,
  type DataStore,
  DbRuleError,
  dml,
  type InstructionLayer,
  type ProposeChangeSetInput,
} from '../../src/repos/index.ts';
import { verifySeedReference } from '../../src/seed/reference.ts';
import { FakeClock } from '../helpers.ts';

const LAYERS = DB_ENUMS['instructions.layer'] as readonly InstructionLayer[];
const OPS = ['create', 'update'] as const;

interface Harness {
  store: DataStore;
  ws: string;
  owner: string;
  r1: string;
  r2: string;
  p1: string;
  p2: string;
  /** Khối IN đang active theo lớp: lớp Role ở R1, lớp position ở P1, house_rules ở workspace. */
  targets: Record<InstructionLayer, { id: string; version: number }>;
}

class Rollback extends Error {}

const createItem = (layer: InstructionLayer): ChangeItemInput => ({
  target: 'instruction',
  op: 'create',
  layer,
  ordinal: 1,
  name: `khối ${layer}`,
  content: `nội dung ${layer}`,
  tokenCount: 3,
  tokenizer: 't',
  source: 'owner',
});

function scopeInput(h: Harness, key: string): Pick<ProposeChangeSetInput, 'scope' | 'roleId' | 'positionId'> {
  const [scope, who] = key.split(':') as [ChangeSetScope, string | undefined];
  if (scope === 'role') return { scope, roleId: who === 'R2' ? h.r2 : h.r1 };
  if (scope === 'position') return { scope, positionId: who === 'P2' ? h.p2 : h.p1 };
  return { scope };
}
const SCOPES = ['role:R1', 'role:R2', 'position:P1', 'position:P2', 'workspace', 'library'] as const;

/** Oracle độc lập: create theo lớp; update còn phải đúng chủ của khối (R1 / P1 / workspace). */
function expectedOk(scopeKey: (typeof SCOPES)[number], layer: InstructionLayer, op: (typeof OPS)[number]): boolean {
  if (layer === 'house_rules') return scopeKey === 'workspace';
  if (layer === 'position') return op === 'create' ? scopeKey.startsWith('position:') : scopeKey === 'position:P1';
  return op === 'create' ? scopeKey.startsWith('role:') : scopeKey === 'role:R1';
}

/** Đề xuất trong giao dịch rồi huỷ (rollback) — 'ok' nếu đề xuất qua được, nếu không thì mã ổn định. */
function attempt(h: Harness, input: ProposeChangeSetInput): string {
  try {
    h.store.write(h.owner, (tx) => {
      tx.changeSets.propose(input);
      throw new Rollback();
    });
  } catch (e) {
    if (e instanceof Rollback) return 'ok';
    if (e instanceof DbRuleError) return e.rule;
    throw e;
  }
  return 'không rollback';
}

function sweep(h: Harness): { cases: number; wrong: string[] } {
  const wrong: string[] = [];
  let cases = 0;
  for (const s of SCOPES) {
    for (const layer of LAYERS) {
      for (const op of OPS) {
        const t = h.targets[layer];
        const item: ChangeItemInput =
          op === 'create'
            ? createItem(layer)
            : {
                target: 'instruction',
                op: 'update',
                instructionId: t.id,
                baseVersion: t.version,
                patch: { content: `sửa ${layer}` },
                tokenCount: 4,
              };
        const got = attempt(h, { ...scopeInput(h, s), title: `${s} ${layer} ${op}`, items: [item] });
        const want = expectedOk(s, layer, op) ? 'ok' : 'repo.invalid_input';
        cases++;
        if (got !== want) wrong.push(`${s} × ${layer} × ${op}: cần ${want}, nhận ${got}`);
      }
    }
  }
  return { cases, wrong };
}

/** Dựng khối IN active cho mỗi lớp ở đúng chủ của nó (đề xuất + áp bởi owner). */
function seedTargets(h: Omit<Harness, 'targets'>): Harness['targets'] {
  const out = {} as Harness['targets'];
  for (const layer of LAYERS) {
    const where =
      layer === 'house_rules'
        ? { scope: 'workspace' as const }
        : layer === 'position'
          ? { scope: 'position' as const, positionId: h.p1 }
          : { scope: 'role' as const, roleId: h.r1 };
    const { changeSet } = h.store.write(h.owner, (tx) =>
      tx.changeSets.propose({ ...where, title: `gốc ${layer}`, items: [createItem(layer)] }),
    );
    h.store.write(h.owner, (tx) => tx.changeSets.apply(changeSet.id, { note: 'dựng khối gốc' }));
    const ins = h.store.read(h.ws, (tx) => tx.instructions.list({ layer }).find((x) => x.name === `khối ${layer}`));
    if (ins === undefined) throw new Error(`thiếu khối gốc ${layer}`);
    out[layer] = { id: ins.id, version: ins.version };
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------

let f: Fixture;
let sql: Harness;
beforeAll(() => {
  f = createFixture({ roles: 2 });
  const p1 = f.store.read(f.workspaceId, (tx) => tx.roles.positions()[0]?.id as string);
  const p2 = newUlid(f.clock);
  f.writer.write(f.ownerActorId, (w) => {
    const d = allocateDisplayId(w, f.workspaceId, 'PS');
    dml(w).write(
      'INSERT INTO positions (id, workspace_id, display_id, display_seq, created_at, created_by, title) ' +
        'VALUES (?, ?, ?, ?, app_now(), app_actor(), ?)',
      [p2, f.workspaceId, d.displayId, d.displaySeq, 'Kế toán'],
    );
  });
  const base = {
    store: f.store,
    ws: f.workspaceId,
    owner: f.ownerActorId,
    r1: f.roles[0]?.id as string,
    r2: f.roles[1]?.id as string,
    p1,
    p2,
  };
  sql = { ...base, targets: seedTargets(base) };
});
afterAll(() => f?.close());

describe('phạm vi change set: quét scope × lớp × op', () => {
  it('repo SQLite: mọi tổ hợp ngoài phạm vi ⇒ repo.invalid_input; trong phạm vi ⇒ đề xuất được', () => {
    const r = sweep(sql);
    expect(r.cases).toBe(SCOPES.length * LAYERS.length * OPS.length);
    expect(r.wrong).toEqual([]);
  });

  it('fake store: cùng bảng, cùng kết quả (một luật dùng chung repos/scope.ts)', () => {
    const SEED = verifySeedReference(
      JSON.parse(
        readFileSync(fileURLToPath(new URL('../../../../db/spec/seed_reference.json', import.meta.url)), 'utf8'),
      ),
    );
    const store = createFakeStore({ clock: new FakeClock('2026-10-17T08:00:00.000Z'), newId: sequentialIds('SCP') });
    store.installGlobal(SEED);
    const user = store.createUser({ username: 'owner', displayName: 'Owner', passwordHash: 'argon2id$x' });
    const t = store.createTenant({ slug: 'afi', name: 'Afi', shortCode: '7K2Q', ownerUserId: user.id }, SEED);
    const role = (name: string) => store.write(t.ownerActorId, (tx) => tx.roles.create({ name, color: 'jade' })).id;
    const base = {
      store,
      ws: t.workspace.id,
      owner: t.ownerActorId,
      r1: role('Một'),
      r2: role('Hai'),
      p1: store.read(t.workspace.id, (tx) => tx.roles.positions()[0]?.id as string),
      p2: 'SCP0000000000000000000ZZZZ',
    };
    const r = sweep({ ...base, targets: seedTargets(base) });
    expect(r.wrong).toEqual([]);
  });

  it('DN: chỉ change set scope role của đúng Role (create + update)', () => {
    const def = f.store.read(f.workspaceId, (tx) => tx.dna.defs().find((d) => d.is_core === 0 && d.is_list === 0));
    const dnItem = (): ChangeItemInput => ({
      target: 'dna',
      op: 'create',
      defId: def?.id as string,
      valueJson: '"x"',
      tokenCount: 2,
      tokenizer: 't',
      source: 'owner',
    });
    for (const s of SCOPES) {
      const got = attempt(sql, { ...scopeInput(sql, s), title: `dn ${s}`, items: [dnItem()] });
      expect(got, s).toBe(s.startsWith('role:') ? 'ok' : 'repo.invalid_input');
    }
    const { changeSet } = f.store.write(f.ownerActorId, (tx) =>
      tx.changeSets.propose({ scope: 'role', roleId: sql.r1, title: 'dn gốc', items: [dnItem()] }),
    );
    f.store.write(f.ownerActorId, (tx) => tx.changeSets.apply(changeSet.id));
    const field = f.store.read(f.workspaceId, (tx) => tx.dna.fields(sql.r1)[0]);
    for (const s of SCOPES) {
      const got = attempt(sql, {
        ...scopeInput(sql, s),
        title: `dn sửa ${s}`,
        items: [
          {
            target: 'dna',
            op: 'update',
            dnaFieldId: field?.id as string,
            baseVersion: field?.version as number,
            valueJson: '"y"',
            tokenCount: 2,
          },
        ],
      });
      expect(got, s).toBe(s === 'role:R1' ? 'ok' : 'repo.invalid_input');
    }
  });
});

describe('ai được ÁP thay đổi chạm lõi / Nội quy (owner-only, bất kể ai đề xuất)', () => {
  let admin: string;
  beforeAll(() => {
    const u = f.store.createUser({ username: 'quantri', displayName: 'Quản trị', passwordHash: 'argon2id$x' });
    admin = f.store.write(f.ownerActorId, (tx) => tx.workspace.addMember({ userId: u.id, accessLevel: 'admin' })).actor
      .id;
  });
  /** Oracle độc lập: đất của owner = lớp giá trị / tính cách / Nội quy, DN lõi. */
  const ownerGroundLayer = (layer: InstructionLayer) =>
    layer === 'values' || layer === 'persona' || layer === 'house_rules';
  const where = (layer: InstructionLayer) =>
    layer === 'house_rules'
      ? { scope: 'workspace' as const }
      : layer === 'position'
        ? { scope: 'position' as const, positionId: sql.p1 }
        : { scope: 'role' as const, roleId: sql.r2 };
  let n = 0;
  const propose = (
    by: string,
    items: ChangeItemInput[],
    w: Pick<ProposeChangeSetInput, 'scope' | 'roleId' | 'positionId'>,
  ) => f.store.write(by, (tx) => tx.changeSets.propose({ ...w, title: `đề xuất ${++n}`, items }));
  const inItem = (layer: InstructionLayer, by: string) =>
    ({
      ...createItem(layer),
      name: `${layer} ${++n}`,
      source: by === f.systemActorId ? 'system' : 'owner',
    }) as ChangeItemInput;
  const usedDefs = new Set<string>();
  /** Mỗi lần một def DN chưa dùng cho Role r2 (tránh trùng ô (role, def, item_index)). */
  const dnItem = (core: boolean, by: string): ChangeItemInput => {
    const def = f.store.read(f.workspaceId, (tx) =>
      tx.dna.defs().find((d) => d.is_core === (core ? 1 : 0) && d.is_list === 0 && !usedDefs.has(d.id)),
    );
    expect(def, `def DN ${core ? 'lõi' : 'thường'} chưa dùng`).toBeDefined();
    usedDefs.add(def?.id as string);
    return {
      target: 'dna',
      op: 'create',
      defId: def?.id as string,
      valueJson: '"x"',
      tokenCount: 2,
      tokenizer: 't',
      source: by === f.systemActorId ? 'system' : 'owner',
    };
  };
  const applyAs = (actor: string, id: string, acceptItemIds?: string[]) =>
    f.store.write(actor, (tx) => tx.changeSets.apply(id, { note: 'duyệt', acceptItemIds })).changeSet.status;
  const denied = expect.objectContaining({ rule: 'permission.denied' });

  it('quét người đề xuất (hệ thống / admin / owner) × lớp IN × DN lõi / thường: admin đề xuất được nhưng chỉ owner áp đất của owner', () => {
    const proposers = { system: f.systemActorId, admin, owner: f.ownerActorId };
    const wrong: string[] = [];
    let swept = 0;
    for (const [who, by] of Object.entries(proposers)) {
      const cases: { name: string; ownerGround: boolean; items: ChangeItemInput[]; w: ReturnType<typeof where> }[] = [
        ...LAYERS.map((layer) => ({
          name: `IN ${layer}`,
          ownerGround: ownerGroundLayer(layer),
          items: [inItem(layer, by)],
          w: where(layer),
        })),
        { name: 'DN lõi', ownerGround: true, items: [dnItem(true, by)], w: where('values') },
        { name: 'DN thường', ownerGround: false, items: [dnItem(false, by)], w: where('values') },
      ];
      for (const c of cases) {
        const id = propose(by, c.items, c.w).changeSet.id; // đề xuất luôn được (kể cả admin chạm lõi)
        swept++;
        const label = `${who} đề xuất ${c.name}`;
        let adminResult: string;
        try {
          adminResult = applyAs(admin, id);
        } catch (e) {
          adminResult = (e as { rule?: string }).rule ?? String(e);
        }
        const wantAdmin = c.ownerGround ? 'permission.denied' : 'applied';
        if (adminResult !== wantAdmin) wrong.push(`${label}: admin áp ⇒ cần ${wantAdmin}, nhận ${adminResult}`);
        // owner chỉ áp khi admin đã bị chặn (nếu admin lọt thì đã ghi vào `wrong` — không để ngoại lệ che dòng assert)
        if (c.ownerGround && adminResult === 'permission.denied') {
          const ownerResult = applyAs(f.ownerActorId, id);
          if (ownerResult !== 'applied') wrong.push(`${label}: owner áp ⇒ ${ownerResult}`);
        }
      }
    }
    expect(swept).toBe(3 * (LAYERS.length + 2));
    expect(wrong).toEqual([]);
  });

  it('luật tính trên mục được ÁP: admin áp phần thường, mục lõi bị loại ⇒ được; chọn cả mục lõi ⇒ bị chặn', () => {
    const { changeSet, items } = propose(admin, [inItem('style', admin), inItem('values', admin)], where('values'));
    const [style, values] = items.map((x) => x.id) as [string, string];
    expect(() => applyAs(admin, changeSet.id, [style, values])).toThrow(denied);
    expect(applyAs(admin, changeSet.id, [style])).toBe('partially_applied');
  });
});
