// Chuỗi xử lý CỐ ĐỊNH của mọi route đã mount (handler không bỏ qua được bước nào). Thứ tự (BUILD-PLAN §B.4, BACKEND-TRIAL §3.0):
//   [toàn cục, app.ts] request-id → header bảo mật → Content-Length > trần ⇒ 413
//    1. phiên (L-SEC AuthService; route `public` bỏ qua)                          401 auth.required (+ 403 auth.csrf của L-SEC)
//    2. cổng đổi mật khẩu (`must_change_password` ⇒ chỉ EXT-02/03/04)             403 auth.must_change_password
//    3. CSRF theo registry (`requiresCsrf(route)`) — lớp RIÊNG của edge            403 auth.csrf
//    4. actor (membership trong workspace của phiên) + quyền tối thiểu `route.auth` 403 auth.forbidden
//    5. đọc thân có trần (đếm byte khi đọc luồng) + parse JSON                    413 upload.too_large / 400
//    6. quyền `ownerWhen` trên input THÔ (`requiredAccess`)                       403
//    7. RecoveryGuard O4 (`recoveryDecision`; route `core` hoãn tới bước 10)      423 recovery.blocked
//    8. validate request strict (`requestSchemaOf`)                               400 validation.failed (chỉ đường dẫn)
//    9. quyền `ownerWhen` trên input ĐÃ validate (lấy mức cao hơn của 6 và 9)     403
//   10. Recovery route `core`: provider.isCoreAgentTarget(input đã validate)      423
//   11. idempotency (route `idempotent`)                                          400 / 409 idempotency.conflict / phát lại
//   12. handler (ctx gắn actor của phiên)
//   13. validate response strict (`responseSchemaOf`) — MỌI chế độ                 500 internal (log route + đường dẫn zod)
//   [mọi lỗi] phong bì lỗi (errors.ts)
import { timingSafeEqual } from 'node:crypto';
import type { Clock } from '@ga/contracts';
import {
  API_AUTH,
  API_LIMITS,
  authAtLeast,
  fullPath,
  type Route,
  requestSchemaOf,
  requiredAccess,
  requiresCsrf,
  responseSchemaOf,
} from '@ga/contracts';
import type { AppConnection } from '@ga/db';
import type { DataStore } from '@ga/db/repos';
import type { Context } from 'hono';
import type { z } from 'zod';
import { ALLOWED_DURING_PASSWORD_CHANGE } from '../auth/index.ts';
import { createHandlerContext, createPublicContext } from '../context/context.ts';
import type { EventBus } from '../events/bus.ts';
import { parseJsonBody, readBodyCapped } from './body.ts';
import type { Handler, RawBody, ValidatedInput } from './define-handler.ts';
import { ApiError, type ErrorResult, mapError, safeZodPath } from './errors.ts';
import {
  type IdempotencyKeyRef,
  type IdempotencyStore,
  idempotencyFingerprint,
  idempotencyKeyRef,
  idempotencyKeyReserved,
  type StoredResult,
} from './idempotency.ts';
import type { Logger } from './logger.ts';
import { guardBeforeValidation, guardCoreTarget, type RecoveryProvider, recoveryStateOf } from './recovery.ts';
import { type Actor, resolveMembership, type SessionAuthenticator } from './session.ts';

export interface PipelineDeps {
  reader: AppConnection;
  store: DataStore;
  auth: SessionAuthenticator;
  clock: Clock;
  events: EventBus;
  recovery: RecoveryProvider;
  logger: Logger;
  idempotency: IdempotencyStore;
}

export type AppEnv = { Variables: { requestId: string; routeId: string } };

/** HANDLER-OBLIGATIONS §15: phiên đang bắt đổi mật khẩu chỉ gọi được EXT-02 / 03 / 04 (+ đường cũ của L-SEC). */
export const PASSWORD_CHANGE_ROUTE_IDS: ReadonlySet<string> = new Set(['EXT-02', 'EXT-03', 'EXT-04']);

