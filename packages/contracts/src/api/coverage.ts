import { gridRouteIds } from './grids.ts';

// Độ phủ FRONTEND-SPEC → route (BACKEND-TRIAL §3.11) và cây lệnh `genagents` → route (§3.10).
// Đây là DỮ LIỆU của hợp đồng: test `api:coverage` đối chiếu với ROUTES (mỗi mã màn có ≥ 1 route; mỗi route trỏ tới có thật; route
// nào không thuộc màn nào phải khai `cliOnly` kèm lý do). Frontend (Data Console là MVP, owner chốt 2026-10-17) và `ga-cli` chỉ
// dùng các route này — không xin thêm API.

/** `SYS-01..07` → 7 id; `SYS-80` → 1 id. */
export function expandIds(spec: string): string[] {
  const m = /^([A-Z]+)-(\d{2})(?:\.\.(\d{2}))?$/.exec(spec);
  if (!m) throw new Error(`mã route không hợp lệ: ${spec}`);
  const prefix = m[1] as string;
  const from = Number(m[2]);
  const to = m[3] === undefined ? from : Number(m[3]);
  if (to < from) throw new Error(`dải ngược: ${spec}`);
  const out: string[] = [];
  for (let n = from; n <= to; n++) out.push(`${prefix}-${String(n).padStart(2, '0')}`);
  return out;
}

const ids = (...specs: string[]): readonly string[] => [...new Set(specs.flatMap(expandIds))];

/**
 * Mã màn / thành phần FRONTEND-SPEC → route cần để dựng nó (§3.11). `O3` (phím tắt) và các việc chỉ-giao-diện (xuất PNG thẻ, ba
 * biến thể "Rảnh", chuyển động chibi, mật độ / nhớ cột) không cần API. `W1` = Telegram (§3.9): bot gọi cùng DỊCH VỤ, các route
 * dưới đây là nguồn hành vi chung (bot không gọi HTTP).
 */
export const FS_COVERAGE = {
  S0: ids('OPS-01'),
  G1: ids('EXT-01..04'),
  G2: ids(
    'SYS-01..07',
    'SYS-14',
    'SYS-15',
    'GW-01',
    'GW-02',
    'GW-05',
    'GW-06',
    'GW-11',
    'GW-12',
    'GW-14..16',
    'GW-18',
    'EXT-05',
  ),
  A0: ids('SYS-80..82', 'WRK-15', 'GW-05', 'OPS-19', 'SYS-85', 'WRK-16..18', 'WRK-22', 'WRK-23'),
  A1: ids(
    'SYS-31',
    'SYS-16..24',
    'SYS-37..40',
    'GW-21',
    'GW-22',
    'SYS-63',
    'SYS-68',
    'WRK-01..05',
    'SYS-85',
    'SYS-67',
    'SYS-69',
  ),
  'A2.table': ids('SYS-46..57', 'SYS-25..29', 'SYS-16..24', 'GW-22'),
  'A2.tree': ids('SYS-58..62', 'SYS-25..28', 'OPS-35'),
  A3: ids(
    'SYS-30',
    'SYS-32..36',
    'SYS-41..43',
    'SYS-37',
    'SYS-46',
    'SYS-49',
    'SYS-54',
    'WRK-21',
    'WRK-34',
    'WRK-10',
    'WRK-27',
  ),
  'A3.E': ids('GW-05..16', 'GW-18..20', 'GW-22', 'GW-25', 'EXT-05'),
  'A3.T': ids('WRK-01..09'),
  'A3.P': ids('WRK-10..14'),
  'A3.G': ids('WRK-27', 'WRK-28..30', 'WRK-22..25', 'WRK-38', 'GW-22'),
  A4: ids('SYS-70..79', 'SYS-85'),
  A5: ids('GW-01..06', 'GW-17', 'GW-18', 'GW-23..25', 'SYS-14', 'SYS-15', 'SYS-10..12', 'OPS-19'),
  A6: ids('OPS-02..11', 'OPS-17', 'OPS-18', 'EXT-04'),
  A7: ids('OPS-12..16', 'GW-01'),
  A8: ids('OPS-20..25', 'OPS-09'),
  A9: ids('WRK-31..33'),
  A10: ids('WRK-34..43', 'OPS-26..31'),
  A11: ids('SYS-63..66', 'SYS-30'),
  O1: ids('OPS-36', 'OPS-35'),
  O2: ids('SYS-83', 'SYS-84', 'SYS-85'),
  O3: [],
  O4: ids(
    'SYS-08..13',
    'GW-02',
    'GW-11',
    'GW-12',
    'GW-14',
    'GW-25',
    'SYS-77',
    'WRK-09',
    'WRK-14',
    'OPS-12..15',
    'OPS-20..25',
  ),
  W1: ids(
    'WRK-15',
    'WRK-20',
    'SYS-32',
    'GW-05',
    'WRK-10',
    'WRK-21',
    'WRK-18',
    'WRK-03..05',
    'WRK-07',
    'WRK-28',
    'WRK-30',
  ),
  // Data Console (STD-07 §5): DataGrid, FormulaBar, ô truy vấn — route ghi của từng miền; KHÔNG có PATCH chung.
  DataGrid: [...new Set([...ids('OPS-32..35'), ...gridRouteIds()])],
  TokenMeter: ids('GW-22'),
  'QuotaBar/CapabilityCard': ids('GW-05', 'GW-18'),
  ChatPanel: ids('SYS-16..24', 'SYS-85'),
  EmbeddedTerminal: ids('GW-14', 'EXT-05'),
  'PenaltyModal/GrantModal/WoundPanel/PolarisBlock': ids('WRK-22..24', 'WRK-28', 'WRK-27'),
  'VersionTimeline/DiffViewer': ids('SYS-41..43'),
  'ChibiAvatar/AvatarModal': ids('SYS-64', 'SYS-30', 'SYS-67..69'),
  LogStream: ids('OPS-24', 'OPS-25'),
} as const satisfies Record<string, readonly string[]>;

