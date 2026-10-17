// biome-ignore-all lint/a11y/useSemanticElements: lưới tương tác ARIA (APG grid) dựng bằng div — <table> không ảo hoá + sticky + roving được
// biome-ignore-all lint/a11y/useFocusableInteractive: mẫu aria-activedescendant — focus ở phần tử role=grid, hàng / ô không nhận focus (APG)
// DataGrid — trái tim của Data Console (STD-07 §5, FRONTEND-SPEC §5, BUILD-PLAN §A.2-2 / §E.4 L-GRID).
// Panel viền subtle bo 6px: toolbar 36 · thanh công thức 32 · dải chữ cột 16 + header 28 · thân lưới (cột 0 đóng băng: checkbox
// + ID mono) · footer Σ 28. Tự dựng trên TanStack Table (trạng thái cột / sort / độ rộng) + TanStack Virtual (ảo hoá hàng).
//
// Hợp đồng quan trọng:
//   - Dữ liệu chỉ qua GridDataSource (không gọi API). Truy vấn = chuỗi ô truy vấn + sort; lọc theo cột ghi thành mệnh đề.
//   - Mọi ô đang dựng có `data-anchor` = `grid:<bảng>/row:<display_id>/col:<chữ>` (STD-08 §1); chữ cột theo vị trí KHAI BÁO.
//   - `scrollToId(id, col)` cuộn tới hàng ngoài màn (hỏi `source.locate` khi hàng chưa tải), đợi ô dựng xong rồi phát
//     sự kiện ANCHOR_READY_EVENT trên phần tử gốc (CNS-153) — bộ thực thi Soi của chat gọi hàm này trước khi tô sáng.
//   - CSP chặt: stylesheet constructable; style động chỉ qua CSSOM (prop style của React).
import {
  type ColumnDef,
  type ColumnSizingState,
  getCoreRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { FormulaBar } from '../formula-bar/FormulaBar.tsx';
import { parseQuery } from '../query-box/parse.ts';
import {
  anchorOf,
  cellAnchor,
  columnIndex,
  columnLetter,
  displayText,
  isEditable,
  isRowIdOf,
  prefixOf,
  queryFields,
} from './columns.ts';
import { CSV_BOM, csvFileName, csvLine } from './csv.ts';
import {
  cellDomId,
  type EditState,
  GridRow,
  GroupRow,
  groupDomId,
  META_COL,
  type MoveAfterEdit,
  metaDomId,
  type RowActions,
  type RowColumn,
} from './GridRow.tsx';
import { keyCommand } from './keyboard.ts';
import { GRID_LABELS_VI, type GridLabels } from './labels.ts';
import { GridLayout, groupKey } from './layout.ts';
import { type Density, loadGridState, MAX_COL_WIDTH, MIN_COL_WIDTH, saveGridState } from './persist.ts';
import { RowCache } from './row-cache.ts';
import { adoptGridStyles, styleRootOf } from './styles.ts';
import { Toolbar } from './Toolbar.tsx';
import {
  type ActiveCell,
  ANCHOR_READY_EVENT,
  type AnchorReadyDetail,
  type AnchorStatus,
  type CellValue,
  type DataGridHandle,
  type EntityTable,
  type GridColumn,
  type GridDataSource,
  type GridGroup,
  type GridQuery,
  GridQueryError,
  type GridRowMeta,
  type GridSort,
  type GridStorage,
  type GridView,
  type ScrollToIdOptions,
} from './types.ts';

export interface DataGridProps<R> {
  /** bảng DB của lưới (anchor `grid:<bảng>/…`, prefix display_id) */
  table: EntityTable;
  /** tên lưới cho trình đọc màn hình */
  label: string;
  columns: readonly GridColumn<R>[];
  source: GridDataSource<R>;
  /** display_id của hàng (khoá chính hiển thị) */
  getId: (row: R) => string;
  rowMeta?: (row: R) => GridRowMeta;
  views?: readonly GridView[];
  initialQuery?: string;
  initialSort?: readonly GridSort[];
  /** ví dụ truy vấn của lưới, vd `role:Mai status:active tokens>200` */
  queryPlaceholder?: string;
  /** nhớ trạng thái bảng dưới khoá này */
  persistKey?: string;
  /** nơi nhớ (mặc định localStorage) */
  storage?: GridStorage;
  labels?: GridLabels;
  /** chữ "Cập nhật 14:02" (màn tự định dạng theo múi giờ workspace) */
  updatedLabel?: string;
  /** nội dung thêm ở footer sau Σ (vd thước ngân sách token của màn — số do view DB tính, lưới không tự cộng) */
  footerExtra?: ReactNode;
  blockSize?: number;
  /** Enter trên hàng: mở inspector / trang chi tiết */
  onOpenRow?: (row: R) => void;
  /** "+ Thêm hàng" (mặc định gọi source.createRow) */
  onAddRow?: () => void;
  onApplyProposal?: (row: R) => void;
  onRejectProposal?: (row: R) => void;
  onActiveCellChange?: (cell: ActiveCell | null) => void;
  onSelectionChange?: (sel: { all: boolean; ids: ReadonlySet<string> }) => void;
  /** mọi lỗi (tải, lưu, xuất, nhớ trạng thái) — để màn ghi log / toast; lưới vẫn tự hiện banner */
  onError?: (err: unknown) => void;
  /** trần số hàng xuất CSV */
  exportMaxRows?: number;
  ref?: Ref<DataGridHandle>;
}

const FROZEN_W = 28 + 84;
const HEADER_H = 16 + 28;
const META_W = 184;
const EMPTY: never[] = [];
const NUMBER_DRAFT = /^-?\d{1,15}(?:[.,]\d{1,6})?$/;

interface Active {
  v: number;
  col: string;
}

interface Pending {
  /** ô sẽ chọn (khi opts.select khác false) */
  want?: Active;
  id: string;
  col: string | null;
  letter: string | null;
  anchor: string;
  index: number;
  opts: ScrollToIdOptions;
  resolve: (d: AnchorReadyDetail) => void;
  started: number;
  timeoutMs: number;
  lastScroll: number;
  relocated: boolean;
}

const defaultStorage = (): GridStorage | null => {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null; // trình duyệt chặn localStorage (chế độ riêng tư): không nhớ trạng thái, lưới vẫn chạy
  }
};

const toSorting = (sort: readonly GridSort[]): SortingState => sort.map((s) => ({ id: s.column, desc: s.desc }));