export function allowedDuringPasswordChange(route: Route): boolean {
  return PASSWORD_CHANGE_ROUTE_IDS.has(route.id) || ALLOWED_DURING_PASSWORD_CHANGE.has(fullPath(route));
}

function csrfMatches(presented: string | null, expected: string): boolean {
  if (presented === null || presented.length === 0 || presented.length > 256) return false;
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.byteLength === b.byteLength && timingSafeEqual(a, b);
}

const requestSchemas = new WeakMap<Route, z.ZodType>();
function requestSchema(route: Route): z.ZodType {
  let s = requestSchemas.get(route);
  if (s === undefined) {
    s = requestSchemaOf(route);
    requestSchemas.set(route, s);
  }
  return s;
}

/** Khoá đã khai của một schema object (để chọn header / chỉ trả tên trường đã khai trong detail). */
export function declaredKeys(schema: z.ZodType | undefined): ReadonlySet<string> {
  const shape = (schema as unknown as { shape?: Record<string, unknown> } | undefined)?.shape;
  return new Set(shape && typeof shape === 'object' ? Object.keys(shape) : []);
}

const PARTS = new Set(['params', 'query', 'headers', 'body']);

/** `detail.field` cho lỗi validate: phần (`body`…) + khoá ĐÃ KHAI ở cấp 1 — không bao giờ lặp khoá lạ của client. */
function fieldOf(route: Route, path: readonly PropertyKey[]): string | undefined {
  const part = path[0];
  if (typeof part !== 'string' || !PARTS.has(part)) return undefined;
  const key = path[1];
  const spec = route.request[part as 'params' | 'query' | 'headers' | 'body'];
  if (typeof key === 'string' && declaredKeys(spec).has(key) && /^[A-Za-z0-9_.-]{1,40}$/.test(key))
    return `${part}.${key}`;
  return part;
}

function queryObject(url: URL): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  let any = false;
  for (const [k, v] of url.searchParams) {
    any = true;
    if (Object.hasOwn(out, k)) throw new ApiError('validation.failed', { reason: 'query_duplicate', field: 'query' });
    out[k] = v;
  }
  return any ? out : undefined;
}

function headersObject(route: Route, req: Request): Record<string, string> | undefined {
  if (!route.request.headers) return undefined;
  const out: Record<string, string> = {};
  for (const k of declaredKeys(route.request.headers)) {
    const v = req.headers.get(k);
    if (v !== null) out[k] = v;
  }
  return out;
}

const SAFE_FILENAME_RE = /[^A-Za-z0-9._-]/g;
const RAW_CONTENT_TYPES = {
  sse: 'text/event-stream; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  binary: 'application/octet-stream',
} as const;

function isRawBody(v: unknown): v is RawBody {
  if (v === null || typeof v !== 'object') return false;
  const raw = (v as { raw?: unknown }).raw;
  return typeof raw === 'string' || raw instanceof Uint8Array || raw instanceof ReadableStream;
}

/** Bước 13: kiểm output TRƯỚC khi rời server. Hỏng ⇒ ApiError internal (đã log route + đường dẫn zod, không log giá trị). */
function buildResponse(
  route: Route,
  out: unknown,
  ctx: { requestId: string; logger: Logger },
): StoredResult | Response {
  const res = route.response;
  const fail = (why: string, extra: Record<string, unknown> = {}): never => {
    ctx.logger.log('error', 'http.response_invalid', { requestId: ctx.requestId, routeId: route.id, why, ...extra });
    throw new ApiError('internal');
  };
  switch (res.kind) {
    case 'json': {
      const schema = responseSchemaOf(route);
      if (schema === null) return fail('no_schema');
      const parsed = schema.safeParse(out);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return fail('schema', { path: issue ? safeZodPath(issue.path) : null, issue: issue?.code ?? null });
      }
      return { status: res.status, body: parsed.data };
    }
    case 'empty':
      if (out !== undefined) return fail('body_on_204');
      return { status: 204, body: undefined };
    case 'sse':
    case 'csv':
    case 'binary': {
      if (!isRawBody(out)) return fail('raw_body_expected');
      const headers: Record<string, string> = { 'content-type': RAW_CONTENT_TYPES[res.kind] };
      if (out.filename !== undefined && res.kind !== 'sse') {
        const name = out.filename.replace(SAFE_FILENAME_RE, '_').slice(0, 120) || 'download';
        headers['content-disposition'] = `attachment; filename="${name}"`;
      }
      return new Response(out.raw, { status: 200, headers });
    }
    default:
      return fail('unsupported_kind');
  }
}

