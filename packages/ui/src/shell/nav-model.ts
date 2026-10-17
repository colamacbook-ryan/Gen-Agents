import type { LucideIcon } from 'lucide-react';
import type { AvatarLive } from '../primitives/role-avatar.tsx';
import type { EntityColor } from '../tokens/index.ts';

export interface NavTab {
  id: string;
  to: string;
  /** đã dịch */
  label: string;
  /** số đếm mono nhỏ */
  count?: number;
}

/** Nhóm lớn trên sidebar (≤ ~6, STD-07 §2); các mục gần nhau là tab trong trang. */
export interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  to: string;
  tabs: readonly NavTab[];
  count?: number;
  /** nhãn nhỏ màu accent (vd "mới") */
  badge?: string;
  /** chấm đỏ cảnh báo kèm nhãn đọc */
  alert?: { label: string };
}

export interface PinnedEntity {
  id: string;
  name: string;
  /** ID mono phụ, vd "RL-0001" */
  code: string;
  color: EntityColor;
  to: string;
  wounded?: boolean;
  live?: AvatarLive;
  /** mô tả trạng thái đã dịch ("đang chạy", "nghỉ dưỡng thương") — đọc cho trình đọc màn hình + tooltip */
  statusLabel: string;
}

export interface WorkspaceLink {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  badge?: string;
  /** chưa dùng được (vd "GĐ2 · sắp có"): hiện mờ, không điều hướng */
  disabled?: boolean;
}
