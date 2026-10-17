import { GRID_KEYS, ROUTES } from '@ga/contracts';
import { GridQueryError } from '@ga/ui/datagrid';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { type ApiClient, createApiClient } from '../../src/api/client.ts';
import { createCsrfStore } from '../../src/api/csrf.ts';
import { type ApiError, isApiError } from '../../src/api/error.ts';
import { makeVerifyContext } from '../../src/api/fake/backend.ts';
import {
  createFakeBackend,
  FakeBackendError,
  FakeFixtureError,
  FIXTURE_IDS,
  FIXTURES,
  verifyFixtures,
} from '../../src/api/fake/index.ts';
import { createGridSource } from '../../src/api/grid.ts';
import { routeKey } from '../../src/api/keys.ts';
import { connectStream } from '../../src/api/stream.ts';
import { noSleep } from './support.ts';

function rig(opts: Parameters<typeof createFakeBackend>[0] = {}, validate = true) {
  const fake = createFakeBackend(opts);
  const csrf = createCsrfStore();
  const api = createApiClient({ csrf, fetchImpl: fake.fetch, validate, sleep: noSleep });
  const login = async () => {
    const r = await api.call('EXT-01', { body: fake.control.credentials });
    csrf.set(r.csrfToken);
    return r;
  };
  return { ...fake, api, csrf, login };
}

async function failure(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    expect(isApiError(e), String(e)).toBe(true);
    return e as ApiError;
  }
  throw new Error('mong đợi lỗi nhưng không có');
}

describe('fixture khớp hợp đồng (meta-test)', () => {
  it('MỌI fixture: request mẫu qua schema request, handler chạy được, response qua schema response', async () => {
    const ids = await verifyFixtures(makeVerifyContext);
    expect(ids.sort()).toEqual([...FIXTURE_IDS].sort());
    expect(ids.length).toBeGreaterThanOrEqual(20);
  });

  it('mọi fixture ứng với route có thật trong registry', () => {
    const known = new Set(ROUTES.map((r) => r.id));
    for (const id of FIXTURE_IDS) expect(known.has(id), id).toBe(true);
  });

  it('lưới: OPS-32 phủ MỌI khoá lưới của hợp đồng (owner thấy hết)', async () => {
    const { api, login } = rig();
    await login();
    const infos = await api.call('OPS-32');
    expect(infos.map((g) => g.key).sort()).toEqual([...GRID_KEYS].sort());
  });

  it('fixture LỆCH schema ⇒ ném NGAY (verify và cả khi gọi qua fetch), không trả dữ liệu sai cho giao diện', async () => {
    const fx = FIXTURES as unknown as Record<string, { respond: (...a: never[]) => unknown }>;
    const original = fx['SYS-81']?.respond as (...a: never[]) => unknown;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      (fx['SYS-81'] as { respond: unknown }).respond = () => [{ severity: 'khong-co', kind: 1 }];
      await expect(verifyFixtures(makeVerifyContext)).rejects.toBeInstanceOf(FakeFixtureError);
      const { api, login, control } = rig();
      await login();
      const e = await failure(api.call('SYS-81'));
      expect(e.code).toBe('network');
      expect(e.cause).toBeInstanceOf(FakeFixtureError);
      expect(control.errors[0]).toBeInstanceOf(FakeFixtureError);
    } finally {
      (fx['SYS-81'] as { respond: unknown }).respond = original;
      spy.mockRestore();
    }
    await expect(verifyFixtures(makeVerifyContext)).resolves.toBeDefined();
  });
});

