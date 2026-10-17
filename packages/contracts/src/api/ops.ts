import { z } from 'zod';
import { ACTOR_KINDS } from '../actors.ts';
import { parseDisplayId } from '../ids.ts';
import { REMOTE_ANCHOR_URL_RE, SETTING_WRITERS } from '../settings.ts';
import { UPDATE_STEPS, UpdaterStatus } from '../update.ts';
import { READABLE_PREFIXES } from './access.ts';
import { WorkspaceView } from './auth.ts';
import {
  AnyId,
  API_LIMITS,
  ConfirmName,
  DisplayId,
  IanaTimezone,
  IdOf,
  idShape,
  Job,
  Json,
  KeyStr,
  Lang,
  list,
  Nat,
  PageOf,
  pageQueryShape,
  queryInt,
  queryList,
  Ref,
  SecretInput,
  str,
  Ts,
} from './common.ts';
import { accepted, binary, csv, defineLane, noContent, ok, type RequestParts, sse } from './define.ts';
import { gridOfPrefix, gridSelectionIssues } from './grid-columns.ts';
import {
  ColumnName,
  GRID_OFFSET_MAX,
  GRID_PAGE_MAX,
  GRID_PREFIX,
  GridInfo,
  GridKey,
  GridLocate,
  GridRowsPage,
  gridSelectShape,
} from './grids.ts';
import { Redacted } from './masking.ts';
import { LogLine, LogLineEvent } from './sse.ts';

// L-OPS — cài đặt, cập nhật, backup, audit, log, brain-export, lưới chung / Data Console (BACKEND-TRIAL §3.6: 36 route).
// Data Console (STD-07) nằm trong MVP dùng thử (owner chốt 2026-10-17): OPS-32…36 + `grids.ts` phủ grid phân trang keyset,
// lọc (ô truy vấn §8), sắp xếp, nhóm, chọn cột, view dựng sẵn, footer Σ, xuất CSV, mở bản ghi cho thanh công thức.
// Luật lưới chung: SỬA Ô KHÔNG CÓ ROUTE CHUNG — `GridColumn.editRouteId` trỏ route ghi của lane sở hữu (SYS-38, SYS-48, OPS-03…).

const ops = defineLane('L-OPS');

/** `secrets.kind`, `egress_rules.applies_to`, `audit_log.result`. */
export const SECRET_ROW_KINDS = [
  'engine_api_key',
  'telegram_bot_token',
  'backup_target',
  'integration_token',
  'mfa_totp',
  'anchor_remote_token',
] as const;
export const EGRESS_APPLIES_TO = ['all_roles', 'role', 'position', 'tool'] as const;
export const AUDIT_RESULTS = ['ok', 'denied', 'error'] as const;

const SETTING_SECTIONS = [
  'general',
  'access',
  'role_defaults',
  'economy',
  'security',
  'backup',
  'update',
  'log',
] as const;

/** Khoá `settings` (registry `SETTINGS`): chữ thường + `_` + `.`. Khoá không có trong registry ⇒ `404 not_found`. */
const SettingKeyStr = str(64, 1)
  .regex(/^[a-z][a-z0-9_.]{0,63}$/)
  .meta({ example: 'purge.grace_days' });

// ---------------------------------------------------------------- OPS-01 health
export const OPS_01 = ops({
  id: 'OPS-01',
  method: 'GET',
  path: '/health',
  auth: 'public',
  o4: 'open',
  // Không cần phiên.
  response: ok(
    z.strictObject({
      status: z.enum(['ok', 'degraded']),
      version: str(64, 1),
      components: z.strictObject({ db: KeyStr, supervisor: KeyStr, updater: KeyStr }),
    }),
  ),
  cli: ['host status', 'healthcheck của install'],
});

// ---------------------------------------------------------------- OPS-02…05 cài đặt (A6)
/** Mặc định của khoá: có giá trị, `seed` (do bước dựng workspace ghi), hoặc `absent` (thiếu hàng ⇒ tính năng tắt). */
const SettingDefault = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('value'), value: Json }),
  z.strictObject({ kind: z.literal('seed') }),
  z.strictObject({ kind: z.literal('absent') }),
]);

