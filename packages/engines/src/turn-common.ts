import {
  EFFORT_RE,
  ENGINE_UNRESTRICTED_REASON,
  ENGINES_ROOT,
  type EngineFlagTable,
  EnginePlan,
  engineArgvViolations,
  engineEnvViolations,
  MODEL_ID_RE,
  type ProbePlanInput,
  TURN_EXEC,
  type TurnPlanFile,
  type TurnPlanInput,
} from '@ga/contracts';
import { assertEnvTable, assertPlanEnv, type EnvSpec, EnvTableError } from './env.ts';
import type { ToolRestriction } from './types.ts';

// Phần dùng chung khi dựng EnginePlan (§B.5 bước 4, CNS-168): kiểm đầu vào, argv chỉ từ BẢNG CỜ ĐÓNG của adapter,
// chặn tiêm cờ qua giá trị, cấu hình MCP trỏ gateway. Hàm thuần — chạy được trong ga-runner (chỉ phụ thuộc contracts).

export class TurnPlanError extends Error {
  readonly code:
    | 'invalid_path'
    | 'invalid_gateway_url'
    | 'invalid_model'
    | 'invalid_effort'
    | 'invalid_value'
    | 'flag_not_in_table'
    | 'subcommand_not_in_table'
    | 'empty_prompt'
    | 'prompt_too_large'
    | 'system_prompt_too_large'
    | 'invalid_timeout'
    | 'plan_policy_violation'
    | typeof ENGINE_UNRESTRICTED_REASON;
  constructor(code: TurnPlanError['code'], message: string) {
    super(message);
    this.name = 'TurnPlanError';
    this.code = code;
  }
}

/** Trần cứng an toàn của một lượt; giá trị thật = TurnPlanInput.timeoutMs (= TurnBundle.timeoutMs, từ setting — GEN-06). */
export const MAX_TURN_TIMEOUT_MS = 60 * 60_000;
/** Linux giới hạn MỘT đối số argv ở 128 KiB (MAX_ARG_STRLEN); chừa biên. */
export const MAX_PROMPT_ARG_BYTES = 120 * 1024;
export const MAX_SYSTEM_PROMPT_BYTES = 24 * 1024;

/** Tên MCP server của gateway trong cấu hình CLI (công cụ hiện dạng `mcp__<tên>__<tool>` ở một số CLI). */
export const GATEWAY_MCP_SERVER = 'ga';

/**
 * Đường tuyệt đối của CLI trong volume ga-engines (mount chỉ đọc): `/opt/engines/<slug>/current/<binary>`.
 * `current` = liên kết tới thư mục phiên bản đang dùng, do ga-engine-install giữ (L-RT) [ĐỀ XUẤT — L-ENG].
 */
export function engineBinaryPath(slug: string, binaryName: string): string {
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(slug) || !/^[a-z][a-z0-9-]{0,31}$/.test(binaryName)) {
    throw new TurnPlanError('invalid_path', 'slug / tên binary không hợp lệ');
  }
  return `${ENGINES_ROOT}/${slug}/current/${binaryName}`;
}

/**
 * Cầu MCP stdio ⇄ Streamable HTTP do ga-runner cung cấp (L-RT): đọc vé từ tệp tmpfs và gắn header khi gọi gateway,
 * nên cấu hình MCP của CLI KHÔNG chứa vé (contracts TurnPlanInput.ticketFile; CNS-142). [ĐỀ XUẤT — L-ENG, cần L-RT]
 */
export function mcpBridgeCommand(input: Pick<TurnPlanInput, 'gatewayUrl' | 'ticketFile'>): {
  command: string;
  args: string[];
} {
  const runner = TURN_EXEC.argv[0];
  return { command: runner, args: ['mcp-bridge', '--url', input.gatewayUrl, '--ticket-file', input.ticketFile] };
}

// ---------------------------------------------------------------- argv từ bảng đóng (contracts EngineFlagTable)
/**
 * Dựng argv: argv[0] = binary của engine; lệnh con chỉ liền sau argv[0]; cờ PHẢI nằm trong bảng adapter khai với đúng loại
 * (`switch` không nhận giá trị, `value` nhận giá trị); giá trị dạng `split` không bắt đầu bằng `-`, không xuống dòng;
 * không giá trị nào chứa NUL; văn bản tự do (prompt) luôn đứng cuối và không bao giờ bắt đầu bằng `-`.
 * Kế hoạch cuối còn qua engineArgvViolations của contracts (planKit.plan) — hai lớp, cùng một bảng.
 */
