import {
  type AuthMethod,
  type CapabilityEntry,
  type CapabilityScanInput,
  type EngineFlagTable,
  type ExecResult,
  type LoginArgvInput,
  type LoginCheck,
  type LoginCheckResult,
  NATIVE_MEMORY_POLICY,
  type ProbeOutcome,
  type ProbePlan,
  type ProbePlanInput,
  type TurnPlan,
  type TurnPlanFile,
} from '@ga/contracts';
import {
  ANY_ITEM,
  cliResult,
  execFailureReason,
  helpCapabilities,
  known,
  ran,
  UNKNOWN_REQUIRES_LOGIN,
  unknown,
  versionCapability,
} from '../../capabilities.ts';
import { API_KEY_VALUE_RE, type EnvSpec } from '../../env.ts';
import { clip, head, MAX_PROBE_TEXT_CHARS, obj, parseJsonObject, splitLines } from '../../text.ts';
import {
  type ArgvBuilder,
  assertToolRestriction,
  checkProbeInput,
  checkTurnInput,
  GATEWAY_MCP_SERVER,
  mcpBridgeCommand,
  planKit,
} from '../../turn-common.ts';
import type { EngineAdapterExt, InstallRecipe, ToolRestriction, TurnPlanInputExt } from '../../types.ts';
import { AdapterError } from '../errors-common.ts';
import { classifyDetailed, ERROR_RULES } from './errors.ts';
import { createParser, parseLineAll } from './parser.ts';

// Adapter Antigravity CLI (`agy`). Nguồn sự thật: Spike 1b (01-projects/gen-agents/spikes/spike1b-antigravity/:
// REPORT, install-notes, help-dumps, probe.py — agy 1.3.5, CHƯA đăng nhập) + trang cài chính chủ (GET 2026-10-16).
// Mọi hành vi SAU đăng nhập chưa kiểm (Spike 1c, M6) — ID AGY-* trong packages/engines/ASSUMPTIONS.md.

const BIN = 'agy';
const SLUG = 'antigravity';
/** Thư mục cấu hình của CLI dưới HOME (Spike 1b: tài liệu đi kèm + lần chạy đầu tạo thư mục này dưới HOME giả). */
const CONFIG_DIR = '.gemini/antigravity-cli';
/** Tệp chỉ dẫn trong cwd (Spike 1b: tài liệu đi kèm rules.md — GEMINI.md / AGENTS.md, ≤ 24 KB mỗi tệp). */
const INSTRUCTION_FILE = 'GEMINI.md';
/**
 * Tệp cấu hình MCP dưới CONFIG_DIR, dạng phẳng `{<tên>: {type, command, args, env}}` như `mcp add` ghi — thống nhất với CLI
 * giả (testing/fakes AG-MCP-1). Vị trí + dạng thật ở chế độ `-p`: CHƯA KIỂM (AGY-MCP-01, Spike 1c) — chỉ cần đổi ở đây.
 */
const MCP_CONFIG_FILE = 'mcp_servers.json';

/** Nguồn cài chính chủ — GET kiểm 2026-10-16: install.sh → manifest theo nền tảng {version, url, sha512}, gói tar.gz. */
const INSTALL: InstallRecipe = {
  binaryName: BIN,
  platforms: [
    { arch: 'x64', libc: 'glibc', key: 'linux_amd64' },
    { arch: 'arm64', libc: 'glibc', key: 'linux_arm64' },
    { arch: 'x64', libc: 'musl', key: 'linux_amd64_musl' },
    { arch: 'arm64', libc: 'musl', key: 'linux_arm64_musl' },
  ],
  manifest: {
    kind: 'per-platform',
    urlTemplate: 'https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/{platform}.json',
    fields: { version: 'version', url: 'url', checksum: 'sha512' },
  },
  // install.sh: url có ".tar.gz" ⇒ giải nén tệp `antigravity`; không thì tệp nhị phân trần.
  payload: { kind: 'tar.gz', member: 'antigravity' },
  verifiedAt: '2026-10-16',
};

/** Cờ turnPlan dùng — đều có trong `agy --help` 1.3.5 (Spike 1b; test đối chiếu fixture). */
const REQUIRED_TURN_FLAGS = [
  '-p',
  '--output-format',
  '--print-timeout',
  '--disable-slash-commands',
  '--model',
  '--effort',
  '--allowed-tools',
] as const;

