import {
  type EngineFlagTable,
  EnginePlan,
  engineArgvViolations,
  engineEnvViolations,
  isForbiddenRuntimeEnvName,
  TURN_EXEC,
  type TurnPlan,
} from '@ga/contracts';
import { describe, expect, it } from 'vitest';
import { parseHelpFlags } from '../src/capabilities.ts';
import {
  API_KEY_VALUE_RE,
  assertEnvTable,
  assertPlanEnv,
  assertSecretEnvValue,
  assertToolRestriction,
  DEFAULT_TURN_TIMEOUT_MS,
  type EngineAdapterExt,
  type EnvSpec,
  EnvTableError,
  MAX_PROMPT_ARG_BYTES,
  MAX_SYSTEM_PROMPT_BYTES,
  planKit,
  TurnPlanError,
} from '../src/index.ts';
import {
  ADAPTERS,
  ALL_DECLARED_FLAGS,
  cases,
  fixture,
  probeInput,
  TICKET_FILE,
  TURN_ID,
  turnInput,
} from './helpers.ts';

// turnPlan / loginCheck / capabilityScan / loginArgv chạy TRONG ga-runner (contracts 5d4490b): argv[0] dưới
// /opt/engines/<slug>/, lệnh con + cờ chỉ từ bảng đóng của adapter, env chỉ từ bảng env đóng (mẫu giá trị chặt), model /
// effort theo mẫu chặt của contracts, không bao giờ để giá trị thành cờ.

function cli(plan: TurnPlan): Extract<TurnPlan, { kind: 'cli' }> {
  if (plan.kind !== 'cli') throw new Error('plan không phải cli');
  return plan;
}

/** Token dạng cờ trong argv (bỏ argv[0] và giá trị của cờ `value` dạng tách), bỏ phần `=giá-trị`. */
function flagTokens(table: EngineFlagTable, argv: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < argv.length; i++) {
    const t = argv[i] ?? '';
    if (!t.startsWith('-')) continue;
    const name = t.includes('=') ? t.slice(0, t.indexOf('=')) : t;
    out.push(name);
    if (!t.includes('=') && table.flags[name] === 'value') i++;
  }
  return out;
}

const RESUME_FLAGS = ['--resume', '-r', '--continue', '-c', '--conversation', '--session-id', '--fork-session'];

function allPlans(adapter: EngineAdapterExt): TurnPlan[] {
  const plans: TurnPlan[] = [
    adapter.turnPlan(turnInput({ model: 'm-1', effort: 'high', systemPrompt: 'Bạn là Mai.' })),
    adapter.turnPlan(turnInput({ authMethod: 'api_key' })),
  ];
  for (const authMethod of ['subscription', 'api_key', 'adc'] as const) {
    plans.push(adapter.loginCheck({ authMethod, ...probeInput() }).plan);
  }
  for (const authMode of ['none', 'oauth', 'api_key'] as const) {
    plans.push(...adapter.capabilityScan({ authMode, ...probeInput() }));
  }
  return plans;
}

