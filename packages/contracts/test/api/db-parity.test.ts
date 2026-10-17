import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_LOGIN_STATUSES,
  ALLOWLIST_ADDED_VIA,
  ANCHOR_KINDS,
  ANCHOR_STATES,
  ATTACHMENT_SCAN_STATUSES,
  AUDIT_RESULTS,
  AVATAR_SOURCES,
  BREAK_QUIET_LEVELS,
  CARD_STATUSES,
  CHANGE_ITEM_OPS,
  CHANGE_SET_STATUSES,
  CHAT_AUTHOR_KINDS,
  CHAT_CHANNELS,
  CHAT_MESSAGE_STATUSES,
  COMMITMENT_COUNTERPARTIES,
  COMMITMENT_STATUSES,
  DNA_SOURCES,
  EGRESS_APPLIES_TO,
  INSTRUCTION_CONDITION_KINDS,
  INSTRUCTION_LAYERS,
  JOB_STATES,
  KNOWLEDGE_PROCESSING_STATES,
  LEDGER_ENTRY_TYPES,
  MEMORY_KINDS,
  MEMORY_SOURCE_TYPES,
  MEMORY_STATUSES,
  NOTIFICATION_KINDS,
  POLARIS_CHECK_KINDS,
  PROACTIVE_SEND_STATUSES,
  PROACTIVE_TRIGGERS,
  PROMPT_SEGMENT_LAYERS,
  PROMPT_SEGMENT_SOURCE_KINDS,
  ROLE_COLORS,
  ROLE_LIFECYCLES,
  ROLE_RUNTIMES,
  SECRET_ROW_KINDS,
  SEND_BLOCK_REASONS,
  SENSITIVITIES,
  Severity,
  TASK_PRIORITIES,
  TASK_SOURCES,
  TASK_STATUSES,
  TASK_VERIFICATIONS,
  TAXONOMY_KINDS,
  TAXONOMY_LEVELS,
  TAXONOMY_STATUSES,
  TELEGRAM_BOT_STATUSES,
  THREAD_AGENTS,
  THREAD_KINDS,
  THREAD_STATUSES,
  TOOL_ALLOWED_AGENTS,
  TOOL_KINDS,
  TOOL_RISK_LEVELS,
  TOOL_STATUSES,
  TRIAL_STATES,
  UI_ACTION_OUTCOMES,
  UI_ACTIONS,
} from '../../src/index.ts';

// Enum của hợp đồng API TRÙNG `CHECK (col IN (...))` của bảng DB (quy ước M0). Nguồn: db/spec/schema_v2_2.sql (đã vendor).
// Chỗ API cố ý khác DB (thêm / gộp khoá) khai tường minh ở `apiOnly` / `dbOnly` kèm lý do — không có chỗ "lệch ngầm".

const SQL = readFileSync(new URL('../../../../db/spec/schema_v2_2.sql', import.meta.url), 'utf8');

function dbEnum(table: string, column: string): string[] {
  const start = SQL.indexOf(`CREATE TABLE ${table} (`);
  if (start < 0) throw new Error(`không có bảng ${table}`);
  const end = SQL.indexOf('\n);', start);
  const block = SQL.slice(start, end);
  for (const line of block.split('\n')) {
    const m = new RegExp(`^\\s*${column} TEXT\\b.*?CHECK \\(${column} IN \\(([^)]*)\\)\\)`).exec(line);
    if (m?.[1]) return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1] as string);
  }
  throw new Error(`không thấy CHECK IN của ${table}.${column}`);
}

interface Pair {
  name: string;
  api: readonly string[];
  col: string;
  /** Khoá chỉ có ở API (suy ra từ cột khác, vd `deleted` ← deleted_at). */
  apiOnly?: readonly string[];
  /** Khoá DB chưa dùng ở MVP / không hiện ở API. */
  dbOnly?: readonly string[];
}

