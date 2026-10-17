// Sổ đăng ký prefix `display_id` (DATABASE §2.12, hằng số `ENTITY_TYPES` trong code).
// Nguồn: DSL của DB đã vendor (db/spec, SYNC.json) — test `ids.parity` ở @ga/db đối chiếu từng cặp prefix ↔ bảng.
// display_id = PREFIX- + display_seq đệm ≥ 4 chữ số (AU 5 chữ số). Không bao giờ dùng display_id làm khoá ngoại (§2.1).

export const ENTITY_TYPES = {
  US: 'users', // bộ đếm ở workspace hệ thống
  RL: 'roles',
  AV: 'avatars',
  SN: 'skin_assets',
  DN: 'dna_fields',
  RV: 'revisions',
  CS: 'change_sets',
  IN: 'instructions',
  TX: 'taxonomy_nodes',
  SK: 'skills',
  KN: 'knowledge_items',
  MM: 'memories',
  PS: 'positions',
  AS: 'assignments',
  TT: 'trust_tier_changes',
  TK: 'tasks',
  CM: 'commitments',
  SS: 'sessions',
  WL: 'wallets',
  LG: 'ledger_entries',
  RW: 'role_wounds',
  EN: 'engine_accounts',
  EB: 'engine_bindings',
  SA: 'system_agents',
  PB: 'probe_runs',
  CAP: 'capabilities',
  MR: 'model_ranks',
  GC: 'compiled_prompts',
  CT: 'containers',
  TG: 'telegram_bots',
  AL: 'telegram_allowlist',
  PP: 'proactive_policies',
  PA: 'proactive_jobs',
  PN: 'proactive_sends',
  TL: 'tools',
  GR: 'tool_grants',
  PM: 'permission_requests',
  EG: 'egress_rules',
  PC: 'polaris_checks',
  CD: 'employee_cards',
  TR: 'trial_runs',
  TH: 'chat_threads',
  MSG: 'chat_messages',
  AT: 'message_attachments',
  AN: 'message_anchors',
  UA: 'ui_actions',
  AU: 'audit_log',
  EV: 'events',
  NT: 'notifications',
  JB: 'jobs',
  UP: 'app_versions',
  BK: 'backups',
  UR: 'update_runs',
  ST: 'settings',
  SEC: 'secrets',
  CN: 'consents',
} as const;

export type EntityPrefix = keyof typeof ENTITY_TYPES;
export type EntityTable = (typeof ENTITY_TYPES)[EntityPrefix];

/** Prefix GĐ2 đã chừa chỗ (DATABASE §2.12) — không có bảng ở MVP, không được cấp số. */
export const RESERVED_PREFIXES_GD2 = ['AR', 'PK', 'XP', 'SE', 'LY', 'PL', 'SC', 'TE', 'SV', 'DR'] as const;

/** Mã cố định, không phải prefix bảng (DATABASE §2.12). */
export const FIXED_CODES = {
  cardChecks: ['CK-01', 'CK-02', 'CK-03', 'CK-04', 'CK-05', 'CK-06', 'CK-07', 'CK-08', 'CK-09'],
  onboardingChecklist: ['OB-01', 'OB-02', 'OB-03', 'OB-04', 'OB-05', 'OB-06', 'OB-07'],
  polarisRules: ['P1', 'P2', 'P3', 'P4'],
} as const;

const PAD: Partial<Record<EntityPrefix, number>> = { AU: 5 };

export function padWidth(prefix: EntityPrefix): number {
  return PAD[prefix] ?? 4;
}

export function isEntityPrefix(value: string): value is EntityPrefix {
  return Object.hasOwn(ENTITY_TYPES, value);
}

export function formatDisplayId(prefix: EntityPrefix, seq: number): string {
  if (!Number.isSafeInteger(seq) || seq <= 0) {
    throw new RangeError(`display_seq phải là số nguyên dương, nhận ${seq}`);
  }
  return `${prefix}-${String(seq).padStart(padWidth(prefix), '0')}`;
}

export interface ParsedDisplayId {
  prefix: EntityPrefix;
  table: EntityTable;
  seq: number;
}

const DISPLAY_ID_RE = /^([A-Z]{2,3})-(\d{4,})$/;

/** Tách `MM-0041` → { prefix: 'MM', table: 'memories', seq: 41 }. Trả null nếu không phải display_id hợp lệ. */
export function parseDisplayId(value: string): ParsedDisplayId | null {
  const m = DISPLAY_ID_RE.exec(value);
  if (!m) return null;
  const [, prefix, digits] = m;
  if (prefix === undefined || digits === undefined || !isEntityPrefix(prefix)) return null;
  const seq = Number(digits);
  if (!Number.isSafeInteger(seq) || seq <= 0) return null;
  // định dạng chuẩn: đệm đúng độ rộng tối thiểu, không thừa số 0 ở đầu khi đã vượt độ rộng
  if (formatDisplayId(prefix, seq) !== value) return null;
  return { prefix, table: ENTITY_TYPES[prefix], seq };
}

/** ULID 26 ký tự Crockford base32 (DATABASE §2.1). Chỉ kiểm hình dạng — ULID không mang thứ tự nghiệp vụ. */
export const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** id của workspace hệ thống (DATABASE §11.2). */
export const SYSTEM_WORKSPACE_ID = '00000000000000000000000000';
