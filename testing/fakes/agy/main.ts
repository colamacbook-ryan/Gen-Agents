#!/usr/bin/env node
// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
//
// fake-agy: CLI giả Antigravity (agy 1.3.5). Bề mặt help / models / lỗi lấy NGUYÊN VĂN từ Spike 1b (agy/dumps/); phần sau đăng nhập
// là GIẢ ĐỊNH (xem ../ASSUMPTIONS.md, ID AG-*). Điểm cốt lõi theo BUILD-PLAN §C.2: SAU OAuth, agy giả vẫn chạy như agent tương tác
// (để IT chứng minh supervisor đóng exec), trừ khi kịch bản đặt exitAfterLogin.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { approxTokens, nowMs, parseGoDuration, uuid } from '../lib/common.ts';
import { fakeEnvOrExit } from '../lib/config.ts';
import { agyStateDir, readCredential, rotateCredential, writeCredential, writeFileAtomic } from '../lib/creds.ts';
import { callVendor, type Interpreted, readScenario, type Scenario, whoami } from '../lib/scenario.ts';
import { pickMcpServer, runToolScript, type ToolOutcome } from '../lib/toolscript.ts';

const DATA = join(dirname(fileURLToPath(import.meta.url)), 'dumps');
const data = (name: string): string => readFileSync(join(DATA, name), 'utf8');
const env = fakeEnvOrExit('fake-agy');
const out = (s: string): void => void process.stdout.write(s);
const err = (s: string): void => void process.stderr.write(s);

function die(code: number, msg: string): never {
  err(msg.endsWith('\n') ? msg : `${msg}\n`);
  process.exit(code);
}

const printHelp = (text: string) => (env.GA_FAKE_HELP_STREAM === 'stderr' ? err(text) : out(text));

// ---------------------------------------------------------------- cờ (kiểu Go flag: -x, --x, --x=v, --x v)
const VALUE_FLAGS = new Set([
  '--add-dir',
  '--agent',
  '--conversation',
  '--effort',
  '--input-format',
  '--json-schema',
  '--log-file',
  '--mode',
  '--model',
  '--output-format',
  '--print',
  '-p',
  '--prompt',
  '--print-timeout',
  '--project',
  '--prompt-interactive',
  '-i',
]);
const BOOL_FLAGS = new Set([
  '-c',
  '--continue',
  '--dangerously-skip-permissions',
  '--disable-slash-commands',
  '--new-project',
  '--remote-control',
  '--sandbox',
  '-h',
  '--help',
  '-help',
  '--version',
  '-version',
]);
const SUBCOMMANDS = [
  'agent',
  'agents',
  'changelog',
  'help',
  'install',
  'mcp',
  'mic-serve',
  'models',
  'plugin',
  'plugins',
  'remote-control',
  'update',
];

interface Parsed {
  flags: Map<string, string | true>;
  rest: string[];
}

function parseFlags(args: string[]): Parsed {
  const flags = new Map<string, string | true>();
  let i = 0;
  for (; i < args.length; i++) {
    const a = args[i] as string;
    if (!a.startsWith('-') || a === '-') break;
    if (a === '--') {
      i++;
      break;
    }
    const [name, inline] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
    const key = name.length > 2 && !name.startsWith('--') ? `-${name}` : name; // Go flag: -model ≡ --model
    if (VALUE_FLAGS.has(key)) {
      const v = inline ?? args[++i];
      if (v === undefined) die(2, `flag needs an argument: ${name}`);
      flags.set(key, v);
    } else if (BOOL_FLAGS.has(key)) {
      flags.set(key, true);
    } else {
      err(`flag provided but not defined: ${name}\n`);
      printHelp(data('help.txt'));
      process.exit(2);
    }
  }
  return { flags, rest: args.slice(i) };
}

// ---------------------------------------------------------------- đăng nhập giả (OAuth: URL + dán mã, 60 s)
const SCOPES = ['cloud-platform', 'userinfo.email', 'userinfo.profile', 'cclog', 'experimentsandconfigs', 'aicode'].map(
  (s) => `https%3A%2F%2Fwww.googleapis.com%2Fauth%2F${s}`,
);

