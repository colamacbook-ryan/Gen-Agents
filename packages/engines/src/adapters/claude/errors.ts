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

export interface ClaudeSignals {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  /** Dòng `result` cuối cùng (nếu có). */
  resultSeen: boolean;
  resultIsError: boolean;
  resultSubtype: string | null;
  /** `result.api_error_status`, hoặc mã HTTP trong chuỗi "API Error: <mã>". */
  httpStatus: number | null;
  /** Trường `error` của dòng `assistant` cuối (vd 'rate_limit', 'authentication_failed') — chưa kiểm (CC-E07). */
  assistantError: string | null;
  rateLimitStatus: string | null;
  rateLimitResetsAt: string | null;
  /** Văn bản lỗi đã hạ chữ thường, chặn độ dài: result.result + stderr. */
  text: string;
}

const API_ERROR_PREFIX = 'api error:';

function statusFromText(text: string): number | null {
  const i = text.indexOf(API_ERROR_PREFIX);
  if (i < 0) return null;
  const m = /^\s*(\d{3})\b/.exec(text.slice(i + API_ERROR_PREFIX.length, i + API_ERROR_PREFIX.length + 8));
  return m ? Number(m[1]) : null;
}

/** Mốc reset dạng "…limit reached|<giây Unix>" trong văn bản (CC-E03, chưa kiểm). */
function resetFromText(text: string): string | null {
  const i = text.indexOf('|');
  if (i < 0) return null;
  const m = /^(\d{9,11})\b/.exec(text.slice(i + 1, i + 13));
  return m ? epochSecondsToDb(Number(m[1])) : null;
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
        rateLimitResetsAt = epochSecondsToDb(info.resetsAt);
      }
    }
  }
  const resultText = result === null ? null : str(result.result);
  const text = haystack(resultText, tail(stderr, MAX_CLASSIFY_STDERR_CHARS));
  const apiStatus = result === null ? null : result.api_error_status;
  return {
    exitCode: exit.exitCode,
    signal: exit.signal,
    timedOut: exit.timedOut,
    resultSeen: result !== null,
    resultIsError: result !== null && result.is_error === true,
    resultSubtype: result === null ? null : str(result.subtype),
    httpStatus: typeof apiStatus === 'number' && Number.isInteger(apiStatus) ? apiStatus : statusFromText(text),
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
    source: `HTTP 429 / "usage limit reached" / assistant.error=rate_limit: ${UNVERIFIED}`,
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
  const resetAt = rule.outcome === 'quota_exhausted' ? (s.rateLimitResetsAt ?? resetFromText(s.text)) : null;
  const classification: TurnClassification = {
    outcome: rule.outcome,
    resetAt,
    detail: rule.outcome === 'ok' ? null : detailOf(rule.id, s),
  };
  return { classification, ruleId: rule.id };
}
