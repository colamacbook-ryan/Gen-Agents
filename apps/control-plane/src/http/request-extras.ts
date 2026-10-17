// Phần "ngoài DataStore" của một request mà vài route cần (L-SYS, hook tối thiểu — HANDLERS.md §2 không có):
//   - `meta`: IP (từ socket; chỉ tin `X-Forwarded-For` khi socket là proxy tin cậy — Caddy), User-Agent, Origin.
//   - phiên của request (EXT-02 / 03 / 04): chỉ trường KHÔNG bí mật (csrfToken là của chính phiên này).
//   - đăng nhập / đổi mật khẩu / đăng xuất (AuthService của L-SEC) — Set-Cookie do bridge gom, pipeline gắn vào response
//     THÀNH CÔNG (handler không tự viết header; giá trị phải là cookie phiên của L-SEC).
//   - SSE: `subscribe` với quyền của PHIÊN (userId + authLevel), workspace = của phiên.
// Lấy bằng `requestExtras(ctx)` — không nới `HandlerContext` (khung L-APP); ctx không có extras (vd test tự dựng) ⇒ ném.
import { isIP } from 'node:net';
import { SESSION_COOKIE_NAMES, SSE_KEEPALIVE_SECONDS } from '@ga/contracts';
import type { AppConnection } from '@ga/db';
import type { DataStore } from '@ga/db/repos';
import { checkRequestOrigin } from '@ga/security';
import type { AuthContext, ChangePasswordResult, LoginResult } from '../auth/index.ts';
import type { HandlerContext } from '../context/context.ts';
import type { EventBus, EventSubscription } from '../events/bus.ts';
import { type MemberAccessLevel, resolveMembership } from './session.ts';

/** Phần AuthService (L-SEC) mà EXT-01 / 02 / 04 cần — AuthService thật thoả cấu trúc này. */
export interface AccountService {
  login(input: { username: unknown; password: unknown; ip: string; userAgent: string | null }): Promise<LoginResult>;
  changePassword(
    ctx: AuthContext,
    input: { currentPassword: unknown; newPassword: unknown; ip: string; userAgent: string | null },
  ): Promise<ChangePasswordResult>;
  logout(ctx: AuthContext): { setCookie: string };
}

export function isAccountService(v: unknown): v is AccountService {
  const o = v as Partial<AccountService> | null;
  return (
    !!o && typeof o.login === 'function' && typeof o.changePassword === 'function' && typeof o.logout === 'function'
  );
}

export interface RequestMeta {
  /** IP của client (đã kiểm `isIP`) hoặc `'unknown'`. Không bao giờ lấy thẳng header của client khi không qua proxy tin cậy. */
  readonly ip: string;
  readonly userAgent: string | null;
  readonly origin: string | null;
  readonly secFetchSite: string | null;
  readonly method: string;
}

/** Phiên của request — KHÔNG có token / tokenHash. */
export interface SessionView {
  readonly userId: string;
  readonly sessionId: string;
  readonly mustChangePassword: boolean;
  readonly csrfToken: string;
}

export interface LoginUser {
  readonly id: string;
  readonly displayId: string;
  readonly name: string;
  readonly accessLevel: MemberAccessLevel;
}

export type BridgeLoginResult =
  | { ok: true; user: LoginUser; csrfToken: string; mustChangePassword: boolean }
  | Exclude<LoginResult, { ok: true }>
  | { ok: false; code: 'origin' }
  | { ok: false; code: 'no_membership' };

/** Nhịp giữ kết nối + tuổi tối đa của một luồng SSE (hết tuổi ⇒ server đóng, client nối lại với Last-Event-ID và phiên
 * được kiểm LẠI — phiên đã thu hồi không giữ luồng mãi). */
export interface SseLimits {
  keepAliveMs: number;
  maxDurationMs: number;
}

export const DEFAULT_SSE_LIMITS: SseLimits = Object.freeze({
  keepAliveMs: SSE_KEEPALIVE_SECONDS * 1000,
  maxDurationMs: 10 * 60_000,
});

export interface RequestExtras {
  readonly meta: RequestMeta;
  /** null ở route `public`. */
  readonly session: SessionView | null;
  login(username: string, password: string): Promise<BridgeLoginResult>;
  changePassword(currentPassword: string, newPassword: string): Promise<ChangePasswordResult>;
  logout(): void;
  /** SSE: luồng sự kiện của workspace của phiên, lọc theo quyền của phiên. */
  subscribe(lastEventId: string | null): EventSubscription;
  readonly sse: SseLimits;
  /** Set-Cookie đã gom (pipeline đọc sau khi handler thành công). */
  readonly cookies: readonly string[];
}

export interface ExtrasDeps {
  reader: AppConnection;
  store: DataStore;
  events: EventBus;
  accounts: AccountService | null;
  allowedOrigins: readonly string[];
  sse: SseLimits;
}

export interface ExtrasRequest {
  meta: RequestMeta;
  session: AuthContext | null;
  actor: { userId: string; workspaceId: string; authLevel: 'V' | 'A' | 'O' } | null;
}

const COOKIE_PREFIXES = Object.values(SESSION_COOKIE_NAMES).map((n) => `${n}=`);

