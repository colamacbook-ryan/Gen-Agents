import {
  ENTITY_TYPES,
  type EntityTable,
  GRID_OFFSET_MAX,
  GRID_PAGE_MAX,
  GRID_PREFIX,
  type GridKeyName,
} from '@ga/contracts';
import {
  type CellValue,
  type ColumnKind,
  type GridColumn,
  type GridDataSource,
  type GridGroup,
  type GridLocateResult,
  type GridQuery,
  GridQueryError,
  type GridRange,
  type GridRowMeta,
  type GridSort,
  type GridView,
} from '@ga/ui/datagrid';
import type { ApiClient } from './client.ts';
import { isApiError } from './error.ts';
import type { CallResult, CsvPayload } from './routes.ts';

// Cầu nối Data Console: OPS-32 (cột) + OPS-33 (hàng, `offset`) + OPS-37 (vị trí) + OPS-34 (CSV) → đúng `GridDataSource` của DataGrid (L-GRID).
// DataGrid KHÔNG biết HTTP; mọi thứ nó cần đi qua đối tượng này. Ghi ô / thêm hàng KHÔNG có ở đây: mỗi cột sửa được trỏ tới route ghi riêng
// của miền (`GridColumn.editRouteId`, thân khác nhau theo route) — màn nghiệp vụ M4 tự nối `updateCell` / `createRow` cho lưới của mình.

export type GridInfoData = CallResult<'OPS-32'>[number];
export type GridRowData = CallResult<'OPS-33'>['items'][number];

export interface GridLabels {
  /** tiêu đề lưới (cho trình đọc màn hình) */
  title(): string;
  header(column: string): string;
  option(column: string, value: string): string;
  view(key: string): string;
}

/** Bộ dịch tối thiểu (khớp `useI18n()` / `I18n`): `has` để không báo thiếu khoá cho chữ tuỳ chọn. */
export interface GridTranslator {
  has(key: string): boolean;
  tr(key: string, params?: Record<string, string | number>): string;
}

const firstKnown = (i18n: GridTranslator, keys: readonly string[], fallback: string): string => {
  const key = keys.find((k) => i18n.has(k));
  return key ? i18n.tr(key) : fallback;
};

/** Khoá chữ theo thứ tự cụ thể → chung → tên thô: `grid.col.<lưới>.<cột>` → `grid.col.<cột>` → tên cột. */
export function gridLabels(i18n: GridTranslator, gridKey: GridKeyName): GridLabels {
  return {
    title: () => firstKnown(i18n, [`grid.title.${gridKey}`], gridKey),
    header: (c) => firstKnown(i18n, [`grid.col.${gridKey}.${c}`, `grid.col.${c}`], c),
    option: (c, v) => firstKnown(i18n, [`grid.val.${gridKey}.${c}.${v}`, `grid.val.${c}.${v}`], v),
    view: (k) => firstKnown(i18n, [`grid.view.${gridKey}.${k}`], k),
  };
}

const KIND: Record<GridInfoData['columns'][number]['type'], ColumnKind> = {
  text: 'text',
  enum: 'enum',
  int: 'number',
  money: 'number',
  real: 'number',
  ts: 'date',
  bool: 'bool',
  json: 'longtext',
};
const WIDTH: Record<ColumnKind, number> = {
  text: 160,
  longtext: 240,
  enum: 120,
  number: 96,
  bool: 72,
  date: 148,
  id: 96,
};

/** Ô JSON của OPS-33 → giá trị ô của lưới (đối tượng / mảng thành chuỗi JSON để hiện được). */
export function cellValue(v: unknown): CellValue {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  return JSON.stringify(v);
}

export function parseSort(keys: readonly string[]): GridSort[] {
  return keys.map((k) => (k.startsWith('-') ? { column: k.slice(1), desc: true } : { column: k, desc: false }));
}
const sortKeys = (sort: readonly GridSort[]): string[] => sort.slice(0, 3).map((s) => (s.desc ? '-' : '') + s.column);

export function buildColumns(info: GridInfoData, labels: GridLabels): GridColumn<GridRowData>[] {
  const sums = new Set(info.footerKeys);
  return info.columns.map((c) => {
    const kind = KIND[c.type];
    const name = c.name;
    return {
      id: name,
      header: labels.header(name),
      kind,
      width: WIDTH[kind],
      value: (row) => cellValue(row.cells[name]),
      // chỉ-đọc ở lớp này: sửa ô do màn nối `updateCell` theo `editRouteId`
      editable: false,
      options: c.values?.map((v) => ({ value: v, label: labels.option(name, v) })),
      query: c.queryable ? { field: name, aliases: c.aliases } : false,
      sortable: c.sortable,
      align: kind === 'number' ? 'end' : undefined,
      sum: sums.has(name),
    } satisfies GridColumn<GridRowData>;
  });
}

