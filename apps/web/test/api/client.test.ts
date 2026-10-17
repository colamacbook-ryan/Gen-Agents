import { createI18n } from '@ga/i18n';
import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../../src/api/client.ts';
import { createCsrfStore } from '../../src/api/csrf.ts';
import { ApiError, describeApiError, isApiError } from '../../src/api/error.ts';
import type { ClientEvent } from '../../src/api/events.ts';
import { errorBody, json, noSleep, recordingFetch, ULID } from './support.ts';

const TOKEN = 'csrf-token-0123456789abcdef';
const ENTRY = { id: ULID, displayId: 'LG-0001' };
const GRANT_OK = { entry: ENTRY, balanceAfterMinor: 500, revived: false, rankAfter: null };
const GRANT_BODY = { amountMinor: 500, reason: 'thưởng thử nghiệm' };

function setup(
  responder: Parameters<typeof recordingFetch>[0],
  over: Partial<Parameters<typeof createApiClient>[0]> = {},
) {
  const rec = recordingFetch(responder);
  const csrf = createCsrfStore();
  csrf.set(TOKEN);
  const seen: ClientEvent[] = [];
  const api = createApiClient({ csrf, fetchImpl: rec.fetch, validate: true, sleep: noSleep, ...over });
  api.events.subscribe((e) => seen.push(e));
  return { api, csrf, seen, ...rec };
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

describe('đường dẫn + query từ registry', () => {
  it('OPS-33: path = /api/v1 + route.path, tham số đi qua encodeURIComponent, query là chuỗi (mảng nối dấu phẩy)', async () => {
    const { api, calls } = setup(() =>
      json({ items: [], nextCursor: null, start: 0, total: 0, footer: {}, clauses: [], aliasHints: [], groups: null }),
    );
    await api.call('OPS-33', {
      params: { gridKey: 'roles' },
      query: { q: 'status:active a&b', sort: ['-created', 'id'], limit: 50, offset: 100 },
    });
    const url = new URL(calls[0]?.url ?? '', 'http://x');
    expect(url.pathname).toBe('/api/v1/grids/roles/rows');
    expect(url.searchParams.get('q')).toBe('status:active a&b');
    expect(url.searchParams.get('sort')).toBe('-created,id');
    expect(url.searchParams.get('limit')).toBe('50');
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.headers.accept).toBe('application/json');
  });

  it('giá trị tham số có ký tự đặc biệt không thoát được khỏi đoạn đường dẫn', () => {
    const { api } = setup(() => json({}), { validate: false });
    expect(api.urlOf('SYS-32', { params: { roleRef: 'RL/../../x?y#z' } })).toBe(
      '/api/v1/roles/RL%2F..%2F..%2Fx%3Fy%23z',
    );
  });

  it('thiếu tham số đường dẫn hoặc route lạ là lỗi lập trình, không gửi request', async () => {
    const { api, calls } = setup(() => json({}), { validate: false });
    await expect(api.call('SYS-32' as never, {} as never)).rejects.toThrow(/roleRef/);
    await expect((api.call as (id: string) => Promise<unknown>)('SYS-99')).rejects.toThrow(/registry/);
    expect(calls).toHaveLength(0);
  });

  it('kiểm kiểu lúc biên dịch: id lạ, thiếu params, query sai kiểu, route SSE', () => {
    const { api } = setup(() => json({}));
    const never = (_: unknown) => {};
    never(async () => {
      // @ts-expect-error id không có trong registry
      await api.call('SYS-99');
      // @ts-expect-error thiếu params.gridKey
      await api.call('OPS-33', {});
      // @ts-expect-error limit phải là số
      await api.call('OPS-33', { params: { gridKey: 'roles' }, query: { limit: 'nhiều' } });
      // @ts-expect-error gridKey phải là khoá lưới có thật
      await api.call('OPS-33', { params: { gridKey: 'khong_co' } });
      // @ts-expect-error SYS-85 là luồng SSE, dùng openEventStream
      await api.call('SYS-85');
      // @ts-expect-error route ghi cần body
      await api.call('WRK-24', { params: { roleRef: 'RL-0001' } });
      // route không có đầu vào bắt buộc: gọi trơn được
      await api.call('OPS-32');
    });
  });
});

describe('CSRF', () => {
  it('route ghi có phiên gửi X-GA-CSRF; GET và route public thì không', async () => {
    const { api, calls } = setup((c) =>
      c.url.endsWith('/grids')
        ? json([])
        : c.url.endsWith('/auth/login')
          ? json({
              user: { id: ULID, displayId: 'US-0001', name: 'Chủ', accessLevel: 'owner' },
              csrfToken: TOKEN,
              mustChangePassword: false,
            })
          : json({ container: { id: ULID, displayId: 'CT-0001', observed: 'running' } }),
    );
    await api.call('SYS-12');
    await api.call('OPS-32');
    await api.call('EXT-01', { body: { username: 'admin', password: 'mat-khau-thu-nghiem-dai' } });
    expect(calls[0]?.headers['x-ga-csrf']).toBe(TOKEN);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[1]?.headers['x-ga-csrf']).toBeUndefined();
    expect(calls[2]?.headers['x-ga-csrf']).toBeUndefined();
  });

  it('token nằm trong bộ nhớ, không bao giờ trong URL', async () => {
    const { api, calls } = setup(() => json({ container: { id: ULID, displayId: 'CT-0001', observed: 'running' } }));
    await api.call('SYS-12');
    expect(calls[0]?.url).not.toContain(TOKEN);
  });
});

