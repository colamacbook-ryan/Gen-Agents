// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
//
// Kịch bản chọn bằng biến môi trường (CLI giả) hoặc POST /_test/scenario (fake-vendor):
//   GA_FAKE_SCENARIO=quota_exhausted                  tên trần
//   GA_FAKE_SCENARIO='{"name":"quota_exhausted","resetAt":"2026-10-16T19:00:00Z"}'   JSON có tham số
//   GA_FAKE_SCENARIO_FILE=/đường/tệp.json             đọc lại MỖI lần chạy (đổi kịch bản giữa các lượt không cần dựng lại container)
// Không đặt gì ⇒ "ok". Tên lạ ⇒ ném lỗi (không nuốt lỗi cấu hình test).
import { existsSync, readFileSync } from 'node:fs';
import { approxTokens, hangForever, sleep } from './common.ts';
import { postJson } from './http.ts';

/** Kịch bản do "máy chủ hãng" quyết (fake-vendor, hoặc tính tại chỗ khi không có GA_FAKE_VENDOR_URL). BUILD-PLAN §C.2. */
export const VENDOR_SCENARIOS = [
  'ok',
  'quota_exhausted',
  'account_suspended',
  'login_expired',
  'outage',
  'hang',
  'malformed_json',
  'slow',
  'version_drift',
  'identity_changed',
] as const;
/** Kịch bản phía CLI: không đi qua máy chủ hãng. */
export const CLI_SCENARIOS = ['network_down', 'login_abandoned'] as const;
export const SCENARIO_NAMES = [...VENDOR_SCENARIOS, ...CLI_SCENARIOS] as const;
export type ScenarioName = (typeof SCENARIO_NAMES)[number];

export interface ToolStep {
  tool: string;
  args: Record<string, unknown>;
}
/** Kịch bản agentic: văn bản trả lời + chuỗi gọi tool MCP. Chuỗi `"$AUTH"` trong args = nội dung mọi tệp credential (ca injection, CNS-133). */
export interface ToolScript {
  reply?: string;
  calls?: ToolStep[];
}

