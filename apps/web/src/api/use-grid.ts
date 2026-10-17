import type { GridKeyName } from '@ga/contracts';
import { useI18n } from '@ga/i18n/react';
import type { DataGridHandle, DataGridProps } from '@ga/ui/datagrid';
import { type RefObject, useEffect, useMemo, useRef } from 'react';
import type { ApiError } from './error.ts';
import {
  buildColumns,
  buildViews,
  createGridSource,
  type GridRowData,
  type GridSource,
  gridLabels,
  parseSort,
  rowMeta,
  tableOf,
} from './grid.ts';
import { useStreamEvents } from './live.tsx';
import { useApi, useRouteQuery } from './query.tsx';

/** Đúng các prop DataGrid cần từ lớp dữ liệu: `<DataGrid {...grid.props} ref={ref} />`. */
export type GridProps = Pick<
  DataGridProps<GridRowData>,
  'table' | 'label' | 'columns' | 'source' | 'getId' | 'rowMeta' | 'views' | 'initialSort' | 'persistKey'
>;

export type UseGrid =
  | { status: 'loading'; props: null; error: null; source: null }
  | { status: 'error'; props: null; error: ApiError; source: null }
  /** lưới không có trong OPS-32 (không đủ quyền đọc hoặc khoá lạ) */
  | { status: 'missing'; props: null; error: null; source: null }
  | { status: 'ready'; props: GridProps; error: null; source: GridSource };

const REFRESH_DEBOUNCE_MS = 250;

/**
 * `useGrid('roles', gridRef)`: đọc OPS-32 rồi dựng cột / nguồn dữ liệu / view cho DataGrid. Sự kiện SSE `grid.changed` của đúng lưới này ⇒
 * `gridRef.current.refresh()` (gộp chùm sự kiện trong 250 ms) — DataGrid không dùng cache TanStack nên vô hiệu hoá cache không đủ.
 */
export function useGrid(gridKey: GridKeyName, gridRef?: RefObject<DataGridHandle | null>): UseGrid {
  const api = useApi();
  const i18n = useI18n();
  const infos = useRouteQuery('OPS-32', undefined, { staleTime: 60_000 });
  const info = infos.data?.find((g) => g.key === gridKey);
  const { locale } = i18n;

  // biome-ignore lint/correctness/useExhaustiveDependencies: dịch lại khi đổi ngôn ngữ (locale); `i18n` đổi nhận dạng mỗi render
  const built = useMemo(() => {
    if (!info) return null;
    const labels = gridLabels(i18n, gridKey);
    const source = createGridSource(api, gridKey);
    const props: GridProps = {
      table: tableOf(gridKey),
      label: labels.title(),
      columns: buildColumns(info, labels),
      source,
      getId: (r) => r.displayId,
      rowMeta,
      views: buildViews(info, labels),
      initialSort: parseSort(info.defaultSort),
      persistKey: `grid:${gridKey}`,
    };
    return { props, source };
  }, [api, gridKey, info, locale]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useStreamEvents((event) => {
    if (event.type !== 'grid.changed' || event.grid !== gridKey || timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      gridRef?.current?.refresh();
    }, REFRESH_DEBOUNCE_MS);
  });

  if (infos.isError) return { status: 'error', props: null, error: infos.error, source: null };
  if (!infos.isSuccess) return { status: 'loading', props: null, error: null, source: null };
  if (!built) return { status: 'missing', props: null, error: null, source: null };
  return { status: 'ready', props: built.props, error: null, source: built.source };
}
