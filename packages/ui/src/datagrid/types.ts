// Kiểu công khai của DataGrid (STD-07 §5, FRONTEND-SPEC §5): cột, nguồn dữ liệu, anchor.
// DataGrid KHÔNG gọi API: mọi dữ liệu đi qua `GridDataSource` (lớp màn ghép vào client API của L-API).
import type { EntityTable } from '@ga/contracts';
import type { QueryEnumValue } from '../query-box/fields.ts';

export type CellValue = string | number | boolean | null;

/** kiểu cột (icon kiểu dữ liệu ở header, trình sửa ô, toán tử ô truy vấn) */
export type ColumnKind = 'text' | 'longtext' | 'enum' | 'number' | 'bool' | 'date' | 'id';

export interface GridOption extends QueryEnumValue {
  /** chữ hiển thị (đã dịch) */
  label: string;
}

export interface GridColumn<R> {
  /** khoá ổn định = field DB thật (vd 'status') */
  id: string;
  /** tên cột hiển thị (đã qua i18n) */
  header: string;
  kind: ColumnKind;
  /** độ rộng mặc định (px) */
  width: number;
  /** đọc giá trị ô (giá trị thô của DB) */
  value: (row: R) => CellValue;
  /** chữ hiển thị trong ô / thanh công thức (mặc định: nhãn enum hoặc String(value)). Luôn là văn bản thuần, không HTML. */
  format?: (value: CellValue, row: R) => string;
  /** sửa trực tiếp được không (cần `source.updateCell`) */
  editable?: boolean | ((row: R) => boolean);
  /** enum: tập giá trị đóng (dropdown inline + alias ô truy vấn) */
  options?: readonly GridOption[];
  /** tên trường ô truy vấn (DATABASE §8.2) + alias không dấu; `false` = không lọc bằng `field:value` */
  query?: { field: string; aliases?: readonly string[] } | false;
  sortable?: boolean;
  align?: 'start' | 'end' | 'center';
  /** footer hiện Σ của cột (số do nguồn dữ liệu trả trong `aggregates`, lưới không tự cộng) */
  sum?: boolean;
  /** sửa ô này ở hàng LÕI ⇒ thanh công thức bắt nhập Lý do */
  requireReason?: (row: R) => boolean;
  /** số token của ô dài (badge nhỏ) — do máy chủ đếm */
  tokens?: (row: R) => number | null;
}

/** trạng thái hàng (STD-07 §5 mục 4) */
export interface GridRowMeta {
  kind: 'normal' | 'proposed' | 'superseded' | 'wounded';
  /** hàng bị thay thế: display_id mới (link "→ MM-0041") */
  supersededBy?: string | null;
}

export interface GridSort {
  /** id cột */
  column: string;
  desc: boolean;
}

/** trạng thái truy vấn của lưới — đi nguyên vẹn sang nguồn dữ liệu */
export interface GridQuery {
  /** chuỗi ô truy vấn (DATABASE §8.1); lọc theo cột cũng được ghi thành mệnh đề trong chuỗi này */
  q: string;
  sort: readonly GridSort[];
}

export interface GridRangeRequest {
  query: GridQuery;
  /** chỉ số hàng đầu (từ 0) trong kết quả đã lọc + sắp xếp */
  start: number;
  limit: number;
  signal: AbortSignal;
}

export interface GridRange<R> {
  start: number;
  rows: readonly R[];
  /** tổng số hàng khớp truy vấn (ảo hoá cần để dựng thanh cuộn) */
  total: number;
  /** Σ theo cột (`GridColumn.sum`) trên toàn bộ kết quả — do nguồn tính (frontend không tự cộng) */
  aggregates?: Readonly<Record<string, number>>;
}

export type GridLocateResult =
  | { state: 'found'; index: number }
  /** hàng còn tồn tại nhưng không khớp truy vấn hiện tại */
  | { state: 'filtered' }
  /** không còn (đã xoá / không tồn tại) */
  | { state: 'gone' };

export interface GridGroup {
  value: CellValue;
  count: number;
}

export interface GridUpdateRequest {
  /** display_id của hàng */
  id: string;
  column: string;
  value: CellValue;
  /** lý do bắt buộc khi sửa hàng LÕI */
  reason: string | null;
}

