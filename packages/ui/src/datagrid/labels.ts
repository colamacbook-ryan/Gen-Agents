// Chữ giao diện của DataGrid / thanh công thức / ô truy vấn. Mọi chuỗi đi qua đối tượng nhãn này (i18n): lớp màn truyền nhãn
// đã dịch từ i18next (gói @ga/i18n của L-DS); bản vi / en dưới đây là mặc định để component chạy độc lập và để test.
import type { QueryErrorReason } from '../query-box/parse.ts';
import type { ColumnKind } from './types.ts';

export interface QueryBoxLabels {
  label: string;
  conditions: string;
  removeCondition: (clause: string) => string;
  error: (reason: QueryErrorReason | string, token: string) => string;
}

export interface FormulaBarLabels {
  region: string;
  noCell: string;
  openEditor: string;
  edit: string;
  save: string;
  cancel: string;
  reason: string;
  reasonRequired: string;
  tokens: (n: string) => string;
  editorLabel: (ref: string) => string;
  lines: (n: string) => string;
  saving: string;
  hint: string;
  /** ký hiệu ô "fx" (thuật ngữ bảng tính, không dịch nhưng vẫn đi qua nhãn) */
  fx: string;
}

export interface GridLabels {
  /** BCP 47 cho định dạng số (vd 'vi-VN' ⇒ 1.284) */
  locale: string;
  /** tiêu đề cột ID + badge khoá chính */
  idHeader: string;
  pkBadge: string;
  view: string;
  viewAll: string;
  query: QueryBoxLabels;
  formula: FormulaBarLabels;
  filter: string;
  sort: string;
  group: string;
  columns: string;
  density: string;
  exportCsv: string;
  addRow: string;
  selectAll: string;
  selectRow: (id: string) => string;
  rows: (n: string) => string;
  selected: (n: string) => string;
  sum: (column: string) => string;
  loading: string;
  loadError: string;
  queryRejected: (reason: string) => string;
  retry: string;
  empty: string;
  emptyQuery: string;
  clearQuery: string;
  proposed: string;
  apply: string;
  reject: string;
  supersededBy: (id: string) => string;
  metaHeader: string;
  on: string;
  off: string;
  kinds: Readonly<Record<ColumnKind, string>>;
  sortAsc: string;
  sortDesc: string;
  sortNone: string;
  sortClear: string;
  filterColumn: string;
  filterOp: string;
  filterValue: string;
  filterAdd: string;
  groupNone: string;
  groupBy: string;
  groupRow: (column: string, value: string, count: string) => string;
  densityCompact: string;
  densityComfortable: string;
  saveError: string;
  invalidValue: string;
  exporting: string;
  exportError: string;
  exportTooLarge: (max: string) => string;
  close: string;
  apply2: string;
  emptyValue: string;
}

const QUERY_REASONS_VI: Record<string, string> = {
  syntax: 'sai cú pháp',
  unknown_field: 'cột không tồn tại trong lưới này',
  op_not_allowed: 'toán tử không dùng được cho cột này',
  bad_value: 'giá trị không hợp lệ',
  too_complex: 'truy vấn quá dài hoặc quá nhiều điều kiện',
  timeout: 'truy vấn chạy quá lâu',
};
const QUERY_REASONS_EN: Record<string, string> = {
  syntax: 'syntax error',
  unknown_field: 'no such column in this grid',
  op_not_allowed: 'operator not allowed for this column',
  bad_value: 'invalid value',
  too_complex: 'query too long or too many conditions',
  timeout: 'query took too long',
};

