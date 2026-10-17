#!/usr/bin/env node
// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
//
// fake-claude: CLI giả Claude Code (2.1.299). --version / --help và /model, /usage lấy NGUYÊN VĂN từ Spike 1b (claude/dumps/);
// phần còn lại (lỗi, stream-json khi lỗi, đăng nhập) là GIẢ ĐỊNH (../ASSUMPTIONS.md, ID CL-*). Điểm cốt lõi theo BUILD-PLAN §C.2:
// GHI TRANSCRIPT NATIVE như CLI thật (<thư mục cấu hình>/projects/<cwd>/<session>.jsonl + history.jsonl) để IT kiểm tmpfs mỗi lượt
// và `auth-gc`; tệp credential `.credentials.json` mang canary.
import { appendFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { approxTokens, nowMs, uuid } from '../lib/common.ts';
import { fakeEnvOrExit } from '../lib/config.ts';
import { claudeConfigDir, readCredential, rotateCredential, writeCredential } from '../lib/creds.ts';
import { callVendor, type Interpreted, readScenario, type Scenario, whoami } from '../lib/scenario.ts';
import { pickMcpServer, runToolScript, type ToolOutcome } from '../lib/toolscript.ts';

const DATA = join(dirname(fileURLToPath(import.meta.url)), 'dumps');
const data = (name: string): string => readFileSync(join(DATA, name), 'utf8');
const env = fakeEnvOrExit('fake-claude');
const out = (s: string): void => void process.stdout.write(s);
const err = (s: string): void => void process.stderr.write(s);
const ndjson = (o: unknown) => out(`${JSON.stringify(o)}\n`);
const VERSION = data('version.txt').trim(); // "2.1.299 (Claude Code)"

function die(code: number, msg: string): never {
  err(msg.endsWith('\n') ? msg : `${msg}\n`);
  process.exit(code);
}

// ---------------------------------------------------------------- cờ: suy từ chính help.txt (không hardcode cờ)
type Arity = 'bool' | 'value' | 'optional' | 'variadic';

function parseOptions(help: string): Map<string, Arity> {
  const map = new Map<string, Arity>();
  const lines = (help.split('Options:')[1] ?? '').split('Commands:')[0]?.split('\n') ?? [];
  lines.forEach((line, i) => {
    const m = /^ {2}(-[\w-]+(?:, --?[\w-]+)*)\s*(.*)$/.exec(line);
    if (!m) return;
    const spec = /^(<[^>]+>|\[[^\]]+\])/.exec((m[2] ?? '') || (lines[i + 1] ?? '').trim());
    const arg = spec?.[1];
    const arity: Arity = !arg ? 'bool' : arg.startsWith('[') ? 'optional' : arg.endsWith('...>') ? 'variadic' : 'value';
    for (const f of (m[1] ?? '').split(',')) map.set(f.trim(), arity);
  });
  return map;
}

interface Parsed {
  flags: Map<string, string[] | true>;
  positional: string[];
}

function parseArgs(args: string[], options: Map<string, Arity>): Parsed {
  const flags = new Map<string, string[] | true>();
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (a === '--') {
      positional.push(...args.slice(i + 1));
      break;
    }
    if (!a.startsWith('-') || a === '-') {
      positional.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    const name = a.startsWith('--') && eq > 0 ? a.slice(0, eq) : a;
    const arity = options.get(name);
    if (!arity) die(1, `error: unknown option '${name}'`);
    if (arity === 'bool') {
      flags.set(name, true);
      continue;
    }
    const vals: string[] = a.startsWith('--') && eq > 0 ? [a.slice(eq + 1)] : [];
    const takeMore = () => i + 1 < args.length && !(args[i + 1] as string).startsWith('-');
    if (arity === 'value' && !vals.length) {
      if (i + 1 >= args.length) die(1, `error: option '${name}' argument missing`);
      vals.push(args[++i] as string);
    } else if (arity === 'optional' && !vals.length && takeMore()) vals.push(args[++i] as string);
    else if (arity === 'variadic') {
      if (!vals.length && !takeMore()) die(1, `error: option '${name}' argument missing`);
      while (takeMore()) vals.push(args[++i] as string);
    }
    flags.set(name, [...((flags.get(name) as string[] | undefined) ?? []), ...vals]);
  }
  return { flags, positional };
}

