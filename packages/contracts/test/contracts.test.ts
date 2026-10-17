import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  API_ERROR_CODES,
  AuthVolumeName,
  buildTermWebSocketInit,
  CERTAINTY_LEVELS,
  type Certainty,
  Consumer,
  DB_TIMESTAMP_RE,
  DesiredContainer,
  ENGINE_ARCHES,
  ENGINE_UNRESTRICTED_REASON,
  type EngineAdapter,
  EngineInstallStatus,
  EnsureContainerRequest,
  EnvMap,
  ExecRequest,
  execEnv,
  execStdinPayload,
  extractTermTicket,
  formatDisplayId,
  InstallSpec,
  installPlatformFor,
  isEntityPrefix,
  LOGIN_EXEC,
  loginExecEnv,
  MEASURE_KINDS,
  type MeasureKind,
  mapDbError,
  PTY,
  PTY_CLOSE_REASONS,
  parseDisplayId,
  parseSettingValue,
  RoleDisplayId,
  remoteAnchorAuthority,
  SETTINGS,
  SseEvent,
  screenToolPayload,
  sessionStatusFor,
  settingValueJson,
  settingWritableBy,
  TermTicketClaims,
  ToolArgs,
  TURN_EXEC,
  TURN_REJECTIONS,
  TurnPlan,
  type TurnPlanInput,
  TurnRejectedError,
  TurnRequest,
  TurnResult,
  toDbTimestamp,
  UpdaterCommand,
  WorkspaceCode,
} from '../src/index.ts';

const ULID = '01JABCDEFGHJKMNPQRSTVWXYZ0';
const TICKET = 'eyJ2IjoxfQ.c2lnbmF0dXJlLWJ5dGVz';

describe('ids — display_id', () => {
  it('đệm 4 chữ số, AU đệm 5, vượt độ rộng thì giữ nguyên', () => {
    expect(formatDisplayId('MM', 41)).toBe('MM-0041');
    expect(formatDisplayId('AU', 7)).toBe('AU-00007');
    expect(formatDisplayId('EV', 8842)).toBe('EV-8842');
    expect(formatDisplayId('TK', 12345)).toBe('TK-12345');
  });
  it('parse ngược đúng bảng; từ chối dạng sai', () => {
    expect(parseDisplayId('MM-0041')).toEqual({ prefix: 'MM', table: 'memories', seq: 41 });
    expect(parseDisplayId('MSG-0142')).toEqual({ prefix: 'MSG', table: 'chat_messages', seq: 142 });
    for (const bad of ['MM-41', 'MM-00041', 'AU-0007', 'XX-0001', 'mm-0041', 'MM-0000', 'AR-0001']) {
      expect(parseDisplayId(bad), bad).toBeNull();
    }
    expect(() => formatDisplayId('MM', 0)).toThrow(RangeError);
  });
  it('prefix GĐ2 không phải prefix MVP', () => {
    expect(isEntityPrefix('DR')).toBe(false);
    expect(isEntityPrefix('SN')).toBe(true);
  });
});

describe('clock', () => {
  it('toDbTimestamp ra đúng 24 ký tự UTC có mili-giây', () => {
    const ts = toDbTimestamp(new Date(Date.UTC(2026, 9, 14, 8, 0, 0, 5)));
    expect(ts).toBe('2026-10-14T08:00:00.005Z');
    expect(DB_TIMESTAMP_RE.test(ts)).toBe(true);
    expect(() => toDbTimestamp(new Date(Number.NaN))).toThrow(RangeError);
  });
});