export function DataGrid<R>(props: DataGridProps<R>) {
  const { table, columns, source, getId, rowMeta } = props;
  const labels = props.labels ?? GRID_LABELS_VI;
  const domId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (rootRef.current) adoptGridStyles(styleRootOf(rootRef.current));
  }, []);

  // ------------------------------------------------------------ trạng thái nhớ được
  const columnIds = useMemo(() => columns.map((c) => c.id), [columns]);
  const storage = props.persistKey ? (props.storage ?? defaultStorage()) : null;
  const [initial] = useState(() =>
    storage && props.persistKey ? loadGridState(storage, props.persistKey, columnIds) : {},
  );
  const [q, setQ] = useState(initial.q ?? props.initialQuery ?? '');
  const [sorting, setSorting] = useState<SortingState>(() => toSorting(initial.sort ?? props.initialSort ?? []));
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() =>
    Object.fromEntries((initial.hidden ?? []).map((h) => [h, false])),
  );
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => initial.widths ?? {});
  const [density, setDensity] = useState<Density>(initial.density ?? 'compact');
  const [groupBy, setGroupBy] = useState<string | null>(initial.groupBy ?? null);
  const [view, setView] = useState<string | null>(initial.view ?? null);

  // ------------------------------------------------------------ trạng thái phiên
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [active, setActive] = useState<Active | null>(null);
  /** ô chọn đã commit (đọc trong callback / layout effect không bị cũ) */
  const activeRef = useRef(active);
  activeRef.current = active;
  const [edit, setEdit] = useState<EditState | null>(null);
  const [fb, setFb] = useState<{ expanded: boolean; saving: boolean; error: string | null }>({
    expanded: false,
    saving: false,
    error: null,
  });
  const [checked, setChecked] = useState<{ all: boolean; ids: ReadonlySet<string> }>(() => ({
    all: false,
    ids: new Set(),
  }));
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [groups, setGroups] = useState<readonly GridGroup[] | null>(null);

  // callback của màn qua ref: màn truyền hàm nội tuyến (đổi mỗi lần dựng) không làm effect chạy lại / không gây vòng lặp
  const cbRef = useRef({
    onError: props.onError,
    onActiveCellChange: props.onActiveCellChange,
    onSelectionChange: props.onSelectionChange,
  });
  cbRef.current = {
    onError: props.onError,
    onActiveCellChange: props.onActiveCellChange,
    onSelectionChange: props.onSelectionChange,
  };
  const report = useCallback((err: unknown) => cbRef.current.onError?.(err), []);

  // ------------------------------------------------------------ TanStack Table: trạng thái cột
  const colDefs = useMemo<ColumnDef<R>[]>(
    () =>
      columns.map((c) => ({
        id: c.id,
        header: c.header,
        // TanStack chỉ cho sắp xếp cột có accessorFn (dữ liệu thật do nguồn sắp — manualSorting)
        accessorFn: (row: R) => c.value(row),
        size: c.width,
        minSize: MIN_COL_WIDTH,
        maxSize: MAX_COL_WIDTH,
        enableSorting: c.sortable !== false,
        enableHiding: true,
        enableResizing: true,
      })),
    [columns],
  );
  const tt = useReactTable<R>({
    data: EMPTY,
    columns: colDefs,
    state: { sorting, columnVisibility, columnSizing },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualFiltering: true,
    manualPagination: true,
    enableMultiSort: true,
    // bấm header lần đầu = tăng dần như Excel (TanStack tự đoán chiều theo hàng đầu tiên — lưới không giữ hàng trong bảng)
    sortDescFirst: false,
    isMultiSortEvent: (e) => (e as { shiftKey?: boolean }).shiftKey === true,
    columnResizeMode: 'onChange',
  });
  const colInfo = useMemo(
    () => new Map(columns.map((c, i) => [c.id, { col: c, letter: columnLetter(i) }] as const)),
    [columns],
  );
  const visibleLeaf = tt.getVisibleLeafColumns();
  const visibleKey = visibleLeaf.map((c) => `${c.id}:${c.getSize()}`).join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: visibleKey tóm tắt đúng phần của visibleLeaf mà danh sách cột phụ thuộc
  const visCols: RowColumn<R>[] = useMemo(
    () =>
      visibleLeaf.flatMap((c) => {
        const info = colInfo.get(c.id);
        return info ? [{ col: info.col, letter: info.letter }] : [];
      }),
    [visibleKey, colInfo],
  );
  const widths = visibleLeaf.map((c) => c.getSize());
  const hasMeta = rowMeta !== undefined;
  /** cột đi được bằng bàn phím: cột dữ liệu đang hiện + ô "Duyệt" */
  const navCols = useMemo(() => [...visCols.map((c) => c.col.id), ...(hasMeta ? [META_COL] : [])], [visCols, hasMeta]);
  const template = `28px 84px ${widths.map((w) => `${w}px`).join(' ')}${hasMeta ? ` ${META_W}px` : ''} minmax(0, 1fr)`;
  const tableWidth = FROZEN_W + widths.reduce((a, b) => a + b, 0) + (hasMeta ? META_W : 0);
  const rowH = density === 'compact' ? 28 : 32;

  // ------------------------------------------------------------ truy vấn + bộ đệm hàng
  const sort = useMemo<GridSort[]>(() => sorting.map((s) => ({ column: s.id, desc: s.desc })), [sorting]);
  const query = useMemo<GridQuery>(() => {
    if (!groupBy) return { q, sort };
    const own = sort.find((s) => s.column === groupBy) ?? { column: groupBy, desc: false };
    return { q, sort: [own, ...sort.filter((s) => s.column !== groupBy)] };
  }, [q, sort, groupBy]);
  const getIdRef = useRef(getId);
  getIdRef.current = getId;
  // biome-ignore lint/correctness/useExhaustiveDependencies: bộ đệm sống theo nguồn; đổi truy vấn đi qua setQuery bên dưới
  const cache = useMemo(
    () =>
      new RowCache<R>(source, (r) => getIdRef.current(r), query, {
        blockSize: props.blockSize ?? 100,
        validate: (r) => (isRowIdOf(table, getIdRef.current(r)) ? null : `display_id không thuộc bảng ${table}`),
      }),
    [source, table, props.blockSize],
  );
  useEffect(() => () => cache.abortAll(), [cache]);
  useEffect(() => {
    if (cache.query !== query) cache.setQuery(query);
  }, [cache, query]);
  const version = useSyncExternalStore(cache.subscribe, cache.getVersion, cache.getVersion);
  const total = cache.total;
  // lỗi tải: banner trong lưới + báo màn (onError) đúng một lần cho mỗi lỗi
  const loadError: unknown = cache.error;
  useEffect(() => {
    if (loadError !== null && loadError !== undefined) report(loadError);
  }, [loadError, report]);

  useEffect(() => {
    if (!groupBy || !source.groups) {
      setGroups(null);
      return;
    }
    const ctrl = new AbortController();
    setGroups(null);
    source.groups({ query, column: groupBy, signal: ctrl.signal }).then(
      (g) => {
        if (!ctrl.signal.aborted) setGroups(g);
      },
      (err: unknown) => {
        if (ctrl.signal.aborted) return;
        setNotice(labels.loadError);
        report(err);
      },
    );
    return () => ctrl.abort();
  }, [source, groupBy, query, labels.loadError, report]);

  const layout = useMemo(
    () => (groupBy ? new GridLayout(groups ? (total ?? 0) : 0, groups, collapsed) : new GridLayout(total ?? 0, null)),
    [groupBy, groups, total, collapsed],
  );

  // đổi truy vấn / nhóm ⇒ ô chọn, sửa, chọn hàng của kết quả cũ không còn nghĩa
  // biome-ignore lint/correctness/useExhaustiveDependencies: chỉ chạy khi truy vấn hiệu lực đổi
  useEffect(() => {
    setActive(null);
    setEdit(null);
    setFb({ expanded: false, saving: false, error: null });
    setChecked({ all: false, ids: new Set() });
  }, [query]);

  // ------------------------------------------------------------ ảo hoá
  const virtualizer = useVirtualizer({
    count: layout.count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowH,
    overscan: 10,
    scrollMargin: HEADER_H,
    scrollPaddingStart: HEADER_H,
    useFlushSync: false,
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: đổi mật độ ⇒ đo lại kích thước hàng
  useEffect(() => {
    virtualizer.measure();
  }, [rowH]);
  const items = virtualizer.getVirtualItems();
  const firstV = items[0]?.index ?? 0;
  const lastV = items[items.length - 1]?.index ?? -1;
  // biome-ignore lint/correctness/useExhaustiveDependencies: version = dữ liệu mới về (khối lỗi được giữ, không tự gọi lại)
  useEffect(() => {
    if (total === null) {
      if (!cache.error) cache.ensure(0, 1);
      return;
    }
    for (const [s, e] of layout.dataRanges(firstV, lastV)) cache.ensure(s, e);
  }, [cache, layout, firstV, lastV, total, version]);

  const rowAt = (v: number): { row: R | undefined; index: number } | null => {
    const it = layout.at(v);
    if (it?.kind !== 'row') return null;
    return { row: cache.row(it.index), index: it.index };
  };

  // ------------------------------------------------------------ nhớ trạng thái
  const resizing = tt.getState().columnSizingInfo.isResizingColumn;
  useEffect(() => {
    if (!storage || !props.persistKey || resizing) return;
    try {
      saveGridState(storage, props.persistKey, {
        q,
        sort,
        hidden: Object.entries(columnVisibility)
          .filter(([, v]) => v === false)
          .map(([k]) => k),
        widths: columnSizing,
        density,
        groupBy,
        view,
      });
    } catch (err) {
      report(err); // hết quota / bị chặn: báo lên màn, lưới vẫn chạy
    }
  }, [storage, props.persistKey, resizing, q, sort, columnVisibility, columnSizing, density, groupBy, view, report]);

  // ------------------------------------------------------------ ô đang chọn
  const activeRow = active ? rowAt(active.v) : null;
  const activeInfo = active ? colInfo.get(active.col) : undefined;
  const activeId = activeRow?.row !== undefined ? getId(activeRow.row) : null;
  // chỉ báo khi ô chọn THẬT SỰ đổi (so theo display_id + chữ cột), không theo danh tính đối tượng
  const activeLetter = active ? (colInfo.get(active.col)?.letter ?? null) : null;
  useEffect(() => {
    cbRef.current.onActiveCellChange?.(activeId ? { id: activeId, col: activeLetter } : null);
  }, [activeId, activeLetter]);
  useEffect(() => {
    cbRef.current.onSelectionChange?.(checked);
  }, [checked]);

  const focusGrid = useCallback(() => {
    scrollRef.current?.focus({ preventScroll: true });
  }, []);

  const ensureColVisible = useCallback(
    (colId: string) => {
      const sc = scrollRef.current;
      if (!sc) return;
      const show = (left: number, w: number): void => {
        const right = left + w;
        if (left - FROZEN_W < sc.scrollLeft) sc.scrollLeft = left - FROZEN_W;
        else if (right > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = right - sc.clientWidth;
      };
      let left = FROZEN_W;
      for (const c of visCols) {
        const w = tt.getColumn(c.col.id)?.getSize() ?? c.col.width;
        if (c.col.id === colId) {
          show(left, w);
          return;
        }
        left += w;
      }
      if (colId === META_COL) show(left, META_W);
    },
    [visCols, tt],
  );

  const moveTo = useCallback(
    (v: number, colId: string) => {
      setActive({ v, col: colId });
      setFb((f) => (f.expanded ? { expanded: false, saving: false, error: null } : f));
      virtualizer.scrollToIndex(v, { align: 'auto' });
      ensureColVisible(colId);
    },
    [virtualizer, ensureColVisible],
  );

  // ------------------------------------------------------------ ghi ô
  const save = async (v: number, colId: string, value: CellValue, reason: string | null): Promise<boolean> => {
    const r = rowAt(v);
    const info = colInfo.get(colId);
    if (!r?.row || !info || !source.updateCell) return false;
    try {
      const next = await source.updateCell({ id: getId(r.row), column: colId, value, reason });
      cache.replace(next);
      setNotice(null);
      return true;
    } catch (err) {
      setNotice(labels.saveError);
      report(err);
      return false;
    }
  };

  const editRef = useRef(edit);
  editRef.current = edit;
  /** kết thúc sửa ô: xoá ref NGAY (blur do trả focus về lưới không được lưu lại nháp vừa huỷ) */
  const endEdit = (): void => {
    editRef.current = null;
    setEdit(null);
  };

  const parseDraft = (col: GridColumn<R>, draft: string): { ok: true; value: CellValue } | { ok: false } => {
    switch (col.kind) {
      case 'number': {
        const t = draft.trim();
        if (t === '') return { ok: true, value: null };
        if (!NUMBER_DRAFT.test(t)) return { ok: false };
        return { ok: true, value: Number(t.replace(',', '.')) };
      }
      case 'enum':
        return col.options?.some((o) => o.value === draft) ? { ok: true, value: draft } : { ok: false };
      case 'bool':
        return draft === 'true' || draft === 'false' ? { ok: true, value: draft === 'true' } : { ok: false };
      default:
        return { ok: true, value: draft };
    }
  };

  const beginEdit = (cell: Active): void => {
    if (cell.col === META_COL) {
      // ô "Duyệt": Enter / F2 đưa focus vào nút đầu tiên của ô (APG grid có widget trong ô)
      const r0 = rowAt(cell.v);
      const id0 = r0?.row !== undefined ? getId(r0.row) : null;
      if (id0) document.getElementById(metaDomId(domId, id0))?.querySelector<HTMLButtonElement>('button')?.focus();
      return;
    }
    const r = rowAt(cell.v);
    const info = colInfo.get(cell.col);
    if (!r?.row || !info || !source.updateCell || !isEditable(info.col, r.row)) return;
    if (info.col.kind === 'bool') {
      void toggleBool(cell.v, cell.col);
      return;
    }
    if (info.col.kind === 'longtext' || info.col.requireReason?.(r.row)) {
      setFb({ expanded: true, saving: false, error: null });
      return;
    }
    const raw = info.col.value(r.row);
    setEdit({ v: cell.v, col: cell.col, draft: raw === null ? '' : String(raw), saving: false });
  };

  const commitEdit = async (move: MoveAfterEdit): Promise<void> => {
    const e = editRef.current;
    if (!e || e.saving) return;
    const r = rowAt(e.v);
    const info = colInfo.get(e.col);
    if (!r?.row || !info) {
      endEdit();
      return;
    }
    const parsed = parseDraft(info.col, e.draft);
    if (!parsed.ok) {
      setNotice(labels.invalidValue);
      return;
    }
    const after = (): void => {
      endEdit();
      focusGrid();
      const ci = visCols.findIndex((c) => c.col.id === e.col);
      if (move === 'down' && e.v + 1 < layout.count) moveTo(e.v + 1, e.col);
      else if (move === 'right' && ci + 1 < visCols.length) moveTo(e.v, visCols[ci + 1]?.col.id as string);
      else if (move === 'left' && ci > 0) moveTo(e.v, visCols[ci - 1]?.col.id as string);
    };
    if (parsed.value === info.col.value(r.row)) {
      after();
      return;
    }
    const savingState = { ...e, saving: true };
    editRef.current = savingState;
    setEdit(savingState);
    const ok = await save(e.v, e.col, parsed.value, null);
    if (ok) after();
    else {
      const back = { ...e, saving: false };
      editRef.current = back;
      setEdit(back);
    }
  };

  const toggleBool = async (v: number, colId: string): Promise<void> => {
    const r = rowAt(v);
    const info = colInfo.get(colId);
    if (!r?.row || !info || info.col.kind !== 'bool' || !isEditable(info.col, r.row)) return;
    setActive({ v, col: colId });
    await save(v, colId, info.col.value(r.row) !== true, null);
  };

  const toggleChecked = (id: string): void => {
    setChecked((c) => {
      const ids = new Set(c.ids);
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      return { all: c.all, ids };
    });
  };
  const toggleAll = (): void => {
    setChecked((c) => (c.all && c.ids.size === 0 ? { all: false, ids: new Set() } : { all: true, ids: new Set() }));
  };
  const isChecked = (id: string): boolean => (checked.all ? !checked.ids.has(id) : checked.ids.has(id));
  const checkedCount = checked.all ? Math.max(0, (total ?? 0) - checked.ids.size) : checked.ids.size;

  const toggleGroup = (g: number): void => {
    const group = groups?.[g];
    if (!group) return;
    const k = groupKey(group.value);
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

  // ------------------------------------------------------------ anchor: scrollToId + sự kiện "anchor sẵn sàng"
  const pendingRef = useRef<Pending | null>(null);
  const live = useRef({ cache, layout, query, visCols, colInfo, source, columnVisibility, virtualizer, total });
  live.current = { cache, layout, query, visCols, colInfo, source, columnVisibility, virtualizer, total };

  const finish = useCallback((p: Pending, status: AnchorStatus, element: HTMLElement | null) => {
    if (pendingRef.current === p) pendingRef.current = null;
    const detail: AnchorReadyDetail = { anchor: p.anchor, id: p.id, col: p.letter, status, element };
    rootRef.current?.dispatchEvent(new CustomEvent(ANCHOR_READY_EVENT, { detail, bubbles: true, composed: true }));
    p.resolve(detail);
  }, []);

  const checkPending = useCallback(() => {
    const p = pendingRef.current;
    if (!p) return;
    const { cache: c, layout: l, virtualizer: vz } = live.current;
    const now = performance.now();
    if (now - p.started > p.timeoutMs) {
      finish(p, 'timeout', null);
      return;
    }
    if (p.index < 0) return; // đang chờ locate
    const v = l.vIndexOfRow(p.index);
    if (v === null) return; // tổng / nhóm chưa về, nhóm đang mở
    c.ensure(p.index, p.index + 1);
    const row = c.row(p.index);
    if (row === undefined) {
      if (now - p.lastScroll > 120) {
        vz.scrollToIndex(v, { align: 'center' });
        p.lastScroll = now;
      }
      return;
    }
    if (getIdRef.current(row) !== p.id) {
      // dữ liệu đổi giữa lúc locate và lúc tải: tìm lại một lần
      const again = c.indexOfId(p.id);
      if (again !== undefined && !p.relocated) {
        p.index = again;
        p.relocated = true;
        p.lastScroll = 0;
        return;
      }
      finish(p, 'gone', null);
      return;
    }
    if (p.opts.select !== false) {
      const col = p.col ?? activeRef.current?.col ?? live.current.visCols[0]?.col.id ?? '';
      if (!p.want || p.want.v !== v || p.want.col !== col) {
        p.want = { v, col };
        setActive(p.want);
        setEdit(null);
        setFb({ expanded: p.opts.openEditor === true && p.col !== null, saving: false, error: null });
      }
      const a = activeRef.current;
      if (!a || a.v !== p.want.v || a.col !== p.want.col) return; // chờ React áp ô chọn rồi mới báo sẵn sàng
    }
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-anchor="${p.anchor}"]`) ?? null;
    if (!el) {
      if (now - p.lastScroll > 120) {
        vz.scrollToIndex(v, { align: 'center' });
        p.lastScroll = now;
      }
      return;
    }
    if (p.col) ensureColVisible(p.col);
    finish(p, 'ready', el);
  }, [finish, ensureColVisible]);

  // vòng rAF chỉ chạy khi có anchor đang chờ (kiểm cả khi không có lần dựng mới, vd hàng đã ở trong màn)
  const rafRef = useRef(0);
  const kick = useCallback(() => {
    if (rafRef.current) return;
    const loop = (): void => {
      checkPending();
      rafRef.current = pendingRef.current ? requestAnimationFrame(loop) : 0;
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [checkPending]);
  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    },
    [],
  );

  // mỗi lần dựng xong: thử hoàn tất anchor đang chờ (dữ liệu về / hàng vào màn)
  useLayoutEffect(() => {
    checkPending();
  });

  const scrollToId = useCallback(
    async (id: string, colLetter?: string | null, opts: ScrollToIdOptions = {}): Promise<AnchorReadyDetail> => {
      const { cache: c, source: src, query: qy } = live.current;
      const letter = colLetter ?? null;
      let anchor: string;
      try {
        anchor = cellAnchor(table, id, letter);
      } catch {
        // anchor sai ngữ pháp / sai bảng: từ chối có chủ đích (status 'invalid'), không cuộn tới chỗ sai
        const detail: AnchorReadyDetail = {
          anchor: anchorOf(table, id, letter),
          id,
          col: letter,
          status: 'invalid',
          element: null,
        };
        rootRef.current?.dispatchEvent(new CustomEvent(ANCHOR_READY_EVENT, { detail, bubbles: true, composed: true }));
        return detail;
      }
      const colDef = letter ? columns[columnIndex(letter)] : undefined;
      if (letter && !colDef) {
        const detail: AnchorReadyDetail = { anchor, id, col: letter, status: 'invalid', element: null };
        rootRef.current?.dispatchEvent(new CustomEvent(ANCHOR_READY_EVENT, { detail, bubbles: true, composed: true }));
        return detail;
      }
      const prev = pendingRef.current;
      if (prev) finish(prev, 'cancelled', null);
      return new Promise<AnchorReadyDetail>((resolve) => {
        const p: Pending = {
          id,
          col: colDef?.id ?? null,
          letter,
          anchor,
          index: -1,
          opts,
          resolve,
          started: performance.now(),
          timeoutMs: opts.timeoutMs ?? 5000,
          lastScroll: 0,
          relocated: false,
        };
        pendingRef.current = p;
        kick();
        const go = (index: number): void => {
          if (pendingRef.current !== p) return;
          p.index = index;
          const { layout: l } = live.current;
          // hàng nằm trong nhóm đang thu gọn ⇒ mở nhóm
          if (l.groups && l.vIndexOfRow(index) === null) {
            const g = l.groups[l.groupOfRow(index)];
            if (g) {
              const k = groupKey(g.value);
              setCollapsed((s) => {
                const n = new Set(s);
                n.delete(k);
                return n;
              });
            }
          }
          if (colDef && live.current.columnVisibility[colDef.id] === false) {
            setColumnVisibility((cv) => ({ ...cv, [colDef.id]: true }));
          }
          checkPending();
          kick();
        };
        const known = c.indexOfId(id);
        if (known !== undefined) {
          go(known);
          return;
        }
        const ctrl = new AbortController();
        src.locate({ query: qy, id, signal: ctrl.signal }).then(
          (loc) => {
            if (pendingRef.current !== p) return;
            if (loc.state === 'found') go(loc.index);
            else finish(p, loc.state, null);
          },
          (err: unknown) => {
            report(err);
            if (pendingRef.current === p) finish(p, 'gone', null);
          },
        );
      });
    },
    [table, columns, finish, checkPending, kick, report],
  );

  // ------------------------------------------------------------ xuất CSV
  const exportCsv = useCallback(async (): Promise<void> => {
    const { source: src, query: qy, visCols: cols, total: tot } = live.current;
    const max = props.exportMaxRows ?? 100_000;
    setExporting(true);
    setNotice(null);
    const ctrl = new AbortController();
    try {
      if (tot !== null && tot > max) throw new RangeError('export_too_large');
      const parts: string[] = [CSV_BOM + csvLine(['ID', ...cols.map((c) => `${c.letter} · ${c.col.header}`)])];
      let n = 0;
      const push = (rows: readonly R[]): void => {
        for (const r of rows) {
          n++;
          if (n > max) throw new RangeError('export_too_large');
          parts.push(csvLine([getIdRef.current(r), ...cols.map((c) => c.col.value(r))]));
        }
      };
      if (src.exportRows) {
        for await (const chunk of src.exportRows({ query: qy, signal: ctrl.signal })) push(chunk);
      } else {
        for (let start = 0; ; start += 500) {
          const page = await src.fetchRange({ query: qy, start, limit: 500, signal: ctrl.signal });
          push(page.rows);
          if (page.rows.length === 0 || start + page.rows.length >= page.total) break;
        }
      }
      const blob = new Blob(parts, { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = csvFileName(table);
      a.rel = 'noopener';
      rootRef.current?.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      setNotice(
        err instanceof RangeError && err.message === 'export_too_large'
          ? labels.exportTooLarge(new Intl.NumberFormat(labels.locale).format(max))
          : labels.exportError,
      );
      report(err);
    } finally {
      setExporting(false);
    }
  }, [props.exportMaxRows, table, labels, report]);

  // ------------------------------------------------------------ handle
  useImperativeHandle(
    props.ref,
    (): DataGridHandle => ({
      scrollToId,
      focus: focusGrid,
      focusQuery: () => queryInputRef.current?.focus(),
      getActiveCell: () => {
        const { layout: l, cache: c, colInfo: ci } = live.current;
        const a = activeRef.current;
        if (!a) return null;
        const it = l.at(a.v);
        const row = it?.kind === 'row' ? c.row(it.index) : undefined;
        if (row === undefined) return null;
        return { id: getIdRef.current(row), col: ci.get(a.col)?.letter ?? null };
      },
      refresh: () => live.current.cache.refresh(),
      exportCsv,
      getQuery: () => live.current.query,
      setQuery: (next: string) => setQ(next),
    }),
    [scrollToId, focusGrid, exportCsv],
  );
  // ------------------------------------------------------------ bàn phím + chuột + clipboard
  const onGridKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.target !== e.currentTarget || edit) return;
    const ci = active ? navCols.indexOf(active.col) : -1;
    const cur = active && ci >= 0 ? { row: active.v, col: ci } : null;
    const sc = scrollRef.current;
    const pageRows = Math.max(1, Math.floor(((sc?.clientHeight ?? 400) - HEADER_H) / rowH) - 1);
    const item = active ? layout.at(active.v) : null;
    const info = active ? colInfo.get(active.col) : undefined;
    const cmd = keyCommand(
      { key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey, alt: e.altKey },
      cur,
      { rows: layout.count, cols: navCols.length, pageRows },
      { boolCell: info?.col.kind === 'bool' && item?.kind === 'row', canOpen: props.onOpenRow !== undefined },
    );
    if (!cmd) return;
    e.preventDefault();
    switch (cmd.type) {
      case 'move':
        moveTo(cmd.to.row, navCols[cmd.to.col] ?? '');
        break;
      case 'edit':
      case 'open':
      case 'toggle':
        if (!active) break;
        if (item?.kind === 'group') toggleGroup(item.group);
        else if (cmd.type === 'open') {
          const r = rowAt(active.v);
          if (r?.row !== undefined) props.onOpenRow?.(r.row);
        } else if (cmd.type === 'toggle') void toggleBool(active.v, active.col);
        else beginEdit(active);
        break;
      case 'select-row': {
        const r = active ? rowAt(active.v) : null;
        if (r?.row !== undefined) toggleChecked(getId(r.row));
        break;
      }
      case 'select-all':
        toggleAll();
        break;
      case 'focus-query':
        queryInputRef.current?.focus();
        break;
    }
  };

  const cellFromEvent = (e: MouseEvent): Active | null => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-v]');
    if (!el || !scrollRef.current?.contains(el)) return null;
    const v = Number(el.dataset.v);
    if (!Number.isInteger(v)) return null;
    const col = el.dataset.col ?? active?.col ?? visCols[0]?.col.id;
    return col ? { v, col } : null;
  };
  const onGridMouseDown = (e: MouseEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('.ga-dg-editor')) return;
    const cell = cellFromEvent(e);
    if (!cell) return;
    if (edit && (edit.v !== cell.v || edit.col !== cell.col)) void commitEdit('none');
    if (!active || active.v !== cell.v || active.col !== cell.col) {
      setActive(cell);
      setFb((f) => (f.expanded ? { expanded: false, saving: false, error: null } : f));
    }
  };
  const onGridDoubleClick = (e: MouseEvent<HTMLDivElement>): void => {
    const cell = cellFromEvent(e);
    if (cell && layout.at(cell.v)?.kind === 'row') beginEdit(cell);
  };
  // clipboard: phần tử có focus không sửa được (lưới) ⇒ trình duyệt bắn copy / paste ở body, không ở lưới ⇒ nghe ở document,
  // chỉ xử lý khi focus đang ở chính phần tử role=grid (không giành clipboard của ô truy vấn, editor, trang khác)
  const onCopy = (e: ClipboardEvent): void => {
    if (!active) return;
    const r = rowAt(active.v);
    const info = colInfo.get(active.col);
    if (!r?.row || !info || !e.clipboardData) return;
    const v = info.col.value(r.row);
    e.clipboardData.setData('text/plain', v === null ? '' : String(v));
    e.preventDefault();
  };
  const onPaste = (e: ClipboardEvent): void => {
    if (!active || edit || !e.clipboardData) return;
    const r = rowAt(active.v);
    const info = colInfo.get(active.col);
    if (!r?.row || !info || !source.updateCell || !isEditable(info.col, r.row)) return;
    if (info.col.kind === 'longtext' || info.col.requireReason?.(r.row)) return; // ô dài / hàng lõi: chỉ sửa qua editor
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain').replace(/\r?\n$/, '');
    const parsed = parseDraft(info.col, text);
    if (!parsed.ok) {
      setNotice(labels.invalidValue);
      return;
    }
    void save(active.v, active.col, parsed.value, null);
  };
  const clipRef = useRef({ onCopy, onPaste });
  clipRef.current = { onCopy, onPaste };
  useEffect(() => {
    const doc = rootRef.current?.ownerDocument ?? document;
    const mine = (): boolean => scrollRef.current !== null && doc.activeElement === scrollRef.current;
    const copy = (e: ClipboardEvent): void => {
      if (mine()) clipRef.current.onCopy(e);
    };
    const paste = (e: ClipboardEvent): void => {
      if (mine()) clipRef.current.onPaste(e);
    };
    doc.addEventListener('copy', copy);
    doc.addEventListener('paste', paste);
    return () => {
      doc.removeEventListener('copy', copy);
      doc.removeEventListener('paste', paste);
    };
  }, []);

  // ------------------------------------------------------------ hành động của hàng (ổn định cho memo)
  const actionsImpl = {
    toggleChecked,
    toggleBool: (v: number, colId: string) => void toggleBool(v, colId),
    setDraft: (draft: string) => setEdit((e) => (e ? { ...e, draft } : e)),
    commitEdit: (move: MoveAfterEdit) => void commitEdit(move),
    cancelEdit: () => {
      endEdit();
      focusGrid();
    },
    apply: (row: R) => props.onApplyProposal?.(row),
    reject: (row: R) => props.onRejectProposal?.(row),
    goto: (id: string) => void scrollToId(id, active ? colInfo.get(active.col)?.letter : null),
    toggleGroup,
    focusGrid,
  };
  const actionsRef = useRef(actionsImpl);
  actionsRef.current = actionsImpl;
  const actions = useMemo<RowActions<R>>(
    () => ({
      toggleChecked: (id) => actionsRef.current.toggleChecked(id),
      toggleBool: (v, c) => actionsRef.current.toggleBool(v, c),
      setDraft: (d) => actionsRef.current.setDraft(d),
      commitEdit: (m) => actionsRef.current.commitEdit(m),
      cancelEdit: () => actionsRef.current.cancelEdit(),
      apply: (r) => actionsRef.current.apply(r),
      reject: (r) => actionsRef.current.reject(r),
      goto: (id) => actionsRef.current.goto(id),
      toggleGroup: (g) => actionsRef.current.toggleGroup(g),
      focusGrid: () => actionsRef.current.focusGrid(),
    }),
    [],
  );
  const onToggleGroup = useCallback((g: number) => actionsRef.current.toggleGroup(g), []);
  const fmtNum = useMemo(() => {
    const f = new Intl.NumberFormat(labels.locale);
    return (n: number) => f.format(n);
  }, [labels.locale]);

  // ------------------------------------------------------------ dựng
  const fields = useMemo(() => queryFields(columns), [columns]);
  const idPrefix = useMemo(() => prefixOf(table), [table]);
  const err: unknown = cache.error;
  const hasErr = err !== null && err !== undefined;
  const queryErr = err instanceof GridQueryError ? { reason: err.reason, position: err.position } : null;
  const loadingFirst = total === null && !hasErr;
  const ariaRowCount = total === null ? -1 : layout.count + 1;
  const activeItem = active ? layout.at(active.v) : null;
  const activeRendered = active !== null && items.some((it) => it.index === active.v);
  let activeDesc: string | undefined;
  if (active && activeRendered && activeItem) {
    if (activeItem.kind === 'group') activeDesc = groupDomId(domId, activeItem.group);
    else if (activeRow?.row !== undefined && active.col === META_COL)
      activeDesc = metaDomId(domId, getId(activeRow.row));
    else if (activeRow?.row !== undefined && activeInfo)
      activeDesc = cellDomId(domId, getId(activeRow.row), activeInfo.letter);
  }
  const padTop = items.length > 0 ? (items[0]?.start ?? HEADER_H) - HEADER_H : 0;
  const padBottom =
    items.length > 0
      ? Math.max(0, virtualizer.getTotalSize() - ((items[items.length - 1]?.end ?? HEADER_H) - HEADER_H))
      : 0;
  const placeholder = props.queryPlaceholder ?? 'status:active tokens>200';

  // thanh công thức
  const fbRow = activeRow?.row;
  const fbCol = activeInfo?.col;
  const fbEditable =
    fbRow !== undefined && fbCol !== undefined && source.updateCell !== undefined && isEditable(fbCol, fbRow);
  const onMeta = active?.col === META_COL;
  const metaText = (row: R): string => {
    const m = rowMeta?.(row);
    if (m?.kind === 'proposed') return labels.proposed;
    if (m?.kind === 'superseded' && m.supersededBy) return labels.supersededBy(m.supersededBy);
    return '';
  };
  const fbValue =
    fbRow !== undefined && fbCol
      ? fbCol.kind === 'longtext' || fbCol.kind === 'text'
        ? String(fbCol.value(fbRow) ?? '')
        : displayText(fbCol, fbRow)
      : fbRow !== undefined && onMeta
        ? metaText(fbRow)
        : '';
  const fbTokens = fbRow !== undefined && fbCol?.tokens ? fbCol.tokens(fbRow) : null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: đưa focus vào editor khi mở
  useEffect(() => {
    if (fb.expanded) editorRef.current?.focus();
  }, [fb.expanded, activeId]);

  const saveFormula = async (value: string, reason: string | null): Promise<void> => {
    if (!active || !fbCol) return;
    setFb((f) => ({ ...f, saving: true, error: null }));
    const parsed = parseDraft(fbCol, value);
    if (!parsed.ok) {
      setFb((f) => ({ ...f, saving: false, error: labels.invalidValue }));
      return;
    }
    const ok = await save(active.v, active.col, parsed.value, reason);
    if (ok) {
      setFb({ expanded: false, saving: false, error: null });
      focusGrid();
    } else setFb((f) => ({ ...f, saving: false, error: labels.saveError }));
  };

  const sumCols = visCols.filter((c) => c.col.sum);
  const canAdd = props.onAddRow !== undefined || source.createRow !== undefined;
  const addRow = async (): Promise<void> => {
    if (props.onAddRow) {
      props.onAddRow();
      return;
    }
    if (!source.createRow) return;
    try {
      const row = await source.createRow();
      cache.refresh();
      const first = visCols.find((c) => c.col.editable)?.letter ?? null;
      const res = await scrollToId(getId(row), first);
      if (res.status === 'ready' && live.current.visCols.length > 0) focusGrid();
    } catch (err2) {
      setNotice(labels.saveError);
      report(err2);
    }
  };

  let body: ReactNode;
  if (loadingFirst) {
    body = Array.from({ length: 8 }, (_, i) => (
      <GridRow<R>
        // biome-ignore lint/suspicious/noArrayIndexKey: hàng khung xương cố định, không có danh tính
        key={`sk${i}`}
        v={i}
        ariaRow={i + 2}
        row={undefined}
        id={undefined}
        cols={visCols}
        table={table}
        domId={domId}
        activeCol={null}
        checked={false}
        edit={null}
        metaKind="normal"
        supersededBy={null}
        hasMeta={hasMeta}
        canEdit={false}
        canApply={false}
        canReject={false}
        labels={labels}
        actions={actions}
        fmtNum={fmtNum}
      />
    ));
  } else {
    body = items.map((it) => {
      const li = layout.at(it.index);
      if (!li) return null;
      if (li.kind === 'group') {
        const g = groups?.[li.group];
        const colName = groupBy ? (colInfo.get(groupBy)?.col.header ?? groupBy) : '';
        const valueText =
          g && groupBy
            ? (() => {
                const c = colInfo.get(groupBy)?.col;
                if (g.value === null) return labels.emptyValue;
                if (c?.kind === 'bool') return g.value ? labels.on : labels.off;
                return c?.options?.find((o) => o.value === String(g.value))?.label ?? String(g.value);
              })()
            : '';
        return (
          <GroupRow
            key={`g${li.group}`}
            v={it.index}
            ariaRow={it.index + 2}
            group={li.group}
            open={layout.isOpen(li.group)}
            text={labels.groupRow(colName, valueText, fmtNum(g?.count ?? 0))}
            active={active?.v === it.index}
            colCount={visCols.length + 2 + (hasMeta ? 1 : 0)}
            domId={domId}
            onToggle={onToggleGroup}
          />
        );
      }
      const row = cache.row(li.index);
      const id = row !== undefined ? getId(row) : undefined;
      const meta = row !== undefined && rowMeta ? rowMeta(row) : null;
      const isActive = active?.v === it.index;
      return (
        <GridRow<R>
          key={id ?? `i${li.index}`}
          v={it.index}
          ariaRow={it.index + 2}
          row={row}
          id={id}
          cols={visCols}
          table={table}
          domId={domId}
          activeCol={isActive ? (active?.col ?? null) : null}
          checked={id !== undefined && isChecked(id)}
          edit={edit && edit.v === it.index ? edit : null}
          metaKind={meta?.kind ?? 'normal'}
          supersededBy={meta?.supersededBy ?? null}
          hasMeta={hasMeta}
          canEdit={source.updateCell !== undefined}
          canApply={props.onApplyProposal !== undefined}
          canReject={props.onRejectProposal !== undefined}
          labels={labels}
          actions={actions}
          fmtNum={fmtNum}
        />
      );
    });
  }

  const allState = checked.all && checked.ids.size === 0 ? true : checked.all || checked.ids.size > 0 ? 'mixed' : false;
  const headerCheckRef = useCallback(
    (el: HTMLInputElement | null) => {
      if (el) el.indeterminate = allState === 'mixed';
    },
    [allState],
  );
  const headers = tt.getHeaderGroups()[0]?.headers ?? [];
  const parsedQ = useMemo(() => parseQuery(q), [q]);

  return (
    <div
      ref={rootRef}
      className="ga-dg"
      data-table={table}
      style={{
        // biến CSS động (CSSOM — không vi phạm style-src)
        ['--ga-dg-cols' as string]: template,
        ['--ga-dg-row-h' as string]: `${rowH}px`,
      }}
    >
      <Toolbar<R>
        labels={labels}
        views={props.views ?? []}
        view={view}
        onView={(id) => {
          setView(id);
          const vw = props.views?.find((x) => x.id === id);
          setQ(vw?.q ?? '');
          setSorting(toSorting(vw?.sort ?? []));
        }}
        q={q}
        onQuery={(next) => {
          setQ(next);
          setNotice(null);
        }}
        fields={fields}
        idPrefix={idPrefix}
        placeholder={placeholder}
        queryInputRef={queryInputRef}
        serverQueryError={queryErr}
        columns={columns.map((c, i) => ({
          col: c,
          letter: columnLetter(i),
          visible: columnVisibility[c.id] !== false,
        }))}
        sort={sort}
        onSort={(s) => setSorting(toSorting(s))}
        groupBy={groupBy}
        canGroup={source.groups !== undefined}
        onGroupBy={(g) => {
          setGroupBy(g);
          setCollapsed(new Set());
        }}
        onToggleColumn={(id, vis) => setColumnVisibility((cv) => ({ ...cv, [id]: vis }))}
        density={density}
        onDensity={setDensity}
        exporting={exporting}
        onExport={() => void exportCsv()}
        canAdd={canAdd}
        onAdd={() => void addRow()}
      />
      <FormulaBar
        cellRef={activeId && activeInfo ? `${activeId} · ${activeInfo.letter}` : activeId && onMeta ? activeId : null}
        columnLabel={activeInfo?.col.header ?? (onMeta ? labels.metaHeader : null)}
        value={fbValue}
        kindLabel={fbCol ? labels.kinds[fbCol.kind] : null}
        tokens={fbTokens != null ? fmtNum(fbTokens) : null}
        canEdit={fbEditable && fbCol?.kind !== 'bool'}
        openLabel={
          fbCol?.kind === 'longtext' || (fbRow !== undefined && fbCol?.requireReason?.(fbRow))
            ? labels.formula.openEditor
            : labels.formula.edit
        }
        expanded={fb.expanded && activeId !== null}
        requireReason={fbRow !== undefined && fbCol?.requireReason?.(fbRow) === true}
        saving={fb.saving}
        error={fb.error}
        labels={labels.formula}
        onOpen={() => {
          if (!active || !fbCol) return;
          if (fbCol.kind === 'longtext' || (fbRow !== undefined && fbCol.requireReason?.(fbRow))) {
            setFb({ expanded: true, saving: false, error: null });
          } else beginEdit(active);
        }}
        onSave={(value, reason) => void saveFormula(value, reason)}
        onCancel={() => {
          setFb({ expanded: false, saving: false, error: null });
          focusGrid();
        }}
        editorRef={editorRef}
      />
      {(hasErr || notice) && (
        <div className="ga-dg-banner" role="alert">
          <span>{queryErr ? labels.queryRejected(queryErr.reason) : hasErr ? labels.loadError : notice}</span>
          {hasErr && !queryErr && (
            <button type="button" className="ga-dg-btn" onClick={() => cache.retry()}>
              {labels.retry}
            </button>
          )}
          {queryErr && (
            <button type="button" className="ga-dg-btn" onClick={() => setQ('')}>
              {labels.clearQuery}
            </button>
          )}
          {!hasErr && notice && (
            <button type="button" className="ga-dg-btn" onClick={() => setNotice(null)}>
              {labels.close}
            </button>
          )}
        </div>
      )}
      <div
        ref={scrollRef}
        className="ga-dg-scroll"
        role="grid"
        tabIndex={0}
        aria-label={props.label}
        aria-rowcount={ariaRowCount}
        aria-colcount={visCols.length + 2 + (hasMeta ? 1 : 0)}
        aria-multiselectable="true"
        aria-busy={loadingFirst || cache.loading}
        aria-activedescendant={activeDesc}
        onKeyDown={onGridKeyDown}
        onMouseDown={onGridMouseDown}
        onDoubleClick={onGridDoubleClick}
      >
        <div className="ga-dg-table" style={{ width: tableWidth }}>
          <div className="ga-dg-head" role="rowgroup">
            <div className="ga-dg-letters" aria-hidden="true">
              <span className="ga-dg-fz0" />
              <span className="ga-dg-fz1" />
              {visCols.map((c) => (
                <span key={c.col.id}>{c.letter}</span>
              ))}
              {hasMeta && <span />}
            </div>
            <div className="ga-dg-hrow" role="row" aria-rowindex={1}>
              <div role="columnheader" className="ga-dg-th ga-dg-fz0" aria-colindex={1}>
                <input
                  ref={headerCheckRef}
                  type="checkbox"
                  className="ga-dg-check"
                  tabIndex={-1}
                  aria-label={labels.selectAll}
                  checked={allState === true}
                  onMouseDown={(e) => e.preventDefault()}
                  onChange={toggleAll}
                />
              </div>
              <div role="columnheader" className="ga-dg-th ga-dg-fz1" aria-colindex={2}>
                ID
                <span className="ga-dg-pk" aria-hidden="true">
                  PK
                </span>
              </div>
              {headers.map((h, i) => {
                const info = colInfo.get(h.column.id);
                if (!info) return null;
                const s = h.column.getIsSorted();
                const multi = sorting.length > 1;
                return (
                  <div
                    role="columnheader"
                    key={h.id}
                    className="ga-dg-th"
                    aria-colindex={i + 3}
                    aria-sort={s === 'asc' ? 'ascending' : s === 'desc' ? 'descending' : undefined}
                    data-align={info.col.align}
                    title={`${info.letter} · ${info.col.header}`}
                  >
                    <button
                      type="button"
                      className="ga-dg-th-btn"
                      tabIndex={-1}
                      disabled={!h.column.getCanSort()}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={h.column.getToggleSortingHandler()}
                    >
                      <span className="ga-dg-kind" aria-hidden="true">
                        {labels.kinds[info.col.kind]}
                      </span>
                      <span className="ga-dg-th-name">{info.col.header}</span>
                      {s && (
                        <span className="ga-dg-sorted" aria-hidden="true">
                          {s === 'asc' ? '↑' : '↓'}
                          {multi ? h.column.getSortIndex() + 1 : ''}
                        </span>
                      )}
                    </button>
                    <div
                      className="ga-dg-resize"
                      aria-hidden="true"
                      data-active={h.column.getIsResizing() ? '' : undefined}
                      onMouseDown={h.getResizeHandler()}
                      onTouchStart={h.getResizeHandler()}
                      onDoubleClick={() => h.column.resetSize()}
                    />
                  </div>
                );
              })}
              {hasMeta && (
                <div role="columnheader" className="ga-dg-th" aria-colindex={visCols.length + 3}>
                  {labels.metaHeader}
                </div>
              )}
            </div>
          </div>
          <div className="ga-dg-body" role="rowgroup" style={{ paddingTop: padTop, paddingBottom: padBottom }}>
            {body}
            {!loadingFirst && !hasErr && layout.count === 0 && (groupBy === null || groups !== null) && (
              <div role="row" className="ga-dg-emptyrow" aria-rowindex={2}>
                <div
                  role="gridcell"
                  className="ga-dg-empty"
                  aria-colindex={1}
                  aria-colspan={visCols.length + 2 + (hasMeta ? 1 : 0)}
                >
                  <span>{q.trim() !== '' ? labels.emptyQuery : labels.empty}</span>
                  {q.trim() !== '' ? (
                    <button type="button" className="ga-dg-btn" onClick={() => setQ('')}>
                      {labels.clearQuery}
                    </button>
                  ) : (
                    canAdd && (
                      <button type="button" className="ga-dg-btn ga-dg-btn-primary" onClick={() => void addRow()}>
                        {labels.addRow}
                      </button>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="ga-dg-footer">
        <span aria-live="polite">
          {labels.rows(fmtNum(total ?? 0))} · {labels.selected(fmtNum(checkedCount))}
        </span>
        {sumCols.map((c) => (
          <span key={c.col.id}>
            {labels.sum(c.col.header)} <span className="ga-dg-sumval">{fmtNum(cache.aggregates[c.col.id] ?? 0)}</span>
          </span>
        ))}
        {props.footerExtra}
        <span className="ga-dg-footer-end">
          {(cache.loading || exporting) && <span>{exporting ? labels.exporting : labels.loading}</span>}
          {props.updatedLabel && <span>{props.updatedLabel}</span>}
          {!parsedQ.ok && <span className="ga-sr">{labels.query.error(parsedQ.error.reason, '')}</span>}
        </span>
      </div>
    </div>
  );
}