describe('lỗi', () => {
  it('thân lỗi ⇒ ApiError{code, httpStatus, i18nKey, detailKey, detailParams}', async () => {
    const { api } = setup(
      () => json(errorBody('query.invalid', { detail: { reason: 'unknown_field', position: 7 } }), 400),
      { validate: false },
    );
    const e = await failure(api.call('OPS-33', { params: { gridKey: 'roles' }, query: { q: 'xx:1' } }));
    expect(e).toMatchObject({
      code: 'query.invalid',
      httpStatus: 400,
      i18nKey: 'errors.query.invalid',
      requestId: 'req-test-0001',
    });
    expect(e.detailKey).toBe('errors.detail.query.invalid.unknown_field');
    expect(e.detailParams).toMatchObject({ reason: 'unknown_field', position: 7 });
  });

  it('hiển thị qua i18n: không lộ khoá thô; có dòng chi tiết và gợi ý', async () => {
    const { api } = setup(() => json(errorBody('auth.rate_limited', { detail: { retryAfterS: 30 } }), 429));
    const e = await failure(api.call('SYS-12'));
    const i18n = createI18n();
    const d = describeApiError(i18n, e);
    expect(d.message).not.toMatch(/^errors\./);
    expect(d.hints[0]).toContain('30');
    const q = new ApiError({
      code: 'query.invalid',
      httpStatus: 400,
      i18nKey: 'errors.query.invalid',
      detail: { reason: 'syntax' },
    });
    expect(describeApiError(i18n, q).detail).toMatch(/pháp/);
    expect(describeApiError(i18n, new Error('x')).message).toBe(i18n.t('errors.unknown'));
  });

  it('thân không đọc được / mã lạ ⇒ bad_response (4xx) hoặc internal (5xx); không bịa chữ', async () => {
    const a = setup(() => new Response('<html>', { status: 400 }));
    expect((await failure(a.api.call('SYS-12'))).code).toBe('bad_response');
    const b = setup(() => json(errorBody('ma.la.chua.co'), 400));
    expect((await failure(b.api.call('SYS-12'))).code).toBe('bad_response');
    const c = setup(() => new Response('boom', { status: 500 }), { maxRetries: 0 });
    expect((await failure(c.api.call('SYS-12'))).code).toBe('internal');
  });

  it('rớt mạng ⇒ ApiError network, giữ nguyên nhân', async () => {
    const cause = new TypeError('Failed to fetch');
    const { api } = setup(() => {
      throw cause;
    });
    const e = await failure(api.call('SYS-12'));
    expect(e).toMatchObject({ code: 'network', httpStatus: 0, i18nKey: 'errors.network' });
    expect(e.cause).toBe(cause);
  });

  it('401 trên route cần phiên ⇒ sự kiện unauthorized + xoá CSRF; 401 ở route public (sai mật khẩu) thì không', async () => {
    const a = setup(() => json(errorBody('auth.required'), 401));
    await failure(a.api.call('SYS-12'));
    expect(a.seen).toEqual([{ type: 'unauthorized', routeId: 'SYS-12' }]);
    expect(a.csrf.get()).toBeNull();

    const b = setup(() => json(errorBody('auth.invalid_credentials'), 401));
    const e = await failure(b.api.call('EXT-01', { body: { username: 'admin', password: 'mat-khau-thu-nghiem-dai' } }));
    expect(e.code).toBe('auth.invalid_credentials');
    expect(b.seen).toEqual([]);
    expect(b.csrf.get()).toBe(TOKEN);
  });

  it('423 recovery.blocked ⇒ sự kiện cho O4 (kèm requestId), lỗi vẫn ném cho người gọi', async () => {
    const { api, seen } = setup(() => json(errorBody('recovery.blocked'), 423));
    const e = await failure(api.call('OPS-32'));
    expect(e).toMatchObject({ code: 'recovery.blocked', httpStatus: 423 });
    expect(seen).toEqual([{ type: 'recovery_blocked', routeId: 'OPS-32', requestId: 'req-test-0001' }]);
  });

  it('một bên nghe ném lỗi không làm mất lỗi gốc', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { api } = setup(() => json(errorBody('recovery.blocked'), 423));
    api.events.subscribe(() => {
      throw new Error('nghe hỏng');
    });
    expect((await failure(api.call('OPS-32'))).code).toBe('recovery.blocked');
    spy.mockRestore();
  });
});

