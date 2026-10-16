// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
//
// fake-telegram: Bot API tối thiểu cho grammY (`client.apiRoot` trỏ vào đây): getMe, getUpdates (long-poll), sendMessage,
// editMessageText, sendChatAction, setMyCommands (+ deleteWebhook mà grammY gọi khi bot.start()).
//   POST /_test/updates   {token?, update} | {token?, chat_id, text, from_id?, username?}   bơm tin tới bot
//   GET  /_test/sent      tin bot đã gửi (?bot=<id>&method=<tên>) — canary quét outbox này (BUILD-PLAN §C.6)
//   POST /_test/reset
// Token không bao giờ được ghi lại: nhật ký chỉ có botId (số trước dấu ':').
import http from 'node:http';
import { HttpError, listen, type Running, readBody, sendJson } from '../lib/http.ts';

export interface SentRecord {
  seq: number;
  botId: string;
  method: string;
  chat_id: number | string | null;
  text: string | null;
  message_id: number | null;
  payload: Record<string, unknown>;
  at: string;
}

interface Msg {
  message_id: number;
  from: { id: number; is_bot: boolean; first_name: string; username: string };
  chat: { id: number; type: 'private'; first_name: string };
  date: number;
  text: string;
}

interface Bot {
  id: string;
  username: string;
  nextUpdateId: number;
  queue: Array<Record<string, unknown> & { update_id: number }>;
  waiter: { resolve: () => void } | null;
  nextMessageId: number;
  messages: Map<string, Msg>; // `${chat_id}:${message_id}`
}

const TOKEN_RE = /^(\d{1,15}):[A-Za-z0-9_-]{3,64}$/;
const tgError = (res: http.ServerResponse, code: number, description: string) =>
  sendJson(res, code, { ok: false, error_code: code, description });

export interface FakeTelegram extends Running {
  sent: SentRecord[];
}

