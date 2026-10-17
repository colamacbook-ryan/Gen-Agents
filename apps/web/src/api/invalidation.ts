import type { LogLineEvent, SseEventTypeName, StreamEvent } from '@ga/contracts';
import type { QueryClient } from '@tanstack/react-query';
import type { CallId, WriteId } from './routes.ts';

// BẢNG VÔ HIỆU HOÁ — một nơi duy nhất nói "ghi route X xong thì đọc lại những route nào". Khoá của bảng = tập route GHI (`WriteId`);
// mảng rỗng được phép nhưng phải tường minh (`[]` = đã cân nhắc, không có gì để đọc lại). Kiểu route của hợp đồng không giữ `method`
// nên `invalidation.test.ts` ép: mọi route không-GET của registry có mục, mọi đích là route đọc JSON có thật, mọi route ghi nối vào
// lưới (GRID_WRITE_ROUTES) đều làm mới OPS-33.

type Targets = readonly CallId[];
const g = (...ids: CallId[]): Targets => ids;
const merge = (...groups: Targets[]): Targets => [...new Set(groups.flat())];

/** Lưới Data Console: bản ghi bị đổi thì mọi trang OPS-33 / bản ghi OPS-35 / vị trí OPS-37 cũ đều hết đúng (cả lưới audit). */
const GRIDS = g('OPS-33', 'OPS-35', 'OPS-37');
const OVERVIEW = g('SYS-80', 'SYS-81');
const ROLES = g('SYS-30', 'SYS-32');
const DNA = g('SYS-37', 'SYS-41');
const PROMPT = g('GW-21', 'GW-22');
const INSTR = g('SYS-46');
const SKILLS = g('SYS-49', 'SYS-60');
const KNOW = g('SYS-54');
const ROLE_ALL = merge(ROLES, DNA, PROMPT, INSTR, SKILLS, KNOW, g('SYS-44', 'SYS-67', 'SYS-70'));
const CHANGESETS = g('SYS-25', 'SYS-26');
const CARDS = g('SYS-75', 'SYS-76');
const CHARS = g('SYS-63', 'SYS-64');
const WALLET = g('WRK-21', 'WRK-27', 'WRK-28', 'WRK-31', 'WRK-32', 'WRK-33');
const MEMORIES = g('WRK-34', 'WRK-35');
const TASKS = g('WRK-15', 'WRK-16', 'WRK-20');
const ACCOUNTS = g('GW-05', 'GW-06');
const ONBOARD = g('SYS-01', 'SYS-03', 'SYS-06');
const CORE = g('SYS-08', 'SYS-10');
const THREADS = g('SYS-16', 'SYS-18', 'SYS-22');
const UPDATE = g('OPS-12', 'OPS-16');
const BRAINS = g('OPS-26');
const ME = g('EXT-03');

