// Dựng ứng dụng Hono của control plane (BUILD-PLAN §B.4 `http/`). Mọi phụ thuộc INJECT qua `deps` (không singleton ẩn).
//   - Chỉ mount route có handler ĐÃ ĐĂNG KÝ; route chưa có handler ⇒ 404 (không 501 — không lộ danh sách route).
//   - Mọi route đi qua cùng một chuỗi cố định (http/pipeline.ts) — handler không bỏ qua được bước nào.
//   - Khởi động fail-closed: handler trùng id, route không phải object của registry, route `edge` / WS, multipart (chưa
//     hỗ trợ), route idempotent thiếu header `idempotency-key` ⇒ throw.
//   - Không CORS: không header Access-Control-*, OPTIONS ⇒ 404.
import { API_AUTH, API_BASE, API_LIMITS, type Clock, pathParamNames, type Route, routeById } from '@ga/contracts';
import type { AppConnection } from '@ga/db';
import { newUlid } from '@ga/db/ids';
import type { DataStore } from '@ga/db/repos';
import { Hono } from 'hono';
import type { EventBus } from './events/bus.ts';
import { declaredTooLarge } from './http/body.ts';
import type { Handler } from './http/define-handler.ts';
import { ApiError, errorResult, mapError } from './http/errors.ts';
import { type IdempotencyStore, InMemoryIdempotencyStore } from './http/idempotency.ts';
import type { Logger } from './http/logger.ts';
import { type AppEnv, declaredKeys, errorResponse, type PipelineDeps, runRoute } from './http/pipeline.ts';
import { FAIL_CLOSED_RECOVERY, type RecoveryProvider } from './http/recovery.ts';
import { type AccountService, DEFAULT_SSE_LIMITS, isAccountService, type SseLimits } from './http/request-extras.ts';
import type { SessionAuthenticator } from './http/session.ts';

export interface AppDeps {
  writer: AppConnection;
  reader: AppConnection;
  store: DataStore;
  /** L-SEC `AuthService` (chỉ cần `authenticate`). */
  auth: SessionAuthenticator;
  clock: Clock;
  events: EventBus;
  /** L-SYS viết bản thật. THIẾU ⇒ fail-closed: coi mọi workspace đang recovery. */
  recovery?: RecoveryProvider;
  logger: Logger;
  /** Mặc định: bản trong bộ nhớ (TTL 24 h) — xem http/idempotency.ts. */
  idempotency?: IdempotencyStore;
  /** EXT-01 / 02 / 04. Mặc định: `auth` nếu nó là AuthService đầy đủ (login / changePassword / logout). */
  accounts?: AccountService;
  /** Origin GUI hợp lệ (login CSRF của EXT-01). Mặc định rỗng ⇒ login có Origin bị từ chối (fail-closed). */
  allowedOrigins?: readonly string[];
  /** IP socket của proxy tin cậy (Caddy). Mặc định rỗng ⇒ không tin `X-Forwarded-For`. */
  trustedProxies?: readonly string[];
  /** SYS-85: nhịp giữ kết nối / tuổi tối đa của luồng (mặc định 15 s / 10 phút). */
  sse?: Partial<SseLimits>;
}

export interface CreatedApp {
  readonly app: Hono<AppEnv>;
  readonly fetch: (req: Request) => Promise<Response>;
  /** Route đã mount (theo thứ tự đăng ký). */
  readonly mounted: readonly Route[];
}

/** `/roles/{roleRef}` → `/roles/:roleRef` (tên tham số đã được contracts giới hạn `[A-Za-z][A-Za-z0-9]{0,31}`). */
export function honoPath(route: Route): string {
  let p = `${API_BASE}${route.path}`;
  for (const name of pathParamNames(route.path)) p = p.replace(`{${name}}`, `:${name}`);
  return p;
}

/** Thứ tự mount: so từng đoạn — tĩnh (0) trước tham số (1); bằng nhau ⇒ giữ thứ tự (sort ổn định). */
export function compareSpecificity(a: string, b: string): number {
  const sa = a.split('/');
  const sb = b.split('/');
  for (let i = 0; i < Math.min(sa.length, sb.length); i++) {
    const pa = (sa[i] as string).startsWith('{') ? 1 : 0;
    const pb = (sb[i] as string).startsWith('{') ? 1 : 0;
    if (pa !== pb) return pa - pb;
  }
  return 0;
}

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
};

