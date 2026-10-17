// compileGridSelect / compileGridLocate (OPS-33 / 34 / 37): chiếu cột whitelist, keyset nhiều khoá, offset, COUNT, nhóm, footer,
// định vị — trên DB thật; mọi câu lệnh của mọi lưới không quét bảng (EXPLAIN QUERY PLAN không có SCAN).
import { GRID_COLUMNS, GRID_PREFIX, type GridKeyName } from '@ga/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  compileGridLocate,
  compileGridSelect,
  displaySqlOf,
  findField,
  GRIDS,
  type QueryContext,
  type SortSpec,
  type Stmt,
} from '../../src/query-box/index.ts';
import { addTenant, createFixture, type Fixture } from '../../src/repos/fixture/index.ts';

const NOW = new Date('2026-10-17T08:00:00.000Z');
let f: Fixture;
let ctx: QueryContext;
let otherWs: string;

const all = (s: Stmt) => f.reader.db.prepare(s.sql).all(...s.params) as Record<string, unknown>[];
const plan = (s: Stmt) =>
  (f.reader.db.prepare(`EXPLAIN QUERY PLAN ${s.sql}`).all(...s.params) as { detail: string }[]).map((p) => p.detail);
const scans = (s: Stmt) => plan(s).filter((d) => /^SCAN /.test(d) && !/^SCAN search_fts VIRTUAL TABLE/.test(d));

beforeAll(() => {
  f = createFixture();
  ctx = { workspaceId: f.workspaceId, timezone: 'UTC', now: NOW };
  const colors = ['jade', 'jade', 'clay', 'jade', 'clay', 'rose'] as const;
  colors.forEach((color, i) => {
    f.clock.advance(60_000 * (i % 2 === 0 ? 1 : 0)); // vài hàng trùng created ⇒ khoá hoà display_seq có tác dụng
    f.store.write(f.ownerActorId, (tx) => tx.roles.create({ name: `Vai ${i}`, color }));
  });
  const other = addTenant(f, { slug: 'khac', shortCode: '9X3N', username: 'khac2', roles: 0 });
  otherWs = other.workspaceId;
  f.store.write(other.ownerActorId, (tx) => tx.roles.create({ name: 'Ngoài', color: 'jade' }));
});
afterAll(() => f?.close());

const RL_COLS = GRID_COLUMNS.roles.map((c) => c.name);