export type FsCode = keyof typeof FS_COVERAGE;
export const FS_CODES = Object.keys(FS_COVERAGE) as FsCode[];

/** Màn không cần route nào (chỉ giao diện) — test `api:coverage` cho phép rỗng đúng các mã này. */
export const FS_NO_API: readonly FsCode[] = ['O3'];

/** Sự kiện SSE mà bảng §3.11 gắn cho màn / thành phần (ngoài route). */
export const FS_SSE_COVERAGE: Partial<Record<FsCode, readonly string[]>> = {
  A4: ['card.step', 'trial.progress'],
  EmbeddedTerminal: ['pty.closed', 'probe.result'],
  LogStream: ['card.step', 'log.line'],
};

/** Mã màn của một route (dẫn xuất từ FS_COVERAGE; `fs` của route trong registry). */
export function fsOf(routeId: string): readonly string[] {
  return FS_CODES.filter((code) => (FS_COVERAGE[code] as readonly string[]).includes(routeId));
}

// ---------------------------------------------------------------- cây lệnh `genagents` (§3.10)
export interface CliGroup {
  group: string;
  /** Lệnh (mô tả gọn) của nhóm. */
  commands: readonly string[];
  routes: readonly string[];
}

/**
 * Lệnh quản trị qua `ga-cli`. Lệnh host (bash: start · stop · status · update · rollback · logs · backup · restore ·
 * uninstall · key show · engines install · help) giữ như BUILD-PLAN §B.9; riêng `status`, `update`, `rollback`, `backup`
 * gọi OPS-01 / OPS-14 / OPS-15 / OPS-18 khi app sống. `api <METHOD> <path>` (body chỉ từ tệp / stdin) dùng được MỌI route.
 */
