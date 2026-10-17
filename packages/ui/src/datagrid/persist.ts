// Nhớ trạng thái bảng (STD-07 §5: "trạng thái bảng (cột, sort, filter, view) được nhớ"). Đọc phòng thủ: dữ liệu trong storage là
// đầu vào không tin cậy (bị sửa tay / phiên bản cũ) ⇒ kiểm kiểu từng trường, bỏ cột không còn, có trần kích thước; sai thì bỏ qua.
import type { GridSort, GridStorage } from './types.ts';

export type Density = 'compact' | 'comfortable';

export interface PersistedGridState {
  q: string;
  sort: GridSort[];
  hidden: string[];
  widths: Record<string, number>;
  density: Density;
  groupBy: string | null;
  view: string | null;
}

const VERSION = 1;
const MAX_BYTES = 16_384;
export const MIN_COL_WIDTH = 40;
export const MAX_COL_WIDTH = 1200;

export const storageKey = (key: string): string => `ga.grid.${key}`;

/** đọc trạng thái đã nhớ; chỉ giữ trường hợp lệ với tập cột hiện tại */
export function loadGridState(
  storage: GridStorage,
  key: string,
  columnIds: readonly string[],
): Partial<PersistedGridState> {
  const raw = storage.getItem(storageKey(key));
  if (raw === null || raw.length > MAX_BYTES) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {}; // JSON hỏng = không có trạng thái nhớ (không phải lỗi của người dùng)
  }
  if (typeof data !== 'object' || data === null || (data as { v?: unknown }).v !== VERSION) return {};
  const d = data as Record<string, unknown>;
  const ids = new Set(columnIds);
  const out: Partial<PersistedGridState> = {};
  if (typeof d.q === 'string' && d.q.length <= 500) out.q = d.q;
  if (Array.isArray(d.sort)) {
    out.sort = d.sort
      .filter(
        (s): s is GridSort =>
          typeof s === 'object' &&
          s !== null &&
          typeof s.column === 'string' &&
          ids.has(s.column) &&
          typeof s.desc === 'boolean',
      )
      .slice(0, 8)
      .map((s) => ({ column: s.column, desc: s.desc }));
  }
  if (Array.isArray(d.hidden)) out.hidden = d.hidden.filter((h): h is string => typeof h === 'string' && ids.has(h));
  if (typeof d.widths === 'object' && d.widths !== null && !Array.isArray(d.widths)) {
    const w: Record<string, number> = {};
    for (const [k, v] of Object.entries(d.widths)) {
      if (ids.has(k) && typeof v === 'number' && Number.isFinite(v)) {
        w[k] = Math.round(Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, v)));
      }
    }
    out.widths = w;
  }
  if (d.density === 'compact' || d.density === 'comfortable') out.density = d.density;
  if (d.groupBy === null || (typeof d.groupBy === 'string' && ids.has(d.groupBy))) out.groupBy = d.groupBy;
  if (d.view === null || (typeof d.view === 'string' && d.view.length <= 64)) out.view = d.view;
  return out;
}

/** ghi trạng thái (ném lỗi của storage cho người gọi xử lý — không nuốt) */
export function saveGridState(storage: GridStorage, key: string, state: PersistedGridState): void {
  storage.setItem(storageKey(key), JSON.stringify({ v: VERSION, ...state }));
}