export const GRID_LABELS_VI: GridLabels = {
  locale: 'vi-VN',
  idHeader: 'ID',
  pkBadge: 'PK',
  view: 'Chế độ xem',
  viewAll: 'Tất cả',
  query: {
    label: 'Truy vấn bảng',
    conditions: 'Điều kiện đã áp dụng',
    removeCondition: (c) => `Bỏ điều kiện ${c}`,
    error: (reason, token) =>
      `Không hiểu ${token ? `“${token}”` : 'truy vấn'}: ${QUERY_REASONS_VI[reason] ?? QUERY_REASONS_VI.syntax}`,
  },
  formula: {
    region: 'Thanh công thức',
    noCell: 'Chọn một ô để xem nội dung',
    openEditor: 'Mở editor',
    edit: 'Sửa',
    save: 'Lưu ô',
    cancel: 'Huỷ',
    reason: 'Lý do',
    reasonRequired: 'Hàng lõi: cần ghi lý do trước khi lưu',
    tokens: (n) => `${n} token`,
    editorLabel: (ref) => `Nội dung ô ${ref}`,
    lines: (n) => `${n} dòng`,
    saving: 'Đang lưu…',
    hint: '⌘↵ lưu · Esc huỷ',
    fx: 'fx',
  },
  filter: 'Lọc',
  sort: 'Sắp xếp',
  group: 'Nhóm hàng',
  columns: 'Ẩn hiện cột',
  density: 'Mật độ hàng',
  exportCsv: 'Xuất CSV',
  addRow: 'Thêm hàng',
  selectAll: 'Chọn tất cả hàng khớp truy vấn',
  selectRow: (id) => `Chọn hàng ${id}`,
  rows: (n) => `${n} hàng`,
  selected: (n) => `${n} đã chọn`,
  sum: (c) => `Σ ${c}`,
  loading: 'Đang tải…',
  loadError: 'Không tải được dữ liệu của lưới.',
  queryRejected: (reason) => `Máy chủ từ chối truy vấn: ${QUERY_REASONS_VI[reason] ?? reason}`,
  retry: 'Thử lại',
  empty: 'Lưới này chưa có hàng nào.',
  emptyQuery: 'Không có hàng nào khớp truy vấn.',
  clearQuery: 'Xoá truy vấn',
  proposed: 'Đề xuất',
  apply: 'Áp dụng',
  reject: 'Bỏ',
  supersededBy: (id) => `→ ${id}`,
  metaHeader: 'Duyệt',
  on: 'Bật',
  off: 'Tắt',
  kinds: { text: 'Aa', longtext: '¶', enum: '▾', number: '#', bool: '✓', date: 'dt', id: 'ID' },
  sortAsc: 'Tăng dần',
  sortDesc: 'Giảm dần',
  sortNone: 'Không sắp xếp',
  sortClear: 'Bỏ sắp xếp',
  filterColumn: 'Cột',
  filterOp: 'Toán tử',
  filterValue: 'Giá trị',
  filterAdd: 'Thêm điều kiện',
  groupNone: 'Không nhóm',
  groupBy: 'Nhóm theo',
  groupRow: (c, v, n) => `${c}: ${v} · ${n} hàng`,
  densityCompact: 'Gọn (28px)',
  densityComfortable: 'Thoáng (32px)',
  saveError: 'Không lưu được ô — thử lại hoặc xem log.',
  invalidValue: 'Giá trị không đúng kiểu của cột.',
  exporting: 'Đang xuất…',
  exportError: 'Không xuất được CSV.',
  exportTooLarge: (max) => `Quá nhiều hàng để xuất (tối đa ${max}) — thu hẹp truy vấn trước.`,
  close: 'Đóng',
  apply2: 'Áp dụng',
  emptyValue: '(trống)',
};

export const GRID_LABELS_EN: GridLabels = {
  ...GRID_LABELS_VI,
  locale: 'en-US',
  view: 'View',
  viewAll: 'All',
  query: {
    label: 'Query grid',
    conditions: 'Applied conditions',
    removeCondition: (c) => `Remove condition ${c}`,
    error: (reason, token) =>
      `Can't read ${token ? `“${token}”` : 'query'}: ${QUERY_REASONS_EN[reason] ?? QUERY_REASONS_EN.syntax}`,
  },
  formula: {
    region: 'Formula bar',
    noCell: 'Select a cell to see its content',
    openEditor: 'Open editor',
    edit: 'Edit',
    save: 'Save cell',
    cancel: 'Cancel',
    reason: 'Reason',
    reasonRequired: 'Core row: a reason is required before saving',
    tokens: (n) => `${n} tokens`,
    editorLabel: (ref) => `Content of cell ${ref}`,
    lines: (n) => `${n} lines`,
    saving: 'Saving…',
    hint: '⌘↵ save · Esc cancel',
    fx: 'fx',
  },
  filter: 'Filter',
  sort: 'Sort',
  group: 'Group rows',
  columns: 'Show / hide columns',
  density: 'Row density',
  exportCsv: 'Export CSV',
  addRow: 'Add row',
  selectAll: 'Select all rows matching the query',
  selectRow: (id) => `Select row ${id}`,
  rows: (n) => `${n} rows`,
  selected: (n) => `${n} selected`,
  loading: 'Loading…',
  loadError: 'Could not load grid data.',
  queryRejected: (reason) => `Server rejected the query: ${QUERY_REASONS_EN[reason] ?? reason}`,
  retry: 'Retry',
  empty: 'This grid has no rows yet.',
  emptyQuery: 'No rows match the query.',
  clearQuery: 'Clear query',
  proposed: 'Proposed',
  apply: 'Apply',
  reject: 'Dismiss',
  metaHeader: 'Review',
  on: 'On',
  off: 'Off',
  sortAsc: 'Ascending',
  sortDesc: 'Descending',
  sortNone: 'No sort',
  sortClear: 'Clear sort',
  filterColumn: 'Column',
  filterOp: 'Operator',
  filterValue: 'Value',
  filterAdd: 'Add condition',
  groupNone: 'No grouping',
  groupBy: 'Group by',
  groupRow: (c, v, n) => `${c}: ${v} · ${n} rows`,
  densityCompact: 'Compact (28px)',
  densityComfortable: 'Comfortable (32px)',
  saveError: 'Could not save the cell — retry or check the log.',
  invalidValue: 'Value does not match the column type.',
  exporting: 'Exporting…',
  exportError: 'Could not export CSV.',
  exportTooLarge: (max) => `Too many rows to export (max ${max}) — narrow the query first.`,
  close: 'Close',
  apply2: 'Apply',
  emptyValue: '(empty)',
};
