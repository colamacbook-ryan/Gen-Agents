import { API_ERROR_CODES, type ApiErrorCode, CSRF_HEADER, i18nKeyFor } from '@ga/contracts';
import { z } from 'zod';
import type { CsrfStore } from '../api/csrf.ts';
import {
  type AuthClient,
  AuthError,
  type ChangePasswordInput,
  type LoginInput,
  type LoginResult,
  type SessionInfo,
} from './types.ts';

export const AUTH_PATHS = {
  login: '/api/auth/login',
  session: '/api/auth/session',
  password: '/api/auth/password',
  logout: '/api/auth/logout',
} as const;

const loginBody = z.object({ mustChangePassword: z.boolean(), csrfToken: z.string().min(1) });
const sessionBody = z.object({
  username: z.string().min(1),
  mustChangePassword: z.boolean(),
  csrfToken: z.string().min(1),
});
const passwordBody = z.object({ csrfToken: z.string().min(1) });
const errorBody = z.object({
  error: z.object({ code: z.string(), i18nKey: z.string().optional(), requestId: z.string().optional() }),
  retryAfterSeconds: z.number().int().nonnegative().optional(),
  reason: z.string().optional(),
});

const KNOWN_CODES: ReadonlySet<string> = new Set(API_ERROR_CODES);

export interface HttpAuthClientOptions {
  /** mặc định `fetch` toàn cục; test truyền hàm giả */
  fetchImpl?: typeof fetch;
  /** tiền tố URL (mặc định: cùng origin) */
  baseUrl?: string;
  /** nơi giữ token CSRF để client API dùng chung; mặc định chỉ giữ riêng trong máy khách này */
  csrf?: CsrfStore;
}

/** Máy khách đăng nhập HTTP thật. CSRF token giữ trong bộ nhớ (không localStorage); cookie phiên do trình duyệt giữ (HttpOnly). */
export function createHttpAuthClient(opts: HttpAuthClientOptions = {}): AuthClient {
  const doFetch = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  const base = opts.baseUrl ?? '';
  let own: string | null = null;
  const csrfStore: CsrfStore = opts.csrf ?? {
    get: () => own,
    set: (t) => {
      own = t;
    },
  };

  async function send(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const csrf = csrfStore.get();
    if (method === 'POST' && csrf) headers[CSRF_HEADER] = csrf;
    try {
      return await doFetch(`${base}${path}`, {
        method,
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (cause) {
      throw new AuthError({ status: 0, code: 'network', i18nKey: 'errors.network' }, { cause });
    }
  }

  /** Đọc thân lỗi theo ApiErrorBody. Thân không đọc được ⇒ lỗi `internal` / `bad_response` (không nuốt, không bịa chữ). */
  async function toError(res: Response): Promise<AuthError> {
    let parsed: z.infer<typeof errorBody> | null = null;
    try {
      const json: unknown = await res.json();
      const r = errorBody.safeParse(json);
      parsed = r.success ? r.data : null;
    } catch {
      parsed = null;
    }
    if (!parsed) {
      return new AuthError({
        status: res.status,
        code: res.status >= 500 ? 'internal' : 'bad_response',
        i18nKey: res.status >= 500 ? 'errors.internal' : 'errors.bad_response',
      });
    }
    const code: ApiErrorCode | 'bad_response' = KNOWN_CODES.has(parsed.error.code)
      ? (parsed.error.code as ApiErrorCode)
      : 'bad_response';
    const retryHeader = Number(res.headers.get('retry-after'));
    return new AuthError({
      status: res.status,
      code,
      i18nKey: parsed.error.i18nKey ?? (code === 'bad_response' ? 'errors.bad_response' : i18nKeyFor(code)),
      retryAfterSeconds:
        parsed.retryAfterSeconds ?? (Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : undefined),
      reason: parsed.reason,
      requestId: parsed.error.requestId,
    });
  }

  async function ok<T>(res: Response, schema: z.ZodType<T>): Promise<T> {
    let json: unknown;
    try {
      json = await res.json();
    } catch (cause) {
      throw new AuthError({ status: res.status, code: 'bad_response', i18nKey: 'errors.bad_response' }, { cause });
    }
    const r = schema.safeParse(json);
    if (!r.success)
      throw new AuthError(
        { status: res.status, code: 'bad_response', i18nKey: 'errors.bad_response' },
        { cause: r.error },
      );
    return r.data;
  }

  return {
    async login(input: LoginInput): Promise<LoginResult> {
      const res = await send('POST', AUTH_PATHS.login, { username: input.username, password: input.password });
      if (!res.ok) throw await toError(res);
      const body = await ok(res, loginBody);
      csrfStore.set(body.csrfToken);
      return { mustChangePassword: body.mustChangePassword };
    },

    async session(): Promise<SessionInfo | null> {
      const res = await send('GET', AUTH_PATHS.session);
      if (res.status === 401) {
        csrfStore.set(null);
        return null;
      }
      if (!res.ok) throw await toError(res);
      const body = await ok(res, sessionBody);
      csrfStore.set(body.csrfToken);
      return body;
    },

    async changePassword(input: ChangePasswordInput): Promise<void> {
      const res = await send('POST', AUTH_PATHS.password, {
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
      });
      if (!res.ok) throw await toError(res);
      csrfStore.set((await ok(res, passwordBody)).csrfToken);
    },

    async logout(): Promise<void> {
      const res = await send('POST', AUTH_PATHS.logout);
      // 401 = phiên đã hết sẵn: mục tiêu (đăng xuất) đã đạt
      if (res.status !== 204 && res.status !== 401 && !res.ok) throw await toError(res);
      csrfStore.set(null);
    },
  };
}
