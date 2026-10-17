import { z } from 'zod';
import { DB_TIMESTAMP_RE } from './clock.ts';

// Trần chung của schema contracts (an ninh: chặn DoS / bộ nhớ ở BIÊN PARSE — mọi chuỗi, mảng, JSON tự do đều có trần).
// Test `api/bounds.test.ts` quét TOÀN BỘ schema xuất ra từ contracts bằng introspect: 0 chuỗi / mảng / JSON không trần, không ngoại lệ.
// Trần chọn rộng hơn mọi giá trị hợp lệ đã biết (lấy từ hằng số sẵn có hoặc chuẩn giao thức), nhưng hữu hạn.

export const BOUNDS = {
  /** Chuỗi phiên bản (`1.2.3-beta.1`, tag, build). */
  version: 64,
  /** Tên tín hiệu tiến trình (`SIGTERM`). */
  signal: 32,
  /** Tên khoá / định danh tự do ngắn (khoá capability, tên tool, mã gọi tool, model). */
  name: 128,
  /** Mã lỗi / mã từ chối ngắn. */
  code: 64,
  /** Thông điệp lỗi kỹ thuật (đã che; không phải chữ giao diện). */
  message: 2000,
  /** `display_id` (`MM-0041`, `AU-00012`). */
  displayId: 20,
  /** URL (manifest cài, endpoint plan). */
  url: 2048,
  /** Tên miền DNS. */
  domain: 253,
  /** MỘT dòng stdout của CLI / một đoạn delta (= `RUNNER_CLI_LINE_MAX_CHARS`). */
  streamText: 262_144,
  /** Một khối văn bản lớn: stdout đã gom, tệp prompt, thân HTTP của plan, văn bản trả lời cuối (= `PROMPT_FILE_MAX_CHARS`). */
  blobText: 4_000_000,
  /** Tin chat của người dùng (SYS-19 `text`, `PinPayload.text`). */
  chatText: 20_000,
  /** Số phần tử của một danh sách nhỏ (tệp của plan, tham số argv đã có trần riêng, v.v.). */
  smallList: 64,
  /** Số phần tử của danh sách vừa (container, bảng seed). */
  mediumList: 1024,
} as const;

/** Thời điểm UTC 24 ký tự của DB (`toDbTimestamp`) — dùng cho MỌI trường thời gian trong contracts. */
export const DbTimestamp = z.string().length(24).regex(DB_TIMESTAMP_RE).meta({ example: '2026-10-17T00:00:00.000Z' });

export const JSON_LIMITS = {
  /** Mỗi chuỗi trong JSON tự do (= trần chuỗi của gateway, `TOOL_PAYLOAD_LIMITS.maxStringChars`). */
  string: 16_384,
  depth: 8,
  items: 1000,
  keyChars: 128,
} as const;

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function jsonLevel(depth: number): z.ZodType<JsonValue> {
  const leaves = [z.string().max(JSON_LIMITS.string), z.number(), z.boolean(), z.null()] as const;
  if (depth <= 0) return z.union([...leaves]);
  const inner = jsonLevel(depth - 1);
  return z.union([
    ...leaves,
    z.array(inner).max(JSON_LIMITS.items),
    z
      .record(z.string().max(JSON_LIMITS.keyChars), inner)
      .refine((o) => Object.keys(o).length <= JSON_LIMITS.items, 'quá nhiều khoá'),
  ]);
}

/**
 * JSON tự do CÓ TRẦN (chuỗi, độ sâu, số phần tử / khoá). Thay `z.json()` (không trần — lazy đệ quy, DoS) ở mọi nơi trong
 * contracts: giá trị capability, `set_field.value`, `propose_change.items`, `propose_edit.newValue`, `ToolResult.data`,
 * `ui.action.args`, và các trường `json` của hợp đồng API.
 */
export const BoundedJson = jsonLevel(JSON_LIMITS.depth);
