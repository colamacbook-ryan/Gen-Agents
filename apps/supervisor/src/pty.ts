import { randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  type Clock,
  EXEC_ARGV,
  extractTermTicket,
  loginExecEnv,
  PTY,
  PtyClientMessage,
  type PtyCloseReason,
  type TermTicketClaims,
} from '@ga/contracts';
import { TicketReplayCache, verifyTermTicket } from '@ga/security';
import { type WebSocket, WebSocketServer } from 'ws';
import { SupervisorError } from './errors.ts';
import type { Logger } from './log.ts';
import type { ExecSession } from './runtime.ts';
import type { SupervisorService } from './service.ts';

// Relay PTY đăng nhập (BUILD-PLAN §A.2-3, §B.6; CNS-134). Trình duyệt → Caddy (/term, không log) → đây → `docker exec` Tty:true
// đúng `ga-runner login` (EXEC_ARGV.login) với ba biến env lấy từ vé đã ký. Chỉ chuyển byte, KHÔNG log payload.
// Vé: trong Sec-WebSocket-Protocol (không bao giờ trong URL — URL có query bị từ chối); kiểm HMAC + hạn + nonce MỘT lần trước
// mọi bước khác; phản hồi chỉ chọn subprotocol `ga-term.v1` (không vọng lại vé).
// Đóng exec theo 4 lý do (contracts PTY_CLOSE_REASONS): login_ok (ga-app báo qua RPC ptyClose sau khi kiểm đăng nhập đạt) ·
// owner_done (khung điều khiển, hoặc RPC) · ws_closed · max_duration. Docker API không giết được exec ⇒ supervisor đổi cửa sổ
// PTY sang LOGIN_CLOSE_WINSIZE; ga-runner login nhận SIGWINCH, giết CLI + mọi tiến trình mang marker, dọn tmpfs, thoát.

/** Trùng `LOGIN_CLOSE_WINSIZE` của ga-runner (apps/runner/src/login.ts; IT kiểm khớp). Ngoài 1..1000 của trình duyệt. */
export const LOGIN_CLOSE_WINSIZE = { cols: 4093, rows: 4091 } as const;
export const PTY_LIMITS = { maxSessions: 8, maxFrameBytes: 64 * 1024, closeWaitMs: 8000 } as const;

export type PtyEndReason = PtyCloseReason | 'process_exited' | 'error';

export interface PtyEvent {
  seq: number;
  container: string;
  engineAccount: string;
  reason: PtyEndReason;
  at: string;
  durationMs: number;
  /** Exec đã thật sự dừng sau khi đóng (inspect Running = false). */
  execStopped: boolean;
}

interface Session {
  key: string;
  claims: TermTicketClaims;
  ws: WebSocket;
  exec: ExecSession;
  startedAt: number;
  closing: Promise<void> | null;
  timer: NodeJS.Timeout;
}

export interface PtyOptions {
  termKey: Buffer;
  allowedOrigins: readonly string[];
  maxDurationSeconds: number;
  clock: Clock;
  log: Logger;
}

export class PtyRelay {
  private readonly svc: SupervisorService;
  private readonly opt: PtyOptions;
  private readonly nonces = new TicketReplayCache(10_000);
  private readonly sessions = new Map<string, Session>();
  /** Khoá đang dựng exec (giữ chỗ đồng bộ ⇒ hai vé cùng (container, tài khoản) không mở hai phiên). */
  private readonly pending = new Set<string>();
  private readonly events: PtyEvent[] = [];
  private seq = 0;
  private readonly wss: WebSocketServer;

