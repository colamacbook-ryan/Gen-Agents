import { z } from 'zod';
import { Anchor, ToolArgs, UI_TOOLS } from '../mcp.ts';
import { IdOf, idShape, Nat, str, Ts } from './common.ts';

// `ui_actions` — hợp đồng Soi (BACKEND-TRIAL §3.8, STD-08 §4–§5).
// Luồng: AI hệ thống gọi tool UI qua MCP gateway (tham số = `ToolArgs` của mcp.ts) → gateway quét credential, kiểm anchor,
// resolve đích → với `propose_edit` TẠO CHANGE SET TRƯỚC (AI không bao giờ sửa thẳng) → INSERT `ui_actions` (append-only
// tuyệt đối; `outcome` tính ngay lúc ghi) → phát SSE `ui.action`.
// Frontend và CLI CHỈ THỂ HIỆN, không báo kết quả ngược về server ⇒ KHÔNG có endpoint ghi; replay dùng SYS-22.
// `outcome = target_gone`: giao diện in thêm "đích không còn" (STD-08: không bao giờ chỉ vào chỗ sai mà không báo).

/** 5 hành động Soi (= enum `ui_actions.action` = `UI_TOOLS` của mcp.ts). */
export const UI_ACTIONS = UI_TOOLS;
export type UiActionName = (typeof UI_ACTIONS)[number];

/** `outcome` tính ngay lúc ghi (§3.8 bước 4). */
export const UI_ACTION_OUTCOMES = ['ok', 'target_gone', 'failed'] as const;
export type UiActionOutcome = (typeof UI_ACTION_OUTCOMES)[number];

/** Tham số theo hành động — dùng lại NGUYÊN `ToolArgs` của mcp.ts (`propose_edit.newValue` đã là `BoundedJson`). */
export const UiActionArgs = {
  highlight: ToolArgs.highlight,
  navigate: ToolArgs.navigate,
  annotate: ToolArgs.annotate,
  tour: ToolArgs.tour,
  propose_edit: ToolArgs.propose_edit,
} as const satisfies Record<UiActionName, z.ZodType>;

const rowBase = {
  ...idShape('UA'),
  message: IdOf('MSG'),
  /** Đích (với `tour`: anchor của bước đầu; danh sách đủ nằm ở `payload.anchors`). */
  anchor: Anchor,
  entityDisplayId: str(20, 1).nullable(),
  /** `tour`: số thứ tự bước (từ 0). Hành động khác: `null`. */
  step: Nat.nullable(),
  outcome: z.enum(UI_ACTION_OUTCOMES),
  screenRoute: str(200),
  at: Ts,
};

/**
 * Một hàng replay (SYS-22). `propose_edit` BẮT BUỘC có `changeSet` (change set tạo trước); hành động khác `changeSet = null`.
 * Phân biệt theo `action` nên `payload` đúng kiểu từng hành động.
 */
export const UiActionRow = z.discriminatedUnion('action', [
  z.strictObject({
    ...rowBase,
    action: z.literal('highlight'),
    payload: UiActionArgs.highlight,
    changeSet: z.null(),
  }),
  z.strictObject({
    ...rowBase,
    action: z.literal('navigate'),
    payload: UiActionArgs.navigate,
    changeSet: z.null(),
  }),
  z.strictObject({
    ...rowBase,
    action: z.literal('annotate'),
    payload: UiActionArgs.annotate,
    changeSet: z.null(),
  }),
  z.strictObject({ ...rowBase, action: z.literal('tour'), payload: UiActionArgs.tour, changeSet: z.null() }),
  z.strictObject({
    ...rowBase,
    action: z.literal('propose_edit'),
    payload: UiActionArgs.propose_edit,
    changeSet: IdOf('CS'),
  }),
]);
export type UiActionRow = z.infer<typeof UiActionRow>;
