import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { collectNodes } from '../../src/api/introspect.ts';
import {
  accessLevelToAuth,
  anchorEntityPrefix,
  classifyRef,
  ENTITY_TYPES,
  type EntityPrefix,
  effectiveReadAuth,
  GRID_KEYS,
  GRID_MIN_AUTH,
  GRID_PREFIX,
  GridInfo,
  MemberView,
  READABLE_PREFIXES,
  RECORD_ACCESS,
  ReadableAnchor,
  ROUTES,
  refPrefixesOf,
  routeById,
} from '../../src/index.ts';

// Review bảo mật PR #7 (H5): route đọc TỔNG QUÁT (OPS-33/34/35/36, SYS-23, lưới) phải tôn trọng mức đọc của TỪNG loại bản ghi.

const PREFIXES = Object.keys(ENTITY_TYPES) as EntityPrefix[];
const GENERIC_READERS = ['OPS-33', 'OPS-34', 'OPS-35', 'OPS-36', 'SYS-23'] as const;

describe('RECORD_ACCESS: quét MỌI prefix của ENTITY_TYPES (không mặc định)', () => {
  it('có đúng mọi prefix, mỗi prefix một mức hợp lệ — thiếu prefix là đỏ', () => {
    expect(Object.keys(RECORD_ACCESS).sort()).toEqual([...PREFIXES].sort());
    for (const p of PREFIXES) {
      expect(Object.hasOwn(RECORD_ACCESS, p), `RECORD_ACCESS thiếu ${p}`).toBe(true);
      expect(['V', 'A', 'O', 'deny'], p).toContain(RECORD_ACCESS[p]);
    }
  });

  it('deny = US, SEC, BK (credential / ciphertext / danh tính đăng nhập); A = Telegram PII + cấu hình nhạy cảm; còn lại V', () => {
    const by = (level: string) => PREFIXES.filter((p) => RECORD_ACCESS[p] === level).sort();
    expect(by('deny')).toEqual(['BK', 'SEC', 'US']);
    expect(by('A')).toEqual(['AL', 'CN', 'MSG', 'ST', 'TG', 'TH']);
    expect(by('O')).toEqual([]);
    expect(by('V').length).toBe(PREFIXES.length - 9);
    // AL, TG và mọi thứ mang PII Telegram không bao giờ ở mức V
    for (const p of ['AL', 'TG', 'TH', 'MSG'] as const) expect(RECORD_ACCESS[p], p).not.toBe('V');
  });

  it('READABLE_PREFIXES loại đúng các prefix deny', () => {
    expect(READABLE_PREFIXES.length).toBe(PREFIXES.length - 3);
    for (const p of ['US', 'SEC', 'BK'] as const) expect(READABLE_PREFIXES).not.toContain(p);
    expect(READABLE_PREFIXES).toContain('RL');
  });
});

