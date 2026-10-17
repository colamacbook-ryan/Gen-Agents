// Onboarding (G2): SYS-06 checklist, SYS-07 hoàn tất. Nguồn: `v_setup_checklist` (OB-01…07).
// SYS-01 / 02 chưa mount: DB / hợp đồng chưa có chỗ lưu `instanceName` (SYS-02 trả `instanceSetting: Id(ST)` nhưng registry
// SETTINGS không có khoá tên bản cài) — báo Gen, không tự bịa khoá.
import { FIXED_CODES } from '@ga/contracts';
import { defineHandler, type Handler } from '../http/define-handler.ts';
import { ApiError } from '../http/errors.ts';
import { onboardingDone } from './views.ts';

const CODES: ReadonlySet<string> = new Set(FIXED_CODES.onboardingChecklist);
const STATES = new Set(['ok', 'warn', 'err']);
const KEY_PART_RE = /^[a-z][a-z0-9_]{0,40}$/;

type ChecklistCode = (typeof FIXED_CODES.onboardingChecklist)[number];

export const onboardingHandlers: readonly Handler[] = [
  defineHandler('SYS-06', (_input, ctx) =>
    ctx.read((tx) =>
      tx.workspace
        .setupChecklist()
        .filter((r) => typeof r.check_code === 'string' && CODES.has(r.check_code))
        .map((r) => {
          // trạng thái lạ của view ⇒ err (fail-closed: không báo "ok" khi không chắc)
          const state = typeof r.check_status === 'string' && STATES.has(r.check_status) ? r.check_status : 'err';
          const key = typeof r.check_key === 'string' && KEY_PART_RE.test(r.check_key) ? r.check_key : 'unknown';
          return {
            code: r.check_code as ChecklistCode,
            state: state as 'ok' | 'warn' | 'err',
            detailKey: `onboarding.${key}.${state}`,
            detailParams: {},
            detail: typeof r.check_detail === 'string' ? r.check_detail.slice(0, 500) : '',
            evidence: null,
          };
        }),
    ),
  ),

  defineHandler('SYS-07', (_input, ctx) => {
    const rows = ctx.read((tx) => tx.workspace.setupChecklist());
    if (!onboardingDone(rows)) throw new ApiError('gate.onboarding_incomplete');
    return { done: true as const };
  }),
];
