import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  buildTermWebSocketInit,
  DB_TIMESTAMP_RE,
  type EngineAdapter,
  EngineInstallStatus,
  EnvMap,
  ExecRequest,
  extractTermTicket,
  formatDisplayId,
  isEntityPrefix,
  mapDbError,
  PTY,
  PTY_CLOSE_REASONS,
  parseDisplayId,
  parseSettingValue,
  SETTINGS,
  SseEvent,
  sessionStatusFor,
  TermTicketClaims,
  TURN_EXEC,
  TurnPlan,
  TurnRequest,
  toDbTimestamp,
  UpdaterCommand,
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
      env: { LANG: 'C.UTF-8' },
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
  const base = {
    container: { name: 'ga-role-rl-0001' },
    env: { [TURN_EXEC.envTurnId]: ULID, [TURN_EXEC.envGatewayUrl]: 'http://ga-app:7410/mcp' },
    timeoutMs: 60_000,
  };
  it('lượt: argv ga-runner turn, vé ở stdin, env không chứa vé', () => {
    const req = ExecRequest.parse({
      ...base,
      argv: [...TURN_EXEC.argv],
      stdin: { kind: 'turn-ticket', ticket: 'x'.repeat(43) },
    });
    expect(Object.values(req.env).some((v) => v.includes('x'.repeat(43)))).toBe(false);
    expect(TURN_EXEC.ticketFile(ULID)).toBe(`/run/ga/${ULID}/ticket`);
  });
  it('argv[0] ngoài allowlist bị từ chối', () => {
    expect(ExecRequest.safeParse({ ...base, argv: ['sh', '-c', 'id'], stdin: { kind: 'none' } }).success).toBe(false);
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
  it('claims của vé chứa argv đăng nhập, không chứa token', () => {
    const claims = TermTicketClaims.parse({
      v: 1,
      acc: 'EN-0001',
      container: 'ga-sys-7k2q',
      argvLogin: ['login-cmd'],
      guiSessionHash: 'a'.repeat(64),
      exp: 1_800_000_000,
      nonce: 'n'.repeat(22),
    });
    expect(Object.keys(claims).sort()).toEqual([
      'acc',
      'argvLogin',
      'container',
      'exp',
      'guiSessionHash',
      'nonce',
      'v',
    ]);
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
    };
    expect(TurnRequest.safeParse(req).success).toBe(true);
    expect(TurnRequest.safeParse({ ...req, resume: 'abc' }).success).toBe(false);
  });
});

describe('mcp + settings + errors + events', () => {
  it('mặc định settings hợp lệ với chính schema của nó', () => {
    for (const [key, def] of Object.entries(SETTINGS)) {
      if (def.default === 'seed') continue;
      expect(def.schema.safeParse(def.default).success, key).toBe(true);
    }
    expect(() => parseSettingValue('chat.attachment_max_bytes', 0)).toThrow();
    expect(() => parseSettingValue('economy.penalty.harness_bp', 5000)).toThrow();
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