export const INVALIDATIONS = {
  // phiên: toàn bộ cache bị xoá ở máy khách đăng nhập; ở đây chỉ làm mới "tôi là ai"
  'EXT-01': ME,
  'EXT-02': ME,
  'EXT-04': ME,
  // onboarding + Core agent
  'SYS-02': merge(ONBOARD, ME, OVERVIEW),
  'SYS-04': merge(ONBOARD, CORE, ACCOUNTS, g('SYS-14', 'GW-25'), GRIDS),
  'SYS-05': merge(ONBOARD, CORE, ACCOUNTS, g('SYS-14', 'GW-25'), GRIDS),
  'SYS-07': merge(ONBOARD, ME, CORE, OVERVIEW),
  'SYS-09': merge(CORE, ONBOARD, OVERVIEW),
  'SYS-11': merge(CORE, ACCOUNTS, g('GW-25'), OVERVIEW, GRIDS),
  'SYS-12': merge(CORE, g('GW-25'), GRIDS),
  'SYS-15': merge(g('SYS-14'), GRIDS),
  // chat
  'SYS-17': g('SYS-16'),
  'SYS-19': THREADS,
  'SYS-20': g('SYS-16', 'SYS-18'),
  'SYS-21': [],
  'SYS-24': g('SYS-18'),
  // change set
  'SYS-27': merge(CHANGESETS, ROLE_ALL, OVERVIEW, GRIDS),
  'SYS-28': merge(CHANGESETS, OVERVIEW, GRIDS),
  'SYS-29': merge(CHANGESETS, ROLE_ALL, OVERVIEW, GRIDS),
  'SYS-84': merge(g('SYS-83'), OVERVIEW, GRIDS),
  // Role
  'SYS-31': merge(ROLES, g('WRK-31', 'SYS-80'), GRIDS),
  'SYS-33': merge(ROLES, GRIDS),
  'SYS-34': merge(ROLES, g('WRK-31', 'SYS-80'), GRIDS),
  'SYS-35': merge(ROLES, g('WRK-31', 'SYS-80'), GRIDS),
  'SYS-36': merge(ROLE_ALL, g('WRK-31', 'SYS-80'), GRIDS),
  'SYS-38': merge(DNA, g('SYS-32', 'SYS-70'), PROMPT, CHANGESETS, GRIDS),
  'SYS-39': merge(DNA, g('SYS-32', 'SYS-70'), PROMPT, CHANGESETS, GRIDS),
  'SYS-40': merge(ROLES, DNA, g('SYS-70'), OVERVIEW, GRIDS),
  'SYS-43': merge(ROLES, DNA, INSTR, SKILLS, PROMPT, GRIDS),
  'SYS-45': merge(g('SYS-44', 'SYS-32'), GRIDS),
  'SYS-47': merge(INSTR, PROMPT, GRIDS),
  'SYS-48': merge(INSTR, PROMPT, GRIDS),
  'SYS-50': merge(SKILLS, GRIDS),
  'SYS-51': merge(SKILLS, PROMPT, GRIDS),
  'SYS-52': merge(SKILLS, GRIDS),
  'SYS-53': merge(SKILLS, PROMPT, GRIDS),
  'SYS-55': merge(KNOW, GRIDS),
  'SYS-56': merge(KNOW, GRIDS),
  'SYS-57': merge(KNOW, GRIDS),
  'SYS-59': merge(g('SYS-58'), GRIDS),
  'SYS-61': merge(SKILLS, GRIDS),
  'SYS-62': g('SYS-60'),
  'SYS-65': merge(CHARS, ROLES, g('SYS-67'), GRIDS),
  'SYS-66': merge(CHARS, GRIDS),
  'SYS-68': merge(g('SYS-67', 'SYS-32'), GRIDS),
  'SYS-69': merge(g('SYS-67', 'SYS-32'), GRIDS),
  'SYS-71': merge(g('SYS-72', 'SYS-70'), GRIDS),
  'SYS-73': merge(g('SYS-72', 'SYS-70'), GRIDS),
  'SYS-74': merge(CARDS, ROLES, g('SYS-70'), ACCOUNTS, OVERVIEW, GRIDS),
  'SYS-77': merge(CARDS, ROLES, OVERVIEW, GRIDS),
  'SYS-78': merge(CARDS, ROLES, OVERVIEW, GRIDS),
  'SYS-79': merge(CARDS, ROLES, OVERVIEW, GRIDS),
  // gateway / engine
  'GW-02': g('GW-01', 'SYS-10', 'SYS-81'),
  'GW-03': merge(g('GW-01'), GRIDS),
  'GW-04': merge(g('GW-01', 'SYS-81'), GRIDS),
  'GW-07': merge(ACCOUNTS, g('GW-18', 'SYS-32'), OVERVIEW, GRIDS),
  'GW-08': merge(ACCOUNTS, g('GW-18', 'SYS-32'), OVERVIEW, GRIDS),
  'GW-09': merge(ACCOUNTS, g('SYS-32'), PROMPT, GRIDS),
  'GW-10': merge(ACCOUNTS, g('SYS-32'), PROMPT, GRIDS),
  'GW-11': merge(ACCOUNTS, GRIDS),
  'GW-12': merge(ACCOUNTS, g('GW-18', 'OPS-19'), OVERVIEW, GRIDS),
  'GW-13': merge(ACCOUNTS, g('GW-18', 'OPS-19'), OVERVIEW, GRIDS),
  'GW-14': merge(ACCOUNTS, g('OPS-19')),
  'GW-15': merge(ACCOUNTS, g('OPS-19', 'SYS-81'), GRIDS),
  'GW-16': merge(ACCOUNTS, g('GW-18'), GRIDS),
  'GW-17': merge(ACCOUNTS, g('GW-18'), GRIDS),
  'GW-19': merge(ACCOUNTS, g('GW-22')),
  'GW-20': g('GW-21', 'GW-22'),
  'GW-24': merge(g('GW-23', 'GW-18'), GRIDS),
  'GW-29': merge(g('GW-26', 'GW-27', 'GW-28', 'GW-30', 'SYS-81'), GRIDS),
  'GW-31': merge(g('GW-28', 'GW-30'), GRIDS),
  // Telegram / proactive
  'WRK-02': merge(g('WRK-01', 'SYS-81'), GRIDS),
  'WRK-03': g('WRK-04'),
  'WRK-05': merge(g('WRK-01', 'WRK-04'), GRIDS),
  'WRK-06': g('WRK-04'),
  'WRK-07': merge(g('WRK-01'), GRIDS),
  'WRK-08': merge(g('WRK-01'), GRIDS),
  'WRK-09': merge(g('WRK-01'), GRIDS),
  'WRK-11': merge(g('WRK-10'), GRIDS),
  'WRK-12': merge(g('WRK-10'), GRIDS),
  'WRK-13': merge(g('WRK-10'), GRIDS),
  'WRK-14': merge(g('WRK-10'), GRIDS),
  // việc / ví / trọng thương
  'WRK-17': merge(TASKS, g('SYS-80'), GRIDS),
  'WRK-18': merge(TASKS, g('SYS-80'), GRIDS),
  'WRK-19': merge(TASKS, WALLET, g('SYS-80'), GRIDS),
  'WRK-23': merge(WALLET, ROLES, OVERVIEW, GRIDS),
  'WRK-24': merge(WALLET, ROLES, OVERVIEW, GRIDS),
  'WRK-25': merge(WALLET, ROLES, OVERVIEW, GRIDS),
  'WRK-26': merge(WALLET, ROLES, OVERVIEW, GRIDS),
  'WRK-29': merge(g('WRK-27', 'WRK-28', 'SYS-81'), GRIDS),
  'WRK-30': merge(g('WRK-27', 'WRK-28'), GRIDS),
  // ký ức
  'WRK-36': merge(MEMORIES, g('SYS-81'), GRIDS),
  'WRK-37': merge(MEMORIES, GRIDS),
  'WRK-38': merge(MEMORIES, g('SYS-81'), GRIDS),
  'WRK-39': merge(MEMORIES, GRIDS),
  'WRK-40': merge(MEMORIES, GRIDS),
  'WRK-41': merge(MEMORIES, GRIDS),
  'WRK-42': merge(MEMORIES, g('SYS-81'), GRIDS),
  'WRK-43': merge(MEMORIES, g('SYS-81'), GRIDS),
  // vận hành
  'OPS-03': merge(g('OPS-02', 'SYS-81'), GRIDS),
  'OPS-04': merge(ME, g('OPS-02'), GRIDS),
  'OPS-07': merge(g('OPS-06'), GRIDS),
  'OPS-08': merge(g('OPS-06'), GRIDS),
  'OPS-10': merge(g('OPS-09'), GRIDS),
  'OPS-11': merge(g('OPS-09'), GRIDS),
  'OPS-13': merge(UPDATE, g('SYS-81'), GRIDS),
  'OPS-14': merge(UPDATE, g('SYS-81', 'OPS-01'), GRIDS),
  'OPS-15': merge(UPDATE, g('SYS-81', 'OPS-01'), GRIDS),
  'OPS-18': merge(g('OPS-17', 'SYS-81'), GRIDS),
  'OPS-22': g('OPS-20'),
  'OPS-27': merge(BRAINS, GRIDS),
  'OPS-28': merge(BRAINS, ROLE_ALL, OVERVIEW, GRIDS),
  'OPS-29': merge(BRAINS, ROLE_ALL, OVERVIEW, GRIDS),
  'OPS-30': merge(BRAINS, MEMORIES, GRIDS),
  'OPS-31': GRIDS,
} satisfies { readonly [K in CallId]?: Targets };

