import { DataGrid } from '@ga/ui/datagrid';
import { useRouteQuery } from '../query.tsx';
import { useGrid } from '../use-grid.ts';

/**
 * Trang dò của backend giả (`/__api-probe`, chỉ có khi build VITE_GA_FAKE=1): đọc SYS-80 (tổng quan) và dựng DataGrid thật từ `useGrid('roles')`
 * — để test Chromium chứng minh cả chuỗi phiên → CSRF → client gõ kiểu → schema → giao diện chạy dưới CSP chặt. Không phải màn nghiệp vụ.
 */
const PROBE = 'api-probe';

export function ApiProbe() {
  const overview = useRouteQuery('SYS-80', { query: { range: 'today' } });
  const grid = useGrid('roles');
  return (
    <section aria-label={PROBE}>
      <h2>{PROBE}</h2>
      <p data-testid="overview-status">{overview.status}</p>
      <ul data-testid="overview-kpis">
        {overview.data?.kpis.map((k) => (
          <li key={k.key} data-kpi={k.key}>
            {k.key}={k.value}
          </li>
        ))}
      </ul>
      <p data-testid="grid-status">{grid.status}</p>
      {grid.status === 'ready' ? <DataGrid {...grid.props} /> : null}
    </section>
  );
}