function jsonResponse(r: StoredResult, extraHeaders: Record<string, string> = {}): Response {
  if (r.status === 204) return new Response(null, { status: 204, headers: extraHeaders });
  return new Response(JSON.stringify(r.body), {
    status: r.status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

export function errorResponse(r: ErrorResult): Response {
  return new Response(JSON.stringify(r.body), {
    status: r.status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...r.headers },
  });
}

export async function runRoute(
  c: Context<AppEnv>,
  route: Route,
  handler: Handler,
  deps: PipelineDeps,
): Promise<Response> {
  const requestId = c.get('requestId');
  c.set('routeId', route.id);
  const req = c.req.raw;
  let idem: { key: IdempotencyKeyRef; fingerprint: string } | null = null;
  try {
    // 1–4. phiên → cổng đổi mật khẩu → CSRF → actor + quyền tối thiểu
    let actor: Actor | null = null;
    if (route.auth !== 'public') {
      const r = deps.auth.authenticate({
        method: req.method,
        cookieHeader: req.headers.get('cookie'),
        csrfHeader: req.headers.get(API_AUTH.csrfHeader),
        origin: req.headers.get('origin'),
        secFetchSite: req.headers.get('sec-fetch-site'),
      });
      if (!r.ok) {
        if (r.code === 'auth.csrf') throw new ApiError('auth.csrf');
        throw new ApiError(
          'auth.required',
          undefined,
          r.clearCookie ? { headers: { 'set-cookie': r.clearCookie } } : {},
        );
      }
      const session = r.ctx;
      if (session.mustChangePassword && !allowedDuringPasswordChange(route)) {
        throw new ApiError('auth.must_change_password');
      }
      if (requiresCsrf(route) && !csrfMatches(req.headers.get(API_AUTH.csrfHeader), session.csrfToken)) {
        throw new ApiError('auth.csrf');
      }
      const m = resolveMembership(deps.reader, session.userId);
      if (!m.ok) throw new ApiError('auth.forbidden', { reason: m.reason });
      actor = Object.freeze({
        id: m.actorId,
        userId: session.userId,
        workspaceId: m.workspaceId,
        accessLevel: m.accessLevel,
        authLevel: m.authLevel,
        sessionId: session.sessionId,
      });
      if (!authAtLeast(actor.authLevel, route.auth)) throw new ApiError('auth.forbidden');
    }

    // 5. thân có trần → JSON
    const bytes = await readBodyCapped(req, API_LIMITS.bodyBytes);
    const rawBody = parseJsonBody(bytes, req.headers.get('content-type'));
    const url = new URL(req.url);
    const rawQuery = queryObject(url);
    const rawParams = route.request.params ? (c.req.param() as Record<string, string>) : undefined;

    // 6. ownerWhen trên input thô
    if (actor !== null && route.ownerWhen) {
      const need = requiredAccess(route, { params: rawParams, body: rawBody, query: rawQuery });
      if (!authAtLeast(actor.authLevel, need)) throw new ApiError('auth.forbidden');
    }

    // 7. RecoveryGuard (pha 1)
    const state = await recoveryStateOf(deps.recovery, actor?.workspaceId ?? null);
    const guard = guardBeforeValidation(route, state);
    if (guard === 'blocked') throw new ApiError('recovery.blocked');

    // 8. validate strict
    const candidate: Record<string, unknown> = {};
    if (rawParams !== undefined) candidate.params = rawParams;
    if (rawQuery !== undefined) candidate.query = rawQuery;
    else if (route.request.query) candidate.query = {};
    const headers = headersObject(route, req);
    if (headers !== undefined) candidate.headers = headers;
    if (rawBody !== undefined) candidate.body = rawBody;
    else if (route.request.body) candidate.body = {};
    const parsed = requestSchema(route).safeParse(candidate);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiError('validation.failed', {
        reason: issue?.code,
        field: issue ? fieldOf(route, issue.path) : undefined,
      });
    }
    const v = parsed.data as Partial<Record<'params' | 'query' | 'headers' | 'body', unknown>>;
    const input: ValidatedInput = Object.freeze({
      params: v.params,
      query: v.query,
      body: v.body,
      headers: v.headers,
    });

    // 9. ownerWhen trên input đã validate (coerce / transform không hạ được mức)
    if (actor !== null && route.ownerWhen) {
      const need = requiredAccess(route, {
        params: input.params as Record<string, unknown> | undefined,
        body: input.body,
        query: input.query,
      });
      if (!authAtLeast(actor.authLevel, need)) throw new ApiError('auth.forbidden');
    }

    // 10. Recovery route core (pha 2)
    if (guard === 'defer_core') {
      const ok =
        actor !== null &&
        (await guardCoreTarget(deps.recovery, {
          workspaceId: actor.workspaceId,
          route,
          params: input.params,
          query: input.query,
          body: input.body,
        }));
      if (!ok) throw new ApiError('recovery.blocked');
    }

    // 11. idempotency
    if (route.idempotent) {
      const key = (input.headers as Record<string, unknown> | undefined)?.[API_AUTH.idempotencyHeader];
      if (actor === null || typeof key !== 'string') {
        throw new ApiError('validation.failed', { reason: 'idempotency_key', field: 'headers' });
      }
      if (idempotencyKeyReserved(key)) {
        throw new ApiError('validation.failed', { reason: 'idempotency_key_reserved', field: 'headers' });
      }
      const ref = idempotencyKeyRef({ workspaceId: actor.workspaceId, actorId: actor.id, routeId: route.id, key });
      const fingerprint = idempotencyFingerprint({
        routeId: route.id,
        actorId: actor.id,
        params: input.params,
        query: input.query,
        body: input.body,
      });
      const b = deps.idempotency.begin(ref, fingerprint);
      if (b.kind === 'replay') return jsonResponse(b.result, { 'idempotency-replayed': 'true' });
      if (b.kind === 'conflict') throw new ApiError('idempotency.conflict', { reason: b.reason });
      if (b.kind === 'full') {
        // không evict khoá còn hiệu lực ⇒ từ chối khoá MỚI (hợp đồng chưa có mã 503 ⇒ 429)
        const reason = b.reason === 'namespace' ? 'idempotency_namespace_full' : 'idempotency_capacity';
        throw new ApiError('auth.rate_limited', { reason, retryAfterS: 60 }, { headers: { 'retry-after': '60' } });
      }
      idem = { key: ref, fingerprint };
    }

    // 12. handler
    const ctx =
      actor === null
        ? createPublicContext(deps, { requestId, route })
        : createHandlerContext(deps, { requestId, route, actor });
    const out = await handler.run(input, ctx);

    // 13. validate response
    const built = buildResponse(route, out, { requestId, logger: deps.logger });
    if (built instanceof Response) return built;
    if (idem !== null) {
      deps.idempotency.complete(idem.key, idem.fingerprint, built);
      idem = null;
    }
    return jsonResponse(built);
  } catch (err) {
    return errorResponse(mapError(err, { requestId, routeId: route.id, logger: deps.logger }));
  } finally {
    if (idem !== null) deps.idempotency.abort(idem.key, idem.fingerprint);
  }
}
