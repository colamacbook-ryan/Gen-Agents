import { z } from 'zod';

// Che nội dung `confidential` với viewer (V) — review bảo mật PR #7 (MEDIUM M6, HANDLER-OBLIGATIONS #5).
// Hợp đồng không ép được việc che (đó là việc của handler), nhưng KHAI BÁO được: route nào, trường nào bị che, và cờ `redacted`
// mà client dùng để vẽ ô "đã che" thay vì hiểu nhầm là rỗng. Test `masking.test.ts` đối chiếu bảng này với schema thật.

/**
 * Cờ trên hình dạng (hàng / bản ghi) cho biết handler ĐÃ che các trường trong `V_MASKED_FIELDS` vì người đọc chỉ là viewer.
 * `true` ⇒ trường bị che mang giá trị rỗng (`''`, `null`, `0` hoặc ô `null`), KHÔNG phải giá trị thật rỗng.
 * Owner / admin luôn nhận `false` và giá trị thật.
 */
export const Redacted = z
  .boolean()
  .meta({ description: 'true = viewer, các trường nhạy cảm của hình dạng này đã bị che' });

export interface VMask {
  /** Đường dẫn trường bị che, dạng `introspect` nhưng bỏ gốc `$`: `.rows[].value`, `.items[].content`, `.fields.*`. */
  readonly fields: readonly string[];
  /** Đường dẫn các cờ `redacted` đi kèm (mỗi hình dạng bị che phải có cờ). */
  readonly flags: readonly string[];
  /** Quy tắc cho handler: che khi nào, che thành gì. */
  readonly note: string;
}

/** Route (id) ⇒ trường bị che khi người đọc chỉ có quyền V. Danh sách này = HANDLER-OBLIGATIONS #5. */
export const V_MASKED_FIELDS = {
  'SYS-23': {
    fields: ['.snapshot'],
    flags: ['.redacted'],
    note: 'Anchor trỏ tới bản ghi `confidential`: `snapshot = ""`; `snapshotHash` giữ nguyên để Soi vẫn phát hiện đổi.',
  },
  'SYS-37': {
    fields: ['.rows[].value', '.paper.sections[].items[].value'],
    flags: ['.rows[].redacted', '.paper.sections[].items[].redacted'],
    note: 'Mục DNA thuộc nhóm nhạy cảm: `value = null`; `tokenCount`, `inPrompt` vẫn hiện (không lộ nội dung).',
  },
  'SYS-54': {
    fields: ['.rows[].summary'],
    flags: ['.rows[].redacted'],
    note: 'Tri thức `sensitivity = confidential`: `summary = null`; tên tệp, kích thước, số chunk vẫn hiện.',
  },
  'WRK-34': {
    fields: ['.items[].content'],
    flags: ['.items[].redacted'],
    note: 'Trí nhớ `sensitivity = confidential`: `content = ""` (cả trong trang kết quả lọc bằng `q`: không khớp trên nội dung bị che).',
  },
  'WRK-35': {
    fields: ['.content'],
    flags: ['.redacted'],
    note: 'Như WRK-34; `chain` / `recalls` chỉ mang ID nên giữ nguyên.',
  },
  'SYS-42': {
    fields: ['.items[].before', '.items[].after'],
    flags: ['.items[].redacted'],
    note: 'Mục diff thuộc lớp nhạy cảm (DNA nhạy cảm, trí nhớ / tri thức `confidential`, nội dung `house_rules` nếu DB coi là confidential): `before = after = null`; `path`, `isCore` vẫn hiện để viewer biết CÓ thay đổi.',
  },
  'SYS-26': {
    fields: ['.reason', '.items[].before', '.items[].after'],
    flags: ['.redacted', '.items[].redacted'],
    note: 'Như SYS-42 cho từng mục của change set (`target`, `op`, `field` vẫn hiện); `reason` (lời giải thích của AI) che ở mức change set (`redacted`).',
  },
  'SYS-25': {
    fields: ['.items[].reason'],
    flags: ['.items[].redacted'],
    note: '`reason` của change set (AI có thể trích DNA / trí nhớ): viewer nhận `""`; tiêu đề, trạng thái, token vẫn hiện.',
  },
  'OPS-02': {
    fields: ['.settings[].value', '.settings[].default|0.value'],
    flags: ['.settings[].redacted'],
    note: 'Viewer chỉ thấy khoá, writers, writable, overridden, locked: `value = null` ở MỌI khoá và `default.value = null` (writers không phải "mọi người", giá trị có thể là neo ngoài máy / khoá nhạy cảm).',
  },
  'GW-05': {
    fields: ['[].accountHint'],
    flags: ['[].redacted'],
    note: '`accountHint` là danh tính tài khoản (PII): viewer nhận `null`; nhãn, trạng thái đăng nhập, quota vẫn hiện.',
  },
  'GW-06': {
    fields: ['.accountHint', '.consents'],
    flags: ['.redacted'],
    note: 'Như GW-05; danh sách đồng ý (`CN`, mức đọc A vì mang `accountHint`) bị che CẢ DANH SÁCH: viewer nhận `consents = []`; `needsConsent` vẫn hiện.',
  },
  'OPS-21': {
    fields: ['.before', '.after'],
    flags: ['.redacted'],
    note: 'Viewer chỉ nhận `changedKeys` (tên khoá đã đổi), `before = after = null` — kể cả khi hàng audit không chứa secret.',
  },
  'OPS-33': {
    fields: ['.items[].cells.*'],
    flags: ['.items[].redacted'],
    note: 'Hàng `confidential`: mọi ô cột nội dung `= null` (cột định danh / trạng thái giữ); `q` không khớp trên ô bị che.',
  },
  'OPS-34': {
    fields: [],
    flags: [],
    note: 'CSV: cùng quy tắc OPS-33, ô bị che xuất rỗng (không có cờ vì không có schema JSON).',
  },
  'OPS-35': {
    fields: ['.fields.*'],
    flags: ['.redacted'],
    note: 'Bản ghi `confidential`: mọi giá trị trong `fields = null`; `label` chỉ là nhãn hiển thị đã an toàn.',
  },
  'OPS-36': {
    fields: ['[].snippet'],
    flags: ['[].redacted'],
    note: 'Kết quả từ bản ghi `confidential`: `snippet = ""`; tìm kiếm full-text không được khớp trên nội dung bị che.',
  },
} as const satisfies Record<string, VMask>;

export type VMaskedRouteId = keyof typeof V_MASKED_FIELDS;
