import type { ErrorCode } from '@ga/contracts';

export interface FakeErrorDetail {
  reason?: string;
  field?: string;
  gate?: string;
  attemptsLeft?: number;
  retryAfterS?: number;
  position?: number;
}

/** Một lỗi HTTP có chủ đích của backend giả: `throw new FakeHttpError('conflict')` ⇒ thân lỗi đúng hợp đồng + mã HTTP của `API_ERROR_HTTP`. */
export class FakeHttpError extends Error {
  readonly code: ErrorCode;
  readonly detail: FakeErrorDetail | undefined;
  constructor(code: ErrorCode, detail?: FakeErrorDetail) {
    super(`fake:${code}`);
    this.name = 'FakeHttpError';
    this.code = code;
    this.detail = detail;
  }
}

/** Route chưa có fixture: ném lỗi to (không im lặng trả dữ liệu rỗng) để người dựng màn biết cần thêm fixture. */
export class FakeBackendError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'FakeBackendError';
  }
}

/** Fixture sai hợp đồng (request mẫu hoặc response không qua schema): ném NGAY, không gửi dữ liệu sai cho giao diện. */
export class FakeFixtureError extends FakeBackendError {
  constructor(routeId: string, what: 'request' | 'response', cause: unknown) {
    super(`fixture ${routeId}: ${what} không khớp schema hợp đồng`, { cause });
    this.name = 'FakeFixtureError';
  }
}
