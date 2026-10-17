// 16 khoá trạng thái avatar: SSOT là contracts (AVATAR_STATES, theo thứ tự ưu tiên của view DB v_role_avatar_state).
// Engine chỉ biết khoá; nhãn + mô tả hiển thị lấy từ i18n (PS §4.7), không nằm trong engine (CNS-165).
import { AVATAR_STATES } from '@ga/contracts';

export { AVATAR_STATES };
export type AvatarState = (typeof AVATAR_STATES)[number];

/** khoá i18n của một trạng thái: tên hiển thị (PS §4.7, cột "Tên hiển thị") và mô tả khi nào (cột "Khi nào") */
export const stateI18nKeys = (state: AvatarState): { name: string; when: string } => ({
  name: `avatar.state.${state}.name`,
  when: `avatar.state.${state}.when`,
});