function oauthUrl(): string {
  const rnd = () => Buffer.from(uuid().replace(/-/g, ''), 'hex').toString('base64url');
  return (
    'https://accounts.google.com/o/oauth2/auth?access_type=offline&client_id=GA-FAKE-CLIENT.invalid' +
    `&code_challenge=${rnd()}&code_challenge_method=S256&prompt=consent` +
    '&redirect_uri=https%3A%2F%2Fantigravity.google%2Foauth-callback&response_type=code' +
    `&scope=${SCOPES.join('+')}+openid&state=${rnd()}`
  );
}

type LoginResult = 'ok' | 'timeout' | 'interrupted';

/**
 * Thông điệp và hành vi lấy từ Spike 1b: in URL, chờ tới 60 s (EOF của stdin KHÔNG làm kết thúc sớm — spike đo 61 s với </dev/null),
 * dán mã vào stdin là xong. Kịch bản login_abandoned: không bao giờ nhận mã (chủ đóng tab trình duyệt).
 */
function oauthLogin(sc: Scenario | null): Promise<LoginResult> {
  const timeoutMs = Number(env.GA_FAKE_LOGIN_TIMEOUT_MS ?? 60_000);
  err(`Authentication required. Please visit the URL to log in:\n  ${oauthUrl()}\n\n`);
  err('Waiting for authentication (timeout 60s)...\nOr, paste the authorization code here and press Enter:\n');
  return new Promise<LoginResult>((resolve) => {
    let done = false;
    const rl = createInterface({ input: process.stdin, terminal: false });
    const finish = (r: LoginResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      rl.close();
      process.stdin.pause();
      process.off('SIGTERM', onSignal);
      process.off('SIGINT', onSignal);
      resolve(r);
    };
    const onSignal = () => finish('interrupted');
    const timer = setTimeout(() => finish('timeout'), timeoutMs);
    process.on('SIGTERM', onSignal);
    process.on('SIGINT', onSignal);
    rl.on('line', (line) => {
      if (line.trim() && sc?.name !== 'login_abandoned') finish('ok');
    });
  });
}

const loginFailText = (r: Exclude<LoginResult, 'ok'>) =>
  `${r === 'timeout' ? 'Error: authentication timed out.' : '\nError: authentication interrupted.'}\nerror: authentication failed or timed out\n`;

// ---------------------------------------------------------------- kết quả -p
interface Usage {
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  cache_read_tokens: number;
  total_tokens: number;
}
const zeroUsage = (): Usage => ({
  input_tokens: 0,
  output_tokens: 0,
  thinking_tokens: 0,
  cache_read_tokens: 0,
  total_tokens: 0,
});

function resultObject(
  conv: string,
  status: 'SUCCESS' | 'ERROR',
  response: string,
  error: string,
  seconds: number,
  turns: number,
  usage: Usage,
) {
  return {
    conversation_id: conv,
    status,
    response,
    error,
    duration_seconds: seconds,
    num_turns: turns,
    usage,
  };
}

/** Lỗi API-key sai: NGUYÊN VĂN từ Spike 1b (agy-print-fakekey.err), chỉ đổi error_id. */
const API_KEY_INVALID =
  'agent executor error: generating and executing: Error 400, Message: API key not valid. Please pass a valid API key., Status: INVALID_ARGUMENT, ' +
  'Details: [map[@type:type.googleapis.com/google.rpc.ErrorInfo domain:googleapis.com metadata:map[service:generativelanguage.googleapis.com] reason:API_KEY_INVALID] ' +
  'map[@type:type.googleapis.com/google.rpc.LocalizedMessage locale:en-US message:API key not valid. Please pass a valid API key.]]';

interface AgyError {
  short: string;
  status: string;
  code: number;
  kind: string;
  retryable: boolean;
}

function toAgyError(i: Exclude<Interpreted, { kind: 'ok' }>): AgyError {
  const pre = 'agent executor error: generating and executing:';
  if (i.kind === 'error') {
    const reset = i.resetAt ? ` (quota resets at ${i.resetAt})` : '';
    return {
      short: `${pre} Error ${i.http}, Message: ${i.message}${reset}, Status: ${i.status}`,
      status: i.status,
      code: i.http,
      kind: 'http',
      retryable: i.retryable,
    };
  }
  if (i.kind === 'network') {
    return { short: `${pre} ${i.message}`, status: 'UNAVAILABLE', code: 0, kind: 'network', retryable: true };
  }
  return { short: `${pre} ${i.message}`, status: 'INTERNAL', code: 0, kind: 'decode', retryable: false };
}

