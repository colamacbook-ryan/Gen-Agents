// Mã lỗi API + ánh xạ lỗi DB → mã i18n (BUILD-PLAN §D.3, G-03).
// Logic nghiệp vụ nằm trong ~400 trigger; lỗi trả về là chuỗi tự do `RAISE(ABORT, '…')`. Cho tới khi lane DB thêm mã ổn định
// (G-03, tiền tố kiểu `GA-E…`), ánh xạ theo TIỀN TỐ chuỗi. Chuỗi gốc chỉ vào log (đã che), không hiện cho người dùng.

export const API_ERROR_CODES = [
  'auth.required',
  'auth.csrf',
  'auth.rate_limited',
  'auth.must_change_password',
  'recovery.blocked',
  'validation.failed',
  'not_found',
  'conflict',
  'internal',
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
  error: { code: ApiErrorCode | DbErrorCode; i18nKey: string; requestId: string };
}

export function i18nKeyFor(code: ApiErrorCode | DbErrorCode): string {
  return `errors.${code}`;
}
