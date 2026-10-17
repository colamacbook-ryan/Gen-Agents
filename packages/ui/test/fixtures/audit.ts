// Lưới Audit & logs (A8, design v4 Audit.dc.html) — sinh N hàng tất định (PRNG có hạt), dùng cho ảo hoá 10k hàng + navigate.
import type { CellValue, GridColumn } from '../../src/datagrid/types.ts';

export interface AuditRow {
  id: string;
  created_at: string;
  role: string | null;
  actor: string;
  action: string;
  tool: string | null;
  result: 'ok' | 'denied' | 'error';
  tokens_total: number;
  entity: string | null;
  reason: string | null;
  detail: string;
}

const ROLES = ['Mai', 'Lan', 'Tùng', 'Hà', 'Khoa', 'Vy', 'Minh'];
const ACTIONS: readonly [string, string | null, string][] = [
  ['task.report', 'report_task', 'TK'],
  ['task.accept', 'report_task', 'TK'],
  ['telegram.send', 'send_telegram', 'PN'],
  ['polaris.check', 'report_task', 'PC'],
  ['memory.propose', 'remember', 'MM'],
  ['tool.call', 'github.pr_review', 'TK'],
  ['ledger.penalty', null, 'LG'],
  ['ledger.reward', null, 'LG'],
  ['dna_field.update', null, 'DN'],
  ['permission.request', null, 'PM'],
  ['session.engine_account', null, 'SS'],
  ['notify.owner', null, 'NT'],
];
const REASONS = [
  'Tự báo: giờ đề xuất trùng giao ban, chưa gửi khách',
  'Chưa được cấp quyền google.sheets.read',
  'Lan đang nghỉ dưỡng thương — tin bị giữ',
  'Rút gọn tin nhắn',
  'Bài tuần 41 trễ hạn, không báo trước',
];

/** PRNG mulberry32 (tất định — không dùng Math.random) */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const auditId = (seq: number): string => `AU-${String(seq).padStart(5, '0')}`;

/** N hàng, AU-00001 … AU-N, thời gian tăng dần từ 27/09/2026 */
export function makeAuditRows(n: number, seed = 20261014): AuditRow[] {
  const rand = rng(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
  const t0 = Date.UTC(2026, 8, 27, 7, 0, 0);
  const out: AuditRow[] = [];
  for (let seq = 1; seq <= n; seq++) {
    const [action, tool, prefix] = pick(ACTIONS);
    const r = rand();
    const result = r < 0.9 ? 'ok' : r < 0.97 ? 'denied' : 'error';
    const role = rand() < 0.08 ? null : pick(ROLES);
    const tokens = action === 'polaris.check' || action.startsWith('ledger') ? 0 : Math.floor(rand() * 4000);
    out.push({
      id: auditId(seq),
      created_at: new Date(t0 + seq * 97_000 + Math.floor(rand() * 1000)).toISOString(),
      role,
      actor: role && rand() < 0.7 ? role : pick(['Hệ thống', 'Gateway', 'Scheduler', 'Chủ sở hữu']),
      action,
      tool,
      result,
      tokens_total: tokens,
      entity: `${prefix}-${String(1 + Math.floor(rand() * 900)).padStart(4, '0')}`,
      reason: result === 'ok' && rand() < 0.8 ? null : pick(REASONS),
      detail: JSON.stringify({ request: `rq-${(seq * 7919).toString(16)}`, rank_at: 1 + Math.floor(rand() * 6) }),
    });
  }
  return out;
}

const fmtTime = (v: CellValue): string =>
  typeof v === 'string' ? `${v.slice(8, 10)}/${v.slice(5, 7)} ${v.slice(11, 19)}` : '';

export const AUDIT_COLUMNS: GridColumn<AuditRow>[] = [
  {
    id: 'created_at',
    header: 'Thời gian',
    kind: 'date',
    width: 132,
    value: (r) => r.created_at,
    format: fmtTime,
    query: { field: 'created' },
  },
  {
    id: 'role',
    header: 'Role',
    kind: 'text',
    width: 88,
    value: (r) => r.role,
    query: { field: 'role', aliases: ['vai'] },
  },
  { id: 'actor', header: 'Actor', kind: 'text', width: 112, value: (r) => r.actor, query: { field: 'actor' } },
  { id: 'action', header: 'Hành động', kind: 'text', width: 176, value: (r) => r.action, query: { field: 'action' } },
  { id: 'tool', header: 'Tool', kind: 'text', width: 144, value: (r) => r.tool, query: { field: 'tool' } },
  {
    id: 'result',
    header: 'Kết quả',
    kind: 'enum',
    width: 96,
    value: (r) => r.result,
    options: [
      { value: 'ok', label: 'ok' },
      { value: 'denied', label: 'bị chặn', aliases: ['bi-chan'] },
      { value: 'error', label: 'lỗi', aliases: ['loi'] },
    ],
    query: { field: 'result', aliases: ['ket-qua'] },
  },
  {
    id: 'tokens_total',
    header: 'Token',
    kind: 'number',
    width: 80,
    value: (r) => r.tokens_total,
    align: 'end',
    sum: true,
    query: { field: 'tokens' },
  },
  { id: 'entity', header: 'Đích', kind: 'text', width: 96, value: (r) => r.entity, query: { field: 'entity' } },
  { id: 'reason', header: 'Lý do', kind: 'text', width: 240, value: (r) => r.reason, query: false },
  { id: 'detail', header: 'Chi tiết', kind: 'longtext', width: 200, value: (r) => r.detail, query: false },
];