export const SettingRow = z.strictObject({
  key: SettingKeyStr,
  displayId: DisplayId('ST').nullable(),
  value: Json,
  default: SettingDefault,
  overridden: z.boolean(),
  writers: list(z.enum(SETTING_WRITERS), SETTING_WRITERS.length),
  writable: z.boolean(),
  locked: z.enum(['harness_fixed', 'core_agent_locked']).nullable(),
  // Viewer: `value` và `default.value` bị che (chỉ thấy khoá, writers, trạng thái) — V_MASKED_FIELDS.
  redacted: Redacted,
});

export const OPS_02 = ops({
  id: 'OPS-02',
  method: 'GET',
  path: '/settings',
  auth: 'V',
  o4: 'blocked',
  request: { query: z.strictObject({ section: z.enum(SETTING_SECTIONS).optional() }) },
  // Registry `SETTINGS` + hàng ghi đè.
  response: ok(
    z.strictObject({
      settings: list(SettingRow, 200),
      workspace: z.strictObject({ name: str(80, 1), lang: Lang, timezone: IanaTimezone }),
    }),
  ),
  cli: ['settings'],
});

export const OPS_03 = ops({
  id: 'OPS-03',
  method: 'PATCH',
  path: '/settings/{settingKey}',
  auth: 'A',
  // Khoá mà admin không ghi được (`settingWritableBy(key, 'admin') = false`, vd `backup.remote_anchor`) ⇒ chỉ owner.
  ownerWhen: { rule: 'setting_writers' },
  o4: 'blocked',
  request: {
    params: z.strictObject({ settingKey: SettingKeyStr }),
    // Kiểm bằng `SETTINGS[key].schema` trước khi ghi.
    body: z.strictObject({ value: Json }),
  },
  response: ok(SettingRow),
  // `db.settings_invalid`: vd trần tự báo ≥ sàn che giấu.
  errors: ['db.settings_invalid'],
  cli: ['settings set'],
});

export const OPS_04 = ops({
  id: 'OPS-04',
  method: 'PATCH',
  path: '/workspace',
  auth: 'A',
  o4: 'blocked',
  request: {
    body: z.strictObject({ name: str(80, 1).optional(), lang: Lang.optional(), timezone: IanaTimezone.optional() }),
  },
  response: ok(z.strictObject({ workspace: WorkspaceView })),
  cli: ['settings set workspace.*'],
});

export const OPS_05 = ops({
  id: 'OPS-05',
  method: 'GET',
  path: '/secrets',
  auth: 'A',
  o4: 'blocked',
  // CHỈ mask (`last4`), không bao giờ có giá trị secret.
  response: ok(
    list(
      z.strictObject({
        ...idShape('SEC'),
        kind: z.enum(SECRET_ROW_KINDS),
        label: str(120),
        last4: str(4, 1),
        allowedHost: str(253, 1).nullable(),
        usedBy: list(AnyId, 64),
        createdAt: Ts,
      }),
    ),
  ),
  cli: ['secrets'],
});

// ---------------------------------------------------------------- OPS-06…08 egress
const EgressRow = z.strictObject({
  ...idShape('EG'),
  domainPattern: str(253, 1),
  port: z.number().int().min(1).max(65_535).nullable(),
  appliesTo: z.enum(EGRESS_APPLIES_TO),
  target: AnyId.nullable(),
  action: z.enum(['allow', 'deny']),
  isBuiltin: z.boolean(),
  note: str(500).nullable(),
});
const DomainPattern = str(253, 1)
  .regex(/^(?:\*\.)?[a-z0-9][a-z0-9.-]{0,252}$/)
  .meta({ example: 'example.org' });

export const OPS_06 = ops({
  id: 'OPS-06',
  method: 'GET',
  path: '/egress-rules',
  auth: 'V',
  o4: 'blocked',
  response: ok(list(EgressRow)),
  cli: ['egress'],
});

