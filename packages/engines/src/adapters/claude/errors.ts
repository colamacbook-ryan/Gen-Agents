import type { ExecResult, TurnClassification } from '@ga/contracts';
import {
  clip,
  epochSecondsToDb,
  haystack,
  includesAny,
  MAX_CLASSIFY_STDERR_CHARS,
  MAX_CLASSIFY_STDOUT_CHARS,
  obj,
  parseJsonObject,
  splitLines,
  str,
  tail,
} from '../../text.ts';
import type { DetailedClassification, ErrorRule } from '../../types.ts';

// Bảng mã lỗi → lý do của Claude Code (BUILD-PLAN §B.5 bước 7). Nguồn sự thật duy nhất cho phân loại lượt của CLI này.
// ĐÃ THẤY (Spike 1b, claude 2.1.299): dòng `result` thành công {type:'result', subtype:'success', is_error:false,
// api_error_status:null, …} và `rate_limit_event` {rate_limit_info:{status:'allowed', resetsAt:<giây Unix>, …}}.
// MỌI dạng lỗi còn lại: chưa kiểm — suy từ hợp đồng HTTP của API hãng + chuỗi lỗi quen thuộc của CLI; kiểm thật ở M6
// (ID CC-E.. trong packages/engines/ASSUMPTIONS.md). Không có luật nào ở đây được coi là "đã chặn" trước M6.
//
// Chống "classification injection" (review bảo mật 2026-10-16, MEDIUM): câu trả lời của model / nội dung bị prompt injection
// không bao giờ được quyết định lý do lỗi.
//   - Ưu tiên trường CÓ CẤU TRÚC: is_error, subtype, api_error_status, assistant.error, rate_limit_event.
//   - Chỉ dò chữ khi đang ở trạng thái lỗi (result.is_error === true, hoặc không có result và mã thoát ≠ 0), và chỉ dò thông
//     điệp lỗi (result.result khi is_error) + stderr — không bao giờ dò nội dung trả lời (delta, assistant, result thành công).
//   - resetAt CHỈ lấy từ rate_limit_event status=rejected (giây Unix có cấu trúc). Không có ⇒ null (backoff mặc định).

export interface ClaudeSignals {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  /** Dòng `result` cuối cùng (nếu có). */
  resultSeen: boolean;
  resultIsError: boolean;
  resultSubtype: string | null;
  /** `result.api_error_status`, hoặc mã HTTP trong thông điệp lỗi "API Error: <mã>" (chỉ khi is_error). */
  httpStatus: number | null;
  /** Trường `error` của dòng `assistant` cuối (vd 'rate_limit', 'authentication_failed') — chưa kiểm (CC-E07). */
  assistantError: string | null;
  rateLimitStatus: string | null;
  rateLimitResetsAt: string | null;
  /** Thông điệp LỖI đã hạ chữ thường, chặn độ dài (rỗng khi không ở trạng thái lỗi) — không chứa nội dung trả lời. */
  text: string;
}

const API_ERROR_PREFIX = 'api error:';

function statusFromText(text: string): number | null {
  const i = text.indexOf(API_ERROR_PREFIX);
  if (i < 0) return null;
  const m = /^\s*(\d{3})\b/.exec(text.slice(i + API_ERROR_PREFIX.length, i + API_ERROR_PREFIX.length + 8));
  return m ? Number(m[1]) : null;
}

export function extractSignals(
  exit: Pick<ExecResult, 'exitCode' | 'signal' | 'timedOut'>,
  stdout: string,
  stderr: string,
): ClaudeSignals {
  let result: Record<string, unknown> | null = null;
  let assistantError: string | null = null;
  let rateLimitStatus: string | null = null;
  let rateLimitResetsAt: string | null = null;
  for (const raw of splitLines(tail(stdout, MAX_CLASSIFY_STDOUT_CHARS))) {
    const line = parseJsonObject(raw);
    if (line === null) continue;
    if (line.type === 'result') result = line;
    else if (line.type === 'assistant') {
      const e = str(line.error);
      if (e !== null) assistantError = e;
    } else if (line.type === 'rate_limit_event') {
      const info = obj(line.rate_limit_info);
      if (info !== null) {
        rateLimitStatus = str(info.status);
        // Giờ reset chỉ khi CLI báo BỊ CHẶN (rejected); sự kiện 'allowed' không phải giờ hết quota.
        rateLimitResetsAt = rateLimitStatus === 'rejected' ? epochSecondsToDb(info.resetsAt) : null;
      }
    }
  }
  const resultIsError = result !== null && result.is_error === true;
  // Trạng thái lỗi: result báo lỗi, hoặc CLI không ra result mà thoát ≠ 0 (lỗi cấp CLI, vd mất mạng trước khi gọi API).
  const errorState = resultIsError || (result === null && exit.exitCode !== null && exit.exitCode !== 0);
  const errorMessage = resultIsError ? str(result?.result) : null;
  const text = errorState ? haystack(errorMessage, tail(stderr, MAX_CLASSIFY_STDERR_CHARS)) : '';
  const apiStatus = result === null ? null : result.api_error_status;
  return {
    exitCode: exit.exitCode,
    signal: exit.signal,
    timedOut: exit.timedOut,
    resultSeen: result !== null,
    resultIsError,
    resultSubtype: result === null ? null : str(result.subtype),
    httpStatus:
      typeof apiStatus === 'number' && Number.isInteger(apiStatus)
        ? apiStatus
        : resultIsError
          ? statusFromText(text)
          : null,
    assistantError,
    rateLimitStatus,
    rateLimitResetsAt,
    text,
  };
}

const UNVERIFIED = 'chưa kiểm, M6 (buổi test chung)';
const OUTAGE_STATUSES = new Set([500, 502, 503, 504, 529]);