describe('compileGridSelect (DB thật)', () => {
  it('chỉ cột whitelist, có biểu thức hiển thị cho MỌI cột của hợp đồng; cột lạ ⇒ unknown_field', () => {
    for (const key of Object.keys(GRID_PREFIX) as GridKeyName[])
      for (const c of GRID_COLUMNS[key]) expect(displaySqlOf(GRID_PREFIX[key], c.name), `${key}.${c.name}`).not.toBeNull();
    expect(displaySqlOf('RL', 'password_hash')).toBeNull();
    expect(() => compileGridSelect('RL', [], ctx, { cols: ['secret'], sort: [], limit: 10 })).toThrow(
      expect.objectContaining({ code: 'unknown_field' }),
    );
    const s = compileGridSelect('RL', [], ctx, { cols: RL_COLS, sort: [], limit: 10 });
    const rows = all(s.rows);
    expect(rows.length).toBe(6);
    expect(Object.keys(rows[0] as object).filter((k) => !k.startsWith('__'))).toEqual(RL_COLS.map((c) => `c_${c}`));
    expect(rows.map((r) => r.c_name)).toEqual(['Vai 0', 'Vai 1', 'Vai 2', 'Vai 3', 'Vai 4', 'Vai 5']);
    expect(all(s.count)[0]?.n).toBe(6); // tenant khác không lọt
  });

  it('keyset nhiều khoá khác chiều = đúng thứ tự của sort trong JS; trang keyset nối liền = trang offset', () => {
    const sort: SortSpec[] = [{ field: 'created', desc: true }];
    const full = all(compileGridSelect('RL', [], ctx, { cols: ['name', 'color'], sort, limit: 100 }).rows);
    const want = [...full].sort((a, b) =>
      a.__k0 === b.__k0 ? (a.__k1 as number) - (b.__k1 as number) : String(b.__k0).localeCompare(String(a.__k0)),
    );
    // created DESC, khoá hoà display_seq theo chiều của khoá cuối (DESC)
    const wantDesc = [...full].sort((a, b) =>
      a.__k0 === b.__k0 ? (b.__k1 as number) - (a.__k1 as number) : String(b.__k0).localeCompare(String(a.__k0)),
    );
    expect(full.map((r) => r.c_name)).toEqual(wantDesc.map((r) => r.c_name));
    expect(new Set(full.map((r) => r.__k0)).size).toBeLessThan(6); // có hàng trùng created
    expect(want.length).toBe(6);
    // id tăng dần làm khoá hoà tường minh ⇒ chuỗi OR (khác chiều)
    const mixed: SortSpec[] = [
      { field: 'created', desc: true },
      { field: 'id', desc: false },
    ];
    const ref = all(compileGridSelect('RL', [], ctx, { cols: ['name'], sort: mixed, limit: 100 }).rows);
    expect(ref.map((r) => r.c_name)).toEqual(want.map((r) => r.c_name));
    const paged: unknown[] = [];
    let after: (string | number)[] | undefined;
    for (let i = 0; i < 10; i++) {
      const s = compileGridSelect('RL', [], ctx, { cols: ['name'], sort: mixed, limit: 2, ...(after ? { after } : {}) });
      const rows = all(s.rows).slice(0, s.limit);
      if (rows.length === 0) break;
      paged.push(...rows.map((r) => r.c_name));
      const last = rows[rows.length - 1] as Record<string, unknown>;
      after = Array.from({ length: s.keyCount }, (_, k) => last[`__k${k}`] as string | number);
    }
    expect(paged).toEqual(ref.map((r) => r.c_name));
    const off = all(compileGridSelect('RL', [], ctx, { cols: ['name'], sort: mixed, limit: 2, offset: 2 }).rows);
    expect(off.slice(0, 2).map((r) => r.c_name)).toEqual(ref.slice(2, 4).map((r) => r.c_name));
  });

  it('nhóm + footer tính trên TOÀN tập khớp; con trỏ hỏng / offset quá trần ⇒ bad_value', () => {
    const s = compileGridSelect('RL', ['color:jade,clay'], ctx, { cols: ['color'], sort: [], group: 'color', limit: 1 });
    expect(all(s.groups as Stmt)).toEqual([
      { g: 'clay', n: 2 },
      { g: 'jade', n: 3 },
    ]);
    expect(all(s.count)[0]?.n).toBe(5);
    expect(all(s.rows)[0]?.c_color).toBe('clay');
    expect(compileGridSelect('LG', [], ctx, { cols: ['amount'], sort: [], limit: 1 }).footer).not.toBeNull();
    const bad = (o: object) => () => compileGridSelect('RL', [], ctx, { cols: [], sort: [], limit: 1, ...o });
    expect(bad({ after: ['x', 'y'] })).toThrow(expect.objectContaining({ code: 'bad_value' }));
    expect(bad({ after: [1.5] })).toThrow(expect.objectContaining({ code: 'bad_value' }));
    expect(bad({ offset: 100_001 })).toThrow(expect.objectContaining({ code: 'bad_value' }));
    expect(bad({ group: 'color', after: [1] })).toThrow(expect.objectContaining({ code: 'bad_value' }));
    expect(bad({ sort: [{ field: 'name', desc: false }] })).toThrow(expect.objectContaining({ code: 'unknown_field' }));
  });

  it('lưới tự-phạm-vi (notifications) thiếu selfUserId ⇒ throw; có ⇒ điều kiện user_id', () => {
    expect(() => compileGridSelect('NT', [], ctx, { cols: ['title'], sort: [], limit: 1 })).toThrow(/selfUserId/);
    const s = compileGridSelect('NT', [], ctx, { cols: ['title'], sort: [], limit: 1, selfUserId: 'U1' });
    expect(s.rows.sql).toContain('t.user_id = ?');
    expect(s.count.params).toContain('U1');
    expect(() => compileGridLocate('NT', [], ctx, { sort: [] }, 1)).toThrow(/selfUserId/);
  });

  it('viewer + chữ tự do trên lưới có confidential ⇒ loại hàng confidential khỏi kết quả tìm chữ', () => {
    const v = compileGridSelect('MM', ['mai'], ctx, { cols: ['content'], sort: [], limit: 1, hideConfidentialText: true });
    expect(v.count.sql).toContain("NOT (t.sensitivity = 'confidential')");
    const v2 = compileGridSelect('MM', ['status:active'], ctx, { cols: [], sort: [], limit: 1, hideConfidentialText: true });
    expect(v2.count.sql).not.toContain('NOT (t.sensitivity');
  });
});