/**
 * Giới hạn công cụ (sandbox-parity với claude, review bảo mật 2026-10-16): agy 1.3.5 KHÔNG có cờ nào tương đương (help Spike 1b
 * chỉ có --mode / --sandbox / --dangerously-skip-permissions). Cơ chế dưới đây là GIẢ ĐỊNH (AGY-T03): `--allowed-tools
 * mcp__ga`, CLI giả khai để IT chạy được. agy thật chưa có cờ này trong --help đã quét ⇒ turnPlan ném engine_unrestricted
 * (không chạy lượt) tới khi Spike 1c (M6) xác nhận cơ chế thật — đúng chủ đích fail-closed.
 */
const TOOL_RESTRICTION: ToolRestriction = {
  requiredFlags: ['--allowed-tools'],
  evidence: 'assumed',
  source: 'AGY-T03: chưa kiểm, Spike 1c (M6) — agy 1.3.5 không có cờ giới hạn công cụ',
};

/** Bảng env ĐÓNG: chỉ API key (runner đọc từ tệp bí mật; Spike 1b: CLI đọc biến này). HOME / PATH / proxy do runner đặt. */
const ENV_TABLE: readonly EnvSpec[] = [
  { name: 'GEMINI_API_KEY', pattern: API_KEY_VALUE_RE, source: 'secret', purpose: 'API key (auth_method=api_key)' },
];

/** Bảng cờ ĐÓNG (contracts EngineFlagTable). `-p` nhận giá trị (prompt) — Spike 1b: cờ đứng sau prompt vẫn được đọc. */
const FLAG_TABLE: EngineFlagTable = {
  subcommands: ['models'],
  flags: {
    '-p': 'value',
    '--output-format': 'value',
    '--print-timeout': 'value',
    '--disable-slash-commands': 'switch',
    '--model': 'value',
    '--effort': 'value',
    '--allowed-tools': 'value',
    '--version': 'switch',
    '--help': 'switch',
  },
  env: ENV_TABLE.map((e) => e.name),
};

const KIT = planKit({ slug: SLUG, binaryName: BIN, flagTable: FLAG_TABLE, envTable: ENV_TABLE });

const SCAN_TIMEOUT_MS = 30_000;
const PRINT_TIMEOUT_MS = 90_000;
/** agy in JSON lỗi rồi thoát khi chạm --print-timeout; runner chỉ giết sau biên này (Spike 1b: mặc định không giới hạn). */
const PRINT_GRACE_MS = 10_000;

function argv(): ArgvBuilder {
  return KIT.argv();
}

function printTimeoutArg(timeoutMs: number): string {
  return `${Math.max(1, Math.floor((timeoutMs - PRINT_GRACE_MS) / 1000))}s`;
}

/** `-p` một câu, output JSON một dòng. Dạng cờ tách đối số như lúc đo ở Spike 1b. */
function printArgv(
  prompt: string,
  timeoutMs: number,
  opts: { slashCommands: boolean; format?: 'json' | 'stream-json'; extra?: (a: ArgvBuilder) => void },
): string[] {
  const a = argv()
    .value('--output-format', opts.format ?? 'json', 'split')
    .value('--print-timeout', printTimeoutArg(timeoutMs), 'split');
  if (!opts.slashCommands) a.flag('--disable-slash-commands');
  opts.extra?.(a);
  return a.text(prompt, '-p').build();
}

/** settings.json cho chế độ API key (Spike 1b: `{"modelProvider":"gemini"}` + env GEMINI_API_KEY). */
function apiKeySettingsFile(homeRel: string, apiKey: boolean): TurnPlanFile[] {
  if (!apiKey) return [];
  return [
    {
      path: `${homeRel}/${CONFIG_DIR}/settings.json`,
      content: JSON.stringify({ modelProvider: 'gemini' }),
      mode: 0o600,
    },
  ];
}

// ---------------------------------------------------------------- kiểm đăng nhập (§B.7)
function modelRows(stdout: string): Array<{ id: string; label: string }> {
  const rows: Array<{ id: string; label: string }> = [];
  for (const line of splitLines(head(stdout, MAX_PROBE_TEXT_CHARS))) {
    const tab = line.indexOf('\t');
    if (tab <= 0) continue;
    const id = line.slice(0, tab).trim();
    const label = line.slice(tab + 1).trim();
    if (/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(id)) rows.push({ id, label: label.slice(0, 200) });
  }
  return rows;
}

function lowerOutput(r: ExecResult): string {
  return `${head(r.stdout, MAX_PROBE_TEXT_CHARS)}\n${head(r.stderr, MAX_PROBE_TEXT_CHARS)}`.toLowerCase();
}