export const OPS_07 = ops({
  id: 'OPS-07',
  method: 'POST',
  path: '/egress-rules',
  auth: 'A',
  // Thêm luật `allow` = mở đường cho dữ liệu đi ra ⇒ NỚI hàng rào ⇒ owner (Gen, fail-closed). Thêm `deny` = siết ⇒ A.
  // Dịch vụ còn PHẢI kiểm `appliesTo` khớp đích (roleRef / positionRef / toolSlug) và đích cùng workspace (HANDLER-OBLIGATIONS #2).
  ownerWhen: { in: 'body', field: 'action', equals: 'allow' },
  writesAccessPolicy: ['egress_rules'],
  o4: 'blocked',
  request: {
    body: z.strictObject({
      domainPattern: DomainPattern,
      port: z.number().int().min(1).max(65_535).optional(),
      appliesTo: z.enum(EGRESS_APPLIES_TO),
      roleRef: Ref('RL').optional(),
      positionRef: Ref('PS').optional(),
      toolSlug: KeyStr.optional(),
      action: z.enum(['allow', 'deny']),
      note: str(500, 1).optional(),
    }),
  },
  // Kèm job `egress_compile`.
  response: ok(EgressRow.extend({ job: Job })),
  cli: ['egress add'],
});

export const OPS_08 = ops({
  id: 'OPS-08',
  method: 'DELETE',
  path: '/egress-rules/{egressRef}',
  auth: 'A',
  // Xoá luật `deny` = nới ⇒ owner; xoá luật `allow` = siết ⇒ A. Chiều do luật ĐÃ LƯU quyết định: dịch vụ tra DB theo ref rồi gọi
  // `requiredAccess(route, { stored: { egressAction } })`; thiếu thông tin ⇒ O (fail-closed). Luật `isBuiltin` không xoá được.
  ownerWhen: { rule: 'egress_loosen' },
  writesAccessPolicy: ['egress_rules'],
  o4: 'blocked',
  request: { params: z.strictObject({ egressRef: Ref('EG') }) },
  // `conflict` khi `isBuiltin`.
  response: noContent(),
  cli: ['egress rm'],
});

// ---------------------------------------------------------------- OPS-09…11 neo audit ngoài máy
const RemoteAnchorState = z.strictObject({
  state: z.enum(['none', 'ok', 'error']),
  host: str(253, 1).nullable(),
  lastPushAt: Ts.nullable(),
  error: KeyStr.nullable(),
});

export const OPS_09 = ops({
  id: 'OPS-09',
  method: 'GET',
  path: '/remote-anchor',
  auth: 'A',
  o4: 'blocked',
  response: ok(RemoteAnchorState),
  cli: ['anchor'],
});

export const OPS_10 = ops({
  id: 'OPS-10',
  method: 'PUT',
  path: '/remote-anchor',
  auth: 'O',
  touchesCredential: true,
  o4: 'blocked',
  // `token` CHỈ trong body (bắt buộc khi đổi host — dịch vụ kiểm, `validation.failed` `token_required`). CLI: ô ẩn.
  request: {
    body: z.strictObject({
      url: str(2048, 1).regex(REMOTE_ANCHOR_URL_RE).meta({ example: 'https://example.org/anchor.git' }),
      token: SecretInput('anchor_token').optional(),
    }),
  },
  response: ok(RemoteAnchorState),
  errorReasons: { 'validation.failed': ['not_https', 'userinfo', 'no_path', 'token_required'] },
  cli: ['anchor set', 'anchor change'],
});

export const OPS_11 = ops({
  id: 'OPS-11',
  method: 'DELETE',
  path: '/remote-anchor',
  auth: 'O',
  touchesCredential: true,
  o4: 'blocked',
  response: noContent(),
  cli: ['anchor remove'],
});

// ---------------------------------------------------------------- OPS-12…16 cập nhật (A7)
const UpdateRunStatus = z.enum(['running', 'succeeded', 'rolled_back', 'failed']);

export const OPS_12 = ops({
  id: 'OPS-12',
  method: 'GET',
  path: '/update',
  auth: 'V',
  o4: 'open',
  response: ok(
    UpdaterStatus.extend({
      changelog: list(z.strictObject({ version: str(64, 1), notes: str(8000) }), 100),
      compatFloor: str(64, 1),
      migrations: list(z.strictObject({ version: str(64, 1), appliedAt: Ts }), 500),
    }),
  ),
  cli: ['version'],
});