export const CLI_GROUPS: readonly CliGroup[] = [
  {
    group: 'Host (bash)',
    commands: ['status', 'update', 'rollback', 'backup', 'engines install'],
    routes: ids('OPS-01', 'OPS-14', 'OPS-15', 'OPS-18', 'GW-02'),
  },
  { group: 'Phiên', commands: ['auth login', 'auth logout', 'auth passwd', 'auth whoami'], routes: ids('EXT-01..04') },
  {
    group: 'Thiết lập',
    commands: ['setup', 'onboarding checklist'],
    routes: ids('SYS-01..07', 'SYS-14', 'SYS-15', 'GW-01', 'GW-02', 'GW-12', 'GW-14..16', 'GW-18', 'EXT-05'),
  },
  {
    group: 'Core agent / O4',
    commands: ['core status', 'core recheck', 'core fix', 'core change-type', 'emergency'],
    routes: ids('SYS-08..13', 'GW-02', 'GW-11', 'GW-14', 'SYS-77', 'SYS-78', 'WRK-09', 'WRK-14'),
  },
  {
    group: 'Tổng quan',
    commands: ['dash', 'attention', 'events', 'notifications'],
    routes: ids('SYS-80..85'),
  },
  {
    group: 'Nhân sự',
    commands: ['roles', 'role', 'position'],
    routes: ids('SYS-30', 'SYS-32..36', 'SYS-41..45'),
  },
  {
    group: 'Khai sinh',
    commands: ['birth', 'dna', 'prompt', 'budget'],
    routes: ids('SYS-31', 'SYS-16..24', 'SYS-37..40', 'GW-21', 'GW-22', 'SYS-63'),
  },
  { group: 'Chat', commands: ['chat', 'chat redact'], routes: ids('SYS-16..24') },
  {
    group: 'Đào tạo',
    commands: ['train', 'instr', 'skill', 'kn', 'tree', 'taxonomy', 'proposals', 'proposal'],
    routes: ids('SYS-21', 'SYS-25..29', 'SYS-46..62'),
  },
  {
    group: 'Avatar / Kho',
    commands: ['characters', 'character', 'avatar'],
    routes: ids('SYS-63..69'),
  },
  {
    group: 'Engine của Role',
    commands: ['engine', 'login', 'login-check', 'consent', 'apikey', 'scan', 'measure'],
    routes: ids('GW-05..22'),
  },
  {
    group: 'Engine tổng',
    commands: [
      'accounts',
      'engines',
      'capabilities',
      'model-ranks',
      'containers',
      'agents',
      'sessions',
      'session show',
    ],
    routes: ids('GW-01', 'GW-03..05', 'GW-18', 'GW-23..27', 'SYS-14', 'SYS-15'),
  },
  { group: 'Quyền tool', commands: ['perms', 'perm', 'grants', 'tools'], routes: ids('GW-28..32') },
  {
    group: 'Thẻ',
    commands: ['card checks', 'trial', 'card issue', 'cards', 'card'],
    routes: ids('SYS-70..79'),
  },
  { group: 'Telegram', commands: ['telegram'], routes: ids('WRK-01..09') },
  { group: 'Chủ động', commands: ['proactive'], routes: ids('WRK-10..14') },
  { group: 'Việc', commands: ['tasks', 'task', 'commitments'], routes: ids('WRK-15..20') },
  {
    group: 'Kinh tế',
    commands: ['wallet', 'penalize', 'reward', 'grant', 'reverse', 'polaris', 'leaderboard', 'penalties'],
    routes: ids('WRK-21..27', 'WRK-31..33'),
  },
  {
    group: 'Trọng thương',
    commands: ['wound', 'reflection rerun', 'lesson', 'wound-msg reassign'],
    routes: ids('WRK-28..30', 'WRK-38'),
  },
  {
    group: 'Brain',
    commands: ['brain', 'memory', 'consolidate'],
    routes: ids('WRK-34..43'),
  },
  {
    group: 'Hệ thống',
    commands: ['settings', 'secrets', 'egress', 'anchor', 'version', 'backups', 'backup', 'relogin-list'],
    routes: ids('OPS-02..19'),
  },
  { group: 'Audit / log', commands: ['audit', 'applog'], routes: ids('OPS-20..25') },
  { group: 'Brain-export', commands: ['brain-export'], routes: ids('OPS-26..31') },
  {
    group: 'Tra cứu',
    commands: ['grid', 'show', 'search', 'api', 'diag'],
    routes: ids('OPS-32..36'),
  },
];