export function buildViews(info: GridInfoData, labels: GridLabels): GridView[] {
  return info.views.map((v) => ({
    id: v.key,
    label: labels.view(v.key),
    q: v.q ?? '',
    sort: v.sort.length > 0 ? parseSort(v.sort) : undefined,
  }));
}

export const tableOf = (gridKey: GridKeyName): EntityTable => ENTITY_TYPES[GRID_PREFIX[gridKey]];

export const rowMeta = (row: GridRowData): GridRowMeta => ({ kind: row.state, supersededBy: row.supersededBy });

/** Lỗi truy vấn → `GridQueryError` (lưới vẽ chip đỏ đúng chỗ). Lỗi khác đi nguyên. */
function toGridError(e: unknown): unknown {
  if (!isApiError(e)) return e;
  if (e.code === 'query.invalid') {
    const reason = typeof e.detailParams.reason === 'string' ? e.detailParams.reason : 'syntax';
    const position = typeof e.detailParams.position === 'number' ? e.detailParams.position : null;
    return new GridQueryError(reason, position);
  }
  // kiểm request phía client (dev/test): phần kiểm chéo của hợp đồng chính là whitelist cột (q / sort / group / cols)
  if (e.code === 'validation.failed' && e.httpStatus === 0) return new GridQueryError('unknown_field', null);
  return e;
}

export interface GridSource extends GridDataSource<GridRowData> {
  /** OPS-34: CSV do máy chủ dựng (hash `X-Content-SHA256` nếu có). DataGrid tự dựng CSV từ `exportRows`; hàm này cho nút "tải từ máy chủ". */
  exportServerCsv(req: { query: GridQuery; signal?: AbortSignal }): Promise<CsvPayload>;
}

export function createGridSource(api: ApiClient, gridKey: GridKeyName): GridSource {
  const params = { gridKey } as const;
  const select = (q: GridQuery) => ({
    ...(q.q.trim() === '' ? {} : { q: q.q }),
    ...(q.sort.length === 0 ? {} : { sort: sortKeys(q.sort) }),
  });
  const page = async (q: GridQuery, extra: { offset: number; limit: number; group?: string }, signal?: AbortSignal) => {
    try {
      return await api.call('OPS-33', { params, query: { ...select(q), ...extra } }, { signal });
    } catch (e) {
      throw toGridError(e);
    }
  };

  return {
    async fetchRange({ query, start, limit, signal }): Promise<GridRange<GridRowData>> {
      if (start + limit > GRID_OFFSET_MAX + GRID_PAGE_MAX)
        throw new RangeError(`OPS-33 chỉ nhảy tới chỉ số ≤ ${GRID_OFFSET_MAX}; lọc / sắp xếp lại để thu hẹp kết quả`);
      const rows: GridRowData[] = [];
      let total = 0;
      let aggregates: Record<string, number> = {};
      let first = true;
      while (rows.length < limit) {
        const n = Math.min(GRID_PAGE_MAX, limit - rows.length);
        const p = await page(query, { offset: start + rows.length, limit: n }, signal);
        if (first) {
          total = p.total;
          aggregates = p.footer;
          first = false;
        }
        rows.push(...p.items);
        if (p.items.length < n) break;
      }
      return { start, rows, total, aggregates };
    },

    async locate({ query, id, signal }): Promise<GridLocateResult> {
      try {
        return await api.call('OPS-37', { params, query: { displayId: id, ...select(query) } }, { signal });
      } catch (e) {
        throw toGridError(e);
      }
    },

    async groups({ query, column, signal }): Promise<readonly GridGroup[]> {
      const p = await page(query, { offset: 0, limit: 1, group: column }, signal);
      return (p.groups ?? []).map((g) => ({ value: cellValue(g.value), count: g.count }));
    },

    async *exportRows({ query, signal }) {
      for (let offset = 0; ; offset += GRID_PAGE_MAX) {
        const p = await page(query, { offset, limit: GRID_PAGE_MAX }, signal);
        if (p.items.length > 0) yield p.items;
        if (p.items.length < GRID_PAGE_MAX || offset + GRID_PAGE_MAX >= Math.min(p.total, GRID_OFFSET_MAX)) return;
      }
    },

    async exportServerCsv({ query, signal }) {
      try {
        return await api.call('OPS-34', { params, query: select(query) }, { signal });
      } catch (e) {
        throw toGridError(e);
      }
    },
  };
}