export const OPS_13 = ops({
  id: 'OPS-13',
  method: 'POST',
  path: '/update/check',
  auth: 'A',
  o4: 'open',
  // `conflict` khi đang chạy.
  response: ok(UpdaterStatus),
  cli: ['version check'],
});

export const OPS_14 = ops({
  id: 'OPS-14',
  method: 'POST',
  path: '/update/start',
  // Cập nhật bản của chính hệ thống chạy mã mới có quyền lớn nhất ⇒ owner (Gen: mọi update / pin = owner). Kiểm feed (OPS-13) giữ A.
  auth: 'O',
  o4: 'open',
  // Lệnh đóng `start_update` (không tham số); rồi SSE `update.step`.
  response: accepted(UpdaterStatus),
  cli: ['version update', 'host update'],
});

export const OPS_15 = ops({
  id: 'OPS-15',
  method: 'POST',
  path: '/update/rollback',
  auth: 'O',
  o4: 'open',
  // Bước 2 ConfirmModal: gõ version cũ. Lệnh đóng `rollback_previous` (updater tự chọn bản; KHÔNG nhận version / URL).
  // `conflict` khi không có bản cũ ≥ sàn.
  request: { body: z.strictObject({ confirmVersion: str(64, 1) }) },
  response: accepted(UpdaterStatus),
  errors: ['confirm.mismatch'],
  cli: ['version rollback', 'host rollback'],
});

export const OPS_16 = ops({
  id: 'OPS-16',
  method: 'GET',
  path: '/update/runs',
  auth: 'V',
  o4: 'open',
  response: ok(
    list(
      z.strictObject({
        ...idShape('UR'),
        trigger: z.enum(['auto', 'manual', 'rollback']),
        fromVersion: str(64, 1),
        toVersion: str(64, 1),
        status: UpdateRunStatus,
        steps: list(
          z.strictObject({
            step: z.enum(UPDATE_STEPS),
            state: z.enum(['pending', 'running', 'done', 'failed', 'rolled_back']),
            at: Ts,
          }),
          16,
        ),
        startedAt: Ts,
        endedAt: Ts.nullable(),
      }),
      200,
    ),
  ),
  cli: ['version history'],
});

// ---------------------------------------------------------------- OPS-17…19 backup, đăng nhập lại
export const OPS_17 = ops({
  id: 'OPS-17',
  method: 'GET',
  path: '/backups',
  auth: 'A',
  o4: 'blocked',
  // Backup KHÔNG chứa `/auth` (credential CLI hãng): `includesAuth` luôn `false` (contract test giữ).
  response: ok(
    list(
      z.strictObject({
        ...idShape('BK'),
        kind: z.enum(['scheduled', 'manual', 'pre_update']),
        sizeBytes: Nat,
        createdAt: Ts,
        includesAuth: z.literal(false),
        path: str(512, 1),
      }),
      200,
    ),
  ),
  cli: ['backups'],
});

export const OPS_18 = ops({
  id: 'OPS-18',
  method: 'POST',
  path: '/backups',
  auth: 'A',
  o4: 'blocked',
  // `conflict` khi đang chạy.
  response: accepted(z.strictObject({ backup: IdOf('BK'), job: Job })),
  cli: ['backup --now', 'host backup'],
});

export const OPS_19 = ops({
  id: 'OPS-19',
  method: 'GET',
  path: '/relogin-required',
  auth: 'V',
  o4: 'open',
  // `v_relogin_required`.
  response: ok(
    list(
      z.strictObject({
        account: IdOf('EN'),
        consumer: z.strictObject({ kind: z.enum(['system', 'role']), role: IdOf('RL').nullable() }),
        isCoreAgent: z.boolean(),
        lastCheck: Ts.nullable(),
      }),
      200,
    ),
  ),
  cli: ['relogin-list', 'dash'],
});

// ---------------------------------------------------------------- OPS-20…25 audit và log (A8)
const AuditFilters = {
  roleRef: Ref('RL').optional(),
  actor: str(120, 1).optional(),
  // Cho phép `*` cuối: `dna_field.*` → `LIKE 'dna\_field.%'`.
  action: str(128, 1).optional(),
  tool: str(64, 1).optional(),
  result: z.enum(AUDIT_RESULTS).optional(),
  from: Ts.optional(),
  to: Ts.optional(),
} as const;