export interface Scenario {
  name: ScenarioName;
  /** quota_exhausted: giờ reset (ISO); bỏ trống = CLI không báo giờ reset. */
  resetAt?: string | null;
  /** outage: mã 5xx (mặc định 503). */
  status?: number;
  /** slow: độ trễ (mặc định 3000 ms). */
  delayMs?: number;
  script?: ToolScript;
  /** agy: thoát ngay sau OAuth thay vì chạy tiếp như agent tương tác. */
  exitAfterLogin?: boolean;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

export class ScenarioError extends Error {}

export function parseScenario(x: unknown): Scenario {
  if (!isObj(x) || typeof x.name !== 'string') throw new ScenarioError('kịch bản phải có `name` (chuỗi)');
  if (!(SCENARIO_NAMES as readonly string[]).includes(x.name)) {
    throw new ScenarioError(`kịch bản lạ: ${x.name} (hợp lệ: ${SCENARIO_NAMES.join(', ')})`);
  }
  const s: Scenario = { name: x.name as ScenarioName };
  if (x.resetAt !== undefined) {
    if (x.resetAt !== null && (typeof x.resetAt !== 'string' || Number.isNaN(Date.parse(x.resetAt)))) {
      throw new ScenarioError('resetAt phải là ISO hoặc null');
    }
    s.resetAt = x.resetAt as string | null;
  }
  if (x.status !== undefined) {
    if (!Number.isInteger(x.status) || (x.status as number) < 500 || (x.status as number) > 599) {
      throw new ScenarioError('status của outage phải là 5xx');
    }
    s.status = x.status as number;
  }
  if (x.delayMs !== undefined) {
    if (!Number.isInteger(x.delayMs) || (x.delayMs as number) < 0)
      throw new ScenarioError('delayMs phải là số nguyên ≥ 0');
    s.delayMs = x.delayMs as number;
  }
  if (x.exitAfterLogin !== undefined) s.exitAfterLogin = x.exitAfterLogin === true;
  if (x.script !== undefined) {
    if (!isObj(x.script)) throw new ScenarioError('script phải là object');
    const calls = x.script.calls;
    if (calls !== undefined && !(Array.isArray(calls) && calls.every((c) => isObj(c) && typeof c.tool === 'string'))) {
      throw new ScenarioError('script.calls phải là mảng {tool, args}');
    }
    s.script = {
      ...(typeof x.script.reply === 'string' ? { reply: x.script.reply } : {}),
      ...(calls
        ? { calls: (calls as ToolStep[]).map((c) => ({ tool: c.tool, args: isObj(c.args) ? c.args : {} })) }
        : {}),
    };
  }
  return s;
}

/** Kịch bản được chọn rõ ràng qua env / tệp; null = không chọn (coi như "ok", và không gửi header kịch bản cho fake-vendor). */
export function readScenario(env: NodeJS.ProcessEnv = process.env): Scenario | null {
  const file = env.GA_FAKE_SCENARIO_FILE;
  const raw = file && existsSync(file) ? readFileSync(file, 'utf8') : env.GA_FAKE_SCENARIO;
  if (!raw?.trim()) return null;
  const t = raw.trim();
  return parseScenario(t.startsWith('{') ? JSON.parse(t) : { name: t });
}

// ---------------------------------------------------------------- "máy chủ hãng"
export const FAKE_ACCOUNT_A = 'fake-account-a@example.invalid';
export const FAKE_ACCOUNT_B = 'fake-account-b@example.invalid';

export interface VendorCtx {
  /** nhãn tài khoản (trong tệp credential). */
  account: string;
  model: string | null;
  promptChars: number;
  nowMs: number;
}
export interface VendorReply {
  status: number;
  body: string;
  headers: Record<string, string>;
  delayMs: number;
  hang: boolean;
}

export const ERROR_CODES = ['quota_exhausted', 'account_suspended', 'login_expired', 'outage'] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

const ERRORS: Record<ErrorCode, { http: number; status: string; message: string; retryable: boolean }> = {
  quota_exhausted: {
    http: 429,
    status: 'RESOURCE_EXHAUSTED',
    message: 'Quota exhausted for this account',
    retryable: false,
  },
  account_suspended: {
    http: 403,
    status: 'PERMISSION_DENIED',
    message: 'This account has been suspended',
    retryable: false,
  },
  login_expired: {
    http: 401,
    status: 'UNAUTHENTICATED',
    message: 'Login expired, please sign in again',
    retryable: false,
  },
  outage: { http: 503, status: 'UNAVAILABLE', message: 'The service is temporarily unavailable', retryable: true },
};

export function vendorReply(s: Scenario, ctx: VendorCtx): VendorReply {
  const base = { headers: {} as Record<string, string>, delayMs: 0, hang: false };
  const err = (code: ErrorCode, over: Partial<{ http: number; resetAt: string | null }> = {}): VendorReply => {
    const e = ERRORS[code];
    const http = over.http ?? e.http;
    return {
      ...base,
      status: http,
      body: JSON.stringify({
        error: {
          code,
          status: e.status,
          http,
          message: e.message,
          retryable: e.retryable,
          resetAt: over.resetAt ?? null,
        },
      }),
    };
  };
  const ok = (account = ctx.account, headers: Record<string, string> = {}, delayMs = 0): VendorReply => ({
    ...base,
    headers,
    delayMs,
    status: 200,
    body: JSON.stringify({
      ok: true,
      text: '(fake-vendor) ok',
      model: ctx.model ?? 'fake-model',
      account,
      usage: { input: approxTokens('x'.repeat(ctx.promptChars)), output: 4, cache_read: 0, thinking: 0 },
    }),
  });
  switch (s.name) {
    case 'quota_exhausted':
      return err('quota_exhausted', { resetAt: s.resetAt ?? null });
    case 'account_suspended':
    case 'login_expired':
      return err(s.name);
    case 'outage':
      return err('outage', { http: s.status ?? 503 });
    case 'hang':
      return { ...base, status: 0, body: '', hang: true };
    case 'malformed_json':
      return { ...base, status: 200, body: '{"ok":true,"text":"cắt giữa chừng' };
    case 'slow':
      return ok(ctx.account, {}, s.delayMs ?? 3000);
    case 'version_drift':
      return ok(ctx.account, { 'x-fake-latest-cli-version': '9.9.9' });
    case 'identity_changed':
      return ok(FAKE_ACCOUNT_B);
    default:
      return ok();
  }
}

export interface Usage {
  input: number;
  output: number;
  cache_read: number;
  thinking: number;
}
export type Interpreted =
  | { kind: 'ok'; text: string; model: string; account: string; usage: Usage; latestCliVersion: string | null }
  | {
      kind: 'error';
      code: ErrorCode;
      http: number;
      status: string;
      message: string;
      resetAt: string | null;
      retryable: boolean;
    }
  | { kind: 'malformed'; message: string }
  | { kind: 'network'; message: string };

/** Hiểu phản hồi của "hãng" — dùng chung cho cả hai CLI giả, mỗi CLI tự định dạng đầu ra theo kiểu của nó. */
export function interpretReply(status: number, body: string, headers: Record<string, unknown> = {}): Interpreted {
  let j: unknown;
  try {
    j = JSON.parse(body);
  } catch {
    return { kind: 'malformed', message: 'unexpected end of JSON input' };
  }
  if (!isObj(j)) return { kind: 'malformed', message: 'unexpected response shape' };
  if (isObj(j.error) && (ERROR_CODES as readonly string[]).includes(j.error.code as string)) {
    const e = j.error;
    return {
      kind: 'error',
      code: e.code as ErrorCode,
      http: Number(e.http ?? status),
      status: String(e.status ?? ''),
      message: String(e.message ?? ''),
      resetAt: typeof e.resetAt === 'string' ? e.resetAt : null,
      retryable: e.retryable === true,
    };
  }
  if (status === 200 && j.ok === true && typeof j.text === 'string') {
    const u = isObj(j.usage) ? j.usage : {};
    const latest = headers['x-fake-latest-cli-version'];
    return {
      kind: 'ok',
      text: j.text,
      model: String(j.model ?? 'fake-model'),
      account: String(j.account ?? FAKE_ACCOUNT_A),
      usage: {
        input: Number(u.input ?? 0),
        output: Number(u.output ?? 0),
        cache_read: Number(u.cache_read ?? 0),
        thinking: Number(u.thinking ?? 0),
      },
      latestCliVersion: typeof latest === 'string' ? latest : null,
    };
  }
  return { kind: 'malformed', message: `unexpected response (HTTP ${status})` };
}

/**
 * Một lượt gọi "hãng" của CLI giả. Có GA_FAKE_VENDOR_URL ⇒ POST sang fake-vendor (qua proxy nếu HTTP_PROXY, tức đi qua ga-egress);
 * không có ⇒ tự đóng vai hãng tại chỗ bằng đúng hàm vendorReply. Mất kết nối / bị egress chặn / timeout ⇒ kind 'network'.
 */
export async function callVendor(
  engine: 'agy' | 'claude',
  sc: Scenario | null,
  ctx: VendorCtx,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Interpreted> {
  if (sc?.name === 'network_down') {
    return { kind: 'network', message: 'dial tcp: lookup api.fake-vendor.invalid: no such host' };
  }
  const base = env.GA_FAKE_VENDOR_URL;
  if (!base) {
    const v = vendorReply(sc ?? { name: 'ok' }, ctx);
    if (v.hang) await hangForever();
    if (v.delayMs) await sleep(v.delayMs);
    return interpretReply(v.status, v.body, v.headers);
  }
  const headers: Record<string, string> = { 'x-fake-account': ctx.account };
  if (sc && (VENDOR_SCENARIOS as readonly string[]).includes(sc.name)) headers['x-fake-scenario'] = JSON.stringify(sc);
  try {
    const timeoutMs = Number(env.GA_FAKE_VENDOR_TIMEOUT_MS ?? 120_000);
    const r = await postJson(
      `${base}/v1/turn`,
      { engine, model: ctx.model, promptChars: ctx.promptChars },
      { headers, timeoutMs, env },
    );
    return interpretReply(r.status, r.body, r.headers);
  } catch (e) {
    return { kind: 'network', message: `dial tcp: ${(e as Error).message}` };
  }
}

/** Danh tính mà CLI giả sẽ in khi GA_FAKE_PRINT_IDENTITY=1. identity_changed ⇒ tài khoản B (hãng báo người dùng khác). */
export async function whoami(
  sc: Scenario | null,
  account: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const base = env.GA_FAKE_VENDOR_URL;
  if (!base) return sc?.name === 'identity_changed' ? FAKE_ACCOUNT_B : account;
  const headers: Record<string, string> = { 'x-fake-account': account };
  if (sc && (VENDOR_SCENARIOS as readonly string[]).includes(sc.name)) headers['x-fake-scenario'] = JSON.stringify(sc);
  try {
    const r = await postJson(`${base}/v1/whoami`, {}, { headers, timeoutMs: 10_000, env });
    const j = JSON.parse(r.body) as { account?: unknown };
    return typeof j.account === 'string' ? j.account : account;
  } catch {
    return account; // vendor không tới được: giữ danh tính đã lưu (không bịa danh tính mới)
  }
}
