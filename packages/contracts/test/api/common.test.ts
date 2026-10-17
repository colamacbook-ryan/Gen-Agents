import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import {
  AnyId,
  API_AUTH,
  type ApiErrorBody,
  ApiErrorEnvelope,
  authAtLeast,
  ConfirmName,
  CSRF_HEADER,
  classifyRef,
  DisplayId,
  ErrorDetail,
  expandRouteErrors,
  IanaTimezone,
  IdempotencyKey,
  IdOf,
  Job,
  OpaqueId,
  PageOf,
  pageQueryShape,
  queryBool,
  queryCsv,
  queryInt,
  queryList,
  Ref,
  ROUTES,
  refPrefixesOf,
  requiresCsrf,
  SESSION_COOKIE_NAMES,
  str,
  Ts,
  Ulid,
} from '../../src/index.ts';

const ULID = '01JABCDEFGHJKMNPQRSTVWXYZ0';

describe('Ref<P> (§3.0)', () => {
  it('ULID hoặc display_id đúng hình dạng; rác / quá dài bị loại', () => {
    const r = Ref('RL');
    expect(r.safeParse(ULID).success).toBe(true);
    expect(r.safeParse('RL-0001').success).toBe(true);
    expect(r.safeParse('RL-12345').success).toBe(true);
    expect(r.safeParse('rl-0001').success).toBe(false);
    expect(r.safeParse('').success).toBe(false);
    expect(r.safeParse(`${ULID}X`).success).toBe(false);
    expect(r.safeParse('RL-0001; DROP TABLE roles').success).toBe(false);
  });

  it('sai prefix: schema chỉ kiểm hình dạng, classifyRef báo wrong_prefix ⇒ tầng route trả 404 not_found', () => {
    const prefixes = refPrefixesOf(Ref('RL'));
    expect(prefixes).toEqual(['RL']);
    expect(Ref('RL').safeParse('SK-0001').success).toBe(true);
    expect(classifyRef(prefixes ?? [], 'SK-0001')).toBe('wrong_prefix');
    expect(classifyRef(prefixes ?? [], 'RL-0001')).toBe('display_id');
    expect(classifyRef(prefixes ?? [], ULID)).toBe('ulid');
    expect(classifyRef(prefixes ?? [], 'rác')).toBe('malformed');
    expect(classifyRef(prefixes ?? [], 'RL-1')).toBe('malformed');
  });

  it('nhiều prefix và `*` (mọi prefix của ENTITY_TYPES); cùng tập prefix dùng chung một schema', () => {
    expect(refPrefixesOf(Ref(['TK', 'AU']))).toEqual(['TK', 'AU']);
    expect(classifyRef(refPrefixesOf(Ref(['TK', 'AU'])) ?? [], 'AU-00012')).toBe('display_id');
    expect(classifyRef(refPrefixesOf(Ref(['TK', 'AU'])) ?? [], 'RL-0001')).toBe('wrong_prefix');
    expect(refPrefixesOf(Ref('*'))).toBe('*');
    expect(classifyRef('*', 'MM-0041')).toBe('display_id');
    expect(Ref(['TK', 'AU'])).toBe(Ref(['AU', 'TK']));
    expect(Ref('RL')).toBe(Ref('RL'));
    expect(refPrefixesOf(str(5))).toBeUndefined();
  });
});

describe('Id, display_id, Ts, timezone, định danh mờ', () => {
  it('IdOf(P) = {id: ULID, displayId đúng prefix}; AnyId chấp nhận prefix đã đăng ký', () => {
    expect(IdOf('RL').safeParse({ id: ULID, displayId: 'RL-0001' }).success).toBe(true);
    expect(IdOf('RL').safeParse({ id: ULID, displayId: 'SK-0001' }).success).toBe(false);
    expect(IdOf('RL').safeParse({ id: ULID, displayId: 'RL-0001', extra: 1 }).success).toBe(false);
    expect(IdOf('AU').safeParse({ id: ULID, displayId: 'AU-00001' }).success).toBe(true);
    expect(IdOf('RL')).toBe(IdOf('RL'));
    expect(DisplayId('MSG').safeParse('MSG-0001').success).toBe(true);
    expect(DisplayId('MSG').safeParse('MS-0001').success).toBe(false);
    expect(AnyId.safeParse({ id: ULID, displayId: 'EN-0001' }).success).toBe(true);
    expect(AnyId.safeParse({ id: ULID, displayId: 'ZZ-0001' }).success).toBe(false);
    // ULID Crockford không có chữ U: dựng lúc chạy (luật test-ids: không để literal id sai trong test).
    expect(Ulid.safeParse(`${ULID.slice(0, 25)}U`).success).toBe(false);
  });

  it('Ts = chuỗi UTC 24 ký tự; IANA do Intl quyết; OpaqueId 16–64 ký tự an toàn', () => {
    expect(Ts.safeParse('2026-10-17T01:02:03.004Z').success).toBe(true);
    expect(Ts.safeParse('2026-10-17T01:02:03Z').success).toBe(false);
    expect(Ts.safeParse('2026-10-17 01:02:03.004').success).toBe(false);
    expect(IanaTimezone.safeParse('Asia/Ho_Chi_Minh').success).toBe(true);
    expect(IanaTimezone.safeParse('UTC').success).toBe(true);
    expect(IanaTimezone.safeParse('Mars/Phobos').success).toBe(false);
    expect(IanaTimezone.safeParse('').success).toBe(false);
    expect(OpaqueId.safeParse('cap_0123456789abcdef').success).toBe(true);
    expect(OpaqueId.safeParse('short').success).toBe(false);
    expect(OpaqueId.safeParse('has space has space has space').success).toBe(false);
  });
});

