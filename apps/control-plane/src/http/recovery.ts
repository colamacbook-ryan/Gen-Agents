// RecoveryGuard O4 (BUILD-PLAN §B.8; BACKEND-TRIAL §3.0): khi `mode = recovery` chỉ route có cờ `recovery` của registry
// đi qua (`recoveryDecision` của contracts — MỘT nguồn). L-SYS viết provider thật (đọc `v_core_agent_status`); ở đây là
// interface + mặc định FAIL-CLOSED: không có provider / provider lỗi / workspace không xác định ⇒ coi như đang recovery.
//   - Route `o4 = core` (✓* chỉ với tài khoản Core agent): quyết ở pha SAU validate — provider chỉ nhận input ĐÃ kiểm
//     (`isCoreAgentTarget`), không đoán theo chữ thô; lỗi / false ⇒ chặn.
//   - Guard đọc `mode` (không suy từ `reason`): mọi lý do O4 cùng một allowlist.
import { type Route, recoveryDecision } from '@ga/contracts';

export type RecoveryMode = 'setup' | 'ok' | 'recovery';

export interface RecoveryState {
  /** = `v_core_agent_status.mode`. */
  mode: RecoveryMode;
  /** = `v_core_agent_status.reason` (để log / test); guard không quyết theo trường này. */
  reason: string | null;
}

export interface CoreTargetInput {
  workspaceId: string;
  route: Route;
  params: unknown;
  query: unknown;
  body: unknown;
}

export interface RecoveryProvider {
  state(workspaceId: string): RecoveryState | Promise<RecoveryState>;
  /** Route `o4 = core` khi recovery: đích của request có phải tài khoản Core agent (tra DB theo ref đã validate)? */
  isCoreAgentTarget(input: CoreTargetInput): boolean | Promise<boolean>;
}

/** Không có provider (cấu hình thiếu) ⇒ luôn recovery, không đích nào là Core agent. */
export const FAIL_CLOSED_RECOVERY: RecoveryProvider = Object.freeze({
  state: (): RecoveryState => ({ mode: 'recovery', reason: 'provider_missing' }),
  isCoreAgentTarget: () => false,
});

export type GuardOutcome = 'allow' | 'blocked' | 'defer_core';

/** Trạng thái của workspace; provider ném / trả rác ⇒ recovery (fail-closed). `null` workspace (route public) ⇒ recovery. */
export async function recoveryStateOf(provider: RecoveryProvider, workspaceId: string | null): Promise<RecoveryState> {
  if (workspaceId === null) return { mode: 'recovery', reason: 'no_workspace' };
  try {
    const s = await provider.state(workspaceId);
    if (s && (s.mode === 'ok' || s.mode === 'setup' || s.mode === 'recovery')) return s;
    return { mode: 'recovery', reason: 'provider_invalid' };
  } catch {
    return { mode: 'recovery', reason: 'provider_error' };
  }
}

/** Pha 1 (trước validate): `allow`, `blocked` (423) hoặc `defer_core` (route core — quyết sau validate). */
export function guardBeforeValidation(route: Route, state: RecoveryState): GuardOutcome {
  if (state.mode !== 'recovery') return 'allow';
  if (recoveryDecision(route, { isCoreAgentAccount: false }) === 'allow') return 'allow';
  if (route.recovery && route.recoveryCoreOnly) return 'defer_core';
  return 'blocked';
}

/** Pha 2 (sau validate) cho route core: hỏi provider; lỗi ⇒ false ⇒ chặn. */
export async function guardCoreTarget(provider: RecoveryProvider, input: CoreTargetInput): Promise<boolean> {
  let isCore = false;
  try {
    isCore = (await provider.isCoreAgentTarget(input)) === true;
  } catch {
    isCore = false;
  }
  return recoveryDecision(input.route, { isCoreAgentAccount: isCore }) === 'allow';
}
