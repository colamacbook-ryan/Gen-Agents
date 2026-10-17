import { describe, expect, it } from 'vitest';
import { collectNodes, defOf } from '../../src/api/introspect.ts';
import {
  ALL_ERROR_CODES,
  API_ERROR_CODES,
  API_ERROR_HTTP,
  DB_ERROR_CODES,
  expandRouteErrors,
  expectedLane,
  fullPath,
  HTTP_METHODS,
  LANES,
  M2_ROUTES,
  pathParamNames,
  ROUTES,
  recoveryAllowlist,
  recoveryDecision,
  requiredAccess,
  requiresCsrf,
  routeById,
  routeErrors,
} from '../../src/index.ts';

// Contract test meta của registry route (BACKEND-TRIAL §3.1): id / path duy nhất, đủ 196 route M2 (+5 EXT), lane đúng dải,
// tham số đường dẫn khớp schema, O4 / idempotent / mã lỗi khớp đặc tả.

const ids = (...parts: string[]) =>
  parts.flatMap((p) => {
    const m = /^([A-Z]+)-(\d+)(?:\.\.(\d+))?$/.exec(p);
    if (!m) throw new Error(p);
    const from = Number(m[2]);
    const to = m[3] === undefined ? from : Number(m[3]);
    return Array.from({ length: to - from + 1 }, (_, i) => `${m[1]}-${String(from + i).padStart(2, '0')}`);
  });