describe('cổng của edge trong backend giả', () => {
  it('chưa đăng nhập ⇒ 401; sai mật khẩu ⇒ invalid_credentials (+attemptsLeft); khoá sau 5 lần; đúng ⇒ vào được', async () => {
    const { api, login, control } = rig();
    expect((await failure(api.call('SYS-80', { query: { range: 'today' } }))).code).toBe('auth.required');
    const bad = await failure(api.call('EXT-01', { body: { username: 'admin', password: 'sai-mat-khau-0000' } }));
    expect(bad).toMatchObject({ code: 'auth.invalid_credentials', httpStatus: 401 });
    expect(bad.detailParams.attemptsLeft).toBe(4);
    for (let i = 0; i < 4; i++)
      await failure(api.call('EXT-01', { body: { username: 'admin', password: 'sai-mat-khau-0000' } }));
    const locked = await failure(api.call('EXT-01', { body: control.credentials }));
    expect(locked).toMatchObject({ code: 'auth.locked' });
    expect(locked.detailParams.retryAfterS).toBe(30);
    control.reset();
    const r = await login();
    expect(r.user.accessLevel).toBe('owner');
  });

  it('CSRF: thiếu / sai ⇒ 403 auth.csrf; đúng ⇒ ghi được (SYS-84 đánh dấu đã đọc)', async () => {
    const { api, login, csrf } = rig();
    await login();
    const before = await api.call('SYS-83', { query: { unread: true } });
    expect(before.items.length).toBe(2);
    const good = csrf.get();
    csrf.set(null);
    expect((await failure(api.call('SYS-84', { body: { all: true } }))).code).toBe('auth.csrf');
    csrf.set('csrf-sai-0000000000000000');
    expect((await failure(api.call('SYS-84', { body: { all: true } }))).code).toBe('auth.csrf');
    csrf.set(good);
    expect(await api.call('SYS-84', { body: { all: true } })).toEqual({ updated: 2 });
    expect((await api.call('SYS-83', { query: { unread: true } })).items).toHaveLength(0);
  });

  it('chế độ recovery: route O4 ✗ ⇒ 423 recovery.blocked (client phát sự kiện); route open vẫn chạy', async () => {
    const { api, login, control } = rig();
    await login();
    const seen: string[] = [];
    api.events.subscribe((e) => seen.push(e.type));
    control.setRecoveryMode(true);
    const e = await failure(api.call('OPS-32'));
    expect(e).toMatchObject({ code: 'recovery.blocked', httpStatus: 423 });
    expect(seen).toEqual(['recovery_blocked']);
    expect((await api.call('SYS-08')).mode).toBe('recovery');
    control.setRecoveryMode(false);
    expect((await api.call('SYS-08')).mode).toBe('ok');
  });

  it('hết phiên ⇒ 401 + sự kiện unauthorized; viewer gọi route admin ⇒ 403 auth.forbidden', async () => {
    const { api, login, control } = rig();
    await login();
    const seen: string[] = [];
    api.events.subscribe((e) => seen.push(e.type));
    control.setAccessLevel('V');
    expect((await failure(api.call('OPS-25', { query: { container: 'CT-0002' } }))).code).toBe('auth.forbidden');
    control.expireSession();
    expect((await failure(api.call('SYS-08'))).httpStatus).toBe(401);
    expect(seen).toEqual(['unauthorized']);
  });

  it('buộc đổi mật khẩu: EXT-03 ⇒ auth.must_change_password; đổi xong (mạnh) mới vào được', async () => {
    const { api, login, control } = rig({ mustChangePassword: true });
    const r = await login();
    expect(r.mustChangePassword).toBe(true);
    expect((await failure(api.call('EXT-03'))).code).toBe('auth.must_change_password');
    expect((await failure(api.call('SYS-08'))).code).toBe('auth.must_change_password');
    const weak = await failure(
      api.call('EXT-04', { body: { currentPassword: control.credentials.password, newPassword: 'ngan' } }),
    );
    expect(weak).toMatchObject({ code: 'auth.weak_password' });
    expect(weak.detailParams.reason).toBe('too_short');
    await api.call('EXT-04', {
      body: { currentPassword: control.credentials.password, newPassword: `moi-${crypto.randomUUID()}` },
    });
    expect((await api.call('EXT-03')).user.name).toBeTruthy();
  });

  it('công tắc lỗi: rớt mạng / lỗi mã chỉ định, theo số lần và theo route', async () => {
    const { api, login, control } = rig();
    await login();
    control.failNext('network', { routeId: 'SYS-08', times: 3 });
    // GET tự thử lại 2 lần rồi thành công ở lần thứ 4? maxRetries=2 ⇒ 3 lần thử đều rớt ⇒ ném network
    expect((await failure(api.call('SYS-08'))).code).toBe('network');
    control.failNext('internal');
    // SYS-08 vẫn còn 0 lần hỏng; lần gọi OPS-01 bị 'internal' (500 không nằm trong RETRY_STATUS)
    expect((await failure(api.call('OPS-01'))).code).toBe('internal');
    expect((await api.call('OPS-01')).status).toBe('ok');
  });

  it('route chưa có fixture ⇒ lỗi to (FakeBackendError), không im lặng', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { api, login, control } = rig();
    await login();
    const e = await failure(api.call('OPS-12'));
    expect(e.cause).toBeInstanceOf(FakeBackendError);
    expect(String((e.cause as Error).message)).toContain('OPS-12');
    expect(control.errors.length).toBeGreaterThan(0);
    spy.mockRestore();
  });

  it('Idempotency-Key: bản lặp trả lại y nguyên và ghi MỘT lần; khác thân ⇒ 409 idempotency.conflict', async () => {
    const { api, login, control } = rig();
    await login();
    const input = { params: { roleRef: 'RL-0001' }, body: { amountMinor: 5000, reason: 'thưởng' } };
    const a = await api.call('WRK-24', input, { idempotencyKey: 'idem-fake-key-0001' });
    const b = await api.call('WRK-24', input, { idempotencyKey: 'idem-fake-key-0001' });
    expect(b).toEqual(a);
    expect(control.db.roles[0]?.balanceMinor).toBe(150_000 + 5000);
    const c = await failure(
      api.call(
        'WRK-24',
        { ...input, body: { amountMinor: 1, reason: 'khác' } },
        { idempotencyKey: 'idem-fake-key-0001' },
      ),
    );
    expect(c.code).toBe('idempotency.conflict');
    const d = await api.call('WRK-24', input, { idempotencyKey: 'idem-fake-key-0002' });
    expect(d.balanceAfterMinor).toBe(150_000 + 10_000);
  });
});