function emitError(fmt: string, e: AgyError, conv: string, seconds: number): never {
  const usage = zeroUsage();
  if (fmt === 'json') out(`${JSON.stringify(resultObject(conv, 'ERROR', '', e.short, seconds, 1, usage))}\n`);
  if (fmt === 'stream-json')
    out(`${JSON.stringify({ type: 'result', ...resultObject(conv, 'ERROR', '', e.short, seconds, 1, usage) })}\n`);
  const meta = {
    short_error: e.short,
    status: e.status,
    error_code: e.code,
    code_kind: e.kind,
    retryable: e.retryable,
    error_id: `${uuid()}-1`,
  };
  err(`error: ${e.short}\nAGY_ERROR: ${JSON.stringify(meta)}\n`);
  process.exit(3);
}

/** Trạng thái native giả: hội thoại + log trong thư mục trạng thái của agy (vị trí thật: Spike 1c, AG-NATIVE-1). */
function writeNativeState(conv: string, prompt: string, reply: string, tools: ToolOutcome[]): void {
  const dir = agyStateDir(env);
  mkdirSync(join(dir, 'conversations'), { recursive: true });
  mkdirSync(join(dir, 'log'), { recursive: true });
  writeFileSync(
    join(dir, 'conversations', `${conv}.json`),
    JSON.stringify({
      conversation_id: conv,
      prompt,
      reply,
      tools: tools.map((t) => ({ tool: t.tool, isError: t.isError })),
    }),
  );
  appendFileSync(join(dir, 'log', 'agy.log'), `${new Date(nowMs(env)).toISOString()} turn ${conv}\n`);
}

/**
 * Máy chủ MCP của lượt: từ `agy mcp add` (<state>/mcp_servers.json) + tệp tuỳ chọn GA_FAKE_MCP_CONFIG (dạng {mcpServers:{…}} hoặc
 * phẳng) cho trường hợp runner ghi cấu hình ở chỗ adapter chọn (vị trí thật của agy ở chế độ -p: chưa kiểm — AG-MCP-1).
 */
function mcpServers(): unknown {
  const f = join(agyStateDir(env), 'mcp_servers.json');
  const own = existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>) : {};
  if (!env.GA_FAKE_MCP_CONFIG) return own;
  const extra = JSON.parse(readFileSync(env.GA_FAKE_MCP_CONFIG, 'utf8')) as { mcpServers?: Record<string, unknown> };
  return { ...own, ...(extra.mcpServers ?? extra) };
}