function parseModelsLoginCheck(o: ProbeOutcome): LoginCheckResult {
  const r = cliResult(o);
  if (!ran(r)) return { status: 'unknown', accountHint: null, detail: clip(execFailureReason(r)) };
  if (r.exitCode !== 0 && lowerOutput(r).includes('sign in')) {
    return { status: 'logged_out', accountHint: null, detail: null };
  }
  if (r.exitCode === 0 && modelRows(r.stdout).length > 0) {
    // Danh tính: CLI có in không — chưa kiểm (Spike 1c tiêu chí 5) ⇒ account_hint null, luật đổi danh tính chưa chạy (G-23).
    return {
      status: 'logged_in',
      accountHint: null,
      detail: 'AGY-L01: exit 0 + có danh sách model (chưa kiểm, Spike 1c)',
    };
  }
  return { status: 'unknown', accountHint: null, detail: clip(`models exit=${r.exitCode}, không nhận ra output`) };
}

function parsePrintLoginCheck(o: ProbeOutcome): LoginCheckResult {
  const r = cliResult(o);
  if (r === undefined) return { status: 'unknown', accountHint: null, detail: execFailureReason(r) };
  const { classification } = classifyDetailed(r, r.stdout, r.stderr);
  switch (classification.outcome) {
    case 'ok':
      return { status: 'logged_in', accountHint: null, detail: null };
    case 'AUTH_REQUIRED':
      return { status: 'logged_out', accountHint: null, detail: classification.detail };
    case 'login_expired':
      return { status: 'expired', accountHint: null, detail: classification.detail };
    case 'account_suspended':
      return { status: 'suspended', accountHint: null, detail: classification.detail };
    default:
      return { status: 'unknown', accountHint: null, detail: classification.detail };
  }
}

function parseLoginCheck(authMethod: AuthMethod, o: ProbeOutcome): LoginCheckResult {
  return authMethod === 'subscription' ? parseModelsLoginCheck(o) : parsePrintLoginCheck(o);
}

function loginCheck(input: LoginArgvInput & ProbePlanInput): LoginCheck {
  const { homeRel } = checkProbeInput(input);
  if (input.authMethod === 'subscription') {
    // §B.7: chưa đăng nhập ⇒ `models` thoát 1 "Please sign in" ngay (Spike 1b). Sau đăng nhập: chưa kiểm (AGY-L01).
    return {
      plan: KIT.plan({ files: [], argv: argv().sub('models').build(), env: {}, timeoutMs: SCAN_TIMEOUT_MS }),
      parse: parseModelsLoginCheck,
    };
  }
  // API key / ADC: `models` liệt kê catalog tĩnh kể cả với key giả (Spike 1b) ⇒ phải chạy một lượt -p nhỏ.
  return {
    plan: KIT.plan({
      files: apiKeySettingsFile(homeRel, input.authMethod === 'api_key'),
      argv: printArgv('Reply with OK', PRINT_TIMEOUT_MS, { slashCommands: false }),
      env: {},
      timeoutMs: PRINT_TIMEOUT_MS,
    }),
    parse: parsePrintLoginCheck,
  };
}

// ---------------------------------------------------------------- quét khả năng (§B.7, STD-10)
function capabilityScan(input: CapabilityScanInput & ProbePlanInput): readonly ProbePlan[] {
  const { homeRel } = checkProbeInput(input);
  const files = apiKeySettingsFile(homeRel, input.authMode === 'api_key');
  const plan = (args: string[], timeoutMs: number) => KIT.plan({ files, argv: args, env: {}, timeoutMs });
  const plans: ProbePlan[] = [
    plan(argv().flag('--version').build(), SCAN_TIMEOUT_MS),
    plan(argv().flag('--help').build(), SCAN_TIMEOUT_MS),
    // Chưa đăng nhập thì thoát 1 ngay (không treo) ⇒ luôn chạy để ghi unknown_requires_login có bằng chứng.
    plan(argv().sub('models').build(), SCAN_TIMEOUT_MS),
  ];
  // `-p /usage` khi chưa đăng nhập treo ở bước xác thực tới khi bị giết (Spike 1b) ⇒ chỉ chạy khi đã đăng nhập.
  // Lệnh slash ⇒ không tắt slash command ở plan này.
  if (input.authMode !== 'none') {
    plans.push(plan(printArgv('/usage', PRINT_TIMEOUT_MS, { slashCommands: true }), PRINT_TIMEOUT_MS));
  }
  return plans;
}

