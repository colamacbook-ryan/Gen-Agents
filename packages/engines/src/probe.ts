import type {
  AuthMethod,
  CapabilityEntry,
  CapabilityScanInput,
  LoginArgvInput,
  LoginCheckResult,
  ProbeOutcome,
  ProbePlan,
  ProbePlanInput,
} from '@ga/contracts';
import { parseCapabilityKey } from './capabilities.ts';
import type { AccountLoginStatus } from './failover.ts';
import { clip } from './text.ts';
import type { EngineAdapterExt } from './types.ts';

// Probe (BUILD-PLAN §B.7, STD-10, CNS-168): điều phối kế hoạch kiểm đăng nhập / quét khả năng của adapter qua một bộ thực
// thi được tiêm vào (ga-runner trong container: HOME tmpfs + auth-gc). Không tự chạy tiến trình, không ghi DB: người gọi
// ghi probe_runs, capabilities, engine_accounts.login_status / account_hint.

/** Bộ thực thi một ProbePlan (ga-runner login-check / probe; test: CLI giả hoặc fixture). */
export type PlanExecutor = (plan: ProbePlan) => Promise<ProbeOutcome>;

/** login_status ghi vào DB sau một lần kiểm (không bao giờ 'in_progress' — trạng thái đó do luồng PTY đặt). */
export type ProbeLoginStatus = Exclude<AccountLoginStatus, 'in_progress'>;

export interface LoginProbeOutcome {
  result: LoginCheckResult;
  /**
   * Đầu ra của kiểm đăng nhập: đã đăng nhập / hết hạn / lỗi / chưa xác định (+ bị khoá nếu CLI báo).
   * `logged_out` (CLI báo cần đăng nhập) ⇒ 'expired' = "cần đăng nhập lại" [ĐỀ XUẤT — L-ENG; DB không có 'logged_out'].
   */
  loginStatus: ProbeLoginStatus;
  /** = probe_runs.status. */
  probeStatus: 'ok' | 'failed';
  error: string | null;
}

function synthetic(error: unknown): ProbeOutcome {
  const message = error instanceof Error ? error.message : String(error);
  return {
    kind: 'cli',
    exitCode: null,
    signal: null,
    stdout: '',
    stderr: clip(message),
    timedOut: false,
    durationMs: 0,
  };
}

/** Lỗi kỹ thuật khi chạy lệnh kiểm (không phải câu trả lời của CLI). */
function execBroken(o: ProbeOutcome): boolean {
  if (o.kind !== 'cli') return o.timedOut || o.status === null;
  return o.timedOut || o.signal !== null || o.exitCode === null || o.exitCode !== 0;
}

/**
 * Đọc kết quả kiểm đăng nhập (control plane đọc RunnerReport — không dựng plan). `execError`: bộ thực thi ném lỗi
 * (container mất, exec hỏng) ⇒ trạng thái lỗi, có ghi lý do.
 */
export function interpretLoginCheck(
  adapter: EngineAdapterExt,
  authMethod: AuthMethod,
  outcome: ProbeOutcome,
  execError: string | null = null,
): LoginProbeOutcome {
  const result = adapter.parseLoginCheck(authMethod, outcome);
  let loginStatus: ProbeLoginStatus;
  switch (result.status) {
    case 'logged_in':
      loginStatus = 'logged_in';
      break;
    case 'logged_out':
    case 'expired':
      loginStatus = 'expired';
      break;
    case 'suspended':
      loginStatus = 'suspended';
      break;
    case 'unknown':
      // CLI trả lời mà adapter không nhận ra ⇒ chưa xác định; chạy hỏng (exec lỗi, hết giờ, bị giết, thoát ≠ 0) ⇒ lỗi.
      loginStatus = execError !== null || execBroken(outcome) ? 'error' : 'unknown';
      break;
  }
  // account_hint chỉ ghi ở lần đạt (G-23); adapter đã che.
  const accountHint = loginStatus === 'logged_in' ? result.accountHint : null;
  return {
    result: { ...result, accountHint },
    loginStatus,
    probeStatus: loginStatus === 'error' ? 'failed' : 'ok',
    error: execError,
  };
}