export class ArgvBuilder {
  private readonly out: string[];
  private readonly table: EngineFlagTable;
  private flagsStarted = false;
  private sealed = false;

  constructor(binaryPath: string, table: EngineFlagTable) {
    this.out = [binaryPath];
    this.table = table;
  }

  private open(): void {
    if (this.sealed) throw new TurnPlanError('invalid_value', 'văn bản tự do phải đứng cuối argv');
  }

  private kind(flag: string): 'switch' | 'value' {
    const k = Object.hasOwn(this.table.flags, flag) ? this.table.flags[flag] : undefined;
    if (k === undefined) throw new TurnPlanError('flag_not_in_table', `cờ ngoài bảng của adapter: ${flag}`);
    return k;
  }

  sub(word: string): this {
    this.open();
    if (this.flagsStarted || !this.table.subcommands.includes(word)) {
      throw new TurnPlanError('subcommand_not_in_table', `lệnh con ngoài bảng / sai vị trí: ${word}`);
    }
    this.out.push(word);
    return this;
  }

  flag(flag: string): this {
    this.open();
    if (this.kind(flag) !== 'switch') throw new TurnPlanError('invalid_value', `cờ ${flag} cần giá trị`);
    this.flagsStarted = true;
    this.out.push(flag);
    return this;
  }

  /** `eq`: `--cờ=giá-trị` (giá trị có thể là văn bản tự do, kể cả bắt đầu bằng `-`); `split`: hai đối số. */
  value(flag: string, value: string, form: 'eq' | 'split'): this {
    this.open();
    if (this.kind(flag) !== 'value') throw new TurnPlanError('invalid_value', `cờ ${flag} không nhận giá trị`);
    if (value === '' || value.includes('\0'))
      throw new TurnPlanError('invalid_value', `giá trị rỗng / có NUL: ${flag}`);
    if (form === 'split') {
      if (value.startsWith('-') || value.includes('\n')) {
        throw new TurnPlanError('invalid_value', `giá trị dạng cờ / nhiều dòng: ${flag}`);
      }
      this.out.push(flag, value);
    } else {
      if (!flag.startsWith('--')) throw new TurnPlanError('invalid_value', `dạng = chỉ cho cờ dài: ${flag}`);
      this.out.push(`${flag}=${value}`);
    }
    this.flagsStarted = true;
    return this;
  }

  /** Văn bản tự do (prompt) ở cuối argv: toán hạng trần, hoặc giá trị của một cờ `value` (vd `-p <prompt>`). */
  text(content: string, viaFlag?: string): this {
    this.open();
    if (content.includes('\0')) throw new TurnPlanError('invalid_value', 'văn bản có NUL');
    if (viaFlag !== undefined) {
      if (this.kind(viaFlag) !== 'value') throw new TurnPlanError('invalid_value', `cờ ${viaFlag} không nhận giá trị`);
      this.out.push(viaFlag);
    }
    this.out.push(safeOperand(content));
    this.sealed = true;
    return this;
  }

  build(): string[] {
    return [...this.out];
  }
}

export interface PlanKit {
  readonly slug: string;
  readonly binaryPath: string;
  argv(): ArgvBuilder;
  /** Dựng plan `cli` + kiểm chính sách contracts (argv, env) + bảng env có mẫu chặt + schema EnginePlan. */
  plan(plan: { files: TurnPlanFile[]; argv: string[]; env: Record<string, string>; timeoutMs: number }): EnginePlan;
  /** Kiểm một argv (vd đăng nhập PTY) theo cùng chính sách; vi phạm ⇒ ném. */
  checkedArgv(argv: string[]): string[];
}