describe('effectiveReadAuth = max(route.auth, RECORD_ACCESS[prefix], minAuth lưới)', () => {
  it('quét mọi prefix × mọi route đọc tổng quát: kết quả ≥ cả hai vế; deny ⇒ "deny"; prefix lạ ⇒ "deny"', () => {
    const rank = { public: 0, V: 1, A: 2, O: 3 } as const;
    for (const id of GENERIC_READERS) {
      const route = routeById(id);
      expect(route, id).toBeDefined();
      if (!route) continue;
      for (const p of PREFIXES) {
        const got = effectiveReadAuth(route, p);
        if (RECORD_ACCESS[p] === 'deny') expect(got, `${id}/${p}`).toBe('deny');
        else {
          expect(got, `${id}/${p}`).not.toBe('deny');
          expect(rank[got as keyof typeof rank], `${id}/${p}`).toBeGreaterThanOrEqual(rank[route.auth]);
          expect(rank[got as keyof typeof rank], `${id}/${p}`).toBeGreaterThanOrEqual(
            rank[RECORD_ACCESS[p] as 'V' | 'A'],
          );
        }
      }
      expect(effectiveReadAuth(route, 'ZZ' as EntityPrefix), `${id} prefix lạ`).toBe('deny');
    }
    expect(effectiveReadAuth({ auth: 'V' }, 'AL')).toBe('A');
    expect(effectiveReadAuth({ auth: 'V' }, 'TG')).toBe('A');
    expect(effectiveReadAuth({ auth: 'V' }, 'RL')).toBe('V');
    expect(effectiveReadAuth({ auth: 'A' }, 'RL')).toBe('A');
    expect(effectiveReadAuth({ auth: 'V' }, 'US')).toBe('deny');
    expect(effectiveReadAuth({ auth: 'V' }, 'SEC')).toBe('deny');
    expect(effectiveReadAuth({ auth: 'O' }, 'BK')).toBe('deny');
  });

  it('lưới: mức tối thiểu = mức của prefix hàng; mọi lưới đều không trỏ prefix deny', () => {
    for (const key of GRID_KEYS) {
      const prefix = GRID_PREFIX[key];
      expect(RECORD_ACCESS[prefix], `lưới ${key} trỏ prefix ${prefix} bị deny`).not.toBe('deny');
      expect(GRID_MIN_AUTH[key], key).toBe(RECORD_ACCESS[prefix]);
      expect(effectiveReadAuth({ auth: 'V' }, key), key).toBe(GRID_MIN_AUTH[key]);
    }
    expect(effectiveReadAuth({ auth: 'V' }, 'telegram_allowlist')).toBe('A');
    expect(effectiveReadAuth({ auth: 'V' }, 'telegram_bots')).toBe('A');
    expect(effectiveReadAuth({ auth: 'V' }, 'roles')).toBe('V');
    expect(effectiveReadAuth({ auth: 'V' }, 'tool_grants')).toBe('V');
  });

  it('GridInfo.minAuth có mặt và chỉ nhận V / A / O', () => {
    const base = {
      key: 'telegram_allowlist',
      prefix: 'AL',
      minAuth: 'A',
      source: 'telegram_allowlist',
      exportable: true,
      defaultSort: [],
      views: [],
      footerKeys: [],
      createRouteId: null,
      columns: [],
    };
    expect(GridInfo.safeParse(base).success).toBe(true);
    expect(GridInfo.safeParse({ ...base, minAuth: 'public' }).success).toBe(false);
    expect(GridInfo.safeParse({ ...base, minAuth: undefined }).success).toBe(false);
    const { minAuth: _omit, ...without } = base;
    expect(GridInfo.safeParse(without).success).toBe(false);
  });
});

