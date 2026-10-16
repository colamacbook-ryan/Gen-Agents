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
  type TurnPlanInput,
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
import { clip, maskAccountHint, parseJsonObject, str } from '../../text.ts';
import {
  type ArgvBuilder,
  assertToolRestriction,
  checkProbeInput,
  checkTurnInput,
  GATEWAY_MCP_SERVER,
  mcpBridgeCommand,
  planKit,
} from '../../turn-common.ts';
import type { EngineAdapterExt, InstallSource, ToolRestriction } from '../../types.ts';
import { AdapterError } from '../errors-common.ts';
import { classifyDetailed, ERROR_RULES } from './errors.ts';
import { createParser, parseLineAll } from './parser.ts';

// Adapter Claude Code (`claude`). Hàm thuần: dựng EnginePlan (argv / tệp / env), parse output. Không chạy tiến trình.
// Bằng chứng: Spike 1b (claude 2.1.299: --help, -p "/model", -p "/usage", stream-json, auth status) và trang tải chính chủ
// (GET chỉ đọc 2026-10-16). Điểm chưa kiểm: ID CC-* trong packages/engines/ASSUMPTIONS.md.

const BIN = 'claude';
const SLUG = 'claude-code';
const MCP_CONFIG_FILE = 'mcp.json';

/** Nguồn cài chính chủ — đã GET kiểm 2026-10-16: https://claude.ai/install.sh → bootstrap của downloads.claude.ai. */
const INSTALL_SOURCE: InstallSource = {
  binaryName: BIN,
  manifest: {
    kind: 'versioned',
    latestUrl: 'https://downloads.claude.ai/claude-code-releases/latest',
    urlTemplate: 'https://downloads.claude.ai/claude-code-releases/{version}/manifest.json',
    checksumPath: ['platforms', '{platform}', 'checksum'],
    binaryUrlTemplate: 'https://downloads.claude.ai/claude-code-releases/{version}/{platform}/claude',
  },
  payload: { kind: 'raw' },
  verifiedAt: '2026-10-16',
};

/** Cờ turnPlan dùng — đều có trong `--help` 2.1.299 (Spike 1b; test đối chiếu fixture). */
const REQUIRED_TURN_FLAGS = [
  '-p',
  '--output-format',
  '--verbose',
  '--include-partial-messages',
  '--no-session-persistence',
  '--strict-mcp-config',
  '--mcp-config',
  '--permission-mode',
  '--allowedTools',
  '--disable-slash-commands',
  '--model',
  '--effort',
  '--append-system-prompt',
] as const;

/**
 * Bảng env ĐÓNG (runner chỉ đặt env theo bảng; HOME / PATH / proxy do runner + egress đặt).
 * DISABLE_AUTOUPDATER: chặn tự cập nhật vào volume chỉ đọc — biến theo tài liệu hãng, chưa kiểm với 2.1.299 (CC-I02).
 * ANTHROPIC_API_KEY: chỉ khi tài khoản dùng API key; runner đọc từ tệp bí mật, không nằm trong plan.
 */
const ENV_TABLE: readonly EnvSpec[] = [
  { name: 'DISABLE_AUTOUPDATER', pattern: /^1$/, source: 'plan', purpose: 'tắt tự cập nhật (CC-I02)' },
  { name: 'ANTHROPIC_API_KEY', pattern: API_KEY_VALUE_RE, source: 'secret', purpose: 'API key (auth_method=api_key)' },
];

/** Bảng cờ ĐÓNG (contracts EngineFlagTable): mọi lệnh con / cờ adapter được đặt vào argv. */
const FLAG_TABLE: EngineFlagTable = {
  subcommands: ['auth', 'status', 'login'],
  flags: {
    '-p': 'switch',
    '--output-format': 'value',
    '--verbose': 'switch',
    '--include-partial-messages': 'switch',
    '--no-session-persistence': 'switch',
    '--strict-mcp-config': 'switch',
    '--mcp-config': 'value',
    '--permission-mode': 'value',
    '--allowedTools': 'value',
    '--disable-slash-commands': 'switch',
    '--model': 'value',
    '--effort': 'value',
    '--append-system-prompt': 'value',
    '--version': 'switch',
    '--help': 'switch',
  },
  env: ENV_TABLE.map((e) => e.name),
};