const AuditRow = z.strictObject({
  ...idShape('AU'),
  at: Ts,
  role: IdOf('RL').nullable(),
  actor: z.strictObject({ kind: z.enum(ACTOR_KINDS), display: str(120) }),
  action: str(128, 1),
  tool: str(64, 1).nullable(),
  result: z.enum(AUDIT_RESULTS),
  tokens: Nat.nullable(),
  costMicroUsd: Nat.nullable(),
});

export const OPS_20 = ops({
  id: 'OPS-20',
  method: 'GET',
  path: '/audit',
  auth: 'V',
  o4: 'open',
  request: { query: z.strictObject({ ...AuditFilters, ...pageQueryShape() }) },
  // `chain` = kết quả kiểm chuỗi băm (OPS-22 ghi `brokenAt`, `untrustedRows` vào đây).
  response: ok(
    PageOf(AuditRow).extend({
      chain: z.strictObject({
        state: z.enum(['valid', 'broken', 'unchecked', 'no_key']),
        anchoredAt: Ts.nullable(),
        head: IdOf('AU').nullable(),
        mode: z.enum(['basic', 'anchored']),
        brokenAt: IdOf('AU').nullable(),
        untrustedRows: Nat,
      }),
    }),
  ),
  cli: ['audit'],
});

const HexHash = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[0-9a-f]+$/)
  .meta({ example: 'a'.repeat(64) });

export const OPS_21 = ops({
  id: 'OPS-21',
  method: 'GET',
  path: '/audit/{auditRef}',
  auth: 'V',
  o4: 'open',
  request: { params: z.strictObject({ auditRef: Ref('AU') }) },
  response: ok(
    AuditRow.extend({
      // Viewer: `before = after = null`, chỉ có `changedKeys` (V_MASKED_FIELDS).
      before: Json,
      after: Json,
      changedKeys: list(KeyStr, 200),
      redacted: Redacted,
      prevHash: HexHash,
      rowHash: HexHash,
      keyId: str(64, 1),
      sameRequest: list(IdOf('AU'), 200),
      usedAsEvidence: list(IdOf('LG'), 200),
    }),
  ),
  cli: ['audit show'],
});

export const OPS_22 = ops({
  id: 'OPS-22',
  method: 'POST',
  path: '/audit/verify',
  auth: 'A',
  o4: 'open',
  // Kết quả nằm ở `chain` của OPS-20 (`brokenAt`, `untrustedRows`).
  response: accepted(z.strictObject({ job: Job })),
  cli: ['audit verify'],
});

export const OPS_23 = ops({
  id: 'OPS-23',
  method: 'GET',
  path: '/audit/export',
  auth: 'A',
  o4: 'open',
  // Bộ lọc như OPS-20 (không phân trang). `text/csv` + header `X-Content-SHA256`; ô công thức được thoát (xem grids.ts).
  request: { query: z.strictObject(AuditFilters) },
  response: csv({ formulaEscape: true, maxRows: API_LIMITS.csvMaxRows }),
  cli: ['audit export --out'],
});

export const OPS_24 = ops({
  id: 'OPS-24',
  method: 'GET',
  path: '/logs/stream',
  auth: 'A',
  o4: 'open',
  request: { query: z.strictObject({ container: Ref('CT'), level: KeyStr.optional() }) },
  // SSE `log.line`; `message` đã che.
  response: sse(LogLineEvent),
  cli: ['applog -f'],
});

export const OPS_25 = ops({
  id: 'OPS-25',
  method: 'GET',
  path: '/logs',
  auth: 'A',
  o4: 'open',
  request: {
    query: z.strictObject({
      container: Ref('CT'),
      since: Ts.optional(),
      until: Ts.optional(),
      q: str(200, 1).optional(),
      ...pageQueryShape(),
    }),
  },
  // Đọc tệp JSONL (không phải DB).
  response: ok(PageOf(LogLine)),
  cli: ['applog'],
});

// ---------------------------------------------------------------- OPS-26…31 brain-export (A10)
const BrainSide = z.strictObject({
  lastExportAt: Ts.nullable(),
  drift: z.enum(['none', 'detected']),
  driftFiles: Nat,
});
const BrainParams = z.strictObject({ roleRef: Ref('RL') });
const AGE_RECIPIENT_RE = /^age1[0-9a-z]{58}$/;