for (const adapter of ADAPTERS) {
  const c = cases(adapter.slug);
  const helpFlags = new Set(parseHelpFlags(fixture(adapter.slug, c.adapter.helpFile)));

  describe(`kế hoạch chạy ${adapter.slug}`, () => {
    it('plan lượt hợp lệ theo schema contracts; argv[0] = binary dưới /opt/engines/<slug>/; không đặt HOME', () => {
      const plan = cli(adapter.turnPlan(turnInput()));
      EnginePlan.parse(plan);
      expect(plan.argv[0]).toBe(adapter.binaryPath);
      expect(plan.argv[0]?.startsWith(`/opt/engines/${adapter.slug}/`)).toBe(true);
      expect(Object.hasOwn(plan.env, 'HOME')).toBe(false);
      expect(plan.timeoutMs).toBe(DEFAULT_TURN_TIMEOUT_MS);
    });

    it('mọi argv (lượt, kiểm đăng nhập, quét, đăng nhập PTY) qua engineArgvViolations + engineEnvViolations của contracts', () => {
      const argvs = [
        ...allPlans(adapter).map((p) => cli(p).argv),
        [...adapter.loginArgv({ authMethod: 'subscription' })],
      ];
      for (const argv of argvs)
        expect(engineArgvViolations(argv, adapter.slug, adapter.flagTable), argv[1]).toEqual([]);
      for (const p of allPlans(adapter)) {
        const plan = cli(p);
        EnginePlan.parse(plan);
        expect(engineEnvViolations(plan.env, adapter.flagTable)).toEqual([]);
        assertPlanEnv(adapter.envTable, plan.env);
        for (const r of RESUME_FLAGS) expect(plan.argv, r).not.toContain(r);
      }
    });

    it('bảng cờ ⊆ cờ có thật ở --help (Spike 1b; hoặc đã gọi thật); cờ lượt ⊆ requiredTurnFlags ⊆ bảng', () => {
      const observed = new Set([
        ...helpFlags,
        ...c.adapter.flagsObservedOutsideHelp,
        ...c.adapter.flagsAssumedNotInHelp,
      ]);
      for (const f of Object.keys(adapter.flagTable.flags))
        expect(observed.has(f), `${f} không có trong --help`).toBe(true);
      for (const f of adapter.requiredTurnFlags) expect(Object.keys(adapter.flagTable.flags)).toContain(f);
      const plan = cli(adapter.turnPlan(turnInput({ model: 'm-1', effort: 'high', systemPrompt: 'x' })));
      for (const f of flagTokens(adapter.flagTable, plan.argv)) expect(adapter.requiredTurnFlags, f).toContain(f);
    });

    it('bảng env: hợp lệ, không biến loader / interpreter / HOME / PATH / proxy; flagTable.env = tên trong bảng', () => {
      assertEnvTable(adapter.envTable);
      expect([...adapter.flagTable.env].sort()).toEqual(adapter.envTable.map((e) => e.name).sort());
      for (const e of adapter.envTable) expect(isForbiddenRuntimeEnvName(e.name), e.name).toBe(false);
      const secret = adapter.envTable.filter((e) => e.source === 'secret').map((e) => e.name);
      expect(secret).toEqual(adapter.apiKeyEnvName === null ? [] : [adapter.apiKeyEnvName]);
      if (adapter.apiKeyEnvName !== null) {
        assertSecretEnvValue(adapter.envTable, adapter.apiKeyEnvName, 'not_a_real_key_000000');
        for (const bad of [
          '',
          'short',
          'có dấu cách nhé đủ dài',
          'abc\ndefghijklmnopqrstu',
          'a'.repeat(300),
          '$(id)xxxxxxxxxxxxxxxx',
        ]) {
          expect(() => assertSecretEnvValue(adapter.envTable, adapter.apiKeyEnvName ?? '', bad), bad).toThrow(
            EnvTableError,
          );
        }
      }
    });

    it('giới hạn công cụ (sandbox-parity): (a) thiếu năng lực ⇒ engine_unrestricted, không dựng plan', () => {
      const r = adapter.toolRestriction;
      expect(r).not.toBeNull();
      const cases: Array<readonly string[] | undefined> = [
        undefined,
        [],
        [...helpFlags].filter((f) => !(r?.requiredFlags ?? []).includes(f)),
      ];
      for (const req of r?.requiredFlags ?? []) cases.push(ALL_DECLARED_FLAGS.filter((f) => f !== req));
      for (const detectedFlags of cases) {
        let err: unknown;
        try {
          adapter.turnPlan(turnInput({ detectedFlags }));
        } catch (e) {
          err = e;
        }
        expect(err, JSON.stringify(detectedFlags)?.slice(0, 60)).toBeInstanceOf(TurnPlanError);
        expect((err as TurnPlanError).code).toBe('engine_unrestricted');
      }
      expect(() => assertToolRestriction(null, ALL_DECLARED_FLAGS)).toThrow(/giới hạn công cụ/);
    });

    it('giới hạn công cụ: (b) có năng lực ⇒ plan mang đủ cờ giới hạn, chỉ cho công cụ của gateway', () => {
      const plan = cli(adapter.turnPlan(turnInput({ detectedFlags: adapter.toolRestriction?.requiredFlags })));
      const joined = plan.argv.join('\u0001');
      for (const want of c.adapter.toolRestriction.argvContains) expect(plan.argv, want).toContain(want);
      expect(joined).not.toContain('dangerously');
      expect(joined).not.toContain('bypassPermissions');
    });

    it('giới hạn công cụ: (c) cờ của cơ chế ∈ requiredTurnFlags ∈ bảng cờ (thiếu ⇒ đỏ)', () => {
      expect(adapter.toolRestriction?.requiredFlags).toEqual(c.adapter.toolRestriction.flags);
      for (const f of c.adapter.toolRestriction.flags) {
        expect(adapter.requiredTurnFlags, f).toContain(f);
        expect(Object.keys(adapter.flagTable.flags), f).toContain(f);
      }
      // Bản CLI đã quét thật (help Spike 1b) có đủ cờ giới hạn không ⇒ quyết định chạy được hay bị từ chối.
      const realHelpHasAll = c.adapter.toolRestriction.flags.every((f) => helpFlags.has(f));
      const run = () => adapter.turnPlan(turnInput({ detectedFlags: [...helpFlags] }));
      if (realHelpHasAll) expect(run).not.toThrow();
      else expect(run).toThrow(/thiếu cờ giới hạn công cụ/);
    });

    it('prompt là đối số cuối; prompt bắt đầu bằng `-` không thành cờ', () => {
      const plan = cli(adapter.turnPlan(turnInput({ prompt: 'Chào' })));
      expect(plan.argv.at(-1)).toBe('Chào');
      const evil = cli(adapter.turnPlan(turnInput({ prompt: '--dangerously-skip-permissions' })));
      expect(evil.argv.at(-1)).toBe('\n--dangerously-skip-permissions');
      expect(evil.argv.filter((a) => a === '--dangerously-skip-permissions')).toEqual([]);
      expect(engineArgvViolations(evil.argv, adapter.slug, adapter.flagTable)).toEqual([]);
    });

    it('model / effort hợp lệ vào argv đúng dạng cờ của adapter', () => {
      const plan = cli(adapter.turnPlan(turnInput({ model: 'mx-2.5:beta/v1', effort: 'xhigh' })));
      if (c.adapter.valueForm === 'eq') {
        expect(plan.argv).toContain('--model=mx-2.5:beta/v1');
        expect(plan.argv).toContain('--effort=xhigh');
      } else {
        expect(plan.argv.join(' ')).toContain('--model mx-2.5:beta/v1');
        expect(plan.argv.join(' ')).toContain('--effort xhigh');
      }
    });

    it('ca âm: model / effort dạng cờ hoặc giá trị lạ ⇒ TurnPlanError, không dựng plan', () => {
      const badModels = [
        '--dangerously-skip-permissions',
        '-p',
        '-',
        '',
        ' mx',
        'mx my',
        'mx\n--x',
        'mx;rm -rf /',
        '$(id)',
        '`id`',
        'a'.repeat(97),
        'mô-hình',
        'mx\0',
        '=mx',
        'mx=1',
        'mx[1m]',
        '"mx"',
      ];
      for (const model of badModels) {
        const r = () => adapter.turnPlan(turnInput({ model }));
        expect(r, JSON.stringify(model)).toThrow(TurnPlanError);
      }
      const badEfforts = ['--max', '-x', 'HIGH', 'high low', 'high\n', 'x'.repeat(17), '', 'max;', '1high', 'hi=gh'];
      for (const effort of badEfforts) {
        expect(() => adapter.turnPlan(turnInput({ effort })), JSON.stringify(effort)).toThrow(TurnPlanError);
      }
    });

    it('ca âm: đường dẫn / gateway / kích thước / timeout sai ⇒ TurnPlanError đúng mã', () => {
      const bad: Array<[Record<string, unknown>, string]> = [
        [{ homeDir: '/tmp/home' }, 'invalid_path'],
        [{ homeDir: `/run/ga/${TURN_ID}/../home` }, 'invalid_path'],
        [{ turnDir: 'run/ga/x' }, 'invalid_path'],
        [{ ticketFile: '/etc/ticket' }, 'invalid_path'],
        [{ authDir: '/auth/../etc' }, 'invalid_path'],
        [{ promptFile: '/etc/passwd' }, 'invalid_path'],
        [{ systemPromptFile: `/run/ga/${TURN_ID}/../x` }, 'invalid_path'],
        [{ gatewayUrl: 'file:///etc/passwd' }, 'invalid_gateway_url'],
        [{ gatewayUrl: 'not a url' }, 'invalid_gateway_url'],
        [{ prompt: '   ' }, 'empty_prompt'],
        [{ prompt: 'a'.repeat(MAX_PROMPT_ARG_BYTES + 1) }, 'prompt_too_large'],
        [{ prompt: 'ệ'.repeat(Math.ceil(MAX_PROMPT_ARG_BYTES / 3) + 1) }, 'prompt_too_large'],
        [{ systemPrompt: 'ệ'.repeat(Math.ceil(MAX_SYSTEM_PROMPT_BYTES / 3) + 1) }, 'system_prompt_too_large'],
        [{ systemPrompt: 'a'.repeat(MAX_SYSTEM_PROMPT_BYTES + 1) }, 'system_prompt_too_large'],
        [{ timeoutMs: 5 }, 'invalid_timeout'],
        [{ timeoutMs: 1.5e7 }, 'invalid_timeout'],
      ];
      for (const [over, code] of bad) {
        let err: unknown;
        try {
          adapter.turnPlan(turnInput(over));
        } catch (e) {
          err = e;
        }
        expect(err, JSON.stringify(over).slice(0, 80)).toBeInstanceOf(TurnPlanError);
        expect((err as TurnPlanError).code, JSON.stringify(over).slice(0, 80)).toBe(code);
      }
    });

    it('cấu hình MCP trỏ gateway qua cầu ga-runner, đọc vé từ tệp — không nhúng vé, không lộ vé qua env', () => {
      const plan = cli(adapter.turnPlan(turnInput()));
      const mcp = plan.files.find((f) => f.path === c.adapter.mcpConfigFile);
      expect(mcp).toBeDefined();
      expect(mcp?.mode).toBe(0o400);
      const cfg = JSON.parse(mcp?.content ?? '{}') as Record<string, unknown>;
      const servers = (cfg.mcpServers ?? cfg) as Record<string, { type: string; command: string; args: string[] }>;
      const server = Object.values(servers)[0];
      expect(server?.type).toBe('stdio');
      expect(server?.command).toBe(TURN_EXEC.argv[0]);
      expect(server?.args).toEqual(['mcp-bridge', '--url', 'http://ga-app:7410/mcp', '--ticket-file', TICKET_FILE]);
      expect(JSON.stringify(plan.env)).not.toContain('ticket');
      for (const f of plan.files) expect(f.path.startsWith('/') || f.path.split('/').includes('..')).toBe(false);
    });

    it('khối hệ thống đi đúng chỗ adapter khai (tệp chỉ dẫn trong cwd hoặc cờ dạng =)', () => {
      const sys = '- Luôn trả lời ngắn.';
      const plan = cli(adapter.turnPlan(turnInput({ systemPrompt: sys })));
      if (c.adapter.systemPrompt.in === 'file') {
        const path = c.adapter.systemPrompt.path;
        expect(plan.files.find((f) => f.path === path)?.content).toBe(sys);
      } else {
        expect(plan.argv).toContain(`${c.adapter.systemPrompt.flag}=${sys}`);
      }
      const none = cli(adapter.turnPlan(turnInput({ systemPrompt: '  ' })));
      expect(none.argv.join('\n')).not.toContain('Luôn trả lời');
    });

    it('chế độ API key thêm đúng tệp cấu hình adapter khai; bí mật không bao giờ nằm trong plan', () => {
      const plan = cli(adapter.turnPlan(turnInput({ authMethod: 'api_key' })));
      for (const p of c.adapter.apiKeyFiles) expect(plan.files.map((f) => f.path)).toContain(p);
      if (adapter.apiKeyEnvName !== null) expect(Object.hasOwn(plan.env, adapter.apiKeyEnvName)).toBe(false);
    });

    it('timeout tuỳ chỉnh được tôn trọng', () => {
      expect(cli(adapter.turnPlan(turnInput({ timeoutMs: 120_000 }))).timeoutMs).toBe(120_000);
    });

    it('kiểm đăng nhập / quét: ca âm đường tmpfs sai ⇒ TurnPlanError', () => {
      for (const over of [{ homeDir: '/auth/EN-0001' }, { probeDir: 'relative' }, { authDir: '/auth/../x' }]) {
        expect(() => adapter.loginCheck({ authMethod: 'subscription', ...probeInput(over) })).toThrow(TurnPlanError);
        expect(() => adapter.capabilityScan({ authMode: 'none', ...probeInput(over) })).toThrow(TurnPlanError);
      }
    });
  });
}