/** Thứ tự = độ ưu tiên: luật đầu tiên khớp thắng. Luật cuối luôn khớp (transient). */
export const ERROR_RULES: readonly ErrorRule<ClaudeSignals>[] = [
  {
    id: 'CC-E01',
    outcome: 'ok',
    evidence: 'observed',
    source: 'Spike 1b help-dumps/claude-stream-init.txt (result subtype=success, is_error=false)',
    match: (s) => s.exitCode === 0 && s.resultSeen && !s.resultIsError && s.resultSubtype === 'success',
  },
  {
    id: 'CC-E02',
    outcome: 'quota_exhausted',
    evidence: 'partial',
    source: `rate_limit_event đã thấy (status=allowed); status=rejected = hết cửa sổ quota: ${UNVERIFIED}`,
    match: (s) => s.rateLimitStatus === 'rejected',
  },
  {
    id: 'CC-E03',
    outcome: 'quota_exhausted',
    evidence: 'assumed',
    source: `HTTP 429 / assistant.error=rate_limit / thông điệp lỗi "usage limit reached" (chỉ khi is_error): ${UNVERIFIED}`,
    match: (s) =>
      s.httpStatus === 429 ||
      s.assistantError === 'rate_limit' ||
      includesAny(s.text, ['usage limit reached', 'rate_limit_error', 'rate limit exceeded']),
  },
  {
    id: 'CC-E04',
    outcome: 'quota_exhausted',
    evidence: 'assumed',
    source: `assistant.error=billing_error / "credit balance is too low": ${UNVERIFIED}`,
    match: (s) => s.assistantError === 'billing_error' || s.text.includes('credit balance is too low'),
  },
  {
    id: 'CC-E05',
    outcome: 'account_suspended',
    evidence: 'assumed',
    source: `HTTP 403 / "account has been disabled|suspended": ${UNVERIFIED}`,
    match: (s) =>
      s.httpStatus === 403 ||
      includesAny(s.text, ['account has been disabled', 'organization has been disabled', 'account is suspended']),
  },
  {
    id: 'CC-E06',
    outcome: 'login_expired',
    evidence: 'assumed',
    source: `"OAuth token has expired" / "token has been revoked": ${UNVERIFIED}`,
    match: (s) => includesAny(s.text, ['oauth token has expired', 'token has expired', 'token has been revoked']),
  },
  {
    id: 'CC-E07',
    outcome: 'AUTH_REQUIRED',
    evidence: 'assumed',
    source: `"Not logged in" / "Invalid API key · Please run /login": ${UNVERIFIED}`,
    match: (s) => includesAny(s.text, ['not logged in', 'please run /login', 'invalid api key']),
  },
  {
    id: 'CC-E08',
    outcome: 'login_expired',
    evidence: 'assumed',
    source: `HTTP 401 / assistant.error=authentication_failed / authentication_error: ${UNVERIFIED}`,
    match: (s) =>
      s.httpStatus === 401 || s.assistantError === 'authentication_failed' || s.text.includes('authentication_error'),
  },
  {
    id: 'CC-E09',
    outcome: 'outage',
    evidence: 'assumed',
    source: `HTTP 5xx / 529 overloaded / assistant.error=server_error / lỗi mạng: ${UNVERIFIED}`,
    match: (s) =>
      (s.httpStatus !== null && OUTAGE_STATUSES.has(s.httpStatus)) ||
      s.assistantError === 'server_error' ||
      includesAny(s.text, [
        'overloaded_error',
        'internal server error',
        'econnrefused',
        'econnreset',
        'enotfound',
        'etimedout',
        'connection error',
      ]),
  },
  {
    id: 'CC-E10',
    outcome: 'transient',
    evidence: 'observed',
    source: 'runner: hết thời gian / bị dừng bằng tín hiệu, không có dấu hiệu nào ở trên',
    match: (s) => s.timedOut || s.signal !== null,
  },
  {
    id: 'CC-E11',
    outcome: 'transient',
    evidence: 'assumed',
    source: 'dự phòng: lỗi không phân loại được (không đoán là sự cố hãng)',
    match: () => true,
  },
];

function detailOf(ruleId: string, s: ClaudeSignals): string {
  const bits = [ruleId, `exit=${s.exitCode ?? 'null'}`];
  if (s.httpStatus !== null) bits.push(`http=${s.httpStatus}`);
  if (s.resultSubtype !== null && s.resultSubtype !== 'success') bits.push(`subtype=${s.resultSubtype}`);
  if (s.assistantError !== null) bits.push(`error=${s.assistantError}`);
  if (s.timedOut) bits.push('timeout');
  if (s.signal !== null) bits.push(`signal=${s.signal}`);
  return clip(bits.join(' '));
}

export function classifyDetailed(
  exit: Pick<ExecResult, 'exitCode' | 'signal' | 'timedOut'>,
  stdout: string,
  stderr: string,
): DetailedClassification {
  const s = extractSignals(exit, stdout, stderr);
  const rule = ERROR_RULES.find((r) => r.match(s)) ?? (ERROR_RULES[ERROR_RULES.length - 1] as ErrorRule<ClaudeSignals>);
  // resetAt chỉ từ trường có cấu trúc (rate_limit_event rejected); chữ tự do không bao giờ đặt giờ reset.
  const resetAt = rule.outcome === 'quota_exhausted' ? s.rateLimitResetsAt : null;
  const classification: TurnClassification = {
    outcome: rule.outcome,
    resetAt,
    detail: rule.outcome === 'ok' ? null : detailOf(rule.id, s),
  };
  return { classification, ruleId: rule.id };
}