async function runPrint(flags: Map<string, string | true>, promptArg: string): Promise<void> {
  const sc = readScenario(env);
  const fmt = String(flags.get('--output-format') ?? 'text');
  if (!['text', 'json', 'stream-json'].includes(fmt)) die(2, `invalid --output-format: ${fmt}`);
  const inFmt = String(flags.get('--input-format') ?? 'text');
  if (inFmt === 'stream-json' && fmt !== 'stream-json')
    die(2, '--input-format stream-json requires --output-format stream-json');
  if (flags.has('--prompt-interactive') || flags.has('-i')) die(2, 'cannot combine --print with --prompt-interactive');
  const started = nowMs(env);
  const seconds = () => Math.round((nowMs(env) - started) / 10) / 100;
  const conv = uuid();

  // xác thực: tệp credential (OAuth) hoặc GEMINI_API_KEY; chưa có ⇒ vào luồng OAuth như CLI thật
  let cred = readCredential('agy', env);
  const apiKey = env.GEMINI_API_KEY;
  if (!cred && !apiKey) {
    const r = await oauthLogin(sc);
    if (r !== 'ok') {
      err(loginFailText(r));
      const msg = 'authentication failed or timed out';
      if (fmt !== 'text') out(`${JSON.stringify(resultObject('', 'ERROR', '', msg, 0, 0, zeroUsage()))}\n`);
      process.exit(1);
    }
    cred = writeCredential('agy', env);
  }
  if (apiKey?.startsWith('invalid')) {
    emitError(
      fmt,
      { short: API_KEY_INVALID, status: 'INVALID_ARGUMENT', code: 400, kind: 'http', retryable: false },
      conv,
      seconds(),
    );
  }

  // lệnh slash /usage (Spike 1b: `agy -p "/usage" --output-format json`)
  if (promptArg.trim() === '/usage' && !flags.has('--disable-slash-commands')) {
    const exhausted = sc?.name === 'quota_exhausted';
    const groups =
      apiKey && !cred
        ? []
        : [
            {
              id: 'fake-group',
              label: 'Fake quota group',
              remaining_fraction: exhausted ? 0 : 0.75,
              reset_time: sc?.resetAt ?? null,
            },
          ];
    const o = {
      ...resultObject('', 'SUCCESS', '', '', 0, 0, zeroUsage()),
      command: { name: 'usage', data: { groups } },
    };
    out(fmt === 'text' ? `${JSON.stringify(groups)}\n` : `${JSON.stringify(o)}\n`);
    return;
  }

  const model = flags.get('--model');
  const ctx = {
    account: cred?.account ?? 'api-key',
    model: typeof model === 'string' ? model : null,
    promptChars: promptArg.length,
    nowMs: nowMs(env),
  };
  const timeoutFlag = flags.get('--print-timeout');
  const timeoutMs = typeof timeoutFlag === 'string' ? parseGoDuration(timeoutFlag) : null;
  if (typeof timeoutFlag === 'string' && timeoutMs === null)
    die(2, `invalid value "${timeoutFlag}" for flag -print-timeout: parse error`);
  const call = callVendor('agy', sc, ctx, env);
  const raced = timeoutMs
    ? await Promise.race([call, new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), timeoutMs))])
    : await call;
  if (raced === 'timeout') {
    emitError(
      fmt,
      {
        short: `print mode timed out after ${timeoutFlag}`,
        status: 'DEADLINE_EXCEEDED',
        code: 0,
        kind: 'timeout',
        retryable: true,
      },
      conv,
      seconds(),
    );
  }
  const r = raced as Interpreted;
  if (r.kind !== 'ok') {
    writeNativeState(conv, promptArg, '', []);
    emitError(fmt, toAgyError(r), conv, seconds());
  }

  const tools = sc?.script ? await runToolScript(sc.script, pickMcpServer(mcpServers(), env), 'agy', env) : [];
  const text = sc?.script?.reply ?? r.text;
  const outTok = approxTokens(text);
  const usage: Usage = {
    input_tokens: r.usage.input,
    output_tokens: outTok,
    thinking_tokens: r.usage.thinking,
    cache_read_tokens: r.usage.cache_read,
    total_tokens: r.usage.input + outTok + r.usage.thinking,
  };
  writeNativeState(conv, promptArg, text, tools);
  if (env.GA_FAKE_ROTATE_CREDS === '1') rotateCredential('agy', env);
  const res = resultObject(conv, 'SUCCESS', text, '', seconds(), 1 + tools.length, usage);
  if (fmt === 'text') out(`${text}\n`);
  else if (fmt === 'json') out(`${JSON.stringify(res)}\n`);
  else {
    // GIẢ ĐỊNH AG-STREAM-1: schema stream-json thành công của agy chưa kiểm (Spike 1c)
    const lines: unknown[] = [{ type: 'init', conversation_id: conv, model: r.model }];
    for (const t of tools) {
      lines.push({ type: 'tool_call', id: t.callId, name: t.tool });
      lines.push({ type: 'tool_result', id: t.callId, name: t.tool, is_error: t.isError, text: t.text });
    }
    lines.push({ type: 'delta', text }, { type: 'result', ...res });
    out(lines.map((l) => `${JSON.stringify(l)}\n`).join(''));
  }
}

// ---------------------------------------------------------------- chế độ tương tác (agent chạy tiếp sau OAuth)
async function interactive(): Promise<void> {
  const sc = readScenario(env);
  if (!readCredential('agy', env) && !env.GEMINI_API_KEY) {
    const r = await oauthLogin(sc);
    if (r !== 'ok') {
      err(loginFailText(r));
      process.exit(1);
    }
    writeCredential('agy', env);
    out('Signed in.\n');
  }
  if (sc?.exitAfterLogin) return;
  // GIẢ ĐỊNH AG-AFTER-OAUTH-1: sau OAuth agy là agent tương tác (có công cụ), chạy tiếp tới khi stdin đóng / bị kill.
  out('Antigravity CLI (fake). Agent session started; tools enabled.\n> ');
  const rl = createInterface({ input: process.stdin, terminal: false });
  rl.on('line', (line) => {
    if (line.trim() === '/exit' || line.trim() === '/quit') process.exit(0);
    out(`fake-agy: received ${line.length} chars\n> `);
  });
  await new Promise<void>((resolve) => rl.on('close', resolve));
}

