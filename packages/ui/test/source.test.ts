import { describe, expect, it } from 'vitest';
import { createMemorySource } from '../src/datagrid/memory-source.ts';
import { GridRowError, RowCache } from '../src/datagrid/row-cache.ts';
import {
  type GridDataSource,
  type GridQuery,
  GridQueryError,
  type GridRange,
  type GridRangeRequest,
} from '../src/datagrid/types.ts';
import { AUDIT_COLUMNS, type AuditRow, auditId, makeAuditRows } from './fixtures/audit.ts';
import { INSTRUCTION_COLUMNS, INSTRUCTIONS, type InstructionRow, updateInstruction } from './fixtures/instructions.ts';

const Q = (q = '', sort: GridQuery['sort'] = []): GridQuery => ({ q, sort });
const signal = () => new AbortController().signal;
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('createMemorySource', () => {
  const src = () =>
    createMemorySource(INSTRUCTIONS, {
      columns: INSTRUCTION_COLUMNS,
      getId: (r) => r.id,
      idPrefix: 'IN',
      update: updateInstruction,
      clock: { now: () => new Date('2026-10-14T07:06:00.000Z') },
    });

  it('trang + tổng + Σ theo cột sum trên TOÀN BỘ kết quả (không chỉ trang)', async () => {
    const s = src();
    const r = await s.fetchRange({ query: Q('layer:vi-tri'), start: 0, limit: 2, signal: signal() });
    expect(r.rows.map((x) => x.id)).toEqual(['IN-0008', 'IN-0009']);
    expect(r.total).toBe(3);
    expect(r.aggregates).toEqual({ token_count: 140 + 88 + 64 });
  });

  it('sắp xếp ổn định nhiều khoá, NULL cuối, hoà theo display_id', async () => {
    const s = src();
    const r = await s.fetchRange({
      query: Q('', [
        { column: 'layer', desc: false },
        { column: 'token_count', desc: true },
      ]),
      start: 0,
      limit: 100,
      signal: signal(),
    });
    const goal = r.rows.filter((x) => x.layer === 'position').map((x) => x.token_count);
    expect(goal).toEqual([140, 88, 64]);
    const all = await s.fetchRange({ query: Q(''), start: 0, limit: 100, signal: signal() });
    expect(all.rows.map((x) => x.id)).toEqual(INSTRUCTIONS.map((x) => x.id));
  });

  it('truy vấn sai ⇒ GridQueryError (lý do + vị trí), không trả kết quả nửa vời', async () => {
    const s = src();
    await expect(s.fetchRange({ query: Q('abc:1'), start: 0, limit: 10, signal: signal() })).rejects.toMatchObject({
      name: 'GridQueryError',
      reason: 'unknown_field',
      position: 0,
    });
    await expect(
      s.fetchRange({ query: Q('', [{ column: 'nope', desc: false }]), start: 0, limit: 10, signal: signal() }),
    ).rejects.toBeInstanceOf(GridQueryError);
  });

  it('locate: found / filtered / gone', async () => {
    const s = src();
    expect(await s.locate({ query: Q('on:true'), id: 'IN-0011', signal: signal() })).toEqual({
      state: 'found',
      index: 9,
    });
    expect(await s.locate({ query: Q('on:true'), id: 'IN-0007', signal: signal() })).toEqual({ state: 'filtered' });
    expect(await s.locate({ query: Q(''), id: 'IN-0999', signal: signal() })).toEqual({ state: 'gone' });
  });

  it('nhóm theo thứ tự sắp xếp + số hàng mỗi nhóm', async () => {
    const s = src();
    const g = await s.groups?.({ query: Q('', [{ column: 'layer', desc: false }]), column: 'layer', signal: signal() });
    expect(g?.reduce((a, x) => a + x.count, 0)).toBe(INSTRUCTIONS.length);
    expect(new Set(g?.map((x) => x.value)).size).toBe(g?.length);
  });

  it('sửa ô trả hàng mới, truy vấn sau thấy giá trị mới; nguồn chỉ đọc không có updateCell', async () => {
    const s = src();
    const next = await s.updateCell?.({ id: 'IN-0005', column: 'name', value: 'Xưng hô', reason: null });
    expect(next?.name).toBe('Xưng hô');
    const r = await s.fetchRange({ query: Q('name="Xưng hô"'), start: 0, limit: 5, signal: signal() });
    expect(r.rows.map((x) => x.id)).toEqual(['IN-0005']);
    expect(
      createMemorySource(INSTRUCTIONS, { columns: INSTRUCTION_COLUMNS, getId: (r) => r.id }).updateCell,
    ).toBeUndefined();
  });

  it('huỷ bằng AbortSignal', async () => {
    const s = createMemorySource(INSTRUCTIONS, {
      columns: INSTRUCTION_COLUMNS,
      getId: (r: InstructionRow) => r.id,
      latencyMs: 50,
    });
    const c = new AbortController();
    const p = s.fetchRange({ query: Q(), start: 0, limit: 5, signal: c.signal });
    c.abort();
    await expect(p).rejects.toThrow();
  });

  it('xuất theo luồng đúng cùng truy vấn', async () => {
    const rows = makeAuditRows(1200);
    const s = createMemorySource(rows, { columns: AUDIT_COLUMNS, getId: (r: AuditRow) => r.id });
    const got: string[] = [];
    for await (const chunk of s.exportRows?.({ query: Q('result:ok'), signal: signal() }) ?? []) {
      got.push(...chunk.map((r) => r.id));
    }
    expect(got).toEqual(rows.filter((r) => r.result === 'ok').map((r) => r.id));
  });
});