export const OPS_26 = ops({
  id: 'OPS-26',
  method: 'GET',
  path: '/brains',
  auth: 'V',
  o4: 'blocked',
  request: { query: z.strictObject({ roleRef: Ref('RL').optional() }) },
  response: ok(
    list(
      z.strictObject({
        role: IdOf('RL'),
        person: BrainSide,
        position: BrainSide,
        sensitivePackAt: Ts.nullable(),
      }),
    ),
  ),
  cli: ['brain-export status'],
});

export const OPS_27 = ops({
  id: 'OPS-27',
  method: 'POST',
  path: '/brains/{roleRef}/export',
  auth: 'A',
  o4: 'blocked',
  request: { params: BrainParams },
  response: accepted(z.strictObject({ job: Job })),
  cli: ['brain-export export'],
});

export const OPS_28 = ops({
  id: 'OPS-28',
  method: 'POST',
  path: '/brains/{roleRef}/overwrite',
  auth: 'A',
  o4: 'blocked',
  request: { params: BrainParams, body: z.strictObject({ confirmName: ConfirmName }) },
  // "Ghi đè theo DB".
  response: accepted(z.strictObject({ job: Job })),
  errors: ['confirm.mismatch'],
  cli: ['brain-export overwrite'],
});

export const OPS_29 = ops({
  id: 'OPS-29',
  method: 'POST',
  path: '/brains/{roleRef}/import',
  auth: 'A',
  o4: 'blocked',
  request: { params: BrainParams },
  // Parse → JSON Schema → change set, duyệt như đề xuất AI. `validation.failed`: `detail.field`.
  response: ok(z.strictObject({ changeSet: IdOf('CS') })),
  cli: ['brain-export import'],
});

export const OPS_30 = ops({
  id: 'OPS-30',
  method: 'POST',
  path: '/brains/{roleRef}/purge-history',
  auth: 'O',
  o4: 'blocked',
  request: { params: BrainParams, body: z.strictObject({ confirmName: ConfirmName }) },
  // Viết lại lịch sử repo, bỏ PII.
  response: accepted(z.strictObject({ job: Job })),
  errors: ['confirm.mismatch'],
  cli: ['brain-export purge-history'],
});

export const OPS_31 = ops({
  id: 'OPS-31',
  method: 'POST',
  path: '/brains/{roleRef}/sensitive-pack',
  auth: 'O',
  o4: 'blocked',
  // Gói `age` (nằm ngoài git). Cách owner giữ khoá: CHƯA CHỐT (L-OPS + Gen). `recipient` = khoá CÔNG KHAI age, không phải secret.
  request: {
    params: BrainParams,
    body: z.strictObject({
      recipient: z
        .string()
        .length(62)
        .regex(AGE_RECIPIENT_RE)
        .meta({ example: `age1${'q'.repeat(58)}` }),
    }),
  },
  response: binary(),
  cli: ['brain-export pack --recipient --out'],
});

// ---------------------------------------------------------------- OPS-32…36 lưới chung / Data Console, bản ghi, tìm kiếm
const GridParams = z.strictObject({ gridKey: GridKey });

/** Kiểm CHÉO (M8): `cols` / `sort` / `group` / tên trường trong `q` phải thuộc `GRID_COLUMNS[gridKey]`; tên lạ ⇒ lỗi. */
function refineGridSelection(req: RequestParts): string[] {
  const grid = GridKey.safeParse(req.params.gridKey);
  if (!grid.success) return [];
  const { q, sort, cols, group, offset, cursor } = req.query as {
    q?: string;
    sort?: string[];
    cols?: string[];
    group?: string;
    offset?: number;
    cursor?: string;
  };
  const issues = gridSelectionIssues(grid.data, { q, sort, cols, group });
  // Hai cách phân trang không trộn: `offset` (truy cập ngẫu nhiên theo chỉ số) XOR `cursor` (keyset tuần tự).
  if (offset !== undefined && cursor !== undefined) issues.push('offset và cursor loại trừ nhau');
  return issues;
}