// ---------------------------------------------------------------- lệnh con
const HELP_FILES: Record<string, string> = {
  agent: 'help-agent.txt',
  agents: 'help-agent.txt',
  changelog: 'help-changelog.txt',
  install: 'help-install.txt',
  mcp: 'help-mcp.txt',
  'mic-serve': 'help-mic-serve.txt',
  models: 'help-models.txt',
  plugin: 'help-plugin.txt',
  plugins: 'help-plugin.txt',
  'remote-control': 'help-remote-control.txt',
  update: 'help-update.txt',
};
const wantsHelp = (a: string[]) => a.some((x) => x === '-h' || x === '--help');

function mcpCommand(args: string[]) {
  const file = join(agyStateDir(env), 'mcp_servers.json');
  const cfg = mcpServers() as Record<string, Record<string, unknown>>;
  const sub = args[0];
  if (!sub || sub === '-h' || sub === '--help') return printHelp(data('help-mcp.txt'));
  if (wantsHelp(args))
    return printHelp(data(sub === 'add' ? 'help-mcp-add.txt' : sub === 'list' ? 'help-mcp-list.txt' : 'help-mcp.txt'));
  if (sub === 'list') {
    const names = Object.keys(cfg);
    if (!names.length) return out('No MCP servers configured.\n');
    // GIẢ ĐỊNH AG-MCP-1: định dạng dòng của `mcp list` khi có máy chủ chưa kiểm
    return out(
      names
        .map(
          (n) => `${n}\t${cfg[n]?.type}\t${cfg[n]?.url ?? cfg[n]?.command}${cfg[n]?.disabled ? '\t(disabled)' : ''}\n`,
        )
        .join(''),
    );
  }
  if (sub === 'add') {
    const headers: Record<string, string> = {};
    const envs: Record<string, string> = {};
    let type: string | null = null;
    let i = 1;
    for (; i < args.length; i++) {
      const a = args[i] as string;
      if (a === '--') {
        i++;
        break;
      }
      if (!a.startsWith('-')) break;
      const v = args[++i];
      if (v === undefined) die(2, `flag needs an argument: ${a}`);
      if (a === '-H' || a === '--header')
        headers[v.slice(0, v.indexOf(':')).trim()] = v.slice(v.indexOf(':') + 1).trim();
      else if (a === '-e' || a === '--env') envs[v.slice(0, v.indexOf('='))] = v.slice(v.indexOf('=') + 1);
      else if (a === '-t' || a === '--type') type = v;
      else die(2, `flag provided but not defined: ${a}`);
    }
    const [name, target, ...rest] = args.slice(i);
    if (!name || !target) die(2, 'usage: agy mcp add [flags] <name> <commandOrUrl> [args...]');
    const isUrl = /^https?:\/\//.test(target);
    cfg[name] = isUrl
      ? { type: type ?? 'http', url: target, headers }
      : { type: type ?? 'stdio', command: target, args: rest, env: envs };
    writeFileAtomic(file, JSON.stringify(cfg));
    return out(`Added MCP server "${name}"\n`);
  }
  if (sub === 'remove' || sub === 'enable' || sub === 'disable') {
    const name = args[1];
    const entry = name ? cfg[name] : undefined;
    if (!name || !entry) die(1, `MCP server "${name ?? ''}" not found`);
    if (sub === 'remove') delete cfg[name];
    else entry.disabled = sub === 'disable';
    writeFileAtomic(file, JSON.stringify(cfg));
    return out(`${sub === 'remove' ? 'Removed' : sub === 'enable' ? 'Enabled' : 'Disabled'} MCP server "${name}"\n`);
  }
  die(2, `unknown mcp subcommand: ${sub}`);
}

