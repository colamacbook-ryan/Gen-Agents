// Dữ liệu mẫu cho bộ component (/__ui-kit): tiếng Việt thật, khớp seed demo (FRONTEND-SPEC, mốc 14/10/2026 14:06).
// Chỉ dùng ở dev / test; không vào luồng nghiệp vụ.
import type { ChangeSetItem, LogLine, NotificationItem, PaletteItem, VersionedRevision } from '@ga/ui';

const at = (hhmmss: string): Date => new Date(`2026-10-14T${hhmmss}+07:00`);

export const SAMPLE_NOW = at('14:06:00');
export const SAMPLE_TZ = 'Asia/Ho_Chi_Minh';

export const SAMPLE_LOG: LogLine[] = [
  {
    id: 'L1',
    at: at('14:02:03'),
    level: 'info',
    source: { name: 'Mai', color: 'teal' },
    text: 'bắt đầu TK-0461: soạn báo giá cho khách mới',
  },
  {
    id: 'L2',
    at: at('14:02:14'),
    level: 'warn',
    source: { name: 'Mai', color: 'teal' },
    text: 'cửa sổ 5 giờ của tài khoản đầu hết quota — chuyển sang loại CLI thứ hai',
  },
  {
    id: 'L3',
    at: at('14:02:31'),
    level: 'info',
    source: { name: 'Tùng', color: 'saffron' },
    text: 'trả lời khách qua Telegram, 38 từ',
  },
  {
    id: 'L4',
    at: at('14:03:09'),
    level: 'error',
    source: { name: 'Lan', color: 'coral' },
    text: 'tự xét lỗi lượt JB-0417 thất bại, chạy lại 1/3',
  },
  {
    id: 'L5',
    at: at('14:04:40'),
    level: 'debug',
    text: 'probe quota của Core agent: chưa xác định (chưa kiểm, Spike 1c)',
  },
  {
    id: 'L6',
    at: at('14:05:04'),
    level: 'info',
    source: { name: 'Mai', color: 'teal' },
    text: 'quay về CLI ưu tiên 1 · token=sk-DEMO0123456789ABCDEFGH đã được che',
  },
];

export const SAMPLE_REVISIONS: VersionedRevision[] = [
  {
    id: 'r3',
    version: 'v2.0',
    at: at('09:31:00'),
    by: 'Owner',
    note: 'Sửa lõi: đổi cách xưng hô',
    core: true,
    current: true,
    content: 'Xưng hô: em gọi khách là anh/chị\nGiọng điệu: ấm áp, ngắn gọn\nGiới hạn: không hứa giảm giá',
  },
  {
    id: 'r2',
    version: 'v1.1',
    at: new Date('2026-10-02T09:00:00+07:00'),
    by: 'Phỏng vấn viên',
    note: 'Thêm giới hạn về giảm giá',
    content: 'Xưng hô: tôi gọi khách là anh/chị\nGiọng điệu: ấm áp, ngắn gọn\nGiới hạn: không hứa giảm giá',
  },
  {
    id: 'r1',
    version: 'v1.0',
    at: new Date('2026-09-30T09:48:00+07:00'),
    by: 'Owner',
    note: 'Ký giấy khai sinh',
    content: 'Xưng hô: tôi gọi khách là anh/chị\nGiọng điệu: ấm áp, ngắn gọn',
  },
];

export const SAMPLE_CHANGES: ChangeSetItem[] = [
  { id: 'CS-0012', target: 'IN-0003 · D', reason: 'Trainer đề xuất nới nội quy về giờ trả lời', tokenDelta: 120 },
  { id: 'CS-0013', target: 'SK-0004 · E', reason: 'Rút gọn bước 3 của kỹ năng báo giá', tokenDelta: -30 },
];

export const SAMPLE_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'NT-0003',
    kind: 'wound',
    title: 'Lan vào nghỉ dưỡng thương',
    body: 'Ví 0 ₲ từ 12:38 — chờ owner cấp ₲.',
    at: at('12:38:00'),
    read: false,
  },
  {
    id: 'NT-0002',
    kind: 'fallback',
    title: 'Mai chuyển loại CLI',
    body: 'Cửa sổ 5 giờ hết quota, chuyển sang loại CLI thứ hai.',
    at: at('14:02:14'),
    read: false,
  },
  {
    id: 'NT-0001',
    kind: 'update',
    title: 'Có bản cập nhật mới',
    at: new Date('2026-10-13T10:00:00+07:00'),
    read: true,
  },
];

export const SAMPLE_PALETTE: Omit<PaletteItem, 'run'>[] = [
  { id: 'p1', label: 'Mai · đang chạy', hint: 'RL-0001', group: 'Role' },
  { id: 'p2', label: 'Tùng · đang chạy', hint: 'RL-0003', group: 'Role' },
  { id: 'p3', label: 'Khai sinh Role mới', group: 'Hành động' },
  { id: 'p4', label: 'Trừ ₲…', group: 'Hành động', danger: true },
];