/** Đọc lại mọi truy vấn API đang giữ trong cache (đang hiển thị thì tải lại ngay). */
export const invalidateAll = (qc: QueryClient): Promise<void> => qc.invalidateQueries({ queryKey: ['api'] });

export interface TargetWithParams {
  id: CallId;
  /** chỉ vô hiệu các truy vấn có `params` chứa đủ cặp này (vd `{ gridKey: 'roles' }`) */
  params: Readonly<Record<string, unknown>>;
}
export type Target = CallId | TargetWithParams;

export async function invalidateTargets(qc: QueryClient, targets: readonly Target[]): Promise<void> {
  await Promise.all(
    targets.map((t) => {
      if (typeof t === 'string') return qc.invalidateQueries({ queryKey: ['api', t] });
      const want = Object.entries(t.params);
      return qc.invalidateQueries({
        queryKey: ['api', t.id],
        predicate: (q) => {
          const p = q.queryKey[2] as Record<string, unknown> | null;
          return p !== null && want.every(([k, v]) => p[k] === v);
        },
      });
    }),
  );
}

export const invalidateAfterWrite = (qc: QueryClient, id: WriteId): Promise<void> =>
  invalidateTargets(qc, INVALIDATIONS[id]);

// ---- SSE: sự kiện nào làm truy vấn nào hết đúng. `resync` xử lý riêng (đọc lại TẤT CẢ). Mục `[]` = tường minh "không đọc lại gì".
type EventOf<T extends SseEventTypeName> = Extract<StreamEvent | LogLineEvent, { type: T }>;
type EventTargets = { readonly [T in SseEventTypeName]: (event: EventOf<T>) => readonly Target[] };

