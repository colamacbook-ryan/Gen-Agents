// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
import { afterEach, describe, expect, it } from 'vitest';
import { type FakeTelegram, startTelegram } from '../telegram/server.ts';

const TOKEN = '123456:FAKE-token_abcdef';
const TOKEN2 = '777000:OTHER-token_xyz';

let tg: FakeTelegram | undefined;
afterEach(async () => {
  await tg?.close();
  tg = undefined;
});

type Api<T = unknown> = { ok: boolean; result?: T; error_code?: number; description?: string };
async function call<T = unknown>(
  t: FakeTelegram,
  method: string,
  params: Record<string, unknown> = {},
  token = TOKEN,
): Promise<Api<T> & { http: number }> {
  const r = await fetch(`${t.url}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
  return { http: r.status, ...((await r.json()) as Api<T>) };
}
const inject = (t: FakeTelegram, body: Record<string, unknown>) =>
  fetch(`${t.url}/_test/updates`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const sent = async (t: FakeTelegram, q = '') =>
  (await (await fetch(`${t.url}/_test/sent${q}`)).json()) as Array<Record<string, unknown>>;

describe('fake-telegram: Bot API tối thiểu', () => {
  it('getMe + deleteWebhook (grammY gọi khi bot.start())', async () => {
    tg = await startTelegram();
    expect(await call(tg, 'getMe')).toMatchObject({
      http: 200,
      ok: true,
      result: { id: 123456, is_bot: true, username: 'fake_123456_bot' },
    });
    expect(await call(tg, 'deleteWebhook')).toMatchObject({ ok: true, result: true });
  });

  it('sendMessage → /_test/sent; message_id tăng dần; không ghi token (chỉ botId)', async () => {
    tg = await startTelegram({ now: () => new Date('2026-10-14T08:00:00Z') });
    const a = await call<{ message_id: number; text: string; date: number }>(tg, 'sendMessage', {
      chat_id: 42,
      text: 'Chào anh, em là Mai.',
    });
    const b = await call<{ message_id: number }>(tg, 'sendMessage', { chat_id: 42, text: 'tin 2', parse_mode: 'HTML' });
    expect(a.result?.message_id).toBe(1);
    expect(b.result?.message_id).toBe(2);
    expect(a.result?.date).toBe(Date.parse('2026-10-14T08:00:00Z') / 1000);
    const out = await sent(tg);
    expect(out).toMatchObject([
      {
        seq: 1,
        botId: '123456',
        method: 'sendMessage',
        chat_id: 42,
        text: 'Chào anh, em là Mai.',
        message_id: 1,
        at: '2026-10-14T08:00:00.000Z',
      },
      { seq: 2, text: 'tin 2', payload: { parse_mode: 'HTML' } },
    ]);
    expect(JSON.stringify(out)).not.toContain('FAKE-token');
    expect(JSON.stringify(out)).not.toContain(TOKEN);
  });

  it('editMessageText: sửa được; giống hệt ⇒ 400 "message is not modified"; không tồn tại ⇒ 400', async () => {
    tg = await startTelegram();
    const m = await call<{ message_id: number }>(tg, 'sendMessage', { chat_id: 1, text: 'v1' });
    const id = m.result?.message_id;
    expect(await call(tg, 'editMessageText', { chat_id: 1, message_id: id, text: 'v2' })).toMatchObject({ ok: true });
    const same = await call(tg, 'editMessageText', { chat_id: 1, message_id: id, text: 'v2' });
    expect(same).toMatchObject({ http: 400, ok: false, error_code: 400 });
    expect(same.description).toContain('message is not modified');
    expect((await call(tg, 'editMessageText', { chat_id: 1, message_id: 999, text: 'x' })).description).toBe(
      'Bad Request: message to edit not found',
    );
    expect((await sent(tg, '?method=editMessageText')).map((r) => r.text)).toEqual(['v2']);
  });

  it('sendChatAction + setMyCommands được ghi vào outbox, lọc theo bot / method', async () => {
    tg = await startTelegram();
    await call(tg, 'sendChatAction', { chat_id: 5, action: 'typing' });
    await call(tg, 'setMyCommands', { commands: [{ command: 'status', description: 'Trạng thái' }] });
    await call(tg, 'sendMessage', { chat_id: 5, text: 'x' }, TOKEN2);
    expect((await sent(tg)).map((r) => r.method)).toEqual(['sendChatAction', 'setMyCommands', 'sendMessage']);
    expect((await sent(tg, '?bot=777000')).map((r) => r.method)).toEqual(['sendMessage']);
    expect((await sent(tg, '?method=setMyCommands'))[0]?.payload).toEqual({
      commands: [{ command: 'status', description: 'Trạng thái' }],
    });
  });

  it('getUpdates: tin bơm qua /_test/updates tới đúng bot; offset xác nhận (update < offset bị bỏ)', async () => {
    tg = await startTelegram();
    await call(tg, 'getMe');
    const r = await inject(tg, { token: TOKEN, chat_id: 42, text: '/status', username: 'owner' });
    expect(await r.json()).toEqual({ ok: true, update_id: 1 });
    await inject(tg, { token: TOKEN, chat_id: 42, text: 'tin hai' });
    const first = await call<
      Array<{
        update_id: number;
        message: { text: string; from: { id: number; username?: string }; chat: { id: number } };
      }>
    >(tg, 'getUpdates', { offset: 0 });
    expect(first.result?.map((u) => u.message.text)).toEqual(['/status', 'tin hai']);
    expect(first.result?.[0]?.message.from).toMatchObject({ id: 42, username: 'owner', is_bot: false });
    const second = await call<unknown[]>(tg, 'getUpdates', { offset: 2 });
    expect(second.result).toHaveLength(1);
    expect((await call<unknown[]>(tg, 'getUpdates', { offset: 3 })).result).toEqual([]);
  });

  it('long-poll: giữ yêu cầu tới khi có tin; hết timeout trả mảng rỗng; client đóng thì dọn', async () => {
    tg = await startTelegram();
    await call(tg, 'getMe');
    const t0 = Date.now();
    const empty = await call<unknown[]>(tg, 'getUpdates', { timeout: 1 });
    expect(empty.result).toEqual([]);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(900);
    const poll = call<Array<{ message: { text: string } }>>(tg, 'getUpdates', { timeout: 20 });
    await new Promise((r) => setTimeout(r, 150));
    const t1 = Date.now();
    await inject(tg, { token: TOKEN, chat_id: 1, text: 'đánh thức' });
    expect((await poll).result?.[0]?.message.text).toBe('đánh thức');
    expect(Date.now() - t1).toBeLessThan(10_000); // thức dậy ngay, không đợi hết 20 s của long-poll
  });

  it('hai getUpdates đồng thời cùng bot ⇒ 409 Conflict (như Telegram thật); bot khác không bị ảnh hưởng', async () => {
    tg = await startTelegram();
    await call(tg, 'getMe');
    const first = call(tg, 'getUpdates', { timeout: 2 });
    await new Promise((r) => setTimeout(r, 100));
    const dup = await call(tg, 'getUpdates', { timeout: 0 });
    expect(dup).toMatchObject({ http: 409, ok: false, error_code: 409 });
    expect(dup.description).toContain('terminated by other getUpdates request');
    expect((await call(tg, 'getUpdates', { timeout: 0 }, TOKEN2)).ok).toBe(true);
    await first;
  });

  it('/_test/updates không kèm token chọn bot duy nhất; có ≥ 2 bot mà thiếu token ⇒ 400; nhận update thô', async () => {
    tg = await startTelegram();
    expect((await inject(tg, { chat_id: 1, text: 'x' })).status).toBe(400); // chưa có bot nào
    await call(tg, 'getMe');
    expect((await inject(tg, { chat_id: 1, text: 'x' })).status).toBe(200);
    await call(tg, 'getMe', {}, TOKEN2);
    expect((await inject(tg, { chat_id: 1, text: 'x' })).status).toBe(400);
    const raw = await inject(tg, { token: TOKEN2, update: { edited_message: { text: 'sửa' } } });
    expect(raw.status).toBe(200);
    expect((await call<Array<Record<string, unknown>>>(tg, 'getUpdates', {}, TOKEN2)).result?.[0]).toMatchObject({
      update_id: 1,
      edited_message: { text: 'sửa' },
    });
  });

  it('/_test/reset xoá bot + outbox', async () => {
    tg = await startTelegram();
    await call(tg, 'sendMessage', { chat_id: 1, text: 'x' });
    await fetch(`${tg.url}/_test/reset`, { method: 'POST' });
    expect(await sent(tg)).toEqual([]);
    expect(tg.sent).toEqual([]);
  });

  it('form-urlencoded cũng được (một số client không gửi JSON)', async () => {
    tg = await startTelegram();
    const r = await fetch(`${tg.url}/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'chat_id=9&text=xin+chao',
    });
    expect(((await r.json()) as Api<{ text: string }>).result?.text).toBe('xin chao');
  });
});

