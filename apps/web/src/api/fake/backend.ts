import type { StreamEvent as StreamEventType } from '@ga/contracts';
import {
  API_AUTH,
  API_ERROR_HTTP,
  ApiErrorEnvelope,
  type AuthLevel,
  authAtLeast,
  CSRF_HEADER,
  type ErrorCode,
  fullPath,
  i18nKeyFor,
  ROUTES,
  type Route,
  recoveryDecision,
  requiresCsrf,
  StreamEvent,
} from '@ga/contracts';
import { type FakeContext, type FakeSession, VERIFY_PASSWORD } from './fixtures.ts';
import { FakeBackendError, FakeFixtureError, FakeHttpError } from './http.ts';
import { hasFixture, parseRequest, runFixture, type WireRequest } from './run.ts';
import { createSeed, type FakeDb, iso, type SeedOptions } from './seed.ts';

// Backend giả: một `fetch` thay cho mạng. Dùng cho dev (VITE_GA_FAKE=1), test và Chromium; KHÔNG BAO GIỜ vào bản phát hành
// (main.tsx nạp nó qua import động bị cổng bởi cờ build; test `fake-release.test.ts` quét gói build).
// Mô phỏng ĐỦ các cổng của edge theo hợp đồng: phiên (401), quyền (403), CSRF (403 auth.csrf), buộc đổi mật khẩu, O4 recovery (423),
// Idempotency-Key (bản lặp trả lại y nguyên, khác thân ⇒ 409), kiểm request + response theo schema.

type Distribute<T> = T extends unknown ? Omit<T, 'id' | 'workspaceId' | 'at'> : never;
export type FakeEventInput = Distribute<StreamEventType>;

export type FailureKind = 'network' | ErrorCode;
export interface FakeCall {
  routeId: string | null;
  method: string;
  url: string;
  status: number | 'network-error';
}

export interface FakeControl {
  readonly credentials: { username: string; password: string };
  readonly db: FakeDb;
  /** chế độ khắc phục (O4): route không `open` trả 423 recovery.blocked */
  setRecoveryMode(on: boolean): void;
  /** phiên hết hạn: lời gọi có phiên kế tiếp ⇒ 401 auth.required */
  expireSession(): void;
  setAccessLevel(level: Exclude<AuthLevel, 'public'>): void;
  setMustChangePassword(on: boolean): void;
  /** `times` lời gọi kế tiếp (có thể giới hạn theo route) hỏng theo kiểu `kind` — 'network' = rớt mạng */
  failNext(kind: FailureKind, opts?: { times?: number; routeId?: string }): void;
  setLatency(ms: number): void;
  /** phát một sự kiện SSE (kiểm theo `StreamEvent`; sai schema ⇒ ném) */
  emit(event: FakeEventInput): void;
  /** ngắt mọi kết nối SSE đang mở (mô phỏng rớt mạng); client nối lại */
  dropStreams(): void;
  /** xoá bộ đệm phát lại (như máy chủ khởi động lại): lần nối lại kế tiếp nhận `resync` */
  clearEventBuffer(): void;
  readonly openStreams: number;
  readonly calls: readonly FakeCall[];
  /** lỗi nội bộ của backend giả (fixture thiếu / sai) — cũng được ném ra khỏi `fetch` */
  readonly errors: readonly Error[];
  reset(): void;
}

export interface FakeBackend {
  fetch: typeof fetch;
  control: FakeControl;
}

export interface FakeBackendOptions extends SeedOptions {
  /** bắt đầu ở trạng thái đã đăng nhập (mặc định: chưa) */
  signedIn?: boolean;
  mustChangePassword?: boolean;
  latencyMs?: number;
}

const BASE = 'http://fake.local';

interface Matcher {
  route: Route;
  re: RegExp;
  names: string[];
  specificity: number;
}