/** Bộ dựng plan của một adapter: kiểm bảng env + bảng cờ lúc nạp module (sai ⇒ adapter không nạp được, fail-closed). */
export function planKit(spec: {
  slug: string;
  binaryName: string;
  flagTable: EngineFlagTable;
  envTable: readonly EnvSpec[];
}): PlanKit {
  assertEnvTable(spec.envTable);
  const names = spec.envTable.map((e) => e.name).sort();
  if (JSON.stringify(names) !== JSON.stringify([...spec.flagTable.env].sort())) {
    throw new EnvTableError('flagTable.env phải đúng bằng tên trong bảng env có mẫu');
  }
  for (const flag of Object.keys(spec.flagTable.flags)) {
    if (!/^--?[A-Za-z0-9][A-Za-z0-9-]*$/.test(flag))
      throw new TurnPlanError('invalid_value', `tên cờ sai dạng: ${flag}`);
  }
  const binaryPath = engineBinaryPath(spec.slug, spec.binaryName);
  const checkedArgv = (argv: string[]): string[] => {
    const v = engineArgvViolations(argv, spec.slug, spec.flagTable);
    if (v.length > 0) throw new TurnPlanError('plan_policy_violation', v.join('; '));
    return argv;
  };
  return {
    slug: spec.slug,
    binaryPath,
    argv: () => new ArgvBuilder(binaryPath, spec.flagTable),
    checkedArgv,
    plan(plan) {
      checkedArgv(plan.argv);
      const v = engineEnvViolations(plan.env, spec.flagTable);
      if (v.length > 0) throw new TurnPlanError('plan_policy_violation', v.join('; '));
      try {
        assertPlanEnv(spec.envTable, plan.env);
      } catch (e) {
        throw new TurnPlanError('plan_policy_violation', e instanceof Error ? e.message : String(e));
      }
      return EnginePlan.parse({ kind: 'cli', ...plan });
    },
  };
}

/** Văn bản đặt vào argv không bao giờ bắt đầu bằng `-` (bộ parse cờ sẽ hiểu nhầm là cờ): thêm một dòng trống phía trước. */
export function safeOperand(text: string): string {
  return text.startsWith('-') ? `\n${text}` : text;
}

// ---------------------------------------------------------------- kiểm đầu vào
const utf8 = new TextEncoder();

/** Số byte UTF-8 có vượt `limit` không — chặn theo số code unit trước để khỏi mã hoá chuỗi khổng lồ. */
function exceedsBytes(s: string, limit: number): boolean {
  if (s.length > limit) return true; // mỗi code unit ≥ 1 byte
  if (s.length * 3 <= limit) return false; // mỗi code unit ≤ 3 byte
  return utf8.encode(s).length > limit;
}

function isAbsClean(p: string): boolean {
  return p.startsWith('/') && !p.split('/').includes('..') && !p.includes('\0') && !p.includes('\n');
}

/** Đường tương đối của `inner` trong `outer` (đều tuyệt đối, sạch); không nằm trong ⇒ lỗi. */
export function relativeInside(outer: string, inner: string): string {
  const o = outer.endsWith('/') ? outer.slice(0, -1) : outer;
  const i = inner.endsWith('/') ? inner.slice(0, -1) : inner;
  if (!i.startsWith(`${o}/`) || i.length === o.length + 1) {
    throw new TurnPlanError('invalid_path', 'homeDir / ticketFile phải nằm trong thư mục tmpfs của lần chạy');
  }
  return i.slice(o.length + 1);
}

/**
 * Fail-closed (sandbox-parity): chỉ cho dựng plan lượt khi adapter có cơ chế giới hạn công cụ VÀ mọi cờ của cơ chế có trong
 * bảng năng lực đã quét. Không có ⇒ ném engine_unrestricted (runner không chạy lượt, báo lý do).
 */
export function assertToolRestriction(
  restriction: ToolRestriction | null,
  detectedFlags: readonly string[] | undefined,
): ToolRestriction {
  if (restriction === null) {
    throw new TurnPlanError(
      ENGINE_UNRESTRICTED_REASON,
      'CLI không có cơ chế giới hạn công cụ đã biết — không chạy lượt',
    );
  }
  if (detectedFlags === undefined) {
    throw new TurnPlanError(
      ENGINE_UNRESTRICTED_REASON,
      'thiếu bảng năng lực đã quét (detectedFlags) — không chạy lượt',
    );
  }
  const missing = restriction.requiredFlags.filter((f) => !detectedFlags.includes(f));
  if (missing.length > 0) {
    throw new TurnPlanError(ENGINE_UNRESTRICTED_REASON, `CLI đã quét thiếu cờ giới hạn công cụ: ${missing.join(', ')}`);
  }
  return restriction;
}