describe('compileGridLocate', () => {
  it('index = số hàng đứng trước theo cùng sort; hàng không khớp lọc / tenant khác ⇒ không có', () => {
    const sort: SortSpec[] = [{ field: 'created', desc: true }];
    const rows = all(compileGridSelect('RL', ['color:jade'], ctx, { cols: [], sort, limit: 100 }).rows);
    for (const [i, r] of rows.entries()) {
      const seq = Number(String(r.__did).split('-')[1]);
      const l = compileGridLocate('RL', ['color:jade'], ctx, { sort }, seq);
      const probe = all(l.probe)[0] as Record<string, unknown>;
      expect(all(l.member)).toHaveLength(1);
      const vals = Array.from({ length: l.keyCount }, (_, k) => probe[`__k${k}`] as string | number);
      expect(all(l.countBefore(vals))[0]?.n).toBe(i);
    }
    const rose = all(compileGridSelect('RL', ['color:rose'], ctx, { cols: [], sort: [], limit: 1 }).rows)[0];
    const seq = Number(String(rose?.__did).split('-')[1]);
    const l = compileGridLocate('RL', ['color:jade'], ctx, { sort }, seq);
    expect(all(l.probe)).toHaveLength(1);
    expect(all(l.member)).toHaveLength(0);
    const o = compileGridLocate('RL', [], { ...ctx, workspaceId: otherWs }, { sort }, seq);
    expect(all(o.probe)).toHaveLength(seq === 1 ? 1 : 0);
  });
});

describe('meta: mọi lưới × mọi dạng câu lệnh — chạy được, không SCAN', () => {
  it('rows / count / groups / footer / locate', () => {
    let checked = 0;
    for (const key of Object.keys(GRID_PREFIX) as GridKeyName[]) {
      const prefix = GRID_PREFIX[key];
      const g = GRIDS[prefix];
      if (g === undefined) throw new Error(prefix);
      const cols = GRID_COLUMNS[key].map((c) => c.name);
      const sortable = g.fields.filter((x) => x.sortable).map((x) => x.names[0] as string);
      const sorts: SortSpec[][] = [[], [{ field: 'id', desc: true }]];
      for (const s of sortable) {
        sorts.push([{ field: s, desc: false }]);
        sorts.push([
          { field: s, desc: true },
          { field: 'id', desc: false },
        ]);
      }
      const scope = { selfUserId: 'U1', hideConfidentialText: true };
      const groups = g.fields.map((x) => x.names[0] as string);
      for (const sort of sorts) {
        const s = compileGridSelect(prefix, [], ctx, { cols, sort, limit: 5, ...scope });
        const after = Array.from({ length: s.keyCount }, (_, i) =>
          i === s.keyCount - 1 ? 2 : sort[i] && findField(g, sort[i].field)?.type === 'ts' ? '2026-10-01' : 1,
        );
        const withAfter = compileGridSelect(prefix, [], ctx, { cols, sort, limit: 5, after, ...scope });
        const withOffset = compileGridSelect(prefix, [], ctx, { cols, sort, limit: 5, offset: 10, ...scope });
        const loc = compileGridLocate(prefix, [], ctx, { sort, ...scope }, 1);
        for (const st of [s.rows, s.count, withAfter.rows, withOffset.rows, loc.probe, loc.member, loc.countBefore(after)]) {
          expect(() => all(st), `${key} ${st.sql}`).not.toThrow();
          expect(scans(st), `${key} ${JSON.stringify(sort)}\n${st.sql}\n${plan(st).join('\n')}`).toEqual([]);
          checked++;
        }
        if (s.footer) {
          expect(scans(s.footer), `${key} footer`).toEqual([]);
          all(s.footer);
        }
      }
      for (const grp of groups) {
        const s = compileGridSelect(prefix, [], ctx, { cols: [], sort: [], group: grp, limit: 5, ...scope });
        for (const st of [s.rows, s.groups as Stmt]) {
          expect(() => all(st), `${key} group ${grp}`).not.toThrow();
          expect(scans(st), `${key} group ${grp}\n${plan(st).join('\n')}`).toEqual([]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });
});
