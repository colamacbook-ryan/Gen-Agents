import { z } from 'zod';
import { BOUNDS, DbTimestamp } from './bounds.ts';

// Hợp đồng ga-app ↔ ga-updater (BUILD-PLAN §B.3, §B.9; CNS-141; G-25 [Gen quyết 2026-10-16]).
// Từ ga-app updater CHỈ nhận: GET trạng thái + HAI lệnh đóng không tham số — `start_update`, `rollback_previous`.
// Updater tự đọc feed chính thức, tự chọn bản, kiểm chữ ký minisign bằng khoá ghim trong image. Mọi tham số khác bị BỎ QUA
// (không phải bị từ chối): hợp đồng này loại chúng khỏi giá trị sau parse, nên không có đường đưa phiên bản / URL / digest vào.
// Xác thực: HMAC GA_UPDATER_KEY (cùng dạng ký với supervisor RPC).

export const UPDATER_COMMANDS = ['start_update', 'rollback_previous'] as const;
export type UpdaterCommandName = (typeof UPDATER_COMMANDS)[number];

/** Thân lệnh sau parse luôn đúng `{ command }` — trường thừa bị bỏ (zod mặc định strip). */
export const UpdaterCommand = z.object({ command: z.enum(UPDATER_COMMANDS) });
export type UpdaterCommand = z.infer<typeof UpdaterCommand>;

export const UPDATER_HTTP = {
  status: { method: 'GET', path: '/v1/status' },
  command: { method: 'POST', path: '/v1/command' },
} as const;

/** Stepper A7 (STD-06 §3): Tải image → Backup → Migrate → Restart → Healthcheck → Hoàn tất; lỗi ⇒ nhánh tự rollback. */
export const UPDATE_STEPS = ['download', 'backup', 'migrate', 'restart', 'healthcheck', 'done', 'rollback'] as const;
export type UpdateStep = (typeof UPDATE_STEPS)[number];

export const UpdaterStatus = z.strictObject({
  currentVersion: z.string().max(BOUNDS.version),
  /** Bản mới nhất có chữ ký hợp lệ trên feed; null nếu chưa kiểm hoặc đang là mới nhất. */
  availableVersion: z.string().max(BOUNDS.version).nullable(),
  checkedAt: DbTimestamp.nullable(),
  autoUpdate: z.boolean(),
  run: z
    .strictObject({
      trigger: z.enum(['auto', 'manual', 'rollback']),
      status: z.enum(['running', 'succeeded', 'rolled_back', 'failed']),
      step: z.enum(UPDATE_STEPS),
      startedAt: DbTimestamp,
      error: z.string().max(BOUNDS.message).nullable(),
    })
    .nullable(),
  /** Có bản trước để "Chạy lại bản cũ" không (updater tự chọn từ lịch sử của chính nó). */
  rollbackAvailable: z.boolean(),
});
export type UpdaterStatus = z.infer<typeof UpdaterStatus>;
