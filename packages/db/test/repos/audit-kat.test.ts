// Audit HMAC — vector đáp án biết trước (KAT) tính ĐỘC LẬP với src: cột lấy từ DDL baseline (không từ AUDIT_HASHED_COLUMNS),
// HKDF viết tay theo RFC 5869, JCS viết tay cho giá trị chuỗi / số nguyên / null, thông điệp UTF-8(JCS(hàng)) (CHANGELOG v2.3.5).
// Không dùng fixture (ghi audit) ⇒ đột biến danh sách cột / thông điệp / info HKDF đỏ qua dòng assert, không qua ngoại lệ.
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import {
  AUDIT_HASHED_COLUMNS,
  type AuditHashInput,
  auditRowHash,
  deriveAuditKey,
} from '../../src/audit-writer/index.ts';

const BASELINE = fileURLToPath(new URL('../../migrations/sqlite/0001_baseline.sql', import.meta.url));

/** Cột của audit_log theo DDL baseline (dựng bảng trong DB nhớ tạm, đọc pragma) — nguồn độc lập với src. */
function auditColumnsFromDdl(): string[] {
  const sql = readFileSync(BASELINE, 'utf8');
  const start = sql.indexOf('CREATE TABLE audit_log (');
  const end = sql.indexOf('\n);', start);
  expect(start).toBeGreaterThanOrEqual(0);
  const db = new Database(':memory:');
  try {
    db.exec(`${sql.slice(start, end)}\n);`);
    return (db.prepare('SELECT name FROM pragma_table_info(?)').all('audit_log') as { name: string }[]).map(
      (c) => c.name,
    );
  } finally {
    db.close();
  }
}

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

/** JCS (RFC 8785) cho object phẳng giá trị chuỗi ASCII / số nguyên / null: khoá sắp theo code unit, không khoảng trắng. */
const jcsFlat = (o: Record<string, string | number | null>) =>
  `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${JSON.stringify(o[k])}`)
    .join(',')}}`;

const WS = '01JTN0000000000000000000W1';
const MASTER = Buffer.from(Array.from({ length: 32 }, (_, i) => i)); // = MASTER của bộ test Python (bytes(range(32)))

function sampleRow(cols: string[], prevHash: string | null): Record<string, string | number | null> {
  const row: Record<string, string | number | null> = {};
  cols.forEach((c, i) => {
    row[c] = i % 3 === 0 ? null : i % 3 === 1 ? `v${i}` : i;
  });
  Object.assign(row, { id: '01JTN0000000000000000000A1', workspace_id: WS, display_seq: 2, prev_hash: prevHash });
  return row;
}

describe('audit HMAC — KAT độc lập', () => {
  it('danh sách cột ký = mọi cột của audit_log trong DDL baseline trừ row_hash', () => {
    const cols = auditColumnsFromDdl().filter((c) => c !== 'row_hash');
    expect(cols.length).toBeGreaterThan(20);
    expect([...AUDIT_HASHED_COLUMNS].sort()).toEqual([...cols].sort());
  });

  it('row_hash = HMAC(HKDF(master, "genagents-audit", "audit-chain:v1:" ‖ ws), UTF-8(JCS(mọi cột trừ row_hash, kể cả prev_hash)))', () => {
    const cols = auditColumnsFromDdl().filter((c) => c !== 'row_hash');
    const key = hkdfManual(MASTER, 'genagents-audit', `audit-chain:v1:${WS}`, 32);
    for (const prev of ['ab'.repeat(32), null]) {
      const row = sampleRow(cols, prev);
      const want = createHmac('sha256', key).update(jcsFlat(row), 'utf8').digest('hex');
      expect(auditRowHash(deriveAuditKey(MASTER, WS), row as AuditHashInput), String(prev)).toBe(want);
    }
  });
});
