import type { AuthLevel, GridKeyName } from '@ga/contracts';
import { authAtLeast, GRID_COLUMNS, GRID_KEYS, GRID_MIN_AUTH } from '@ga/contracts';
import type { CallId, CallInput, CallResult, RequestOut } from '../routes.ts';
import { enumValues, type FakeGridRow, gridInfo, QueryProblem, rowsOf, select, sumOf } from './grid-engine.ts';
import { FakeHttpError } from './http.ts';
import { display, type FakeDb, type FakeRole, type FakeTask, fakeUlid, iso, ref } from './seed.ts';

// Fixture theo route. Mỗi fixture: `example` (request mẫu hợp lệ) + `respond` (kiểu trả về lấy từ schema của route nên sai hình dạng là
// lỗi biên dịch). Backend KIỂM request lẫn response theo schema hợp đồng lúc chạy; `fake.test.ts` chạy mọi fixture qua cùng đường đó.

export interface FakeSession {
  accessLevel: AuthLevel;
  mustChangePassword: boolean;
  failedLogins: number;
  readonly csrf: string | null;
  /** mở phiên mới ⇒ csrfToken mới */
  signIn(): string;
  rotate(): string;
  signOut(): void;
}

export interface FakeContext {
  db: FakeDb;
  session: FakeSession;
}

export interface Fixture<Id extends CallId> {
  example: CallInput<Id>;
  respond(req: RequestOut<Id>, ctx: FakeContext): CallResult<Id> | Promise<CallResult<Id>>;
}

const KPI_KEYS = ['roles_active', 'tokens', 'cache_hit', 'proactive', 'engine_errors', 'failovers'] as const;
const LEVEL: Record<string, string> = { O: 'owner', A: 'admin', V: 'viewer' };
const userView = (db: FakeDb, level: AuthLevel) => ({
  ...ref('US', db.owner.n),
  name: db.owner.name,
  accessLevel: (LEVEL[level] ?? 'owner') as 'owner' | 'admin' | 'viewer',
});

const window = (pct: number | null, name: string) => ({
  window: name,
  utilizationPct: pct,
  resetAt: pct === null ? null : iso(-180),
  source: 'probe',
  unknownReason: pct === null ? 'not_measured' : null,
});

function engineAccounts(db: FakeDb) {
  const base = (n: number, label: string, roleN: number | null, pct: number | null) => ({
    ...ref('EN', n),
    label,
    engineSlug: 'engine-a',
    consumer: {
      kind: roleN === null ? ('system' as const) : ('role' as const),
      role: roleN === null ? null : ref('RL', roleN),
    },
    isCoreAgent: roleN === null,
    loginStatus: 'logged_in' as const,
    reloginRequired: false,
    quota: { long: window(pct, 'week'), short: window(pct === null ? null : Math.max(0, pct - 20), 'hours5') },
  });
  const first = db.roles[0];
  return [
    base(1, 'Tài khoản hệ thống', null, 31),
    ...(first ? [base(2, `Tài khoản của ${first.name}`, first.n, 64)] : []),
  ];
}

const roleItem = (r: FakeRole) => ({
  ...ref('RL', r.n),
  name: r.name,
  color: r.color as 'teal' | 'saffron' | 'coral' | 'azure',
  lifecycle: 'carded' as const,
  runtime: r.runtime,
  runtimeDetail: null,
  engineSlug: 'engine-a',
  modelKey: null,
  positionTitle: null,
  balanceMinor: r.balanceMinor,
  tokensToday: r.tokensToday,
  skills: r.skills,
  memories: r.memories,
  budget: { total: 4000, state: 'green' as const },
  lastActiveAt: iso(r.n * 5),
  condition: r.condition,
  rank: r.n,
  rankTotal: 4,
  avatar: { state: 'normal' as const, source: null, since: iso(60), expiresAt: null, characterDisabled: false },
});

const taskItem = (t: FakeTask, db: FakeDb) => ({
  ...ref('TK', t.n),
  role: t.roleN === null ? null : ref('RL', t.roleN),
  title: t.title,
  source: t.source,
  status: t.status,
  statusDetail: null,
  priority: 'normal' as const,
  dueAt: null,
  startedAt: t.status === 'todo' ? null : iso(30 + t.n),
  completedAt: t.status === 'done' ? iso(5 + t.n) : null,
  tokensTotal: t.tokens,
  engineSlug: db.roles.length > 0 ? 'engine-a' : null,
  verification: 'unverified' as const,
  failureDisclosure: null,
  pausedByWound: null,
  penaltyAllowed: false,
  penaltyBlockedReason: null,
});

