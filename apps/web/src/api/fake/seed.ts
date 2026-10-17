import { type EntityPrefix, formatDisplayId } from '@ga/contracts';

// Dữ liệu mẫu của backend giả (CHỈ dev / test). Không tên người thật, không tên CLI / model cụ thể: chủ workspace là "Chủ Mẫu",
// engine là `engine-a` / `engine-b`. Mật khẩu sinh lúc chạy (không ghi cứng trong mã).

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** ULID tất định hợp lệ theo `ULID_RE` (Crockford, bỏ I L O U): `fakeUlid(7)` luôn ra cùng một chuỗi. */
export function fakeUlid(n: number): string {
  let x = n;
  let tail = '';
  for (let i = 0; i < 16; i++) {
    tail = ALPHABET[x % 32] + tail;
    x = Math.floor(x / 32);
  }
  return `01JFAKE000${tail}`;
}

export const display = (prefix: EntityPrefix, n: number): string => formatDisplayId(prefix, n);
export const ref = (prefix: EntityPrefix, n: number) => ({
  id: fakeUlid(prefix.charCodeAt(0) * 1000 + n),
  displayId: display(prefix, n),
});

/** Thời điểm cố định của kịch bản (đồng hồ giả tất định). */
export const FAKE_NOW = Date.parse('2026-10-17T07:00:00.000Z');
export const iso = (minutesAgo = 0): string => new Date(FAKE_NOW - minutesAgo * 60_000).toISOString();

export const ROLE_COLORS = ['teal', 'saffron', 'coral', 'azure'] as const;
export const ROLE_NAMES = ['Mai', 'Tùng', 'Lan', 'Hà'] as const;

export interface FakeRole {
  n: number;
  name: string;
  color: (typeof ROLE_COLORS)[number];
  runtime: 'running' | 'sleeping' | 'error' | 'stopped';
  condition: 'normal' | 'wounded';
  tokensToday: number;
  skills: number;
  memories: number;
  balanceMinor: number;
}

export interface FakeTask {
  n: number;
  roleN: number | null;
  title: string;
  status: 'todo' | 'queued' | 'running' | 'done' | 'failed';
  source: 'telegram' | 'web' | 'schedule';
  tokens: number;
}

export interface FakeLog {
  ts: string;
  container: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface FakeDb {
  workspace: { id: string; name: string; shortCode: string; lang: 'vi' | 'en'; timezone: string };
  owner: { n: number; name: string; username: string; password: string };
  roles: FakeRole[];
  tasks: FakeTask[];
  logs: FakeLog[];
  notifications: {
    n: number;
    kind: 'update_available' | 'quota_low' | 'role_error';
    severity: 'info' | 'warn' | 'danger';
    read: boolean;
  }[];
  /** số bút toán đã ghi (cấp ₲) — để mã LG tăng dần */
  ledgerSeq: number;
  /** Core agent đang ở chế độ khắc phục? (công tắc recovery của backend giả đọc từ đây) */
  recovery: boolean;
}

export interface SeedOptions {
  ownerName?: string;
  username?: string;
  /** mặc định: sinh ngẫu nhiên lúc chạy */
  password?: string;
  taskCount?: number;
  logCount?: number;
}

export function createSeed(opts: SeedOptions = {}): FakeDb {
  const roles: FakeRole[] = ROLE_NAMES.map((name, i) => ({
    n: i + 1,
    name,
    color: ROLE_COLORS[i % ROLE_COLORS.length] as FakeRole['color'],
    runtime: i === 2 ? 'error' : i === 3 ? 'stopped' : i === 1 ? 'sleeping' : 'running',
    condition: i === 3 ? 'wounded' : 'normal',
    tokensToday: 12_000 * (i + 1),
    skills: 6 + i,
    memories: 40 + i * 7,
    balanceMinor: 150_000 - i * 30_000,
  }));
  const taskTitles = [
    'Soạn báo giá',
    'Trả lời khách',
    'Tổng hợp báo cáo tuần',
    'Kiểm tra tồn kho',
    'Dịch tài liệu',
    'Nhắc lịch họp',
  ];
  const statuses: FakeTask['status'][] = ['running', 'done', 'queued', 'todo', 'failed', 'done'];
  const sources: FakeTask['source'][] = ['telegram', 'web', 'schedule'];
  const tasks: FakeTask[] = Array.from({ length: opts.taskCount ?? 12 }, (_, i) => ({
    n: i + 1,
    roleN: i % 5 === 4 ? null : (i % roles.length) + 1,
    title: `${taskTitles[i % taskTitles.length]} #${i + 1}`,
    status: statuses[i % statuses.length] as FakeTask['status'],
    source: sources[i % sources.length] as FakeTask['source'],
    tokens: 800 + i * 137,
  }));
  const levels: FakeLog['level'][] = ['info', 'info', 'warn', 'info', 'error'];
  const logs: FakeLog[] = Array.from({ length: opts.logCount ?? 200 }, (_, i) => ({
    ts: iso(i),
    container: i % 3 === 0 ? 'runner' : 'control-plane',
    level: levels[i % levels.length] as FakeLog['level'],
    message: `dòng log mẫu ${i + 1}`,
  }));
  return {
    workspace: { id: fakeUlid(1), name: 'Xưởng Mẫu', shortCode: 'DEMO', lang: 'vi', timezone: 'Asia/Ho_Chi_Minh' },
    owner: {
      n: 1,
      name: opts.ownerName ?? 'Chủ Mẫu',
      username: opts.username ?? 'admin',
      password: opts.password ?? `pw-${crypto.randomUUID()}`,
    },
    roles,
    tasks,
    logs,
    notifications: [
      { n: 1, kind: 'update_available', severity: 'info', read: false },
      { n: 2, kind: 'quota_low', severity: 'warn', read: false },
      { n: 3, kind: 'role_error', severity: 'danger', read: true },
    ],
    ledgerSeq: 0,
    recovery: false,
  };
}