function usageUnknownReason(r: ExecResult | undefined): string {
  if (r === undefined) return execFailureReason(r);
  const json = parseJsonObject(r.stdout.trim());
  if (json === null) return ran(r) ? `unknown: /usage không ra JSON (exit=${r.exitCode})` : execFailureReason(r);
  if (json.status === 'ERROR') {
    return String(json.error ?? '').includes('authentication')
      ? UNKNOWN_REQUIRES_LOGIN
      : 'unknown: /usage trả lỗi (xem output thô)';
  }
  const groups = obj(obj(json.command)?.data)?.groups;
  if (Array.isArray(groups) && groups.length === 0) return 'unknown: /usage không có cửa sổ quota (chế độ API key)';
  return 'unknown: schema groups[] của /usage chưa kiểm (Spike 1c)';
}

function parseCapabilitiesFor(outcomes: readonly ProbeOutcome[], input: CapabilityScanInput): CapabilityEntry[] {
  const [ver, help, models, usage] = outcomes.map(cliResult);
  const authMode = input.authMode;
  const out: CapabilityEntry[] = [versionCapability(ver, `${BIN} --version`)];
  out.push(
    ...helpCapabilities(help, {
      source: `${BIN} --help`,
      lists: [
        ['effort', '--effort'],
        ['mode', '--mode'],
        ['output_format', '--output-format'],
      ],
      subcommandHeader: 'Available subcommands:',
    }),
  );

  // Model: `models` (TSV id<TAB>nhãn). Chế độ API key = catalog tĩnh trong binary (Spike 1b: key giả vẫn liệt kê).
  // OAuth: chưa kiểm là quyền thật hay catalog (AGY-MODELS-01) ⇒ giữ static_catalog tới Spike 1c (không trình bày như
  // "tài khoản dùng được").
  if (!ran(models)) {
    out.push(unknown('model', ANY_ITEM, execFailureReason(models), `${BIN} models`, authMode));
  } else {
    const rows = models.exitCode === 0 ? modelRows(models.stdout) : [];
    if (models.exitCode !== 0 && lowerOutput(models).includes('sign in')) {
      out.push(unknown('model', ANY_ITEM, UNKNOWN_REQUIRES_LOGIN, `${BIN} models`, authMode));
    } else if (rows.length === 0) {
      const reason = `unknown: models exit=${models.exitCode}, không có dòng TSV`;
      out.push(unknown('model', ANY_ITEM, reason, `${BIN} models`, authMode));
    } else {
      for (const row of rows) out.push(known('model', row.id, row.label, `${BIN} models`, 'static_catalog', authMode));
    }
  }

  // Quota: `-p /usage --output-format json` ⇒ {command:{name:'usage', data:{groups:[…]}}}. Schema groups[] chưa thấy
  // (Spike 1b: chế độ API key trả groups rỗng) ⇒ unknown kể cả khi có dữ liệu; output thô vào blob (AGY-USAGE-01).
  if (authMode === 'none' || outcomes.length < 4) {
    out.push(unknown('quota_window', ANY_ITEM, UNKNOWN_REQUIRES_LOGIN, `${BIN} -p /usage`, authMode));
  } else {
    out.push(unknown('quota_window', ANY_ITEM, usageUnknownReason(usage), `${BIN} -p /usage`, authMode));
  }
  return out;
}

// ---------------------------------------------------------------- lượt (§B.5)
function turnPlan(input: TurnPlanInputExt): TurnPlan {
  assertToolRestriction(TOOL_RESTRICTION, input.detectedFlags);
  const c = checkTurnInput(input);
  const bridge = mcpBridgeCommand(input);
  const files: TurnPlanFile[] = [
    // Cấu hình MCP trỏ gateway qua cầu stdio của ga-runner (không chứa vé). Vị trí + dạng: AGY-MCP-01 (chưa kiểm).
    {
      path: `${c.homeRel}/${CONFIG_DIR}/${MCP_CONFIG_FILE}`,
      content: JSON.stringify({
        [GATEWAY_MCP_SERVER]: { type: 'stdio', command: bridge.command, args: bridge.args, env: {} },
      }),
      mode: 0o400,
    },
    ...apiKeySettingsFile(c.homeRel, input.authMethod === 'api_key'),
  ];
  // Khối hệ thống vào GEMINI.md trong cwd (= tmpfs của lượt, ga-runner đặt cwd) — §B.5; ≤ 24 KB (checkTurnInput chặn).
  if (c.systemPrompt !== null) files.push({ path: INSTRUCTION_FILE, content: c.systemPrompt, mode: 0o400 });
  // stream-json theo schema thống nhất với CLI giả (AGY-STREAM-01 = AG-STREAM-1, chưa kiểm); parser vẫn đọc dạng json.
  const args = printArgv(c.prompt, c.timeoutMs, {
    slashCommands: false,
    format: 'stream-json',
    extra: (a) => {
      if (c.model !== null) a.value('--model', c.model, 'split');
      if (c.effort !== null) a.value('--effort', c.effort, 'split');
      // Chỉ công cụ của MCP server gateway (AGY-T03, giả định).
      a.value('--allowed-tools', `mcp__${GATEWAY_MCP_SERVER}`, 'split');
    },
  });
  return KIT.plan({ files, argv: args, env: {}, timeoutMs: c.timeoutMs });
}