const KIT = planKit({ slug: SLUG, binaryName: BIN, flagTable: FLAG_TABLE, envTable: ENV_TABLE });

/**
 * Giới hạn công cụ (INT-07, sandbox-parity): chỉ MCP server gateway + chỉ cấu hình MCP của lượt; công cụ khác tự bị từ chối
 * (`dontAsk`). Ba cờ có trong --help 2.1.299 (Spike 1b); ngữ nghĩa chưa kiểm với CLI thật (CC-T02, M6).
 */
const TOOL_RESTRICTION: ToolRestriction = {
  requiredFlags: ['--permission-mode', '--allowedTools', '--strict-mcp-config'],
  evidence: 'partial',
  source: 'CC-T02: cờ có trong --help 2.1.299; ngữ nghĩa "chỉ tool của gateway" chưa kiểm (M6)',
};

const SCAN_TIMEOUT_MS = 30_000;
const SCAN_PRINT_TIMEOUT_MS = 90_000;
const CLI_ENV = { DISABLE_AUTOUPDATER: '1' };

function argv(): ArgvBuilder {
  return KIT.argv();
}

/** `-p` một câu / lệnh slash, output JSON một object (`result`). */
function printJsonArgv(prompt: string, extra: (a: ArgvBuilder) => void = () => {}): string[] {
  const a = argv().value('--output-format', 'json', 'eq').flag('--no-session-persistence');
  extra(a);
  return a.flag('-p').text(prompt).build();
}

// ---------------------------------------------------------------- kiểm đăng nhập (§B.7)
/**
 * `claude auth status` in JSON {loggedIn, authMethod, apiProvider, …} (Spike 1b, đã đăng nhập).
 * Khi chưa đăng nhập: mã thoát / dạng output chưa kiểm (CC-L01). Trường email: chưa kiểm có hay không (CC-L02) —
 * chỉ ghi account_hint khi CLI tự in, đã che (G-23). `auth status` có kiểm token với server không: chưa kiểm (CC-L03);
 * token hết hạn được phát hiện qua phân loại lượt (login_expired).
 */
function parseAuthStatus(o: ProbeOutcome): LoginCheckResult {
  const r = cliResult(o);
  if (!ran(r)) return { status: 'unknown', accountHint: null, detail: clip(execFailureReason(r)) };
  const json = parseJsonObject(r.stdout.trim());
  if (json === null) {
    return { status: 'unknown', accountHint: null, detail: clip(`auth status không ra JSON (exit=${r.exitCode})`) };
  }
  if (json.loggedIn === true) return { status: 'logged_in', accountHint: maskAccountHint(json.email), detail: null };
  if (json.loggedIn === false) return { status: 'logged_out', accountHint: null, detail: null };
  return { status: 'unknown', accountHint: null, detail: 'auth status thiếu trường loggedIn' };
}

function parseLoginCheck(authMethod: AuthMethod, o: ProbeOutcome): LoginCheckResult {
  return authMethod === 'subscription' ? parseAuthStatus(o) : parsePrintLoginCheck(o);
}

/** API key / ADC: một lượt -p nhỏ, đọc bằng chính bảng lỗi của lượt. */
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

