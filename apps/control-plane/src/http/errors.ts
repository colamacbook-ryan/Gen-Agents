// Phong bì lỗi của API (BACKEND-TRIAL §3.0; contracts `ApiErrorEnvelope`): `{error: {code, i18nKey, requestId, detail?}}`.
//   - `detail` chỉ khoá enum / số (ErrorDetail strict) — KHÔNG chuỗi DB, stack, message của lỗi, giá trị request.
//   - HTTP status lấy từ MỘT nguồn: `httpStatusFor(code)` của contracts.
//   - Lỗi lạ ⇒ 500 `internal`, không lộ gì ngoài requestId; chi tiết (đã che) chỉ vào log.
//   - Thân lỗi cũng qua kiểm schema (strict) trước khi rời server; hỏng ⇒ phong bì `internal` tối thiểu.
import {
  ApiErrorEnvelope,
  type ErrorCode,
  type ErrorDetail,
  httpStatusFor,
  i18nKeyFor,
  TURN_REJECTIONS,
  TurnRejectedError,
} from '@ga/contracts';
import { DbRuleError, toDbRuleError } from '@ga/db/repos';
import { z } from 'zod';
import type { Logger } from './logger.ts';

export type ErrorDetailValue = z.infer<typeof ErrorDetail>;

/** Lỗi có chủ đích (handler / middleware ném): mã ổn định của contracts + `detail` đã chốt. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly detail: ErrorDetailValue | undefined;
  /** Header thêm (vd `retry-after`) — chỉ giá trị máy sinh, không dữ liệu người dùng. */
  readonly headers: Readonly<Record<string, string>>;
  constructor(code: ErrorCode, detail?: ErrorDetailValue, opts: { headers?: Record<string, string> } = {}) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.detail = detail;
    this.headers = opts.headers ?? {};
  }
}

export const notFound = (): ApiError => new ApiError('not_found');

export interface ErrorResult {
  status: number;
  body: ApiErrorEnvelope;
  headers: Record<string, string>;
}

function envelope(code: ErrorCode, requestId: string, detail?: ErrorDetailValue): ApiErrorEnvelope {
  const cleanDetail = Object.fromEntries(Object.entries(detail ?? {}).filter(([, v]) => v !== undefined));
  const body = {
    error: {
      code,
      i18nKey: i18nKeyFor(code),
      requestId,
      ...(Object.keys(cleanDetail).length > 0 ? { detail: cleanDetail } : {}),
    },
  };
  const parsed = ApiErrorEnvelope.safeParse(body);
  if (parsed.success) return parsed.data;
  // detail sai dạng ⇒ bỏ detail (không bao giờ gửi phong bì chưa qua schema)
  return { error: { code, i18nKey: i18nKeyFor(code), requestId } };
}

export function errorResult(code: ErrorCode, requestId: string, detail?: ErrorDetailValue): ErrorResult {
  return { status: httpStatusFor(code), body: envelope(code, requestId, detail), headers: {} };
}

const DETAIL_KEY_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const detailKey = (s: string): string | undefined => (DETAIL_KEY_RE.test(s) ? s : undefined);

/** Đường dẫn zod an toàn để log / trả client: chỉ đoạn là định danh ngắn; số ⇒ `[]`; còn lại ⇒ `<key>` (không lộ khoá lạ). */
export function safeZodPath(path: readonly PropertyKey[], maxSegments = 8): string {
  const out: string[] = [];
  for (const seg of path.slice(0, maxSegments)) {
    if (typeof seg === 'number') out.push('[]');
    else if (typeof seg === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(seg)) out.push(seg);
    else out.push('<key>');
  }
  if (path.length > maxSegments) out.push('…');
  return out.join('.');
}

/**
 * Lỗi bất kỳ ⇒ phong bì. Thứ tự: ApiError → DbRuleError (kể cả SqliteError chưa đổi) → TurnRejectedError → ZodError →
 * lạ (500). Mọi nhánh ghi log có cấu trúc (đã che); client chỉ nhận mã + detail cho phép.
 */
export function mapError(
  err: unknown,
  ctx: { requestId: string; routeId: string | null; logger: Logger },
): ErrorResult {
  const { requestId, routeId, logger } = ctx;
  if (err instanceof ApiError) {
    const r = errorResult(err.code, requestId, err.detail);
    r.headers = { ...err.headers };
    return r;
  }
  const db = toDbRuleError(err);
  if (db instanceof DbRuleError) {
    logger.log(db.code === 'internal' || httpStatusFor(db.code) >= 500 ? 'error' : 'warn', 'http.db_error', {
      requestId,
      routeId,
      rule: db.rule,
      code: db.code,
      // chuỗi gốc của SQLite chỉ vào log (logger che bí mật), không bao giờ ra client
      dbMessage: db.dbMessage,
    });
    // không lộ chi tiết của "không tìm thấy" / lỗi nội bộ (không có oracle tồn tại)
    const detail =
      db.code === 'not_found' || httpStatusFor(db.code) >= 500 ? undefined : { reason: detailKey(db.rule) };
    return errorResult(db.code, requestId, detail?.reason ? detail : undefined);
  }
  if (err instanceof TurnRejectedError && (TURN_REJECTIONS as readonly string[]).includes(err.reason)) {
    return errorResult('turn.rejected', requestId, { reason: err.reason });
  }
  if (err instanceof z.ZodError) {
    // zod ném từ TRONG handler (parse nội bộ): chỉ mã issue, không đường dẫn / giá trị
    const first = err.issues[0];
    logger.log('warn', 'http.handler_zod_error', {
      requestId,
      routeId,
      path: first ? safeZodPath(first.path) : null,
      issue: first?.code ?? null,
    });
    return errorResult('validation.failed', requestId, first ? { reason: detailKey(first.code) } : undefined);
  }
  logger.log('error', 'http.unhandled_error', { requestId, routeId, err });
  return errorResult('internal', requestId);
}