describe('engine — env tiêm vào container (CNS-142)', () => {
  it('nhận biến thường, chặn *SESSION* / *_OAUTH_TOKEN / khoá nội bộ / tên sai dạng', () => {
    expect(EnvMap.parse({ GA_TURN_ID: ULID, GA_GATEWAY_URL: 'http://ga-app:7410/mcp' })).toBeTruthy();
    for (const name of [
      'FOO_OAUTH_TOKEN',
      'APP_SESSION_KEY',
      'SESSION',
      'GENAGENTS_MASTER_KEY',
      'GA_SUPERVISOR_KEY',
      'bad-name',
    ]) {
      expect(EnvMap.safeParse({ [name]: 'x' }).success, name).toBe(false);
    }
  });
  it('TurnPlan là union cli | http; tệp chỉ đường tương đối, không ..', () => {
    const cli = TurnPlan.parse({
      kind: 'cli',
      files: [{ path: 'prompt.md', content: 'x', mode: 0o400 }],
      argv: ['tool', '-p'],
      env: { NO_COLOR: '1' },
      timeoutMs: 1000,
    });
    expect(cli.kind).toBe('cli');
    const http = TurnPlan.parse({
      kind: 'http',
      endpoint: 'http://engine.local/v1/turn',
      request: { method: 'POST', headers: {}, body: '{}' },
      timeoutMs: 1000,
    });
    expect(http.kind).toBe('http');
    for (const path of ['/etc/passwd', '../x', 'a/../../b']) {
      const r = TurnPlan.safeParse({
        kind: 'cli',
        files: [{ path, content: '', mode: 0o400 }],
        argv: ['x'],
        env: {},
        timeoutMs: 1,
      });
      expect(r.success, path).toBe(false);
    }
  });
  it('EngineAdapter không có hàm resume (CNS-132)', () => {
    type ResumeKeys = Extract<keyof EngineAdapter, `resume${string}` | `${string}Resume${string}`>;
    expectTypeOf<ResumeKeys>().toEqualTypeOf<never>();
    expectTypeOf<EngineAdapter['nativeMemoryPolicy']>().toEqualTypeOf<'tmpfs-per-turn'>();
    expectTypeOf<EngineAdapter['authAllowlist']>().toEqualTypeOf<readonly string[] | 'unknown'>();
  });
  it('InstallSpec: platforms (arch × libc × khoá hãng) — không trùng; máy không khớp ⇒ null (unsupported_arch)', () => {
    const spec = {
      source: 'official',
      origin: 'https://downloads.example.com/cli/manifest.json',
      checksum: { algorithm: 'sha256', from: 'manifest' },
      selfUpdate: 'unknown',
      egressDomains: ['downloads.example.com'],
      platforms: [
        { arch: 'x64', libc: 'glibc', key: 'linux-x64' },
        { arch: 'arm64', libc: 'glibc', key: 'linux-arm64' },
      ],
    };
    const parsed = InstallSpec.parse(spec);
    expect(installPlatformFor(parsed, 'arm64', 'glibc')?.key).toBe('linux-arm64');
    expect(installPlatformFor(parsed, 'x64', 'musl')).toBeNull();
    expect(installPlatformFor(parsed, 'ia32', 'glibc')).toBeNull();
    expect(InstallSpec.safeParse({ ...spec, platforms: [] }).success).toBe(false);
    expect(InstallSpec.safeParse({ ...spec, platforms: [spec.platforms[0], spec.platforms[0]] }).success).toBe(false);
    expect(InstallSpec.safeParse({ ...spec, platforms: [{ arch: 'riscv64', libc: 'glibc', key: 'x' }] }).success).toBe(
      false,
    );
    expect([...ENGINE_ARCHES]).toEqual(['x64', 'arm64']);
  });
  it('lý do từ chối lượt / O4: engine_unrestricted (CLI không có cơ chế giới hạn công cụ đã kiểm)', () => {
    expect(TURN_REJECTIONS).toContain(ENGINE_UNRESTRICTED_REASON);
    expect(new TurnRejectedError('engine_unrestricted').reason).toBe('engine_unrestricted');
  });
  it('trạng thái cài CLI có đủ 4 trạng thái + lý do lỗi', () => {
    expect(EngineInstallStatus.parse({ state: 'not_installed' })).toEqual({ state: 'not_installed' });
    expect(EngineInstallStatus.parse({ state: 'installing', progressPct: 42, version: null }).state).toBe('installing');
    expect(
      EngineInstallStatus.safeParse({ state: 'failed', reason: 'checksum_mismatch', detail: 'sha512 lệch' }).success,
    ).toBe(true);
    expect(EngineInstallStatus.safeParse({ state: 'failed', reason: 'flaky', detail: '' }).success).toBe(false);
  });
});