function checkCookie(v: string): string {
  // chỉ cookie phiên của L-SEC; không CR / LF (chống chèn header)
  if (!COOKIE_PREFIXES.some((p) => v.startsWith(p)) || /[\r\n]/.test(v) || v.length > 4096)
    throw new Error('request-extras: Set-Cookie lạ');
  return v;
}

class ExtrasMissingError extends Error {
  constructor(what: string) {
    super(`request-extras: thiếu ${what}`);
    this.name = 'ExtrasMissingError';
  }
}

export function createRequestExtras(deps: ExtrasDeps, req: ExtrasRequest): RequestExtras {
  const cookies: string[] = [];
  const session = req.session;
  const needAccounts = (): AccountService => {
    if (deps.accounts === null) throw new ExtrasMissingError('AccountService');
    return deps.accounts;
  };
  const needSession = (): AuthContext => {
    if (session === null) throw new ExtrasMissingError('phiên');
    return session;
  };
  return Object.freeze({
    meta: req.meta,
    session: session
      ? Object.freeze({
          userId: session.userId,
          sessionId: session.sessionId,
          mustChangePassword: session.mustChangePassword,
          csrfToken: session.csrfToken,
        })
      : null,
    sse: deps.sse,
    get cookies() {
      return [...cookies];
    },
    async login(username: string, password: string): Promise<BridgeLoginResult> {
      const accounts = needAccounts();
      // chống login CSRF: Origin / Sec-Fetch-Site như lớp http cũ của L-SEC (auth/http.ts)
      const origin = checkRequestOrigin({
        method: req.meta.method,
        origin: req.meta.origin,
        secFetchSite: req.meta.secFetchSite,
        allowedOrigins: deps.allowedOrigins,
      });
      if (!origin.ok) return { ok: false, code: 'origin' };
      const r = await accounts.login({ username, password, ip: req.meta.ip, userAgent: req.meta.userAgent });
      if (!r.ok) return r;
      // Phiên đã tạo nhưng không có membership ⇒ KHÔNG gửi cookie (phiên mồ côi tự hết hạn).
      const m = resolveMembership(deps.reader, r.userId);
      if (!m.ok) return { ok: false, code: 'no_membership' };
      const user = deps.store.read(m.workspaceId, (tx) => tx.users.get(r.userId));
      if (user === null) return { ok: false, code: 'no_membership' };
      cookies.push(checkCookie(r.setCookie));
      return {
        ok: true,
        user: {
          id: user.id,
          displayId: user.display_id,
          name: user.display_name.slice(0, 60) || user.username.slice(0, 60),
          accessLevel: m.accessLevel,
        },
        csrfToken: r.csrfToken,
        mustChangePassword: r.mustChangePassword,
      };
    },
    async changePassword(currentPassword: string, newPassword: string): Promise<ChangePasswordResult> {
      const r = await needAccounts().changePassword(needSession(), {
        currentPassword,
        newPassword,
        ip: req.meta.ip,
        userAgent: req.meta.userAgent,
      });
      if (r.ok) {
        cookies.push(checkCookie(r.setCookie));
        // mọi phiên cũ đã bị thu hồi ⇒ đóng luồng SSE đang mở của user
        if (req.actor) deps.events.disconnect(req.actor.workspaceId, req.actor.userId);
      }
      return r;
    },
    logout(): void {
      const s = needSession();
      const r = needAccounts().logout(s);
      cookies.push(checkCookie(r.setCookie));
      // luồng SSE của user này đóng theo (client nối lại bằng phiên còn hiệu lực, nếu có)
      if (req.actor) deps.events.disconnect(req.actor.workspaceId, req.actor.userId);
    },
    subscribe(lastEventId: string | null): EventSubscription {
      const a = req.actor;
      if (a === null) throw new ExtrasMissingError('actor');
      return deps.events.subscribe(a.workspaceId, { userId: a.userId, authLevel: a.authLevel }, { lastEventId });
    },
  });
}

/**
 * IP của client. `socketIp` = địa chỉ socket. Chỉ khi socket ∈ `trustedProxies` mới đọc `X-Forwarded-For` — lấy phần tử
 * CUỐI (do proxy tin cậy gắn), kiểm `isIP`. Không hợp lệ ⇒ IP của socket / 'unknown'.
 */
export function clientIp(socketIp: string | null | undefined, xff: string | null, trustedProxies: readonly string[]) {
  const sock = typeof socketIp === 'string' && isIP(socketIp) !== 0 ? socketIp : null;
  if (sock !== null && trustedProxies.includes(sock) && xff !== null && xff.length <= 1024) {
    const last = xff.split(',').pop()?.trim() ?? '';
    if (isIP(last) !== 0) return last;
  }
  return sock ?? 'unknown';
}

const EXTRAS = new WeakMap<HandlerContext, RequestExtras>();

export function bindRequestExtras(ctx: HandlerContext, extras: RequestExtras): void {
  EXTRAS.set(ctx, extras);
}

/** Extras của request đang chạy. ctx không do pipeline dựng ⇒ ném (fail-closed). */
export function requestExtras(ctx: HandlerContext): RequestExtras {
  const e = EXTRAS.get(ctx);
  if (e === undefined) throw new ExtrasMissingError('extras của request');
  return e;
}