async function modelsCommand(): Promise<void> {
  const cred = readCredential('agy', env);
  out('Fetching available models...\n');
  if (!cred && !env.GEMINI_API_KEY) {
    err('Error: Please sign in to view available models. Launch the CLI without arguments to sign in.\n');
    process.exit(1);
  }
  // Chỉ in danh tính khi bật rõ (Spike 1b: agy chưa thấy in danh tính — Spike 1c tiêu chí 5, AG-IDENT-1)
  if (env.GA_FAKE_PRINT_IDENTITY === '1' && cred) {
    err(`Signed in as ${await whoami(readScenario(env), cred.account, env)}\n`);
  }
  out(data('models.tsv'));
}

function subcommand(sub: string, args: string[]) {
  if (sub === 'help') {
    const topic = args[0];
    if (!topic) return printHelp(data('help.txt'));
    const f = HELP_FILES[topic];
    if (!f) die(2, `Unknown help topic "${topic}"`);
    return printHelp(data(f));
  }
  if (sub === 'mcp') return mcpCommand(args);
  const f = HELP_FILES[sub];
  if (f && wantsHelp(args)) return printHelp(data(f));
  switch (sub) {
    case 'models':
      return modelsCommand();
    case 'changelog':
      return out(data('changelog.txt'));
    case 'agent':
    case 'agents':
      return; // Spike 1b: `agy agent` in ra rỗng (chưa đăng nhập)
    case 'plugin':
    case 'plugins':
      if (args[0] === 'list' && args.includes('--json')) return out('[]\n');
      return printHelp(data('help-plugin.txt'));
    case 'update':
      // GIẢ ĐỊNH AG-UPDATE-1: bản giả không tự cập nhật; CLI thật có self-updater nền (Spike 1b) — Spike 1c kiểm thư mục chỉ đọc
      return out(`Already up to date (${data('version.txt').trim()}).\n`);
    case 'install':
      return;
    case 'remote-control':
      if (args[0] === 'status')
        return out(
          'Daemon status: Failed to connect to bus: No medium found\nCheck logs with: journalctl --user -u antigravity-cli-daemon.service -n 50\nInstance name: not assigned yet; the daemon generates one on its first start.\n',
        );
      return printHelp(
        data(wantsHelp(args) && args[0] === 'start' ? 'help-remote-control-start.txt' : 'help-remote-control.txt'),
      );
    default:
      die(2, `fake-agy: lệnh con "${sub}" chưa được giả lập`);
  }
}

// ---------------------------------------------------------------- main
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const scNow = readScenario(env);
  // Thăm dò "tự cập nhật vào thư mục chỉ đọc" (CNS-137): GA_FAKE_SELF_UPDATE=warn|fail thử ghi cạnh tệp thực thi
  if (env.GA_FAKE_SELF_UPDATE) {
    try {
      // cạnh tệp thực thi đã cài (launcher đặt GA_FAKE_LAUNCHER, vd /opt/engines/agy/1.3.5/bin/agy — mount chỉ đọc), không thì cạnh mã
      const dir = env.GA_FAKE_LAUNCHER ? dirname(env.GA_FAKE_LAUNCHER) : dirname(fileURLToPath(import.meta.url));
      writeFileSync(join(dir, '.fake-self-update'), 'x');
    } catch (e) {
      err(`self-update: ${(e as Error).message}\n`);
      if (env.GA_FAKE_SELF_UPDATE === 'fail') process.exit(1);
    }
  }
  if (argv[0] === 'version' || argv.includes('--version') || argv.includes('-version')) {
    const v = env.GA_FAKE_VERSION ?? (scNow?.name === 'version_drift' ? '1.4.0' : data('version.txt').trim());
    return out(`${v}\n`);
  }
  const { flags, rest } = parseFlags(argv);
  if (flags.has('-h') || flags.has('--help') || flags.has('-help')) return printHelp(data('help.txt'));
  const sub = rest[0];
  if (sub && SUBCOMMANDS.includes(sub) && !flags.has('--print') && !flags.has('-p') && !flags.has('--prompt')) {
    return subcommand(sub, rest.slice(1));
  }
  const p = flags.get('-p') ?? flags.get('--print') ?? flags.get('--prompt');
  if (typeof p === 'string') return runPrint(flags, p);
  if (sub) die(2, `fake-agy: tham số lạ "${sub}"`);
  return interactive();
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (e: unknown) => {
    err(`fake-agy: lỗi nội bộ: ${(e as Error).stack ?? e}\n`);
    process.exit(70);
  },
);