/** Kiểm danh sách handler lúc khởi động (throw = không chạy app với cấu hình sai). */
export function checkHandlers(handlers: readonly Handler[]): void {
  const seen = new Set<string>();
  for (const h of handlers) {
    const id = h.route.id;
    if (routeById(id) !== h.route) throw new Error(`createApp: handler ${id} không trỏ tới route của registry`);
    if (seen.has(id)) throw new Error(`createApp: hai handler cho cùng route ${id}`);
    seen.add(id);
    if (h.route.mount !== 'api' || h.route.method === 'WS') {
      throw new Error(`createApp: route ${id} (${h.route.method} ${h.route.mount}) không mount dưới ${API_BASE}`);
    }
    if (h.route.request.bodyKind === 'multipart') {
      throw new Error(`createApp: route ${id} multipart — khung http chưa hỗ trợ (cần trần riêng + quét MIME)`);
    }
    if (h.route.idempotent && !declaredKeys(h.route.request.headers).has(API_AUTH.idempotencyHeader)) {
      throw new Error(`createApp: route ${id} idempotent nhưng không khai header ${API_AUTH.idempotencyHeader}`);
    }
  }
}

export function createApp(deps: AppDeps, handlers: readonly Handler[]): CreatedApp {
  checkHandlers(handlers);
  const pipeline: PipelineDeps = {
    reader: deps.reader,
    store: deps.store,
    auth: deps.auth,
    clock: deps.clock,
    events: deps.events,
    recovery: deps.recovery ?? FAIL_CLOSED_RECOVERY,
    logger: deps.logger,
    idempotency: deps.idempotency ?? new InMemoryIdempotencyStore({ clock: deps.clock }),
    accounts: deps.accounts ?? (isAccountService(deps.auth) ? deps.auth : null),
    allowedOrigins: Object.freeze([...(deps.allowedOrigins ?? [])]),
    trustedProxies: Object.freeze([...(deps.trustedProxies ?? [])]),
    sse: Object.freeze({ ...DEFAULT_SSE_LIMITS, ...deps.sse }),
  };
  const app = new Hono<AppEnv>();

  // toàn cục: request-id → header bảo mật (mọi response, kể cả lỗi / 404) → Content-Length > trần ⇒ 413 → log truy cập
  app.use('*', async (c, next) => {
    const started = Date.now();
    const requestId = newUlid(deps.clock);
    c.set('requestId', requestId);
    if (declaredTooLarge(c.req.header('content-length'), API_LIMITS.bodyBytes)) {
      c.res = errorResponse(
        mapError(new ApiError('upload.too_large', { reason: 'body_bytes' }), {
          requestId,
          routeId: null,
          logger: deps.logger,
        }),
      );
    } else {
      await next();
    }
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) c.res.headers.set(k, v);
    for (const k of [...c.res.headers.keys()]) if (k.startsWith('access-control-')) c.res.headers.delete(k);
    c.res.headers.set('x-request-id', requestId);
    deps.logger.log('info', 'http.request', {
      requestId,
      method: c.req.method,
      routeId: c.get('routeId') ?? null,
      status: c.res.status,
      ms: Date.now() - started,
    });
  });

  // Hono chọn handler ĐĂNG KÝ TRƯỚC trong các route khớp ⇒ mount theo độ cụ thể: đoạn tĩnh trước đoạn tham số
  // (`/audit/export` phải thắng `/audit/{auditRef}`) — test định tuyến phủ cả 201 route.
  for (const h of [...handlers].sort((a, b) => compareSpecificity(a.route.path, b.route.path))) {
    const route = h.route;
    app.on(route.method, honoPath(route), (c) => runRoute(c, route, h, pipeline));
  }
  const mounted: Route[] = handlers.map((h) => h.route);

  app.notFound((c) => errorResponse(errorResult('not_found', c.get('requestId'))));
  app.onError((err, c) =>
    errorResponse(
      mapError(err, { requestId: c.get('requestId'), routeId: c.get('routeId') ?? null, logger: deps.logger }),
    ),
  );

  return Object.freeze({
    app,
    fetch: async (req: Request) => app.fetch(req),
    mounted: Object.freeze([...mounted]),
  });
}

export type { HandlerContext } from './context/context.ts';
export type { EventBus, EventSubscription, StreamEventInput } from './events/bus.ts';
export { InMemoryEventBus } from './events/bus.ts';
export type { Handler, HandlerInput, HandlerOutput, RawBody, RouteId } from './http/define-handler.ts';
export { defineHandler } from './http/define-handler.ts';
export { ApiError } from './http/errors.ts';
export type { Logger } from './http/logger.ts';
export type { RecoveryProvider, RecoveryState } from './http/recovery.ts';
export type { Actor } from './http/session.ts';
