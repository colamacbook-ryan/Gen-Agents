// Trang thử DataGrid trong Chromium thật (đóng gói bằng Vite trong bộ nhớ, phục vụ dưới CSP chặt).
// Tham số URL: fixture=instructions|audit · n=<số hàng audit> · persist=1 · failSave=1 · latency=<ms> · group=1
// Phơi ra window.__h cho test (handle của lưới, nguồn, sự kiện anchor, vi phạm CSP, lời gọi callback).
// biome-ignore-all assist/source/organizeImports: zod-jitless PHẢI nạp trước mọi module dựng schema zod (thứ tự đánh giá ESM)
import './zod-jitless.ts';
import { StrictMode, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ANCHOR_READY_EVENT,
  type AnchorReadyDetail,
  createMemorySource,
  DataGrid,
  type DataGridHandle,
  type GridDataSource,
  type GridUpdateRequest,
} from '../../src/datagrid/index.ts';
import { AUDIT_COLUMNS, type AuditRow, makeAuditRows } from '../fixtures/audit.ts';
import {
  INSTRUCTION_COLUMNS,
  INSTRUCTIONS,
  type InstructionRow,
  instructionMeta,
  updateInstruction,
} from '../fixtures/instructions.ts';

interface Violation {
  directive: string;
  blocked: string;
  sample: string;
}
const csp: Violation[] = [];
document.addEventListener('securitypolicyviolation', (e) =>
  csp.push({ directive: e.violatedDirective, blocked: e.blockedURI, sample: e.sample }),
);

const params = new URLSearchParams(location.search);
const fixture = params.get('fixture') ?? 'instructions';
const latency = Number(params.get('latency') ?? 0);

const page = new CSSStyleSheet();
page.replaceSync(
  'html,body{margin:0;background:#111012;color:#eceae6;font-family:system-ui,sans-serif}h1{font-size:13px;margin:8px 16px}a{color:#e8a33d}' +
    '#root{box-sizing:border-box;padding:16px;height:640px;width:1280px;display:flex;flex-direction:column}' +
    '#after{margin:16px}',
);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, page];

const anchorEvents: AnchorReadyDetail[] = [];
const copied: string[] = [];
document.addEventListener(ANCHOR_READY_EVENT, (e) => {
  const d = (e as CustomEvent<AnchorReadyDetail>).detail;
  anchorEvents.push({ ...d, element: null });
});
// window (sau mọi listener ở document, kể cả của lưới) ⇒ đọc được dữ liệu lưới vừa đặt
window.addEventListener('copy', (e) => copied.push(e.clipboardData?.getData('text/plain') ?? ''));

const network = { down: params.get('failFetch') === '1' };
const calls = {
  updates: [] as GridUpdateRequest[],
  applied: [] as string[],
  rejected: [] as string[],
  opened: [] as string[],
  errors: [] as string[],
  added: 0,
  active: [] as string[],
};

/** bọc nguồn: ghi lại lời gọi sửa ô (kể cả lý do), giả lập lỗi lưu khi failSave=1 */
function wrap<R>(src: GridDataSource<R>): GridDataSource<R> {
  const update = src.updateCell?.bind(src);
  const out: GridDataSource<R> = { ...src };
  // getter fetchCount của nguồn bộ nhớ không đi qua spread
  Object.defineProperty(out, 'fetchCount', { get: () => (src as unknown as { fetchCount: number }).fetchCount });
  // failFetch=1: mọi lần tải lỗi (mạng) tới khi test gọi __h.heal() — nút "Thử lại" phải tải lại được
  out.fetchRange = async (req) => {
    if (network.down) throw new Error('mô phỏng lỗi mạng');
    return src.fetchRange(req);
  };
  if (update) {
    out.updateCell = async (req) => {
      calls.updates.push({ ...req });
      if (params.get('failSave') === '1') throw new Error('mô phỏng lỗi lưu');
      return update(req);
    };
  }
  return out;
}

