// Phạm vi change set (review bảo mật MEDIUM — nhánh create từng bỏ qua kiểm phạm vi, cùng lớp L-39) + ai được ÁP thay đổi
// chạm lõi / Nội quy (Values > Nội quy > Polaris: đất của owner).
//   1. Quét TOÀN BỘ scope × lớp × op (bảng, không chọn tay) trên repo SQLite VÀ fake: ngoài phạm vi ⇒ repo.invalid_input,
//      trong phạm vi ⇒ đề xuất được. Kỳ vọng tính bằng oracle viết riêng trong test (không gọi lại hàm của src).
//   2. Đề xuất của AI / hệ thống chạm lõi (giá trị / tính cách, DN lõi) hoặc Nội quy ⇒ chỉ owner áp (admin bị chặn).
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

describe('ai được áp thay đổi chạm lõi / Nội quy', () => {
  let admin: string;
  beforeAll(() => {
    const u = f.store.createUser({ username: 'quantri', displayName: 'Quản trị', passwordHash: 'argon2id$x' });
    admin = f.store.write(f.ownerActorId, (tx) => tx.workspace.addMember({ userId: u.id, accessLevel: 'admin' })).actor
      .id;
  });
  const sysPropose = (layer: InstructionLayer, by = f.systemActorId) => {
    const where =
      layer === 'house_rules'
        ? { scope: 'workspace' as const }
        : layer === 'position'
          ? { scope: 'position' as const, positionId: sql.p1 }
          : { scope: 'role' as const, roleId: sql.r2 };
    return f.store.write(by, (tx) =>
      tx.changeSets.propose({
        ...where,
        title: `đề xuất ${layer}`,
        items: [{ ...createItem(layer), name: `${layer} ${by.slice(-6)}`, source: 'system' } as ChangeItemInput],
      }),
    ).changeSet.id;
  };
  const applyAs = (actor: string, id: string) =>
    f.store.write(actor, (tx) => tx.changeSets.apply(id, { note: 'duyệt' })).changeSet.status;

  it('đề xuất của hệ thống: lõi (values / persona) + Nội quy ⇒ admin bị chặn (permission.denied), owner áp được', () => {
    for (const layer of LAYERS) {
      const id = sysPropose(layer);
      const ownerGround = layer === 'values' || layer === 'persona' || layer === 'house_rules';
      if (ownerGround) {
        expect(() => applyAs(admin, id), layer).toThrow(expect.objectContaining({ rule: 'permission.denied' }));
        expect(applyAs(f.ownerActorId, id), layer).toBe('applied');
      } else {
        expect(applyAs(admin, id), layer).toBe('applied');
      }
    }
  });

  it('DN lõi do hệ thống đề xuất ⇒ chỉ owner áp; đề xuất của chính người (admin) chạm lõi ⇒ admin áp được', () => {
    const core = f.store.read(f.workspaceId, (tx) => tx.dna.defs().find((d) => d.is_core === 1 && d.is_list === 0));
    expect(core).toBeDefined();
    const { changeSet } = f.store.write(f.systemActorId, (tx) =>
      tx.changeSets.propose({
        scope: 'role',
        roleId: sql.r2,
        title: 'DN lõi',
        items: [
          {
            target: 'dna',
            op: 'create',
            defId: core?.id as string,
            valueJson: '"lõi"',
            tokenCount: 2,
            tokenizer: 't',
            source: 'system',
          },
        ],
      }),
    );
    expect(() => applyAs(admin, changeSet.id)).toThrow(expect.objectContaining({ rule: 'permission.denied' }));
    expect(applyAs(f.ownerActorId, changeSet.id)).toBe('applied');
    // người (actor user) tự đề xuất ⇒ luật owner-only cho AI không áp dụng (owner / admin như cũ)
    expect(applyAs(admin, sysPropose('values', admin))).toBe('applied');
  });
});
