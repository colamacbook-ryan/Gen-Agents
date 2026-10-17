// Bảng ánh xạ lỗi DB → mã ổn định (G-03, rủi ro R4 của BUILD-PLAN §F.1). Logic nghiệp vụ nằm trong ~560 trigger, lỗi trả về
// là chuỗi tự do `RAISE(ABORT, '…')`. Tầng repos đổi mọi lỗi SQLite thành DbRuleError mang HAI mã:
//   - `code`: mã API / i18n của @ga/contracts (= mapDbError(message) — MỘT nguồn với contracts, test vi phân giữ bằng nhau);
//   - `rule`: mã ổn định mịn hơn của tầng repos (vd 'ledger.insufficient_funds') — app quyết định theo `rule`, không theo chữ.
// Luật: chuỗi gốc chỉ vào log (`dbMessage`), không hiện cho người dùng. Không bao giờ bắt rồi nuốt lỗi: mọi lối ra đều
// throw lại (fail-closed). Test `db-errors.test.ts`: MỌI chuỗi RAISE trong R__triggers.sql khớp một luật cụ thể (không rơi về
// 'unknown'); mỗi luật có ít nhất một chuỗi thật của schema (không luật chết); mỗi mã có ca bắn thật qua repo.
//
// Khớp bằng tiền tố chuỗi (startsWith) hoặc regex tuyến tính neo đầu chuỗi — không lookaround, không quantifier lồng
// (STD-11, lint no-redos-regex). Thứ tự quan trọng: mục đầu tiên khớp thắng.
import { type ApiErrorCode, type DbErrorCode, mapDbError } from '@ga/contracts';

/** Mã ổn định của tầng repos. Thêm mã = thêm vào đây + luật + test; KHÔNG đổi tên mã đã phát hành. */
export const DB_RULES = [
  // — guard sinh tự động (§9.3)
  'unique.duplicate',
  'identity.immutable',
  'append_only',
  'writer.actor_mismatch',
  'writer.stale_updated_at',
  // — cổng người ghi / quyền
  'permission.credential_writer',
  'permission.system_only',
  'permission.owner_only',
  'permission.owner_admin',
  /** v2.3.5: cổng người ghi bảng gốc phân quyền / định tuyến / bảng toàn cục (users, auth_sessions, engines…). */
  'permission.writer_gate',
  /** v2.3.5: xoá cứng không lỏng hơn luật ghi. */
  'permission.delete_gate',
  'permission.confirm_owner_admin',
  'role.proposal_scope',
  // — bí mật, tenant, settings
  'secret.host_immutable',
  'secret.kind_immutable',
  'tenant.cross',
  'settings.rule',
  // — Core agent (INT-20, CONTRACT-r8*)
  'core_agent.not_ready',
  'core_agent.last_binding',
  'core_agent.last_container',
  'core_agent.lock_immutable',
  'core_agent.type_locked',
  'core_agent.type_change_order',
  'core_agent.type_mismatch',
  'core_agent.engine_in_use',
  'core_agent.no_fallback',
  'core_agent.not_incident',
  'core_agent.type_change_event',
  'core_agent.recovery_mode',
  'system_agent.model_invalid',
  // — engine, tài khoản, binding, consent
  'consent.required',
  'binding.one_account_per_engine',
  'binding.container_required',
  'engine.container_mismatch',
  'engine.overhead_rule',
  'failover.same_engine',
  'failover.invalid',
  // — Telegram
  'telegram.owner_invariant',
  'telegram.owner_capture',
  // — kinh tế
  'ledger.insufficient_funds',
  'ledger.self_wallet',
  'ledger.signer',
  'ledger.sequence',
  'ledger.wallet_inactive',
  'ledger.activation',
  'ledger.reversal',
  'ledger.evidence',
  'ledger.reward',
  'ledger.penalty',
  'ledger.token_cost_disabled',
  'ledger.direct_balance',
  'role.wounded',
  'reflection.rule',
  'polaris.rule',
  'proactive.daily_cap',
  'task.failure_disclosure',
  'trust_tier.rule',
  'card.frozen',
  // — prompt, revision, tri thức
  'revision.semver',
  'revision.core_rule',
  'compiler.segment_order',
  'session.prompt_mismatch',
  'taxonomy.rule',
  // — avatar, Kho nhân vật, chat, audit, workspace
  'avatar.not_own',
  'avatar.library_asset',
  'character_library.owner_admin',
  'character_library.disabled',
  'character_library.in_use',
  'chat.attachment_too_large',
  'audit.chain',
  'workspace.restored_at',
  /** v2.3.5: workspace tenant phải còn ít nhất một owner đang hoạt động. */
  'workspace.owner_required',
  /** v2.3.5: user đang là thành viên active của workspace khác. */
  'workspace.membership_cross',
  // — lỗi ràng buộc dựng sẵn của SQLite + hợp đồng kết nối
  'sqlite.foreign_key',
  'sqlite.unique',
  'sqlite.check',
  'sqlite.not_null',
  'sqlite.readonly',
  'connection.missing_function',
  // — lỗi do repo phát hiện trước khi chạm DB (không có chuỗi DB)
  /** actor của giao dịch không đủ quyền cho thao tác (rào ở repo, nhiều lớp với cổng người ghi của DB). */
  'permission.denied',
  /** id tham chiếu nhận từ input không tồn tại trong workspace của giao dịch (chống IDOR chéo tenant). */
  'repo.invalid_ref',
  'repo.not_found',
  'repo.version_conflict',
  'repo.invalid_input',
  'repo.unknown_actor',
  'repo.not_implemented',
  // — chuỗi DB lạ (test bắt: schema không được sinh ra chuỗi rơi vào đây)
  'unknown',
] as const;
export type DbRule = (typeof DB_RULES)[number];

