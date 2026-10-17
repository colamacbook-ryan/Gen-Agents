// Audit — chuỗi HMAC theo workspace (DATABASE §9.6). App nối chuỗi trong giao dịch ghi (writer duy nhất ⇒ thứ tự tất định):
//   K_audit  = HKDF-SHA256(master_key, salt = "genagents-audit", info = "audit-chain:v1:" ‖ workspace_id), 32 byte;
//   row_hash = HMAC-SHA256(K_audit, UTF-8(JCS(MỌI cột trừ row_hash))), hex — CHANGELOG v2.3.5 (pG): prev_hash nằm TRONG hàng đã
//   băm (không nối tiền tố riêng như bản §9 cũ); khớp audit_mac của bộ test Python.
// JCS gồm MỌI cột của audit_log trừ row_hash — kể cả prev_hash và cột NULL (khoá vẫn có mặt, giá trị null), khoá sắp
// theo JCS (Gen 2026-10-17, DB v2.3.5: "HMAC audit phủ MỌI cột trừ row_hash"; bỏ tập AUDIT_COLS rút gọn cũ của bộ test
// Python). Test `audit-writer` đối chiếu danh sách cột với PRAGMA table_info(audit_log): thêm cột mà không thêm vào đây ⇒ đỏ.
// Tiền tố prev_hash giữ nguyên công thức DATABASE §9.6 (thừa nhưng vô hại). Lane DB ghi danh sách cột chính thức vào
// CHANGELOG v2.3.5 — lệch thì sửa AUDIT_HASHED_COLUMNS / auditHashMessage cho khớp.
// DB tự kiểm liên kết (trigger audit_log_chain: prev_hash = row_hash dòng display_seq − 1); khoá HMAC chỉ app có ⇒ người
// sửa file DB không có .env không tính lại được chuỗi. verifyAuditChain = phần "dựng lại chuỗi bằng khoá" của job
// integrity_check (L-OPS gọi): báo dòng ĐẦU TIÊN lệch; thiếu khoá ⇒ 'no_key' (không báo nhầm là bị sửa — BUILD-PLAN §B.9).
import { createHmac, hkdfSync } from 'node:crypto';
import { canonicalJson } from '@ga/contracts';
import type { AppConnection, StatementRunner, WriteContext } from '../connection.ts';
import { allocateDisplayId } from '../ids/index.ts';
import { dml } from '../repos/sql.ts';
import type { AuditRow } from '../repos/types.ts';
import { stampInsert } from '../stamp.ts';

export const AUDIT_HKDF_SALT = 'genagents-audit';
export const AUDIT_HKDF_INFO_PREFIX = 'audit-chain:v1:';
const KEY_BYTES = 32;

/** K_audit của một workspace từ master key (≥ 32 byte). */
export function deriveAuditKey(masterKey: Buffer, workspaceId: string): Buffer {
  if (!Buffer.isBuffer(masterKey) || masterKey.length < 32) throw new RangeError('master key phải ≥ 32 byte');
  return Buffer.from(
    hkdfSync('sha256', masterKey, AUDIT_HKDF_SALT, `${AUDIT_HKDF_INFO_PREFIX}${workspaceId}`, KEY_BYTES),
  );
}

/**
 * Nguồn khoá HMAC audit. `currentKeyId` ghi vào hash_key_id của dòng mới; `key` trả khoá của (workspace, keyId) hoặc null
 * khi không có (khoá cũ đã mất / restore sang máy mới thiếu master key) — bộ kiểm báo 'no_key', không báo "bị sửa".
 */
export interface AuditKeyring {
  currentKeyId(): string;
  key(workspaceId: string, keyId: string): Buffer | null;
}

/** Keyring từ các master key theo keyId (xoay khoá = thêm keyId mới, đặt làm hiện hành; khoá cũ giữ để kiểm đoạn cũ). */
export function masterKeyring(keys: Readonly<Record<string, Buffer>>, currentKeyId: string): AuditKeyring {
  if (keys[currentKeyId] === undefined) throw new RangeError(`keyring thiếu khoá hiện hành ${currentKeyId}`);
  const cache = new Map<string, Buffer>();
  return {
    currentKeyId: () => currentKeyId,
    key: (workspaceId, keyId) => {
      const master = keys[keyId];
      if (master === undefined) return null;
      const k = `${keyId}\u0000${workspaceId}`;
      let derived = cache.get(k);
      if (!derived) {
        derived = deriveAuditKey(master, workspaceId);
        cache.set(k, derived);
      }
      return derived;
    },
  };
}

