// Harness test của control plane: thế giới testkit (DB thật, 2 tenant) + createApp THẬT + AuthService THẬT (L-SEC) +
// RecoveryProvider giả + bus thật + logger ghi bộ nhớ. Mọi lane M2 dùng: `const t = makeTestApp({ handlers })`.
//   - @ga/testkit chỉ được import ĐỘNG ngoài testing/** (BUILD-PLAN §D.2, lint import-boundaries) ⇒ `await import(...)`.
//   - testkit không import được apps/control-plane (ranh giới + vòng tham chiếu tsconfig) ⇒ phần ghép nằm ở đây.
//   - Mỗi handler bọc bộ đếm lần gọi (`t.calls`) — meta-test khẳng định handler KHÔNG chạy khi bị chặn.
import { type CreatedApp, createApp } from '../../src/app.ts';
import { AuthService, SqliteAuthStore } from '../../src/auth/index.ts';
import { InMemoryEventBus, type InMemoryEventBusOptions } from '../../src/events/bus.ts';
import type { Handler } from '../../src/http/define-handler.ts';
import type { IdempotencyStore } from '../../src/http/idempotency.ts';
import type { Logger, LogLevel } from '../../src/http/logger.ts';
import type { RecoveryProvider } from '../../src/http/recovery.ts';
import type { SessionAuthenticator } from '../../src/http/session.ts';

export const tk = await import('@ga/testkit');
export type TestWorld = import('@ga/testkit').TestWorld;
export type Who = import('@ga/testkit').Who;
export type CallInput = import('@ga/testkit').CallInput;
export type CallResult = import('@ga/testkit').CallResult;

export interface LogEntry {
  level: LogLevel;
  event: string;
  fields: Readonly<Record<string, unknown>>;
  /** Dòng JSON đã che (đúng như ra stderr ở production). */
  line: string;
}

export interface MemoryLogger extends Logger {
  readonly entries: LogEntry[];
}

export function memoryLogger(): MemoryLogger {
  const entries: LogEntry[] = [];
  return {
    entries,
    log(level, event, fields = {}) {
      entries.push({ level, event, fields, line: JSON.stringify({ level, event, ...fields }) });
    },
  };
}

export interface TestAppOptions {
  handlers: readonly Handler[];
  /** Dùng lại world (dựng world tốn ~1 s). Không truyền ⇒ world mới (close() đóng luôn). */
  world?: TestWorld;
  /** `null` = KHÔNG có provider (kiểm mặc định fail-closed). Mặc định: FakeRecoveryProvider (mode ok). */
  recovery?: RecoveryProvider | null;
  /** Thay AuthService (vd stub để kiểm riêng lớp CSRF của edge). */
  auth?: SessionAuthenticator;
  events?: Partial<InMemoryEventBusOptions>;
  idempotency?: IdempotencyStore;
  /** SYS-85: mặc định luồng sống 50 ms (test đọc hết thân response). */
  sse?: { keepAliveMs?: number; maxDurationMs?: number };
}

/**
 * Route KẾT THÚC phiên (đăng xuất / đổi mật khẩu thu hồi mọi phiên): gọi bằng tên một user ⇒ harness dùng một phiên MỚI
 * (vứt đi) của chính user đó, để phiên cố định của world không bị thu hồi giữa các test. Truyền `cookie` tường minh ⇒ giữ nguyên.
 */
export const SESSION_ENDING_ROUTES: ReadonlySet<string> = new Set(['EXT-02', 'EXT-04']);

export interface TestApp {
  readonly world: TestWorld;
  readonly app: CreatedApp;
  readonly recovery: InstanceType<typeof tk.FakeRecoveryProvider>;
  readonly events: InMemoryEventBus;
  readonly logger: MemoryLogger;
  /** Số lần handler của từng route id đã CHẠY. */
  readonly calls: Map<string, number>;
  as(who: Who): ReturnType<ReturnType<typeof tk.makeClient>['as']>;
  raw(req: Request): Promise<CallResult>;
  readonly base: string;
  close(): void;
}

export function makeTestApp(opts: TestAppOptions): TestApp {
  const ownsWorld = opts.world === undefined;
  const world = opts.world ?? tk.makeWorld();
  const fake = new tk.FakeRecoveryProvider();
  const recovery = opts.recovery === null ? undefined : (opts.recovery ?? fake);
  const auth =
    opts.auth ??
    new AuthService({
      store: new SqliteAuthStore(world.writer),
      clock: world.clock,
      csrfKey: world.csrfKey,
      secureCookies: world.secureCookies,
      allowedOrigins: [world.origin],
    });
  const events = new InMemoryEventBus({ clock: world.clock, ...opts.events });
  const logger = memoryLogger();
  const calls = new Map<string, number>();
  const spied: Handler[] = opts.handlers.map((h) => ({
    ...h,
    route: h.route,
    run: async (input, ctx) => {
      calls.set(h.route.id, (calls.get(h.route.id) ?? 0) + 1);
      return h.run(input, ctx);
    },
  }));
  const app = createApp(
    {
      writer: world.writer,
      reader: world.reader,
      store: world.store,
      auth,
      clock: world.clock,
      events,
      ...(recovery ? { recovery } : {}),
      logger,
      ...(opts.idempotency ? { idempotency: opts.idempotency } : {}),
      allowedOrigins: [world.origin],
      sse: { keepAliveMs: 20, maxDurationMs: 50, ...opts.sse },
    },
    spied,
  );
  const client = tk.makeClient(world, (req) => app.fetch(req));
  const as: TestApp['as'] = (who) => {
    const caller = client.as(who);
    if (who === 'anon') return caller;
    return {
      call: (routeId, input = {}) => {
        if (!SESSION_ENDING_ROUTES.has(routeId) || input.cookie !== undefined) return caller.call(routeId, input);
        const fresh = world.newSession(world.user(who).userId);
        const csrf = input.csrf === undefined || input.csrf === true ? fresh.csrf : input.csrf;
        return caller.call(routeId, { ...input, cookie: fresh.cookie, csrf });
      },
    };
  };
  return {
    world,
    app,
    recovery: fake,
    events,
    logger,
    calls,
    as,
    raw: client.raw,
    base: client.base,
    close: () => {
      if (ownsWorld) world.close();
    },
  };
}