// ---------------------------------------------------------------- tiện ích đầu ra
const iso = () => new Date(nowMs(env)).toISOString();
const sessionIdFrom = (f: Parsed['flags']) => (f.get('--session-id') as string[] | undefined)?.[0] ?? uuid();
const cwdKey = (cwd: string) => cwd.replace(/[^a-zA-Z0-9]/g, '-');

interface Tok {
  input: number;
  output: number;
  cacheRead: number;
}

function usageObject(t: Tok) {
  return {
    input_tokens: t.input,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: t.cacheRead,
    output_tokens: t.output,
    service_tier: 'standard',
  };
}

function resultEvent(o: {
  sid: string;
  isError: boolean;
  text: string;
  ms: number;
  turns: number;
  tok: Tok;
  model: string | null;
  extra?: object;
}) {
  return {
    type: 'result',
    subtype: 'success', // GIẢ ĐỊNH CL-ERR-1: lỗi API cũng subtype "success" + is_error=true (chưa kiểm trong Spike 1b)
    is_error: o.isError,
    duration_ms: o.ms,
    duration_api_ms: o.isError ? 0 : o.ms,
    num_turns: o.turns,
    result: o.text,
    stop_reason: o.isError ? null : 'end_turn',
    session_id: o.sid,
    total_cost_usd: 0,
    usage: usageObject(o.tok),
    modelUsage: o.model ? { [o.model]: { inputTokens: o.tok.input, outputTokens: o.tok.output } } : {},
    permission_denials: [],
    uuid: uuid(),
    ...o.extra,
  };
}

// ---------------------------------------------------------------- lỗi (toàn bộ văn bản: GIẢ ĐỊNH CL-ERR-*, chưa kiểm — Spike 1c)
function errorText(r: Exclude<Interpreted, { kind: 'ok' }>, sc: Scenario | null): string {
  if (r.kind === 'network') return 'API Error: Unable to connect to API (ENOTFOUND)';
  if (r.kind === 'malformed') return 'API Error: Unexpected token in JSON response from API';
  const j = (type: string, message: string) =>
    `API Error: ${r.http} ${JSON.stringify({ type: 'error', error: { type, message } })}`;
  switch (r.code) {
    case 'quota_exhausted': {
      const at = r.resetAt ?? sc?.resetAt;
      return at
        ? `You've hit your limit · resets ${new Date(at).toISOString().slice(11, 16)} (UTC)`
        : "You've hit your limit";
    }
    case 'account_suspended':
      return j('permission_error', 'Your account has been suspended');
    case 'login_expired':
      return `Please run /login · ${j('authentication_error', 'OAuth token has expired. Please obtain a new token or refresh your existing token.')}`;
    default:
      return j('api_error', r.message);
  }
}

// ---------------------------------------------------------------- lượt -p
function writeNative(sid: string, cwd: string, prompt: string, reply: string, tools: ToolOutcome[]): void {
  const cfg = claudeConfigDir(env);
  const dir = join(cfg, 'projects', cwdKey(cwd));
  mkdirSync(dir, { recursive: true });
  const base = { isSidechain: false, userType: 'external', cwd, sessionId: sid, version: '2.1.299' };
  const lines = [
    { ...base, type: 'user', message: { role: 'user', content: prompt }, uuid: uuid(), timestamp: iso() },
    ...tools.map((t) => ({
      ...base,
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: t.callId, content: t.text, is_error: t.isError }],
      },
      uuid: uuid(),
      timestamp: iso(),
    })),
    {
      ...base,
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: reply }] },
      uuid: uuid(),
      timestamp: iso(),
    },
  ];
  appendFileSync(join(dir, `${sid}.jsonl`), lines.map((l) => `${JSON.stringify(l)}\n`).join(''));
  appendFileSync(
    join(cfg, 'history.jsonl'),
    `${JSON.stringify({ display: prompt, timestamp: nowMs(env), project: cwd, sessionId: sid })}\n`,
  );
}