/** Cột đưa vào JCS (thứ tự không quan trọng — JCS sắp khoá). */
export const AUDIT_HASHED_COLUMNS = [
  'id',
  'workspace_id',
  'display_id',
  'display_seq',
  'created_at',
  'created_by',
  'actor_id',
  'actor_label',
  'actor_kind',
  'action',
  'result',
  'role_id',
  'entity_type',
  'entity_id',
  'entity_display_id',
  'before_json',
  'after_json',
  'detail_json',
  'reason',
  'tool',
  'session_id',
  'task_id',
  'channel',
  'request_id',
  'ip_hash',
  'tokens_total',
  'cost_micro_usd',
  'hash_key_id',
  'prev_hash',
] as const;
export type AuditHashedColumn = (typeof AUDIT_HASHED_COLUMNS)[number];
export type AuditHashInput = { [K in AuditHashedColumn]: string | number | null };

/** Thông điệp được ký: JCS({mọi cột trừ row_hash}) (prev_hash là một cột trong đó) — cột thiếu / undefined ⇒ null. */
export function auditHashMessage(row: AuditHashInput): string {
  const body: Record<string, string | number | null> = {};
  for (const c of AUDIT_HASHED_COLUMNS) body[c] = row[c] ?? null;
  return canonicalJson(body);
}

export function auditRowHash(key: Buffer, row: AuditHashInput): string {
  return createHmac('sha256', key).update(auditHashMessage(row), 'utf8').digest('hex');
}

/** Dòng audit cần ghi (repo dựng từ actor giao dịch + WriteOptions + mục audit). */
export interface AuditDraft {
  actorLabel: string;
  actorKind: AuditRow['actor_kind'];
  action: string;
  result: AuditRow['result'];
  roleId: string | null;
  entityType: string | null;
  entityId: string | null;
  entityDisplayId: string | null;
  beforeJson: string | null;
  afterJson: string | null;
  detailJson: string | null;
  reason: string | null;
  tool: string | null;
  sessionId: string | null;
  taskId: string | null;
  channel: AuditRow['channel'];
  requestId: string;
  ipHash: string | null;
  tokensTotal: number | null;
  costMicroUsd: number | null;
}

/**
 * Nối một dòng vào chuỗi của workspace trong giao dịch ghi `w`: cấp AU- (bộ đếm), đọc đầu chuỗi, tính HMAC, INSERT.
 * actor_id = created_by = actor giao dịch (DB ép = app_actor()). Thiếu khoá hiện hành ⇒ throw (không ghi audit không ký).
 */
export function appendAuditRow(
  w: WriteContext,
  keyring: AuditKeyring,
  input: { workspaceId: string; id: string; createdAt: string; draft: AuditDraft },
): AuditRow {
  const keyId = keyring.currentKeyId();
  const key = keyring.key(input.workspaceId, keyId);
  if (key === null) throw new RangeError(`không có khoá audit ${keyId} cho workspace ${input.workspaceId}`);
  const { displaySeq, displayId } = allocateDisplayId(w, input.workspaceId, 'AU');
  const prev =
    displaySeq === 1
      ? null
      : (w.get<{ row_hash: string }>('SELECT row_hash FROM audit_log WHERE workspace_id = ? AND display_seq = ?', [
          input.workspaceId,
          displaySeq - 1,
        ])?.row_hash ?? null);
  const d = input.draft;
  // created_by = actor của giao dịch (stampInsert — không nhận từ người gọi; DB ép = app_actor())
  const base: Omit<AuditHashInput, 'created_by'> = {
    id: input.id,
    workspace_id: input.workspaceId,
    display_id: displayId,
    display_seq: displaySeq,
    created_at: input.createdAt,
    actor_id: w.actorId,
    actor_label: d.actorLabel,
    actor_kind: d.actorKind,
    action: d.action,
    result: d.result,
    role_id: d.roleId,
    entity_type: d.entityType,
    entity_id: d.entityId,
    entity_display_id: d.entityDisplayId,
    before_json: d.beforeJson,
    after_json: d.afterJson,
    detail_json: d.detailJson,
    reason: d.reason,
    tool: d.tool,
    session_id: d.sessionId,
    task_id: d.taskId,
    channel: d.channel,
    request_id: d.requestId,
    ip_hash: d.ipHash,
    tokens_total: d.tokensTotal,
    cost_micro_usd: d.costMicroUsd,
    hash_key_id: keyId,
    prev_hash: prev,
  };
  const row: AuditHashInput = stampInsert(w, base);
  const rowHash = auditRowHash(key, row);
  const cols = [...AUDIT_HASHED_COLUMNS, 'row_hash'];
  const values = [...AUDIT_HASHED_COLUMNS.map((c) => row[c]), rowHash];
  const [out] = dml(w).write(
    `INSERT INTO audit_log (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) RETURNING *`,
    values,
  ).rows as AuditRow[];
  if (out === undefined) throw new RangeError('audit_log: INSERT không trả hàng');
  return out;
}