const always =
  (...targets: Target[]) =>
  (): readonly Target[] =>
    targets;

export const SSE_INVALIDATIONS: EventTargets = {
  'role.state': always(...ROLES, 'SYS-80', 'WRK-31'),
  'avatar.state': always('SYS-67', 'SYS-32'),
  // chữ chat chảy thẳng vào màn chat qua `stream.subscribe`; không đọc lại REST theo từng delta
  'chat.delta': always(),
  'chat.tool': always(),
  'ui.action': always('SYS-22'),
  notification: always('SYS-83', 'SYS-81'),
  'core_agent.status': always(...CORE, 'SYS-81'),
  'job.progress': always('SYS-80'),
  'update.step': always(...UPDATE, 'OPS-01'),
  'probe.result': always(...ACCOUNTS, 'GW-18'),
  'engine.install': always('GW-01', 'SYS-10'),
  'pty.closed': always(...ACCOUNTS),
  'credential.blocked': always('OPS-19', 'SYS-81'),
  'chat.message': always('SYS-18', 'SYS-16'),
  'chat.turn': always('SYS-18', 'SYS-16'),
  'changeset.state': always(...CHANGESETS, 'SYS-81'),
  'grid.changed': (e) => [
    { id: 'OPS-33', params: { gridKey: e.grid } },
    { id: 'OPS-35', params: {} },
  ],
  'attention.changed': always('SYS-81', 'SYS-80'),
  'card.step': always(...CARDS, 'SYS-70'),
  'trial.progress': always('SYS-72', 'SYS-70'),
  'knowledge.progress': always(...KNOW),
  'telegram.capture': always('WRK-04'),
  'wallet.changed': always(...WALLET),
  'engine.failover': always(...ACCOUNTS, 'SYS-82'),
  resync: always(),
  // chỉ có trên /logs/stream (OPS-24): màn log tự nối dòng mới, không qua cache
  'log.line': always(),
};

export function applyStreamEvent(qc: QueryClient, event: StreamEvent): Promise<void> {
  if (event.type === 'resync') return invalidateAll(qc);
  // loại sự kiện mới của máy chủ mà web chưa biết: bỏ qua (không làm hỏng luồng); test đảm bảo mọi loại của hợp đồng đều có mục
  const fn = SSE_INVALIDATIONS[event.type] as ((e: StreamEvent) => readonly Target[]) | undefined;
  return fn ? invalidateTargets(qc, fn(event)) : Promise.resolve();
}