describe('supervisor — exec + vé lượt qua stdin', () => {
  const base = { container: { name: 'ga-role-rl-0001' }, timeoutMs: 60_000 };
  it('lượt: argv cố định ga-runner turn, vé ở stdin, env do supervisor đặt không chứa vé', () => {
    const req = ExecRequest.parse({ ...base, run: { command: 'turn', turnId: ULID, ticket: 'x'.repeat(43) } });
    const env = execEnv(req.run, 'http://ga-app:7410/mcp');
    expect(Object.keys(env).sort()).toEqual([TURN_EXEC.envGatewayUrl, TURN_EXEC.envTurnId].sort());
    expect(Object.values(env).some((v) => v.includes('x'.repeat(43)))).toBe(false);
    expect(execStdinPayload(req.run)).toBe('x'.repeat(43));
    expect(TURN_EXEC.ticketFile(ULID)).toBe(`/run/ga/${ULID}/ticket`);
  });
  it('ga-app không gửi được argv / env', () => {
    const run = { command: 'turn', turnId: ULID, ticket: 'x'.repeat(43) };
    expect(ExecRequest.safeParse({ ...base, run, argv: ['sh', '-c', 'id'] }).success).toBe(false);
    expect(ExecRequest.safeParse({ ...base, run, env: { LD_PRELOAD: '/tmp/x.so' } }).success).toBe(false);
  });
});

describe('định tuyến: không chuỗi tự do (review tay M0, LOW)', () => {
  const role = { kind: 'role', roleId: ULID, roleDisplayId: 'RL-0001' };
  const sys = { kind: 'sys', workspaceId: ULID, workspaceCode: '7K2Q' };
  const desired = (over: Record<string, unknown>) => ({
    consumer: role,
    template: 'role.v1',
    desired: 'running',
    authVolumes: ['ga-auth-en-0001'],
    ...over,
  });
  it('Consumer: roleId / workspaceId là ULID, roleDisplayId RL-…, workspaceCode 4 ký tự chữ / số', () => {
    expect(Consumer.safeParse(role).success).toBe(true);
    expect(Consumer.safeParse(sys).success).toBe(true);
    for (const roleId of ['x'.repeat(26), `${ULID.slice(0, 25)}I`, '../../etc/passwd/aaaaaaaaaa']) {
      expect(Consumer.safeParse({ ...role, roleId }).success, roleId).toBe(false);
    }
    for (const roleDisplayId of ['RL-1', 'rl-0001', 'RL-0001; rm', 'TK-0001', 'RL-0001\n']) {
      expect(Consumer.safeParse({ ...role, roleDisplayId }).success, roleDisplayId).toBe(false);
    }
    for (const workspaceId of ['', 'abc', `${ULID}x`]) {
      expect(Consumer.safeParse({ ...sys, workspaceId }).success, workspaceId).toBe(false);
    }
    for (const workspaceCode of ['7K2', '7K2Q9', '7K-Q', '../a']) {
      expect(Consumer.safeParse({ ...sys, workspaceCode }).success, workspaceCode).toBe(false);
    }
  });
  it('authVolumes: chỉ ga-auth-en-<số> (cả EnsureContainerRequest lẫn DesiredContainer)', () => {
    expect(DesiredContainer.safeParse(desired({})).success).toBe(true);
    for (const v of ['ga-auth-en-abc', '/var/run/docker.sock', 'ga-auth-en-01', 'ga-engines', 'ga-auth-en-0001:/x']) {
      expect(DesiredContainer.safeParse(desired({ authVolumes: [v] })).success, v).toBe(false);
      expect(
        EnsureContainerRequest.safeParse({ consumer: role, template: 'role.v1', authVolumes: [v] }).success,
        v,
      ).toBe(false);
    }
    expect(AuthVolumeName.safeParse('ga-auth-en-000012').success).toBe(true);
  });
  it('send_telegram.chatRef = mã allowlist AL-…; chat_id / @username từ Role ⇒ invalid', () => {
    expect(screenToolPayload('send_telegram', { chatRef: 'AL-0001', text: 'Xong việc' }).status).toBe('ok');
    for (const chatRef of ['-1001234567890', '@owner_handle', 'AL-1', 'al-0001', 'AL-0001 ', '123456789']) {
      expect(screenToolPayload('send_telegram', { chatRef, text: 'x' }).status, chatRef).toBe('invalid');
    }
    expect(RoleDisplayId.safeParse('RL-0001').success && WorkspaceCode.safeParse('SYS0').success).toBe(true);
  });
});

