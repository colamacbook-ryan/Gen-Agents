import {
  API_AUTH,
  CSRF_HEADER,
  fullPath,
  type Route,
  requestSchemaOf,
  requiresCsrf,
  responseSchemaOf,
  routeById,
} from '@ga/contracts';
import type { z } from 'zod';
import type { CsrfStore } from './csrf.ts';
import { ApiError, apiErrorFromResponse } from './error.ts';
import { type ClientEvents, createClientEvents } from './events.ts';
import type { AnyInput, CallArgs, CallId, CallOptions, CallResult } from './routes.ts';

// Client API gõ kiểu theo registry hợp đồng. Một nguồn duy nhất cho đường dẫn, method, CSRF, idempotency, schema; không URL nào viết tay.
//   - đường dẫn = fullPath(route) + tham số (encodeURIComponent); query tuần tự hoá thành chuỗi (mảng nối dấu phẩy, boolean true/false)
//   - route ghi (requiresCsrf) gửi header CSRF; route `idempotent` luôn có Idempotency-Key, DÙNG LẠI cho mọi lần thử lại
//   - lỗi ⇒ ApiError (mã + khoá i18n); 401 ⇒ sự kiện `unauthorized` (vỏ chuyển về G1); 423 `recovery.blocked` ⇒ sự kiện cho O4
//   - `validate`: kiểm request (dạng trên dây) và response theo schema hợp đồng. Mặc định BẬT ở dev/test, TẮT ở bản phát hành
//     (đặt VITE_GA_VALIDATE=1 khi build để bật). Schema hợp đồng cần zod jitless đã bật trước (bootstrap/zod.ts).

export interface ApiClientOptions {
  csrf: CsrfStore;
  events?: ClientEvents;
  /** mặc định `fetch` toàn cục; fake backend / test truyền hàm thay */
  fetchImpl?: typeof fetch;
  /** tiền tố URL (mặc định: cùng origin) */
  baseUrl?: string;
  validate?: boolean;
  /** sinh khoá idempotency (mặc định UUID v4 có tiền tố) */
  newIdempotencyKey?: () => string;
  /** số lần thử lại tối đa cho GET và route idempotent khi lỗi mạng / 502 / 503 / 504 (mặc định 2) */
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface ApiClient {
  call<Id extends CallId>(id: Id, ...args: CallArgs<Id>): Promise<CallResult<Id>>;
  readonly events: ClientEvents;
  readonly csrf: CsrfStore;
  readonly validate: boolean;
  /** dựng URL (không gọi) — dùng cho SSE và test */
  urlOf(id: string, input?: AnyInput): string;
}

export const defaultValidate = (): boolean => import.meta.env.DEV || import.meta.env.VITE_GA_VALIDATE === '1';

const RETRY_STATUS: ReadonlySet<number> = new Set([502, 503, 504]);
const defaultKey = (): string => `idem-${crypto.randomUUID()}`;
const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Query kiểu đầu ra schema → chuỗi trên dây. Giá trị lồng nhau là lỗi lập trình. */
export function serializeQuery(query: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined) continue;
    if (Array.isArray(v)) out[k] = v.map(String).join(',');
    else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = String(v);
    else throw new TypeError(`query.${k}: kiểu ${v === null ? 'null' : typeof v} không tuần tự hoá được`);
  }
  return out;
}

/** `/api/v1/roles/{roleRef}` + `{roleRef: 'RL-0001'}` → `/api/v1/roles/RL-0001` (mỗi giá trị qua encodeURIComponent). */
export function buildPath(route: Pick<Route, 'mount' | 'path' | 'id'>, params: Record<string, unknown> = {}): string {
  return fullPath(route).replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (_m, name: string) => {
    const v = params[name];
    if (typeof v !== 'string' && typeof v !== 'number')
      throw new TypeError(`${route.id}: thiếu tham số đường dẫn ${name}`);
    return encodeURIComponent(String(v));
  });
}

const requestSchemas = new Map<string, z.ZodType>();
function requestSchema(route: Route): z.ZodType {
  let s = requestSchemas.get(route.id);
  if (!s) {
    s = requestSchemaOf(route);
    requestSchemas.set(route.id, s);
  }
  return s;
}

const isAbort = (e: unknown, signal?: AbortSignal): boolean =>
  signal?.aborted === true || (e instanceof DOMException && e.name === 'AbortError');

