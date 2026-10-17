// Họ ví / sổ cái ₲ (DATABASE §5.10, §9.4). Sổ kép: mỗi bút toán trừ một ví, cộng một ví; số dư sau bút toán do repo tính
// trong giao dịch (writer duy nhất ⇒ tất định), trigger DB kiểm lại + cập nhật wallets + mở / đóng Trọng thương.
// recorded_by = actor của giao dịch (DB v2.3.3 ép). Không có lối sửa balance_minor trực tiếp ('ledger.direct_balance').
import type {
  LeaderboardView,
  LedgerEntryRow,
  LedgerEntryType,
  Page,
  PageRequest,
  PenaltyClass,
  RoleWoundRow,
  WalletRow,
} from './types.ts';

export interface WalletReads {
  get(walletId: string): WalletRow | null;
  /** Ví sống của Role (owner_kind 'role'). */
  forRole(roleId: string): WalletRow | null;
  /** Kho bạc (WL-0001 của seed). */
  treasury(): WalletRow;
  /** Sink (nơi tiền phạt / chi phí đi vào). */
  sink(): WalletRow;
  entry(entryId: string): LedgerEntryRow | null;
  entryByIdempotencyKey(key: string): LedgerEntryRow | null;
  /** Sao kê theo display_seq (thứ tự sổ). */
  entries(filter: { walletId?: string; roleId?: string; page?: PageRequest }): Page<LedgerEntryRow>;
  leaderboard(): LeaderboardView[];
  /** Lần Trọng thương đang mở của Role (ended_at NULL). */
  openWound(roleId: string): RoleWoundRow | null;
  wounds(roleId: string): RoleWoundRow[];
}

export interface PostLedgerInput {
  entryType: LedgerEntryType;
  debitWalletId: string;
  creditWalletId: string;
  /** Đơn vị minor (1 ₲ = 100), > 0. */
  amountMinor: number;
  reason: string;
  roleId?: string | null;
  taskId?: string | null;
  sessionId?: string | null;
  commitmentId?: string | null;
  skillId?: string | null;
  cardId?: string | null;
  /** Phạt: hạng + (tuỳ hạng) tỉ lệ bp; basis_balance_minor = số dư hiện tại của ví bị phạt (repo tự điền khi có rateBp). */
  penalty?: { penaltyClass: PenaltyClass; rateBp?: number | null } | null;
  /** Bằng chứng audit: repo chụp display_id + row_hash (evidence_hash) của dòng audit đó. */
  evidenceAuditId?: string | null;
  reversesEntryId?: string | null;
  // Không có tham số approvedBy (review bảo mật MEDIUM): danh tính người duyệt không được nhận từ tham số. Duyệt thứ hai là
  // bước riêng do chính người duyệt ghi — ledger_entries append-only nên cần thay đổi DB (đề xuất lane DB), M1 approved_by = NULL.
  /** Trùng khoá ⇒ DB từ chối 'unique.duplicate'; gọi entryByIdempotencyKey trước nếu muốn idempotent. */
  idempotencyKey?: string | null;
}

export interface WalletRepo extends WalletReads {
  /** Ví Role (WL-) — một ví sống mỗi Role. */
  openRoleWallet(roleId: string): WalletRow;
  /** Ghi một bút toán; DB ép mọi luật kinh tế (mã 'ledger.*', 'role.wounded'…). */
  post(input: PostLedgerInput): LedgerEntryRow;
}
