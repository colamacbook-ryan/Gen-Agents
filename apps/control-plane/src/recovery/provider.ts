// RecoveryProvider THẬT (HANDLER-OBLIGATIONS #4, BUILD-PLAN §B.8): O4 tính từ `v_core_agent_status` của DB.
//   - `state`: `mode` của view (`setup` | `ok` | `recovery`); không có hàng / giá trị lạ / lỗi đọc ⇒ `recovery` (fail-closed).
//   - `isCoreAgentTarget` (route `o4 = core`, input ĐÃ validate): `params.accountRef` ⇒ tra trong workspace (ctx.ref — 404 nếu
//     khác workspace) ⇒ đúng khi tài khoản ∈ `v_core_agent_accounts` (tài khoản có binding Hệ thống). Route core KHÔNG có
//     accountRef: chỉ những route danh sách mà handler tự lọc về hàng Core agent (GW-05 — nghĩa vụ #4 của L-GW); còn lại ⇒ false.
//   - Mọi quyết định chỉ dựa trên cột có cấu trúc của DB, không dựa trên chữ (`reason_text` / `overlay_text`).
import type { AppConnection } from '@ga/db';
import type { DataStore, ReadTx } from '@ga/db/repos';
import { resolveRef } from '../context/ref.ts';
import type { CoreTargetInput, RecoveryMode, RecoveryProvider, RecoveryState } from '../http/recovery.ts';

const MODES: ReadonlySet<string> = new Set<RecoveryMode>(['setup', 'ok', 'recovery']);

/** Route `o4 = core` không mang accountRef mà handler tự lọc về Core agent khi recovery (nghĩa vụ #4). */
export const CORE_LIST_ROUTES: ReadonlySet<string> = new Set(['GW-05']);

export interface DbRecoveryDeps {
  store: DataStore;
  /** Kết nối CHỈ ĐỌC (tra ref). */
  reader: AppConnection;
}

export function createDbRecoveryProvider(deps: DbRecoveryDeps): RecoveryProvider {
  return Object.freeze({
    state(workspaceId: string): RecoveryState {
      let v: ReturnType<ReadTx['engines']['coreAgentStatus']>;
      try {
        v = deps.store.read(workspaceId, (tx) => tx.engines.coreAgentStatus());
      } catch {
        return { mode: 'recovery', reason: 'status_error' };
      }
      const mode = v?.mode;
      if (v === null || typeof mode !== 'string' || !MODES.has(mode)) {
        return { mode: 'recovery', reason: 'status_missing' };
      }
      return { mode: mode as RecoveryMode, reason: typeof v.reason === 'string' ? v.reason : null };
    },

    isCoreAgentTarget(input: CoreTargetInput): boolean {
      const params = (input.params ?? {}) as Record<string, unknown>;
      const ref = params.accountRef;
      if (ref === undefined) return CORE_LIST_ROUTES.has(input.route.id);
      if (typeof ref !== 'string') return false;
      const account = resolveRef(deps.reader, input.workspaceId, 'EN', ref);
      const core = deps.store.read(input.workspaceId, (tx) => tx.engines.coreAgentAccounts());
      return core.some((c) => c.engine_account_id === account.id);
    },
  });
}