describe('PTY — vé trong subprotocol, không trong URL (CNS-134)', () => {
  it('URL không chứa vé; subprotocol mang vé; supervisor tách lại được', () => {
    const { url, protocols } = buildTermWebSocketInit('https://host.example:7400', TICKET);
    expect(url).toBe('wss://host.example:7400/term');
    expect(url.includes(TICKET)).toBe(false);
    expect(protocols).toEqual([PTY.protocol, `${PTY.ticketProtocolPrefix}${TICKET}`]);
    expect(extractTermTicket(protocols.join(', '))).toBe(TICKET);
  });
  it('thiếu giao thức / vé sai dạng ⇒ null', () => {
    expect(extractTermTicket(null)).toBeNull();
    expect(extractTermTicket(`${PTY.ticketProtocolPrefix}${TICKET}`)).toBeNull();
    expect(extractTermTicket(`${PTY.protocol}, ${PTY.ticketProtocolPrefix}a b`)).toBeNull();
    expect(() => buildTermWebSocketInit('http://h', 'vé có dấu cách')).toThrow();
  });
  it('4 lý do đóng exec, trần 10 phút, nhịp kiểm 5 giây (G-26)', () => {
    expect([...PTY_CLOSE_REASONS]).toEqual(['login_ok', 'owner_done', 'ws_closed', 'max_duration']);
    expect(PTY.maxDurationSeconds).toBe(600);
    expect(PTY.loginCheckIntervalSeconds).toBe(5);
    expect(PTY.ticketTtlSeconds).toBe(60);
  });
  it('claims của vé chứa Ý ĐỊNH đăng nhập (slug + cách), không chứa argv / token', () => {
    const raw = {
      v: 2,
      acc: 'EN-0001',
      container: 'ga-sys-7k2q',
      engineSlug: 'x',
      authMethod: 'subscription',
      guiSessionHash: 'a'.repeat(64),
      exp: 1_800_000_000,
      nonce: 'n'.repeat(22),
    };
    const claims = TermTicketClaims.parse(raw);
    expect(Object.keys(claims).sort()).toEqual([
      'acc',
      'authMethod',
      'container',
      'engineSlug',
      'exp',
      'guiSessionHash',
      'nonce',
      'v',
    ]);
    expect(TermTicketClaims.safeParse({ ...raw, argvLogin: ['sh'] }).success).toBe(false);
    expect(TermTicketClaims.safeParse({ ...raw, v: 1 }).success).toBe(false);
    expect(loginExecEnv(claims)).toEqual({
      [LOGIN_EXEC.env.engineSlug]: 'x',
      [LOGIN_EXEC.env.engineAccount]: 'EN-0001',
      [LOGIN_EXEC.env.authMethod]: 'subscription',
    });
  });
});

describe('update — chỉ hai lệnh đóng, tham số bị bỏ (CNS-141, G-25)', () => {
  it('tham số lạ bị loại khỏi giá trị sau parse', () => {
    const parsed = UpdaterCommand.parse({
      command: 'start_update',
      version: '9.9.9',
      feedUrl: 'http://x',
      digest: 'sha256:0',
    });
    expect(parsed).toEqual({ command: 'start_update' });
    expect(UpdaterCommand.parse({ command: 'rollback_previous', to: 'v0.0.1' })).toEqual({
      command: 'rollback_previous',
    });
  });
  it('lệnh khác bị từ chối', () => {
    expect(UpdaterCommand.safeParse({ command: 'install', image: 'evil' }).success).toBe(false);
  });
});

