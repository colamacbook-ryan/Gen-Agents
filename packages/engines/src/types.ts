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

/**
 * Phần nguồn cài contracts CHƯA có (InstallSpec chỉ có origin / checksum / platforms / egressDomains): cách lấy manifest + dạng
 * gói, đã GET kiểm. Dữ liệu tuần tự hoá được cho ga-engine-install (L-RT). Template dùng `{platform}` (= InstallPlatform.key),
 * `{version}`. [Đề xuất L0 đưa vào InstallSpec nếu cần — L-ENG.]
 */
export interface InstallSource {
  /** Tên tệp CLI trong `/opt/engines/<slug>/current/`. */
  readonly binaryName: string;
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

/**
 * Cơ chế giới hạn công cụ của lượt (sandbox-parity, review bảo mật 2026-10-16): chỉ công cụ của MCP server gateway được
 * chạy; công cụ dựng sẵn (shell, đọc / ghi tệp…) bị từ chối. turnPlan CHỈ dựng plan khi mọi cờ của cơ chế có trong bảng
 * năng lực đã quét (`detectedFlags`); thiếu ⇒ TurnPlanError('engine_unrestricted') — fail-closed. Cờ của cơ chế luôn có
 * trong argv: CLI không hiểu cờ thì tự từ chối chạy (không bao giờ chạy không giới hạn).
 */
export interface ToolRestriction {
  /** Cờ của cơ chế (⊆ requiredTurnFlags ⊆ flagTable). */
  readonly requiredFlags: readonly string[];
  readonly evidence: Evidence;
  /** Nguồn / ID giả định (ASSUMPTIONS.md). */
  readonly source: string;
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
  readonly installSource: InstallSource;
  /** argv[0] của mọi plan: `/opt/engines/<slug>/current/<binaryName>`. */
  readonly binaryPath: string;
  /** Bảng env ĐÓNG có mẫu giá trị chặt (flagTable.env = đúng các tên này); runner chỉ đặt env theo bảng. */
  readonly envTable: readonly EnvSpec[];
  /** Cờ turnPlan dùng (⊆ flagTable.flags); thiếu trong `--help` đã quét ⇒ "chưa kiểm tương thích" (STD-10 §4). */
  readonly requiredTurnFlags: readonly string[];
  /** Cơ chế giới hạn công cụ; null = CLI không có cơ chế đã biết ⇒ không bao giờ dựng plan lượt. */
  readonly toolRestriction: ToolRestriction | null;
  /** Tên env CLI đọc API key (runner đọc bí mật từ tệp mount rồi đặt env cho tiến trình con, không qua Docker env). */
  readonly apiKeyEnvName: string | null;
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
