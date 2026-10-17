// RecoveryProvider GIẢ (CHỈ TEST) — cùng hình với `RecoveryProvider` của apps/control-plane/src/http/recovery.ts (khớp kiểu
// cấu trúc; typecheck của test control-plane giữ hai bên đồng bộ). Chuyển được sang `recovery` với từng lý do O4.
//   O4_REASONS = mọi giá trị `v_core_agent_status.reason` của DB (db/spec/views_v2_2.sql) — test parity giữ đồng bộ.
//   Hợp đồng CHƯA có enum này (SYS-08 `reason: KeyStr`) — đề xuất cho L-API.

export const O4_REASONS = [
  'no_account',
  'wrong_type',
  'container_missing',
  'consent_missing',
  'binding_disabled',
  'account_disabled',
  'account_revoked',
  'login_expired',
  'login_suspended',
  'login_error',
  'login_unknown',
  'outage',
  'quota_exhausted',
  'login_check_missing',
  'login_check_failed',
  'login_check_partial',
  'relogin_in_progress',
  'type_change_in_progress',
  'login_stalled',
  'engine_not_installed',
  'engine_unrestricted',
] as const;
export type O4Reason = (typeof O4_REASONS)[number];

export type FakeRecoveryMode = 'setup' | 'ok' | 'recovery';

export interface FakeRecoveryState {
  mode: FakeRecoveryMode;
  reason: string | null;
}

export class FakeRecoveryProvider {
  private state_: FakeRecoveryState = { mode: 'ok', reason: null };
  private readonly perWorkspace = new Map<string, FakeRecoveryState>();
  /** Kết quả của `isCoreAgentTarget` (route `o4 = core`). */
  coreTarget = false;
  /** Ném lỗi ở `state()` (kiểm fail-closed của guard). */
  throwOnState = false;
  readonly coreCalls: Array<{ workspaceId: string; routeId: string; params: unknown }> = [];

  setOk(workspaceId?: string): this {
    return this.set({ mode: 'ok', reason: null }, workspaceId);
  }
  setSetup(workspaceId?: string): this {
    return this.set({ mode: 'setup', reason: 'no_account' }, workspaceId);
  }
  setRecovery(reason: O4Reason, workspaceId?: string): this {
    return this.set({ mode: 'recovery', reason }, workspaceId);
  }
  private set(s: FakeRecoveryState, workspaceId?: string): this {
    if (workspaceId === undefined) {
      this.state_ = s;
      this.perWorkspace.clear();
    } else this.perWorkspace.set(workspaceId, s);
    return this;
  }

  state(workspaceId: string): FakeRecoveryState {
    if (this.throwOnState) throw new Error('fake recovery: state() lỗi (kiểm fail-closed)');
    return { ...(this.perWorkspace.get(workspaceId) ?? this.state_) };
  }

  isCoreAgentTarget(input: { workspaceId: string; route: { id: string }; params: unknown }): boolean {
    this.coreCalls.push({ workspaceId: input.workspaceId, routeId: input.route.id, params: input.params });
    return this.coreTarget;
  }
}
