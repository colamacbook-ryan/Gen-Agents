import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { defOf, secretFieldsOf } from '../../src/api/introspect.ts';
import {
  CLI_GROUPS,
  ColumnName,
  ENTITY_TYPES,
  expandIds,
  FS_CODES,
  FS_COVERAGE,
  FS_NO_API,
  FS_SSE_COVERAGE,
  fsOf,
  GRID_KEYS,
  GRID_PAGE_MAX,
  GRID_PREFIX,
  GRID_WRITE_ROUTES,
  GridInfo,
  GridKey,
  GridRowsPage,
  gridRouteIds,
  QueryClause,
  ROUTES,
  routeById,
  SortKey,
  SSE_EVENT_TYPES,
} from '../../src/index.ts';

// `api:coverage` (BACKEND-TRIAL §3.1 test 4, 5; §3.11): mọi mã màn có ≥ 1 route; mọi route trong bảng có thật; mọi lệnh CLI
// trỏ tới route có thật. Thêm: Data Console (STD-07) — grid có phân trang, lọc, sắp xếp, ô truy vấn §8, xuất.

describe('độ phủ FRONTEND-SPEC §3.11', () => {
  it('bảng có đủ 34 mã màn / thành phần; chỉ O3 (phím tắt) được không có route', () => {
    expect(FS_CODES.length).toBe(34);
    expect(FS_NO_API).toEqual(['O3']);
    for (const code of FS_CODES) {
      const routes = FS_COVERAGE[code] as readonly string[];
      if ((FS_NO_API as readonly string[]).includes(code)) expect(routes.length, code).toBe(0);
      else expect(routes.length, `mã màn ${code} không có route nào`).toBeGreaterThanOrEqual(1);
    }
  });

  it('mọi route nêu trong bảng đều có thật trong registry', () => {
    for (const code of FS_CODES)
      for (const id of FS_COVERAGE[code]) expect(routeById(id), `${code} → ${id}`).toBeDefined();
  });

  it('dải ID được bung đúng (đối chiếu số lượng của vài hàng trong bảng)', () => {
    expect(expandIds('SYS-01..07')).toEqual(['SYS-01', 'SYS-02', 'SYS-03', 'SYS-04', 'SYS-05', 'SYS-06', 'SYS-07']);
    expect(expandIds('OPS-36')).toEqual(['OPS-36']);
    expect(() => expandIds('SYS-9')).toThrow();
    expect(() => expandIds('SYS-09..01')).toThrow();
    expect(FS_COVERAGE.G2.length).toBe(20);
    expect(FS_COVERAGE.A6.length).toBe(13);
    expect(FS_COVERAGE.O4.length).toBe(25);
    expect(FS_COVERAGE.A3.length).toBe(17);
    expect(FS_COVERAGE.A10.length).toBe(16);
  });

  it('fs của route dẫn xuất từ bảng; route ngoài bảng PHẢI khai `cliOnly` kèm lý do; route trong bảng thì không', () => {
    for (const r of ROUTES) {
      expect([...r.fs], r.id).toEqual([...fsOf(r.id)]);
      if (r.fs.length === 0)
        expect(r.cliOnly?.length ?? 0, `${r.id} không thuộc màn nào mà thiếu cliOnly`).toBeGreaterThan(10);
      else expect(r.cliOnly, `${r.id} thuộc màn ${r.fs.join(',')} nhưng khai cliOnly`).toBeUndefined();
    }
    expect(
      ROUTES.filter((r) => r.cliOnly)
        .map((r) => r.id)
        .sort(),
    ).toEqual(['SYS-44', 'SYS-45']);
  });

  it('SSE gắn với màn có thật trong §3.7', () => {
    for (const [code, types] of Object.entries(FS_SSE_COVERAGE)) {
      expect(FS_CODES as readonly string[], code).toContain(code);
      for (const t of types ?? []) expect(SSE_EVENT_TYPES as readonly string[], `${code}: ${t}`).toContain(t);
    }
  });

  it('SYS-85 (SSE) có mặt ở mọi màn cần realtime: A0, A1, A4, O2, ChatPanel', () => {
    for (const code of ['A0', 'A1', 'A4', 'O2', 'ChatPanel'] as const) expect(FS_COVERAGE[code]).toContain('SYS-85');
  });
});