/** nguồn có điều khiển: test giữ từng phản hồi để kiểm thứ tự / huỷ */
function controlled(total: number) {
  const pending: {
    req: GridRangeRequest;
    resolve: (r: GridRange<{ id: string }>) => void;
    reject: (e: unknown) => void;
  }[] = [];
  const src: GridDataSource<{ id: string }> = {
    fetchRange: (req) =>
      new Promise((resolve, reject) => {
        pending.push({ req, resolve, reject });
      }),
    locate: async () => ({ state: 'gone' }),
  };
  const answer = (i: number, tag = '', tot = total) => {
    const p = pending[i];
    if (!p) throw new Error(`không có yêu cầu ${i}`);
    const rows = Array.from({ length: Math.max(0, Math.min(p.req.limit, tot - p.req.start)) }, (_, k) => ({
      id: `${tag}${auditId(p.req.start + k + 1)}`,
    }));
    p.resolve({ start: p.req.start, rows, total: tot, aggregates: { tokens: tot * 10 } });
  };
  return { src, pending, answer };
}

describe('RowCache', () => {
  it('chỉ tải khối đang cần; ensure lặp lại không gọi lại nguồn', async () => {
    const c = controlled(10_000);
    const cache = new RowCache(c.src, (r) => r.id, Q(), { blockSize: 100 });
    cache.ensure(0, 30);
    expect(c.pending).toHaveLength(1);
    c.answer(0);
    await tick();
    expect(cache.total).toBe(10_000);
    expect(cache.row(29)?.id).toBe('AU-00030');
    cache.ensure(8_990, 9_010);
    expect(c.pending.map((p) => p.req.start)).toEqual([0, 8_900, 9_000]);
    cache.ensure(8_990, 9_010);
    expect(c.pending).toHaveLength(3);
    c.answer(1);
    c.answer(2);
    await tick();
    expect(cache.row(8_999)?.id).toBe('AU-09000');
    expect(cache.indexOfId('AU-09000')).toBe(8_999);
  });

  it('đổi truy vấn: huỷ yêu cầu cũ (signal.aborted) và bỏ phản hồi trễ của truy vấn cũ', async () => {
    const c = controlled(500);
    const cache = new RowCache(c.src, (r) => r.id, Q('a'), { blockSize: 100 });
    cache.ensure(0, 10);
    cache.setQuery(Q('b'));
    expect(c.pending[0]?.req.signal.aborted).toBe(true);
    expect(c.pending[1]?.req.query.q).toBe('b');
    // phản hồi trễ của truy vấn cũ (tổng khác) về TRƯỚC: không được đè tổng / Σ / hàng của truy vấn mới
    c.answer(0, 'OLD', 77);
    await tick();
    expect(cache.total).toBeNull();
    expect(cache.aggregates).toEqual({});
    c.answer(1);
    await tick();
    expect(cache.row(0)?.id).toBe('AU-00001');
    expect(cache.total).toBe(500);
    // … và về SAU phản hồi mới: vẫn bị bỏ (yêu cầu 2 = truy vấn c, 3 = truy vấn d)
    cache.setQuery(Q('c'));
    cache.setQuery(Q('d'));
    expect(c.pending.map((p) => p.req.query.q)).toEqual(['a', 'b', 'c', 'd']);
    c.answer(3);
    c.answer(2, 'OLD', 77);
    await tick();
    expect(cache.total).toBe(500);
    expect(cache.aggregates).toEqual({ tokens: 5000 });
    expect(cache.row(0)?.id).toBe('AU-00001');
  });

  it('lỗi nguồn: giữ lỗi, KHÔNG tự gọi lại khi ensure (không vòng lặp), retry() mới tải lại', async () => {
    const c = controlled(500);
    const cache = new RowCache(c.src, (r) => r.id, Q(), { blockSize: 100 });
    cache.ensure(0, 10);
    c.pending[0]?.reject(new Error('mạng'));
    await tick();
    expect((cache.error as Error).message).toBe('mạng');
    cache.ensure(0, 10);
    cache.ensure(0, 10);
    expect(c.pending).toHaveLength(1);
    cache.retry();
    expect(c.pending).toHaveLength(2);
    c.answer(1);
    await tick();
    expect(cache.error).toBeNull();
    expect(cache.row(0)?.id).toBe('AU-00001');
  });

  it('giới hạn bộ nhớ: bỏ khối dùng lâu nhất ngoài vùng đang thấy', async () => {
    const c = controlled(100_000);
    const cache = new RowCache(c.src, (r) => r.id, Q(), { blockSize: 10, maxBlocks: 5 });
    for (let k = 0; k < 20; k++) cache.ensure(k * 10, k * 10 + 10);
    expect(cache.blockCount).toBeLessThanOrEqual(5);
  });

  it('validate: một hàng sai (vd display_id không thuộc bảng) ⇒ cả khối thành lỗi GridRowError, không lộ hàng nào', async () => {
    const c = controlled(50);
    const cache = new RowCache(c.src, (r) => r.id, Q(), {
      blockSize: 100,
      validate: (r) => (r.id === 'AU-00007' ? 'display_id không thuộc bảng' : null),
    });
    cache.ensure(0, 10);
    c.answer(0);
    await tick();
    expect(cache.error).toBeInstanceOf(GridRowError);
    expect(cache.row(0)).toBeUndefined();
    expect(cache.total).toBeNull();
  });

  it('replace: thay hàng đã tải theo display_id, phát thay đổi', async () => {
    const c = controlled(50);
    const cache = new RowCache(c.src, (r) => r.id, Q(), { blockSize: 100 });
    cache.ensure(0, 10);
    c.answer(0);
    await tick();
    let n = 0;
    cache.subscribe(() => n++);
    expect(cache.replace({ id: 'AU-00003' })).toBe(true);
    expect(cache.replace({ id: 'AU-99999' })).toBe(false);
    expect(n).toBe(1);
  });
});