function loadMcpServers(flags: Parsed['flags']): Record<string, unknown> {
  const servers: Record<string, unknown> = {};
  for (const v of (flags.get('--mcp-config') as string[] | undefined) ?? []) {
    const j = JSON.parse(v.trim().startsWith('{') ? v : readFileSync(v, 'utf8')) as {
      mcpServers?: Record<string, unknown>;
    };
    Object.assign(servers, j.mcpServers ?? {});
  }
  return servers;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function runPrint(p: Parsed): Promise<void> {
  const { flags } = p;
  const fmt = (flags.get('--output-format') as string[] | undefined)?.[0] ?? 'text';
  if (!['text', 'json', 'stream-json'].includes(fmt))
    die(1, `error: option '--output-format <format>' argument '${fmt}' is invalid.`);
  // GIẢ ĐỊNH CL-STREAM-1 (từ kinh nghiệm, chưa có trong dump): -p + stream-json bắt buộc --verbose
  if (fmt === 'stream-json' && !flags.has('--verbose'))
    die(1, 'Error: When using --print, --output-format=stream-json requires --verbose');
  if (flags.has('--input-format') && (flags.get('--input-format') as string[])[0] === 'stream-json')
    die(2, 'fake-claude: --input-format stream-json chưa giả lập');
  const prompt = p.positional.join(' ') || (await readStdin());
  if (!prompt.trim())
    die(1, 'Error: Input must be provided either through stdin or as a prompt argument when using --print');

  const sc = readScenario(env);
  const started = nowMs(env);
  const ms = () => nowMs(env) - started;
  const sid = sessionIdFrom(flags);
  const cwd = process.cwd();
  const modelFlag = (flags.get('--model') as string[] | undefined)?.[0] ?? null;
  const cred = readCredential('claude', env);
  const viaEnv = Boolean(env.ANTHROPIC_API_KEY || env.CLAUDE_CODE_OAUTH_TOKEN);
  const emit = (text: string, isError: boolean, tok: Tok, extra?: object) => {
    const r = resultEvent({
      sid,
      isError,
      text,
      ms: ms(),
      turns: isError ? 0 : 1,
      tok,
      model: modelFlag,
      ...(extra ? { extra } : {}),
    });
    if (fmt === 'text') out(`${text}\n`);
    else ndjson(r);
    process.exitCode = isError ? 1 : 0;
  };
  const zero: Tok = { input: 0, output: 0, cacheRead: 0 };

  // lệnh slash cục bộ (Spike 1b: nguyên văn từ claude-p-model.txt / claude-p-usage.txt)
  if (prompt.trim() === '/model' || prompt.trim() === '/usage') {
    const isModel = prompt.trim() === '/model';
    const text = isModel
      ? `Current model: \`${modelFlag ?? 'Sonnet 5.5 (default)'}\`\nUsage: /model <name>. Available: sonnet, opus, haiku, fable, best, sonnet[1m], opus[1m], fable[1m], opusplan, default, or a full model ID.`
      : 'Total cost:            $0.0000\nTotal duration (API):  0s\nTotal duration (wall): 1s\nTotal code changes:    0 lines added, 0 lines removed\nUsage:                 0 input, 0 output, 0 cache read, 0 cache write';
    return emit(text, false, zero, { local_command: isModel ? 'model' : 'usage' });
  }

  const initEvent = (tools: string[], servers: string[]) => ({
    type: 'system',
    subtype: 'init',
    cwd,
    session_id: sid,
    tools: ['Bash', 'Read', 'Edit', 'Write', ...tools],
    mcp_servers: servers.map((name) => ({ name, status: 'connected' })),
    model: modelFlag ?? 'fake-model',
    permissionMode: 'default',
    apiKeySource: env.ANTHROPIC_API_KEY ? 'ANTHROPIC_API_KEY' : 'none',
    claude_code_version: VERSION.split(' ')[0],
    output_style: 'default',
    uuid: uuid(),
  });

  if (!cred && !viaEnv) {
    if (fmt === 'stream-json') ndjson(initEvent([], []));
    return emit('Not logged in · Please run /login', true, zero); // GIẢ ĐỊNH CL-ERR-2
  }

  const r = await callVendor(
    'claude',
    sc,
    { account: cred?.account ?? 'env-credential', model: modelFlag, promptChars: prompt.length, nowMs: nowMs(env) },
    env,
  );
  const persist = !flags.has('--no-session-persistence');
  const servers = loadMcpServers(flags);
  const serverNames = Object.keys(servers);
  const scriptTools = (sc?.script?.calls ?? []).map((c) => `mcp__${serverNames[0] ?? 'mcp'}__${c.tool}`);
  if (fmt === 'stream-json') ndjson(initEvent(scriptTools, serverNames));

  if (r.kind !== 'ok') {
    if (persist) writeNative(sid, cwd, prompt, '', []);
    const text = errorText(r, sc);
    if (fmt === 'stream-json' && r.kind === 'error' && r.code === 'quota_exhausted') {
      const resetsAt = r.resetAt ? Math.floor(Date.parse(r.resetAt) / 1000) : null;
      ndjson({
        type: 'rate_limit_event',
        rate_limit_info: { status: 'rejected', resetsAt, rateLimitType: 'five_hour' },
        uuid: uuid(),
        session_id: sid,
      });
    }
    return emit(text, true, zero);
  }

  const tools = sc?.script ? await runToolScript(sc.script, pickMcpServer(servers, env), 'claude', env) : [];
  const text = sc?.script?.reply ?? r.text;
  const tok: Tok = { input: r.usage.input, output: approxTokens(text), cacheRead: r.usage.cache_read };
  if (persist) writeNative(sid, cwd, prompt, text, tools);
  if (env.GA_FAKE_ROTATE_CREDS === '1') rotateCredential('claude', env);

  if (fmt === 'stream-json') {
    const model = r.model;
    const msgId = `msg_fake_${uuid().slice(0, 8)}`;
    const base = { session_id: sid, parent_tool_use_id: null };
    const callsArgs = sc?.script?.calls ?? [];
    tools.forEach((t, i) => {
      // Mặc định in args chưa thay thế ("$AUTH" nguyên văn): stdout của CLI không mang credential. GA_FAKE_ECHO_TOOL_ARGS=1 để thử bộ lọc stdout.
      const input = env.GA_FAKE_ECHO_TOOL_ARGS === '1' ? callsArgs[i]?.args : { _template: callsArgs[i]?.args };
      ndjson({
        type: 'assistant',
        message: {
          id: `${msgId}_t${i}`,
          type: 'message',
          role: 'assistant',
          model,
          content: [{ type: 'tool_use', id: t.callId, name: `mcp__${serverNames[0] ?? 'mcp'}__${t.tool}`, input }],
          stop_reason: 'tool_use',
          usage: usageObject(tok),
        },
        ...base,
        uuid: uuid(),
      });
      ndjson({
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: t.callId, content: t.text, is_error: t.isError }],
        },
        ...base,
        uuid: uuid(),
      });
    });
    if (flags.has('--include-partial-messages')) {
      const sev = (event: object) =>
        ndjson({ type: 'stream_event', event, ...base, uuid: uuid(), api_message_id: msgId });
      sev({
        type: 'message_start',
        message: {
          id: msgId,
          type: 'message',
          role: 'assistant',
          model,
          content: [],
          usage: usageObject({ ...tok, output: 0 }),
        },
      });
      sev({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
      for (const chunk of text.match(/.{1,20}(?:\s|$)|\S+/gs) ?? [])
        sev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: chunk } });
      sev({ type: 'content_block_stop', index: 0 });
      sev({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: usageObject(tok) });
      sev({ type: 'message_stop' });
    }
    ndjson({
      type: 'assistant',
      message: {
        id: msgId,
        type: 'message',
        role: 'assistant',
        model,
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
        usage: usageObject(tok),
      },
      ...base,
      uuid: uuid(),
    });
    ndjson({
      type: 'rate_limit_event',
      rate_limit_info: {
        status: 'allowed',
        resetsAt: Math.floor(nowMs(env) / 1000) + 18_000,
        rateLimitType: 'five_hour',
      },
      uuid: uuid(),
      session_id: sid,
    });
  }
  emit(text, false, tok, { model: r.model });
  if (r.latestCliVersion && fmt === 'text') err(`Update available: ${r.latestCliVersion}\n`); // version_drift
}