const PAIRS: Pair[] = [
  { name: 'ROLE_COLORS', api: ROLE_COLORS, col: 'roles.color' },
  { name: 'ROLE_LIFECYCLES', api: ROLE_LIFECYCLES, col: 'roles.lifecycle_status' },
  { name: 'ROLE_RUNTIMES', api: ROLE_RUNTIMES, col: 'roles.runtime_state' },
  { name: 'AVATAR_SOURCES', api: AVATAR_SOURCES, col: 'avatars.source' },
  { name: 'DNA_SOURCES', api: DNA_SOURCES, col: 'dna_fields.source' },
  { name: 'INSTRUCTION_LAYERS', api: INSTRUCTION_LAYERS, col: 'instructions.layer' },
  { name: 'INSTRUCTION_CONDITION_KINDS', api: INSTRUCTION_CONDITION_KINDS, col: 'instructions.condition_kind' },
  { name: 'CHANGE_SET_STATUSES', api: CHANGE_SET_STATUSES, col: 'change_sets.status' },
  { name: 'CHANGE_ITEM_OPS', api: CHANGE_ITEM_OPS, col: 'change_set_items.op' },
  { name: 'TAXONOMY_KINDS', api: TAXONOMY_KINDS, col: 'taxonomy_nodes.domain' },
  { name: 'TAXONOMY_LEVELS', api: TAXONOMY_LEVELS, col: 'taxonomy_nodes.level' },
  { name: 'TAXONOMY_STATUSES', api: TAXONOMY_STATUSES, col: 'taxonomy_nodes.status' },
  { name: 'KNOWLEDGE_PROCESSING_STATES', api: KNOWLEDGE_PROCESSING_STATES, col: 'knowledge_items.processing_state' },
  { name: 'MEMORY_STATUSES', api: MEMORY_STATUSES, col: 'memories.status', apiOnly: ['deleted'] },
  { name: 'MEMORY_KINDS', api: MEMORY_KINDS, col: 'memories.kind' },
  { name: 'MEMORY_SOURCE_TYPES', api: MEMORY_SOURCE_TYPES, col: 'memories.source_type' },
  { name: 'SENSITIVITIES', api: SENSITIVITIES, col: 'memories.sensitivity' },
  { name: 'TASK_STATUSES', api: TASK_STATUSES, col: 'tasks.status' },
  { name: 'TASK_SOURCES', api: TASK_SOURCES, col: 'tasks.source' },
  { name: 'TASK_PRIORITIES', api: TASK_PRIORITIES, col: 'tasks.priority' },
  { name: 'TASK_VERIFICATIONS', api: TASK_VERIFICATIONS, col: 'tasks.verification' },
  { name: 'COMMITMENT_STATUSES', api: COMMITMENT_STATUSES, col: 'commitments.status' },
  { name: 'COMMITMENT_COUNTERPARTIES', api: COMMITMENT_COUNTERPARTIES, col: 'commitments.counterparty_kind' },
  { name: 'LEDGER_ENTRY_TYPES', api: LEDGER_ENTRY_TYPES, col: 'ledger_entries.entry_type' },
  { name: 'ACCOUNT_LOGIN_STATUSES', api: ACCOUNT_LOGIN_STATUSES, col: 'engine_accounts.login_status' },
  { name: 'PROMPT_SEGMENT_LAYERS', api: PROMPT_SEGMENT_LAYERS, col: 'compiled_prompt_segments.layer' },
  {
    name: 'PROMPT_SEGMENT_SOURCE_KINDS',
    api: PROMPT_SEGMENT_SOURCE_KINDS,
    col: 'compiled_prompt_segments.source_kind',
  },
  { name: 'TELEGRAM_BOT_STATUSES', api: TELEGRAM_BOT_STATUSES, col: 'telegram_bots.status' },
  { name: 'ALLOWLIST_ADDED_VIA', api: ALLOWLIST_ADDED_VIA, col: 'telegram_allowlist.added_via' },
  { name: 'BREAK_QUIET_LEVELS', api: BREAK_QUIET_LEVELS, col: 'proactive_policies.break_quiet_level' },
  { name: 'PROACTIVE_TRIGGERS (sends)', api: PROACTIVE_TRIGGERS, col: 'proactive_sends.trigger_kind' },
  { name: 'PROACTIVE_TRIGGERS (jobs)', api: PROACTIVE_TRIGGERS, col: 'proactive_jobs.trigger_kind' },
  { name: 'TOOL_KINDS', api: TOOL_KINDS, col: 'tools.kind' },
  { name: 'TOOL_RISK_LEVELS', api: TOOL_RISK_LEVELS, col: 'tools.risk_level' },
  { name: 'TOOL_ALLOWED_AGENTS', api: TOOL_ALLOWED_AGENTS, col: 'tools.allowed_agents' },
  { name: 'TOOL_STATUSES', api: TOOL_STATUSES, col: 'tools.status' },
  { name: 'EGRESS_APPLIES_TO', api: EGRESS_APPLIES_TO, col: 'egress_rules.applies_to' },
  { name: 'CARD_STATUSES', api: CARD_STATUSES, col: 'employee_cards.status' },
  { name: 'TRIAL_STATES', api: TRIAL_STATES, col: 'trial_runs.status' },
  { name: 'THREAD_KINDS', api: THREAD_KINDS, col: 'chat_threads.kind', dbOnly: ['workspace'] },
  { name: 'THREAD_AGENTS', api: THREAD_AGENTS, col: 'chat_threads.agent' },
  { name: 'THREAD_STATUSES', api: THREAD_STATUSES, col: 'chat_threads.status' },
  { name: 'CHAT_AUTHOR_KINDS', api: CHAT_AUTHOR_KINDS, col: 'chat_messages.author_kind' },
  { name: 'CHAT_CHANNELS', api: CHAT_CHANNELS, col: 'chat_messages.channel' },
  { name: 'CHAT_MESSAGE_STATUSES', api: CHAT_MESSAGE_STATUSES, col: 'chat_messages.status' },
  { name: 'ANCHOR_KINDS', api: ANCHOR_KINDS, col: 'message_anchors.kind' },
  { name: 'ANCHOR_STATES', api: ANCHOR_STATES, col: 'message_anchors.resolved_state' },
  { name: 'ATTACHMENT_SCAN_STATUSES', api: ATTACHMENT_SCAN_STATUSES, col: 'message_attachments.scan_status' },
  { name: 'UI_ACTIONS', api: UI_ACTIONS, col: 'ui_actions.action' },
  { name: 'UI_ACTION_OUTCOMES', api: UI_ACTION_OUTCOMES, col: 'ui_actions.outcome' },
  { name: 'AUDIT_RESULTS', api: AUDIT_RESULTS, col: 'audit_log.result' },
  { name: 'NOTIFICATION_KINDS', api: NOTIFICATION_KINDS, col: 'notifications.kind' },
  { name: 'Severity', api: Severity.options, col: 'notifications.severity' },
  { name: 'Severity (events)', api: Severity.options, col: 'events.severity' },
  { name: 'JOB_STATES', api: JOB_STATES, col: 'jobs.status' },
  { name: 'SECRET_ROW_KINDS', api: SECRET_ROW_KINDS, col: 'secrets.kind' },
  { name: 'POLARIS_CHECK_KINDS', api: POLARIS_CHECK_KINDS, col: 'polaris_checks.subject_kind' },
];

