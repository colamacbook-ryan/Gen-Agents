// Client HTTP của test theo route id (CHỈ TEST): `as('A.owner').call('SYS-34', { params, body })`.
//   - Đường dẫn dựng từ `fullPath(route)` + params (encodeURIComponent); thiếu param ⇒ ném.
//   - Tự gắn cookie phiên + `X-GA-CSRF` + `Origin` như trình duyệt (tắt từng cái được để thử ca âm).
//   - Route `idempotent`: tự sinh `Idempotency-Key` ngẫu nhiên nếu test không truyền.
//   - MỌI response JSON qua `findCredentialLike` (contracts) — trúng ⇒ ném CredentialLeakError (test đỏ).
import { randomBytes } from 'node:crypto';
import { API_AUTH, findCredentialLike, fullPath, pathParamNames, type Route, routeById } from '@ga/contracts';
import type { TestWorld, Who } from './world.ts';

export type Fetcher = (req: Request) => Response | Promise<Response>;

export interface CallInput {
  params?: Record<string, string>;
  query?: Record<string, string>;
  /** Thân JSON (tuần tự hoá). */
  body?: unknown;
  /** Thân thô (bỏ qua `body`), vd chuỗi rất dài / luồng. */
  rawBody?: string | Uint8Array | ReadableStream<Uint8Array>;
  headers?: Record<string, string>;
  /** false = không gửi; chuỗi = giá trị khác (vd CSRF của phiên khác). Mặc định: CSRF của phiên khi method ghi. */
  csrf?: boolean | string;
  /** false = không gửi cookie; chuỗi = header Cookie khác. */
  cookie?: boolean | string;
  /** false = không gửi Origin; chuỗi = Origin khác. Mặc định: origin GUI khi method ghi. */
  origin?: boolean | string;
}

export interface CallResult {
  status: number;
  headers: Headers;
  text: string;
  json: unknown;
  /** `error.code` của phong bì lỗi (nếu có). */
  code: string | null;
  /** `error.detail` của phong bì lỗi (nếu có). */
  detail: Record<string, unknown> | null;
}

export class CredentialLeakError extends Error {
  constructor(routeId: string, patternId: string) {
    super(`response của ${routeId} có chuỗi giống credential (${patternId})`);
    this.name = 'CredentialLeakError';
  }
}

export interface Caller {
  call(routeId: string, input?: CallInput): Promise<CallResult>;
}

export function buildPath(route: Pick<Route, 'mount' | 'path'>, params: Record<string, string> = {}): string {
  let p = fullPath(route);
  for (const name of pathParamNames(route.path)) {
    const v = params[name];
    if (v === undefined) throw new Error(`client: thiếu param ${name} cho ${route.path}`);
    p = p.replace(`{${name}}`, encodeURIComponent(v));
  }
  return p;
}

/**
 * Trường token mà HỢP ĐỒNG trả có chủ đích: `csrfToken` của EXT-01 / EXT-03 (HMAC gắn phiên, base64url 43 ký tự — client
 * cần nó để gửi `x-ga-csrf`). Chỉ bỏ qua đúng trường cấp 1 đó, đúng dạng đó, ở đúng route đó; mọi chỗ khác vẫn quét.
 */
const DECLARED_TOKEN_FIELDS: Readonly<Record<string, readonly string[]>> = {
  'EXT-01': ['csrfToken'],
  'EXT-03': ['csrfToken'],
};
const CSRF_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

function scanTarget(json: unknown, label: string): unknown {
  const fields = DECLARED_TOKEN_FIELDS[label];
  if (!fields || json === null || typeof json !== 'object' || Array.isArray(json)) return json;
  const copy: Record<string, unknown> = { ...(json as Record<string, unknown>) };
  for (const f of fields) {
    const v = copy[f];
    if (typeof v === 'string' && CSRF_TOKEN_RE.test(v)) delete copy[f];
  }
  return copy;
}

export async function readResult(res: Response, label: string): Promise<CallResult> {
  const text = await res.text();
  let json: unknown = null;
  if ((res.headers.get('content-type') ?? '').startsWith('application/json') && text.length > 0) {
    json = JSON.parse(text) as unknown;
    const hit = findCredentialLike(scanTarget(json, label));
    if (hit) throw new CredentialLeakError(label, hit.patternId);
  }
  const err = (json as { error?: { code?: unknown; detail?: unknown } } | null)?.error;
  return {
    status: res.status,
    headers: res.headers,
    text,
    json,
    code: typeof err?.code === 'string' ? err.code : null,
    detail: err?.detail && typeof err.detail === 'object' ? (err.detail as Record<string, unknown>) : null,
  };
}

export function makeClient(world: TestWorld, fetcher: Fetcher) {
  const base = 'http://ga-app.test';
  const as = (who: Who): Caller => ({
    async call(routeId, input = {}) {
      const route = routeById(routeId);
      if (!route) throw new Error(`client: route ${routeId} không có trong registry`);
      const user = who === 'anon' ? null : world.user(who);
      const url = new URL(`${base}${buildPath(route, input.params)}`);
      for (const [k, v] of Object.entries(input.query ?? {})) url.searchParams.append(k, v);
      const writes = route.method !== 'GET';
      const headers = new Headers();
      const cookie =
        input.cookie === false ? undefined : typeof input.cookie === 'string' ? input.cookie : user?.cookie;
      if (cookie !== undefined) headers.set('cookie', cookie);
      if (writes && input.csrf !== false) {
        const v = typeof input.csrf === 'string' ? input.csrf : user?.csrf;
        if (v !== undefined) headers.set(API_AUTH.csrfHeader, v);
      }
      if (writes && input.origin !== false)
        headers.set('origin', typeof input.origin === 'string' ? input.origin : world.origin);
      if (
        route.idempotent &&
        !Object.keys(input.headers ?? {}).some((k) => k.toLowerCase() === API_AUTH.idempotencyHeader)
      ) {
        headers.set(API_AUTH.idempotencyHeader, `idem-${randomBytes(8).toString('hex')}`);
      }
      for (const [k, v] of Object.entries(input.headers ?? {})) headers.set(k, v);
      let body: string | Uint8Array | ReadableStream<Uint8Array> | undefined;
      if (input.rawBody !== undefined) body = input.rawBody;
      else if (input.body !== undefined) {
        body = JSON.stringify(input.body);
        if (!headers.has('content-type')) headers.set('content-type', 'application/json');
      }
      const method = route.method === 'WS' ? 'GET' : route.method;
      const req = new Request(url, {
        method,
        headers,
        ...(body !== undefined ? { body, duplex: 'half' } : {}),
      } as RequestInit);
      return readResult(await fetcher(req), routeId);
    },
  });
  return {
    as,
    /** Request tự dựng (đường dẫn lạ, method lạ…) — vẫn qua kiểm credential. */
    raw: async (req: Request): Promise<CallResult> =>
      readResult(await fetcher(req), `${req.method} ${new URL(req.url).pathname}`),
    base,
  };
}