describe('sessions', () => {
  it('ánh xạ kết quả → sessions.status', () => {
    const f = { timedOut: false, cancelled: false };
    expect(sessionStatusFor('ok', f)).toBe('ok');
    expect(sessionStatusFor('login_expired', f)).toBe('auth_required');
    expect(sessionStatusFor('AUTH_REQUIRED', f)).toBe('auth_required');
    expect(sessionStatusFor('quota_exhausted', f)).toBe('quota_exhausted');
    expect(sessionStatusFor('outage', f)).toBe('error');
    expect(sessionStatusFor('ok', { timedOut: true, cancelled: false })).toBe('timeout');
    expect(sessionStatusFor('ok', { timedOut: true, cancelled: true })).toBe('cancelled');
  });
  it('TurnRequest chặt: trường lạ bị từ chối', () => {
    const req = {
      workspaceId: ULID,
      agentKind: 'role',
      trigger: 'telegram',
      roleId: ULID,
      taskId: null,
      threadId: null,
      sourceMessageId: null,
      idempotencyKey: 'tg:1',
      timeoutMs: null,
      measure: null,
    };
    expect(TurnRequest.safeParse(req).success).toBe(true);
    expect(TurnRequest.safeParse({ ...req, resume: 'abc' }).success).toBe(false);
  });
  it('phiên đo (CNS-178): baseline ⇔ measure; tài khoản chỉ định; prompt_worst mang id bản worst', () => {
    const base = {
      workspaceId: ULID,
      agentKind: 'role',
      trigger: 'baseline',
      roleId: ULID,
      taskId: null,
      threadId: null,
      sourceMessageId: null,
      idempotencyKey: 'measure:1',
      timeoutMs: null,
    };
    for (const measure of [
      { kind: 'overhead_bare', engineAccountId: ULID },
      { kind: 'overhead_shell', engineAccountId: ULID },
      { kind: 'prompt_worst', engineAccountId: ULID, compiledPromptId: ULID },
    ]) {
      expect(TurnRequest.safeParse({ ...base, measure }).success, measure.kind).toBe(true);
      // measure ngoài baseline ⇒ từ chối
      expect(TurnRequest.safeParse({ ...base, trigger: 'chat', measure }).success, measure.kind).toBe(false);
    }
    expect(TurnRequest.safeParse({ ...base, measure: null }).success).toBe(false);
    expect(TurnRequest.safeParse({ ...base, measure: { kind: 'prompt_worst', engineAccountId: ULID } }).success).toBe(
      false,
    );
    expect(TurnRequest.safeParse({ ...base, measure: { kind: 'overhead', engineAccountId: ULID } }).success).toBe(
      false,
    );
    expect([...MEASURE_KINDS]).toEqual(['overhead_bare', 'overhead_shell', 'prompt_worst']);
    expectTypeOf<TurnPlanInput['measure']>().toEqualTypeOf<MeasureKind | null>();
  });
  it('TurnResult mang certainty (sure | unsure | null) + phase; report_task dùng cùng enum', () => {
    expectTypeOf<TurnResult['certainty']>().toEqualTypeOf<Certainty | null>();
    expectTypeOf<TurnResult['phase']>().toEqualTypeOf<'planning' | 'acting' | null>();
    expect(TurnResult.shape.certainty.safeParse('maybe').success).toBe(false);
    expect(ToolArgs.report_task.shape.certainty.safeParse('unsure').success).toBe(true);
    expect(ToolArgs.report_task.shape.certainty.safeParse('maybe').success).toBe(false);
    expect([...CERTAINTY_LEVELS]).toEqual(['sure', 'unsure']);
  });
});