export async function startTelegram(
  opts: { host?: string; port?: number; now?: () => Date } = {},
): Promise<FakeTelegram> {
  const now = opts.now ?? (() => new Date());
  const bots = new Map<string, Bot>();
  const sent: SentRecord[] = [];
  let seq = 0;

  const botFor = (token: string): Bot | null => {
    const m = TOKEN_RE.exec(token);
    if (!m) return null;
    const id = m[1] as string;
    let b = bots.get(id);
    if (!b) {
      b = {
        id,
        username: `fake_${id}_bot`,
        nextUpdateId: 1,
        queue: [],
        waiter: null,
        nextMessageId: 1,
        messages: new Map(),
      };
      bots.set(id, b);
    }
    return b;
  };

  const record = (b: Bot, method: string, p: Record<string, unknown>, messageId: number | null) => {
    sent.push({
      seq: ++seq,
      botId: b.id,
      method,
      chat_id: (p.chat_id as number | string | undefined) ?? null,
      text: typeof p.text === 'string' ? p.text : null,
      message_id: messageId,
      payload: p,
      at: now().toISOString(),
    });
  };

  const pushUpdate = (b: Bot, body: Record<string, unknown>): number => {
    const update_id = b.nextUpdateId++;
    b.queue.push({ ...body, update_id });
    b.waiter?.resolve();
    return update_id;
  };

  function mkMessage(b: Bot, chatId: number, text: string): Msg {
    const m: Msg = {
      message_id: b.nextMessageId++,
      from: { id: Number(b.id), is_bot: true, first_name: 'Fake Bot', username: b.username },
      chat: { id: chatId, type: 'private', first_name: 'Fake User' },
      date: Math.floor(now().getTime() / 1000),
      text,
    };
    b.messages.set(`${chatId}:${m.message_id}`, m);
    return m;
  }

  async function parseParams(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    const raw = await readBody(req);
    const ct = String(req.headers['content-type'] ?? '');
    if (!raw.trim()) return {};
    if (ct.includes('application/json')) return JSON.parse(raw) as Record<string, unknown>;
    if (ct.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
    throw new HttpError(400, `Bad Request: content-type không hỗ trợ (${ct || 'trống'})`);
  }

  async function api(res: http.ServerResponse, b: Bot, method: string, p: Record<string, unknown>) {
    const chat = p.chat_id;
    switch (method) {
      case 'getMe':
        return sendJson(res, 200, {
          ok: true,
          result: {
            id: Number(b.id),
            is_bot: true,
            first_name: 'Fake Bot',
            username: b.username,
            can_join_groups: true,
          },
        });
      case 'deleteWebhook':
        return sendJson(res, 200, { ok: true, result: true });
      case 'sendMessage': {
        if (chat === undefined || chat === '') return tgError(res, 400, 'Bad Request: chat_id is empty');
        if (typeof p.text !== 'string' || !p.text) return tgError(res, 400, 'Bad Request: message text is empty');
        const m = mkMessage(b, Number(chat), p.text);
        record(b, method, p, m.message_id);
        return sendJson(res, 200, { ok: true, result: m });
      }
      case 'editMessageText': {
        if (chat === undefined || p.message_id === undefined)
          return tgError(res, 400, 'Bad Request: message identifier is not specified');
        if (typeof p.text !== 'string' || !p.text) return tgError(res, 400, 'Bad Request: message text is empty');
        const m = b.messages.get(`${chat}:${p.message_id}`);
        if (!m) return tgError(res, 400, 'Bad Request: message to edit not found');
        if (m.text === p.text) {
          return tgError(
            res,
            400,
            'Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message',
          );
        }
        m.text = p.text;
        record(b, method, p, m.message_id);
        return sendJson(res, 200, { ok: true, result: m });
      }
      case 'sendChatAction':
        if (chat === undefined || typeof p.action !== 'string')
          return tgError(res, 400, 'Bad Request: chat_id is empty');
        record(b, method, p, null);
        return sendJson(res, 200, { ok: true, result: true });
      case 'setMyCommands':
        if (!Array.isArray(typeof p.commands === 'string' ? JSON.parse(p.commands) : p.commands))
          return tgError(res, 400, 'Bad Request: commands must be an array');
        record(b, method, p, null);
        return sendJson(res, 200, { ok: true, result: true });
      case 'getUpdates':
        return getUpdates(res, b, p);
      default:
        return tgError(res, 404, 'Not Found');
    }
  }

  async function getUpdates(res: http.ServerResponse, b: Bot, p: Record<string, unknown>) {
    if (b.waiter)
      return tgError(
        res,
        409,
        'Conflict: terminated by other getUpdates request; make sure that only one bot instance is running',
      );
    const offset = p.offset === undefined ? 0 : Number(p.offset);
    const limit = Math.min(Math.max(Number(p.limit ?? 100), 1), 100);
    const timeoutS = Math.min(Number(p.timeout ?? 0), 50);
    if (offset > 0) b.queue = b.queue.filter((u) => u.update_id >= offset); // Telegram: update < offset coi như đã nhận
    if (!b.queue.length && timeoutS > 0) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, timeoutS * 1000);
        const wake = () => {
          clearTimeout(t);
          resolve();
        };
        b.waiter = { resolve: wake };
        res.on('close', wake);
      });
      b.waiter = null;
      if (res.destroyed) return;
    }
    sendJson(res, 200, { ok: true, result: b.queue.slice(0, limit) });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      const path = url.pathname;
      if (path === '/_test/sent' && req.method === 'GET') {
        const bot = url.searchParams.get('bot');
        const method = url.searchParams.get('method');
        return sendJson(
          res,
          200,
          sent.filter((r) => (!bot || r.botId === bot) && (!method || r.method === method)),
        );
      }
      if (path === '/_test/reset' && req.method === 'POST') {
        bots.clear();
        sent.length = 0;
        seq = 0;
        return sendJson(res, 200, { ok: true });
      }
      if (path === '/_test/updates' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
        const token = typeof body.token === 'string' ? body.token : null;
        const b = token ? botFor(token) : bots.size === 1 ? [...bots.values()][0] : null;
        if (!b)
          return sendJson(res, 400, { ok: false, description: 'token hợp lệ là bắt buộc khi chưa có đúng một bot' });
        let update = body.update as Record<string, unknown> | undefined;
        if (!update) {
          if (body.chat_id === undefined || typeof body.text !== 'string')
            return sendJson(res, 400, { ok: false, description: 'cần update hoặc {chat_id, text}' });
          const id = Number(body.from_id ?? body.chat_id);
          update = {
            message: {
              message_id: b.nextMessageId++,
              from: {
                id,
                is_bot: false,
                first_name: String(body.first_name ?? 'Fake User'),
                ...(body.username ? { username: body.username } : {}),
              },
              chat: { id: Number(body.chat_id), type: 'private', first_name: String(body.first_name ?? 'Fake User') },
              date: Math.floor(now().getTime() / 1000),
              text: body.text,
            },
          };
        }
        return sendJson(res, 200, { ok: true, update_id: pushUpdate(b, update) });
      }
      const m = /^\/bot([^/]+)\/([A-Za-z]+)$/.exec(path);
      if (m && (req.method === 'POST' || req.method === 'GET')) {
        const b = botFor(decodeURIComponent(m[1] as string));
        if (!b) return tgError(res, 401, 'Unauthorized');
        const params = req.method === 'GET' ? Object.fromEntries(url.searchParams) : await parseParams(req);
        return await api(res, b, m[2] as string, params);
      }
      tgError(res, 404, 'Not Found');
    } catch (e) {
      if (e instanceof HttpError) return tgError(res, e.status, e.message);
      tgError(res, e instanceof SyntaxError ? 400 : 500, `Bad Request: ${(e as Error).message}`);
    }
  });

  const running = await listen(server, opts);
  return { ...running, sent };
}
