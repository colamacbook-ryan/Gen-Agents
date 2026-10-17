// Seeder chống IDOR cho các prefix của L-HR (CHỈ TEST): DN, IN, PS, RV, SN, AV, AT. Tách tệp riêng để không đụng bản đồ chung
// của `seeders.ts` (một dòng spread). Dựng hàng THẬT qua repo bằng actor owner của tenant; riêng AT chưa có repo đính kèm
// nên ghi bằng `world.writer.write` (đường ghi hợp lệ duy nhất; cấp display_id bằng allocateDisplayId của @ga/db/ids).
import { randomBytes } from 'node:crypto';
import type { EntityPrefix } from '@ga/contracts';
import { createKysely, stampInsert } from '@ga/db';
import { allocateDisplayId, newUlid } from '@ga/db/ids';
import type { RoleRow, WriteTx } from '@ga/db/repos';
import type { CrossTenantSeeder, SeedContext, Seeded } from './seeders.ts';

let seq = 0;
const ownerWrite = <T>(c: SeedContext, fn: (tx: WriteTx) => T): T =>
  c.world.store.write(c.tenant.users.owner.actorId, fn, { channel: 'web' });

/** Role cha: dùng Role đã seed trong cùng request (quan hệ cha–con), không có thì tạo mới. */
function roleFor(c: SeedContext, tx: WriteTx): RoleRow {
  const seeded = c.seeded.get('RL');
  const existing = seeded === undefined ? null : tx.roles.get(seeded.id);
  return existing ?? tx.roles.create({ name: `HR seed ${c.tenant.key} ${++seq}`, color: 'jade' });
}

/** Một trường DNA không lõi, chưa có ở Role ⇒ tạo qua change set (áp ngay). */
function ensureDna(tx: WriteTx, role: RoleRow, text: string) {
  const have = new Set(tx.dna.fields(role.id).map((f) => f.def_id));
  const def = tx.dna
    .defs()
    .find(
      (d) =>
        d.is_core === 0 && d.is_list === 0 && d.value_type === 'text' && d.is_identity_locked === 0 && !have.has(d.id),
    );
  if (def === undefined) throw new Error('seeder DN: hết định nghĩa DNA không lõi để tạo');
  const { changeSet } = tx.changeSets.propose({
    scope: 'role',
    roleId: role.id,
    title: 'seed dna',
    items: [
      {
        target: 'dna',
        op: 'create',
        defId: def.id,
        valueJson: JSON.stringify(text),
        tokenCount: 1,
        tokenizer: 'seed',
        source: 'owner',
      },
    ],
  });
  const applied = tx.changeSets.apply(changeSet.id);
  const field = tx.dna.fields(role.id).find((f) => f.def_id === def.id);
  if (field === undefined) throw new Error('seeder DN: không thấy trường vừa tạo');
  return { field, applied };
}

const seedDna: CrossTenantSeeder = (c) =>
  ownerWrite(c, (tx) => {
    const { field } = ensureDna(tx, roleFor(c, tx), 'seed');
    return { id: field.id, displayId: field.display_id };
  });

const seedInstruction: CrossTenantSeeder = (c) =>
  ownerWrite(c, (tx) => {
    const role = roleFor(c, tx);
    const ordinal = tx.instructions.list({ roleId: role.id, layer: 'style' }).length + 1;
    const { changeSet } = tx.changeSets.propose({
      scope: 'role',
      roleId: role.id,
      title: 'seed instruction',
      items: [
        {
          target: 'instruction',
          op: 'create',
          layer: 'style',
          ordinal,
          name: `Seed ${++seq}`,
          content: 'seed',
          tokenCount: 1,
          tokenizer: 'seed',
          source: 'owner',
        },
      ],
    });
    tx.changeSets.apply(changeSet.id);
    const row = tx.instructions
      .list({ roleId: role.id, layer: 'style' })
      .sort((a, b) => b.display_seq - a.display_seq)[0];
    if (row === undefined) throw new Error('seeder IN: không thấy khối vừa tạo');
    return { id: row.id, displayId: row.display_id };
  });

/** Hàng MỚI mỗi lần gọi (display_id khác nhau: bộ kiểm IDOR cần hàng của B không trùng display_id của A). Chưa có repo ghi positions. */
const seedPosition: CrossTenantSeeder = (c) => {
  const ws = c.tenant.workspaceId;
  const actorId = c.tenant.users.owner.actorId;
  const db = createKysely(c.world.writer);
  return c.world.writer.write(actorId, (w) => {
    const id = newUlid(c.world.clock);
    const d = allocateDisplayId(w, ws, 'PS');
    w.run(
      db.insertInto('positions').values(
        stampInsert(w, {
          id,
          workspace_id: ws,
          display_id: d.displayId,
          display_seq: d.displaySeq,
          title: `Seed position ${++seq}`,
        }),
      ),
    );
    return { id, displayId: d.displayId };
  });
};

