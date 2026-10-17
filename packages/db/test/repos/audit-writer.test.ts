// Audit HMAC (DATABASE §9.6; Gen 2026-10-17 / DB v2.3.5: HMAC phủ MỌI cột trừ row_hash). Kiểm: danh sách cột = bảng thật,
// HKDF = RFC 5869 (vi phân với bản tay), sửa BẤT KỲ cột nào ⇒ lệch hash, chuỗi trên DB thật sạch, sửa lén ⇒ báo đúng dòng,
// thiếu khoá ⇒ no_key (không báo "bị sửa"), neo ngoài DB, niêm phong retention, xoay khoá.
import { createHmac, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AUDIT_HASHED_COLUMNS,
  type AuditHashInput,
  auditRowHash,
  deriveAuditKey,
  masterKeyring,
  verifyAuditChain,
} from '../../src/audit-writer/index.ts';
import { createFixture, type Fixture } from '../../src/repos/fixture/index.ts';
import { createSqliteStore } from '../../src/repos/sqlite/index.ts';
import type { AuditRow } from '../../src/repos/types.ts';

/** HKDF-SHA256 viết tay theo RFC 5869 (extract + expand) — bản đối chứng độc lập với node:crypto.hkdfSync. */
function hkdfManual(ikm: Buffer, salt: string, info: string, len: number): Buffer {
  const prk = createHmac('sha256', salt).update(ikm).digest();
  let t = Buffer.alloc(0);
  const out: Buffer[] = [];
  for (let i = 1; Buffer.concat(out).length < len; i++) {
    t = createHmac('sha256', prk)
      .update(Buffer.concat([t, Buffer.from(info, 'utf8'), Buffer.from([i])]))
      .digest();
    out.push(t);
  }
  return Buffer.concat(out).subarray(0, len);
}

let f: Fixture;
beforeEach(() => {
  f = createFixture({ roles: 1 });
});
afterEach(() => f.close());

const rows = () =>
  f.reader.db
    .prepare('SELECT * FROM audit_log WHERE workspace_id = ? ORDER BY display_seq')
    .all(f.workspaceId) as AuditRow[];
const tamper = (sql: string, ...params: unknown[]) =>
  f.writer.maintenance('test: sửa lén audit', (w) => w.run(sql, params), { actorId: f.systemActorId });

