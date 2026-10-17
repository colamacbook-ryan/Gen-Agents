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
