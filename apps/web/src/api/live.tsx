import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useOptionalApi } from './query.tsx';
import { connectStream, type EventStream } from './stream.ts';

/**
 * Mở luồng SSE `/stream` khi component gắn (vỏ đã đăng nhập) và đóng khi gỡ. Không có lớp API (test) ⇒ không làm gì.
 * `resync` / sự kiện đọc lại cache qua `connectStream`; lỗi luồng báo console (không nuốt).
 */
export function useLiveStream(onStream?: (stream: EventStream) => void): void {
  const api = useOptionalApi();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!api) return;
    const stream = connectStream({
      queryClient,
      events: api.events,
      validate: api.validate,
      onError: (e) => console.error('luồng SSE lỗi', e),
    });
    onStream?.(stream);
    return () => stream.close();
  }, [api, queryClient, onStream]);
}