  constructor(svc: SupervisorService, opt: PtyOptions) {
    this.svc = svc;
    this.opt = opt;
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: PTY_LIMITS.maxFrameBytes,
      perMessageDeflate: false,
      // chỉ chọn giao thức phiên bản — KHÔNG vọng lại subprotocol chứa vé
      handleProtocols: (protocols) => (protocols.has(PTY.protocol) ? PTY.protocol : false),
    });
  }

  private reject(socket: Duplex, status: number, why: string): void {
    this.opt.log.log('warn', 'pty_reject', { reason: why, status });
    socket.end(
      `HTTP/1.1 ${status} ${status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : 'Bad Request'}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
    );
  }

  /** Xử lý `upgrade` trên đường /term. */
  async handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    // vé không bao giờ trong URL: path đúng /term, không query
    if (req.url !== PTY.path) return this.reject(socket, 400, 'bad_path');
    const origin = req.headers.origin;
    if (this.opt.allowedOrigins.length > 0 && (!origin || !this.opt.allowedOrigins.includes(origin))) {
      return this.reject(socket, 403, 'origin');
    }
    const ticket = extractTermTicket(req.headers['sec-websocket-protocol'] ?? null);
    if (!ticket) return this.reject(socket, 401, 'no_ticket');
    const v = verifyTermTicket(ticket, this.opt.termKey, this.opt.clock, this.nonces);
    if (!v.ok) return this.reject(socket, 401, v.reason);
    const claims = v.claims;
    const key = `${claims.container}/${claims.acc}`;
    if (this.sessions.has(key) || this.pending.has(key)) return this.reject(socket, 403, 'session_exists');
    if (this.sessions.size + this.pending.size >= PTY_LIMITS.maxSessions)
      return this.reject(socket, 403, 'too_many_sessions');
    this.pending.add(key);
    try {
      await this.openSession(req, socket, head, claims, key);
    } finally {
      this.pending.delete(key);
    }
  }

  private async openSession(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    claims: TermTicketClaims,
    key: string,
  ): Promise<void> {
    let exec: ExecSession;
    try {
      const c = await this.svc.broker.resolveManaged(claims.container);
      // vé của tài khoản khác: tài khoản phải được mount RW vào CHÍNH container ghi trong vé
      if (!c.mounts.some((m) => m.destination === `/auth/${claims.acc}` && m.rw)) {
        return this.reject(socket, 403, 'account_not_mounted');
      }
      if (!c.running) return this.reject(socket, 403, 'container_not_running');
      exec = await this.svc.broker.exec(c, this.svc.internalSpec(EXEC_ARGV.login, loginExecEnv(claims), true));
    } catch (e) {
      return this.reject(socket, 403, e instanceof SupervisorError ? e.code : 'internal');
    }
    if (socket.destroyed) {
      exec.destroy();
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => this.attach(ws, claims, exec, key));
  }

  private attach(ws: WebSocket, claims: TermTicketClaims, exec: ExecSession, key: string): void {
    const s: Session = {
      key,
      claims,
      ws,
      exec,
      startedAt: this.opt.clock.now().getTime(),
      closing: null,
      timer: setTimeout(() => void this.close(key, 'max_duration'), this.opt.maxDurationSeconds * 1000),
    };
    this.sessions.set(key, s);
    this.opt.log.log('info', 'pty_open', {
      container: claims.container,
      account: claims.acc,
      engine: claims.engineSlug,
    });
    ws.send(JSON.stringify({ type: 'opened', maxDurationSeconds: this.opt.maxDurationSeconds }));
    exec.stdout.on('data', (b: Buffer) => {
      if (ws.readyState === ws.OPEN) ws.send(b, { binary: true });
    });
    ws.on('message', (data, isBinary) => {
      if (s.closing) return;
      if (isBinary) {
        exec.write(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer));
        return;
      }
      let msg: unknown;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      const m = PtyClientMessage.safeParse(msg);
      if (!m.success) return;
      if (m.data.type === 'owner_done') void this.close(key, 'owner_done');
      else void exec.resize(m.data.cols, m.data.rows).catch(() => {});
    });
    ws.on('close', () => void this.close(key, 'ws_closed'));
    ws.on('error', () => void this.close(key, 'ws_closed'));
    void exec.done.then(() => this.close(key, 'process_exited'));
  }

  /** Đóng phiên (idempotent). Trả true nếu có phiên. */
  close(key: string, reason: PtyEndReason): Promise<void> {
    const s = this.sessions.get(key);
    if (!s) return Promise.resolve();
    if (s.closing) return s.closing;
    s.closing = this.doClose(s, reason);
    return s.closing;
  }

  private async doClose(s: Session, reason: PtyEndReason): Promise<void> {
    clearTimeout(s.timer);
    if (s.ws.readyState === s.ws.OPEN) {
      if (reason !== 'process_exited' && reason !== 'error' && reason !== 'ws_closed') {
        s.ws.send(JSON.stringify({ type: 'closed', reason }));
      }
      s.ws.close(1000);
    }
    let stopped = false;
    const deadline = Date.now() + PTY_LIMITS.closeWaitMs;
    // báo ga-runner login kết thúc CLI (SIGWINCH với kích thước dành riêng), lặp tới khi exec dừng
    while (Date.now() < deadline) {
      try {
        const i = await s.exec.inspect();
        if (!i.running) {
          stopped = true;
          break;
        }
        await s.exec.resize(LOGIN_CLOSE_WINSIZE.cols, LOGIN_CLOSE_WINSIZE.rows);
      } catch {
        // exec đã biến mất
        stopped = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    s.exec.destroy();
    this.sessions.delete(s.key);
    const ev: PtyEvent = {
      seq: ++this.seq,
      container: s.claims.container,
      engineAccount: s.claims.acc,
      reason,
      at: this.opt.clock.now().toISOString(),
      durationMs: Math.max(0, this.opt.clock.now().getTime() - s.startedAt),
      execStopped: stopped,
    };
    this.events.push(ev);
    if (this.events.length > 1000) this.events.splice(0, this.events.length - 1000);
    this.opt.log.log(stopped ? 'info' : 'error', 'pty_closed', {
      container: ev.container,
      account: ev.engineAccount,
      reason,
      durationMs: ev.durationMs,
      execStopped: stopped,
    });
  }

  /** RPC mở rộng ptyClose (ga-app báo login_ok / owner_done). */
  async closeByRpc(container: string, engineAccount: string, reason: 'login_ok' | 'owner_done'): Promise<boolean> {
    const key = `${container}/${engineAccount}`;
    if (!this.sessions.has(key)) return false;
    await this.close(key, reason);
    return true;
  }

  eventsSince(sinceSeq: number): { events: PtyEvent[]; nextSeq: number } {
    return { events: this.events.filter((e) => e.seq > sinceSeq), nextSeq: this.seq };
  }

  activeCount(): number {
    return this.sessions.size;
  }

  static newId(): string {
    return randomBytes(12).toString('hex');
  }
}