// ---------------------------------------------------------------- auth
function authLoginUrl(): string {
  const rnd = () => Buffer.from(uuid().replace(/-/g, ''), 'hex').toString('base64url');
  return `https://auth.fake-claude.invalid/oauth/authorize?code=true&client_id=GA-FAKE-CLIENT&response_type=code&code_challenge=${rnd()}&code_challenge_method=S256&state=${rnd()}`;
}

async function authLogin(): Promise<void> {
  const sc = readScenario(env);
  const timeoutMs = Number(env.GA_FAKE_LOGIN_TIMEOUT_MS ?? 300_000);
  // GIẢ ĐỊNH CL-LOGIN-1: lời nhắc và thời hạn của `claude auth login` trong container (Spike 1c)
  out(`If the browser didn't open, visit:\n${authLoginUrl()}\nPaste code here if prompted > `);
  const ok = await new Promise<boolean>((resolve) => {
    const rl = createInterface({ input: process.stdin, terminal: false });
    const timer = setTimeout(() => {
      rl.close();
      resolve(false);
    }, timeoutMs);
    rl.on('line', (l) => {
      if (l.trim() && sc?.name !== 'login_abandoned') {
        clearTimeout(timer);
        rl.close();
        resolve(true);
      }
    });
  });
  if (!ok) die(1, '\nLogin timed out');
  writeCredential('claude', env);
  out('\nLogin successful.\n');
}

