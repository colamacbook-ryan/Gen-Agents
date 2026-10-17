import type { EngineInstallState, TurnOutcome } from '@ga/contracts';

// Chính sách fallback (PRODUCT-SPEC §8.4 bảng `failover_reason` — nguồn duy nhất; §6.1 A5; INT-05, INT-20; BUILD-PLAN §B.5 bước 7).
// - Chỉ Role mới fallback, và chỉ giữa các LOẠI CLI của chính Role, theo thứ tự ưu tiên của Role. Không fallback trong
//   cùng một loại (mỗi loại một tài khoản; đổi tài khoản là thủ công).
// - Core agent (AI hệ thống) KHÔNG fallback dưới mọi hình thức ⇒ chế độ khắc phục O4 (INT-20).
// - Role chỉ có một loại CLI ⇒ không fallback, việc chờ, báo owner. Tài khoản đang đăng nhập lại (`in_progress`) ⇒ chờ.
// - `account_suspended` vẫn fallback, kèm cảnh báo đỏ (Q-R8c).
// Hàm thuần: không đọc DB, không gửi gì. Người gọi (L-GW) ghi events.engine.failover, audit, toast, Telegram.

/** = CHECK `events.failover_reason` (DB) = lý do của TurnEvent 'failover' (contracts/sessions.ts). */
export const FAILOVER_REASONS = ['login_expired', 'outage', 'quota_exhausted', 'account_suspended'] as const;
export type FailoverReason = (typeof FAILOVER_REASONS)[number];

/** = CHECK `engine_accounts.login_status`. */
export type AccountLoginStatus = 'logged_in' | 'expired' | 'suspended' | 'error' | 'unknown' | 'in_progress';
/** = CHECK `engine_accounts.quota_state`. */
export type AccountQuotaState = 'ok' | 'low' | 'exhausted' | 'unknown';

/** Một binding (EB-) của consumer kèm trạng thái tài khoản / cài đặt — L-GW dựng từ DB. */
export interface FailoverCandidate {
  bindingId: string;
  engineAccountId: string;
  /** Loại CLI (engines.slug). */
  engineSlug: string;
  /** ≥ 1, nhỏ hơn = ưu tiên hơn (engine_bindings.priority). */
  priority: number;
  enabled: boolean;
  loginStatus: AccountLoginStatus;
  quotaState: AccountQuotaState;
  /** engine_installs của loại CLI này (thiếu hàng = not_installed). */
  installState: EngineInstallState;
  /** Có adapter và engines.adapter_status ∈ {ready, beta}. */
  adapterAvailable: boolean;
}

export type FailoverConsumer = 'role' | 'core_agent';

export interface FailoverInput {
  consumer: FailoverConsumer;
  /** Kết quả phân loại của lần chạy vừa rồi (adapter.classify). */
  outcome: TurnOutcome;
  /** Binding vừa chạy. */
  current: FailoverCandidate;
  /** Mọi binding của consumer (có thể gồm current). */
  bindings: readonly FailoverCandidate[];
  /** Binding đã chạy trong lượt này (gồm current) — chống vòng lặp. */
  attemptedBindingIds: readonly string[];
}

export type FailoverDecision =
  | { action: 'none' }
  /** Không phải lý do fallback (lỗi tạm): người gọi tự quyết thử lại cùng CLI hay kết thúc lượt. */
  | { action: 'not_failover_reason' }
  /** Core agent gặp sự cố ⇒ chế độ khắc phục O4, không fallback (INT-20). */
  | { action: 'recovery'; reason: FailoverReason }
  | { action: 'wait'; reason: FailoverReason; why: 'login_in_progress' | 'single_cli' | 'no_eligible_cli' }
  | { action: 'failover'; reason: FailoverReason; to: FailoverCandidate; severity: 'warn' | 'danger' };

/**
 * Kết quả lượt ⇒ lý do fallback. `AUTH_REQUIRED` (CLI báo cần đăng nhập) với một tài khoản đã gán = phiên đăng nhập
 * không còn dùng được ⇒ `login_expired` [ĐỀ XUẤT — L-ENG]. `transient` / `ok` ⇒ null.
 */
export function failoverReasonFor(outcome: TurnOutcome): FailoverReason | null {
  switch (outcome) {
    case 'ok':
    case 'transient':
      return null;
    case 'AUTH_REQUIRED':
    case 'login_expired':
      return 'login_expired';
    case 'outage':
      return 'outage';
    case 'quota_exhausted':
      return 'quota_exhausted';
    case 'account_suspended':
      return 'account_suspended';
  }
}

const UNUSABLE_LOGIN: ReadonlySet<AccountLoginStatus> = new Set(['expired', 'suspended', 'error', 'in_progress']);

/** Binding chạy được ngay: bật, CLI đã cài, có adapter, tài khoản không ở trạng thái hỏng đã biết, chưa hết quota. */
export function isRunnable(b: FailoverCandidate): boolean {
  return (
    b.enabled &&
    b.installState === 'installed' &&
    b.adapterAvailable &&
    !UNUSABLE_LOGIN.has(b.loginStatus) &&
    b.quotaState !== 'exhausted'
  );
}

function byPriority(a: FailoverCandidate, b: FailoverCandidate): number {
  return a.priority - b.priority || (a.bindingId < b.bindingId ? -1 : a.bindingId > b.bindingId ? 1 : 0);
}

/** Binding bắt đầu lượt mới: ưu tiên cao nhất chạy được ("quay về ưu tiên 1" khi CLI ưu tiên 1 hồi lại). */
export function pickStartBinding(bindings: readonly FailoverCandidate[]): FailoverCandidate | null {
  return [...bindings].filter(isRunnable).sort(byPriority)[0] ?? null;
}

export function decideFailover(input: FailoverInput): FailoverDecision {
  if (input.outcome === 'ok') return { action: 'none' };
  const reason = failoverReasonFor(input.outcome);
  if (reason === null) return { action: 'not_failover_reason' };
  if (input.consumer === 'core_agent') return { action: 'recovery', reason };

  // Role: owner đang đăng nhập lại tài khoản này ⇒ chờ, không fallback (PS §8.4, ⑥-03).
  if (input.current.loginStatus === 'in_progress') return { action: 'wait', reason, why: 'login_in_progress' };

  const types = new Set(input.bindings.filter((b) => b.enabled).map((b) => b.engineSlug));
  types.add(input.current.engineSlug);
  if (types.size < 2) return { action: 'wait', reason, why: 'single_cli' };

  const attempted = new Set(input.attemptedBindingIds);
  attempted.add(input.current.bindingId);
  const triedTypes = new Set(input.bindings.filter((b) => attempted.has(b.bindingId)).map((b) => b.engineSlug));
  triedTypes.add(input.current.engineSlug);
  const next = input.bindings
    .filter((b) => !attempted.has(b.bindingId) && !triedTypes.has(b.engineSlug) && isRunnable(b))
    .sort(byPriority)[0];
  if (next === undefined) return { action: 'wait', reason, why: 'no_eligible_cli' };
  return { action: 'failover', reason, to: next, severity: reason === 'account_suspended' ? 'danger' : 'warn' };
}