/** Lỗi do nguồn trả về khi truy vấn sai (máy chủ: `query.invalid` + `detail.position`) */
export class GridQueryError extends Error {
  readonly reason: string;
  readonly position: number | null;
  constructor(reason: string, position: number | null) {
    super(`query.invalid:${reason}`);
    this.name = 'GridQueryError';
    this.reason = reason;
    this.position = position;
  }
}

/**
 * Nguồn dữ liệu của lưới: trang · lọc · sắp xếp · truy vấn · anchor. Lưới không biết HTTP; lớp màn bọc client API.
 * Mọi hàm nhận `signal` và PHẢI huỷ khi signal bị abort (đổi truy vấn / unmount).
 */
export interface GridDataSource<R> {
  /** trang: hàng [start, start + limit) của kết quả (lọc theo `query.q`, sắp xếp theo `query.sort`) */
  fetchRange(req: GridRangeRequest): Promise<GridRange<R>>;
  /** anchor: vị trí của display_id trong kết quả của truy vấn (Soi `navigate` tới hàng ngoài màn — CNS-153) */
  locate(req: { query: GridQuery; id: string; signal: AbortSignal }): Promise<GridLocateResult>;
  /** sửa ô; trả hàng sau khi ghi (không có ⇒ lưới chỉ đọc) */
  updateCell?(req: GridUpdateRequest): Promise<R>;
  /** thêm hàng; trả hàng mới */
  createRow?(): Promise<R>;
  /** xuất CSV theo luồng, đúng cùng truy vấn (DATABASE §8.3). Không có ⇒ lưới đọc tuần tự bằng fetchRange */
  exportRows?(req: { query: GridQuery; signal: AbortSignal }): AsyncIterable<readonly R[]>;
  /** nhóm: các giá trị của cột theo đúng thứ tự sắp xếp + số hàng mỗi nhóm (không có ⇒ nút Nhóm bị tắt) */
  groups?(req: { query: GridQuery; column: string; signal: AbortSignal }): Promise<readonly GridGroup[]>;
}

export type AnchorStatus = 'ready' | 'filtered' | 'gone' | 'timeout' | 'cancelled' | 'invalid';

export interface AnchorReadyDetail {
  /** anchor STD-08 §1: `grid:<bảng>/row:<ID>[/col:<chữ>]` */
  anchor: string;
  id: string;
  col: string | null;
  status: AnchorStatus;
  /** phần tử đã dựng (ô, hoặc hàng khi không có cột) — null khi status khác 'ready' */
  element: HTMLElement | null;
}

/** Sự kiện "anchor sẵn sàng" (CNS-153): phát trên phần tử gốc của lưới, bubbles + composed. */
export const ANCHOR_READY_EVENT = 'ga:anchor-ready';

export interface ScrollToIdOptions {
  /** chọn ô (thanh công thức hiện nội dung) — mặc định true */
  select?: boolean;
  /** mở editor nhiều dòng của thanh công thức (Soi `navigate` — STD-08 §4) */
  openEditor?: boolean;
  /** trần chờ dựng (ms), mặc định 5000 */
  timeoutMs?: number;
}

export interface ActiveCell {
  id: string;
  col: string;
}

export interface DataGridHandle {
  /** cuộn tới hàng (và cột) theo display_id, kể cả hàng ngoài màn; resolve khi phần tử đã dựng (kèm sự kiện ANCHOR_READY_EVENT) */
  scrollToId(id: string, col?: string | null, opts?: ScrollToIdOptions): Promise<AnchorReadyDetail>;
  focus(): void;
  getActiveCell(): ActiveCell | null;
  /** tải lại với truy vấn hiện tại (vd sau sự kiện SSE) */
  refresh(): void;
  exportCsv(): Promise<void>;
  getQuery(): GridQuery;
  setQuery(q: string): void;
}

export interface GridView {
  id: string;
  label: string;
  q: string;
  sort?: readonly GridSort[];
}

/** nơi nhớ trạng thái bảng (mặc định localStorage) */
export interface GridStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type { EntityTable };
