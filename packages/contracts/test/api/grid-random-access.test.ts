import { describe, expect, it } from 'vitest';
import {
  API_LIMITS,
  ApiErrorEnvelope,
  ERROR_DETAIL_REASONS,
  FS_COVERAGE,
  formatDisplayId,
  GRID_OFFSET_MAX,
  GRID_PREFIX,
  GridLocate,
  GridRowsPage,
  requestSchemaOf,
  routeById,
} from '../../src/index.ts';

// Round 4: DataGrid (L-GRID) đọc hàng theo CHỈ SỐ (`GridDataSource.fetchRange(start, limit)` + `locate`); hợp đồng phải khớp 1:1.

const ULID = '01JABCDEFGHJKMNPQRSTVWXYZ0';
const parse = (id: string, value: unknown) => requestSchemaOf(routeById(id) as never).safeParse(value);
const rows = (query: Record<string, unknown>, gridKey = 'roles') => parse('OPS-33', { params: { gridKey }, query });
const locate = (query: Record<string, unknown>, gridKey = 'roles') => parse('OPS-37', { params: { gridKey }, query });

describe('OPS-33: truy cập ngẫu nhiên theo offset', () => {
  it('offset 0 … GRID_OFFSET_MAX hợp lệ; âm, số lẻ, vượt trần, chữ ⇒ từ chối', () => {
    expect(GRID_OFFSET_MAX).toBe(100_000);
    for (const offset of ['0', '9000', String(GRID_OFFSET_MAX)])
      expect(rows({ offset, limit: '200' }).success, offset).toBe(true);
    for (const offset of ['-1', '1.5', String(GRID_OFFSET_MAX + 1), '1e9', 'abc', '999999999999'])
      expect(rows({ offset }).success, offset).toBe(false);
  });

  it('offset và cursor loại trừ nhau (đủ cả hai ⇒ lỗi); mỗi cái một mình đều được', () => {
    expect(rows({ offset: '10', cursor: 'abc' }).success).toBe(false);
    expect(rows({ offset: '10' }).success).toBe(true);
    expect(rows({ cursor: 'abc' }).success).toBe(true);
    expect(rows({}).success).toBe(true);
  });

  it('offset đi cùng q / sort / group đã kiểm whitelist (vẫn bị chặn cột lạ)', () => {
    expect(rows({ offset: '500', sort: '-created', q: 'status:active', group: 'status' }).success).toBe(true);
    expect(rows({ offset: '500', sort: 'password_hash' }).success).toBe(false);
  });

  it('phản hồi: start + total chính xác (không null), footer Σ và groups do máy chủ tính', () => {
    const ok = {
      items: [],
      nextCursor: null,
      start: 9000,
      total: 12_345,
      footer: { tokens: 99 },
      clauses: [],
      aliasHints: [],
      groups: [{ value: 'active', count: 12_345 }],
    };
    expect(GridRowsPage.safeParse(ok).success).toBe(true);
    expect(GridRowsPage.safeParse({ ...ok, start: -1 }).success).toBe(false);
    expect(GridRowsPage.safeParse({ ...ok, total: null }).success).toBe(false);
  });
});

describe('OPS-37: locate', () => {
  it('route: GET, quyền V, o4 blocked (như OPS-33), chỉ đọc, nằm ở màn DataGrid', () => {
    const r = routeById('OPS-37');
    expect(r).toMatchObject({
      method: 'GET',
      auth: 'V',
      recovery: false,
      lane: 'L-OPS',
      path: '/grids/{gridKey}/locate',
    });
    expect(r?.errors).toContain('query.invalid');
    expect(FS_COVERAGE.DataGrid as readonly string[]).toContain('OPS-37');
    expect(r?.fs).toContain('DataGrid');
  });

  it('ba trạng thái đúng với GridLocateResult của DataGrid: found{index} | filtered | gone', () => {
    expect(GridLocate.safeParse({ state: 'found', index: 8999 }).success).toBe(true);
    expect(GridLocate.safeParse({ state: 'filtered' }).success).toBe(true);
    expect(GridLocate.safeParse({ state: 'gone' }).success).toBe(true);
    expect(GridLocate.safeParse({ state: 'found' }).success).toBe(false);
    expect(GridLocate.safeParse({ state: 'found', index: -1 }).success).toBe(false);
    expect(GridLocate.safeParse({ state: 'filtered', index: 3 }).success).toBe(false);
    expect(GridLocate.safeParse({ state: 'maybe' }).success).toBe(false);
  });

  it('request: displayId đúng prefix của lưới; q / sort theo whitelist; không nhận cols, group, cursor, offset', () => {
    expect(locate({ displayId: 'RL-0001' }).success).toBe(true);
    expect(locate({ displayId: 'RL-0001', q: 'status:active', sort: '-created' }).success).toBe(true);
    expect(locate({ displayId: 'MM-0041' }, 'memories').success).toBe(true);
    expect(locate({ displayId: 'MM-0041' }, 'roles').success, 'hàng của lưới khác').toBe(false);
    expect(locate({ displayId: ULID }).success, 'ULID không phải mã hiển thị').toBe(false);
    expect(locate({}).success).toBe(false);
    expect(locate({ displayId: 'RL-0001', sort: 'password_hash' }).success).toBe(false);
    expect(locate({ displayId: 'RL-0001', q: 'secret:x' }).success).toBe(false);
    for (const extra of [{ cols: 'name' }, { group: 'status' }, { cursor: 'x' }, { offset: '1' }, { limit: '5' }])
      expect(locate({ displayId: 'RL-0001', ...extra }).success, JSON.stringify(extra)).toBe(false);
  });

  it('mọi lưới đều định vị được hàng của CHÍNH nó', () => {
    for (const [grid, prefix] of Object.entries(GRID_PREFIX))
      expect(locate({ displayId: formatDisplayId(prefix, 1) }, grid).success, grid).toBe(true);
  });
});

describe('query.invalid: detail.position + detail.length', () => {
  const env = (detail: Record<string, unknown>) => ({
    error: { code: 'query.invalid', i18nKey: 'errors.query.invalid', requestId: 'req-1', detail },
  });

  it('detail mang reason, position, length (số nguyên không âm); length chỉ là số', () => {
    expect(ApiErrorEnvelope.safeParse(env({ reason: 'unknown_field', position: 14, length: 9 })).success).toBe(true);
    expect(ApiErrorEnvelope.safeParse(env({ reason: 'syntax', position: 0 })).success).toBe(true);
    expect(ApiErrorEnvelope.safeParse(env({ length: -1 })).success).toBe(false);
    expect(ApiErrorEnvelope.safeParse(env({ length: 'abc' })).success).toBe(false);
    expect(ApiErrorEnvelope.safeParse(env({ length: 1.5 })).success).toBe(false);
    expect(ERROR_DETAIL_REASONS['query.invalid']).toContain('unknown_field');
  });
});

describe('OPS-34: xuất theo luồng + trần hàng', () => {
  it('response csv: streamed, formulaEscape, maxRows = API_LIMITS.csvMaxRows; không nhận offset / cursor / limit', () => {
    expect(routeById('OPS-34')?.response).toEqual({
      kind: 'csv',
      formulaEscape: true,
      maxRows: API_LIMITS.csvMaxRows,
      streamed: true,
    });
    for (const extra of [{ offset: '5' }, { cursor: 'x' }, { limit: '5' }])
      expect(parse('OPS-34', { params: { gridKey: 'roles' }, query: extra }).success, JSON.stringify(extra)).toBe(
        false,
      );
  });
});