describe('kiểm response / request theo schema hợp đồng', () => {
  it('validate BẬT: response lệch schema ⇒ bad_response (có cause)', async () => {
    const { api } = setup(() => json({ khong: 'phai mang' }));
    const e = await failure(api.call('OPS-32'));
    expect(e.code).toBe('bad_response');
    expect(e.cause).toBeDefined();
  });

  it('validate TẮT: response đi thẳng (cờ chuyển được)', async () => {
    const { api } = setup(() => json({ khong: 'phai mang' }), { validate: false });
    expect(await api.call('OPS-32')).toEqual({ khong: 'phai mang' });
  });

  it('validate BẬT: request sai dạng bị chặn TRƯỚC khi gửi', async () => {
    const { api, calls } = setup(() => json({}));
    const e = await failure(api.call('OPS-33', { params: { gridKey: 'roles' }, query: { limit: 9999 } }));
    expect(e.code).toBe('validation.failed');
    expect(calls).toHaveLength(0);
  });

  it('204 ⇒ undefined; csv: giữ BOM, kiểm sha256 nếu header có', async () => {
    const a = setup(() => new Response(null, { status: 204 }));
    expect(await a.api.call('EXT-02')).toBeUndefined();

    const text = `${String.fromCharCode(0xfeff)}id,name\r\nRL-0001,Mai\r\n`;
    const bytes = new TextEncoder().encode(text);
    const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const ok = setup(
      () => new Response(bytes, { status: 200, headers: { 'content-type': 'text/csv', 'x-content-sha256': sha } }),
    );
    const r = await ok.api.call('OPS-34', { params: { gridKey: 'roles' } });
    expect(r).toEqual({ text, sha256: sha });
    expect(ok.calls[0]?.headers.accept).toBe('text/csv');

    const bad = setup(() => new Response(bytes, { status: 200, headers: { 'x-content-sha256': 'a'.repeat(64) } }));
    expect((await failure(bad.api.call('OPS-34', { params: { gridKey: 'roles' } }))).code).toBe('bad_response');
  });
});

describe('Idempotency-Key + thử lại', () => {
  const grant = (api: ReturnType<typeof setup>['api'], key?: string) =>
    api.call('WRK-24', { params: { roleRef: 'RL-0001' }, body: GRANT_BODY }, key ? { idempotencyKey: key } : undefined);

  it('route idempotent tự gắn khoá hợp lệ; mỗi lần gọi một khoá mới', async () => {
    const { api, calls } = setup(() => json(GRANT_OK, 200));
    await grant(api);
    await grant(api);
    const k1 = calls[0]?.headers['idempotency-key'];
    const k2 = calls[1]?.headers['idempotency-key'];
    expect(k1).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
    expect(k2).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
    expect(k1).not.toBe(k2);
    expect(calls[0]?.headers['x-ga-csrf']).toBe(TOKEN);
  });

  it('thử lại sau rớt mạng / 503 DÙNG LẠI đúng khoá cũ (không sinh lại)', async () => {
    let n = 0;
    const keys = ['idem-key-1', 'idem-key-2', 'idem-key-3', 'idem-key-4'];
    const { api, calls } = setup(
      (_c, i) => {
        n = i;
        if (i === 1) throw new TypeError('rớt mạng');
        if (i === 2) return new Response('', { status: 503 });
        return json(GRANT_OK);
      },
      { newIdempotencyKey: () => keys.shift() ?? 'het-khoa-0' },
    );
    expect(await grant(api)).toMatchObject({ balanceAfterMinor: 500 });
    expect(n).toBe(3);
    expect(calls.map((c) => c.headers['idempotency-key'])).toEqual(['idem-key-1', 'idem-key-1', 'idem-key-1']);
    expect(calls[0]?.body).toBe(calls[2]?.body);
  });

  it('khoá do người gọi truyền được ưu tiên; idempotency.conflict không thử lại', async () => {
    const { api, calls } = setup(() => json(errorBody('idempotency.conflict'), 409));
    const e = await failure(grant(api, 'khoa-cua-toi-0001'));
    expect(e.code).toBe('idempotency.conflict');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers['idempotency-key']).toBe('khoa-cua-toi-0001');
  });

  it('route ghi KHÔNG idempotent không bao giờ tự thử lại (tránh ghi đôi); GET thì có, có trần', async () => {
    const w = setup(() => {
      throw new TypeError('rớt mạng');
    });
    expect((await failure(w.api.call('SYS-12'))).code).toBe('network');
    expect(w.calls).toHaveLength(1);
    expect(w.calls[0]?.headers['idempotency-key']).toBeUndefined();

    const g = setup(() => new Response('', { status: 503 }), { maxRetries: 2 });
    expect((await failure(g.api.call('OPS-32'))).code).toBe('internal');
    expect(g.calls).toHaveLength(3);
  });

  it('huỷ bằng AbortSignal: ném AbortError, không bọc thành network, không thử lại', async () => {
    const ctrl = new AbortController();
    const { api, calls } = setup(() => {
      ctrl.abort();
      throw new DOMException('aborted', 'AbortError');
    });
    await expect(api.call('OPS-32', undefined, { signal: ctrl.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.signal).toBe(ctrl.signal);
  });
});
