// SYS-85 `GET /api/v1/stream` (BACKEND-TRIAL §3.7): luồng `text/event-stream` từ EventBus của L-APP.
//   - Workspace + khán giả = của PHIÊN (bus lọc V / A / O / recipient; phát lại theo `Last-Event-ID` cũng lọc lại theo phiên).
//   - Khung: `id:` + `event:` + `data:` (JSON một dòng). Nhịp giữ kết nối là dòng chú thích `: ka`.
//   - Tuổi tối đa: hết hạn ⇒ server đóng luồng; client nối lại (phiên được kiểm lại ở edge). Gỡ / hạ quyền thành viên,
//     đăng xuất, đổi mật khẩu ⇒ `bus.disconnect` (request-extras / dịch vụ thành viên).
import type { StreamEvent } from '@ga/contracts';
import type { EventSubscription } from '../events/bus.ts';
import { defineHandler, type Handler } from '../http/define-handler.ts';
import { requestExtras, type SseLimits } from '../http/request-extras.ts';

const SAFE_TOKEN_RE = /^[A-Za-z0-9._:-]{1,128}$/;

/** Một khung SSE. id / type phải là token an toàn (không xuống dòng — chống chèn khung); JSON.stringify không sinh CR / LF. */
export function sseFrame(ev: StreamEvent): string {
  if (!SAFE_TOKEN_RE.test(ev.id) || !SAFE_TOKEN_RE.test(ev.type)) throw new Error('sse: id / type không an toàn');
  return `id: ${ev.id}\nevent: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`;
}

export function sseStream(sub: EventSubscription, limits: SseLimits): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let keepAlive: ReturnType<typeof setInterval> | undefined;
  let maxAge: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    if (keepAlive !== undefined) clearInterval(keepAlive);
    if (maxAge !== undefined) clearTimeout(maxAge);
    keepAlive = undefined;
    maxAge = undefined;
  };
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(enc.encode(': open\n\n'));
      keepAlive = setInterval(() => {
        try {
          controller.enqueue(enc.encode(': ka\n\n'));
        } catch {
          stop();
        }
      }, limits.keepAliveMs);
      keepAlive.unref?.();
      maxAge = setTimeout(() => sub.close(), limits.maxDurationMs);
      maxAge.unref?.();
    },
    async pull(controller) {
      const r = await sub.next();
      if (r.done) {
        stop();
        controller.close();
        return;
      }
      controller.enqueue(enc.encode(sseFrame(r.value)));
    },
    cancel() {
      stop();
      sub.close();
    },
  });
}

export const sseHandlers: readonly Handler[] = [
  defineHandler('SYS-85', ({ headers }, ctx) => {
    const x = requestExtras(ctx);
    const sub = x.subscribe(headers['last-event-id'] ?? null);
    return { raw: sseStream(sub, x.sse) };
  }),
];