describe('cây lệnh `genagents` §3.10', () => {
  it('mọi route nêu trong nhóm lệnh đều có thật', () => {
    for (const g of CLI_GROUPS) for (const id of g.routes) expect(routeById(id), `${g.group} → ${id}`).toBeDefined();
    expect(CLI_GROUPS.length).toBe(24);
  });

  it('mọi route có lệnh CLI đều thuộc ít nhất một nhóm lệnh (và ngược lại: route trong nhóm có lệnh hoặc noCli)', () => {
    const inGroup = new Set(CLI_GROUPS.flatMap((g) => g.routes));
    for (const r of ROUTES) {
      if (r.cli.length > 0 && !inGroup.has(r.id)) {
        // EXT-05 / host-only được liệt kê ở nhóm Thiết lập; route còn lại phải thuộc nhóm.
        expect(inGroup.has(r.id), `${r.id} có lệnh CLI ${r.cli.join('|')} mà không nhóm nào chứa`).toBe(true);
      }
    }
    for (const id of inGroup) {
      const r = routeById(id);
      expect((r?.cli.length ?? 0) > 0 || r?.noCli !== undefined, id).toBe(true);
    }
  });

  it('`api <METHOD> <path>` dùng được mọi route: tra theo (method, path) không trùng', () => {
    const seen = new Set(ROUTES.map((r) => `${r.method} ${r.path}`));
    expect(seen.size).toBe(ROUTES.length);
  });
});