describe('Idempotency-Key, ConfirmName, Job', () => {
  it('Idempotency-Key 8–128 ký tự [A-Za-z0-9._:-]', () => {
    expect(IdempotencyKey.safeParse('01JABCDEFGHJKMNPQRSTVWXYZ0').success).toBe(true);
    expect(IdempotencyKey.safeParse('a'.repeat(128)).success).toBe(true);
    expect(IdempotencyKey.safeParse('a'.repeat(129)).success).toBe(false);
    expect(IdempotencyKey.safeParse('a'.repeat(7)).success).toBe(false);
    expect(IdempotencyKey.safeParse('abc def ghi').success).toBe(false);
    // M9: `:` dành cho khoá nội bộ của hệ thống (`activate:<ulid>`) — client không được đặt.
    expect(IdempotencyKey.safeParse(`activate:${'01JABCDEFGHJKMNPQRSTVWXYZ0'}`).success).toBe(false);
    expect(IdempotencyKey.safeParse('reverse:abcdefgh').success).toBe(false);
    expect(IdempotencyKey.safeParse('idem.0001_abc-def').success).toBe(true);
    expect(IdempotencyKey.safeParse('abc\ndefghi').success).toBe(false);
  });

  it('ConfirmName 1–200 ký tự; Job {jobDisplayId JB-…, state}', () => {
    expect(ConfirmName.safeParse('Mai').success).toBe(true);
    expect(ConfirmName.safeParse('').success).toBe(false);
    expect(ConfirmName.safeParse('x'.repeat(201)).success).toBe(false);
    expect(Job.safeParse({ jobDisplayId: 'JB-0001', state: 'queued' }).success).toBe(true);
    expect(Job.safeParse({ jobDisplayId: 'JB-0001', state: 'pending' }).success).toBe(false);
    expect(Job.safeParse({ jobDisplayId: 'RL-0001', state: 'queued' }).success).toBe(false);
  });
});

describe('phân trang và query', () => {
  it('Page<T> = {items, nextCursor|null}; cursor / limit ≤ 200', () => {
    const page = PageOf(z.strictObject({ n: z.number() }));
    expect(page.safeParse({ items: [{ n: 1 }], nextCursor: null }).success).toBe(true);
    expect(page.safeParse({ items: [], nextCursor: 'abc' }).success).toBe(true);
    expect(page.safeParse({ items: [] }).success).toBe(false);
    expect(page.safeParse({ items: [], nextCursor: '' }).success).toBe(false);
    expect(page.safeParse({ items: Array(501).fill({ n: 1 }), nextCursor: null }).success).toBe(false);
    const q = z.strictObject(pageQueryShape());
    expect(q.safeParse({ cursor: 'c', limit: '200' }).success).toBe(true);
    expect(q.safeParse({ limit: '201' }).success).toBe(false);
    expect(q.safeParse({ cursor: 'x'.repeat(257) }).success).toBe(false);
    expect(z.strictObject(pageQueryShape(500)).safeParse({ limit: '500' }).success).toBe(true);
  });

  it('queryBool / queryInt / queryCsv / queryList chuyển kiểu đúng và chặn giá trị lạ', () => {
    expect(queryBool().parse('true')).toBe(true);
    expect(queryBool().parse('false')).toBe(false);
    expect(queryBool().safeParse('1').success).toBe(false);
    expect(queryInt(1, 90).parse('7')).toBe(7);
    expect(queryInt(1, 90).safeParse('0').success).toBe(false);
    expect(queryInt(1, 90).safeParse('abc').success).toBe(false);
    expect(queryCsv(['a', 'b'] as const).parse('a,b')).toEqual(['a', 'b']);
    expect(queryCsv(['a', 'b'] as const, 1).safeParse('a,b').success).toBe(false);
    expect(queryCsv(['a', 'b'] as const).safeParse('a,c').success).toBe(false);
    const list = queryList(str(5, 1), 2, 'x');
    expect(list.parse('ab,cd')).toEqual(['ab', 'cd']);
    expect(list.safeParse('a,b,c').success).toBe(false);
    expect(list.safeParse('abcdefg').success).toBe(false);
  });
});

