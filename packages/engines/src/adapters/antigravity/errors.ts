import type { ExecResult, TurnClassification } from '@ga/contracts';
import {
  clip,
  haystack,
  includesAny,
  MAX_CLASSIFY_STDERR_CHARS,
  MAX_CLASSIFY_STDOUT_CHARS,
  parseJsonObject,
  splitLines,
  str,
  tail,
} from '../../text.ts';
import type { DetailedClassification, ErrorRule } from '../../types.ts';

// Bảng mã lỗi → lý do của Antigravity CLI (BUILD-PLAN §B.5 bước 7: "giả định cho tới Spike 1c, nằm ở
// packages/engines/src/adapters/antigravity/errors.ts"). Đây là nguồn sự thật duy nhất của phân loại lượt agy.
// ĐÃ THẤY (Spike 1b, agy 1.3.5, chưa đăng nhập): mã thoát 0 ok · 1 xác thực / không thấy agent · 2 sai cách dùng cờ ·
// 3 lỗi model / agent giữa chừng; stdout là một dòng JSON {status:"ERROR", error:"authentication failed or timed out"};
// stderr có dòng `AGY_ERROR: {short_error, status, error_code, code_kind, retryable, error_id}` (key sai ⇒ exit 3,
// status INVALID_ARGUMENT, error_code 400, reason API_KEY_INVALID). Bị `timeout` giết vẫn in JSON lỗi trước khi chết.
// MỌI ánh xạ khác (401/403/429/5xx, giờ reset quota): chưa kiểm, Spike 1c (M6) — ID AGY-E.. trong ASSUMPTIONS.md.

export interface AgySignals {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  /** `status` của dòng JSON cuối có trường status ("SUCCESS" / "ERROR"). */
  jsonStatus: string | null;
  /** `AGY_ERROR.error_code` (HTTP khi code_kind = 'http'). */
  errorCode: number | null;
  /** `AGY_ERROR.status` (dạng gRPC: INVALID_ARGUMENT, UNAUTHENTICATED, …). */
  rpcStatus: string | null;
  /** `AGY_ERROR.code_kind` ('http' đã thấy; 'network' / 'decode' / 'timeout': giả định của CLI giả). */
  codeKind: string | null;
  retryable: boolean | null;
  /** Văn bản lỗi đã hạ chữ thường, chặn độ dài: json.error + AGY_ERROR.short_error + stderr. */
  text: string;
}

const AGY_ERROR_PREFIX = 'AGY_ERROR:';

export function extractSignals(
  exit: Pick<ExecResult, 'exitCode' | 'signal' | 'timedOut'>,
  stdout: string,
  stderr: string,
): AgySignals {
  let json: Record<string, unknown> | null = null;
  for (const raw of splitLines(tail(stdout, MAX_CLASSIFY_STDOUT_CHARS))) {
    const line = parseJsonObject(raw);
    if (line !== null && typeof line.status === 'string') json = line;
  }
  const errTail = tail(stderr, MAX_CLASSIFY_STDERR_CHARS);
  let agyError: Record<string, unknown> | null = null;
  for (const raw of splitLines(errTail)) {
    const t = raw.trimStart();
    if (!t.startsWith(AGY_ERROR_PREFIX)) continue;
    const parsed = parseJsonObject(t.slice(AGY_ERROR_PREFIX.length));
    if (parsed !== null) agyError = parsed;
  }
  const code = agyError?.error_code;
  const retryable = agyError?.retryable;
  return {
    exitCode: exit.exitCode,
    signal: exit.signal,
    timedOut: exit.timedOut,
    jsonStatus: json === null ? null : str(json.status),
    errorCode: typeof code === 'number' && Number.isInteger(code) ? code : null,
    rpcStatus: agyError === null ? null : str(agyError.status),
    codeKind: agyError === null ? null : str(agyError.code_kind),
    retryable: typeof retryable === 'boolean' ? retryable : null,
    text: haystack(
      json === null ? null : str(json.error),
      agyError === null ? null : str(agyError.short_error),
      errTail,
    ),
  };
}

const SPIKE_1C = 'chưa kiểm, Spike 1c (M6)';