/** OPS-37: cùng whitelist với OPS-33 cho `q` / `sort`; `displayId` phải mang prefix của CHÍNH lưới (hàng lưới khác không bao giờ ở đây). */
function refineLocate(req: RequestParts): string[] {
  const grid = GridKey.safeParse(req.params.gridKey);
  if (!grid.success) return [];
  const { q, sort, displayId } = req.query as { q?: string; sort?: string[]; displayId?: string };
  const issues = gridSelectionIssues(grid.data, { q, sort });
  const parsed = displayId === undefined ? null : parseDisplayId(displayId);
  if (!parsed || parsed.prefix !== GRID_PREFIX[grid.data])
    issues.push(`displayId: không phải mã hàng của lưới ${grid.data}`);
  return issues;
}

/** OPS-35: có `cols` thì phải biết lưới của bản ghi — mã hiển thị mang prefix; ULID không mang ⇒ handler kiểm lại sau khi tra prefix THẬT. */
function refineRecordCols(req: RequestParts): string[] {
  const { cols } = req.query as { cols?: string[] };
  if (!cols) return [];
  const parsed = parseDisplayId(String(req.params.recordRef));
  if (!parsed) return [];
  const grid = gridOfPrefix(parsed.prefix);
  if (!grid) return [`cols: prefix ${parsed.prefix} không có lưới, không có whitelist cột`];
  return gridSelectionIssues(grid, { cols });
}

export const OPS_32 = ops({
  id: 'OPS-32',
  method: 'GET',
  path: '/grids',
  auth: 'V',
  o4: 'blocked',
  // Sinh từ whitelist DATABASE §8.2 (L-OPS); kèm cột, view dựng sẵn, route ghi từng cột (`editRouteId`).
  response: ok(list(GridInfo, 64)),
  cli: ['grid --list'],
});

export const OPS_33 = ops({
  id: 'OPS-33',
  method: 'GET',
  path: '/grids/{gridKey}/rows',
  auth: 'V',
  o4: 'blocked',
  request: {
    params: GridParams,
    query: z.strictObject({
      ...gridSelectShape,
      // Nhóm theo cột (toolbar "Group"): hàng sort theo cột nhóm trước; `groups` trả số hàng mỗi nhóm.
      group: ColumnName.optional(),
      // Truy cập ngẫu nhiên theo chỉ số hàng (DataGrid `fetchRange(start, limit)`); loại trừ `cursor`. Lý do chọn: xem GRID_OFFSET_MAX.
      offset: queryInt(0, GRID_OFFSET_MAX).optional(),
      ...pageQueryShape(GRID_PAGE_MAX),
    }),
    refine: refineGridSelection,
  },
  // Hai chế độ: `cursor` = keyset `(sort_col, display_seq)` tuần tự (không OFFSET); `offset` = nhảy tới chỉ số bất kỳ (≤ GRID_OFFSET_MAX).
  // ≤ 500 hàng / trang. Chạy connection chỉ đọc, trần thời gian 2 giây. `total` / `footer` / `groups` do máy chủ tính trên TOÀN tập khớp.
  response: ok(GridRowsPage),
  errors: ['query.invalid'],
  cli: ['grid'],
});

export const OPS_34 = ops({
  id: 'OPS-34',
  method: 'GET',
  path: '/grids/{gridKey}/export',
  auth: 'V',
  o4: 'blocked',
  // Chạy đúng cùng truy vấn với OPS-33 (không `offset` / `cursor`: luôn từ đầu). Handler PHẢI ghi THEO LUỒNG (đọc từng khối từ connection chỉ
  // đọc, ghi ngay, tôn trọng backpressure) — KHÔNG gom cả tệp vào bộ nhớ; cắt ở `maxRows` (API_LIMITS.csvMaxRows) kèm dòng báo cắt;
  // hash `X-Content-SHA256` tính dần trong khi ghi (trailer) hoặc ở tệp tạm; ghi nhật ký audit một lần mỗi lần xuất. Chạy đúng cùng truy vấn; `text/csv` + `X-Content-SHA256`; ô công thức được thoát.
  request: { params: GridParams, query: z.strictObject(gridSelectShape), refine: refineGridSelection },
  response: csv({ formulaEscape: true, maxRows: API_LIMITS.csvMaxRows }),
  errors: ['query.invalid'],
  cli: ['grid --csv'],
});