type Matcher = string | RegExp;

/** Luật khớp chuỗi lỗi DB → mã. Chỉ dùng tiền tố hoặc regex neo `^` tuyến tính. */
export const DB_RULE_MATCHERS: ReadonlyArray<{ rule: DbRule; match: readonly Matcher[] }> = [
  { rule: 'unique.duplicate', match: ['UNIQUE (chống REPLACE'] },
  {
    rule: 'identity.immutable',
    match: [
      'immutable identity:',
      // v2.3.5: rowid (và bí danh) bất biến — chặn REPLACE đổi rowid
      'rowid (v2.3.5): ',
      'actors (v2.3.5): kind / user_id / role_id / system_key / workspace_id bất biến',
    ],
  },
  // v2.3.5: NOT NULL có DEFAULT không nhận NULL (chống OR REPLACE thay NULL bằng DEFAULT sau guard)
  { rule: 'sqlite.not_null', match: ['NOT NULL (v2.3.5, chống REPLACE): ', 'NOT NULL constraint failed'] },
  {
    rule: 'workspace.owner_required',
    match: ['workspace_members (v2.3.5): workspace tenant phải còn ít nhất một owner'],
  },
  {
    rule: 'workspace.membership_cross',
    match: ['workspace_members (v2.3.5): user đang là thành viên active của workspace khác'],
  },
  { rule: 'permission.delete_gate', match: [/^[a-z_]+ \(v2\.3\.5\): xoá cứng /] },
  {
    rule: 'writer.actor_mismatch',
    match: [/^[a-z_]+ \(v2\.3\.5\): bảng không có cột người ghi — /],
  },
  // các cổng người ghi v2.3.5 còn lại (phân quyền / định tuyến / bảng toàn cục / bảo trì) — đặt SAU các luật cụ thể ở trên
  { rule: 'permission.writer_gate', match: [/^[a-z_]+ \(v2\.3\.5\): /] },
  { rule: 'append_only', match: ['append-only'] },
  { rule: 'writer.stale_updated_at', match: [/^[a-z_]+: người ghi \(v2\.3\.3\) — updated_at phải đổi/] },
  {
    rule: 'writer.actor_mismatch',
    match: [/^[a-z_]+: người ghi \(v2\.3\.3\) — /, 'change_sets (v2.3.3): proposed_by phải = app_actor()'],
  },
  {
    rule: 'permission.credential_writer',
    match: [
      /^(engine_accounts|engine_bindings|tools|telegram_bots) \(v2\.3\.3\): giữ \/ định tuyến credential/,
      'secrets (v2.3.3): chỉ owner / admin',
      'settings (v2.3.3): backup.remote_anchor định tuyến credential',
    ],
  },
  {
    rule: 'permission.system_only',
    match: [
      'engine_accounts (v2.3.3): login_status là kết quả kiểm đăng nhập',
      'engine_accounts (v2.3.3): trạng thái kiểm đăng nhập',
      'engine_bindings (v2.3.3): kết quả kiểm model',
      'engine_installs (v2.3.2): trạng thái cài CLI chỉ actor system',
      'telegram_bots (v2.3.3): kết quả getMe',
      'telegram_bots (v2.3.3): status active / error',
      'tools (v2.3.3): nguồn gốc built-in',
    ],
  },
  { rule: 'secret.host_immutable', match: ['secrets (v2.3.2): allowed_host ghi một lần'] },
  { rule: 'secret.kind_immutable', match: ['secrets (v2.3.4): kind bất biến'] },
  {
    rule: 'permission.confirm_owner_admin',
    match: [/^(dna_fields|taxonomy_nodes|skill_prereqs): chỉ owner\/admin \(actor user/],
  },
  {
    rule: 'permission.owner_only',
    match: [
      'CONTRACT-r8c §A (Q-R8a): đổi loại Core agent khi sự cố — chỉ owner',
      'v2.2.13 (review bảo mật, HIGH): chỉ owner của workspace khôi phục được bot Telegram',
    ],
  },
  { rule: 'role.proposal_scope', match: ['CNS-033/049: Role chỉ đề xuất'] },
  { rule: 'tenant.cross', match: ['tenant:'] },
  // — Core agent: tiền tố riêng trước tiền tố chung 'INT-20'
  { rule: 'core_agent.last_binding', match: ['INT-20 (A4): không gỡ / tắt / lật'] },
  {
    rule: 'core_agent.not_ready',
    match: [
      'INT-20 (A4, CONTRACT-r8 §C): mọi Role mới chỉ tạo được khi tài khoản Core agent sẵn sàng',
      'INT-20 (CONTRACT-r8 §C): phiên AI Hệ thống',
    ],
  },
  { rule: 'core_agent.lock_immutable', match: ['INT-20 (A5): workspaces.core_agent_locked_at'] },
  { rule: 'core_agent.type_locked', match: ['INT-20 (A5, CONTRACT-r8b §A): system.core_agent_engine chỉ đọc'] },
  { rule: 'core_agent.engine_in_use', match: ['INT-20 (CNS-092):'] },
  { rule: 'core_agent.last_container', match: ['INT-20 (CNS-093):'] },
  { rule: 'core_agent.no_fallback', match: ['INT-20 (CONTRACT-r8 §C): Core agent không fallback'] },
  { rule: 'core_agent.type_change_order', match: ['INT-20 (CONTRACT-r8b §A): chưa khoá loại Core agent'] },
  { rule: 'core_agent.type_mismatch', match: ['INT-20: tài khoản của AI Hệ thống phải cùng loại Core agent'] },
  { rule: 'core_agent.not_incident', match: ['CONTRACT-r8b §B/§C: notifications core_agent_incident'] },
  { rule: 'core_agent.type_change_event', match: ['CONTRACT-r8c §A: events core_agent.type_changed'] },
  { rule: 'core_agent.recovery_mode', match: ['CONTRACT-r8d §C (CNS-120): Core agent đang ở chế độ khắc phục'] },
  { rule: 'system_agent.model_invalid', match: ['CONTRACT-r8d §A (CNS-117): tác tử hệ thống chưa có model hợp lệ'] },
  {
    rule: 'consent.required',
    match: ['Clause 6 / OB-05:', 'engine cần consent:', 'CONTRACT-r8c §A (Q-R8a): loại đích đòi đồng ý điều khoản'],
  },
  { rule: 'binding.one_account_per_engine', match: ['CONTRACT-r8 §A: mỗi consumer'] },
  { rule: 'failover.same_engine', match: ['CONTRACT-r8 §B: fallback tự động chỉ sang LOẠI CLI khác'] },
  { rule: 'telegram.owner_invariant', match: ['CONTRACT-r8e §A'] },
  { rule: 'telegram.owner_capture', match: ['v2.2.13 (review bảo mật, HIGH): hàng allowlist chỉ thành chủ sở hữu'] },
  { rule: 'binding.container_required', match: ['engine_bindings: container của consumer phải có trước'] },
  { rule: 'engine.container_mismatch', match: ['Q-R1: phiên/probe phải chạy trong container'] },
  { rule: 'engine.overhead_rule', match: ['runtime overhead phải'] },
  { rule: 'failover.invalid', match: ['events engine.failover:'] },
  // — kinh tế
  { rule: 'ledger.insufficient_funds', match: ['ledger: ví không cho âm'] },
  { rule: 'ledger.self_wallet', match: ['ledger: không ai tự ghi vào ví của chính mình'] },
  {
    rule: 'ledger.signer',
    match: [
      'ledger: MVP chỉ owner/admin',
      'ledger: approved_by phải là owner/admin',
      'ledger (v2.3.3): recorded_by phải = app_actor()',
    ],
  },
  {
    rule: 'ledger.sequence',
    match: ['ledger: debit_balance_after sai', 'ledger: credit_balance_after sai', 'ledger: display_seq phải tăng'],
  },
  { rule: 'ledger.wallet_inactive', match: ['ledger: ví khác tenant hoặc không active'] },
  { rule: 'ledger.activation', match: ['ledger: vốn kích hoạt'] },
  { rule: 'ledger.reversal', match: ['ledger: bút toán đảo', 'ledger: đảo phạt'] },
  { rule: 'ledger.evidence', match: ['ledger: bằng chứng'] },
  { rule: 'ledger.reward', match: ['ledger: thưởng theo việc', 'ledger: vượt trần thưởng'] },
  { rule: 'ledger.token_cost_disabled', match: ['ledger: MVP không trừ chi phí token'] },
  { rule: 'ledger.penalty', match: ['ledger:'] },
  { rule: 'ledger.direct_balance', match: ['wallets.balance_minor chỉ đổi qua ledger'] },
  { rule: 'role.wounded', match: ['Role đang Trọng thương'] },
  { rule: 'reflection.rule', match: ['tự xét lỗi:'] },
  { rule: 'polaris.rule', match: ['Polaris:'] },
  { rule: 'proactive.daily_cap', match: ['proactive: vượt trần tin/ngày'] },
  { rule: 'task.failure_disclosure', match: ['tasks: '] },
  { rule: 'trust_tier.rule', match: ['trust tier:'] },
  { rule: 'card.frozen', match: ['employee_cards: bằng chứng đã đóng băng'] },
  // — prompt, revision, tri thức
  { rule: 'revision.semver', match: ['revisions: lõi → major+1'] },
  { rule: 'revision.core_rule', match: ['lõi: '] },
  { rule: 'compiler.segment_order', match: ['compiler: thứ tự khối'] },
  { rule: 'session.prompt_mismatch', match: ['adapter: prompt đã nạp khác'] },
  {
    rule: 'taxonomy.rule',
    match: [
      'taxonomy: ',
      'taxonomy_nodes: đề xuất cho thư viện',
      'skill_prereqs: ',
      'skills.category_id',
      'knowledge_items.category_id',
    ],
  },
  // — avatar, Kho nhân vật
  { rule: 'avatar.not_own', match: ['roles.avatar_id (v2.3.0)'] },
  { rule: 'avatar.library_asset', match: ['avatars: ảnh thư viện phải trỏ'] },
  {
    rule: 'character_library.owner_admin',
    match: ['Kho nhân vật (v2.3.0): chỉ owner/admin'],
  },
  { rule: 'character_library.disabled', match: ['Kho nhân vật (v2.3.0): '] },
  { rule: 'character_library.in_use', match: ['gỡ gói skin: còn Role đang dùng'] },
  { rule: 'chat.attachment_too_large', match: ['chat: tệp vượt trần'] },
  { rule: 'audit.chain', match: ['audit: prev_hash'] },
  { rule: 'workspace.restored_at', match: ['workspaces.restored_at'] },
  // — settings (sau mọi tiền tố 'settings (v2.3.3): …' cụ thể ở trên)
  { rule: 'permission.owner_admin', match: ['settings: system.core_agent_engine chỉ owner/admin'] },
  { rule: 'settings.rule', match: ['settings'] },
  // — ràng buộc dựng sẵn của SQLite
  { rule: 'sqlite.foreign_key', match: ['FOREIGN KEY constraint failed'] },
  { rule: 'sqlite.unique', match: ['UNIQUE constraint failed'] },
  { rule: 'sqlite.check', match: ['CHECK constraint failed'] },
  { rule: 'sqlite.readonly', match: ['attempt to write a readonly database'] },
  { rule: 'connection.missing_function', match: ['no such function: app_'] },
];

/** Mã ổn định của một chuỗi lỗi DB. Chuỗi lạ ⇒ 'unknown' (vẫn là lỗi — không bao giờ coi là thành công). */
export function dbRuleOf(message: string): DbRule {
  const m = message.trim();
  for (const r of DB_RULE_MATCHERS) {
    for (const p of r.match) {
      if (typeof p === 'string' ? m.startsWith(p) : p.test(m)) return r.rule;
    }
  }
  return 'unknown';
}

/** Mã API của lỗi do repo phát hiện (không có chuỗi DB). Quyền ⇒ 'db.rule_violation' (= mã của cổng DB tương ứng). */
const REPO_CODES: Partial<Record<DbRule, DbRuleErrorCode>> = {
  'permission.denied': 'db.rule_violation',
  // tham chiếu sai / khác tenant ⇒ cùng mã với "không tìm thấy" (không lộ sự tồn tại của hàng tenant khác)
  'repo.invalid_ref': 'not_found',
  'repo.not_found': 'not_found',
  'repo.version_conflict': 'conflict',
  'repo.invalid_input': 'validation.failed',
  'repo.unknown_actor': 'validation.failed',
  'repo.not_implemented': 'internal',
};

export type DbRuleErrorCode = DbErrorCode | ApiErrorCode;

/**
 * Lỗi của tầng repos. `rule` = mã ổn định (quyết định theo đây), `code` = mã API / i18n của contracts.
 * `dbMessage` = chuỗi gốc của SQLite (CHỈ để log; không trả client). `cause` = lỗi gốc.
 */
export class DbRuleError extends Error {
  readonly rule: DbRule;
  readonly code: DbRuleErrorCode;
  readonly dbMessage: string | null;
  constructor(rule: DbRule, detail: string, opts: { dbMessage?: string | null; cause?: unknown } = {}) {
    super(`${rule}: ${detail}`, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = 'DbRuleError';
    this.rule = rule;
    this.dbMessage = opts.dbMessage ?? null;
    this.code = REPO_CODES[rule] ?? (this.dbMessage === null ? 'internal' : mapDbError(this.dbMessage));
  }
}

/** Lỗi SQLite (better-sqlite3 SqliteError) → DbRuleError; lỗi khác giữ nguyên. Luôn trả lỗi để người gọi throw. */
export function toDbRuleError(err: unknown): unknown {
  if (err instanceof DbRuleError) return err;
  if (err instanceof Error && err.name === 'SqliteError') {
    const rule = dbRuleOf(err.message);
    return new DbRuleError(rule, err.message, { dbMessage: err.message, cause: err });
  }
  return err;
}

/** Chạy `fn`; lỗi SQLite được đổi sang DbRuleError rồi THROW LẠI (không bao giờ nuốt). */
export function withDbErrors<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    throw toDbRuleError(err);
  }
}

export function notFound(what: string): DbRuleError {
  return new DbRuleError('repo.not_found', what);
}
export function invalidInput(what: string): DbRuleError {
  return new DbRuleError('repo.invalid_input', what);
}
export function permissionDenied(what: string): DbRuleError {
  return new DbRuleError('permission.denied', what);
}