/** Thứ tự = độ ưu tiên: luật đầu tiên khớp thắng. Luật cuối luôn khớp (transient). */
export const ERROR_RULES: readonly ErrorRule<AgySignals>[] = [
  {
    id: 'AGY-E01',
    outcome: 'ok',
    evidence: 'partial',
    source: `exit 0 + status "SUCCESS" (đã thấy ở lệnh /usage chế độ API key); lượt chat thành công: ${SPIKE_1C}`,
    match: (s) => s.exitCode === 0 && s.jsonStatus === 'SUCCESS',
  },
  {
    id: 'AGY-E02',
    outcome: 'AUTH_REQUIRED',
    evidence: 'observed',
    source:
      'Spike 1b agy-print-nologin*.out / agy-p-status.out: error "authentication failed or timed out" (exit 1, hoặc bị timeout giết)',
    match: (s) =>
      s.jsonStatus === 'ERROR' &&
      includesAny(s.text, [
        'authentication failed',
        'authentication timed out',
        'authentication interrupted',
        'authentication required',
      ]),
  },
  {
    id: 'AGY-E03',
    outcome: 'AUTH_REQUIRED',
    evidence: 'observed',
    source: 'Spike 1b agy-print-fakekey.*: exit 3, AGY_ERROR reason API_KEY_INVALID (key sai)',
    match: (s) => s.text.includes('api_key_invalid') || s.text.includes('api key not valid'),
  },
  {
    id: 'AGY-E04',
    outcome: 'login_expired',
    evidence: 'assumed',
    source: `AGY_ERROR error_code 401 / status UNAUTHENTICATED: ${SPIKE_1C}`,
    match: (s) => s.errorCode === 401 || s.rpcStatus === 'UNAUTHENTICATED',
  },
  {
    id: 'AGY-E05',
    outcome: 'account_suspended',
    evidence: 'assumed',
    source: `AGY_ERROR error_code 403 / PERMISSION_DENIED (PS §8.4: báo cáo bị cấm 403 từ 02/2026): ${SPIKE_1C}`,
    match: (s) => s.errorCode === 403 || s.rpcStatus === 'PERMISSION_DENIED',
  },
  {
    id: 'AGY-E06',
    outcome: 'quota_exhausted',
    evidence: 'assumed',
    source: `AGY_ERROR error_code 429 / RESOURCE_EXHAUSTED / "quota": ${SPIKE_1C}; giờ reset: chưa biết dạng ⇒ null`,
    match: (s) =>
      s.errorCode === 429 ||
      s.rpcStatus === 'RESOURCE_EXHAUSTED' ||
      includesAny(s.text, ['quota exceeded', 'resource_exhausted', 'rate limit']),
  },
  {
    id: 'AGY-E07',
    outcome: 'outage',
    evidence: 'assumed',
    source: `AGY_ERROR error_code 5xx / UNAVAILABLE / INTERNAL: ${SPIKE_1C}`,
    match: (s) =>
      (s.errorCode !== null && s.errorCode >= 500 && s.errorCode <= 599) ||
      s.rpcStatus === 'UNAVAILABLE' ||
      s.rpcStatus === 'INTERNAL',
  },
  {
    id: 'AGY-E12',
    outcome: 'outage',
    evidence: 'assumed',
    source: `mất mạng tới hãng (PS §8.4: outage = lỗi mạng hoặc 5xx): code_kind network / "no such host" / "connection refused": ${SPIKE_1C}`,
    match: (s) =>
      s.codeKind === 'network' ||
      includesAny(s.text, ['no such host', 'connection refused', 'network is unreachable', 'i/o timeout']),
  },
  {
    id: 'AGY-E08',
    outcome: 'transient',
    evidence: 'observed',
    source:
      'Spike 1b (changelog + đo): exit 2 = sai cách dùng cờ ⇒ CLI lệch phiên bản; quét lại khả năng, không fallback',
    match: (s) => s.exitCode === 2,
  },
  {
    id: 'AGY-E09',
    outcome: 'transient',
    evidence: 'assumed',
    source: `AGY_ERROR retryable=true / DEADLINE_EXCEEDED: ${SPIKE_1C}`,
    match: (s) => s.retryable === true || s.rpcStatus === 'DEADLINE_EXCEEDED',
  },
  {
    id: 'AGY-E10',
    outcome: 'transient',
    evidence: 'observed',
    source: 'runner: hết thời gian / bị dừng bằng tín hiệu, không có dấu hiệu nào ở trên',
    match: (s) => s.timedOut || s.signal !== null,
  },
  {
    id: 'AGY-E11',
    outcome: 'transient',
    evidence: 'assumed',
    source: 'dự phòng: lỗi không phân loại được (không đoán là sự cố hãng)',
    match: () => true,
  },
];

function detailOf(ruleId: string, s: AgySignals): string {
  const bits = [ruleId, `exit=${s.exitCode ?? 'null'}`];
  if (s.errorCode !== null) bits.push(`code=${s.errorCode}`);
  if (s.rpcStatus !== null) bits.push(`status=${s.rpcStatus}`);
  if (ruleId === 'AGY-E08') bits.push('cli_usage_error');
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
  const rule = ERROR_RULES.find((r) => r.match(s)) ?? (ERROR_RULES[ERROR_RULES.length - 1] as ErrorRule<AgySignals>);
  const classification: TurnClassification = {
    outcome: rule.outcome,
    // Giờ reset quota của agy: dạng chưa biết (`/usage` groups[] chưa thấy) ⇒ không đoán (PS §8.4).
    resetAt: null,
    detail: rule.outcome === 'ok' ? null : detailOf(rule.id, s),
  };
  return { classification, ruleId: rule.id };
}