describe('enum của hợp đồng API trùng CHECK của bảng DB', () => {
  it.each(PAIRS.map((p) => [p.name, p] as const))('%s', (_n, p) => {
    const [table, column] = p.col.split('.') as [string, string];
    const db = dbEnum(table, column);
    const api = p.api.filter((v) => !(p.apiOnly ?? []).includes(v));
    const dbRest = db.filter((v) => !(p.dbOnly ?? []).includes(v));
    expect([...api].sort(), `${p.name} ↔ ${p.col}`).toEqual([...dbRest].sort());
    for (const v of p.apiOnly ?? []) expect(db, `${p.name}: ${v} không được có ở DB (khai apiOnly)`).not.toContain(v);
    for (const v of p.dbOnly ?? []) expect(db, `${p.name}: ${v} phải có ở DB (khai dbOnly)`).toContain(v);
  });

  it('proactive_sends.status: API gộp suppressed_* thành `blocked` + blockReason (ánh xạ đúng)', () => {
    const db = dbEnum('proactive_sends', 'status');
    const suppressed = db.filter((v) => v.startsWith('suppressed_'));
    expect(suppressed.sort()).toEqual(SEND_BLOCK_REASONS.map((r) => `suppressed_${r}`).sort());
    const apiDirect = PROACTIVE_SEND_STATUSES.filter((v) => v !== 'blocked');
    expect([...apiDirect].sort()).toEqual(db.filter((v) => !v.startsWith('suppressed_')).sort());
    expect(PROACTIVE_SEND_STATUSES).toContain('blocked');
  });

  it('bộ đối chiếu chạy được: tìm đúng cột, báo lỗi khi cột / bảng không có', () => {
    expect(dbEnum('roles', 'condition')).toEqual(['normal', 'wounded']);
    expect(() => dbEnum('roles', 'khong_co_cot')).toThrow();
    expect(() => dbEnum('khong_co_bang', 'x')).toThrow();
    // mồi: một enum sai phải làm phép so sánh đỏ
    expect([...ROLE_COLORS, 'pink'].sort()).not.toEqual([...dbEnum('roles', 'color')].sort());
  });

  it('khác biệt đặc tả ↔ DB đã chốt theo DB (báo Gen duyệt): pending, ai_inferred, obsolete, urgent_only, branch, create, open', () => {
    expect(TRIAL_STATES).toContain('pending');
    expect(TRIAL_STATES as readonly string[]).not.toContain('queued');
    expect(DNA_SOURCES).toContain('ai_inferred');
    expect(MEMORY_STATUSES).toContain('obsolete');
    expect(MEMORY_STATUSES as readonly string[]).not.toContain('stale');
    expect(BREAK_QUIET_LEVELS).toContain('urgent_only');
    expect(TAXONOMY_LEVELS).toContain('branch');
    expect(CHANGE_ITEM_OPS).toContain('create');
    expect(CHANGE_SET_STATUSES).toContain('open');
    expect(CHANGE_SET_STATUSES as readonly string[]).not.toContain('pending');
  });
});
