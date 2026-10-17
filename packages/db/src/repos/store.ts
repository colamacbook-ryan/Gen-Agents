// Cửa vào tầng repos cho app (M2: L-GW, L-SYS, L-WORK, L-OPS). Một giao dịch = một hàm đồng bộ nhận `tx`; mọi repo trong
// `tx` dùng chung giao dịch đó (không lồng, không await, không gọi mạng / LLM bên trong — DATABASE §10.7).
//
//   store.write(actorId, (tx) => { const r = tx.roles.create(…); tx.jobs.enqueue(…); return r; }, { channel: 'web', requestId })
//   store.read(workspaceId, (tx) => tx.roles.list())
//
// - Phạm vi tenant: tx.workspaceId = workspace của actor ghi (actors.workspace_id) — repo không nhận workspace_id từ ngoài,
//   id thuộc workspace khác ⇒ 'repo.not_found' (DATABASE §9.7 "mọi truy vấn qua repository bắt buộc workspace_id").
// - Người ghi: app_actor() = actorId (conn.write); repo tự điền *_by từ đó (CNS-176).
// - Audit: mọi hàm ghi của repo tự nối ≥ 1 dòng audit_log (chuỗi HMAC) trong cùng giao dịch, theo WriteOptions.
// - Lỗi: DbRuleError (rule ổn định + code contracts); giao dịch rollback toàn bộ. Không hàm nào nuốt lỗi.
import type { ActorSystemKey, Clock, SeedReference } from '@ga/contracts';
import type { SeedApplyResult } from '../seed/reference.ts';
import type { AuditReads, AuditRepo } from './audit.ts';
import type { AvatarReads, AvatarRepo } from './avatar.ts';
import type { EngineReads, EngineRepo } from './engines.ts';
import type {
  ChangeSetReads,
  ChangeSetRepo,
  DnaReads,
  InstructionReads,
  RevisionReads,
  RoleReads,
  RoleRepo,
} from './roles.ts';
import type { ChatReads, ChatRepo, SessionReads, SessionRepo } from './sessions.ts';
import type { TelegramReads, TelegramRepo } from './telegram.ts';
import type { ToolReads, ToolRepo } from './tools.ts';
import type { ActorRow, UserRow, WorkspaceRow, WriteOptions } from './types.ts';
import type { WalletReads, WalletRepo } from './wallet.ts';
import type { JobReads, JobRepo, TaskReads, TaskRepo } from './work.ts';
import type {
  AuthSessionReads,
  AuthSessionRepo,
  SecretReads,
  SecretRepo,
  SettingsReads,
  SettingsRepo,
  UserReads,
  UserRepo,
  WorkspaceReads,
  WorkspaceRepo,
} from './workspace.ts';

export interface ReadTx {
  readonly workspaceId: string;
  /** app_now() của giao dịch (đồng hồ inject được). */
  now(): string;
  readonly workspace: WorkspaceReads;
  readonly users: UserReads;
  readonly authSessions: AuthSessionReads;
  readonly settings: SettingsReads;
  readonly secrets: SecretReads;
  readonly roles: RoleReads;
  readonly dna: DnaReads;
  readonly instructions: InstructionReads;
  readonly revisions: RevisionReads;
  readonly changeSets: ChangeSetReads;
  readonly engines: EngineReads;
  readonly sessions: SessionReads;
  readonly chat: ChatReads;
  readonly tasks: TaskReads;
  readonly jobs: JobReads;
  readonly wallet: WalletReads;
  readonly telegram: TelegramReads;
  readonly tools: ToolReads;
  readonly audit: AuditReads;
  readonly avatar: AvatarReads;
}

export interface WriteTx extends ReadTx {
  /** Actor của giao dịch (= app_actor()). */
  readonly actorId: string;
  readonly actor: ActorRow;
  readonly options: Readonly<Required<Pick<WriteOptions, 'channel' | 'requestId'>>> & WriteOptions;
  readonly workspace: WorkspaceRepo;
  readonly users: UserRepo;
  readonly authSessions: AuthSessionRepo;
  readonly settings: SettingsRepo;
  readonly secrets: SecretRepo;
  readonly roles: RoleRepo;
  readonly changeSets: ChangeSetRepo;
  readonly engines: EngineRepo;
  readonly sessions: SessionRepo;
  readonly chat: ChatRepo;
  readonly tasks: TaskRepo;
  readonly jobs: JobRepo;
  readonly wallet: WalletRepo;
  readonly telegram: TelegramRepo;
  readonly tools: ToolRepo;
  readonly audit: AuditRepo;
  readonly avatar: AvatarRepo;
}

export interface CreateUserInput {
  username: string;
  displayName: string;
  /** argon2id (L-SEC). Mật khẩu thô không bao giờ tới đây. */
  passwordHash: string;
  mustChangePassword?: boolean;
  email?: string | null;
  locale?: string | null;
  timezone?: string | null;
}

export interface CreateTenantInput {
  slug: string;
  name: string;
  /** 4 ký tự (CHECK) — dùng cho tên container ga-sys-<short_code>. */
  shortCode: string;
  ownerUserId: string;
  locale?: string;
  timezone?: string;
}

export interface CreatedTenant {
  workspace: WorkspaceRow;
  systemActorId: string;
  ownerActorId: string;
  seed: SeedApplyResult;
}

export interface DataStore {
  readonly clock: Clock;
  /** Đọc trên kết nối chỉ đọc, phạm vi một workspace; `fn` thấy một snapshot nhất quán. */
  read<T>(workspaceId: string, fn: (tx: ReadTx) => T): T;
  /** Cửa ghi duy nhất của app (conn.write). actorId = ULID hàng actors (người, Role, actor system). */
  write<T>(actorId: string, fn: (tx: WriteTx) => T, options?: WriteOptions): T;
  /** id actor system của workspace theo khoá (job / tiến trình). Thiếu ⇒ 'repo.not_found'. */
  systemActorId(workspaceId: string, key?: ActorSystemKey): string;

  // — dựng bản cài / workspace (khi chưa có actor để gọi write; dùng conn.bootstrap bên trong) —
  /** Lần cài đầu: seed tham chiếu global (workspace hệ thống, actor hệ thống, engines, DNA chuẩn). Chạy lại = không đổi. */
  installGlobal(seed: SeedReference): SeedApplyResult;
  /** Tạo user (US-, bộ đếm ở workspace hệ thống) — trước Onboarding (owner đầu tiên). */
  createUser(input: CreateUserInput): UserRow;
  /**
   * Tạo workspace tenant + actor hệ thống (10 khoá) + owner (thành viên + actor user) rồi áp seed perWorkspace.
   * Hai giao dịch bootstrap (L0 chưa có lối chèn hàng `workspaces` vào giao dịch seed): bước seed idempotent —
   * gián đoạn giữa chừng ⇒ gọi lại ensureWorkspaceSeed.
   */
  createTenant(input: CreateTenantInput, seed: SeedReference): CreatedTenant;
  ensureWorkspaceSeed(workspaceId: string, seed: SeedReference): SeedApplyResult;
  /** Workspace tenant đang có (thường một ở bản self-host). */
  tenants(): WorkspaceRow[];
}