describe('Data Console qua backend giả (client gõ kiểu → fake)', () => {
  const q = (api: ApiClient, query: Record<string, unknown>, gridKey: 'roles' | 'audit' | 'ledger' = 'roles') =>
    api.call('OPS-33', { params: { gridKey }, query: query as never });

  it('offset / limit / total / sắp xếp / lọc / nhóm / footer', async () => {
    const { api, login } = rig();
    await login();
    const all = await q(api, { sort: ['-id'] });
    expect(all.total).toBe(4);
    expect(all.items.map((r) => r.cells.id)).toEqual([4, 3, 2, 1]);
    const page = await q(api, { sort: ['id'], offset: 1, limit: 2 });
    expect(page).toMatchObject({ start: 1, total: 4 });
    expect(page.items.map((r) => r.displayId)).toEqual(['RL-0002', 'RL-0003']);
    expect(page.nextCursor).toBe('c3');
    const filtered = await q(api, { q: 'name:Mai' });
    expect(filtered.items.map((r) => r.cells.name)).toEqual(['Mai']);
    expect(filtered.clauses[0]).toMatchObject({ kind: 'field', field: 'name', values: ['Mai'] });
    const grouped = await q(api, { group: 'status' });
    expect(grouped.groups?.reduce((s, g) => s + g.count, 0)).toBe(4);
    const led = await q(api, { limit: 1 }, 'ledger');
    expect(led.total).toBe(250);
    expect(Object.keys(led.footer).length).toBeGreaterThan(0);
  });

  it('truy vấn sai ⇒ 400 query.invalid kèm reason (+ position khi máy chủ biết)', async () => {
    const { api, login } = rig({}, false);
    await login();
    const unknown = await failure(q(api, { q: 'status:active khong_co:1' }));
    expect(unknown).toMatchObject({ code: 'query.invalid', httpStatus: 400 });
    expect(unknown.detailParams.reason).toBe('unknown_field');
    const syntax = await failure(q(api, { q: 'name:Mai status:' }));
    expect(syntax.detailParams).toMatchObject({ reason: 'syntax', position: 9 });
  });

  it('kiểm request phía client chặn tên cột ngoài whitelist TRƯỚC khi gửi (dev/test)', async () => {
    const { api, login, control } = rig();
    await login();
    const before = control.calls.length;
    const e = await failure(q(api, { q: 'khong_co:1' }));
    expect(e).toMatchObject({ code: 'validation.failed', httpStatus: 0 });
    expect(control.calls.length).toBe(before);
  });

  it('OPS-37: found / filtered / gone khớp vị trí thật trong kết quả đã sắp xếp', async () => {
    const { api, login } = rig();
    await login();
    const found = await api.call('OPS-37', {
      params: { gridKey: 'roles' },
      query: { displayId: 'RL-0003', sort: ['-id'] },
    });
    expect(found).toEqual({ state: 'found', index: 1 });
    const filtered = await api.call('OPS-37', {
      params: { gridKey: 'roles' },
      query: { displayId: 'RL-0003', q: 'name:Mai' },
    });
    expect(filtered).toEqual({ state: 'filtered' });
    const gone = await api.call('OPS-37', { params: { gridKey: 'roles' }, query: { displayId: 'RL-0999' } });
    expect(gone).toEqual({ state: 'gone' });
  });

  it('OPS-34: CSV có BOM, máy khách kiểm được hash của máy chủ', async () => {
    const { api, login } = rig();
    await login();
    const r = await api.call('OPS-34', { params: { gridKey: 'roles' }, query: { cols: ['name'] } });
    expect(r.text.startsWith(String.fromCharCode(0xfeff))).toBe(true);
    expect(r.text).toContain('RL-0001,Mai');
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('useGrid: nguồn dữ liệu đúng hình GridDataSource của DataGrid', () => {
  it('fetchRange(start, limit) ⇒ OPS-33 offset; > 500 hàng tự chia trang; aggregates = footer máy chủ', async () => {
    const { api, login, control } = rig();
    await login();
    const src = createGridSource(api, 'audit');
    const ac = new AbortController();
    const r = await src.fetchRange({ query: { q: '', sort: [] }, start: 100, limit: 700, signal: ac.signal });
    expect(r).toMatchObject({ start: 100, total: 1200 });
    expect(r.rows).toHaveLength(700);
    expect(r.rows[0]?.displayId).toBe('AU-00101');
    const reads = control.calls
      .filter((c) => c.routeId === 'OPS-33')
      .map((c) => new URL(c.url, 'http://x').searchParams.get('offset'));
    expect(reads).toEqual(['100', '600']);
  });

  it('locate ⇒ OPS-37; groups ⇒ OPS-33 group; exportRows ⇒ phân trang đủ tổng', async () => {
    const { api, login } = rig();
    await login();
    const src = createGridSource(api, 'roles');
    const signal = new AbortController().signal;
    expect(
      await src.locate?.({ query: { q: '', sort: [{ column: 'id', desc: true }] }, id: 'RL-0003', signal }),
    ).toEqual({ state: 'found', index: 1 });
    const groups = await src.groups?.({ query: { q: '', sort: [] }, column: 'status', signal });
    expect(groups?.reduce((s, g) => s + g.count, 0)).toBe(4);
    const audit = createGridSource(api, 'audit');
    let n = 0;
    for await (const chunk of audit.exportRows?.({ query: { q: '', sort: [] }, signal }) ?? []) n += chunk.length;
    expect(n).toBe(1200);
    const csv = await src.exportServerCsv({ query: { q: '', sort: [] } });
    expect(csv.text).toContain('RL-0004');
  });

  it('lỗi truy vấn ⇒ GridQueryError(reason, position) để lưới vẽ chip đỏ (máy chủ biết vị trí)', async () => {
    const { api, login } = rig({}, false);
    await login();
    const src = createGridSource(api, 'roles');
    const signal = new AbortController().signal;
    const err = await src
      .fetchRange({ query: { q: 'name:Mai status:', sort: [] }, start: 0, limit: 10, signal })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GridQueryError);
    expect(err).toMatchObject({ reason: 'syntax', position: 9 });
  });

  it('cũng là GridQueryError khi kiểm request phía client chặn (tên cột ngoài whitelist)', async () => {
    const { api, login } = rig();
    await login();
    const src = createGridSource(api, 'roles');
    const signal = new AbortController().signal;
    const err = await src
      .fetchRange({ query: { q: 'khong_co:1', sort: [] }, start: 0, limit: 10, signal })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GridQueryError);
    expect(err).toMatchObject({ reason: 'unknown_field' });
  });

  it('huỷ bằng AbortSignal đi tới tầng fetch', async () => {
    const { api, login } = rig();
    await login();
    const src = createGridSource(api, 'roles');
    const ac = new AbortController();
    ac.abort();
    await expect(
      src.fetchRange({ query: { q: '', sort: [] }, start: 0, limit: 10, signal: ac.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('SSE giả', () => {
  async function until(cond: () => boolean, what: string) {
    for (let i = 0; i < 400; i++) {
      if (cond()) return;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error(`hết giờ chờ: ${what}`);
  }

  it('phát sự kiện ⇒ làm hết đúng truy vấn; rớt kết nối ⇒ nối lại kèm Last-Event-ID và nhận bù sự kiện bị lỡ', async () => {
    const { control, fetch, login } = rig();
    await login();
    const qc = new QueryClient();
    const roles = routeKey('OPS-33', { params: { gridKey: 'roles' } });
    const tasks = routeKey('OPS-33', { params: { gridKey: 'tasks' } });
    qc.setQueryData(roles, {});
    qc.setQueryData(tasks, {});
    const seen: string[] = [];
    const stream = connectStream({
      queryClient: qc,
      fetchImpl: fetch,
      validate: true,
      jitter: 0,
      sleep: () => new Promise((r) => setTimeout(r, 1)),
      onEvent: (e) => seen.push(`${e.type}:${e.id}`),
    });
    await until(() => control.openStreams === 1, 'mở luồng');
    control.emit({ type: 'grid.changed', grid: 'roles', displayIds: ['RL-0001'], op: 'update' });
    await until(() => seen.length === 1, 'sự kiện 1');
    expect(qc.getQueryState(roles)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(tasks)?.isInvalidated).toBe(false);

    control.dropStreams();
    control.emit({ type: 'attention.changed', count: 1, maxSeverity: 'warn' }); // lỡ khi đang rớt
    await until(() => seen.length === 2, 'nhận bù sự kiện lỡ');
    expect(seen).toEqual(['grid.changed:1', 'attention.changed:2']);
    expect(stream.lastEventId).toBe('2');
    stream.close();
  });

  it('Last-Event-ID không còn trong bộ đệm ⇒ máy chủ phát resync ⇒ đọc lại TẤT CẢ', async () => {
    const { control, fetch, login } = rig();
    await login();
    const qc = new QueryClient();
    qc.setQueryData(routeKey('SYS-30'), {});
    const stream = connectStream({
      queryClient: qc,
      fetchImpl: fetch,
      validate: true,
      jitter: 0,
      sleep: () => new Promise((r) => setTimeout(r, 1)),
    });
    await until(() => control.openStreams === 1, 'mở luồng');
    control.emit({ type: 'attention.changed', count: 0, maxSeverity: null });
    await until(() => stream.lastEventId === '1', 'nhận id 1');
    control.clearEventBuffer(); // như máy chủ khởi động lại: bộ đệm phát lại mất
    control.dropStreams();
    await until(() => qc.getQueryState(routeKey('SYS-30'))?.isInvalidated === true, 'resync');
    stream.close();
  });
});