describe('fake-telegram: ca âm theo từng lối vào', () => {
  it('token sai định dạng ⇒ 401; method lạ ⇒ 404; đường lạ ⇒ 404', async () => {
    tg = await startTelegram();
    expect(await call(tg, 'getMe', {}, 'khong-phai-token')).toMatchObject({
      http: 401,
      ok: false,
      error_code: 401,
      description: 'Unauthorized',
    });
    expect(await call(tg, 'noSuchMethod')).toMatchObject({ http: 404, ok: false });
    expect((await fetch(`${tg.url}/nope`)).status).toBe(404);
  });

  it('sendMessage thiếu chat_id / text ⇒ 400 đúng chuỗi của Telegram; sendChatAction thiếu action ⇒ 400; setMyCommands sai kiểu ⇒ 400', async () => {
    tg = await startTelegram();
    expect((await call(tg, 'sendMessage', { text: 'x' })).description).toBe('Bad Request: chat_id is empty');
    expect((await call(tg, 'sendMessage', { chat_id: 1 })).description).toBe('Bad Request: message text is empty');
    expect((await call(tg, 'sendMessage', { chat_id: 1, text: '' })).description).toBe(
      'Bad Request: message text is empty',
    );
    expect((await call(tg, 'sendChatAction', { chat_id: 1 })).http).toBe(400);
    expect((await call(tg, 'setMyCommands', { commands: 'x' })).http).toBe(400);
    expect(await sent(tg)).toEqual([]); // lỗi thì không vào outbox
  });

  it('thân JSON hỏng ⇒ 400; content-type lạ ⇒ 400; thân > 1 MiB ⇒ 413 (không đọc vô hạn)', async () => {
    tg = await startTelegram();
    const bad = await fetch(`${tg.url}/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{nope',
    });
    expect(bad.status).toBe(400);
    const ct = await fetch(`${tg.url}/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
      body: '--x--',
    });
    expect(ct.status).toBe(400);
    const big = await fetch(`${tg.url}/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: 1, text: 'x'.repeat(2 * 1024 * 1024) }),
    }).then(
      (r) => r.status,
      () => 'reset',
    );
    expect([413, 'reset']).toContain(big);
  });
});

describe('fake-telegram: hiệu năng', () => {
  it('500 sendMessage tuần tự + đọc outbox < 5 s (bộ parse JSON nhận dữ liệu từ ngoài không là điểm nghẽn)', async () => {
    tg = await startTelegram();
    const t0 = performance.now();
    for (let i = 0; i < 500; i++) await call(tg, 'sendMessage', { chat_id: 1, text: `tin ${i}` });
    expect(await sent(tg)).toHaveLength(500);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(5000);
  });
});