function loginArgv(input: LoginArgvInput): readonly string[] {
  if (input.authMethod !== 'subscription') {
    throw new AdapterError('login_not_interactive', 'API key / ADC không đăng nhập qua PTY (lưu ở kho bí mật)');
  }
  // §B.6 + Spike 1b: không có lệnh con đăng nhập; chạy CLI tương tác, nó in URL OAuth và chờ dán mã ~60 s trên stdin.
  // Sau OAuth CLI có thể tiếp tục như agent ⇒ supervisor đóng exec theo 4 lý do (CNS-134).
  return KIT.checkedArgv(argv().build());
}

export const antigravityAdapter: EngineAdapterExt = {
  slug: SLUG,
  adapterVersion: '0.1.0',
  // Phiên bản có output thật làm fixture (Spike 1b). Trang cài đã lên 1.4.0 (2026-10-16) ⇒ cờ "chưa kiểm tương thích".
  testedVersions: ['1.3.5'],
  // Tên tệp credential sau OAuth: chưa thấy (Spike 1b chưa đăng nhập) ⇒ 'unknown': auth-gc không xoá gì,
  // sessions.native_memory='unknown', báo owner (DATABASE D18) — tới Spike 1c (AGY-A01).
  authAllowlist: 'unknown',
  // Tương đối HOME: lần chạy đầu tạo ~/.gemini/antigravity-cli/ (log/, cache/, conversation_summaries.db, updater/, …).
  nativeStatePaths: [CONFIG_DIR],
  nativeMemoryPolicy: NATIVE_MEMORY_POLICY,
  installSpec: {
    source: 'official',
    origin: 'https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests',
    checksum: { algorithm: 'sha512', from: 'manifest' },
    // Spike 1b: CLI có bộ tự cập nhật chạy nền (updater/update_status.json). Có chặn được khi mount chỉ đọc: Spike 1c.
    selfUpdate: 'enabled',
    // Manifest ở Cloud Run; gói tải (url trong manifest, 2026-10-16) ở storage.googleapis.com.
    egressDomains: ['antigravity-cli-auto-updater-974169037036.us-central1.run.app', 'storage.googleapis.com'],
  },
  install: INSTALL,
  binaryPath: KIT.binaryPath,
  flagTable: FLAG_TABLE,
  envTable: ENV_TABLE,
  requiredTurnFlags: REQUIRED_TURN_FLAGS,
  toolRestriction: TOOL_RESTRICTION,
  // Spike 1b: chạy với GEMINI_API_KEY=<giả> ⇒ API_KEY_INVALID (biến này được đọc).
  apiKeyEnvName: 'GEMINI_API_KEY',
  errorRules: ERROR_RULES,
  // Pha tách từ `tool_call` theo schema giả định AGY-STREAM-01 (Spike 1c); nhãn chưa chắc: chưa đo được.
  outputSignals: { phase: 'stream', certainty: 'unmeasured' },
  loginArgv,
  loginCheck,
  parseLoginCheck,
  capabilityScan,
  parseCapabilities: (outcomes) => parseCapabilitiesFor(outcomes, { authMode: 'unknown' }),
  parseCapabilitiesFor,
  parseStreamLine: (line) => parseLineAll(line)[0] ?? null,
  parseStreamLineAll: parseLineAll,
  createLineParser: createParser,
  classify: (exit, stdout, stderr) => classifyDetailed(exit, stdout, stderr).classification,
  classifyDetailed,
  turnPlan,
};