export interface CheckedTurnInput {
  prompt: string;
  systemPrompt: string | null;
  model: string | null;
  effort: string | null;
  timeoutMs: number;
  /** homeDir tương đối turnDir (vd `home`) — tệp ghi vào HOME đi qua TurnPlanFile.path. */
  homeRel: string;
  turnDir: string;
}

export function checkTurnInput(input: TurnPlanInput): CheckedTurnInput {
  for (const p of [input.turnDir, input.homeDir, input.ticketFile, input.authDir]) {
    if (!isAbsClean(p)) throw new TurnPlanError('invalid_path', 'đường dẫn phải tuyệt đối và không chứa ..');
  }
  const homeRel = relativeInside(input.turnDir, input.homeDir);
  relativeInside(input.turnDir, input.ticketFile);
  // Tệp prompt (contracts: dưới /run/ga/<turn>/prompt/) — adapter hiện đặt prompt vào argv, vẫn kiểm đường cho chắc.
  for (const f of [input.promptFile, input.systemPromptFile]) {
    if (f === null) continue;
    if (!isAbsClean(f)) throw new TurnPlanError('invalid_path', 'tệp prompt phải tuyệt đối và không chứa ..');
    relativeInside(input.turnDir, f);
  }
  let url: URL;
  try {
    url = new URL(input.gatewayUrl);
  } catch {
    throw new TurnPlanError('invalid_gateway_url', 'gatewayUrl không phải URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TurnPlanError('invalid_gateway_url', 'gatewayUrl phải là http(s)');
  }
  // Cùng mẫu với TurnParams của contracts (runner đã kiểm bundle; adapter kiểm lại vì giá trị vào argv).
  if (input.model !== null && !MODEL_ID_RE.test(input.model)) {
    throw new TurnPlanError('invalid_model', 'model không đúng mẫu');
  }
  if (input.effort !== null && !EFFORT_RE.test(input.effort)) {
    throw new TurnPlanError('invalid_effort', 'effort không đúng mẫu');
  }
  if (input.prompt.trim().length === 0) throw new TurnPlanError('empty_prompt', 'prompt rỗng');
  if (exceedsBytes(input.prompt, MAX_PROMPT_ARG_BYTES)) {
    throw new TurnPlanError('prompt_too_large', `prompt > ${MAX_PROMPT_ARG_BYTES} byte (argv): compiler phải rút gọn`);
  }
  if (input.systemPrompt !== null && exceedsBytes(input.systemPrompt, MAX_SYSTEM_PROMPT_BYTES)) {
    throw new TurnPlanError('system_prompt_too_large', `systemPrompt > ${MAX_SYSTEM_PROMPT_BYTES} byte`);
  }
  const timeoutMs = input.timeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10_000 || timeoutMs > MAX_TURN_TIMEOUT_MS) {
    throw new TurnPlanError('invalid_timeout', 'timeoutMs phải trong [10 s, 60 phút]');
  }
  const systemPrompt = input.systemPrompt !== null && input.systemPrompt.trim() !== '' ? input.systemPrompt : null;
  const turnDir = input.turnDir.endsWith('/') ? input.turnDir.slice(0, -1) : input.turnDir;
  return { prompt: input.prompt, systemPrompt, model: input.model, effort: input.effort, timeoutMs, homeRel, turnDir };
}

/** Kiểm đầu vào kế hoạch kiểm đăng nhập / quét (CNS-168); trả HOME tương đối probeDir. */
export function checkProbeInput(input: ProbePlanInput): { homeRel: string } {
  for (const p of [input.probeDir, input.homeDir, input.authDir]) {
    if (!isAbsClean(p)) throw new TurnPlanError('invalid_path', 'đường dẫn phải tuyệt đối và không chứa ..');
  }
  return { homeRel: relativeInside(input.probeDir, input.homeDir) };
}