describe('route đọc tổng quát không lộ bản ghi deny', () => {
  it('OPS-35: ref US / SEC / BK ⇒ prefix sai (404 not_found) như ref lạ; prefix đọc được ⇒ hợp lệ', () => {
    const schema = routeById('OPS-35')?.request.params;
    const refSchema = (schema as unknown as { shape: { recordRef: never } }).shape.recordRef;
    const prefixes = refPrefixesOf(refSchema);
    expect(prefixes).not.toBe('*');
    for (const ref of ['US-0001', 'SEC-0001', 'BK-0001'])
      expect(classifyRef(prefixes ?? [], ref), ref).toBe('wrong_prefix');
    for (const ref of ['RL-0001', 'AL-0001', 'AU-00001'])
      expect(classifyRef(prefixes ?? [], ref), ref).toBe('display_id');
  });

  it('anchor: ghim / resolve không trỏ được vào US, SEC, BK (SYS-17, SYS-19, SYS-23)', () => {
    for (const a of [
      'row:US-0001',
      'grid:users/row:US-0001',
      'row:SEC-0001',
      'row:BK-0001',
      'grid:secrets/row:SEC-0007/col:A',
    ]) {
      expect(ReadableAnchor.safeParse(a).success, a).toBe(false);
    }
    for (const a of [
      'role:RL-0001',
      'row:SK-0002',
      'grid:roles/row:RL-0001/col:B',
      'panel:chat',
      'region:1,2,3,4@screen:a1',
      'row:AL-0001',
    ]) {
      expect(ReadableAnchor.safeParse(a).success, a).toBe(true);
    }
    expect(anchorEntityPrefix('grid:users/row:US-0001')).toBe('US');
    expect(anchorEntityPrefix('msg:MSG-0001')).toBe('MSG');
    expect(anchorEntityPrefix('panel:chat')).toBeNull();
    const bad = 'row:US-0001';
    const q = routeById('SYS-23')?.request.query;
    expect(q?.safeParse({ anchor: bad }).success).toBe(false);
    expect(q?.safeParse({ anchor: 'role:RL-0001' }).success).toBe(true);
    const msg = (anchors: string[]) => ({ text: 'x', anchors, attachmentRefs: [], screen: { route: '/a1' } });
    expect(routeById('SYS-19')?.request.body?.safeParse(msg([bad])).success).toBe(false);
    expect(routeById('SYS-19')?.request.body?.safeParse(msg(['role:RL-0001'])).success).toBe(true);
    expect(
      routeById('SYS-17')?.request.body?.safeParse({ kind: 'assistant', context: { intent: 'adjust', anchors: [bad] } })
        .success,
    ).toBe(false);
  });

  it('người dùng: không route nào trả trường email / username / mật khẩu; thành viên dùng MemberView {id, displayId, name}', () => {
    const RAW = /^(?:email|username|passwordHash|password_hash|password)$/i;
    // Ngoại lệ có lý do: `username` ở WRK-01 / WRK-02 là handle CÔNG KHAI của bot Telegram (bot.username), không phải tên đăng nhập.
    const BOT_HANDLE = new Set(['WRK-01', 'WRK-02']);
    for (const r of ROUTES) {
      const res = r.response;
      const schemas = res.kind === 'json' ? [res.schema] : [];
      for (const s of schemas) {
        for (const n of collectNodes(s)) {
          if (n.key === 'username' && BOT_HANDLE.has(r.id) && n.path.includes('.bot.')) continue;
          expect(RAW.test(n.key ?? ''), `${r.id}: response có ${n.key}`).toBe(false);
        }
      }
    }
    expect(Object.keys(MemberView.shape).sort()).toEqual(['displayId', 'id', 'name']);
    expect(MemberView.safeParse({ id: '01JABCDEFGHJKMNPQRSTVWXYZ0', displayId: 'US-0001', name: 'A' }).success).toBe(
      true,
    );
    expect(
      MemberView.safeParse({ id: '01JABCDEFGHJKMNPQRSTVWXYZ0', displayId: 'US-0001', name: 'A', email: 'a@b.c' })
        .success,
    ).toBe(false);
  });
});

describe('accessLevelToAuth (L1, fail-closed)', () => {
  const SQL = readFileSync(new URL('../../../../db/spec/schema_v2_2.sql', import.meta.url), 'utf8');
  const dbLevels = (() => {
    const start = SQL.indexOf('CREATE TABLE workspace_members (');
    const m = /access_level TEXT[^\n]*CHECK \(access_level IN \(([^)]*)\)\)/.exec(
      SQL.slice(start, SQL.indexOf('\n);', start)),
    );
    return [...(m?.[1] ?? '').matchAll(/'([^']+)'/g)].map((x) => x[1] as string);
  })();

  it('quét MỌI giá trị của CHECK ở DB: owner → O, admin → A, viewer → V, operator → null', () => {
    expect([...dbLevels].sort()).toEqual(['admin', 'operator', 'owner', 'viewer']);
    const got = Object.fromEntries(dbLevels.map((l) => [l, accessLevelToAuth(l)]));
    expect(got).toEqual({ owner: 'O', admin: 'A', operator: null, viewer: 'V' });
  });

  it('giá trị lạ, rỗng, sai hoa thường, không phải chuỗi ⇒ null (không làm tròn)', () => {
    for (const v of [
      '',
      'Owner',
      'OWNER',
      'root',
      'superadmin',
      ' admin',
      'viewer\n',
      null,
      undefined,
      0,
      {},
      ['owner'],
    ])
      expect(accessLevelToAuth(v), String(v)).toBeNull();
  });
});
