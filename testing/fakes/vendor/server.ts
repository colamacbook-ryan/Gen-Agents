// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
//
// fake-vendor: "máy chủ hãng" giả đứng sau ga-egress (BUILD-PLAN §C.2). CLI giả POST /v1/turn tới đây khi có GA_FAKE_VENDOR_URL.
// Kịch bản: ok · quota_exhausted (+resetAt) · account_suspended · login_expired · outage (5xx) · hang · malformed_json · slow ·
// version_drift · identity_changed. Chọn theo thứ tự ưu tiên: header x-fake-scenario (CLI gửi kịch bản env của nó) > kịch bản
// riêng của tài khoản > kịch bản chung (POST /_test/scenario).
//   POST /_test/scenario  {name, ...tham số, account?}   đặt kịch bản chung hoặc riêng của một tài khoản
//   GET  /_test/requests                                 nhật ký lượt gọi (KHÔNG chứa prompt, chỉ độ dài)
//   POST /_test/reset
import http from 'node:http';
import { nowMs, sleep } from '../lib/common.ts';
import { HttpError, listen, type Running, readBody, sendJson } from '../lib/http.ts';
import {
  FAKE_ACCOUNT_A,
  FAKE_ACCOUNT_B,
  parseScenario,
  type Scenario,
  ScenarioError,
  vendorReply,
} from '../lib/scenario.ts';

export interface VendorLog {
  at: string;
  engine: string;
  model: string | null;
  account: string;
  scenario: string;
  status: number;
  promptChars: number;
}

export interface FakeVendor extends Running {
  log: VendorLog[];
  setScenario(s: unknown, account?: string): void;
}

export async function startVendor(
  opts: { host?: string; port?: number; scenario?: unknown } = {},
): Promise<FakeVendor> {
  let global: Scenario = parseScenario(opts.scenario ?? { name: 'ok' });
  const perAccount = new Map<string, Scenario>();
  const log: VendorLog[] = [];

  const server = http.createServer(async (req, res) => {
    try {
      const path = new URL(req.url ?? '/', 'http://x').pathname;
      if (req.method === 'GET' && path === '/healthz') return sendJson(res, 200, { ok: true });
      if (req.method === 'GET' && path === '/_test/requests') return sendJson(res, 200, log);
      if (req.method === 'POST' && path === '/_test/reset') {
        global = { name: 'ok' };
        perAccount.clear();
        log.length = 0;
        return sendJson(res, 200, { ok: true });
      }
      if (req.method === 'POST' && path === '/_test/scenario') {
        const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
        const { account, ...rest } = body;
        setScenario(rest, typeof account === 'string' ? account : undefined);
        return sendJson(res, 200, { ok: true });
      }
      if (req.method === 'POST' && path === '/v1/turn') return await turn(req, res);
      if (req.method === 'POST' && path === '/v1/whoami') return whoamiReply(req, res);
      sendJson(res, 404, { error: 'not found' });
    } catch (e) {
      const status =
        e instanceof HttpError ? e.status : e instanceof SyntaxError || e instanceof ScenarioError ? 400 : 500;
      sendJson(res, status, { error: (e as Error).message });
    }
  });

  function setScenario(s: unknown, account?: string) {
    const sc = parseScenario(s);
    if (account) perAccount.set(account, sc);
    else global = sc;
  }

  function pick(req: http.IncomingMessage): { account: string; sc: Scenario } {
    const account = String(req.headers['x-fake-account'] ?? FAKE_ACCOUNT_A);
    const header = req.headers['x-fake-scenario'];
    const sc = typeof header === 'string' ? parseScenario(JSON.parse(header)) : (perAccount.get(account) ?? global);
    return { account, sc };
  }

  function whoamiReply(req: http.IncomingMessage, res: http.ServerResponse) {
    const { account, sc } = pick(req);
    sendJson(res, 200, { account: sc.name === 'identity_changed' ? FAKE_ACCOUNT_B : account });
  }

  async function turn(req: http.IncomingMessage, res: http.ServerResponse) {
    const body = JSON.parse(await readBody(req)) as { engine?: string; model?: string | null; promptChars?: number };
    const { account, sc } = pick(req);
    const promptChars = Number(body.promptChars ?? 0);
    const reply = vendorReply(sc, { account, model: body.model ?? null, promptChars, nowMs: nowMs() });
    log.push({
      at: new Date().toISOString(),
      engine: String(body.engine ?? '?'),
      model: body.model ?? null,
      account,
      scenario: sc.name,
      status: reply.hang ? 0 : reply.status,
      promptChars,
    });
    if (reply.hang) return; // không bao giờ trả lời; close() cắt kết nối
    if (reply.delayMs) await sleep(reply.delayMs);
    sendJson(res, reply.status, reply.body, reply.headers);
  }

  const running = await listen(server, opts);
  return { ...running, log, setScenario };
}
