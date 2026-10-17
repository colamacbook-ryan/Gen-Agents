import { GRID_WRITE_ROUTES, ROUTES, SSE_EVENT_TYPES } from '@ga/contracts';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import {
  applyStreamEvent,
  INVALIDATIONS,
  invalidateAfterWrite,
  SSE_INVALIDATIONS,
} from '../../src/api/invalidation.ts';
import { routeKey } from '../../src/api/keys.ts';
import type { WriteId } from '../../src/api/routes.ts';

const writes = ROUTES.filter((r) => r.method !== 'GET' && r.method !== 'WS');
const table = INVALIDATIONS as Record<string, readonly string[]>;
// route ghi mà "không có gì để đọc lại" — thêm vào đây là QUYẾT ĐỊNH có chủ đích, không phải quên
const EXPLICITLY_EMPTY = ['SYS-21'];

describe('bảng vô hiệu hoá', () => {
  it('MỌI route ghi của registry có mục (mảng rỗng phải tường minh), và không có mục thừa', () => {
    expect(Object.keys(table).sort()).toEqual(writes.map((r) => r.id).sort());
    expect(
      Object.entries(table)
        .filter(([, v]) => v.length === 0)
        .map(([k]) => k),
    ).toEqual(EXPLICITLY_EMPTY);
  });

  it('mọi đích là route ĐỌC JSON có thật, không trùng, không tự trỏ vào mình', () => {
    const readable = new Set(ROUTES.filter((r) => r.method === 'GET' && r.response.kind === 'json').map((r) => r.id));
    for (const [id, targets] of Object.entries(table)) {
      expect(new Set(targets).size, `${id} có đích trùng`).toBe(targets.length);
      for (const t of targets) {
        expect(readable.has(t), `${id} → ${t} không phải route đọc JSON`).toBe(true);
        expect(t).not.toBe(id);
      }
    }
  });

  it('mọi route ghi nối vào lưới (GRID_WRITE_ROUTES) đều làm mới OPS-33', () => {
    const missing: string[] = [];
    for (const w of Object.values(GRID_WRITE_ROUTES)) {
      const ids = [w.create, w.remove, ...Object.values(w.edit), ...Object.values(w.actions)].filter(
        (x): x is string => x !== null,
      );
      for (const id of ids) if (!table[id]?.includes('OPS-33')) missing.push(id);
    }
    expect([...new Set(missing)]).toEqual([]);
  });

  it('thực thi: ghi SYS-31 làm hết đúng danh sách Role, không đụng truy vấn không liên quan', async () => {
    const qc = new QueryClient();
    qc.setQueryData(routeKey('SYS-30'), []);
    qc.setQueryData(routeKey('OPS-33', { params: { gridKey: 'roles' } }), {});
    qc.setQueryData(routeKey('OPS-02'), {});
    await invalidateAfterWrite(qc, 'SYS-31' satisfies WriteId);
    expect(qc.getQueryState(routeKey('SYS-30'))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(routeKey('OPS-33', { params: { gridKey: 'roles' } }))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(routeKey('OPS-02'))?.isInvalidated).toBe(false);
  });
});

const base = { id: 'ev-1', workspaceId: '01JABCDEFGHJKMNPQRSTVWXYZ0', at: '2026-10-17T00:00:00.000Z' };

describe('sự kiện SSE ⇒ vô hiệu hoá', () => {
  it('mọi loại sự kiện của hợp đồng có mục (rỗng tường minh), không có mục thừa', () => {
    expect(Object.keys(SSE_INVALIDATIONS).sort()).toEqual([...SSE_EVENT_TYPES].sort());
  });

  it('grid.changed chỉ làm hết các truy vấn của ĐÚNG lưới đó', async () => {
    const qc = new QueryClient();
    const roles = routeKey('OPS-33', { params: { gridKey: 'roles' }, query: { limit: 50 } });
    const tasks = routeKey('OPS-33', { params: { gridKey: 'tasks' } });
    qc.setQueryData(roles, {});
    qc.setQueryData(tasks, {});
    await applyStreamEvent(qc, { ...base, type: 'grid.changed', grid: 'roles', displayIds: ['RL-0001'], op: 'update' });
    expect(qc.getQueryState(roles)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(tasks)?.isInvalidated).toBe(false);
  });

  it('resync ⇒ đọc lại TẤT CẢ truy vấn API', async () => {
    const qc = new QueryClient();
    const keys = [routeKey('OPS-02'), routeKey('SYS-30'), routeKey('OPS-33', { params: { gridKey: 'tasks' } })];
    for (const k of keys) qc.setQueryData(k, {});
    qc.setQueryData(['khac'], 1);
    await applyStreamEvent(qc, { ...base, type: 'resync', reason: 'gap' });
    for (const k of keys) expect(qc.getQueryState(k)?.isInvalidated, JSON.stringify(k)).toBe(true);
    expect(qc.getQueryState(['khac'])?.isInvalidated).toBe(false);
  });
});