function loginCheck(input: LoginArgvInput & ProbePlanInput): LoginCheck {
  checkProbeInput(input);
  if (input.authMethod === 'subscription') {
    return {
      plan: KIT.plan({
        files: [],
        argv: argv().sub('auth').sub('status').build(),
        env: CLI_ENV,
        timeoutMs: SCAN_TIMEOUT_MS,
      }),
      parse: parseAuthStatus,
    };
  }
  // Runner đặt env API key (apiKeyEnvName) từ tệp bí mật cho tiến trình con — không nằm trong plan.
  return {
    plan: KIT.plan({
      files: [],
      argv: printJsonArgv('Reply with OK', (a) => a.flag('--disable-slash-commands')),
      env: CLI_ENV,
      timeoutMs: SCAN_PRINT_TIMEOUT_MS,
    }),
    parse: parsePrintLoginCheck,
  };
}

// ---------------------------------------------------------------- quét khả năng (§B.7, STD-10)
function capabilityScan(input: CapabilityScanInput & ProbePlanInput): readonly ProbePlan[] {
  checkProbeInput(input);
  const plans: ProbePlan[] = [
    KIT.plan({ files: [], argv: argv().flag('--version').build(), env: CLI_ENV, timeoutMs: SCAN_TIMEOUT_MS }),
    KIT.plan({ files: [], argv: argv().flag('--help').build(), env: CLI_ENV, timeoutMs: SCAN_TIMEOUT_MS }),
  ];
  // `/model`, `/usage` cần đăng nhập (Spike 1b) ⇒ chưa đăng nhập thì không chạy, ghi unknown_requires_login.
  if (input.authMode !== 'none') {
    for (const cmd of ['/model', '/usage']) {
      plans.push(KIT.plan({ files: [], argv: printJsonArgv(cmd), env: CLI_ENV, timeoutMs: SCAN_PRINT_TIMEOUT_MS }));
    }
  }
  return plans;
}

/** `result` của `-p "/model"`: "Current model: `X`\nUsage: /model <name>. Available: a, b, …, or a full model ID." */
function parseModelAliases(text: string): { aliases: string[]; current: string | null } | null {
  const marker = 'Available:';
  const i = text.indexOf(marker);
  if (i < 0) return null;
  const aliases: string[] = [];
  for (const part of text.slice(i + marker.length, i + marker.length + 4096).split(',')) {
    let t = part.trim();
    if (t.endsWith('.')) t = t.slice(0, -1);
    if (t === '' || t.startsWith('or ') || t.includes(' ')) continue;
    if (/^[A-Za-z0-9][A-Za-z0-9._:[\]-]{0,63}$/.test(t)) aliases.push(t);
  }
  const c0 = text.indexOf('Current model:');
  let current: string | null = null;
  if (c0 >= 0) {
    const open = text.indexOf('`', c0);
    const close = open >= 0 ? text.indexOf('`', open + 1) : -1;
    if (open >= 0 && close > open && close - open < 200) current = text.slice(open + 1, close);
  }
  return aliases.length > 0 ? { aliases, current } : null;
}

function printResultText(r: ExecResult): { ok: boolean; text: string } {
  const json = parseJsonObject(r.stdout.trim());
  if (json === null) return { ok: false, text: '' };
  return { ok: json.is_error === false, text: str(json.result) ?? '' };
}

