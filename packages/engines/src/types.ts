import type {
  AuthMethod,
  CapabilityEntry,
  CapabilityScanInput,
  EngineAdapter,
  ExecResult,
  LoginCheckResult,
  ProbeOutcome,
  TurnClassification,
  TurnOutcome,
  TurnPlan,
  TurnPlanInput,
  TurnStreamEvent,
} from '@ga/contracts';
import type { EnvSpec } from './env.ts';

// Phần mở rộng của EngineAdapter trong packages/engines (KHÔNG thuộc contracts — đề xuất đưa vào contracts ở PR "contract").
// Mọi thứ ở đây vẫn là dữ liệu / hàm thuần, không I/O — import được trong ga-runner.

/** Mức bằng chứng của một luật (lỗi, đăng nhập, cấu hình): chỉ `observed` là đã thấy output thật của CLI (Spike 1b). */
export type Evidence = 'observed' | 'partial' | 'assumed';

/** Một luật ánh xạ lỗi → lý do. Mọi luật `assumed` / `partial` có ID trong ASSUMPTIONS.md, chờ Spike 1c (M6). */
export interface ErrorRule<S> {
  readonly id: string;
  readonly outcome: TurnOutcome;
  readonly evidence: Evidence;
  /** Nguồn bằng chứng, hoặc "chưa kiểm, Spike 1c (M6)". */
  readonly source: string;
  match(signals: S): boolean;
}

export type ErrorRuleInfo = Pick<ErrorRule<unknown>, 'id' | 'outcome' | 'evidence' | 'source'>;

export interface DetailedClassification {
  classification: TurnClassification;
  /** ID luật đã khớp (để audit / test); luật dự phòng cuối cùng cũng có ID. */
  ruleId: string;
}

/** Nền tảng cài: kiến trúc theo `process.arch` của Node, libc của image runtime (Debian bookworm = glibc). */
export interface InstallPlatform {
  readonly arch: 'x64' | 'arm64';
  readonly libc: 'glibc' | 'musl';
  /** Khoá nền tảng của hãng (tên trong manifest / URL). */
  readonly key: string;
}

/**
 * Công thức cài từ nguồn chính chủ, dạng DỮ LIỆU (tuần tự hoá được) cho ga-engine-install. Template dùng `{platform}`,
 * `{version}`. Đề xuất: InstallSpec của contracts có thêm `platforms` (arch) — hiện contracts chưa có trường arch.
 */
export interface InstallRecipe {
  /** Tên tệp CLI trong `/opt/engines/<slug>/current/`. */
  readonly binaryName: string;
  readonly platforms: readonly InstallPlatform[];
  readonly manifest:
    | {
        /** Một manifest cho mỗi nền tảng: JSON phẳng có version / url / checksum. */
        readonly kind: 'per-platform';
        readonly urlTemplate: string;
        readonly fields: { readonly version: string; readonly url: string; readonly checksum: string };
      }
    | {
        /** Con trỏ phiên bản mới nhất + một manifest cho mỗi phiên bản: `platforms[<platform>].checksum`. */
        readonly kind: 'versioned';
        readonly latestUrl: string;
        readonly urlTemplate: string;
        readonly checksumPath: readonly string[];
        readonly binaryUrlTemplate: string;
      };
  readonly payload: { readonly kind: 'raw' } | { readonly kind: 'tar.gz'; readonly member: string };
  /** Ngày kiểm nguồn cài bằng GET chỉ đọc (không chạy trình cài). */
  readonly verifiedAt: string;
}

export interface TurnPlanInputExt extends TurnPlanInput {
  /** Trần thời gian lượt; thiếu thì dùng DEFAULT_TURN_TIMEOUT_MS (đề xuất đưa vào contracts TurnPlanInput). */
  timeoutMs?: number;
  /** Cách đăng nhập của tài khoản (API key cần cấu hình riêng ở một số CLI); thiếu = 'subscription'. */
  authMethod?: AuthMethod;
}

/**
 * Pha của lượt cho avatar / sessions.phase: 'planning' trước sự kiện công cụ đầu tiên, 'acting' sau đó.
 * null = CLI không cho tín hiệu để tách ⇒ "chưa đo được" (avatar hiện 'run', PS §4.7 luật 4).
 */
export type TurnPhase = 'planning' | 'acting';

/** Adapter đo được tín hiệu nào từ output (CNS-168): 'stream' = tách từ stream; 'unmeasured' = chưa đo được (Spike 1c, M6). */
export interface OutputSignals {
  readonly phase: 'stream' | 'unmeasured';
  /** Nhãn "chưa chắc" (chat_messages.certainty): không CLI nào in sẵn ⇒ lấy từ tool report_task / câu trả lời (G-13). */
  readonly certainty: 'unmeasured';
}

/** Parser có trạng thái cho một lượt: một dòng có thể sinh nhiều sự kiện; nhớ tên công cụ theo callId. */
export interface TurnLineParser {
  push(line: string): TurnStreamEvent[];
  /** Pha hiện tại (null khi adapter không tách được pha). */
  readonly phase: TurnPhase | null;
  readonly stats: { readonly lines: number; readonly droppedOversize: number; readonly unparsable: number };
}

export interface EngineAdapterExt extends EngineAdapter {
  readonly install: InstallRecipe;
  /** argv[0] của mọi plan: `/opt/engines/<slug>/current/<binaryName>`. */
  readonly binaryPath: string;
  /** Bảng env ĐÓNG có mẫu giá trị chặt (flagTable.env = đúng các tên này); runner chỉ đặt env theo bảng. */
  readonly envTable: readonly EnvSpec[];
  /** Cờ turnPlan dùng (⊆ flagTable.flags); thiếu trong `--help` đã quét ⇒ "chưa kiểm tương thích" (STD-10 §4). */
  readonly requiredTurnFlags: readonly string[];
  /** Tên env CLI đọc API key (runner đọc bí mật từ tệp mount rồi đặt env cho tiến trình con, không qua Docker env). */
  readonly apiKeyEnvName: string | null;
  turnPlan(input: TurnPlanInputExt): TurnPlan;
  /** Như parseStreamLine nhưng trả MỌI sự kiện của dòng (contracts chỉ cho một — đề xuất đổi ở contracts). */
  parseStreamLineAll(line: string): TurnStreamEvent[];
  createLineParser(): TurnLineParser;
  classifyDetailed(
    exit: Pick<ExecResult, 'exitCode' | 'signal' | 'timedOut'>,
    stdout: string,
    stderr: string,
  ): DetailedClassification;
  /**
   * Đọc kết quả kiểm đăng nhập KHÔNG cần dựng plan (control plane đọc RunnerReport; chỉ runner được gọi loginCheck —
   * lint engine-plans-only-in-runner).
   */
  parseLoginCheck(authMethod: AuthMethod, outcome: ProbeOutcome): LoginCheckResult;
  /** parseCapabilities biết authMode thật (để gắn authMode cho giá trị phụ thuộc đăng nhập). */
  parseCapabilitiesFor(outcomes: readonly ProbeOutcome[], input: CapabilityScanInput): CapabilityEntry[];
  /** Danh sách luật lỗi (để test "đủ lý do" + audit bằng chứng). */
  readonly errorRules: readonly ErrorRuleInfo[];
  readonly outputSignals: OutputSignals;
}
