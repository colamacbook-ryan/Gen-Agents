// Kiểu dùng chung của tầng repos (L-DB, BUILD-PLAN §B.4 "Mô hình DB", §D.4). Hàng = kiểu sinh từ DB đã migrate
// (generated/schema.ts) — repo không tự khai lại cột. Bool của DB là 0 | 1, ts là chuỗi UTC 24 ký tự (DATABASE §2.2).
import type { Selectable } from 'kysely';
import type { DB } from '../generated/schema.ts';

/** Hàng đọc của một bảng / view (Selectable của Kysely: Generated<T> ⇒ T). */
export type Row<T extends keyof DB> = Selectable<DB[T]>;

export type WorkspaceRow = Row<'workspaces'>;
export type UserRow = Row<'users'>;
export type MemberRow = Row<'workspace_members'>;
export type AuthSessionRow = Row<'auth_sessions'>;
export type ActorRow = Row<'actors'>;
export type SettingRow = Row<'settings'>;
export type SecretRow = Row<'secrets'>;
export type PositionRow = Row<'positions'>;
export type RoleRow = Row<'roles'>;
export type DnaFieldDefRow = Row<'dna_field_defs'>;
export type DnaFieldRow = Row<'dna_fields'>;
export type DnaFieldVersionRow = Row<'dna_field_versions'>;
export type InstructionRow = Row<'instructions'>;
export type InstructionVersionRow = Row<'instruction_versions'>;
export type RevisionRow = Row<'revisions'>;
export type ChangeSetRow = Row<'change_sets'>;
export type ChangeSetItemRow = Row<'change_set_items'>;
export type EngineRow = Row<'engines'>;
export type EngineInstallRow = Row<'engine_installs'>;
export type EngineAccountRow = Row<'engine_accounts'>;
export type EngineBindingRow = Row<'engine_bindings'>;
export type ProbeRunRow = Row<'probe_runs'>;
export type CapabilityRow = Row<'capabilities'>;
export type ContainerRow = Row<'containers'>;
export type ConsentRow = Row<'consents'>;
export type SystemAgentRow = Row<'system_agents'>;
export type SessionRow = Row<'sessions'>;
export type ChatThreadRow = Row<'chat_threads'>;
export type ChatMessageRow = Row<'chat_messages'>;
export type TaskRow = Row<'tasks'>;
export type JobRow = Row<'jobs'>;
export type WalletRow = Row<'wallets'>;
export type LedgerEntryRow = Row<'ledger_entries'>;
export type RoleWoundRow = Row<'role_wounds'>;
export type TelegramBotRow = Row<'telegram_bots'>;
export type TelegramAllowlistRow = Row<'telegram_allowlist'>;
export type ProactiveSendRow = Row<'proactive_sends'>;
export type AuditRow = Row<'audit_log'>;
export type AvatarRow = Row<'avatars'>;
export type SkinAssetRow = Row<'skin_assets'>;

// view (chỉ đọc; cột biểu thức có thể là SqlValue — người gọi parse ở biên)
export type CoreAgentStatusView = Row<'v_core_agent_status'>;
export type CoreAgentAccountView = Row<'v_core_agent_accounts'>;
export type EngineAccountView = Row<'v_engine_accounts'>;
export type RoleView = Row<'v_roles'>;
export type DnaSheetView = Row<'v_dna_sheet'>;
export type RolePromptBudgetView = Row<'v_role_prompt_budget'>;
export type LeaderboardView = Row<'v_leaderboard'>;
export type RoleAvatarStateView = Row<'v_role_avatar_state'>;
export type CharacterLibraryView = Row<'v_character_library'>;
export type SetupChecklistView = Row<'v_setup_checklist'>;

/** Bảng có cột enum — union lấy thẳng từ kiểu sinh (một nguồn với CHECK của DB). */
export type RoleColor = RoleRow['color'];
export type RoleLifecycle = RoleRow['lifecycle_status'];
export type RoleRuntimeState = RoleRow['runtime_state'];
export type AccessLevel = MemberRow['access_level'];
export type TaskStatus = TaskRow['status'];
export type TaskSource = TaskRow['source'];
export type TaskPriority = TaskRow['priority'];
export type JobKind = JobRow['kind'];
export type JobStatus = JobRow['status'];
export type LedgerEntryType = LedgerEntryRow['entry_type'];
export type PenaltyClass = NonNullable<LedgerEntryRow['penalty_class']>;
export type LoginStatus = EngineAccountRow['login_status'];
export type QuotaState = EngineAccountRow['quota_state'];
export type InstallState = EngineInstallRow['install_state'];
export type ProbeTrigger = ProbeRunRow['trigger'];
export type ProbeStatus = ProbeRunRow['status'];
export type AuthMode = ProbeRunRow['auth_mode'];
export type CapabilityKind = CapabilityRow['kind'];
export type ChatThreadKind = ChatThreadRow['kind'];
export type ChatAuthorKind = ChatMessageRow['author_kind'];
export type InstructionLayer = InstructionRow['layer'];
export type ChangeSetScope = ChangeSetRow['scope'];
export type RevisionKind = RevisionRow['kind'];
export type AuditChannel = AuditRow['channel'];
export type AuditResult = AuditRow['result'];
export type SecretKind = SecretRow['kind'];
export type TelegramBotStatus = TelegramBotRow['status'];

/** Phân trang keyset theo display_seq (DATABASE §8.3): không OFFSET; tối đa 500 hàng. */
export interface PageRequest {
  /** Mặc định 100, trần 500. */
  limit?: number;
  /** display_seq của hàng cuối trang trước (trang kế = display_seq lớn hơn, hoặc nhỏ hơn khi order 'desc'). */
  after?: number;
  order?: 'asc' | 'desc';
}
export interface Page<T> {
  items: T[];
  /** null = hết. */
  nextAfter: number | null;
}
export const PAGE_MAX = 500;
export const PAGE_DEFAULT = 100;

/**
 * Ngữ cảnh audit của một giao dịch ghi (DATABASE §9.6): mọi hành động ghi qua repo tự sinh ≥ 1 dòng audit_log trong cùng
 * giao dịch, gom theo request_id. Người ghi = actor của giao dịch (app_actor()), không có tham số "by".
 */
export interface WriteOptions {
  /** Kênh của thao tác; mặc định 'system'. */
  channel?: AuditChannel;
  /** Gom mọi dòng audit của một HTTP request / lượt; mặc định = ULID mới mỗi giao dịch. */
  requestId?: string;
  /** Lý do chung (bắt buộc với thay đổi lõi, phạt, xoá — repo đòi ở từng hàm cần). */
  reason?: string;
  /** HMAC của IP (L-SEC tính) — không bao giờ IP thô. */
  ipHash?: string;
  sessionId?: string;
  taskId?: string;
  /** Tên tool MCP khi đi qua gateway. */
  tool?: string;
}