describe('audit-writer', () => {
  it('AUDIT_HASHED_COLUMNS = mọi cột của audit_log trừ row_hash (thêm cột mà quên ký ⇒ đỏ)', () => {
    const cols = (f.reader.db.prepare('SELECT name FROM pragma_table_info(?)').all('audit_log') as { name: string }[])
      .map((c) => c.name)
      .filter((c) => c !== 'row_hash')
      .sort();
    expect([...AUDIT_HASHED_COLUMNS].sort()).toEqual(cols);
  });

  it('HKDF = RFC 5869 viết tay; khoá khác nhau theo workspace', () => {
    const master = randomBytes(32);
    for (const ws of ['01JTN0000000000000000000W1', '01JTN0000000000000000000W2']) {
      expect(deriveAuditKey(master, ws).equals(hkdfManual(master, 'genagents-audit', `audit-chain:v1:${ws}`, 32))).toBe(
        true,
      );
    }
    expect(deriveAuditKey(master, 'a').equals(deriveAuditKey(master, 'b'))).toBe(false);
    expect(() => deriveAuditKey(randomBytes(16), 'a')).toThrow(RangeError);
  });

  it('sửa BẤT KỲ cột nào (kể cả NULL → giá trị, prev_hash) ⇒ row_hash khác', () => {
    const key = randomBytes(32);
    const row = rows()[1] as AuditRow;
    const base = row as unknown as AuditHashInput;
    const h0 = auditRowHash(key, base);
    expect(h0).toBe(auditRowHash(key, { ...base }));
    for (const c of AUDIT_HASHED_COLUMNS) {
      const v = base[c];
      const changed = v === null ? 'x' : typeof v === 'number' ? v + 1 : `${v}x`;
      expect(auditRowHash(key, { ...base, [c]: changed }), c).not.toBe(h0);
    }
  });

  it('chuỗi do repo ghi trên DB thật: sạch, đầu chuỗi = head()', () => {
    const r = verifyAuditChain(f.reader, f.auditKeys, f.workspaceId);
    expect(r.firstIssue).toBeNull();
    expect(r.checked).toBe(rows().length);
    expect(r.head).toEqual(
      f.store.read(f.workspaceId, (tx) => {
        const h = tx.audit.head();
        return h ? { displaySeq: h.displaySeq, rowHash: h.rowHash } : null;
      }),
    );
  });

  it('sửa lén một cột ⇒ hash_mismatch đúng dòng; sửa prev_hash ⇒ link_broken; xoá giữa ⇒ gap', () => {
    const target = rows()[2] as AuditRow;
    tamper('UPDATE audit_log SET reason = ? WHERE id = ?', 'sửa lén', target.id);
    expect(verifyAuditChain(f.reader, f.auditKeys, f.workspaceId).firstIssue).toEqual({
      displaySeq: target.display_seq,
      kind: 'hash_mismatch',
    });
    tamper('UPDATE audit_log SET reason = ? WHERE id = ?', target.reason, target.id);
    expect(verifyAuditChain(f.reader, f.auditKeys, f.workspaceId).firstIssue).toBeNull();
    tamper('UPDATE audit_log SET prev_hash = ? WHERE id = ?', 'f'.repeat(64), target.id);
    expect(verifyAuditChain(f.reader, f.auditKeys, f.workspaceId).firstIssue).toEqual({
      displaySeq: target.display_seq,
      kind: 'link_broken',
    });
    tamper('UPDATE audit_log SET prev_hash = ? WHERE id = ?', target.prev_hash, target.id);
    tamper('DELETE FROM audit_log WHERE id = ?', target.id);
    expect(verifyAuditChain(f.reader, f.auditKeys, f.workspaceId).firstIssue).toEqual({
      displaySeq: target.display_seq + 1,
      kind: 'gap',
    });
  });

  it('không có khoá ⇒ no_key (không kết luận bị sửa); neo ngoài DB lệch ⇒ anchor_mismatch', () => {
    const other = masterKeyring({ k9: randomBytes(32) }, 'k9');
    const r = verifyAuditChain(f.reader, other, f.workspaceId);
    expect(r.firstIssue?.kind).toBe('no_key');
    expect(r.noKey).toBe(rows().length);
    const head = rows().at(-1) as AuditRow;
    expect(
      verifyAuditChain(f.reader, f.auditKeys, f.workspaceId, {
        anchors: [{ displaySeq: head.display_seq, rowHash: head.row_hash }],
      }).firstIssue,
    ).toBeNull();
    expect(
      verifyAuditChain(f.reader, f.auditKeys, f.workspaceId, {
        anchors: [{ displaySeq: head.display_seq, rowHash: '0'.repeat(64) }],
      }).firstIssue,
    ).toEqual({ displaySeq: head.display_seq, kind: 'anchor_mismatch' });
    // neo trỏ quá đầu chuỗi (DB bị cắt đuôi) ⇒ anchor_mismatch
    expect(
      verifyAuditChain(f.reader, f.auditKeys, f.workspaceId, {
        anchors: [{ displaySeq: head.display_seq + 5, rowHash: '0'.repeat(64) }],
      }).firstIssue?.kind,
    ).toBe('anchor_mismatch');
  });

  it('retention: xoá đoạn đầu + dòng audit.sealed {deleted_through_seq, boundary_hash} ⇒ sạch; mốc sai ⇒ gap', () => {
    const all = rows();
    const cut = all[2] as AuditRow;
    tamper('DELETE FROM audit_log WHERE workspace_id = ? AND display_seq <= ?', f.workspaceId, cut.display_seq);
    f.store.write(f.systemActorId, (tx) =>
      tx.audit.append({
        action: 'audit.sealed',
        detail: { deleted_through_seq: cut.display_seq, boundary_hash: cut.row_hash },
      }),
    );
    expect(verifyAuditChain(f.reader, f.auditKeys, f.workspaceId).firstIssue).toBeNull();
    f.store.write(f.systemActorId, (tx) =>
      tx.audit.append({ action: 'audit.sealed', detail: { deleted_through_seq: cut.display_seq, boundary_hash: 'x' } }),
    );
    expect(verifyAuditChain(f.reader, f.auditKeys, f.workspaceId).firstIssue?.kind).toBe('gap');
  });

  it('xoay khoá: dòng mới ký bằng khoá mới, đoạn cũ kiểm bằng khoá cũ còn trong keyring', () => {
    const k2 = randomBytes(32);
    const old = f.auditKeys;
    const rotated = {
      currentKeyId: () => 'k2',
      key: (ws: string, id: string) => (id === 'k2' ? deriveAuditKey(k2, ws) : old.key(ws, id)),
    };
    const store2 = createSqliteStore({ writer: f.writer, reader: f.reader, auditKeys: rotated });
    store2.write(f.systemActorId, (tx) => tx.audit.append({ action: 'audit.key_rotated' }));
    expect(rows().at(-1)?.hash_key_id).toBe('k2');
    expect(verifyAuditChain(f.reader, rotated, f.workspaceId).firstIssue).toBeNull();
    const onlyNew = masterKeyring({ k2 }, 'k2');
    expect(verifyAuditChain(f.reader, onlyNew, f.workspaceId).firstIssue?.kind).toBe('no_key');
  });
});
