import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
  AuthGcRequest,
  type Clock,
  ContainerRef,
  EngineInstallStatusRequest,
  EnsureContainerRequest,
  ExecRequest,
  InstallEngineRequest,
  PTY,
  ReconcileRequest,
  SUPERVISOR_METHODS,
  SUPERVISOR_RPC,
} from '@ga/contracts';
import { z } from 'zod';
import { OneTimeCache, verifyRpc } from './auth.ts';
import { SupervisorError } from './errors.ts';
import type { Logger } from './log.ts';
import type { PtyRelay } from './pty.ts';
import type { SupervisorService } from './service.ts';

// HTTP của supervisor (cổng 7402 trên mạng core): RPC ký HMAC dưới /rpc/v1/<phương thức> + WebSocket /term (relay PTY) +
// /healthz. Body ≤ 1 MiB, đọc trọn rồi mới kiểm chữ ký; mọi lỗi trả mã ổn định, không vọng lại nội dung yêu cầu.

/** RPC mở rộng chưa có trong contracts v0 — [ĐỀ XUẤT — L-RT] đưa vào SUPERVISOR_METHODS (báo Gen / L0). */
export const PtyCloseRequest = z.strictObject({
  container: ContainerRef,
  engineAccount: z.string().regex(/^EN-\d{4,12}$/),
  reason: z.enum(['login_ok', 'owner_done']),
});
export const PtyEventsRequest = z.strictObject({ sinceSeq: z.number().int().nonnegative() });
export const EXT_METHODS = ['ptyClose', 'ptyEvents'] as const;
const ALL_METHODS: readonly string[] = [...SUPERVISOR_METHODS, ...EXT_METHODS];
const RefRequest = z.strictObject({ container: ContainerRef });
const EmptyRequest = z.strictObject({});

const MAX_BODY = 1024 * 1024;

export interface ServerDeps {
  svc: SupervisorService;
  pty: PtyRelay;
  supervisorKey: Buffer;
  clock: Clock;
  log: Logger;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const s = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(s) });
  res.end(s);
}

function sendError(res: ServerResponse, e: unknown): void {
  if (e instanceof SupervisorError) {
    sendJson(res, e.httpStatus, { error: e.code, message: e.message, ...(e.rules.length ? { rules: e.rules } : {}) });
  } else {
    sendJson(res, 500, { error: 'internal', message: 'lỗi nội bộ supervisor' });
  }
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new SupervisorError('bad_request', 'body quá lớn'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => reject(new SupervisorError('bad_request', 'lỗi đọc body')));
  });
}

function parse<T>(schema: z.ZodType<T>, v: unknown): T {
  const r = schema.safeParse(v);
  if (!r.success) throw new SupervisorError('bad_request', 'yêu cầu sai schema');
  return r.data;
}

export function createSupervisorServer(deps: ServerDeps): Server {
  const rpcCache = new OneTimeCache(50_000);
  const server = createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/healthz') return sendJson(res, 200, { ok: true });
      const url = req.url ?? '';
      if (!url.startsWith(`${SUPERVISOR_RPC.basePath}/`)) return sendJson(res, 404, { error: 'not_found' });
      const method = url.slice(SUPERVISOR_RPC.basePath.length + 1);
      if (!ALL_METHODS.includes(method)) return sendJson(res, 404, { error: 'not_found' });
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
      const body = await readBody(req);
      const auth = verifyRpc(
        deps.supervisorKey,
        {
          ts: req.headers[SUPERVISOR_RPC.headers.timestamp] as string | undefined,
          sig: req.headers[SUPERVISOR_RPC.headers.signature] as string | undefined,
        },
        'POST',
        url,
        body,
        deps.clock,
        rpcCache,
      );
      if (!auth.ok) {
        deps.log.log('warn', 'rpc_unauthorized', { method, reason: auth.reason });
        return sendJson(res, 401, { error: 'unauthorized' });
      }
      let input: unknown;
      try {
        input = body.length ? JSON.parse(body.toString('utf8')) : {};
      } catch {
        throw new SupervisorError('bad_request', 'body không phải JSON');
      }
      await dispatch(method, input, res, deps);
    } catch (e) {
      if (!res.headersSent) sendError(res, e);
      else res.end();
    }
  });
  server.on('upgrade', (req, socket, head) => {
    if ((req.url ?? '').split('?')[0] !== PTY.path) {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    deps.pty.handleUpgrade(req, socket, head).catch(() => socket.destroy());
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 0; // exec / installEngine là luồng dài
  return server;
}

function ndjson(res: ServerResponse) {
  res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' });
  return (obj: unknown) => {
    if (!res.writableEnded) res.write(`${JSON.stringify(obj)}\n`);
  };
}

async function dispatch(method: string, input: unknown, res: ServerResponse, deps: ServerDeps): Promise<void> {
  const { svc, pty } = deps;
  switch (method) {
    case 'ensureContainer': {
      const r = await svc.ensureContainer(parse(EnsureContainerRequest, input));
      return sendJson(res, 200, r.response);
    }
    case 'start':
      return sendJson(res, 200, await svc.start(parse(RefRequest, input).container.name));
    case 'stop':
      return sendJson(res, 200, await svc.stop(parse(RefRequest, input).container.name));
    case 'remove':
      return sendJson(res, 200, await svc.remove(parse(RefRequest, input).container.name));
    case 'reconcile':
      return sendJson(res, 200, await svc.reconcile(parse(ReconcileRequest, input).desired));
    case 'status':
      parse(EmptyRequest, input);
      return sendJson(res, 200, await svc.status());
    case 'authGc':
      return sendJson(res, 200, await svc.authGc(parse(AuthGcRequest, input)));
    case 'engineInstallStatus':
      return sendJson(res, 200, await svc.engineInstallStatus(parse(EngineInstallStatusRequest, input)));
    case 'installEngine': {
      const req = parse(InstallEngineRequest, input);
      await svc.broker.resolveManaged(req.container.name); // lỗi trước khi mở luồng ⇒ mã HTTP đúng
      const emit = ndjson(res);
      await svc.installEngine(req, emit);
      return void res.end();
    }
    case 'exec': {
      const req = parse(ExecRequest, input);
      const c = await svc.broker.resolveManaged(req.container.name);
      if (!c.running) throw new SupervisorError('container_not_running', 'container chưa chạy');
      const emit = ndjson(res);
      const ac = new AbortController();
      res.on('close', () => ac.abort());
      try {
        await svc.exec(req, emit, ac.signal);
      } catch (e) {
        emit({ type: 'error', code: e instanceof SupervisorError ? e.code : 'internal', message: 'exec thất bại' });
      }
      return void res.end();
    }
    case 'ptyClose': {
      const r = parse(PtyCloseRequest, input);
      return sendJson(res, 200, { closed: await pty.closeByRpc(r.container.name, r.engineAccount, r.reason) });
    }
    case 'ptyEvents':
      return sendJson(res, 200, pty.eventsSince(parse(PtyEventsRequest, input).sinceSeq));
    default:
      throw new SupervisorError('not_found', 'phương thức không có');
  }
}