const MATCHERS: Matcher[] = ROUTES.filter((r) => r.method !== 'WS')
  .map((route) => {
    const names: string[] = [];
    const path = fullPath(route);
    const src = path.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{([A-Za-z0-9]+)\}/g, (_m, n: string) => {
      names.push(n);
      return '([^/]+)';
    });
    return { route, re: new RegExp(`^${src}$`), names, specificity: names.length };
  })
  .sort((a, b) => a.specificity - b.specificity);

function matchRoute(method: string, pathname: string): { route: Route; params: Record<string, string> } | null {
  for (const m of MATCHERS) {
    if (m.route.method !== method) continue;
    const hit = m.re.exec(pathname);
    if (!hit) continue;
    try {
      return {
        route: m.route,
        params: Object.fromEntries(m.names.map((n, i) => [n, decodeURIComponent(hit[i + 1] as string)])),
      };
    } catch {
      return null;
    }
  }
  return null;
}

const sha256Hex = async (text: string): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

export function createFakeBackend(opts: FakeBackendOptions = {}): FakeBackend {
  let db = createSeed(opts);
  const credentials = { username: db.owner.username, password: db.owner.password };
  let latency = opts.latencyMs ?? 0;
  const calls: FakeCall[] = [];
  const errors: Error[] = [];
  const failures: { kind: FailureKind; times: number; routeId?: string }[] = [];
  const idem = new Map<
    string,
    { fingerprint: string; status: number; text: string; headers: Record<string, string> }
  >();
  let reqSeq = 0;

  // ---- phiên
  const state = {
    signedIn: opts.signedIn ?? false,
    csrf: null as string | null,
    accessLevel: 'O' as AuthLevel,
    mustChangePassword: opts.mustChangePassword ?? false,
    failedLogins: 0,
  };
  const newCsrf = () => `csrf-${crypto.randomUUID()}`;
  if (state.signedIn) state.csrf = newCsrf();
  const session: FakeSession = {
    get accessLevel() {
      return state.accessLevel;
    },
    get mustChangePassword() {
      return state.mustChangePassword;
    },
    set mustChangePassword(v: boolean) {
      state.mustChangePassword = v;
    },
    get failedLogins() {
      return state.failedLogins;
    },
    set failedLogins(v: number) {
      state.failedLogins = v;
    },
    get csrf() {
      return state.csrf;
    },
    signIn() {
      state.signedIn = true;
      state.csrf = newCsrf();
      return state.csrf;
    },
    rotate() {
      state.csrf = newCsrf();
      return state.csrf;
    },
    signOut() {
      state.signedIn = false;
      state.csrf = null;
    },
  };
  const ctx = (): FakeContext => ({ db, session });

  // ---- SSE
  const enc = new TextEncoder();
  const streams = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const buffer: { id: string; frame: string }[] = [];
  let eventSeq = 0;
  const frameOf = (id: string, json: string) => `id: ${id}\ndata: ${json}\n\n`;
  const send = (c: ReadableStreamDefaultController<Uint8Array>, s: string) => {
    try {
      c.enqueue(enc.encode(s));
    } catch {
      streams.delete(c);
    }
  };

  const errorResponse = (code: ErrorCode, detail?: FakeHttpError['detail']): Response => {
    const body = ApiErrorEnvelope.parse({
      error: {
        code,
        i18nKey: i18nKeyFor(code),
        requestId: `req-fake-${String(++reqSeq).padStart(6, '0')}`,
        ...(detail ? { detail } : {}),
      },
    });
    return new Response(JSON.stringify(body), {
      status: API_ERROR_HTTP[code],
      headers: { 'content-type': 'application/json' },
    });
  };

  const abortIfNeeded = (signal: AbortSignal | null | undefined) => {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
  };

  const sleep = (ms: number, signal?: AbortSignal | null) =>
    new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => {
        clearTimeout(t);
        reject(new DOMException('aborted', 'AbortError'));
      });
    });

  async function handle(
    route: Route,
    params: Record<string, string>,
    url: URL,
    init: RequestInit | undefined,
  ): Promise<Response> {
    const headers = new Headers(init?.headers);
    // ---- cổng của edge, đúng thứ tự: O4 → phiên → buộc đổi mật khẩu → quyền → CSRF → kiểm request → idempotency
    if (db.recovery && recoveryDecision(route, { isCoreAgentAccount: false }) === 'blocked')
      return errorResponse('recovery.blocked');
    if (route.auth !== 'public') {
      if (!state.signedIn) return errorResponse('auth.required');
      if (state.mustChangePassword && route.id !== 'EXT-04' && route.id !== 'EXT-02')
        return errorResponse('auth.must_change_password');
      if (!authAtLeast(state.accessLevel, route.auth)) return errorResponse('auth.forbidden');
      if (requiresCsrf(route) && headers.get(CSRF_HEADER) !== state.csrf) return errorResponse('auth.csrf');
    }
    let body: unknown;
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        return errorResponse('validation.failed', { field: 'body' });
      }
    }
    const wire: WireRequest = {
      params,
      query: Object.fromEntries(url.searchParams.entries()),
      headers: Object.fromEntries(
        [API_AUTH.idempotencyHeader, API_AUTH.lastEventIdHeader].flatMap((h) =>
          headers.has(h) ? [[h, headers.get(h) as string]] : [],
        ),
      ),
      body,
    };
    const parsed = parseRequest(route, wire);
    if (!parsed.ok) return errorResponse(parsed.error.code, parsed.error.detail);

    if (route.response.kind === 'sse') return openStream(wire.headers[API_AUTH.lastEventIdHeader], init?.signal);

    let idemKey: string | undefined;
    if (route.idempotent) {
      idemKey = `${route.id}:${wire.headers[API_AUTH.idempotencyHeader]}`;
      const seen = idem.get(idemKey);
      const fingerprint = JSON.stringify([params, body]);
      if (seen) {
        if (seen.fingerprint !== fingerprint) return errorResponse('idempotency.conflict');
        return new Response(seen.text, { status: seen.status, headers: seen.headers });
      }
    }

    let out: unknown;
    try {
      out = await runFixture(route.id, parsed.data, ctx());
    } catch (e) {
      if (e instanceof FakeHttpError) return errorResponse(e.code, e.detail);
      throw e;
    }

    const res = route.response;
    let status = 200;
    let text = '';
    const outHeaders: Record<string, string> = {};
    if (res.kind === 'json') {
      status = res.status;
      text = JSON.stringify(out);
      outHeaders['content-type'] = 'application/json';
      if (res.noStore) outHeaders['cache-control'] = 'no-store';
    } else if (res.kind === 'empty') {
      status = 204;
    } else if (res.kind === 'csv') {
      const csv = out as { text: string };
      text = csv.text;
      outHeaders['content-type'] = 'text/csv; charset=utf-8';
      outHeaders[API_AUTH.contentSha256Header] = await sha256Hex(text);
    } else {
      throw new FakeBackendError(`${route.id}: kiểu response ${res.kind} chưa được backend giả hỗ trợ`);
    }
    if (idemKey) idem.set(idemKey, { fingerprint: JSON.stringify([params, body]), status, text, headers: outHeaders });
    return new Response(status === 204 ? null : text, { status, headers: outHeaders });
  }

  function openStream(lastEventId: string | undefined, signal: AbortSignal | null | undefined): Response {
    let ctrl!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        ctrl = c;
      },
      cancel() {
        streams.delete(ctrl);
      },
    });
    if (lastEventId !== undefined) {
      const idx = buffer.findIndex((e) => e.id === lastEventId);
      if (idx === -1) {
        // không còn trong bộ đệm ⇒ client phải đọc lại bằng GET (hợp đồng: `resync`)
        const ev = { id: String(++eventSeq), workspaceId: db.workspace.id, at: iso(), type: 'resync', reason: 'gap' };
        const frame = frameOf(ev.id, JSON.stringify(StreamEvent.parse(ev)));
        buffer.push({ id: ev.id, frame });
        send(ctrl, frame);
      } else for (const e of buffer.slice(idx + 1)) send(ctrl, e.frame);
    }
    streams.add(ctrl);
    signal?.addEventListener('abort', () => {
      streams.delete(ctrl);
      try {
        ctrl.close();
      } catch {
        // đã đóng
      }
    });
    return new Response(stream, {
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' },
    });
  }

  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, BASE);
    const method = (init?.method ?? 'GET').toUpperCase();
    const hit = matchRoute(method, url.pathname);
    const record = (status: FakeCall['status']) =>
      calls.push({ routeId: hit?.route.id ?? null, method, url: url.pathname + url.search, status });
    try {
      abortIfNeeded(init?.signal);
      if (latency > 0) await sleep(latency, init?.signal);
      const rule = failures.find((f) => f.times > 0 && (f.routeId === undefined || f.routeId === hit?.route.id));
      if (rule) {
        rule.times--;
        if (rule.kind === 'network') {
          record('network-error');
          throw new TypeError('Failed to fetch (backend giả: mô phỏng rớt mạng)');
        }
        const res = errorResponse(rule.kind);
        record(res.status);
        return res;
      }
      if (!hit) {
        const res = errorResponse('not_found');
        record(res.status);
        return res;
      }
      if (!hasFixture(hit.route.id) && hit.route.response.kind !== 'sse') {
        throw new FakeBackendError(
          `chưa có fixture cho ${hit.route.id} (${method} ${url.pathname}) — thêm vào src/api/fake/fixtures.ts`,
        );
      }
      const res = await handle(hit.route, hit.params, url, init);
      record(res.status);
      return res;
    } catch (e) {
      if (e instanceof FakeBackendError || e instanceof FakeFixtureError) {
        errors.push(e);
        console.error(e);
      }
      if (!calls.some((c) => c.url === url.pathname + url.search) || e instanceof FakeBackendError)
        record('network-error');
      throw e;
    }
  }) as typeof fetch;

  const control: FakeControl = {
    credentials,
    get db() {
      return db;
    },
    setRecoveryMode(on) {
      db.recovery = on;
    },
    expireSession() {
      session.signOut();
    },
    setAccessLevel(level) {
      state.accessLevel = level;
    },
    setMustChangePassword(on) {
      state.mustChangePassword = on;
    },
    failNext(kind, o = {}) {
      failures.push({ kind, times: o.times ?? 1, routeId: o.routeId });
    },
    setLatency(ms) {
      latency = ms;
    },
    emit(event) {
      const full = StreamEvent.parse({ ...event, id: String(++eventSeq), workspaceId: db.workspace.id, at: iso() });
      const frame = frameOf(full.id, JSON.stringify(full));
      buffer.push({ id: full.id, frame });
      if (buffer.length > 1000) buffer.shift();
      for (const c of [...streams]) send(c, frame);
    },
    dropStreams() {
      for (const c of [...streams]) {
        streams.delete(c);
        try {
          c.close();
        } catch {
          // đã đóng
        }
      }
    },
    clearEventBuffer() {
      buffer.length = 0;
    },
    get openStreams() {
      return streams.size;
    },
    calls,
    errors,
    reset() {
      control.dropStreams();
      db = createSeed({ ...opts, password: credentials.password });
      state.signedIn = opts.signedIn ?? false;
      state.csrf = state.signedIn ? newCsrf() : null;
      state.accessLevel = 'O';
      state.mustChangePassword = opts.mustChangePassword ?? false;
      state.failedLogins = 0;
      failures.length = 0;
      idem.clear();
      calls.length = 0;
      errors.length = 0;
      buffer.length = 0;
    },
  };
  return { fetch: fakeFetch, control };
}

export const makeVerifyContext = (): FakeContext => {
  const db = createSeed({ password: VERIFY_PASSWORD });
  let csrf: string | null = null;
  return {
    db,
    session: {
      accessLevel: 'O',
      mustChangePassword: false,
      failedLogins: 0,
      get csrf() {
        return csrf;
      },
      signIn: () => (csrf = 'csrf-verify-0000000000'),
      rotate: () => (csrf = 'csrf-verify-0000000001'),
      signOut: () => {
        csrf = null;
      },
    },
  };
};