export const OPS_35 = ops({
  id: 'OPS-35',
  method: 'GET',
  path: '/records/{recordRef}',
  auth: 'V',
  o4: 'blocked',
  request: {
    // Chỉ prefix đọc được (`READABLE_PREFIXES`): US / SEC / BK ⇒ 404 như ref lạ. ULID: dịch vụ tra prefix THẬT rồi
    // `effectiveReadAuth(route, prefix)` (HANDLER-OBLIGATIONS #1, #8).
    params: z.strictObject({ recordRef: Ref(READABLE_PREFIXES) }),
    query: z.strictObject({ cols: queryList(ColumnName, 64, 'status').optional() }),
    refine: refineRecordCols,
  },
  // Mọi prefix của `ENTITY_TYPES`. Thanh công thức / Inspector / giá trị đích của Soi.
  response: ok(
    z.strictObject({
      entityType: str(64, 1),
      table: str(64, 1),
      ...AnyId.shape,
      label: str(200),
      version: Nat.nullable(),
      // Chỉ cột whitelist.
      fields: z.record(ColumnName, Json).refine((o) => Object.keys(o).length <= 64, 'quá nhiều cột'),
      routeHint: KeyStr,
      redacted: Redacted,
    }),
  ),
  cli: ['show <ID>', 'REPL (giá trị đích Soi)'],
});

export const OPS_36 = ops({
  id: 'OPS-36',
  method: 'GET',
  path: '/search',
  auth: 'V',
  o4: 'blocked',
  request: { query: z.strictObject({ q: str(200, 1), limit: queryInt(1, 50).optional() }) },
  // `search_documents`; hiểu mã cũ qua `id_aliases`.
  response: ok(
    list(
      z.strictObject({
        entityType: str(64, 1),
        ...AnyId.shape,
        label: str(200),
        snippet: str(500),
        routeHint: KeyStr,
        redacted: Redacted,
      }),
      50,
    ),
  ),
  cli: ['search'],
});

export const OPS_37 = ops({
  id: 'OPS-37',
  method: 'GET',
  path: '/grids/{gridKey}/locate',
  auth: 'V',
  o4: 'blocked',
  request: {
    params: GridParams,
    query: z.strictObject({
      // Mã hàng cần định vị (đúng prefix của lưới — `refineLocate`).
      displayId: z
        .string()
        .max(20)
        .regex(/^[A-Z]{2,3}-\d{4,12}$/)
        .meta({ example: 'RL-0001' }),
      // Cùng `q` / `view` / `sort` như OPS-33 để chỉ số khớp đúng thứ tự đang xem (không `cols` / `group` / phân trang).
      q: gridSelectShape.q,
      view: gridSelectShape.view,
      sort: gridSelectShape.sort,
    }),
    refine: refineLocate,
  },
  // `index` = COUNT số hàng đứng trước theo khoá keyset `(sort…, display_seq)` trên cùng bộ lọc. Quyền đọc hiệu lực như OPS-33
  // (`effectiveReadAuth`); hàng không đọc được ⇒ `gone` (không lộ sự tồn tại).
  response: ok(GridLocate),
  errors: ['query.invalid'],
  noCli: 'vị trí hàng chỉ phục vụ lưới ảo hoá của giao diện; CLI đọc tuần tự bằng `grid`',
});

export const OPS_ROUTES = [
  OPS_01,
  OPS_02,
  OPS_03,
  OPS_04,
  OPS_05,
  OPS_06,
  OPS_07,
  OPS_08,
  OPS_09,
  OPS_10,
  OPS_11,
  OPS_12,
  OPS_13,
  OPS_14,
  OPS_15,
  OPS_16,
  OPS_17,
  OPS_18,
  OPS_19,
  OPS_20,
  OPS_21,
  OPS_22,
  OPS_23,
  OPS_24,
  OPS_25,
  OPS_26,
  OPS_27,
  OPS_28,
  OPS_29,
  OPS_30,
  OPS_31,
  OPS_32,
  OPS_33,
  OPS_34,
  OPS_35,
  OPS_36,
  OPS_37,
] as const;
