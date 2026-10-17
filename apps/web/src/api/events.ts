// Kênh sự kiện của client API: lớp dữ liệu không biết router / modal; vỏ app đăng ký nghe và quyết định hiển thị.
//   unauthorized     — 401 trên route cần phiên ⇒ vỏ chuyển về G1 (đăng nhập)
//   recovery_blocked — 423 `recovery.blocked` ⇒ vỏ hiện O4 (màn O4 do L-S1 làm)
export type ClientEvent =
  | { type: 'unauthorized'; routeId: string }
  | { type: 'recovery_blocked'; routeId: string; requestId?: string };

export type ClientEventListener = (event: ClientEvent) => void;

export interface ClientEvents {
  emit(event: ClientEvent): void;
  subscribe(listener: ClientEventListener): () => void;
}

export function createClientEvents(): ClientEvents {
  const listeners = new Set<ClientEventListener>();
  return {
    emit(event) {
      for (const l of [...listeners]) {
        // một bên nghe lỗi không được làm hỏng lỗi gốc đang trả cho người gọi, cũng không chặn bên nghe khác
        try {
          l(event);
        } catch (err) {
          console.error('bên nghe sự kiện client API ném lỗi', err);
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