describe('Data Console (STD-07 §5, DATABASE §8): grid phân trang, lọc, sắp xếp, ô truy vấn, xuất', () => {
  const must = (id: string) => {
    const r = routeById(id);
    if (!r) throw new Error(`thiếu route ${id}`);
    return r;
  };
  const rows = must('OPS-33');
  const exportRoute = must('OPS-34');
  const gridsRoute = must('OPS-32');
  const query = (r: typeof rows) => (r.request.query as unknown as { shape: Record<string, z.ZodType> }).shape;

  it('OPS-33: q, view, sort, cols, group, cursor, limit ≤ 500 — keyset, không OFFSET', () => {
    expect(Object.keys(query(rows)).sort()).toEqual(['cols', 'cursor', 'group', 'limit', 'q', 'sort', 'view']);
    const q = rows?.request.query as z.ZodType;
    const parsed = q.parse({
      q: 'role:Mai status:active tokens>200',
      sort: '-created,id',
      cols: 'status,tokens',
      group: 'status',
      limit: '500',
    }) as {
      sort: string[];
      cols: string[];
      limit: number;
    };
    expect(parsed.sort).toEqual(['-created', 'id']);
    expect(parsed.cols).toEqual(['status', 'tokens']);
    expect(parsed.limit).toBe(500);
    expect(GRID_PAGE_MAX).toBe(500);
    expect(q.safeParse({ limit: '501' }).success).toBe(false);
    expect(q.safeParse({ offset: '10' }).success).toBe(false);
    expect(q.safeParse({ page: '2' }).success).toBe(false);
    expect(q.safeParse({ sort: 'a,b,c,d' }).success).toBe(false);
    expect(q.safeParse({ sort: '-Bad Column' }).success).toBe(false);
    expect(q.safeParse({ cols: 'x'.repeat(40) }).success).toBe(false);
    expect(q.safeParse({ q: '' }).success).toBe(false);
    expect(q.safeParse({ q: 'x'.repeat(501) }).success).toBe(false);
  });

  it('OPS-34 xuất CSV: cùng bộ chọn với OPS-33 (q, view, sort, cols), không phân trang', () => {
    expect(Object.keys(query(exportRoute)).sort()).toEqual(['cols', 'q', 'sort', 'view']);
    expect(exportRoute?.response.kind).toBe('csv');
    expect(routeById('OPS-23')?.response.kind).toBe('csv');
  });

  it('phản hồi hàng: trạng thái hàng, tổng, footer Σ, mệnh đề đã phân tích (chip), mã cũ, nhóm', () => {
    const shape = (GridRowsPage as unknown as { shape: Record<string, unknown> }).shape;
    expect(Object.keys(shape).sort()).toEqual([
      'aliasHints',
      'clauses',
      'footer',
      'groups',
      'items',
      'nextCursor',
      'total',
    ]);
    const ok = {
      items: [
        {
          id: '01JABCDEFGHJKMNPQRSTVWXYZ0',
          displayId: 'IN-0007',
          state: 'proposed',
          supersededBy: null,
          cells: { status: 'active', tokens: 120 },
        },
      ],
      nextCursor: null,
      total: 1,
      footer: { sum_tokens: 120, count: 1 },
      clauses: [
        { negated: false, kind: 'field', field: 'status', op: ':', values: ['active'], position: 0 },
        { negated: true, kind: 'word', field: null, op: null, values: ['abc'], position: 14 },
      ],
      aliasHints: [{ from: 'MM-0046', to: 'MM-0107' }],
      groups: [{ value: 'active', count: 1 }],
    };
    expect(GridRowsPage.safeParse(ok).success).toBe(true);
    for (const state of ['normal', 'proposed', 'superseded', 'wounded']) {
      expect(GridRowsPage.safeParse({ ...ok, items: [{ ...ok.items[0], state }] }).success, state).toBe(true);
    }
    expect(GridRowsPage.safeParse({ ...ok, items: [{ ...ok.items[0], state: 'deleted' }] }).success).toBe(false);
    expect(GridRowsPage.safeParse({ ...ok, total: null, groups: null }).success).toBe(true);
    expect(GridRowsPage.safeParse({ ...ok, items: Array(501).fill(ok.items[0]) }).success).toBe(false);
    expect(GridRowsPage.safeParse({ ...ok, extra: 1 }).success).toBe(false);
  });

  it('QueryClause: toán tử của §8.1; vị trí ký tự để vẽ chip', () => {
    for (const op of [':', '=', '!=', '>', '>=', '<', '<=']) {
      expect(
        QueryClause.safeParse({ negated: false, kind: 'field', field: 'tokens', op, values: ['1'], position: 0 })
          .success,
        op,
      ).toBe(true);
    }
    expect(
      QueryClause.safeParse({ negated: false, kind: 'field', field: 'tokens', op: '~', values: ['1'], position: 0 })
        .success,
    ).toBe(false);
    expect(
      QueryClause.safeParse({ negated: false, kind: 'field', field: 'Tokens', op: ':', values: ['1'], position: 0 })
        .success,
    ).toBe(false);
    expect(ColumnName.safeParse('status').success).toBe(true);
    expect(SortKey.safeParse('-created').success).toBe(true);
    expect(SortKey.safeParse('--created').success).toBe(false);
  });

  it('lỗi ô truy vấn có cấu trúc: 400 query.invalid + detail.reason (6 lý do) + detail.position', async () => {
    const { ApiErrorEnvelope, ERROR_DETAIL_REASONS } = await import('../../src/index.ts');
    expect(ERROR_DETAIL_REASONS['query.invalid']).toEqual([
      'syntax',
      'unknown_field',
      'op_not_allowed',
      'bad_value',
      'too_complex',
      'timeout',
    ]);
    const err = (detail: unknown) => ({
      error: { code: 'query.invalid', i18nKey: 'errors.query.invalid', requestId: 'r1', detail },
    });
    expect(ApiErrorEnvelope.safeParse(err({ reason: 'unknown_field', field: 'abc', position: 12 })).success).toBe(true);
    expect(ApiErrorEnvelope.safeParse(err({ reason: 'unknown_field', message: 'văn bản tự do' })).success).toBe(false);
    expect(rows?.errors).toContain('query.invalid');
    expect(exportRoute?.errors).toContain('query.invalid');
  });

  it('OPS-32 mô tả lưới: cột (chữ, kiểu, sửa được, tra cứu được, sort được, alias vi, giá trị enum, toán tử, route ghi), view dựng sẵn, footer, "+ Thêm hàng"', () => {
    const grid = {
      key: 'instructions',
      prefix: 'IN',
      source: 'instructions',
      exportable: true,
      defaultSort: ['layer', 'ordinal'],
      views: [{ key: 'all', q: null, sort: ['ordinal'], cols: ['layer', 'name'] }],
      footerKeys: ['sum_tokens'],
      createRouteId: 'SYS-47',
      columns: [
        {
          name: 'layer',
          letter: 'B',
          type: 'enum',
          editable: true,
          queryable: true,
          sortable: true,
          aliases: ['lop'],
          values: ['values', 'persona'],
          ops: [':', '!='],
          editRouteId: 'SYS-48',
        },
        {
          name: 'tokens',
          letter: 'H',
          type: 'int',
          editable: false,
          queryable: true,
          sortable: true,
          aliases: [],
          values: null,
          ops: ['>', '<'],
          editRouteId: null,
        },
      ],
    };
    expect(GridInfo.safeParse(grid).success).toBe(true);
    expect(GridInfo.safeParse({ ...grid, key: 'not_a_grid' }).success).toBe(false);
    expect(GridInfo.safeParse({ ...grid, prefix: 'ZZ' }).success).toBe(false);
    expect(GridInfo.safeParse({ ...grid, createRouteId: 'sửa tuỳ ý' }).success).toBe(false);
    expect(GridInfo.safeParse({ ...grid, columns: [{ ...grid.columns[0], letter: 'a' }] }).success).toBe(false);
    expect((gridsRoute.response as { schema: z.ZodType }).schema.safeParse([grid]).success).toBe(true);
  });

  it('GridKey: mọi khoá trỏ đúng prefix của ENTITY_TYPES; không trùng prefix', () => {
    expect(GRID_KEYS.length).toBe(37);
    const prefixes = Object.values(GRID_PREFIX);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    for (const key of GRID_KEYS) expect(Object.hasOwn(ENTITY_TYPES, GRID_PREFIX[key]), key).toBe(true);
    // 6 lưới lõi DATABASE §6.1 + các lưới §6.2 chính
    for (const k of [
      'roles',
      'dna',
      'instructions',
      'skills',
      'knowledge',
      'memories',
      'tasks',
      'ledger',
      'audit',
      'events',
    ]) {
      expect(GridKey.safeParse(k).success, k).toBe(true);
    }
    expect(GridKey.safeParse('Roles').success).toBe(false);
  });

  it('sửa ô KHÔNG có route chung: không có PATCH /grids/…; mọi route /grids chỉ đọc', () => {
    for (const r of ROUTES.filter((x) => x.path.startsWith('/grids'))) expect(r.method, r.id).toBe('GET');
    expect(ROUTES.filter((r) => r.path.startsWith('/records')).map((r) => r.method)).toEqual(['GET']);
  });

  it('Data Console có đủ nguồn dữ liệu: mọi route DataGrid, ⌘K, thông báo, SSE grid.changed', () => {
    // DataGrid = 4 route lưới chung + route của từng miền nối vào lưới (GRID_WRITE_ROUTES): không có PATCH chung.
    expect(FS_COVERAGE.DataGrid.slice(0, 4)).toEqual(['OPS-32', 'OPS-33', 'OPS-34', 'OPS-35']);
    for (const id of [
      'GW-26',
      'GW-27',
      'GW-28',
      'GW-29',
      'GW-30',
      'GW-31',
      'GW-32',
      'WRK-19',
      'WRK-26',
      'SYS-38',
      'SYS-48',
    ]) {
      expect(FS_COVERAGE.DataGrid as readonly string[], id).toContain(id);
    }
    expect(FS_COVERAGE.O1).toEqual(['OPS-36', 'OPS-35']);
    expect(SSE_EVENT_TYPES as readonly string[]).toContain('grid.changed');
    for (const id of ['OPS-32', 'OPS-33', 'OPS-34', 'OPS-35', 'OPS-36']) expect(routeById(id)?.auth, id).toBe('V');
  });

  it('chỉ-đọc cho viewer, route Data Console đọc không bị O4 mở: bị chặn khi recovery (✗)', () => {
    for (const id of ['OPS-32', 'OPS-33', 'OPS-34', 'OPS-35', 'OPS-36'])
      expect(routeById(id)?.recovery, id).toBe(false);
  });

  it('GRID_WRITE_ROUTES: đủ mọi lưới; route nối vào lưới có thật, đúng method, không chạm credential / secret', () => {
    expect(Object.keys(GRID_WRITE_ROUTES).sort()).toEqual([...GRID_KEYS].sort());
    const wired = gridRouteIds();
    expect(wired.length).toBeGreaterThan(30);
    for (const id of wired) {
      const r = routeById(id);
      expect(r, `route ${id} nối vào lưới nhưng không có trong registry`).toBeDefined();
      expect(r?.touchesCredential, `${id}: route chạm credential KHÔNG được nối vào ô lưới`).toBe(false);
      expect(r?.userPassword, id).toBe(false);
      expect(r?.request.body && secretFieldsOf(r.request.body).length, `${id}: body có secret`).toBeFalsy();
    }
    for (const [grid, w] of Object.entries(GRID_WRITE_ROUTES)) {
      if (w.create) expect(routeById(w.create)?.method, `${grid}.create`).toBe('POST');
      if (w.remove) expect(routeById(w.remove)?.method, `${grid}.remove`).toBe('DELETE');
      for (const [col, id] of Object.entries(w.edit)) {
        expect(['PATCH', 'PUT', 'POST'], `${grid}.edit.${col}`).toContain(routeById(id)?.method);
        expect(col, `${grid}: tên cột`).toMatch(/^[a-z][a-z0-9_]{0,31}$/);
      }
      for (const id of w.reads) expect(routeById(id)?.method, `${grid}.reads`).toBe('GET');
    }
  });

  it('lưới trạng thái hệ thống (sessions, permission_requests, tool_grants, tools): chỉ-đọc trừ khi đã có route ghi, giữ quyền route gốc', () => {
    for (const [grid, prefix] of [
      ['sessions', 'SS'],
      ['permission_requests', 'PM'],
      ['tool_grants', 'GR'],
      ['tools', 'TL'],
    ] as const) {
      expect(GRID_PREFIX[grid]).toBe(prefix);
      expect(GridKey.safeParse(grid).success).toBe(true);
      expect(GRID_WRITE_ROUTES[grid].create, `${grid}: không có route tạo ⇒ chỉ-đọc`).toBeNull();
      expect(GRID_WRITE_ROUTES[grid].remove).toBeNull();
    }
    expect(GRID_WRITE_ROUTES.sessions).toMatchObject({ edit: {}, actions: {}, reads: ['GW-26', 'GW-27'] });
    expect(GRID_WRITE_ROUTES.tools).toMatchObject({ edit: {}, actions: {}, reads: ['GW-32'] });
    // đã có route ghi tương ứng ⇒ nối vào, GIỮ NGUYÊN quyền của route gốc (không nới ở lưới)
    expect(GRID_WRITE_ROUTES.permission_requests.edit).toEqual({ status: 'GW-29' });
    expect(GRID_WRITE_ROUTES.tool_grants.edit).toEqual({ mode: 'GW-31' });
    expect(routeById('GW-29')?.auth).toBe('A');
    expect(routeById('GW-31')?.auth).toBe('A');
  });

  it('prefix chưa có lưới (liệt kê để Gen quyết, KHÔNG tự thêm prefix): 19 prefix', () => {
    const have = new Set(Object.values(GRID_PREFIX));
    const missing = Object.keys(ENTITY_TYPES).filter((p) => !have.has(p as never));
    expect(missing.sort()).toEqual(
      [
        'AN',
        'AS',
        'AT',
        'BK',
        'CN',
        'EG',
        'GC',
        'JB',
        'MSG',
        'PB',
        'PS',
        'RV',
        'SEC',
        'ST',
        'TH',
        'TT',
        'UA',
        'US',
        'WL',
      ].sort(),
    );
  });

  it('cột sửa được trỏ route ghi có thật của lane sở hữu (editRouteId dạng RouteIdRef)', () => {
    const edit = ['SYS-38', 'SYS-48', 'OPS-03'];
    for (const id of edit) expect(routeById(id)?.method).toBe(id === 'OPS-03' ? 'PATCH' : 'PATCH');
    expect(defOf(GridInfo).type).toBe('object');
  });
});
