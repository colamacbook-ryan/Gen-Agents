// SYS-08 trạng thái Core agent (`v_core_agent_status`). KHÔNG trả `reason_text` / `overlay_text` (CNS-179): client lấy chữ
// từ i18n theo `reason` / `subReason`. Giá trị lạ của view (không qua schema hợp đồng) ⇒ chiếu về null / recovery.

import { defineHandler, type Handler } from '../http/define-handler.ts';
import { ApiError } from '../http/errors.ts';

const MODES = new Set(['setup', 'ok', 'recovery']);
const FIX_TARGETS = new Set(['a5.system', 'a5.container']);
const KEY_RE = /^[a-z][a-z0-9_.-]{0,63}$/;

const keyOrNull = (v: unknown): string | null => (typeof v === 'string' && KEY_RE.test(v) ? v : null);
const flag = (v: unknown): boolean => v === 1 || v === true;

export const recoveryHandlers: readonly Handler[] = [
  defineHandler('SYS-08', (_input, ctx) =>
    ctx.read((tx) => {
      const v = tx.engines.coreAgentStatus();
      if (v === null || typeof v.core_slug !== 'string') throw new ApiError('not_found');
      const mode =
        typeof v.mode === 'string' && MODES.has(v.mode) ? (v.mode as 'setup' | 'ok' | 'recovery') : 'recovery';
      const account =
        v.engine_account_id !== null && v.account_display_id !== null
          ? { id: v.engine_account_id, displayId: v.account_display_id }
          : null;
      const accRow = v.engine_account_id !== null ? tx.engines.account(v.engine_account_id) : null;
      const telegram = tx.telegram.bots({ status: ['active'] }).length > 0;
      return {
        mode,
        blocksAdmin: flag(v.blocks_admin),
        reason: keyOrNull(v.reason),
        subReason: keyOrNull(v.sub_reason),
        autoRecheck: flag(v.auto_recheck),
        fixTarget:
          typeof v.fix_target === 'string' && FIX_TARGETS.has(v.fix_target)
            ? (v.fix_target as 'a5.system' | 'a5.container')
            : null,
        isIncident: flag(v.is_incident),
        // Lịch kiểm lại tự động thuộc scheduler (chưa có) ⇒ null; quota reset theo tài khoản Core agent.
        nextRecheckAt: null,
        quotaResetAt: accRow?.quota_reset_at ?? null,
        channel: telegram ? ('telegram' as const) : ('none' as const),
        engineSlug: v.core_slug,
        account,
        lockedAt: v.core_agent_locked_at,
      };
    }),
  ),
];
