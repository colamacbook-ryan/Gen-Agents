import type { StreamEvent } from '@ga/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef } from 'react';
import { isApiError } from './error.ts';
import { useOptionalApi } from './query.tsx';
import { connectStream } from './stream.ts';

type Listener = (event: StreamEvent) => void;
interface Hub {
  subscribe(listener: Listener): () => void;
}
const HubContext = createContext<Hub | null>(null);

/**
 * Mở luồng SSE `/stream` khi gắn (vỏ đã đăng nhập) và đóng khi gỡ; mỗi sự kiện làm hết đúng truy vấn liên quan (INVALIDATIONS) và còn tới
 * các màn đăng ký qua `useStreamEvents` (chat nhận `chat.delta`, lưới nhận `grid.changed`). Không có lớp API (test) ⇒ chỉ render con.
 */
export function LiveStreamProvider({ children }: { children: ReactNode }) {
  const api = useOptionalApi();
  const queryClient = useQueryClient();
  const listeners = useMemo(() => new Set<Listener>(), []);
  const hub = useMemo<Hub>(
    () => ({
      subscribe(l) {
        listeners.add(l);
        return () => {
          listeners.delete(l);
        };
      },
    }),
    [listeners],
  );
  useEffect(() => {
    if (!api) return;
    // một đợt máy chủ gián đoạn lặp lại cùng một lỗi mỗi lần nối lại: chỉ ghi lần đầu, ghi lại khi lỗi đổi hoặc sau khi nối được
    let lastKey: string | null = null;
    const stream = connectStream({
      queryClient,
      fetchImpl: api.fetchImpl,
      baseUrl: api.baseUrl,
      events: api.events,
      validate: api.validate,
      onEvent: (e) => {
        for (const l of [...listeners]) l(e);
      },
      onState: (state) => {
        if (state === 'open') lastKey = null;
      },
      onError: (e) => {
        const key = isApiError(e) ? `${e.code}:${e.httpStatus}` : String(e);
        if (key === lastKey) return;
        lastKey = key;
        console.error('luồng SSE lỗi', e);
      },
    });
    return () => stream.close();
  }, [api, queryClient, listeners]);
  return <HubContext.Provider value={hub}>{children}</HubContext.Provider>;
}

/** Nghe sự kiện SSE đã gõ kiểu trong vòng đời component (đăng ký một lần; luôn gọi bản `listener` mới nhất). */
export function useStreamEvents(listener: Listener): void {
  const hub = useContext(HubContext);
  const latest = useRef(listener);
  latest.current = listener;
  useEffect(() => hub?.subscribe((e) => latest.current(e)), [hub]);
}