const instrSource = createMemorySource<InstructionRow>(INSTRUCTIONS, {
  columns: INSTRUCTION_COLUMNS,
  getId: (r) => r.id,
  idPrefix: 'IN',
  update: updateInstruction,
  create: (rows) => {
    calls.added++;
    const seq = rows.length + 1;
    return {
      id: `IN-${String(seq).padStart(4, '0')}`,
      ordinal: 9,
      layer: 'style',
      name: 'Khối mới',
      content: '',
      condition: 'luôn',
      is_enabled: false,
      token_count: 0,
      source: 'owner',
      updated_at: '2026-10-14T07:06:00.000Z',
      is_core: false,
      status: 'active',
      superseded_by: null,
    };
  },
  latencyMs: latency,
  clock: { now: () => new Date('2026-10-14T07:06:00.000Z') },
});
const auditRows = fixture === 'audit' ? makeAuditRows(Number(params.get('n') ?? 10_000)) : [];
const auditSource = createMemorySource<AuditRow>(auditRows, {
  columns: AUDIT_COLUMNS,
  getId: (r) => r.id,
  idPrefix: 'AU',
  latencyMs: latency,
  clock: { now: () => new Date('2026-10-14T07:06:00.000Z') },
});
const source = fixture === 'audit' ? wrap(auditSource) : wrap(instrSource);

const memoryStorage = new Map<string, string>();
const storage = {
  getItem: (k: string) => window.localStorage.getItem(k) ?? memoryStorage.get(k) ?? null,
  setItem: (k: string, v: string) => window.localStorage.setItem(k, v),
};

function App() {
  const ref = useRef<DataGridHandle>(null);
  (window as unknown as { __grid: typeof ref }).__grid = ref;
  if (fixture === 'audit') {
    return (
      <DataGrid<AuditRow>
        ref={ref}
        table="audit_log"
        label="Audit & logs"
        columns={AUDIT_COLUMNS}
        source={source as GridDataSource<AuditRow>}
        getId={(r) => r.id}
        queryPlaceholder="role:Lan action:ledger.* result:denied"
        views={[
          { id: 'denied', label: 'Bị chặn', q: 'result:denied' },
          { id: 'ledger', label: 'Bút toán ₲', q: 'action:ledger.*' },
        ]}
        updatedLabel="Cập nhật 14:06"
        onError={(e) => calls.errors.push(String((e as Error).message ?? e))}
        {...(params.get('persist') === '1' ? { persistKey: 'audit-test', storage } : {})}
      />
    );
  }
  return (
    <DataGrid<InstructionRow>
      ref={ref}
      table={params.get('table') === 'skills' ? 'skills' : 'instructions'}
      label="Instructions của Mai"
      columns={INSTRUCTION_COLUMNS}
      source={source as GridDataSource<InstructionRow>}
      getId={(r) => r.id}
      rowMeta={instructionMeta}
      queryPlaceholder="lop:vi-tri on:true tokens>80"
      views={[{ id: 'on', label: 'Đang bật', q: 'on:true' }]}
      updatedLabel="Cập nhật 14:02"
      onActiveCellChange={(c) => calls.active.push(c ? `${c.id}·${c.col ?? '-'}` : '∅')}
      onApplyProposal={(r) => calls.applied.push(r.id)}
      onRejectProposal={(r) => calls.rejected.push(r.id)}
      onError={(e) => calls.errors.push(String((e as Error).message ?? e))}
      {...(params.get('open') === '1' ? { onOpenRow: (r: InstructionRow) => calls.opened.push(r.id) } : {})}
      {...(params.get('persist') === '1' ? { persistKey: 'instr-test', storage } : {})}
    />
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('thiếu #root');
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

(window as unknown as Record<string, unknown>).__h = {
  ready: true,
  csp,
  anchorEvents,
  copied,
  calls,
  source,
  rows: () => (fixture === 'audit' ? auditSource.all() : instrSource.all()),
  heal: () => {
    network.down = false;
  },
};