export interface AuditChainIssue {
  displaySeq: number;
  /** hash_mismatch: dòng bị sửa (HMAC lệch) · link_broken: prev_hash ≠ row_hash dòng trước · gap: thiếu dòng / mốc niêm
   *  phong lệch · no_key: không có khoá để kiểm (không kết luận "bị sửa") · anchor_mismatch: lệch bản neo ngoài DB. */
  kind: 'hash_mismatch' | 'link_broken' | 'gap' | 'no_key' | 'anchor_mismatch';
}

export interface AuditChainReport {
  workspaceId: string;
  checked: number;
  /** Dòng cuối đã kiểm (đầu chuỗi). */
  head: { displaySeq: number; rowHash: string } | null;
  /** Vấn đề ĐẦU TIÊN (null = sạch). */
  firstIssue: AuditChainIssue | null;
  /** Số dòng không kiểm được vì thiếu khoá. */
  noKey: number;
}

export interface AuditAnchor {
  displaySeq: number;
  rowHash: string;
}

/**
 * Dựng lại chuỗi bằng khoá (job integrity_check). Đọc theo display_seq trên kết nối bất kỳ (nên dùng kết nối đọc).
 * Retention: nếu dòng đầu còn lại có display_seq > 1 thì phải có dòng 'audit.sealed' với
 * detail_json {deleted_through_seq, boundary_hash} khớp (DATABASE §9.6). `anchors` = các bản neo tìm được (backup, repo neo).
 */
export function verifyAuditChain(
  source: Pick<AppConnection, 'db'> | Pick<StatementRunner, 'all'>,
  keyring: AuditKeyring,
  workspaceId: string,
  opts: { anchors?: readonly AuditAnchor[] } = {},
): AuditChainReport {
  const sql = 'SELECT * FROM audit_log WHERE workspace_id = ? ORDER BY display_seq';
  const rows =
    'db' in source ? (source.db.prepare(sql).all(workspaceId) as AuditRow[]) : source.all<AuditRow>(sql, [workspaceId]);
  const report: AuditChainReport = { workspaceId, checked: 0, head: null, firstIssue: null, noKey: 0 };
  const issue = (displaySeq: number, kind: AuditChainIssue['kind']) => {
    if (report.firstIssue === null) report.firstIssue = { displaySeq, kind };
  };
  let prevSeq: number | null = null;
  let prevHash: string | null = null;
  for (const row of rows) {
    if (prevSeq === null) {
      if (row.display_seq === 1) {
        if (row.prev_hash !== null) issue(row.display_seq, 'link_broken');
      } else {
        const sealed = sealedBoundary(rows);
        if (
          sealed === null ||
          sealed.deletedThroughSeq !== row.display_seq - 1 ||
          sealed.boundaryHash !== row.prev_hash
        ) {
          issue(row.display_seq, 'gap');
        }
      }
    } else if (row.display_seq !== prevSeq + 1) {
      issue(row.display_seq, 'gap');
    } else if (row.prev_hash !== prevHash) {
      issue(row.display_seq, 'link_broken');
    }
    const key = keyring.key(workspaceId, row.hash_key_id);
    if (key === null) {
      report.noKey++;
      issue(row.display_seq, 'no_key');
    } else {
      const expect = auditRowHash(key, row as unknown as AuditHashInput);
      if (expect !== row.row_hash) issue(row.display_seq, 'hash_mismatch');
    }
    report.checked++;
    prevSeq = row.display_seq;
    prevHash = row.row_hash;
  }
  if (prevSeq !== null && prevHash !== null) report.head = { displaySeq: prevSeq, rowHash: prevHash };
  const bySeq = new Map(rows.map((x) => [x.display_seq, x.row_hash]));
  for (const a of opts.anchors ?? []) {
    const got = bySeq.get(a.displaySeq);
    // neo trỏ tới dòng đã niêm phong (retention) thì không đối chiếu được ⇒ bỏ qua; dòng còn mà lệch hash ⇒ báo
    if (got !== undefined && got !== a.rowHash) issue(a.displaySeq, 'anchor_mismatch');
    if (got === undefined && a.displaySeq > (prevSeq ?? 0)) issue(a.displaySeq, 'anchor_mismatch');
  }
  return report;
}

function sealedBoundary(rows: readonly AuditRow[]): { deletedThroughSeq: number; boundaryHash: string } | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    // chỉ tin mốc niêm phong do actor system ghi (repo chặn người khác ghi 'audit.*')
    if (row?.action !== 'audit.sealed' || row.actor_kind !== 'system' || row.detail_json === null) continue;
    const d = JSON.parse(row.detail_json) as { deleted_through_seq?: unknown; boundary_hash?: unknown };
    if (typeof d.deleted_through_seq === 'number' && typeof d.boundary_hash === 'string') {
      return { deletedThroughSeq: d.deleted_through_seq, boundaryHash: d.boundary_hash };
    }
  }
  return null;
}
