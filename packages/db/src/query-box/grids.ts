// Whitelist trường theo lưới (DATABASE §8.2 — bản đầy đủ là hằng số TS ở đây, kèm test). Tên cột / biểu thức SQL CHỈ lấy
// từ đây (không bao giờ từ chuỗi người dùng); giá trị luôn là tham số bind. Alias tiếng Việt không dấu cho tên trường và
// giá trị enum. Enum lấy từ CHECK của DB (generated/enums.ts) ⇒ một nguồn với schema.
import { ENTITY_TYPES, type EntityPrefix } from '@ga/contracts';
import { DB_ENUMS } from '../generated/enums.ts';

export type FieldType =
  /** giá trị trong tập CHECK (+ alias vi) */
  | 'enum'
  /** so bằng chuỗi; `*` cuối ⇒ LIKE tiền tố (escape % _ \) */
  | 'text'
  /** display_seq: số trần hoặc mã của lưới (MM-0041); so sánh */
  | 'seq'
  /** số; so sánh */
  | 'number'
  /** ₲ người dùng nhập ⇒ minor × 100 */
  | 'money'
  /** thời điểm: ngày (theo múi giờ workspace) / -7d / khoảng a..b */
  | 'ts'
  /** 0 / 1 */
  | 'bool'
  /** Role theo tên (name_norm) hoặc RL-xxxx */
  | 'role'
  /** tham chiếu display_id của bảng khác (vd SS-0004 ⇒ ULID) */
  | 'ref';

export interface FieldDef {
  /** Tên tiếng Anh trước, sau đó alias tiếng Việt không dấu. */
  names: readonly string[];
  /** Biểu thức SQL trên alias `t` (hằng số do code viết). */
  sql: string;
  type: FieldType;
  enumValues?: readonly (string | number)[];
  /** alias giá trị (vi không dấu / tên gọi) ⇒ giá trị DB. */
  valueAliases?: Readonly<Record<string, string>>;
  /** type 'ref': bảng đích của display_id. */
  refTable?: string;
  /** type 'text': mẫu SQL hằng số với đúng một `?` (vd EXISTS qua bảng phụ) thay cho `sql = ?`. */
  eqSql?: string;
  /** type 'role': mẫu SQL hằng số chứa `{ROLE_IDS}` (tập id Role khớp) thay cho `sql IN ({ROLE_IDS})`. */
  roleSql?: string;
  /** Cho phép sắp xếp (cột NOT NULL — keyset an toàn). */
  sortable?: boolean;
}

export interface GridDef {
  prefix: EntityPrefix;
  table: string;
  /** Bảng có deleted_at ⇒ tự thêm `deleted_at IS NULL`. */
  softDelete: boolean;
  /** entity_type trong search_documents cho text tự do (null = lưới không có FTS). */
  textEntity: EntityPrefix | null;
  fields: readonly FieldDef[];
}

const e = (key: keyof typeof DB_ENUMS) => DB_ENUMS[key] as readonly (string | number)[];

const STATUS_VI: Readonly<Record<string, string>> = {
  'hoat-dong': 'active',
  'de-xuat': 'proposed',
  'bi-thay': 'superseded',
  'loi-thoi': 'obsolete',
  'dang-chay': 'running',
  xong: 'done',
  'that-bai': 'failed',
  huy: 'cancelled',
  'cho-duyet': 'waiting_approval',
  'can-lam': 'todo',
  mo: 'open',
};
const SOURCE_VI: Readonly<Record<string, string>> = { ai: 'ai_inferred', 'chu-so-huu': 'owner', 'he-thong': 'system' };

/** Alias dùng chung lọc theo tập giá trị thật của cột (alias trỏ vào giá trị cột không có ⇒ bỏ, không đoán). */
function aliasesFor(
  values: readonly (string | number)[],
  map: Readonly<Record<string, string>>,
): Record<string, string> {
  const ok = new Set(values.map(String));
  return Object.fromEntries(Object.entries(map).filter(([, v]) => ok.has(v)));
}

/** Trường chung của lưới 16–37 (tên theo hợp đồng API, không alias vi): id, created (sort được), updated. */
function plain(updated: boolean): FieldDef[] {
  const out: FieldDef[] = [
    { names: ['id'], sql: 't.display_seq', type: 'seq' },
    { names: ['created'], sql: 't.created_at', type: 'ts', sortable: true },
  ];
  if (updated) out.push({ names: ['updated'], sql: 't.updated_at', type: 'ts' });
  return out;
}

/** Trường chung cho mọi lưới: id (display_seq), created, updated. */
function common(updated: boolean): FieldDef[] {
  const out: FieldDef[] = [
    { names: ['id'], sql: 't.display_seq', type: 'seq' },
    { names: ['created', 'tao'], sql: 't.created_at', type: 'ts', sortable: true },
  ];
  if (updated) out.push({ names: ['updated', 'sua'], sql: 't.updated_at', type: 'ts' });
  return out;
}

