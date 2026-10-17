import { ALL_ERROR_CODES, type ErrorCode, ErrorDetail, i18nKeyFor } from '@ga/contracts';
import type { I18n } from '@ga/i18n';
import { z } from 'zod';

/** Mã lỗi do chính client sinh (không phải mã của máy chủ). */
export type ClientErrorCode = 'network' | 'bad_response';

export type DetailParams = Readonly<Record<string, string | number>>;

export interface ApiErrorInit {
  code: ErrorCode | ClientErrorCode;
  httpStatus: number;
  /** khoá i18n của thông báo chính (từ máy chủ hoặc `errors.<mã>`) */
  i18nKey: string;
  requestId?: string;
  routeId?: string;
  detail?: z.infer<typeof ErrorDetail>;
  /** header Retry-After (giây) khi `detail.retryAfterS` thiếu */
  retryAfterS?: number;
}

/**
 * Lỗi của mọi lần gọi API. Giao diện KHÔNG đọc chữ từ máy chủ: chỉ `i18nKey` + `detailKey` + `detailParams` đi qua i18n
 * (`describeApiError`). `detailKey` = `errors.detail.<mã>.<reason>` (chỉ có khi máy chủ gửi `detail.reason`).
 */
export class ApiError extends Error {
  readonly code: ErrorCode | ClientErrorCode;
  readonly httpStatus: number;
  readonly i18nKey: string;
  readonly detailKey?: string;
  readonly detailParams: DetailParams;
  readonly requestId?: string;
  readonly routeId?: string;

  constructor(init: ApiErrorInit, options?: ErrorOptions) {
    // thông điệp chỉ cho log, không hiện ra giao diện
    super(`api:${init.routeId ?? '?'}:${init.code}`, options);
    this.name = 'ApiError';
    this.code = init.code;
    this.httpStatus = init.httpStatus;
    this.i18nKey = init.i18nKey;
    this.requestId = init.requestId;
    this.routeId = init.routeId;
    const d = init.detail;
    this.detailKey = d?.reason ? `errors.detail.${init.code}.${d.reason}` : undefined;
    const params: Record<string, string | number> = {};
    if (d?.reason) params.reason = d.reason;
    if (d?.field) params.field = d.field;
    if (d?.gate) params.gate = d.gate;
    if (d?.attemptsLeft !== undefined) params.attemptsLeft = d.attemptsLeft;
    if (d?.position !== undefined) params.position = d.position;
    const retry = d?.retryAfterS ?? init.retryAfterS;
    if (retry !== undefined) params.retryAfterS = retry;
    this.detailParams = params;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

const KNOWN_CODES: ReadonlySet<string> = new Set(ALL_ERROR_CODES);

// Đọc thân lỗi ĐỦ rộng (không strict): máy chủ mới thêm trường không làm hỏng việc hiển thị lỗi.
const envelope = z.object({
  error: z.object({
    code: z.string(),
    i18nKey: z.string().optional(),
    requestId: z.string().optional(),
    detail: ErrorDetail.optional().catch(undefined),
  }),
});

/** Thân lỗi HTTP → ApiError. Thân không đọc được / mã lạ ⇒ `bad_response` (không bịa chữ, không nuốt). */
export async function apiErrorFromResponse(res: Response, routeId: string): Promise<ApiError> {
  const retry = Number(res.headers.get('retry-after'));
  const retryAfterS = Number.isFinite(retry) && retry > 0 ? retry : undefined;
  let parsed: z.infer<typeof envelope> | null = null;
  try {
    const r = envelope.safeParse(await res.json());
    parsed = r.success ? r.data : null;
  } catch {
    parsed = null;
  }
  if (!parsed || !KNOWN_CODES.has(parsed.error.code)) {
    const internal = res.status >= 500;
    return new ApiError({
      code: internal ? 'internal' : 'bad_response',
      httpStatus: res.status,
      i18nKey: internal ? 'errors.internal' : 'errors.bad_response',
      routeId,
      retryAfterS,
    });
  }
  const code = parsed.error.code as ErrorCode;
  return new ApiError({
    code,
    httpStatus: res.status,
    i18nKey: parsed.error.i18nKey ?? i18nKeyFor(code),
    requestId: parsed.error.requestId,
    routeId,
    detail: parsed.error.detail,
    retryAfterS,
  });
}

export interface DescribedError {
  /** thông báo chính, đã dịch */
  message: string;
  /** dòng chi tiết đã dịch (lý do) — null nếu không có chuỗi riêng */
  detail: string | null;
  /** gợi ý (thử lại sau N giây, còn N lần thử) */
  hints: string[];
}

/** Dịch lỗi để hiện: khoá lạ ⇒ `errors.unknown` (i18n.tr báo onMissingKey), không bao giờ in khoá thô. */
export function describeApiError(i18n: I18n, error: unknown): DescribedError {
  if (!isApiError(error)) return { message: i18n.t('errors.unknown'), detail: null, hints: [] };
  const p = error.detailParams;
  const hints: string[] = [];
  if (typeof p.retryAfterS === 'number')
    hints.push(i18n.t('errors.hint.retry_after_s', { retryAfterS: p.retryAfterS }));
  if (typeof p.attemptsLeft === 'number')
    hints.push(i18n.t('errors.hint.attempts_left', { attemptsLeft: p.attemptsLeft }));
  return {
    message: i18n.tr(error.i18nKey, p),
    detail: error.detailKey && i18n.has(error.detailKey) ? i18n.tr(error.detailKey, p) : null,
    hints,
  };
}