/** Phía ga-runner: dựng plan kiểm đăng nhập, chạy qua bộ thực thi tiêm vào, rồi đọc kết quả. */
export async function runLoginCheck(
  adapter: EngineAdapterExt,
  input: LoginArgvInput & ProbePlanInput,
  exec: PlanExecutor,
): Promise<LoginProbeOutcome> {
  const { plan } = adapter.loginCheck(input);
  try {
    return interpretLoginCheck(adapter, input.authMethod, await exec(plan));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return interpretLoginCheck(adapter, input.authMethod, synthetic(e), clip(`exec: ${message}`));
  }
}

export interface CapabilityScanOutcome {
  entries: CapabilityEntry[];
  cliVersion: string | null;
  /** 'untested' ⇒ cờ "chưa kiểm tương thích" (§B.7); 'unknown' khi không đọc được version. */
  compatibility: 'tested' | 'untested' | 'unknown';
  /** Cờ turnPlan cần mà `--help` không có (chỉ tính khi đọc được danh sách cờ). */
  missingTurnFlags: string[];
  /** = probe_runs.status: ok (mọi giá trị biết), partial (có unknown), failed (không đọc được version). */
  probeStatus: 'ok' | 'partial' | 'failed';
  errors: string[];
}

export async function runCapabilityScan(
  adapter: EngineAdapterExt,
  input: CapabilityScanInput & ProbePlanInput,
  exec: PlanExecutor,
): Promise<CapabilityScanOutcome> {
  const plans = adapter.capabilityScan(input);
  const outcomes: ProbeOutcome[] = [];
  const errors: string[] = [];
  // Tuần tự: CLI có thể ghi trạng thái dùng chung trong HOME; số lệnh nhỏ.
  for (const [i, plan] of plans.entries()) {
    try {
      outcomes.push(await exec(plan));
    } catch (e) {
      errors.push(clip(`exec #${i}: ${e instanceof Error ? e.message : String(e)}`));
      outcomes.push(synthetic(e));
    }
  }
  const entries = adapter.parseCapabilitiesFor(outcomes, input);
  const versionEntry = entries.find((e) => parseCapabilityKey(e.key)?.kind === 'version');
  const cliVersion =
    versionEntry?.valueState === 'known' && typeof versionEntry.value === 'string' ? versionEntry.value : null;
  const knownFlags = new Set(
    entries
      .filter((e) => e.valueState === 'known' && parseCapabilityKey(e.key)?.kind === 'flag')
      .map((e) => parseCapabilityKey(e.key)?.itemKey ?? ''),
  );
  const missingTurnFlags = knownFlags.size > 0 ? adapter.requiredTurnFlags.filter((f) => !knownFlags.has(f)) : [];
  const compatibility =
    cliVersion === null
      ? 'unknown'
      : adapter.testedVersions.includes(cliVersion) && missingTurnFlags.length === 0
        ? 'tested'
        : 'untested';
  const probeStatus =
    cliVersion === null ? 'failed' : entries.some((e) => e.valueState === 'unknown') ? 'partial' : 'ok';
  return { entries, cliVersion, compatibility, missingTurnFlags, probeStatus, errors };
}

/**
 * Token prompt ĐO THẬT của một lượt (cổng Cấp thẻ, CNS-154; `tokenizer='measured:<engine>'`): input + cache đọc + cache ghi.
 * Mọi thành phần null ⇒ null ("chưa đo được", không đoán).
 */
export function measuredPromptTokens(usage: {
  input: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
}): number | null {
  const parts = [usage.input, usage.cacheRead, usage.cacheWrite];
  if (parts.every((p) => p === null)) return null;
  return parts.reduce<number>((s, p) => s + (p ?? 0), 0);
}