function parseCapabilitiesFor(outcomes: readonly ProbeOutcome[], input: CapabilityScanInput): CapabilityEntry[] {
  const [ver, help, model, usage] = outcomes.map(cliResult);
  const authMode = input.authMode;
  const out: CapabilityEntry[] = [versionCapability(ver, `${BIN} --version`)];
  out.push(
    ...helpCapabilities(help, {
      source: `${BIN} --help`,
      lists: [
        ['effort', '--effort'],
        ['mode', '--permission-mode'],
        ['output_format', '--output-format'],
      ],
      subcommandHeader: 'Commands:',
    }),
  );

  // Model: chỉ có BÍ DANH, không gắn với quyền của tài khoản ⇒ static_catalog (STD-10 §5). Model đang chạy: sự kiện `model`.
  if (authMode === 'none' || outcomes.length < 3) {
    out.push(unknown('model', ANY_ITEM, UNKNOWN_REQUIRES_LOGIN, `${BIN} -p /model`, authMode));
  } else {
    const res = ran(model) ? printResultText(model) : { ok: false, text: '' };
    const parsed = res.ok ? parseModelAliases(res.text) : null;
    if (parsed === null) {
      const reason = ran(model)
        ? `unknown: không đọc được danh sách bí danh từ /model (exit=${model.exitCode})`
        : execFailureReason(model);
      out.push(unknown('model', ANY_ITEM, reason, `${BIN} -p /model`, authMode));
    } else {
      for (const a of parsed.aliases) {
        out.push(known('model', a, a, `${BIN} -p /model (bí danh)`, 'static_catalog', authMode));
      }
      if (parsed.current !== null) {
        out.push(known('feature', 'current_model_label', parsed.current, `${BIN} -p /model`, 'direct', authMode));
      }
    }
  }

  // Quota gói: Spike 1b chỉ thấy chi phí / token của phiên trong `/usage`, không có cửa sổ quota ⇒ unknown (CC-Q01).
  // (rate_limit_event trong stream của lượt có cửa sổ 5 giờ — contracts chưa có sự kiện quota, đề xuất thêm.)
  if (authMode === 'none' || outcomes.length < 4) {
    out.push(unknown('quota_window', ANY_ITEM, UNKNOWN_REQUIRES_LOGIN, `${BIN} -p /usage`, authMode));
  } else {
    const reason = ran(usage)
      ? 'unknown: CLI không cung cấp quota gói qua /usage ở phiên bản này'
      : execFailureReason(usage);
    out.push(unknown('quota_window', ANY_ITEM, reason, `${BIN} -p /usage`, authMode));
  }
  return out;
}

// ---------------------------------------------------------------- lượt (§B.5)
function turnPlan(input: TurnPlanInput): TurnPlan {
  // detectedFlags CHỈ làm cổng (contracts), không bao giờ vào argv.
  assertToolRestriction(TOOL_RESTRICTION, input.detectedFlags);
  const c = checkTurnInput(input);
  // Phiên đo 'overhead_bare' (CNS-178): CLI trần — không cấu hình MCP / tool gateway; giới hạn công cụ vẫn giữ (không tool nào).
  const bare = input.measure === 'overhead_bare';
  const bridge = mcpBridgeCommand(input);
  const mcpConfig = {
    mcpServers: { [GATEWAY_MCP_SERVER]: { type: 'stdio', command: bridge.command, args: bridge.args } },
  };
  // Dạng `--cờ=giá-trị`: giá trị không bị hiểu là cờ khác; cờ nhiều giá trị (--mcp-config, --allowedTools) đứng trước
  // cờ boolean nên không nuốt prompt. Prompt là toán hạng cuối, ngay sau `-p` (boolean). Nội dung prompt KHÔNG BAO GIỜ vào
  // cờ mang cấu hình (--mcp-config / --settings / …): chỉ ở toán hạng của `-p` và `--append-system-prompt` (cờ chữ, dạng =).
  const a = argv();
  if (!bare) a.value('--mcp-config', `${c.turnDir}/${MCP_CONFIG_FILE}`, 'eq');
  a.value('--allowedTools', `mcp__${GATEWAY_MCP_SERVER}`, 'eq')
    .flag('--strict-mcp-config')
    // INT-07: mọi hành động ra ngoài đi qua gateway ⇒ chỉ cho công cụ của gateway, phần còn lại tự từ chối (dontAsk).
    .value('--permission-mode', 'dontAsk', 'eq')
    .flag('--disable-slash-commands')
    .flag('--no-session-persistence')
    .value('--output-format', 'stream-json', 'eq')
    .flag('--verbose')
    .flag('--include-partial-messages');
  if (c.model !== null) a.value('--model', c.model, 'eq');
  if (c.effort !== null) a.value('--effort', c.effort, 'eq');
  if (c.systemPrompt !== null) a.value('--append-system-prompt', c.systemPrompt, 'eq');
  a.flag('-p').text(c.prompt);
  return KIT.plan({
    files: bare ? [] : [{ path: MCP_CONFIG_FILE, content: JSON.stringify(mcpConfig), mode: 0o400 }],
    argv: a.build(),
    env: CLI_ENV,
    timeoutMs: c.timeoutMs,
  });
}