async function authStatus(): Promise<void> {
  const cred = readCredential('claude', env);
  const sc = readScenario(env);
  const viaEnv = env.CLAUDE_CODE_OAUTH_TOKEN ? 'oauth_token' : env.ANTHROPIC_API_KEY ? 'api_key' : null;
  const loggedIn = Boolean(cred) || viaEnv !== null;
  // Spike 1b: JSON có loggedIn / authMethod / apiProvider; CHƯA thấy trường danh tính (G-23) ⇒ chỉ in khi bật GA_FAKE_PRINT_IDENTITY=1
  const o: Record<string, unknown> = {
    loggedIn,
    authMethod: cred ? 'oauth_token' : (viaEnv ?? 'none'),
    apiProvider: 'firstParty',
  };
  if (env.GA_FAKE_PRINT_IDENTITY === '1' && cred) o.email = await whoami(sc, cred.account, env);
  out(`${JSON.stringify(o, null, 2)}\n`);
  process.exitCode = loggedIn ? 0 : 1; // GIẢ ĐỊNH CL-AUTH-STATUS-1: exit 1 khi chưa đăng nhập
}

// ---------------------------------------------------------------- main
async function main(): Promise<void> {
  const help = data('help.txt');
  const argv = process.argv.slice(2);
  const options = parseOptions(help);
  const scNow = readScenario(env);
  if (argv.includes('--version') || argv.includes('-v')) {
    return out(
      env.GA_FAKE_VERSION
        ? `${env.GA_FAKE_VERSION}\n`
        : scNow?.name === 'version_drift'
          ? '2.2.0 (Claude Code)\n'
          : `${VERSION}\n`,
    );
  }
  if (argv[0] === 'auth') {
    const sub = argv[1];
    if (sub === 'status') return authStatus();
    if (sub === 'login') return authLogin();
    if (sub === 'logout') {
      const c = readCredential('claude', env);
      if (c) rmSync(c.path, { force: true }); // xoá tệp (nếu là symlink thì chỉ xoá symlink, tệp đích ở /auth còn nguyên)
      return out('Logged out.\n');
    }
    return out(
      help.includes('auth')
        ? 'Usage: claude auth [options] [command]\n\nManage authentication\n\nCommands:\n  login\n  logout\n  status\n'
        : '',
    );
  }
  if (argv[0] === 'mcp' && argv[1] === 'list')
    return out('No MCP servers configured. Use `claude mcp add` to add a server.\n');
  const p = parseArgs(argv, options);
  if (p.flags.has('-h') || p.flags.has('--help')) return out(help);
  if (p.flags.has('-p') || p.flags.has('--print')) return runPrint(p);
  die(2, 'fake-claude: chỉ hỗ trợ -p/--print, `auth status|login|logout`, `mcp list`, --version, --help');
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (e: unknown) => {
    err(`fake-claude: lỗi nội bộ: ${(e as Error).stack ?? e}\n`);
    process.exit(70);
  },
);