describe('lỗi: envelope + detail', () => {
  const env = (code: string, detail?: unknown) => ({
    error: { code, i18nKey: `errors.${code}`, requestId: 'req-1', ...(detail === undefined ? {} : { detail }) },
  });

  it('thân lỗi = ApiErrorBody + detail tuỳ chọn (chỉ khoá enum hoặc số)', () => {
    expect(ApiErrorEnvelope.safeParse(env('not_found')).success).toBe(true);
    expect(ApiErrorEnvelope.safeParse(env('telegram.code_invalid', { attemptsLeft: 3 })).success).toBe(true);
    expect(ApiErrorEnvelope.safeParse(env('auth.locked', { retryAfterS: 30 })).success).toBe(true);
    expect(ApiErrorEnvelope.safeParse(env('gate.sign_blocked', { reason: 'budget_exceeded' })).success).toBe(true);
    expect(ApiErrorEnvelope.safeParse(env('db.ledger_rule')).success).toBe(true);
    expect(ApiErrorEnvelope.safeParse(env('no.such_code')).success).toBe(false);
    expect(ApiErrorEnvelope.safeParse(env('not_found', { message: 'chuỗi DB / stack' })).success).toBe(false);
    expect(ApiErrorEnvelope.safeParse(env('not_found', { reason: 'có dấu cách và chữ tự do' })).success).toBe(false);
    expect(
      ApiErrorEnvelope.safeParse({ error: { code: 'not_found', i18nKey: 'k', requestId: 'r', stack: 'x' } }).success,
    ).toBe(false);
    expect(ErrorDetail.safeParse({ attemptsLeft: -1 }).success).toBe(false);
  });

  it('kiểu: thân lỗi zod gán được vào ApiErrorBody của errors.ts (cùng hình dạng, có detail)', () => {
    const parsed = ApiErrorEnvelope.parse(env('telegram.code_invalid', { attemptsLeft: 2 }));
    const body: ApiErrorBody = parsed;
    expect(body.error.detail?.attemptsLeft).toBe(2);
    expectTypeOf(parsed.error.code).toMatchTypeOf<ApiErrorBody['error']['code']>();
  });

  it('expandRouteErrors mở `db.*` thành mọi mã DB; mã thường giữ nguyên', () => {
    const out = expandRouteErrors(['db.*', 'conflict']);
    expect(out).toContain('db.ledger_rule');
    expect(out).toContain('db.core_agent_rule');
    expect(out).toContain('conflict');
    expect(out.every((c) => c === 'conflict' || c.startsWith('db.'))).toBe(true);
    expect(expandRouteErrors(['not_found'])).toEqual(['not_found']);
  });

  it('thứ tự quyền public < V < A < O', () => {
    expect(authAtLeast('O', 'A')).toBe(true);
    expect(authAtLeast('A', 'O')).toBe(false);
    expect(authAtLeast('V', 'V')).toBe(true);
    expect(authAtLeast('public', 'V')).toBe(false);
  });
});

describe('hằng xác thực dùng chung với @ga/security (golden — không được lệch)', () => {
  // GIÁ TRỊ GOLDEN sao chép từ packages/security/src/session.ts (`CSRF_HEADER`, `SESSION.cookieSecure / cookieInsecure`).
  // Frontend không được import @ga/security nên các hằng này sống ở contracts. Phía @ga/security có test đối chiếu ngược
  // (xem đề xuất `contract-constants.test.ts`): đổi một bên mà quên bên kia ⇒ một trong hai test đỏ.
  it('CSRF_HEADER = "x-ga-csrf" (chữ thường); API_AUTH.csrfHeader là chính hằng đó', () => {
    expect(CSRF_HEADER).toBe('x-ga-csrf');
    expect(API_AUTH.csrfHeader).toBe(CSRF_HEADER);
    expect(CSRF_HEADER).toBe(CSRF_HEADER.toLowerCase());
    expect(CSRF_HEADER).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it('cookie phiên: __Host-ga_sid (HTTPS) và ga_sid (HTTP), khớp bản cài đặt của @ga/security', () => {
    expect(SESSION_COOKIE_NAMES).toEqual({ secure: '__Host-ga_sid', insecure: 'ga_sid' });
    expect(API_AUTH.sessionCookieSecure).toBe('__Host-ga_sid');
    expect(API_AUTH.sessionCookieInsecure).toBe('ga_sid');
    expect(SESSION_COOKIE_NAMES.secure.startsWith('__Host-')).toBe(true);
    expect(Object.keys(API_AUTH)).not.toContain('sessionCookie');
  });

  it('header riêng của hợp đồng đều chữ thường và khác nhau', () => {
    const names = [
      API_AUTH.csrfHeader,
      API_AUTH.idempotencyHeader,
      API_AUTH.lastEventIdHeader,
      API_AUTH.contentSha256Header,
    ];
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n, n).toBe(n.toLowerCase());
  });

  it('mọi route ghi (trừ công khai) dùng đúng CSRF_HEADER: requiresCsrf đúng, EXT-01 miễn', () => {
    const csrfRoutes = ROUTES.filter((r) => requiresCsrf(r));
    expect(csrfRoutes.length).toBeGreaterThan(100);
    expect(csrfRoutes.map((r) => r.method)).not.toContain('GET');
    expect(ROUTES.find((r) => r.id === 'EXT-01' && requiresCsrf(r))).toBeUndefined();
  });
});
