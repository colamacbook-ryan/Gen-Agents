// Họ workspace / owner / settings / bí mật (DATABASE §5.1, §5.20, §9.7). Mọi hàm chạy trong phạm vi workspace của
// giao dịch (tx.workspaceId = workspace của actor ghi, hoặc workspace truyền cho store.read) — không có tham số workspace.
import type { ActorSystemKey, parseSettingValue, SettingKey } from '@ga/contracts';
import type {
  AccessLevel,
  ActorRow,
  AuthSessionRow,
  MemberRow,
  SecretKind,
  SecretRow,
  SettingRow,
  SetupChecklistView,
  UserRow,
  WorkspaceRow,
} from './types.ts';

export interface WorkspaceReads {
  /** Workspace của giao dịch. */
  get(): WorkspaceRow;
  members(): MemberRow[];
  member(userId: string): MemberRow | null;
  /** Owner đang hoạt động (workspace_members access_level 'owner', removed_at NULL) + actor user của họ. */
  owner(): { user: UserRow; member: MemberRow; actor: ActorRow } | null;
  actor(actorId: string): ActorRow | null;
  /** Actor system theo khoá; thiếu ⇒ DbRuleError 'repo.not_found' (không ghi vô danh). */
  systemActor(key?: ActorSystemKey): ActorRow;
  actorForUser(userId: string): ActorRow | null;
  actorForRole(roleId: string): ActorRow | null;
  /** v_setup_checklist (OB-01…OB-07). */
  setupChecklist(): SetupChecklistView[];
}

export interface WorkspaceRepo extends WorkspaceReads {
  update(patch: { name?: string; locale?: string; timezone?: string }): WorkspaceRow;
  /** Thêm thành viên + actor kind 'user' (UNIQUE (workspace_id, user_id)). MVP: chỉ một owner; admin cho GĐ2. */
  addMember(input: { userId: string; accessLevel: AccessLevel }): { member: MemberRow; actor: ActorRow };
  setAccessLevel(userId: string, accessLevel: AccessLevel): MemberRow;
  removeMember(userId: string): MemberRow;
}

/** users là bảng toàn cục (bộ đếm US- ở workspace hệ thống). */
export interface UserReads {
  get(userId: string): UserRow | null;
  byUsername(username: string): UserRow | null;
}

export interface UserRepo extends UserReads {
  /** Đổi mật khẩu (hash do L-SEC tính, argon2id) — đặt password_changed_at, reset bộ đếm sai. */
  setPassword(userId: string, input: { passwordHash: string; mustChangePassword: boolean }): UserRow;
  recordLoginSuccess(userId: string): UserRow;
  /** Tăng failed_login_count; `lockUntil` (ts) do chính sách L-SEC quyết. */
  recordLoginFailure(userId: string, input: { lockUntil?: string | null }): UserRow;
  updateProfile(
    userId: string,
    patch: { displayName?: string; email?: string | null; locale?: string | null; timezone?: string | null },
  ): UserRow;
}

export interface AuthSessionReads {
  byTokenHash(tokenHash: string): AuthSessionRow | null;
}

export interface AuthSessionRepo extends AuthSessionReads {
  /** token_hash = băm của token phiên (token thô không bao giờ vào DB). */
  create(input: {
    userId: string;
    tokenHash: string;
    expiresAt: string;
    ip?: string | null;
    userAgent?: string | null;
  }): AuthSessionRow;
  touch(id: string, input?: { expiresAt?: string }): AuthSessionRow;
  revoke(id: string): AuthSessionRow;
  revokeAllForUser(userId: string): number;
}

/** Kiểu giá trị của một khoá (= zod schema của contracts; @ga/db không import zod). */
export type SettingValue<K extends SettingKey> = ReturnType<typeof parseSettingValue<K>>;

export interface SettingsReads {
  /**
   * Giá trị đã parse (zod của contracts). Không có hàng ⇒ mặc định của registry; mặc định 'seed' / 'absent' ⇒ null.
   * Hàng có giá trị không qua schema ⇒ DbRuleError 'repo.invalid_input' (không trả giá trị hỏng).
   */
  get<K extends SettingKey>(key: K): SettingValue<K> | null;
  row(key: SettingKey): SettingRow | null;
  list(): SettingRow[];
}

export interface SettingsRepo extends SettingsReads {
  /** Kiểm bằng schema contracts rồi INSERT (cấp ST-) hoặc UPDATE hàng sống. DB là chốt cuối (người ghi, giá trị). */
  set<K extends SettingKey>(key: K, value: SettingValue<K>): SettingRow;
  /** Xoá mềm (về mặc định). */
  remove(key: SettingKey): void;
}

/** Bí mật đã niêm phong bằng envelope AES-256-GCM (L-SEC) — repo chỉ lưu, không bao giờ giải mã. */
export interface SealedSecretInput {
  kind: SecretKind;
  label: string;
  ciphertext: Buffer;
  nonce: Buffer;
  wrappedDek: Buffer;
  dekNonce: Buffer;
  kekId: string;
  alg?: string;
  last4?: string | null;
  fingerprint: string;
  /** Bắt buộc với kind 'anchor_remote_token' (CHECK), cấm với kind khác. */
  allowedHost?: string | null;
  rotatedFromId?: string | null;
}

export interface SecretReads {
  get(secretId: string): SecretRow | null;
  list(filter?: { kind?: SecretKind; status?: SecretRow['status'] }): SecretRow[];
}

export interface SecretRepo extends SecretReads {
  create(input: SealedSecretInput): SecretRow;
  revoke(secretId: string): SecretRow;
  markUsed(secretId: string): void;
}
