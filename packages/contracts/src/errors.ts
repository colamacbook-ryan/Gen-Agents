// Mã lỗi API + ánh xạ lỗi DB → mã i18n (BUILD-PLAN §D.3, G-03).
// Logic nghiệp vụ nằm trong ~400 trigger; lỗi trả về là chuỗi tự do `RAISE(ABORT, '…')`. Cho tới khi lane DB thêm mã ổn định
// (G-03, tiền tố kiểu `GA-E…`), ánh xạ theo TIỀN TỐ chuỗi. Chuỗi gốc chỉ vào log (đã che), không hiện cho người dùng.

export const API_ERROR_CODES = [
  'auth.required',
  'auth.csrf',
  'auth.rate_limited',
  'auth.must_change_password',
  /** Sai tên đăng nhập / mật khẩu (không nói phần nào sai). L-SEC đề xuất. */
  'auth.invalid_credentials',
  /** Tài khoản tạm khoá sau nhiều lần sai. */
  'auth.locked',
  /** Mật khẩu mới không đạt chính sách độ mạnh. */
  'auth.weak_password',
  'recovery.blocked',
  'validation.failed',
  'not_found',
  'conflict',
  'internal',
  // ---- BACKEND-TRIAL §3.0 (L-API, M2): mã mới của hợp đồng `api/*`; bảng HTTP ở `api/common.ts` (`API_ERROR_HTTP`).
  /** Đủ phiên nhưng thiếu quyền (admin gọi route chỉ owner). */
  'auth.forbidden',
  /** Tạo Role / phiên AI Hệ thống / thử việc khi Core agent chưa sẵn sàng (DB `roles_core_agent_ready_i`). */
  'gate.core_agent_not_ready',
  /** SYS-07 khi còn mục OB `err`. */
  'gate.onboarding_incomplete',
  /** Cổng Ký (`detail.reason`: unconfirmed_inferred | budget_exceeded). */
  'gate.sign_blocked',
  /** Cổng Cấp thẻ (`detail.reason` = khoá của `card_block_reason`). */
  'gate.card_blocked',
  /** Thiếu đồng ý Clause 6. */
  'consent.required',
  /** `noticeHash` không khớp văn bản của `noticeVersion`. */
  'consent.notice_mismatch',
  /** CLI chưa cài hoặc đang cài (`detail.reason`: not_installed | installing | failed). */
  'engine.not_installed',
  /** Đã có PTY đang mở cho tài khoản này. */
  'engine.login_busy',
  /** Model / effort không có trong registry của tài khoản (STD-10). */
  'capability.unavailable',
  /** `runTurn` từ chối; `detail.reason` ∈ TURN_REJECTIONS. */
  'turn.rejected',
  /** Đổi loại Core agent khi không phải sự cố. */
  'recovery.not_incident',
  /** `getMe` thất bại. */
  'telegram.token_invalid',
  /** Cửa sổ bắt user ID 5 phút đã hết. */
  'telegram.capture_expired',
  /** Mã 6 chữ số sai (`detail.attemptsLeft`). */
  'telegram.code_invalid',
  /** Mã 6 chữ số hết hạn 10 phút. */
  'telegram.code_expired',
  /** Vượt trần ST-0018 hoặc avatar 5 MB. */
  'upload.too_large',
  'upload.type_rejected',
  /** Tệp chưa `clean`. */
  'upload.not_clean',
  /** Ô truy vấn sai ngữ pháp hoặc cột ngoài whitelist (DATABASE §8.2). */
  'query.invalid',
  /** `ConfirmName` sai (bước 2 của ConfirmModal). */
  'confirm.mismatch',
  /** Cùng `Idempotency-Key`, khác body. */
  'idempotency.conflict',
  /** Quá `economy.reflection_max_runs`. */
  'reflection.limit',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const DB_ERROR_CODES = [
  'db.replace_forbidden',
  'db.immutable_identity',
  'db.append_only',
  'db.ledger_rule',
  'db.tenant_mismatch',
  'db.wounded',
  'db.settings_invalid',
  'db.core_agent_rule',
  'db.character_library',
  'db.fk_violation',
  'db.conflict',
  'db.check_failed',
  'db.required',
  'db.readonly',
  /** Kết nối thiếu hàm app_* (vi phạm hợp đồng kết nối ⑥-05) — fail-closed. */
  'db.connection_contract',
  'db.rule_violation',
] as const;
export type DbErrorCode = (typeof DB_ERROR_CODES)[number];

/** Thứ tự quan trọng: mục đầu tiên khớp thắng. `prefix` so với đầu chuỗi lỗi (SQLite có thể thêm tiền tố — đã bỏ ở normalize). */
export const DB_ERROR_RULES: ReadonlyArray<{ match: RegExp; code: DbErrorCode }> = [
  { match: /^UNIQUE \(chống REPLACE/, code: 'db.replace_forbidden' },
  { match: /^immutable identity/, code: 'db.immutable_identity' },
  { match: /^append-only/, code: 'db.append_only' },
  { match: /^(ledger|wallets\.balance_minor)/, code: 'db.ledger_rule' },
  { match: /^tenant/, code: 'db.tenant_mismatch' },
  { match: /^Role đang Trọng thương/, code: 'db.wounded' },
  { match: /^settings/, code: 'db.settings_invalid' },
  { match: /^INT-20/, code: 'db.core_agent_rule' },
  { match: /^Kho nhân vật/, code: 'db.character_library' },
  { match: /^FOREIGN KEY constraint failed/, code: 'db.fk_violation' },
  { match: /^UNIQUE constraint failed/, code: 'db.conflict' },
  { match: /^CHECK constraint failed/, code: 'db.check_failed' },
  { match: /^NOT NULL constraint failed/, code: 'db.required' },
  { match: /^attempt to write a readonly database/, code: 'db.readonly' },
  { match: /^no such function: app_/, code: 'db.connection_contract' },
];

export function mapDbError(message: string): DbErrorCode {
  const m = message.trim();
  for (const rule of DB_ERROR_RULES) {
    if (rule.match.test(m)) return rule.code;
  }
  return 'db.rule_violation';
}

/** Lỗi API trả cho client: chỉ mã + khoá i18n, không lộ chuỗi DB / stack. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode | DbErrorCode;
    i18nKey: string;
    requestId: string;
    /** BACKEND-TRIAL §3.0: chỉ khoá enum hoặc số (`reason`, `field`, `attemptsLeft`, `gate`, `retryAfterS`) — không chuỗi DB / stack. */
    detail?: Readonly<Record<string, string | number>>;
  };
}

export function i18nKeyFor(code: ApiErrorCode | DbErrorCode): string {
  return `errors.${code}`;
}