export const GRIDS: Readonly<Record<string, GridDef>> = {
  RL: {
    prefix: 'RL',
    table: 'roles',
    softDelete: true,
    textEntity: 'RL',
    fields: [
      ...common(true),
      { names: ['name', 'ten'], sql: 't.name_norm', type: 'text' },
      {
        names: ['status', 'trang-thai'],
        sql: 't.lifecycle_status',
        type: 'enum',
        enumValues: e('roles.lifecycle_status'),
        valueAliases: { nhap: 'draft', 'luu-tru': 'archived', 'tam-ngung': 'suspended', 'co-the': 'carded' },
      },
      { names: ['run', 'chay'], sql: 't.runtime_state', type: 'enum', enumValues: e('roles.runtime_state') },
      {
        names: ['condition', 'the-trang'],
        sql: 't.condition',
        type: 'enum',
        enumValues: e('roles.condition'),
        valueAliases: { 'trong-thuong': 'wounded' },
      },
      { names: ['color', 'mau'], sql: 't.color', type: 'enum', enumValues: e('roles.color') },
    ],
  },
  DN: {
    prefix: 'DN',
    table: 'dna_fields',
    softDelete: true,
    textEntity: 'DN',
    fields: [
      ...common(true),
      { names: ['role', 'vai'], sql: 't.role_id', type: 'role' },
      {
        names: ['source', 'nguon'],
        sql: 't.source',
        type: 'enum',
        enumValues: e('dna_fields.source'),
        valueAliases: aliasesFor(e('dna_fields.source'), SOURCE_VI),
      },
      {
        names: ['status', 'trang-thai'],
        sql: 't.status',
        type: 'enum',
        enumValues: e('dna_fields.status'),
        valueAliases: aliasesFor(e('dna_fields.status'), STATUS_VI),
      },
      { names: ['prompt'], sql: 't.is_in_prompt', type: 'bool' },
      { names: ['tokens'], sql: 't.token_count', type: 'number' },
      {
        names: ['key', 'khoa'],
        sql: '(SELECT d.key FROM dna_field_defs d WHERE d.id = t.def_id)',
        type: 'text',
      },
      {
        names: ['group', 'nhom'],
        sql: '(SELECT d.field_group FROM dna_field_defs d WHERE d.id = t.def_id)',
        type: 'enum',
        enumValues: e('dna_field_defs.field_group'),
      },
      {
        names: ['tier', 'tang'],
        sql: '(SELECT d.tier FROM dna_field_defs d WHERE d.id = t.def_id)',
        type: 'enum',
        enumValues: e('dna_field_defs.tier'),
      },
      { names: ['confirmed', 'xac-nhan'], sql: '(t.confirmed_at IS NOT NULL)', type: 'bool' },
    ],
  },
  IN: {
    prefix: 'IN',
    table: 'instructions',
    softDelete: true,
    textEntity: 'IN',
    fields: [
      ...common(true),
      { names: ['role', 'vai'], sql: 't.role_id', type: 'role' },
      {
        names: ['layer', 'lop'],
        sql: 't.layer',
        type: 'enum',
        enumValues: e('instructions.layer'),
        valueAliases: {
          'gia-tri': 'values',
          'noi-quy': 'house_rules',
          'tinh-cach': 'persona',
          'phong-cach': 'style',
          'truy-cau': 'drive',
          'vi-tri': 'position',
        },
      },
      {
        names: ['cond', 'dieu-kien'],
        sql: 't.condition_kind',
        type: 'enum',
        enumValues: e('instructions.condition_kind'),
      },
      { names: ['engine'], sql: 't.engine_scope', type: 'text' },
      { names: ['on', 'bat'], sql: 't.is_enabled', type: 'bool' },
      { names: ['tokens'], sql: 't.token_count', type: 'number' },
      {
        names: ['source', 'nguon'],
        sql: 't.source',
        type: 'enum',
        enumValues: e('instructions.source'),
        valueAliases: aliasesFor(e('instructions.source'), SOURCE_VI),
      },
      {
        names: ['status', 'trang-thai'],
        sql: 't.status',
        type: 'enum',
        enumValues: e('instructions.status'),
        valueAliases: aliasesFor(e('instructions.status'), STATUS_VI),
      },
    ],
  },
  TK: {
    prefix: 'TK',
    table: 'tasks',
    softDelete: true,
    textEntity: 'TK',
    fields: [
      ...common(true),
      { names: ['role', 'vai'], sql: 't.assignee_role_id', type: 'role' },
      {
        names: ['status', 'trang-thai'],
        sql: 't.status',
        type: 'enum',
        enumValues: e('tasks.status'),
        valueAliases: aliasesFor(e('tasks.status'), STATUS_VI),
      },
      { names: ['due', 'han'], sql: 't.due_at', type: 'ts' },
      { names: ['source', 'kenh'], sql: 't.source', type: 'enum', enumValues: e('tasks.source') },
      { names: ['priority', 'uu-tien'], sql: 't.priority', type: 'enum', enumValues: e('tasks.priority') },
      { names: ['verified', 'danh-gia'], sql: 't.verification', type: 'enum', enumValues: e('tasks.verification') },
    ],
  },
  CM: {
    prefix: 'CM',
    table: 'commitments',
    softDelete: true,
    textEntity: 'CM',
    fields: [
      ...common(true),
      { names: ['role', 'vai'], sql: 't.promised_by_role_id', type: 'role' },
      {
        names: ['status', 'trang-thai'],
        sql: 't.status',
        type: 'enum',
        enumValues: e('commitments.status'),
        valueAliases: aliasesFor(e('commitments.status'), STATUS_VI),
      },
      { names: ['due', 'han'], sql: 't.due_at', type: 'ts', sortable: true },
      { names: ['source', 'kenh'], sql: 't.source', type: 'enum', enumValues: e('commitments.source') },
    ],
  },
  LG: {
    prefix: 'LG',
    table: 'ledger_entries',
    softDelete: false,
    textEntity: null,
    fields: [
      ...common(false),
      { names: ['role', 'vai'], sql: 't.role_id', type: 'role' },
      {
        names: ['type', 'loai'],
        sql: 't.entry_type',
        type: 'enum',
        enumValues: e('ledger_entries.entry_type'),
        valueAliases: { thuong: 'reward', phat: 'penalty', cap: 'grant', dao: 'reversal' },
      },
      { names: ['amount', 'so-tien'], sql: 't.amount_minor', type: 'money', sortable: true },
      { names: ['task', 'viec'], sql: 't.task_id', type: 'ref', refTable: 'tasks' },
      { names: ['class', 'hang'], sql: 't.penalty_class', type: 'enum', enumValues: e('ledger_entries.penalty_class') },
    ],
  },
  AU: {
    prefix: 'AU',
    table: 'audit_log',
    softDelete: false,
    textEntity: null,
    fields: [
      ...common(false),
      { names: ['role', 'vai'], sql: 't.role_id', type: 'role' },
      { names: ['actor'], sql: 't.actor_label', type: 'text' },
      { names: ['action', 'hanh-dong'], sql: 't.action', type: 'text' },
      {
        names: ['result', 'ket-qua'],
        sql: 't.result',
        type: 'enum',
        enumValues: e('audit_log.result'),
        valueAliases: { 'tu-choi': 'denied', loi: 'error' },
      },
      { names: ['tool'], sql: 't.tool', type: 'text' },
      { names: ['channel', 'kenh'], sql: 't.channel', type: 'enum', enumValues: e('audit_log.channel') },
    ],
  },
  EV: {
    prefix: 'EV',
    table: 'events',
    softDelete: false,
    textEntity: null,
    fields: [
      ...common(false),
      { names: ['role', 'vai'], sql: 't.role_id', type: 'role' },
      { names: ['kind', 'loai'], sql: 't.kind', type: 'text' },
      { names: ['severity', 'muc'], sql: 't.severity', type: 'enum', enumValues: e('events.severity') },
    ],
  },
  CAP: {
    prefix: 'CAP',
    table: 'capabilities',
    softDelete: true,
    textEntity: null,
    fields: [
      ...common(true),
      { names: ['account', 'tai-khoan'], sql: 't.engine_account_id', type: 'ref', refTable: 'engine_accounts' },
      { names: ['kind', 'loai'], sql: 't.kind', type: 'enum', enumValues: e('capabilities.kind') },
      { names: ['state', 'trang-thai'], sql: 't.value_state', type: 'enum', enumValues: e('capabilities.value_state') },
      { names: ['confidence', 'tin-cay'], sql: 't.confidence', type: 'enum', enumValues: e('capabilities.confidence') },
    ],
  },
  MM: {
    prefix: 'MM',
    table: 'memories',
    softDelete: true,
    textEntity: 'MM',
    fields: [
      ...common(true),
      { names: ['role', 'vai'], sql: 't.role_id', type: 'role' },
      {
        names: ['scope', 'pham-vi'],
        sql: 't.scope',
        type: 'enum',
        enumValues: e('memories.scope'),
        valueAliases: { 'vi-tri': 'position', 'ca-nhan': 'personal' },
      },
      {
        names: ['kind', 'loai'],
        sql: 't.kind',
        type: 'enum',
        enumValues: e('memories.kind'),
        valueAliases: {
          'cam-ket': 'commitment',
          'bai-hoc': 'lesson',
          'quy-trinh': 'procedure',
          nguoi: 'person',
          'su-that': 'fact',
        },
      },
      {
        names: ['status', 'trang-thai'],
        sql: 't.status',
        type: 'enum',
        enumValues: e('memories.status'),
        valueAliases: aliasesFor(e('memories.status'), STATUS_VI),
      },
      { names: ['conf', 'tin-cay'], sql: 't.confidence', type: 'number' },
      { names: ['source', 'nguon'], sql: 't.source_type', type: 'enum', enumValues: e('memories.source_type') },
      { names: ['ref'], sql: 't.source_session_id', type: 'ref', refTable: 'sessions' },
      { names: ['sens', 'nhay-cam'], sql: 't.sensitivity', type: 'enum', enumValues: e('memories.sensitivity') },
    ],
  },
  SK: {
    prefix: 'SK',
    table: 'skills',
    softDelete: true,
    textEntity: 'SK',
    fields: [
      ...common(true),
      {
        names: ['role', 'vai'],
        sql: 't.id',
        type: 'role',
        roleSql:
          't.id IN (SELECT j.skill_id FROM role_skills j WHERE j.deleted_at IS NULL AND j.role_id IN ({ROLE_IDS}))',
      },
      {
        names: ['engine'],
        sql: 't.current_version_id',
        type: 'text',
        // EXISTS tương quan ⇒ tra PK (skill_version_id, engine_slug), không quét bảng hỗ trợ
        eqSql:
          'EXISTS (SELECT 1 FROM skill_engine_support s WHERE s.skill_version_id = t.current_version_id AND s.engine_slug = ?)',
      },
      {
        names: ['on', 'bat'],
        sql: "EXISTS (SELECT 1 FROM role_skills j WHERE j.skill_id = t.id AND j.deleted_at IS NULL AND j.status = 'learned')",
        type: 'bool',
      },
      {
        names: ['tokens'],
        sql: '(SELECT v.index_tokens FROM skill_versions v WHERE v.id = t.current_version_id)',
        type: 'number',
      },
      {
        names: ['uses'],
        sql: '(SELECT COALESCE(SUM(j.uses_7d), 0) FROM role_skills j WHERE j.skill_id = t.id AND j.deleted_at IS NULL)',
        type: 'number',
      },
      {
        names: ['version'],
        sql: '(SELECT v.version FROM skill_versions v WHERE v.id = t.current_version_id)',
        type: 'number',
      },
      { names: ['slug'], sql: 't.slug', type: 'text' },
      {
        names: ['status', 'trang-thai'],
        sql: 't.status',
        type: 'enum',
        enumValues: e('skills.status'),
        valueAliases: aliasesFor(e('skills.status'), STATUS_VI),
      },
      {
        names: ['origin', 'nguon'],
        sql: 't.origin',
        type: 'enum',
        enumValues: e('skills.origin'),
        valueAliases: aliasesFor(e('skills.origin'), SOURCE_VI),
      },
      { names: ['cat', 'chung-loai'], sql: 't.category_id', type: 'ref', refTable: 'taxonomy_nodes' },
      { names: ['tier', 'bac'], sql: 't.tier_label', type: 'text' },
    ],
  },
  TX: {
    prefix: 'TX',
    table: 'taxonomy_nodes',
    softDelete: true,
    textEntity: null,
    fields: [
      ...common(true),
      { names: ['name', 'ten'], sql: 't.name_norm', type: 'text' },
      {
        names: ['domain', 'mien'],
        sql: 't.domain',
        type: 'enum',
        enumValues: e('taxonomy_nodes.domain'),
        valueAliases: { 'ky-nang': 'skill', 'kien-thuc': 'knowledge' },
      },
      {
        names: ['level', 'tang'],
        sql: 't.level',
        type: 'enum',
        enumValues: e('taxonomy_nodes.level'),
        valueAliases: { nhom: 'group', nhanh: 'branch', 'chung-loai': 'category' },
      },
      { names: ['parent'], sql: 't.parent_id', type: 'ref', refTable: 'taxonomy_nodes' },
      {
        names: ['status', 'trang-thai'],
        sql: 't.status',
        type: 'enum',
        enumValues: e('taxonomy_nodes.status'),
        valueAliases: aliasesFor(e('taxonomy_nodes.status'), STATUS_VI),
      },
      {
        names: ['source', 'nguon'],
        sql: 't.source',
        type: 'enum',
        enumValues: e('taxonomy_nodes.source'),
        valueAliases: aliasesFor(e('taxonomy_nodes.source'), SOURCE_VI),
      },
    ],
  },
  KN: {
    prefix: 'KN',
    table: 'knowledge_items',
    softDelete: true,
    textEntity: 'KN',
    fields: [
      ...common(true),
      { names: ['role', 'vai'], sql: 't.role_id', type: 'role' },
      { names: ['type', 'loai'], sql: 't.file_type', type: 'text' },
      {
        names: ['scope', 'pham-vi'],
        sql: 't.scope',
        type: 'enum',
        enumValues: e('knowledge_items.scope'),
        valueAliases: { 'vi-tri': 'position', 'ca-nhan': 'personal' },
      },
      { names: ['indexed'], sql: "(t.processing_state = 'ready')", type: 'bool' },
      { names: ['recall'], sql: 't.recall_count', type: 'number' },
      { names: ['dup', 'trung'], sql: '(t.duplicate_of_id IS NOT NULL)', type: 'bool' },
      {
        names: ['status', 'trang-thai'],
        sql: 't.status',
        type: 'enum',
        enumValues: e('knowledge_items.status'),
        valueAliases: aliasesFor(e('knowledge_items.status'), STATUS_VI),
      },
    ],
  },
  PC: {
    prefix: 'PC',
    table: 'polaris_checks',
    softDelete: false,
    textEntity: null,
    fields: [
      ...common(false),
      { names: ['role', 'vai'], sql: 't.role_id', type: 'role' },
      { names: ['kind', 'loai'], sql: 't.subject_kind', type: 'enum', enumValues: e('polaris_checks.subject_kind') },
      { names: ['rule', 'luat'], sql: 't.rules_applied', type: 'text' },
      { names: ['gain'], sql: 't.expected_gain_minor', type: 'money' },
    ],
  },
  RW: {
    prefix: 'RW',
    table: 'role_wounds',
    softDelete: false,
    textEntity: null,
    fields: [
      ...common(false),
      { names: ['role', 'vai'], sql: 't.role_id', type: 'role' },
      { names: ['open', 'dang-mo'], sql: '(t.ended_at IS NULL)', type: 'bool' },
    ],
  },
  // Lưới 16–37: khai 1:1 theo GRID_COLUMNS của hợp đồng API (L-API, feat/m2-api) — chỉ cột tra cứu được (cột `~` chỉ hiển thị).
  EN: {
    prefix: 'EN',
    table: 'engine_accounts',
    softDelete: true,
    textEntity: null,
    fields: [
      ...plain(true),
      { names: ['engine'], sql: 't.engine_slug', type: 'text' },
      { names: ['label'], sql: 't.label', type: 'text' },
      { names: ['auth'], sql: 't.auth_method', type: 'enum', enumValues: e('engine_accounts.auth_method') },
      { names: ['login'], sql: 't.login_status', type: 'enum', enumValues: e('engine_accounts.login_status') },
      { names: ['quota'], sql: 't.quota_state', type: 'enum', enumValues: e('engine_accounts.quota_state') },
      { names: ['quota_pct'], sql: 't.quota_remaining_pct', type: 'number' },
      { names: ['quota_reset'], sql: 't.quota_reset_at', type: 'ts' },
      { names: ['outage'], sql: 't.outage_since', type: 'ts' },
      { names: ['cli'], sql: 't.cli_version_current', type: 'text' },
      { names: ['cli_pinned'], sql: 't.cli_version_pinned', type: 'text' },
      { names: ['overhead'], sql: 't.runtime_overhead_tokens', type: 'number' },
      { names: ['status'], sql: 't.status', type: 'enum', enumValues: e('engine_accounts.status') },
    ],
  },
  EB: {
    prefix: 'EB',
    table: 'engine_bindings',
    softDelete: true,
    textEntity: null,
    fields: [
      ...plain(true),
      { names: ['consumer'], sql: 't.consumer_kind', type: 'enum', enumValues: e('engine_bindings.consumer_kind') },
      { names: ['role'], sql: 't.role_id', type: 'role' },
      { names: ['account'], sql: 't.engine_account_id', type: 'ref', refTable: 'engine_accounts' },
      { names: ['priority'], sql: 't.priority', type: 'number' },
      { names: ['model'], sql: 't.model_key', type: 'text' },
      { names: ['effort'], sql: 't.effort', type: 'text' },
      { names: ['on'], sql: 't.is_enabled', type: 'bool' },
      {
        names: ['selection'],
        sql: 't.selection_state',
        type: 'enum',
        enumValues: e('engine_bindings.selection_state'),
      },
    ],
  },
  CT: {
    prefix: 'CT',
    table: 'containers',
    softDelete: true,
    textEntity: null,
    fields: [
      ...plain(true),
      { names: ['kind'], sql: 't.kind', type: 'enum', enumValues: e('containers.kind') },
      { names: ['role'], sql: 't.role_id', type: 'role' },
      { names: ['name'], sql: 't.container_name', type: 'text' },
      { names: ['image'], sql: 't.image_ref', type: 'text' },
      { names: ['desired'], sql: 't.desired_state', type: 'enum', enumValues: e('containers.desired_state') },
      { names: ['observed'], sql: 't.observed_state', type: 'enum', enumValues: e('containers.observed_state') },
      { names: ['health'], sql: 't.health', type: 'enum', enumValues: e('containers.health') },
      { names: ['health_checked'], sql: 't.health_checked_at', type: 'ts' },
      { names: ['cpu'], sql: 't.cpu_limit', type: 'number' },
      { names: ['mem_mb'], sql: 't.mem_limit_mb', type: 'number' },
      { names: ['started'], sql: 't.last_started_at', type: 'ts' },
      { names: ['stopped'], sql: 't.last_stopped_at', type: 'ts' },
      {
        names: ['cold_start_ms'],
        sql: '(SELECT s.cold_start_ms FROM sessions s WHERE s.container_id = t.id ORDER BY s.display_seq DESC LIMIT 1)',
        type: 'number',
      },
    ],
  },
  MR: {
    prefix: 'MR',
    table: 'model_ranks',
    softDelete: true,
    textEntity: null,
    fields: [
      ...plain(true),
      { names: ['engine'], sql: 't.engine_slug', type: 'text' },
      { names: ['model'], sql: 't.model_key', type: 'text' },
      { names: ['rank'], sql: 't.rank', type: 'number' },
      { names: ['source'], sql: 't.source', type: 'enum', enumValues: e('model_ranks.source') },
      { names: ['ranked'], sql: 't.ranked_at', type: 'ts' },
    ],
  },
  SA: {
    prefix: 'SA',
    table: 'system_agents',
    softDelete: true,
    textEntity: null,
    fields: [
      ...plain(true),
      { names: ['key'], sql: 't.system_key', type: 'text' },
      { names: ['model'], sql: 't.model_key', type: 'text' },
      { names: ['effort'], sql: 't.effort', type: 'text' },
      { names: ['on'], sql: 't.is_enabled', type: 'bool' },
      { names: ['selection'], sql: 't.selection_state', type: 'enum', enumValues: e('system_agents.selection_state') },
    ],
  },
  TG: {
    prefix: 'TG',
    table: 'telegram_bots',
    softDelete: true,
    textEntity: null,
    fields: [
      ...plain(true),
      { names: ['role'], sql: 't.role_id', type: 'role' },
      { names: ['username'], sql: 't.bot_username', type: 'text' },
      { names: ['status'], sql: 't.status', type: 'enum', enumValues: e('telegram_bots.status') },
      { names: ['getme_ok'], sql: 't.getme_ok_at', type: 'ts' },
      { names: ['last_update'], sql: 't.last_update_at', type: 'ts' },
    ],
  },
  AL: {
    prefix: 'AL',
    table: 'telegram_allowlist',
    softDelete: true,
    textEntity: null,
    fields: [
      ...plain(true),
      { names: ['bot'], sql: 't.bot_id', type: 'ref', refTable: 'telegram_bots' },
      { names: ['tg_user'], sql: 't.tg_user_id', type: 'number' },
      { names: ['name'], sql: 't.display_name', type: 'text' },
      { names: ['owner'], sql: 't.is_owner', type: 'bool' },
      { names: ['via'], sql: 't.added_via', type: 'enum', enumValues: e('telegram_allowlist.added_via') },
      { names: ['status'], sql: 't.status', type: 'enum', enumValues: e('telegram_allowlist.status') },
    ],
  },
  PP: {
    prefix: 'PP',
    table: 'proactive_policies',
    softDelete: true,
    textEntity: null,
    fields: [
      ...plain(true),
      { names: ['role'], sql: 't.role_id', type: 'role' },
      { names: ['on'], sql: 't.is_enabled', type: 'bool' },
      { names: ['max_per_day'], sql: 't.max_per_day', type: 'number' },
      { names: ['quiet_start'], sql: 't.quiet_start_min', type: 'number' },
      { names: ['quiet_end'], sql: 't.quiet_end_min', type: 'number' },
      { names: ['weekend_differs'], sql: 't.weekend_differs', type: 'bool' },
      { names: ['timezone'], sql: 't.timezone', type: 'text' },
      { names: ['channel'], sql: 't.channel', type: 'enum', enumValues: e('proactive_policies.channel') },
      {
        names: ['break_quiet'],
        sql: 't.break_quiet_level',
        type: 'enum',
        enumValues: e('proactive_policies.break_quiet_level'),
      },
    ],
  },
  PA: {
    prefix: 'PA',
    table: 'proactive_jobs',
    softDelete: true,
    textEntity: null,
    fields: [
      ...plain(true),
      { names: ['position'], sql: 't.position_id', type: 'ref', refTable: 'positions' },
      { names: ['name'], sql: 't.name', type: 'text' },
      { names: ['cron'], sql: 't.cron_expr', type: 'text' },
      { names: ['timezone'], sql: 't.timezone', type: 'text' },
      { names: ['action'], sql: 't.action_kind', type: 'enum', enumValues: e('proactive_jobs.action_kind') },
      { names: ['trigger'], sql: 't.trigger_kind', type: 'enum', enumValues: e('proactive_jobs.trigger_kind') },
      { names: ['on'], sql: 't.is_enabled', type: 'bool' },
      { names: ['misfire'], sql: 't.misfire_policy', type: 'enum', enumValues: e('proactive_jobs.misfire_policy') },
      { names: ['next_run'], sql: 't.next_run_at', type: 'ts' },
      { names: ['last_run'], sql: 't.last_run_at', type: 'ts' },
      { names: ['last_status'], sql: 't.last_status', type: 'enum', enumValues: e('proactive_jobs.last_status') },
    ],
  },
  PN: {
    prefix: 'PN',
    table: 'proactive_sends',
    softDelete: false,
    textEntity: null,
    fields: [
      ...plain(false),
      { names: ['role'], sql: 't.role_id', type: 'role' },
      { names: ['policy'], sql: 't.policy_id', type: 'ref', refTable: 'proactive_policies' },
      { names: ['trigger'], sql: 't.trigger_kind', type: 'enum', enumValues: e('proactive_sends.trigger_kind') },
      { names: ['urgency'], sql: 't.urgency', type: 'enum', enumValues: e('proactive_sends.urgency') },
      { names: ['day'], sql: 't.day_local', type: 'text' },
      { names: ['channel'], sql: 't.channel', type: 'enum', enumValues: e('proactive_sends.channel') },
      { names: ['status'], sql: 't.status', type: 'enum', enumValues: e('proactive_sends.status') },
      { names: ['sent'], sql: 't.sent_at', type: 'ts' },
    ],
  },
  UR: {
    prefix: 'UR',
    table: 'update_runs',
    softDelete: true,
    textEntity: null,
    fields: [
      ...plain(true),
      { names: ['from'], sql: 't.from_version', type: 'text' },
      { names: ['to'], sql: 't.to_version', type: 'text' },
      { names: ['trigger'], sql: 't.trigger', type: 'enum', enumValues: e('update_runs.trigger') },
      { names: ['status'], sql: 't.status', type: 'enum', enumValues: e('update_runs.status') },
      { names: ['started'], sql: 't.started_at', type: 'ts' },
      { names: ['finished'], sql: 't.finished_at', type: 'ts' },
      { names: ['duration_ms'], sql: 't.duration_ms', type: 'number' },
      { names: ['schema_from'], sql: 't.schema_from', type: 'number' },
      { names: ['schema_to'], sql: 't.schema_to', type: 'number' },
    ],
  },
  UP: {
    prefix: 'UP',
    table: 'app_versions',
    softDelete: true,
    textEntity: null,
    fields: [
      ...plain(true),
      { names: ['semver'], sql: 't.semver', type: 'text' },
      { names: ['channel'], sql: 't.channel', type: 'enum', enumValues: e('app_versions.channel') },
      { names: ['released'], sql: 't.released_at', type: 'ts' },
      { names: ['schema'], sql: 't.schema_version', type: 'number' },
      { names: ['source'], sql: 't.source', type: 'enum', enumValues: e('app_versions.source') },
      { names: ['status'], sql: 't.status', type: 'enum', enumValues: e('app_versions.status') },
      { names: ['discovered'], sql: 't.discovered_at', type: 'ts' },
    ],
  },
  CS: {
    prefix: 'CS',
    table: 'change_sets',
    softDelete: true,
    textEntity: null,
    fields: [
      ...plain(true),
      { names: ['scope'], sql: 't.scope', type: 'enum', enumValues: e('change_sets.scope') },
      { names: ['role'], sql: 't.role_id', type: 'role' },
      { names: ['title'], sql: 't.title', type: 'text' },
      { names: ['status'], sql: 't.status', type: 'enum', enumValues: e('change_sets.status') },
      {
        names: ['proposed_by'],
        sql: '(SELECT a.kind FROM actors a WHERE a.id = t.proposed_by)',
        type: 'enum',
        enumValues: e('actors.kind'),
      },
      { names: ['decided'], sql: 't.decided_at', type: 'ts' },
    ],
  },
  CD: {
    prefix: 'CD',
    table: 'employee_cards',
    softDelete: true,
    textEntity: null,
    fields: [
      ...plain(true),
      { names: ['role'], sql: 't.role_id', type: 'role' },
      { names: ['status'], sql: 't.status', type: 'enum', enumValues: e('employee_cards.status') },
      { names: ['issued'], sql: 't.issued_at', type: 'ts' },
      { names: ['suspended'], sql: 't.suspended_at', type: 'ts' },
      { names: ['revoked'], sql: 't.revoked_at', type: 'ts' },
      { names: ['tokens'], sql: 't.prompt_tokens', type: 'number' },
    ],
  },
  TR: {
    prefix: 'TR',
    table: 'trial_runs',
    softDelete: false,
    textEntity: null,
    fields: [
      ...plain(false),
      { names: ['role'], sql: 't.role_id', type: 'role' },
      { names: ['status'], sql: 't.status', type: 'enum', enumValues: e('trial_runs.status') },
      { names: ['scenarios'], sql: 't.scenario_count', type: 'number' },
      { names: ['passed'], sql: 't.pass_count', type: 'number' },
      { names: ['score'], sql: 't.score', type: 'number' },
      { names: ['threshold'], sql: 't.pass_threshold', type: 'number' },
      { names: ['judge'], sql: 't.judge_kind', type: 'enum', enumValues: e('trial_runs.judge_kind') },
      { names: ['decided'], sql: 't.decided_at', type: 'ts' },
    ],
  },
  NT: {
    prefix: 'NT',
    table: 'notifications',
    softDelete: true,
    textEntity: null,
    fields: [
      ...plain(true),
      { names: ['kind'], sql: 't.kind', type: 'enum', enumValues: e('notifications.kind') },
      { names: ['severity'], sql: 't.severity', type: 'enum', enumValues: e('notifications.severity') },
      { names: ['title'], sql: 't.title', type: 'text' },
      { names: ['target'], sql: 't.target_display_id', type: 'text' },
      { names: ['read'], sql: 't.read_at', type: 'ts' },
      { names: ['dismissed'], sql: 't.dismissed_at', type: 'ts' },
      { names: ['resolved'], sql: 't.resolved_at', type: 'ts' },
    ],
  },
  // lưới "characters" của hợp đồng = kho nhân vật (skin_assets, prefix SN)
  SN: {
    prefix: 'SN',
    table: 'skin_assets',
    softDelete: true,
    textEntity: null,
    fields: [
      ...plain(true),
      { names: ['pack'], sql: 't.pack_slug', type: 'text' },
      { names: ['code'], sql: 't.asset_code', type: 'text' },
      { names: ['kind'], sql: 't.asset_kind', type: 'enum', enumValues: e('skin_assets.asset_kind') },
      { names: ['faction'], sql: 't.faction', type: 'text' },
      { names: ['status'], sql: 't.status', type: 'enum', enumValues: e('skin_assets.status') },
      { names: ['enabled'], sql: 't.is_enabled', type: 'bool' },
      { names: ['char_kind'], sql: 't.char_kind', type: 'enum', enumValues: e('skin_assets.char_kind') },
      { names: ['gender'], sql: 't.gender', type: 'enum', enumValues: e('skin_assets.gender') },
    ],
  },
  AV: {
    prefix: 'AV',
    table: 'avatars',
    softDelete: false,
    textEntity: null,
    fields: [
      ...plain(false),
      { names: ['role'], sql: 't.role_id', type: 'role' },
      { names: ['source'], sql: 't.source', type: 'enum', enumValues: e('avatars.source') },
      { names: ['mime'], sql: 't.mime', type: 'text' },
      { names: ['size'], sql: 't.size_bytes', type: 'number' },
      { names: ['width'], sql: 't.width', type: 'number' },
      { names: ['height'], sql: 't.height', type: 'number' },
      { names: ['skin_pack'], sql: 't.skin_pack_slug', type: 'text' },
    ],
  },
  SS: {
    prefix: 'SS',
    table: 'sessions',
    softDelete: false,
    textEntity: null,
    fields: [
      ...plain(false),
      { names: ['agent'], sql: 't.agent_kind', type: 'enum', enumValues: e('sessions.agent_kind') },
      { names: ['role'], sql: 't.role_id', type: 'role' },
      { names: ['position'], sql: 't.position_id', type: 'ref', refTable: 'positions' },
      { names: ['task'], sql: 't.task_id', type: 'ref', refTable: 'tasks' },
      { names: ['trigger'], sql: 't.trigger', type: 'enum', enumValues: e('sessions.trigger') },
      { names: ['engine'], sql: 't.engine_slug', type: 'text' },
      { names: ['model'], sql: 't.model_key', type: 'text' },
      { names: ['effort'], sql: 't.effort', type: 'text' },
      { names: ['status'], sql: 't.status', type: 'enum', enumValues: e('sessions.status') },
      { names: ['phase'], sql: 't.phase', type: 'enum', enumValues: e('sessions.phase') },
      { names: ['error'], sql: 't.error_code', type: 'text' },
      { names: ['started'], sql: 't.started_at', type: 'ts' },
      { names: ['ended'], sql: 't.ended_at', type: 'ts' },
      { names: ['duration_ms'], sql: 't.duration_ms', type: 'number' },
      { names: ['cold_start_ms'], sql: 't.cold_start_ms', type: 'number' },
      { names: ['tokens_in'], sql: 't.tokens_input', type: 'number' },
      { names: ['tokens_out'], sql: 't.tokens_output', type: 'number' },
      { names: ['cost_micro'], sql: 't.cost_micro_usd', type: 'number' },
      { names: ['failover'], sql: 't.failover_count', type: 'number' },
    ],
  },
  PM: {
    prefix: 'PM',
    table: 'permission_requests',
    softDelete: true,
    textEntity: null,
    fields: [
      ...plain(true),
      { names: ['role'], sql: 't.role_id', type: 'role' },
      { names: ['tool'], sql: 't.requested_tool_slug', type: 'text' },
      { names: ['scope'], sql: 't.requested_scope', type: 'text' },
      { names: ['task'], sql: 't.task_id', type: 'ref', refTable: 'tasks' },
      { names: ['session'], sql: 't.session_id', type: 'ref', refTable: 'sessions' },
      { names: ['status'], sql: 't.status', type: 'enum', enumValues: e('permission_requests.status') },
      { names: ['decided'], sql: 't.decided_at', type: 'ts' },
    ],
  },
  GR: {
    prefix: 'GR',
    table: 'tool_grants',
    softDelete: true,
    textEntity: null,
    fields: [
      ...plain(true),
      { names: ['tool'], sql: 't.tool_id', type: 'ref', refTable: 'tools' },
      { names: ['role'], sql: 't.role_id', type: 'role' },
      { names: ['position'], sql: 't.position_id', type: 'ref', refTable: 'positions' },
      { names: ['mode'], sql: 't.mode', type: 'enum', enumValues: e('tool_grants.mode') },
      { names: ['expires'], sql: 't.expires_at', type: 'ts' },
    ],
  },
  TL: {
    prefix: 'TL',
    table: 'tools',
    softDelete: true,
    textEntity: null,
    fields: [
      ...plain(true),
      { names: ['slug'], sql: 't.slug', type: 'text' },
      { names: ['name'], sql: 't.name', type: 'text' },
      { names: ['kind'], sql: 't.kind', type: 'enum', enumValues: e('tools.kind') },
      { names: ['risk'], sql: 't.risk_level', type: 'enum', enumValues: e('tools.risk_level') },
      { names: ['default_mode'], sql: 't.default_mode', type: 'enum', enumValues: e('tools.default_mode') },
      { names: ['builtin'], sql: 't.is_builtin', type: 'bool' },
      { names: ['status'], sql: 't.status', type: 'enum', enumValues: e('tools.status') },
      { names: ['tokens'], sql: 't.definition_tokens', type: 'number' },
    ],
  },
};

export type GridKey = keyof typeof GRIDS;

const PREFIX_BY_TABLE = new Map<string, EntityPrefix>(
  Object.entries(ENTITY_TYPES).map(([p, t]) => [t, p as EntityPrefix] as const),
);

/** Prefix display_id của một bảng (sổ đăng ký ENTITY_TYPES của contracts); bảng không có display_id ⇒ null. */
export function prefixOfTable(table: string): EntityPrefix | null {
  return PREFIX_BY_TABLE.get(table) ?? null;
}

/** Tra trường theo tên / alias (không phân biệt hoa thường). */
export function findField(grid: GridDef, name: string): FieldDef | null {
  const n = name.toLowerCase();
  return grid.fields.find((f) => f.names.includes(n)) ?? null;
}