describe('ArgvBuilder + planKit (bảng đóng)', () => {
  const table: EngineFlagTable = {
    subcommands: ['auth', 'status'],
    flags: { '--model': 'value', '-p': 'switch', '--verbose': 'switch', '--out': 'value' },
    env: ['X_FLAG'],
  };
  const envTable: EnvSpec[] = [{ name: 'X_FLAG', pattern: /^1$/, source: 'plan', purpose: 't' }];
  const kit = planKit({ slug: 'eng-x', binaryName: 'ex', flagTable: table, envTable });
  const bin = kit.binaryPath;

  it('ca thuận', () => {
    expect(bin).toBe('/opt/engines/eng-x/current/ex');
    expect(kit.argv().sub('auth').sub('status').build()).toEqual([bin, 'auth', 'status']);
    expect(kit.argv().value('--model', 'm', 'eq').flag('-p').text('hi').build()).toEqual([
      bin,
      '--model=m',
      '-p',
      'hi',
    ]);
    expect(kit.argv().text('-x', '--out').build()).toEqual([bin, '--out', '\n-x']);
    const plan = kit.plan({ files: [], argv: kit.argv().flag('-p').build(), env: { X_FLAG: '1' }, timeoutMs: 1000 });
    expect(plan.kind).toBe('cli');
  });

  it('ca âm ArgvBuilder: cờ / lệnh con ngoài bảng, sai loại cờ, giá trị dạng cờ, NUL, văn bản không ở cuối', () => {
    const neg: Array<[() => unknown, string]> = [
      [() => kit.argv().flag('--dangerously-skip-permissions'), 'flag_not_in_table'],
      [() => kit.argv().value('--resume', 'abc', 'eq'), 'flag_not_in_table'],
      [() => kit.argv().sub('mcp'), 'subcommand_not_in_table'],
      [() => kit.argv().flag('-p').sub('auth'), 'subcommand_not_in_table'],
      [() => kit.argv().flag('--model'), 'invalid_value'],
      [() => kit.argv().value('-p', 'x', 'split'), 'invalid_value'],
      [() => kit.argv().value('--model', '--verbose', 'split'), 'invalid_value'],
      [() => kit.argv().value('--model', 'a\nb', 'split'), 'invalid_value'],
      [() => kit.argv().value('--model', '', 'eq'), 'invalid_value'],
      [() => kit.argv().value('--model', 'a\0', 'eq'), 'invalid_value'],
      [() => kit.argv().text('a').flag('-p'), 'invalid_value'],
      [() => kit.argv().text('a\0'), 'invalid_value'],
      [() => kit.argv().text('a', '-p'), 'invalid_value'],
    ];
    for (const [fn, code] of neg) {
      let err: unknown;
      try {
        fn();
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(TurnPlanError);
      expect((err as TurnPlanError).code).toBe(code);
    }
  });

  it('ca âm planKit.plan: argv / env tự dựng sai chính sách bị chặn (lớp thứ hai, cùng hàm contracts với runner)', () => {
    const bad: Array<{ argv: string[]; env: Record<string, string> }> = [
      { argv: ['/bin/sh', '-c', 'id'], env: {} },
      { argv: ['/opt/engines/other/current/ex', '-p'], env: {} },
      { argv: ['/opt/engines/eng-x/current/node', 'x.js'], env: {} },
      { argv: [bin, '--evil'], env: {} },
      { argv: [bin, '--model'], env: {} },
      { argv: [bin, '--model', '--verbose'], env: {} },
      { argv: [bin, '-p=1'], env: {} },
      { argv: [bin], env: { X_FLAG: '2' } },
      { argv: [bin], env: { OTHER: '1' } },
      { argv: [bin], env: { LD_PRELOAD: '/x.so' } },
    ];
    for (const p of bad) {
      expect(() => kit.plan({ files: [], ...p, timeoutMs: 1000 }), JSON.stringify(p)).toThrow(TurnPlanError);
    }
    expect(() => kit.checkedArgv(['/usr/bin/env', 'x'])).toThrow(TurnPlanError);
  });
});

describe('bảng env đóng: ca âm cho khai báo sai', () => {
  const ok: EnvSpec = { name: 'MY_TOOL_FLAG', pattern: /^1$/, source: 'plan', purpose: 't' };
  it('bảng hợp lệ qua', () => {
    expect(() =>
      assertEnvTable([ok, { name: 'MY_KEY', pattern: API_KEY_VALUE_RE, source: 'secret', purpose: 't' }]),
    ).not.toThrow();
  });
  const badNames = [
    'LD_PRELOAD',
    'LD_LIBRARY_PATH',
    'DYLD_INSERT_LIBRARIES',
    'NODE_OPTIONS',
    'NODE_EXTRA_CA_CERTS',
    'NPM_CONFIG_PREFIX',
    'PYTHONPATH',
    'PYTHONSTARTUP',
    'PERL5OPT',
    'RUBYOPT',
    'BASH_ENV',
    'ENV',
    'SHELL',
    'GIT_SSH_COMMAND',
    'GIT_CONFIG_GLOBAL',
    'JAVA_TOOL_OPTIONS',
    'HOME',
    'PATH',
    'TMPDIR',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'NO_PROXY',
    'ALL_PROXY',
    'FTP_PROXY',
    'SSL_CERT_FILE',
    'CURL_CA_BUNDLE',
    'APP_SESSION',
    'FOO_OAUTH_TOKEN',
    'GENAGENTS_MASTER_KEY',
    'GA_SUPERVISOR_KEY',
    // chặt hơn contracts (chỉ bộ lọc của engines bắt):
    'BUN_INSTALL',
    'DENO_DIR',
    'NPM_TOKEN',
    'LC_ALL',
    'SSL_KEY_LOG_FILE',
    'BASH_XTRACEFD',
    'FTP_PROXY',
    'MY_CA_BUNDLE_PATH',
    'lowercase',
    'BAD-NAME',
    '',
  ];
  for (const name of badNames) {
    it(`từ chối tên ${JSON.stringify(name)}`, () => {
      expect(() => assertEnvTable([{ ...ok, name }])).toThrow(EnvTableError);
    });
  }
  it('từ chối khai trùng, mẫu không neo, cờ m / s, mẫu nhận rỗng / xuống dòng', () => {
    const bad: EnvSpec[][] = [
      [ok, ok],
      [{ ...ok, pattern: /1/ }],
      [{ ...ok, pattern: /^1/ }],
      [{ ...ok, pattern: /1$/ }],
      [{ ...ok, pattern: /^1$/m }],
      [{ ...ok, pattern: /^.*$/s }],
      [{ ...ok, pattern: /^.*$/ }],
      [{ ...ok, pattern: /^[\s\S]+$/ }],
    ];
    for (const t of bad) expect(() => assertEnvTable(t), String(t[0]?.pattern)).toThrow(EnvTableError);
  });
  it('planKit từ chối nạp adapter có bảng env sai hoặc flagTable.env lệch bảng', () => {
    const flags = { '-p': 'switch' } as const;
    expect(() =>
      planKit({
        slug: 'eng-x',
        binaryName: 'ex',
        flagTable: { subcommands: [], flags, env: ['LD_PRELOAD'] },
        envTable: [{ ...ok, name: 'LD_PRELOAD' }],
      }),
    ).toThrow(EnvTableError);
    expect(() =>
      planKit({
        slug: 'eng-x',
        binaryName: 'ex',
        flagTable: { subcommands: [], flags, env: ['OTHER'] },
        envTable: [ok],
      }),
    ).toThrow(EnvTableError);
    expect(() =>
      planKit({ slug: '../x', binaryName: 'ex', flagTable: { subcommands: [], flags, env: [] }, envTable: [] }),
    ).toThrow(TurnPlanError);
  });
  it('env của plan: tên ngoài bảng, biến bí mật trong plan, giá trị sai mẫu ⇒ từ chối', () => {
    const table: EnvSpec[] = [ok, { name: 'MY_KEY', pattern: API_KEY_VALUE_RE, source: 'secret', purpose: 't' }];
    expect(() => assertPlanEnv(table, { MY_TOOL_FLAG: '1' })).not.toThrow();
    expect(() => assertPlanEnv(table, { OTHER: '1' })).toThrow(EnvTableError);
    expect(() => assertPlanEnv(table, { MY_KEY: 'abcdefghijklmnopqrst' })).toThrow(EnvTableError);
    expect(() => assertPlanEnv(table, { MY_TOOL_FLAG: '1\n' })).toThrow(EnvTableError);
    expect(() => assertPlanEnv(table, { MY_TOOL_FLAG: '0' })).toThrow(EnvTableError);
  });
});