describe('registry — số lượng và định danh', () => {
  it('201 route = 196 M2 + 5 EXT; đúng số route mỗi lane', () => {
    expect(ROUTES.length).toBe(201);
    expect(M2_ROUTES.length).toBe(196);
    const count = (lane: string) => ROUTES.filter((r) => r.lane === lane).length;
    expect(count('L-SYS')).toBe(35);
    expect(count('L-HR')).toBe(50);
    expect(count('L-GW')).toBe(32);
    expect(count('L-WORK')).toBe(43);
    expect(count('L-OPS')).toBe(36);
    expect(count('L-SEC')).toBe(4);
    expect(count('L-RT')).toBe(1);
    expect(LANES.length).toBe(7);
  });

  it('đủ mọi ID của đặc tả: SYS-01…85, GW-01…32, WRK-01…43, OPS-01…36, EXT-01…05', () => {
    const want = [...ids('SYS-01..85', 'GW-01..32', 'WRK-01..43', 'OPS-01..36', 'EXT-01..05')];
    expect([...ROUTES.map((r) => r.id)].sort()).toEqual([...want].sort());
  });

  it('id duy nhất; (method, path đầy đủ) duy nhất', () => {
    expect(new Set(ROUTES.map((r) => r.id)).size).toBe(ROUTES.length);
    const keys = ROUTES.map((r) => `${r.method} ${fullPath(r)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('mọi path dưới /api/v1 (trừ WS /term ở gốc edge); method hợp lệ', () => {
    for (const r of ROUTES) {
      expect(HTTP_METHODS as readonly string[], r.id).toContain(r.method);
      if (r.mount === 'edge') {
        expect(r.id).toBe('EXT-05');
        expect(fullPath(r)).toBe('/term');
      } else expect(fullPath(r).startsWith('/api/v1/'), r.id).toBe(true);
    }
  });

  it('lane của route = lane theo dải ID (SYS-01…29 + 80…85 = L-SYS; SYS-30…79 = L-HR)', () => {
    for (const r of ROUTES) expect(r.lane, r.id).toBe(expectedLane(r.id));
    expect(expectedLane('SYS-29')).toBe('L-SYS');
    expect(expectedLane('SYS-30')).toBe('L-HR');
    expect(expectedLane('SYS-79')).toBe('L-HR');
    expect(expectedLane('SYS-80')).toBe('L-SYS');
    expect(expectedLane('SYS-86')).toBeNull();
  });

  it('routeById trả đúng route', () => {
    expect(routeById('GW-12')?.path).toBe('/engine-accounts/{accountRef}/api-key');
    expect(routeById('NOPE-01')).toBeUndefined();
  });
});

describe('registry — tham số đường dẫn, method, body', () => {
  it('tên {param} trong path = khoá request.params (hai chiều)', () => {
    for (const r of ROUTES) {
      const names = pathParamNames(r.path);
      const shape = r.request.params
        ? Object.keys((r.request.params as unknown as { shape: Record<string, unknown> }).shape)
        : [];
      expect([...names].sort(), r.id).toEqual([...shape].sort());
    }
  });

  it('GET / WS không có body; multipart chỉ SYS-21; WS chỉ EXT-05', () => {
    for (const r of ROUTES) {
      if (r.method === 'GET' || r.method === 'WS') expect(r.request.body, r.id).toBeUndefined();
    }
    expect(ROUTES.filter((r) => r.request.bodyKind === 'multipart').map((r) => r.id)).toEqual(['SYS-21']);
    expect(ROUTES.filter((r) => r.method === 'WS').map((r) => r.id)).toEqual(['EXT-05']);
  });

  it('response khớp method: 204 cho xoá / hành động không trả thân; 202 cho việc nền', () => {
    for (const r of ROUTES) {
      if (r.response.kind === 'empty') expect(r.response.status).toBe(204);
      if (r.response.kind === 'json' && r.response.status === 202)
        expect(['POST', 'DELETE', 'PUT'], r.id).toContain(r.method);
    }
    expect(routeById('SYS-19')?.response).toMatchObject({ kind: 'json', status: 202 });
    expect(routeById('SYS-36')?.response).toMatchObject({ kind: 'json', status: 202 });
    expect(routeById('SYS-28')?.response).toMatchObject({ kind: 'empty', status: 204 });
    expect(routeById('SYS-85')?.response.kind).toBe('sse');
    expect(routeById('OPS-23')?.response.kind).toBe('csv');
    expect(routeById('OPS-34')?.response.kind).toBe('csv');
    expect(routeById('OPS-31')?.response.kind).toBe('binary');
  });

  it('mọi route có lệnh CLI hoặc lý do `noCli`; route ngoài màn có `cliOnly` (kiểm ở coverage.test)', () => {
    for (const r of ROUTES) expect(r.cli.length > 0 || r.noCli !== undefined, r.id).toBe(true);
    expect(
      ROUTES.filter((r) => r.noCli)
        .map((r) => r.id)
        .sort(),
    ).toEqual(['SYS-62', 'WRK-04']);
    expect(routeById('SYS-62')?.pendingDb).toBe(true);
    expect(ROUTES.filter((r) => r.pendingDb).map((r) => r.id)).toEqual(['SYS-62']);
  });
});

describe('registry — quyền', () => {
  it('quyền thuộc {public, V, A, O}; chỉ EXT-01 và OPS-01 công khai', () => {
    for (const r of ROUTES) expect(['public', 'V', 'A', 'O'], r.id).toContain(r.auth);
    expect(
      ROUTES.filter((r) => r.auth === 'public')
        .map((r) => r.id)
        .sort(),
    ).toEqual(['EXT-01', 'OPS-01']);
  });

  it('route chỉ owner (O) đúng đặc tả', () => {
    const want = [
      'SYS-02',
      'SYS-04',
      'SYS-05',
      'SYS-07',
      'SYS-10',
      'SYS-11',
      'SYS-36',
      'SYS-79',
      // GW-07, GW-08: nâng từ A lên O (rà soát bảo mật 2026-10-17); GW-11…14 theo đặc tả; GW-03/04, OPS-14: mọi update / pin = owner.
      'GW-03',
      'GW-04',
      'GW-07',
      'GW-08',
      'GW-11',
      'GW-12',
      'GW-13',
      'GW-14',
      'WRK-02',
      'WRK-03',
      'WRK-05',
      'WRK-07',
      'WRK-08',
      'WRK-11',
      'WRK-12',
      'OPS-10',
      'OPS-11',
      'OPS-14',
      'OPS-15',
      'OPS-30',
      'OPS-31',
      'EXT-05',
    ];
    expect(
      ROUTES.filter((r) => r.auth === 'O')
        .map((r) => r.id)
        .sort(),
    ).toEqual([...want].sort());
  });

  it('ownerWhen: trường tồn tại trong request; requiredAccess nâng lên O đúng lúc', () => {
    const withOwnerWhen = ROUTES.filter((r) => r.ownerWhen.length > 0)
      .map((r) => r.id)
      .sort();
    expect(withOwnerWhen).toEqual(['GW-10', 'GW-29', 'GW-31', 'OPS-03', 'OPS-07', 'OPS-08', 'SYS-45', 'WRK-14']);
    const ops03 = routeById('OPS-03');
    // Telegram allowlist (H2): thêm người = nới ⇒ cả WRK-03 và WRK-05 là O không điều kiện; WRK-05 không còn body `asOwner`.
    for (const id of ['WRK-03', 'WRK-05']) {
      expect(routeById(id)?.auth, id).toBe('O');
      expect(routeById(id)?.ownerWhen, id).toEqual([]);
    }
    expect(routeById('WRK-05')?.request.body).toBeUndefined();
    expect(routeById('WRK-04')?.auth).toBe('A');
    expect(routeById('WRK-06')?.auth).toBe('A');
    // OPS-03: `backup.remote_anchor` chỉ owner (admin không ghi được); khoá chung vẫn A; khoá lạ ⇒ O (fail-closed).
    expect(ops03 && requiredAccess(ops03, { params: { settingKey: 'backup.remote_anchor' } })).toBe('O');
    // H4: purge.grace_days nới hàng rào (giữ dữ liệu xoá) ⇒ owner; khoá thuần giao diện vẫn A.
    expect(ops03 && requiredAccess(ops03, { params: { settingKey: 'purge.grace_days' } })).toBe('O');
    expect(ops03 && requiredAccess(ops03, { params: { settingKey: 'ui.avatar_motion' } })).toBe('A');
    expect(ops03 && requiredAccess(ops03, { params: { settingKey: 'no.such_key' } })).toBe('O');
    expect(ops03 && requiredAccess(ops03, {})).toBe('O');
    // OPS-07: thêm luật `allow` (mở đường dữ liệu đi ra) = nới ⇒ O; thêm `deny` = siết ⇒ A.
    const ops07 = routeById('OPS-07');
    expect(ops07 && requiredAccess(ops07, { body: { action: 'allow' } })).toBe('O');
    expect(ops07 && requiredAccess(ops07, { body: { action: 'deny' } })).toBe('A');
    // GW-29 / GW-31 (tool grant): `allow` / `ask` = nới ⇒ O; `deny` = siết ⇒ A.
    for (const id of ['GW-29', 'GW-31']) {
      const r = routeById(id);
      const field = id === 'GW-29' ? 'decision' : 'mode';
      expect(r && requiredAccess(r, { body: { [field]: 'allow' } }), `${id} allow`).toBe('O');
      expect(r && requiredAccess(r, { body: { [field]: 'ask' } }), `${id} ask`).toBe('O');
      expect(r && requiredAccess(r, { body: { [field]: 'deny' } }), `${id} deny`).toBe('A');
      expect(r && requiredAccess(r, { body: {} }), `${id} thiếu trường`).toBe('A');
    }
    // GW-10: BẬT binding (gắn credential vào container) = nới ⇒ O; tắt / đổi model / effort = A.
    const gw10 = routeById('GW-10');
    expect(gw10 && requiredAccess(gw10, { body: { enabled: true } })).toBe('O');
    expect(gw10 && requiredAccess(gw10, { body: { enabled: false } })).toBe('A');
    expect(gw10 && requiredAccess(gw10, { body: { modelKey: 'model-1', effort: 'high' } })).toBe('A');
    expect(gw10 && requiredAccess(gw10, { body: { modelKey: 'model-1', enabled: true } })).toBe('O');
    // GW-20: đo trên binding của Role (bindingRef), không còn accountRef tuỳ ý.
    const gw20body = routeById('GW-20')?.request.body;
    expect(gw20body?.safeParse({ bindingRef: 'EB-0001' }).success).toBe(true);
    expect(gw20body?.safeParse({ accountRef: 'EN-0001' }).success).toBe(false);
    expect(gw20body?.safeParse({}).success).toBe(true);
    // SYS-45: đặt / gỡ hạn mức token và trần thưởng = nới ⇒ O; sửa tiêu đề / JD vẫn A. `null` (gỡ trần) cũng là nới.
    const sys45 = routeById('SYS-45');
    expect(sys45 && requiredAccess(sys45, { body: { dailyTokenQuota: 1000 } })).toBe('O');
    expect(sys45 && requiredAccess(sys45, { body: { rewardCapMinor: 5 } })).toBe('O');
    expect(sys45 && requiredAccess(sys45, { body: { rewardCapMinor: null } })).toBe('O');
    expect(sys45 && requiredAccess(sys45, { body: { title: 'T', jd: 'x' } })).toBe('A');
    expect(sys45 && requiredAccess(sys45, { body: { title: 'T', dailyTokenQuota: 0 } })).toBe('O');
    // WRK-14: TẮT chính sách chủ động = siết ⇒ A; BẬT = nới ⇒ O. WRK-11 / WRK-12 (đặt / reset trần) là O không điều kiện.
    const wrk14 = routeById('WRK-14');
    expect(wrk14 && requiredAccess(wrk14, { body: { enabled: true } })).toBe('O');
    expect(wrk14 && requiredAccess(wrk14, { body: { enabled: false } })).toBe('A');
    expect(wrk14 && requiredAccess(wrk14, { body: {} })).toBe('A');
    for (const id of ['WRK-11', 'WRK-12']) expect(routeById(id)?.auth, id).toBe('O');
    // OPS-08: xoá luật `deny` = nới ⇒ O; xoá `allow` = siết ⇒ A; không biết luật đã lưu ⇒ O (fail-closed).
    const ops08 = routeById('OPS-08');
    expect(ops08 && requiredAccess(ops08, { stored: { egressAction: 'deny' } })).toBe('O');
    expect(ops08 && requiredAccess(ops08, { stored: { egressAction: 'allow' } })).toBe('A');
    expect(ops08 && requiredAccess(ops08, {})).toBe('O');
    // route không có ownerWhen: giữ nguyên.
    const sys15 = routeById('SYS-15');
    expect(sys15 && requiredAccess(sys15, { body: { purpose: 'owner_change' } })).toBe('A');
  });

  it('CSRF: mọi method ghi (trừ route công khai) cần X-GA-CSRF', () => {
    expect(requiresCsrf({ method: 'GET', auth: 'V' })).toBe(false);
    expect(requiresCsrf({ method: 'POST', auth: 'public' })).toBe(false);
    expect(requiresCsrf({ method: 'POST', auth: 'V' })).toBe(true);
    expect(requiresCsrf({ method: 'DELETE', auth: 'O' })).toBe(true);
    expect(routeById('EXT-01') && requiresCsrf(routeById('EXT-01') as never)).toBe(false);
    expect(routeById('EXT-02') && requiresCsrf(routeById('EXT-02') as never)).toBe(true);
  });
});

describe('registry — chế độ khắc phục O4 (RecoveryGuard)', () => {
  const OPEN = [
    ...ids('SYS-08..13', 'SYS-14', 'SYS-15', 'SYS-77', 'SYS-81..85', 'SYS-06'),
    ...ids('GW-01', 'GW-02', 'GW-18', 'GW-25'),
    ...ids('WRK-09', 'WRK-14'),
    ...ids('OPS-01', 'OPS-12..16', 'OPS-19', 'OPS-20..25'),
    ...ids('EXT-01..04'),
  ];
  const CORE = [...ids('GW-05', 'GW-06', 'GW-11..16'), 'EXT-05'];
  const SETUP = ['SYS-01', 'SYS-02', 'SYS-03', 'SYS-04', 'SYS-05', 'SYS-07'];

  it('allowlist lấy từ cờ `recovery` của registry — đúng cột O4 của đặc tả', () => {
    const got = recoveryAllowlist()
      .map((r) => r.id)
      .sort();
    expect(got).toEqual([...new Set([...OPEN, ...CORE])].sort());
    // một nguồn duy nhất: allowlist = lọc ROUTES theo cờ.
    expect(recoveryAllowlist()).toEqual(ROUTES.filter((r) => r.recovery));
  });

  it('o4 `core`: recovery = true và chỉ tài khoản Core agent; `setup`: không mở khi recovery', () => {
    expect(
      ROUTES.filter((r) => r.recoveryCoreOnly)
        .map((r) => r.id)
        .sort(),
    ).toEqual([...CORE].sort());
    for (const r of ROUTES) if (r.recoveryCoreOnly) expect(r.recovery, r.id).toBe(true);
    expect(
      ROUTES.filter((r) => r.setupOnly)
        .map((r) => r.id)
        .sort(),
    ).toEqual([...SETUP].sort());
    for (const r of ROUTES) if (r.setupOnly) expect(r.recovery, r.id).toBe(false);
  });

  it('suspend mở khi recovery (công tắc dừng), resume thì không (khởi động lại container có credential)', () => {
    const suspend = routeById('SYS-77');
    const resume = routeById('SYS-78');
    expect(suspend?.recovery).toBe(true);
    expect(resume?.recovery).toBe(false);
    expect(resume && recoveryDecision(resume, { isCoreAgentAccount: true })).toBe('blocked');
    expect(resume && recoveryDecision(resume, { isCoreAgentAccount: false })).toBe('blocked');
  });

  it('recoveryDecision: ✗ luôn chặn; ✓ cho qua; ✓* chỉ với tài khoản Core agent', () => {
    const blocked = routeById('SYS-30');
    const open = routeById('SYS-08');
    const core = routeById('GW-12');
    expect(blocked && recoveryDecision(blocked, { isCoreAgentAccount: true })).toBe('blocked');
    expect(open && recoveryDecision(open, { isCoreAgentAccount: false })).toBe('allow');
    expect(core && recoveryDecision(core, { isCoreAgentAccount: true })).toBe('allow');
    expect(core && recoveryDecision(core, { isCoreAgentAccount: false })).toBe('blocked');
  });
});

describe('registry — ownerWhen khớp schema request', () => {
  it('mỗi điều kiện ownerWhen dạng trường trỏ tới khoá CÓ THẬT; giá trị so sánh hợp lệ theo schema (enum / boolean)', () => {
    let checked = 0;
    for (const r of ROUTES) {
      for (const w of r.ownerWhen) {
        if ('rule' in w) continue;
        const root = r.request[w.in];
        expect(root, `${r.id}: ownerWhen.in = ${w.in} nhưng route không khai ${w.in}`).toBeDefined();
        const nodes = collectNodes(root as never, w.in).filter((n) => n.key === w.field && n.type !== 'object');
        expect(nodes.length, `${r.id}: ownerWhen.field ${w.field} không có trong ${w.in}`).toBeGreaterThan(0);
        const values = 'equals' in w ? [w.equals] : 'equalsAny' in w ? [...w.equalsAny] : [];
        for (const node of nodes) {
          const def = defOf(node.schema);
          for (const v of values) {
            if (def.type === 'enum') expect(Object.values(def.entries as object), `${r.id}.${w.field}`).toContain(v);
            else if (def.type === 'boolean') expect(typeof v, `${r.id}.${w.field}`).toBe('boolean');
          }
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(3);
  });
});

describe('registry — route ghi chính sách truy cập (egress_rules / tool_grants)', () => {
  it('mọi route ghi egress_rules / tool_grants phải O hoặc có ownerWhen (chỉ phần SIẾT được ở mức A)', () => {
    const writers = ROUTES.filter((r) => r.writesAccessPolicy.length > 0);
    for (const r of writers)
      expect(r.auth === 'O' || r.ownerWhen.length > 0, `${r.id} ghi chính sách truy cập mà ai cũng nới được`).toBe(
        true,
      );
    // golden: thêm / bớt route ghi chính sách phải sửa test có chủ đích
    expect(writers.map((r) => r.id).sort()).toEqual([
      'GW-29',
      'GW-31',
      'OPS-07',
      'OPS-08',
      'WRK-03',
      'WRK-05',
      'WRK-11',
      'WRK-12',
      'WRK-14',
    ]);
    expect(writers.map((r) => `${r.id}:${r.writesAccessPolicy.join(',')}`).sort()).toEqual([
      'GW-29:tool_grants',
      'GW-31:tool_grants',
      'OPS-07:egress_rules',
      'OPS-08:egress_rules',
      'WRK-03:telegram_allowlist',
      'WRK-05:telegram_allowlist',
      'WRK-11:proactive_policies',
      'WRK-12:proactive_policies',
      'WRK-14:proactive_policies',
    ]);
  });
});

describe('registry — idempotent', () => {
  it('đúng SYS-19, SYS-74, WRK-23…26 bắt buộc Idempotency-Key (header + POST)', () => {
    const want = ['SYS-19', 'SYS-74', ...ids('WRK-23..26')];
    expect(
      ROUTES.filter((r) => r.idempotent)
        .map((r) => r.id)
        .sort(),
    ).toEqual([...want].sort());
    for (const r of ROUTES) {
      const hasHeader =
        r.request.headers !== undefined &&
        'idempotency-key' in (r.request.headers as unknown as { shape: object }).shape;
      if (r.id === 'SYS-85') continue;
      expect(hasHeader, r.id).toBe(r.idempotent);
      if (r.idempotent) expect(r.method, r.id).toBe('POST');
    }
  });
});

describe('registry — mã lỗi', () => {
  it('mọi mã lỗi một route khai đều có trong API_ERROR_CODES / DB_ERROR_CODES (hoặc `db.*`)', () => {
    const api = new Set<string>(API_ERROR_CODES);
    const db = new Set<string>(DB_ERROR_CODES);
    for (const r of ROUTES) {
      for (const code of [...r.errors, ...routeErrors(r)]) {
        const ok = code === 'db.*' || api.has(code) || db.has(code);
        expect(ok, `${r.id}: ${code}`).toBe(true);
      }
      for (const [code, reasons] of Object.entries(r.errorReasons)) {
        expect(
          routeErrors(r) as readonly string[],
          `${r.id}: errorReasons ${code} phải là mã route có thể trả`,
        ).toContain(code);
        expect(reasons?.length, `${r.id}: ${code}`).toBeGreaterThan(0);
      }
    }
  });

  it('mọi mã lỗi dùng đều có HTTP status; bảng HTTP khớp đúng tập mã (không thừa / thiếu)', () => {
    expect(Object.keys(API_ERROR_HTTP).sort()).toEqual([...ALL_ERROR_CODES].sort());
    for (const r of ROUTES)
      for (const code of expandRouteErrors(routeErrors(r)))
        expect(API_ERROR_HTTP[code], `${r.id}: ${code}`).toBeGreaterThanOrEqual(400);
  });

  it('bảng HTTP khớp §3.0 của đặc tả', () => {
    const want: Record<string, number> = {
      'validation.failed': 400,
      'auth.required': 401,
      'auth.csrf': 403,
      'auth.forbidden': 403,
      not_found: 404,
      conflict: 409,
      'recovery.blocked': 423,
      'auth.rate_limited': 429,
      internal: 500,
      'gate.core_agent_not_ready': 409,
      'gate.onboarding_incomplete': 409,
      'gate.sign_blocked': 409,
      'gate.card_blocked': 409,
      'consent.required': 422,
      'consent.notice_mismatch': 422,
      'engine.not_installed': 409,
      'engine.login_busy': 409,
      'capability.unavailable': 422,
      'turn.rejected': 409,
      'recovery.not_incident': 409,
      'telegram.token_invalid': 422,
      'telegram.capture_expired': 410,
      'telegram.code_invalid': 422,
      'telegram.code_expired': 410,
      'upload.too_large': 413,
      'upload.type_rejected': 415,
      'upload.not_clean': 422,
      'query.invalid': 400,
      'confirm.mismatch': 400,
      'idempotency.conflict': 409,
      'reflection.limit': 409,
    };
    for (const [code, status] of Object.entries(want))
      expect(API_ERROR_HTTP[code as keyof typeof API_ERROR_HTTP], code).toBe(status);
  });

  it('23 mã mới của §3.0 đều có trong API_ERROR_CODES và đều được dùng (riêng, hoặc tính từ cờ route)', () => {
    const NEW = [
      'auth.forbidden',
      'gate.core_agent_not_ready',
      'gate.onboarding_incomplete',
      'gate.sign_blocked',
      'gate.card_blocked',
      'consent.required',
      'consent.notice_mismatch',
      'engine.not_installed',
      'engine.login_busy',
      'capability.unavailable',
      'turn.rejected',
      'recovery.not_incident',
      'telegram.token_invalid',
      'telegram.capture_expired',
      'telegram.code_invalid',
      'telegram.code_expired',
      'upload.too_large',
      'upload.type_rejected',
      'upload.not_clean',
      'query.invalid',
      'confirm.mismatch',
      'idempotency.conflict',
      'reflection.limit',
    ];
    expect(NEW.length).toBe(23);
    const used = new Set(ROUTES.flatMap((r) => routeErrors(r)));
    for (const code of NEW) {
      expect(API_ERROR_CODES as readonly string[], code).toContain(code);
      expect(used.has(code as never), `${code} chưa route nào dùng`).toBe(true);
    }
  });

  it('routeErrors: recovery.blocked chỉ ở route O4 ✗; idempotency.conflict chỉ ở route idempotent; công khai bỏ mã phiên', () => {
    for (const r of ROUTES) {
      const codes = routeErrors(r);
      expect(codes.includes('recovery.blocked'), r.id).toBe(!r.recovery);
      expect(codes.includes('idempotency.conflict'), r.id).toBe(r.idempotent);
      if (r.auth === 'public') expect(codes.includes('auth.required'), r.id).toBe(false);
      else expect(codes.includes('auth.required'), r.id).toBe(true);
    }
    // mã riêng đáng chú ý
    expect(routeErrors(routeById('SYS-74') as never)).toContain('gate.card_blocked');
    expect(routeById('SYS-74')?.errors).toContain('gate.card_blocked');
    expect(routeById('GW-14')?.errors).toEqual(['engine.not_installed', 'consent.required', 'engine.login_busy']);
    expect(routeById('WRK-29')?.errors).toContain('reflection.limit');
    expect(routeById('OPS-33')?.errors).toContain('query.invalid');
  });
});
