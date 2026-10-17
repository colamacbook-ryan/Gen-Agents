// Phép chiếu nhỏ dùng chung của onboarding (không SQL — chỉ đổi hàng repo sang hình hợp đồng).
import type { SetupChecklistView } from '@ga/db/repos';

/** `workspaces.locale` ⇒ `Lang` của hợp đồng (`vi` | `en`); lạ ⇒ `vi` (mặc định của DB). */
export function langOf(locale: string): 'vi' | 'en' {
  return locale === 'en' || locale.startsWith('en-') ? 'en' : 'vi';
}

/**
 * Onboarding xong khi `v_setup_checklist` không còn mục `err` (DB chưa có cột / setting "đã hoàn tất" — SYS-07 kiểm cùng
 * điều kiện này). Rỗng (view không thấy workspace) ⇒ chưa xong.
 */
export function onboardingDone(rows: readonly SetupChecklistView[]): boolean {
  return rows.length > 0 && rows.every((r) => r.check_status !== 'err');
}