/** Mỗi lần gọi tạo thêm MỘT revision của Role (RV thứ hai trong cùng request = cùng Role với RV đầu: SYS-42 cần cùng phạm vi). */
const seedRevision: CrossTenantSeeder = (c) =>
  ownerWrite(c, (tx) => {
    const prior = c.seeded.get('RV');
    const priorRole = prior === undefined ? null : tx.revisions.get(prior.id)?.role_id;
    const role = priorRole ? (tx.roles.get(priorRole) ?? roleFor(c, tx)) : roleFor(c, tx);
    const fields = tx.dna.fields(role.id, { status: 'active' });
    let rev: Seeded;
    const first = fields[0];
    if (first === undefined) {
      const { applied } = ensureDna(tx, role, 'seed');
      rev = { id: applied.revision.id, displayId: applied.revision.display_id };
    } else {
      const value = JSON.stringify(`seed ${++seq}`);
      const { changeSet } = tx.changeSets.propose({
        scope: 'role',
        roleId: role.id,
        title: 'seed revision',
        items: [
          {
            target: 'dna',
            op: 'update',
            dnaFieldId: first.id,
            baseVersion: first.version,
            valueJson: value,
            tokenCount: 1,
          },
        ],
      });
      const applied = tx.changeSets.apply(changeSet.id);
      rev = { id: applied.revision.id, displayId: applied.revision.display_id };
    }
    return rev;
  });

/** Nhân vật MỚI mỗi lần gọi (chibi tối thiểu, đang bật). Chưa có repo thêm skin_assets. */
const seedSkin: CrossTenantSeeder = (c) => {
  const ws = c.tenant.workspaceId;
  const actorId = c.tenant.users.owner.actorId;
  const db = createKysely(c.world.writer);
  return c.world.writer.write(actorId, (w) => {
    const id = newUlid(c.world.clock);
    const d = allocateDisplayId(w, ws, 'SN');
    const code = `seed${++seq}`;
    w.run(
      db.insertInto('skin_assets').values(
        stampInsert(w, {
          id,
          workspace_id: ws,
          display_id: d.displayId,
          display_seq: d.displaySeq,
          pack_slug: 'seed-pack',
          pack_version: '1.0.0',
          asset_code: code,
          asset_kind: 'chibi' as const,
          name_vi: `Seed ${code}`,
          sha256: randomBytes(32).toString('hex'),
          source: 'seed',
          license: 'seed',
          params_json: JSON.stringify({ id: code, schema: 1 }),
          params_schema_version: 1,
          char_kind: 'civil' as const,
          gender: 'male' as const,
        }),
      ),
    );
    return { id, displayId: d.displayId };
  });
};

const seedAvatar: CrossTenantSeeder = (c) =>
  ownerWrite(c, (tx) => {
    const { avatar } = tx.avatar.assignMonogram(roleFor(c, tx).id);
    return { id: avatar.id, displayId: avatar.display_id };
  });

/** Đính kèm (AT): chưa có repo ⇒ ghi blob + message_attachments qua đường write hợp lệ; scan_status mặc định 'pending'. */
const seedAttachment: CrossTenantSeeder = (c) => {
  const ws = c.tenant.workspaceId;
  const actorId = c.tenant.users.owner.actorId;
  const db = createKysely(c.world.writer);
  return c.world.writer.write(actorId, (w) => {
    const sha = randomBytes(32).toString('hex');
    const blobId = newUlid(c.world.clock);
    const id = newUlid(c.world.clock);
    w.run(
      db.insertInto('blobs').values(
        stampInsert(w, {
          id: blobId,
          workspace_id: ws,
          sha256: sha,
          size_bytes: 1,
          mime: 'image/png',
          storage_path: `/data/blobs/${ws}/${sha.slice(0, 2)}/${sha.slice(2, 4)}/${sha}`,
        }),
      ),
    );
    const d = allocateDisplayId(w, ws, 'AT');
    w.run(
      db.insertInto('message_attachments').values(
        stampInsert(w, {
          id,
          workspace_id: ws,
          display_id: d.displayId,
          display_seq: d.displaySeq,
          blob_id: blobId,
          file_name: 'seed.png',
          mime: 'image/png',
          size_bytes: 1,
          sha256: sha,
          uploaded_by: actorId,
        }),
      ),
    );
    return { id, displayId: d.displayId };
  });
};

/**
 * Seeder con cần Role cha: bộ kiểm IDOR gieo Role (RL) TRƯỚC rồi truyền qua `seeded` để DN / IN / RV / AV thuộc đúng Role đó
 * (quan hệ cha–con của HANDLER-OBLIGATIONS #2 — đối chứng của tenant A phải dùng được, không 404 vì lệch cha).
 */
export const SEEDER_PARENTS: Readonly<Partial<Record<EntityPrefix, EntityPrefix>>> = Object.freeze({
  DN: 'RL',
  IN: 'RL',
  RV: 'RL',
  AV: 'RL',
});

export const HR_SEEDERS: Readonly<Partial<Record<EntityPrefix, CrossTenantSeeder>>> = Object.freeze({
  DN: seedDna,
  IN: seedInstruction,
  PS: seedPosition,
  RV: seedRevision,
  SN: seedSkin,
  AV: seedAvatar,
  AT: seedAttachment,
});