describe('mcp + settings + errors + events', () => {
  it('mặc định settings hợp lệ với chính schema của nó', () => {
    for (const [key, def] of Object.entries(SETTINGS)) {
      if (def.default === 'seed' || def.default === 'absent') continue;
      expect(def.schema.safeParse(def.default).success, key).toBe(true);
    }
    expect(() => parseSettingValue('chat.attachment_max_bytes', 0)).toThrow();
    expect(() => parseSettingValue('economy.penalty.harness_bp', 5000)).toThrow();
  });
  it('backup.remote_anchor: chỉ owner / actor system ghi (admin không); URL HTTPS hẹp; đúng 2 khoá (CNS-176)', () => {
    expect(SETTINGS['backup.remote_anchor'].writers).toEqual(['owner', 'system']);
    expect(settingWritableBy('backup.remote_anchor', 'admin')).toBe(false);
    expect(settingWritableBy('backup.remote_anchor', 'owner')).toBe(true);
    // Review bảo mật PR #7: trần dung lượng upload là NỚI hàng rào ⇒ owner-only; admin chỉ ghi khoá thuần giao diện.
    expect(settingWritableBy('chat.attachment_max_bytes', 'admin')).toBe(false);
    expect(settingWritableBy('ui.avatar_motion', 'admin')).toBe(true);
    const ok = { url: 'https://git.example.com/afi/anchors.git', secret_id: ULID };
    expect(settingValueJson('backup.remote_anchor', ok)).toBe(JSON.stringify(ok));
    expect(remoteAnchorAuthority(ok.url)).toBe('git.example.com');
    expect(remoteAnchorAuthority('https://git.example.com')).toBe('git.example.com');
    for (const url of [
      'http://git.example.com/x',
      'ssh://git@git.example.com/x',
      'https://user:tok@git.example.com/x',
      'https://git.example.com/a b',
      'https://git.example.com/%2e%2e',
      'https://git.example.com\\@evil.com/',
      'https:///x',
      'https://git.example.com/x\n',
    ]) {
      expect(() => parseSettingValue('backup.remote_anchor', { url, secret_id: ULID }), url).toThrow();
      expect(remoteAnchorAuthority(url), url).toBeNull();
    }
    expect(() => parseSettingValue('backup.remote_anchor', { ...ok, token: 'x' })).toThrow();
    expect(() => parseSettingValue('backup.remote_anchor', { ...ok, secret_id: 'SEC-0001' })).toThrow();
  });
  it('mã lỗi đăng nhập của L-SEC có trong API_ERROR_CODES', () => {
    for (const c of ['auth.invalid_credentials', 'auth.locked', 'auth.weak_password']) {
      expect(API_ERROR_CODES as readonly string[], c).toContain(c);
    }
  });
  it('lỗi DB ánh xạ theo tiền tố, còn lại về db.rule_violation', () => {
    expect(mapDbError('append-only/write-once: proactive_sends')).toBe('db.append_only');
    expect(mapDbError('immutable identity: roles')).toBe('db.immutable_identity');
    expect(mapDbError('no such function: app_maint')).toBe('db.connection_contract');
    expect(mapDbError('FOREIGN KEY constraint failed')).toBe('db.fk_violation');
    expect(mapDbError('một chuỗi lạ')).toBe('db.rule_violation');
  });
  it('sự kiện SSE parse đúng union', () => {
    const ev = SseEvent.parse({
      id: '1',
      workspaceId: ULID,
      at: '2026-10-14T08:00:00.000Z',
      type: 'engine.install',
      engineSlug: 'x',
      status: { state: 'installed', version: '1.0.0', installedAt: '2026-10-14T08:00:00.000Z' },
    });
    expect(ev.type).toBe('engine.install');
    expect(
      SseEvent.safeParse({
        id: '1',
        workspaceId: ULID,
        at: 'x',
        type: 'pty.closed',
        engineAccountId: ULID,
        reason: 'timeout',
      }).success,
    ).toBe(false);
  });
});
