// Token CSRF của phiên: chỉ trong bộ nhớ (không localStorage, không URL). Máy khách đăng nhập ghi vào; client API đọc ra.
export interface CsrfStore {
  get(): string | null;
  set(token: string | null): void;
}

export function createCsrfStore(): CsrfStore {
  let token: string | null = null;
  return {
    get: () => token,
    set(t) {
      token = t;
    },
  };
}