const hex = (buf: ArrayBuffer): string => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export function createApiClient(opts: ApiClientOptions): ApiClient {
  const doFetch = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  const base = opts.baseUrl ?? '';
  const events = opts.events ?? createClientEvents();
  const validate = opts.validate ?? defaultValidate();
  const newKey = opts.newIdempotencyKey ?? defaultKey;
  const maxRetries = opts.maxRetries ?? 2;
  const sleep = opts.sleep ?? defaultSleep;

  const lookup = (id: string): Route => {
    const route = routeById(id);
    if (!route) throw new Error(`route không có trong registry: ${id}`);
    return route;
  };

  const urlOf = (id: string, input: AnyInput = {}): string => {
    const route = lookup(id);
    const qs = new URLSearchParams(serializeQuery(input.query)).toString();
    return `${base}${buildPath(route, input.params)}${qs ? `?${qs}` : ''}`;
  };

  function checkRequest(
    route: Route,
    input: AnyInput,
    wireQuery: Record<string, string>,
    idemKey: string | undefined,
  ): void {
    // thân multipart (SYS-21): các phần form do dịch vụ kiểm
    if (!validate || input.body instanceof FormData) return;
    const candidate: Record<string, unknown> = {};
    if (route.request.params) candidate.params = input.params ?? {};
    if (route.request.query) candidate.query = wireQuery;
    if (route.request.body) candidate.body = input.body;
    if (route.request.headers && idemKey) candidate.headers = { [API_AUTH.idempotencyHeader]: idemKey };
    const r = requestSchema(route).safeParse(candidate);
    if (!r.success) {
      throw new ApiError(
        { code: 'validation.failed', httpStatus: 0, i18nKey: 'errors.validation.failed', routeId: route.id },
        { cause: r.error },
      );
    }
  }

  async function readBody(route: Route, res: Response): Promise<unknown> {
    const kind = route.response.kind;
    const bad = (cause?: unknown) =>
      new ApiError(
        { code: 'bad_response', httpStatus: res.status, i18nKey: 'errors.bad_response', routeId: route.id },
        { cause },
      );
    if (kind === 'empty') return undefined;
    if (kind === 'binary') return res.blob();
    if (kind === 'csv') {
      const bytes = await res.arrayBuffer();
      const header = res.headers.get(API_AUTH.contentSha256Header);
      const sha256 = header && /^[0-9a-f]{64}$/i.test(header) ? header.toLowerCase() : null;
      if (sha256 && hex(await crypto.subtle.digest('SHA-256', bytes)) !== sha256) throw bad();
      // ignoreBOM: giữ BOM của tệp CSV (Excel cần để đọc tiếng Việt)
      return { text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes), sha256 };
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch (cause) {
      throw bad(cause);
    }
    if (!validate) return json;
    const schema = responseSchemaOf(route);
    if (!schema) return json;
    const r = schema.safeParse(json);
    if (!r.success) throw bad(r.error);
    return r.data;
  }

  async function execute(route: Route, input: AnyInput, o: CallOptions): Promise<unknown> {
    const wireQuery = serializeQuery(input.query);
    // MỘT khoá cho cả lần gọi và mọi lần thử lại (máy chủ nhận ra bản lặp)
    const idemKey = route.idempotent ? (o.idempotencyKey ?? newKey()) : undefined;
    checkRequest(route, input, wireQuery, idemKey);
    const qs = new URLSearchParams(wireQuery).toString();
    const url = `${base}${buildPath(route, input.params)}${qs ? `?${qs}` : ''}`;

    const headers: Record<string, string> = {
      accept: route.response.kind === 'csv' ? 'text/csv' : 'application/json',
    };
    let body: BodyInit | undefined;
    if (input.body instanceof FormData) body = input.body;
    else if (input.body !== undefined) {
      body = JSON.stringify(input.body);
      headers['content-type'] = 'application/json';
    }
    if (requiresCsrf(route)) {
      const token = opts.csrf.get();
      if (token) headers[CSRF_HEADER] = token;
    }
    if (idemKey) headers[API_AUTH.idempotencyHeader] = idemKey;

    const retriable = route.method === 'GET' || route.idempotent;
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await doFetch(url, {
          method: route.method,
          headers,
          body,
          credentials: 'same-origin',
          cache: 'no-store',
          signal: o.signal,
        });
      } catch (cause) {
        if (isAbort(cause, o.signal)) throw cause;
        if (retriable && attempt < maxRetries) {
          await sleep(250 * 2 ** attempt);
          continue;
        }
        throw new ApiError({ code: 'network', httpStatus: 0, i18nKey: 'errors.network', routeId: route.id }, { cause });
      }
      if (res.ok) return readBody(route, res);
      if (retriable && RETRY_STATUS.has(res.status) && attempt < maxRetries) {
        await sleep(250 * 2 ** attempt);
        continue;
      }
      const err = await apiErrorFromResponse(res, route.id);
      if (res.status === 401 && route.auth !== 'public') {
        opts.csrf.set(null);
        events.emit({ type: 'unauthorized', routeId: route.id });
      } else if (err.code === 'recovery.blocked') {
        events.emit({ type: 'recovery_blocked', routeId: route.id, requestId: err.requestId });
      }
      throw err;
    }
  }

  return {
    events,
    csrf: opts.csrf,
    validate,
    urlOf,
    // async: id lạ / thiếu tham số là lời gọi bị từ chối (rejected), không phải ngoại lệ đồng bộ
    async call(id, ...args) {
      const [input, o] = args as [AnyInput | undefined, CallOptions | undefined];
      return execute(lookup(id), input ?? {}, o ?? {}) as Promise<never>;
    },
  };
}