const offsetOf = (cursor: string | undefined): number => (cursor?.startsWith('c') ? Number(cursor.slice(1)) || 0 : 0);
const page = <T>(all: readonly T[], cursor: string | undefined, limit: number | undefined) => {
  const start = offsetOf(cursor);
  const n = limit ?? 50;
  return { items: all.slice(start, start + n), nextCursor: start + n < all.length ? `c${start + n}` : null };
};

const gridRow = (r: FakeGridRow) => ({
  id: r.id,
  displayId: r.displayId,
  state: r.state,
  supersededBy: r.supersededBy,
  cells: r.cells,
  redacted: false,
});

function selectOrThrow(key: GridKeyName, sel: Parameters<typeof select>[1]) {
  try {
    return select(key, sel);
  } catch (e) {
    if (e instanceof QueryProblem) throw new FakeHttpError('query.invalid', { reason: e.reason, position: e.position });
    throw e;
  }
}

const csvCell = (v: string | number | boolean | null): string => {
  if (v === null) return '';
  if (typeof v !== 'string') return String(v);
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

const STRONG_MIN = 12;
/** Mật khẩu của ngữ cảnh kiểm fixture (dựng lúc chạy, không phải bí mật). */
export const VERIFY_PASSWORD = `pw-${'0'.repeat(20)}`;

export const FIXTURES = {
  // ---- phiên (EXT-01…04)
  'EXT-01': {
    example: { body: { username: 'admin', password: VERIFY_PASSWORD } },
    respond({ body }, { db, session }) {
      if (session.failedLogins >= 5) throw new FakeHttpError('auth.locked', { retryAfterS: 30 });
      if (body.username !== db.owner.username || body.password !== db.owner.password) {
        session.failedLogins++;
        throw new FakeHttpError('auth.invalid_credentials', { attemptsLeft: Math.max(0, 5 - session.failedLogins) });
      }
      session.failedLogins = 0;
      const csrfToken = session.signIn();
      return { user: userView(db, 'O'), csrfToken, mustChangePassword: session.mustChangePassword };
    },
  },
  'EXT-02': {
    example: {},
    respond(_req, { session }) {
      session.signOut();
      return undefined;
    },
  },
  'EXT-03': {
    example: {},
    respond(_req, { db, session }) {
      if (session.mustChangePassword) throw new FakeHttpError('auth.must_change_password');
      return {
        user: userView(db, session.accessLevel),
        workspace: { ...db.workspace },
        csrfToken: session.csrf ?? session.signIn(),
        onboardingDone: true,
      };
    },
  },
  'EXT-04': {
    example: { body: { currentPassword: VERIFY_PASSWORD, newPassword: 'yyyyyyyyyyyyyyyy' } },
    respond({ body }, { db, session }) {
      if (body.currentPassword !== db.owner.password) throw new FakeHttpError('auth.invalid_credentials');
      if (body.newPassword === body.currentPassword)
        throw new FakeHttpError('auth.weak_password', { reason: 'same_as_current' });
      if (body.newPassword.length < STRONG_MIN) throw new FakeHttpError('auth.weak_password', { reason: 'too_short' });
      db.owner.password = body.newPassword;
      session.mustChangePassword = false;
      session.rotate();
      return undefined;
    },
  },

  // ---- tổng quan / vận hành
  'OPS-01': {
    example: {},
    respond: () => ({ status: 'ok', version: '0.0.0-fake', components: { db: 'ok', supervisor: 'ok', updater: 'ok' } }),
  },
  'SYS-08': {
    example: {},
    respond: (_req, { db }) => ({
      mode: db.recovery ? ('recovery' as const) : ('ok' as const),
      blocksAdmin: db.recovery,
      reason: db.recovery ? 'core_agent_error' : null,
      subReason: null,
      autoRecheck: true,
      fixTarget: db.recovery ? ('a5.system' as const) : null,
      isIncident: db.recovery,
      nextRecheckAt: null,
      quotaResetAt: null,
      channel: 'telegram' as const,
      engineSlug: 'engine-a',
      account: ref('EN', 1),
      lockedAt: null,
    }),
  },
  'SYS-80': {
    example: { query: { range: 'today' } },
    respond: (_req, { db }) => ({
      kpis: KPI_KEYS.map((key, i) => ({
        key,
        value: [db.roles.filter((r) => r.runtime === 'running').length, 168_000, 82, 3, 1, 0][i] as number,
        sub: null,
      })),
      taskCounts: { today: db.tasks.length, d7: db.tasks.length * 4, d30: db.tasks.length * 15 },
      engines: engineAccounts(db).map(
        ({ id, displayId, label, engineSlug, consumer, isCoreAgent, loginStatus, reloginRequired, quota }) => ({
          id,
          displayId,
          label,
          engineSlug,
          consumer,
          isCoreAgent,
          loginStatus,
          reloginRequired,
          quota,
        }),
      ),
    }),
  },
  'SYS-81': {
    example: {},
    respond: (_req, { db }) =>
      db.notifications
        .filter((n) => !n.read)
        .map((n) => ({
          severity: n.severity,
          kind: n.kind,
          target: null,
          params: {},
          actions: [{ key: 'open', routeId: 'SYS-83' }],
        })),
  },
  'SYS-82': {
    example: { query: { limit: 5 } },
    respond: ({ query }, { db }) => ({
      ...page(
        db.roles.map((r) => ({
          ...ref('EV', r.n),
          role: ref('RL', r.n),
          kind: 'role.state',
          subject: null,
          result: 'ok',
          severity: 'info' as const,
          at: iso(r.n * 7),
        })),
        query.cursor,
        query.limit,
      ),
    }),
  },
  'SYS-83': {
    example: { query: { unread: true } },
    respond: ({ query }, { db }) => ({
      ...page(
        db.notifications
          .filter((n) => query.unread !== true || !n.read)
          .map((n) => ({
            ...ref('NT', n.n),
            kind: n.kind,
            severity: n.severity,
            params: {},
            target: null,
            at: iso(n.n * 10),
            readAt: n.read ? iso(1) : null,
          })),
        query.cursor,
        query.limit,
      ),
    }),
  },
  'SYS-84': {
    example: { body: { all: true } },
    respond: ({ body }, { db }) => {
      let updated = 0;
      for (const n of db.notifications) {
        const hit = 'all' in body ? true : body.refs.includes(display('NT', n.n));
        if (hit && !n.read) {
          n.read = true;
          updated++;
        }
      }
      return { updated };
    },
  },
  'SYS-30': {
    example: { query: { limit: 10 } },
    respond: ({ query }, { db }) => ({
      ...page(
        db.roles.filter((r) => !query.name || r.name.toLowerCase().includes(query.name.toLowerCase())).map(roleItem),
        query.cursor,
        query.limit,
      ),
    }),
  },
  'WRK-15': {
    example: { query: { limit: 10 } },
    respond: ({ query }, { db }) => ({
      ...page(
        db.tasks.filter((t) => !query.status || query.status.includes(t.status)).map((t) => taskItem(t, db)),
        query.cursor,
        query.limit,
      ),
    }),
  },
  'OPS-25': {
    // `container` là mã container (CT-0001 = control-plane, CT-0002 = runner), không phải tên
    example: { query: { container: 'CT-0002', limit: 5 } },
    respond: ({ query }, { db }) => {
      const name = query.container === display('CT', 2) ? 'runner' : 'control-plane';
      return {
        ...page(
          db.logs.filter((l) => l.container === name && (!query.q || l.message.includes(query.q))),
          query.cursor,
          query.limit,
        ),
      };
    },
  },
  'GW-01': {
    example: {},
    respond: () => [
      {
        slug: 'engine-a',
        nameKey: 'engines.engine_a',
        adapterStatus: 'ready' as const,
        coreCapable: true,
        requiresConsent: false,
        noticeVersion: null,
        install: { state: 'installed' as const, version: '1.0.0', installedAt: iso(1440) },
        pinnedVersion: null,
        latestVersion: '1.0.0',
        testedVersions: ['1.0.0'],
        compat: 'tested' as const,
      },
      {
        slug: 'engine-b',
        nameKey: 'engines.engine_b',
        adapterStatus: 'coming_soon' as const,
        coreCapable: false,
        requiresConsent: false,
        noticeVersion: null,
        install: { state: 'not_installed' as const },
        pinnedVersion: null,
        latestVersion: null,
        testedVersions: [],
        compat: 'unknown' as const,
      },
    ],
  },
  'GW-05': {
    example: {},
    respond: (_req, { db }) =>
      engineAccounts(db).map((a) => ({
        ...a,
        authMethod: 'subscription' as const,
        lastLoginCheck: null,
        accountHint: null,
        overhead: { tokens: 1800, label: 'measured' as const, measuredAt: iso(120) },
        cli: { state: 'installed' as const, version: '1.0.0' },
        container: { ...ref('CT', 1), observed: 'running' as const },
      })),
  },

  // ---- ví (route idempotent: backend kiểm Idempotency-Key, bản lặp trả lại y nguyên)
  'WRK-24': {
    example: { params: { roleRef: 'RL-0001' }, body: { amountMinor: 5000, reason: 'thưởng thử nghiệm' } },
    respond: ({ params, body }, { db }) => {
      const role = db.roles.find(
        (r) => r.name && (display('RL', r.n) === params.roleRef || ref('RL', r.n).id === params.roleRef),
      );
      if (!role) throw new FakeHttpError('not_found');
      role.balanceMinor += body.amountMinor;
      db.ledgerSeq++;
      return {
        entry: ref('LG', db.ledgerSeq),
        balanceAfterMinor: role.balanceMinor,
        revived: false,
        rankAfter: role.n,
      };
    },
  },

  // ---- Data Console (OPS-32/33/34/37)
  'OPS-32': {
    example: {},
    respond: (_req, { session }) =>
      GRID_KEYS.filter((k) => authAtLeast(session.accessLevel, GRID_MIN_AUTH[k])).map((k) => gridInfo(k)),
  },
  'OPS-33': {
    example: { params: { gridKey: 'roles' }, query: { limit: 2, offset: 1, sort: ['-created'] } },
    respond: ({ params, query }) => {
      const key = params.gridKey;
      const grouped = query.group ? [query.group, ...(query.sort ?? [])] : query.sort;
      const { rows, clauses, info } = selectOrThrow(key, { q: query.q, view: query.view, sort: grouped });
      const offset = query.offset ?? offsetOf(query.cursor);
      const limit = query.limit ?? 200;
      const counts = new Map<string | number | boolean | null, number>();
      if (query.group)
        for (const r of rows)
          counts.set(r.cells[query.group] ?? null, (counts.get(r.cells[query.group] ?? null) ?? 0) + 1);
      return {
        items: rows.slice(offset, offset + limit).map(gridRow),
        nextCursor: offset + limit < rows.length ? `c${offset + limit}` : null,
        start: offset,
        total: rows.length,
        footer: Object.fromEntries(info.footerKeys.map((k) => [k, sumOf(rows, k)])),
        clauses: clauses.map(({ test: _t, ...c }) => c),
        aliasHints: [],
        groups: query.group ? [...counts].map(([value, count]) => ({ value, count })) : null,
      };
    },
  },
  'OPS-34': {
    example: { params: { gridKey: 'roles' }, query: { q: 'status:active' } },
    respond: ({ params, query }) => {
      const { rows } = selectOrThrow(params.gridKey, { q: query.q, view: query.view, sort: query.sort });
      const cols = (query.cols ?? GRID_COLUMNS[params.gridKey].map((c) => c.name)).filter((c) =>
        GRID_COLUMNS[params.gridKey].some((d) => d.name === c),
      );
      const lines = [['displayId', ...cols], ...rows.map((r) => [r.displayId, ...cols.map((c) => r.cells[c] ?? null)])];
      const text = `${String.fromCharCode(0xfeff)}${lines.map((l) => l.map(csvCell).join(',')).join('\r\n')}\r\n`;
      return { text, sha256: null };
    },
  },
  'OPS-37': {
    example: { params: { gridKey: 'roles' }, query: { displayId: 'RL-0002' } },
    respond: ({ params, query }) => {
      if (!rowsOf(params.gridKey).some((r) => r.displayId === query.displayId)) return { state: 'gone' as const };
      const { rows } = selectOrThrow(params.gridKey, { q: query.q, view: query.view, sort: query.sort });
      const index = rows.findIndex((r) => r.displayId === query.displayId);
      return index === -1 ? { state: 'filtered' as const } : { state: 'found' as const, index };
    },
  },
} satisfies { [I in CallId]?: Fixture<I> };

export type FixtureId = keyof typeof FIXTURES;
export const FIXTURE_IDS = Object.keys(FIXTURES) as FixtureId[];
export { enumValues, fakeUlid };