function loginArgv(input: LoginArgvInput): readonly string[] {
  if (input.authMethod !== 'subscription') {
    throw new AdapterError('login_not_interactive', 'API key / ADC không đăng nhập qua PTY (lưu ở kho bí mật)');
  }
  // §B.6: đúng lệnh đăng nhập, không shell. Supervisor chạy exec với HOME=/auth/<en> ⇒ credential nằm ở authAllowlist.
  return KIT.checkedArgv(argv().sub('auth').sub('login').build());
}

export const claudeCodeAdapter: EngineAdapterExt = {
  slug: SLUG,
  adapterVersion: '0.1.0',
  // Phiên bản có output thật làm fixture (Spike 1b). Adapter CHƯA chạy với CLI thật — M6.
  testedVersions: ['2.1.299'],
  // Suy ra (CC-A01): `claude auth login` với HOME=/auth/<en> ghi credential vào ~/.claude/.credentials.json.
  // KHÔNG giữ ~/.claude.json (trạng thái + lịch sử dự án = "Brain bóng"); IT với CLI giả ở M1, kiểm thật ở M6.
  authAllowlist: ['.claude/.credentials.json'],
  // Tương đối HOME: transcript `projects/<cwd>/<phiên>.jsonl` + trạng thái toàn cục. Chưa kiểm đủ danh sách (CC-A02).
  nativeStatePaths: ['.claude/projects', '.claude/history.jsonl', '.claude.json'],
  nativeMemoryPolicy: NATIVE_MEMORY_POLICY,
  installSpec: {
    source: 'official',
    origin: 'https://downloads.claude.ai/claude-code-releases/latest',
    checksum: { algorithm: 'sha256', from: 'manifest' },
    // Trình cài chính chủ có tự cập nhật vào thư mục chỉ đọc không: chưa kiểm (CC-I02, Spike 1c tiêu chí CNS-137).
    selfUpdate: 'unknown',
    egressDomains: ['downloads.claude.ai'],
    // Khoá nền tảng trong manifest `platforms[<key>]` (GET kiểm 2026-10-16).
    platforms: [
      { arch: 'x64', libc: 'glibc', key: 'linux-x64' },
      { arch: 'arm64', libc: 'glibc', key: 'linux-arm64' },
      { arch: 'x64', libc: 'musl', key: 'linux-x64-musl' },
      { arch: 'arm64', libc: 'musl', key: 'linux-arm64-musl' },
    ],
  },
  installSource: INSTALL_SOURCE,
  binaryPath: KIT.binaryPath,
  flagTable: FLAG_TABLE,
  envTable: ENV_TABLE,
  requiredTurnFlags: REQUIRED_TURN_FLAGS,
  toolRestriction: TOOL_RESTRICTION,
  apiKeyEnvName: 'ANTHROPIC_API_KEY',
  errorRules: ERROR_RULES,
  // Pha tách được từ stream (sự kiện công cụ đầu tiên); nhãn chưa chắc: chưa đo được (G-13, M6).
  outputSignals: { phase: 'stream', certainty: 'unmeasured' },
  loginArgv,
  loginCheck,
  parseLoginCheck,
  capabilityScan,
  parseCapabilities: (outcomes) => parseCapabilitiesFor(outcomes, { authMode: 'unknown' }),
  parseCapabilitiesFor,
  parseStreamLine: parseLineAll,
  createLineParser: createParser,
  classify: (exit, stdout, stderr) => classifyDetailed(exit, stdout, stderr).classification,
  classifyDetailed,
  turnPlan,
};
