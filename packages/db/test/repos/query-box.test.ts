// Ô truy vấn (DATABASE §8): parser §8.1, whitelist §8.2, biên dịch an toàn §8.3, ví dụ §8.4 + chạy thật trên fixture
// (lọc / FTS / id + id_aliases / keyset / cô lập tenant) + EXPLAIN QUERY PLAN cho MỌI trường whitelist (§8.3.5).
import { ENTITY_TYPES } from '@ga/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '../../src/ids/index.ts';
import {
  type CompiledQuery,
  compileGridQuery,
  type FieldDef,
  GRIDS,
  type GridDef,
  type GridPage,
  parseQuery,
  prefixOfTable,
  QUERY_MAX_CHARS,
  QUERY_MAX_CLAUSES,
  QUERY_MAX_VALUES,
  type QueryContext,
  runGridQuery,
} from '../../src/query-box/index.ts';
import { addTenant, createFixture, type Fixture, type TenantHandle } from '../../src/repos/fixture/index.ts';
import { dml, PAGE_MAX, type RoleRow, type TaskRow } from '../../src/repos/index.ts';

const qerr = (code: string) => expect.objectContaining({ name: 'QueryBoxError', code });
const NOW = new Date('2026-10-17T08:00:00.000Z');
const ctxOf = (workspaceId: string, timezone = 'UTC'): QueryContext => ({ workspaceId, timezone, now: NOW });
const C = ctxOf('W');

describe('parser §8.1', () => {
  it('mệnh đề trường / phủ định / nhiều giá trị / khoảng / reldate / cụm từ / id / text', () => {
    const cs = parseQuery(
      '-status:obsolete status:a,"b c" created:2026-10-01..2026-10-15 created>-7d "Hoàng Phát" MM-0041 mai tokens>=3 x!=y',
    );
    expect(cs.map((c) => c.kind)).toEqual(['field', 'field', 'field', 'field', 'text', 'id', 'text', 'field', 'field']);
    expect(cs[0]).toMatchObject({
      negate: true,
      field: 'status',
      op: ':',
      values: [{ kind: 'word', value: 'obsolete' }],
    });
    expect(cs[1]).toMatchObject({
      values: [
        { kind: 'word', value: 'a' },
        { kind: 'phrase', value: 'b c' },
      ],
    });
    expect(cs[2]).toMatchObject({
      values: [
        { kind: 'range', from: { kind: 'word', value: '2026-10-01' }, to: { kind: 'word', value: '2026-10-15' } },
      ],
    });
    expect(cs[3]).toMatchObject({ op: '>', values: [{ kind: 'reldate', amount: 7, unit: 'd' }] });
    expect(cs[4]).toMatchObject({ kind: 'text', text: 'Hoàng Phát', phrase: true, negate: false });
    expect(cs[5]).toMatchObject({ kind: 'id', prefix: 'MM', seq: 41, displayId: 'MM-0041' });
    expect(cs[6]).toMatchObject({ kind: 'text', text: 'mai', phrase: false });
    expect(cs[7]).toMatchObject({ field: 'tokens', op: '>=' });
    expect(cs[8]).toMatchObject({ field: 'x', op: '!=' });
    expect(parseQuery('   ')).toEqual([]);
    // 3 chữ số / chữ thường ⇒ không phải id mà là text
    expect(parseQuery('MM-041 mm-0041').map((c) => c.kind)).toEqual(['text', 'text']);
  });

  it('chặn kích thước TRƯỚC khi phân tích + lỗi có mã / đoạn / vị trí (chip đỏ)', () => {
    expect(() => parseQuery('a'.repeat(QUERY_MAX_CHARS + 1))).toThrow(qerr('too_long'));
    expect(parseQuery('a'.repeat(QUERY_MAX_CHARS))).toHaveLength(1);
    expect(() =>
      parseQuery(
        Array(QUERY_MAX_CLAUSES + 1)
          .fill('a')
          .join(' '),
      ),
    ).toThrow(qerr('too_many_clauses'));
    expect(parseQuery(Array(QUERY_MAX_CLAUSES).fill('a').join(' '))).toHaveLength(QUERY_MAX_CLAUSES);
    expect(() =>
      parseQuery(
        `status:${Array(QUERY_MAX_VALUES + 1)
          .fill('a')
          .join(',')}`,
      ),
    ).toThrow(qerr('too_many_values'));
    expect(() => parseQuery('x abc: y')).toThrow(
      expect.objectContaining({ code: 'empty_value', token: 'abc:', position: 2 }),
    );
    expect(() => parseQuery('ok :abc')).toThrow(expect.objectContaining({ code: 'bad_operator', position: 3 }));
    expect(() => parseQuery('=x')).toThrow(qerr('bad_operator'));
    expect(() => parseQuery('name:"abc')).toThrow(qerr('unterminated_quote'));
    expect(() => parseQuery('"abc def')).toThrow(qerr('unterminated_quote'));
    expect(() => parseQuery('status:a,,b')).toThrow(qerr('empty_value'));
    expect(() => parseQuery('name:a"b')).toThrow(qerr('unterminated_quote'));
    expect(() => parseQuery('name:a"b"')).toThrow(qerr('bad_value'));
  });
});

describe('biên dịch §8.3 / ví dụ §8.4 (không cần DB)', () => {
  it('IN: role:Mai status:active tokens>200 — workspace + deleted_at ngầm, mọi giá trị là tham số', () => {
    const q = compileGridQuery('IN', 'role:Mai status:active tokens>200', C);
    expect(q.sql).toContain('FROM "instructions" t WHERE t.workspace_id = ? AND t.deleted_at IS NULL AND ');
    expect(q.sql).toContain('t.role_id IN (SELECT r.id FROM roles r WHERE r.workspace_id = ? AND r.name_norm = ?');
    expect(q.params).toEqual(['W', 'W', 'mai', 'active', 200, 101]);
    expect(q.sql).not.toMatch(/mai|active|200/i);
  });

  it('LG: type:penalty amount>500 created>=2026-10-01 — ₲ → minor, ngày → UTC; bảng không xoá mềm', () => {
    const q = compileGridQuery('LG', 'type:penalty amount>500 created>=2026-10-01', C);
    expect(q.params).toEqual(['W', 'penalty', 50000, '2026-10-01T00:00:00.000Z', 101]);
    expect(q.sql).not.toContain('deleted_at');
    expect(compileGridQuery('LG', 'loai:phat so-tien:1.5..2', C).params).toEqual(['W', 'penalty', 150, 200, 101]);
  });

  it('-status:a,b ⇒ phủ định cả tập (NULL coi như không khớp); != là phủ định của bằng', () => {
    const q = compileGridQuery('MM', '-status:obsolete,superseded', C);
    expect(q.sql).toContain('((t.status = ? OR t.status = ?)) IS NOT 1');
    expect(q.params).toEqual(['W', 'obsolete', 'superseded', 101]);
    expect(compileGridQuery('MM', 'status!=active', C).sql).toContain('((t.status = ?) IS NOT 1)');
    // phủ định hai lần = khẳng định
    expect(compileGridQuery('MM', '-status!=active', C).sql).toContain('AND t.status = ? ORDER BY');
  });

  it('LIKE tiền tố: escape % _ \\ ; action:dna_field.* ⇒ dna\\_field.%', () => {
    const q = compileGridQuery('AU', 'action:dna_field.*', C);
    expect(q.sql).toContain("t.action LIKE ? ESCAPE '\\'");
    expect(q.params).toEqual(['W', 'dna\\_field.%', 101]);
    expect(compileGridQuery('RL', 'name:50%_off\\*', C).params).toEqual(['W', '50\\%\\_off\\\\%', 101]);
  });

  it('alias vi không dấu cho tên trường + giá trị enum (§8.1) ⇒ cùng SQL + tham số với bản tiếng Anh', () => {
    const same = (grid: string, vi: string, en: string) =>
      expect(compileGridQuery(grid, vi, C)).toEqual(compileGridQuery(grid, en, C));
    same('MM', 'trang-thai:bi-thay', 'status:superseded');
    same('DN', 'trang-thai:de-xuat', 'status:proposed');
    same('MM', 'pham-vi:vi-tri', 'scope:position');
    same('IN', 'nguon:ai', 'source:ai_inferred');
    same('IN', 'lop:gia-tri', 'layer:values');
    same('TK', 'vai:Mai', 'role:Mai');
    same('TK', 'ROLE:Mai', 'role:Mai');
    same('MM', 'kind:cam-ket', 'kind:commitment');
  });

  it('enum số (tier 1 / 2) bind đúng kiểu số', () => {
    expect(compileGridQuery('DN', 'tang:2', C).params).toEqual(['W', 2, 101]);
    expect(() => compileGridQuery('DN', 'tier:3', C)).toThrow(qerr('bad_value'));
  });

  it('ngày theo múi giờ workspace (kể cả ngày đổi giờ DST 23h / 25h), khoảng gồm cả ngày cuối, reldate từ đồng hồ app', () => {
    expect(compileGridQuery('RL', 'created:2026-10-01', ctxOf('W', 'Asia/Ho_Chi_Minh')).params).toEqual([
      'W',
      '2026-09-30T17:00:00.000Z',
      '2026-10-01T17:00:00.000Z',
      101,
    ]);
    const ny = ctxOf('W', 'America/New_York');
    expect(compileGridQuery('RL', 'created:2026-03-08', ny).params.slice(1, 3)).toEqual([
      '2026-03-08T05:00:00.000Z',
      '2026-03-09T04:00:00.000Z',
    ]);
    expect(compileGridQuery('RL', 'created:2026-11-01', ny).params.slice(1, 3)).toEqual([
      '2026-11-01T04:00:00.000Z',
      '2026-11-02T05:00:00.000Z',
    ]);
    expect(compileGridQuery('RL', 'created:2026-10-01..2026-10-15', C).params.slice(1, 3)).toEqual([
      '2026-10-01T00:00:00.000Z',
      '2026-10-16T00:00:00.000Z',
    ]);
    expect(compileGridQuery('RL', 'created>=-12h', C).params[1]).toBe('2026-10-16T20:00:00.000Z');
    expect(compileGridQuery('RL', 'created<-2w', C).params[1]).toBe('2026-10-03T08:00:00.000Z');
    // > ngày = từ ngày kế; > thời điểm = sau thời điểm
    expect(compileGridQuery('RL', 'created>2026-10-01', C).params[1]).toBe('2026-10-02T00:00:00.000Z');
    expect(compileGridQuery('RL', 'created>-7d', C).params[1]).toBe('2026-10-10T08:00:00.001Z');
    expect(compileGridQuery('RL', 'created<=2026-10-01', C).sql).toContain('t.created_at < ?');
    expect(compileGridQuery('RL', 'created<=2026-10-01', C).params[1]).toBe('2026-10-02T00:00:00.000Z');
  });

  it('id: mã trần / id:N / id:MÃ khớp display_seq (+ id_aliases); prefix sai lưới ⇒ wrong_prefix', () => {
    const q = compileGridQuery('TK', 'TK-0046', C);
    expect(q.sql).toContain('t.display_seq = ? OR t.id IN (SELECT a.entity_id FROM id_aliases a');
    expect(q.params).toEqual(['W', 46, 'W', 'TK-0046', 101]);
    expect(compileGridQuery('TK', 'id:TK-0046', C).params).toEqual(['W', 46, 101]);
    expect(compileGridQuery('TK', 'id:46', C).params).toEqual(['W', 46, 101]);
    expect(compileGridQuery('AU', 'id>AU-00010', C).params).toEqual(['W', 10, 101]);
    expect(() => compileGridQuery('RL', 'TK-0001', C)).toThrow(qerr('wrong_prefix'));
    expect(() => compileGridQuery('RL', 'id:TK-0001', C)).toThrow(qerr('wrong_prefix'));
  });

  it('lỗi kiểu / toán tử / trường / lưới ⇒ QueryBoxError, không bao giờ trả SQL nửa vời', () => {
    const bad: [string, string, string][] = [
      ['RL', 'nope:1', 'unknown_field'],
      ['RL', 'status:nope', 'bad_value'],
      ['RL', 'status>active', 'bad_operator'],
      ['IN', 'tokens:abc', 'bad_value'],
      ['IN', 'tokens:1e400', 'bad_value'],
      ['IN', 'prompt:maybe', 'unknown_field'],
      ['IN', 'on:maybe', 'bad_value'],
      ['RL', 'created:2026-02-30', 'bad_value'],
      ['RL', 'created:yesterday', 'bad_value'],
      ['RL', 'created>2026-10-01..2026-10-02', 'bad_operator'],
      ['LG', 'task:RL-0001', 'bad_value'],
      ['LG', 'mai', 'unknown_field'],
      ['RL', 'tokens>-7d', 'unknown_field'],
      ['SK', 'engine:abc*', 'bad_value'],
    ];
    for (const [grid, input, code] of bad) {
      expect(() => compileGridQuery(grid, input, C), `${grid} ${input}`).toThrow(qerr(code));
    }
    expect(() => compileGridQuery('RL', 'created:2026-10-01', ctxOf('W', 'Mars/Olympus'))).toThrow(qerr('bad_value'));
    for (const g of ['users', 'secrets', '__proto__', 'constructor', 'toString', 'rl']) {
      expect(() => compileGridQuery(g, '', C), g).toThrow(qerr('unknown_field'));
    }
  });

  it('trang: trần 500, sort chỉ trường sortable, con trỏ hỏng / thiếu giá trị ⇒ bad_value', () => {
    expect(compileGridQuery('RL', '', C, { limit: 10_000 })).toMatchObject({ limit: PAGE_MAX });
    expect(compileGridQuery('RL', '', C, { limit: 10_000 }).params.at(-1)).toBe(PAGE_MAX + 1);
    expect(compileGridQuery('RL', '', C, { limit: 0 }).limit).toBe(1);
    expect(() => compileGridQuery('RL', '', C, { sort: 'status' })).toThrow(qerr('unknown_field'));
    expect(() => compileGridQuery('RL', '', C, { sort: 'nope' })).toThrow(qerr('unknown_field'));
    expect(() => compileGridQuery('RL', '', C, { sort: 'created', after: { seq: 3 } })).toThrow(qerr('bad_value'));
    expect(() => compileGridQuery('RL', '', C, { after: { seq: 1.5 } })).toThrow(qerr('bad_value'));
    const q = compileGridQuery('CM', '', C, { sort: 'due', order: 'desc', after: { seq: 3, value: '2026-10-01' } });
    expect(q.sql).toContain('(t.due_at, t.display_seq) < (?, ?) ORDER BY t.due_at DESC, t.display_seq DESC LIMIT ?');
    expect(q.sortKey).toBe('due_at');
  });

  it('chống tiêm: SQL chỉ phụ thuộc CẤU TRÚC truy vấn — giá trị lạ chỉ nằm trong tham số; nháy lồng ⇒ lỗi (fail-closed)', () => {
    const payloads = [
      "x'; DROP TABLE roles; --",
      ') OR 1=1 --',
      'x%_\\',
      'NEAR(a b)',
      'title_norm:x',
      'a OR b',
      '*',
      '\u0000',
      'Robert`); DELETE FROM tasks;',
    ];
    const baseText = compileGridQuery('RL', 'name:x', C).sql;
    const baseFts = compileGridQuery('RL', '"x y"', C).sql;
    const baseAu = compileGridQuery('AU', 'action:x', C).sql;
    for (const p of payloads) {
      const quoted = `"${p}"`;
      expect(compileGridQuery('RL', `name:${quoted}`, C).sql, p).toBe(baseText);
      expect(compileGridQuery('AU', `action:${quoted}`, C).sql, p).toBe(baseAu);
      const fts: CompiledQuery = compileGridQuery('RL', quoted, C);
      // chỉ toàn ký tự phân cách ⇒ không có từ nào ⇒ không có điều kiện FTS
      expect(fts.sql === baseFts || fts.sql === compileGridQuery('RL', '', C).sql, p).toBe(true);
      // biểu thức MATCH chỉ gồm từ đã trích dẫn — không toán tử FTS nào lọt qua
      for (const v of fts.params.filter((x) => typeof x === 'string' && x.startsWith('"'))) {
        expect(v as string, p).toMatch(/^"[\p{L}\p{N} ]+"\*?$/u);
      }
    }
    expect(() => compileGridQuery('RL', 'name:"a"b"', C)).toThrow(expect.objectContaining({ name: 'QueryBoxError' }));
    expect(() => compileGridQuery('RL', '"a"b"', C)).toThrow(expect.objectContaining({ name: 'QueryBoxError' }));
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Chạy thật trên fixture

let f: Fixture;
let other: TenantHandle;
const roles: Record<string, RoleRow> = {};
const tasks: Record<string, TaskRow> = {};
let otherRole: RoleRow;

beforeAll(() => {
  f = createFixture();
  const mk = (name: string) => {
    f.clock.advance(60_000);
    return f.store.write(f.ownerActorId, (tx) => tx.roles.create({ name, color: 'jade' }));
  };
  roles.mai = mk('Mai');
  roles.bao = mk('Bảo Đặng');
  roles.linh = mk('Linh');
  const task = (key: string, title: string, assigneeRoleId: string | null) => {
    f.clock.advance(60_000);
    tasks[key] = f.store.write(f.ownerActorId, (tx) => tx.tasks.create({ title, source: 'web', assigneeRoleId }));
  };
  task('quote', 'Gửi báo giá cho Hoàng Phát', roles.mai.id);
  task('stock', 'Kiểm kho cuối tuần', roles.bao.id);
  task('meet', 'Đặt lịch họp quý', null);
  task('gone', 'Báo giá đã huỷ', roles.mai.id);
  f.store.write(f.ownerActorId, (tx) => tx.tasks.softDelete((tasks.gone as TaskRow).id));
  other = addTenant(f, { slug: 'khac', shortCode: '9X3M', username: 'khac', roles: 0 });
  otherRole = f.store.write(other.ownerActorId, (tx) => tx.roles.create({ name: 'Mai', color: 'jade' }));
  f.store.write(other.ownerActorId, (tx) =>
    tx.tasks.create({ title: 'Gửi báo giá Hoàng Phát', source: 'web', assigneeRoleId: otherRole.id }),
  );
});
afterAll(() => f?.close());

const run = (grid: string, input: string, page: GridPage = {}, ws = f.workspaceId) =>
  runGridQuery(f.reader, grid, input, ctxOf(ws, 'Asia/Ho_Chi_Minh'), page);
const titles = (grid: string, input: string) => run(grid, input).items.map((r) => r.title ?? r.name);

describe('chạy trên DB thật', () => {
  it('lọc trường + role theo tên (không dấu) / RL-xxxx; hàng xoá mềm ẩn; text tự do qua FTS', () => {
    expect(titles('TK', 'role:Mai')).toEqual(['Gửi báo giá cho Hoàng Phát']);
    expect(titles('TK', 'vai:"bao dang"')).toEqual(['Kiểm kho cuối tuần']);
    expect(titles('TK', `role:${roles.bao?.display_id}`)).toEqual(['Kiểm kho cuối tuần']);
    expect(titles('TK', '-role:Mai')).toEqual(['Kiểm kho cuối tuần', 'Đặt lịch họp quý']);
    expect(titles('TK', 'bao gia')).toEqual(['Gửi báo giá cho Hoàng Phát']);
    expect(titles('TK', '"hoang phat"')).toEqual(['Gửi báo giá cho Hoàng Phát']);
    expect(titles('TK', '"phat hoang"')).toEqual([]);
    expect(titles('TK', '-bao')).toEqual(['Kiểm kho cuối tuần', 'Đặt lịch họp quý']);
    expect(titles('RL', 'đặng')).toEqual(['Bảo Đặng']);
    expect(titles('RL', 'name:bao*')).toEqual(['Bảo Đặng']);
    expect(titles('TK', 'status:todo created:2026-10-17')).toHaveLength(3);
  });

  it('cô lập tenant: cùng truy vấn ở tenant khác chỉ thấy hàng của tenant đó (RL-0001 / tên / FTS tra trong workspace)', () => {
    const a = run('TK', 'role:Mai bao gia');
    const b = run('TK', 'role:Mai bao gia', {}, other.workspaceId);
    expect(a.items.map((r) => r.workspace_id)).toEqual([f.workspaceId]);
    expect(b.items.map((r) => r.title)).toEqual(['Gửi báo giá Hoàng Phát']);
    expect(b.items.every((r) => r.workspace_id === other.workspaceId)).toBe(true);
    expect(run('RL', '', {}, other.workspaceId).items.map((r) => r.id)).toEqual([otherRole.id]);
    expect(run('TK', `role:${otherRole.display_id}`).items.every((r) => r.workspace_id === f.workspaceId)).toBe(true);
  });

  it('id: mã hiện hành + mã cũ qua id_aliases (trong workspace) ', () => {
    const quote = tasks.quote as TaskRow;
    expect(titles('TK', quote.display_id)).toEqual([quote.title]);
    expect(titles('TK', `-${quote.display_id} -${(tasks.meet as TaskRow).display_id}`)).toEqual([tasks.stock?.title]);
    f.writer.write(f.systemActorId, (w) =>
      dml(w).write(
        'INSERT INTO id_aliases (id, workspace_id, created_by, entity_type, entity_id, old_display_id, source_code, new_display_id) ' +
          'VALUES (?, ?, app_actor(), ?, ?, ?, ?, ?)',
        [newUlid(f.clock), f.workspaceId, 'TK', quote.id, 'TK-0946', 'imp1', quote.display_id],
      ),
    );
    expect(titles('TK', 'TK-0946')).toEqual([quote.title]);
    // mã cũ của tenant A không mở được hàng khi truy vấn ở tenant B
    expect(run('TK', 'TK-0946', {}, other.workspaceId).items).toEqual([]);
  });

  it('keyset: đi hết các trang không trùng / không sót, cả asc / desc / sort theo created', () => {
    const all = run('RL', '', { limit: PAGE_MAX }).items.map((r) => r.id);
    expect(all).toHaveLength(3);
    for (const page of [
      { order: 'asc' as const },
      { order: 'desc' as const },
      { sort: 'created', order: 'desc' as const },
      { sort: 'tao', order: 'asc' as const },
    ]) {
      const seen: unknown[] = [];
      let after: ReturnType<typeof run>['nextAfter'] = null;
      for (let i = 0; i < 10; i++) {
        const r = run('RL', '', { ...page, limit: 1, ...(after ? { after } : {}) });
        seen.push(...r.items.map((x) => x.id));
        after = r.nextAfter;
        if (after === null) break;
      }
      const expected = page.order === 'desc' ? [...all].reverse() : all;
      expect(seen, JSON.stringify(page)).toEqual(expected);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Meta: whitelist hợp lệ + mọi trường chạy được và có index (EXPLAIN QUERY PLAN)

function samples(grid: GridDef, field: FieldDef): string[] {
  const n = field.names[0] as string;
  const ev = field.enumValues ?? [];
  switch (field.type) {
    case 'enum':
      return [`${n}:${ev[0]}`, `-${n}:${ev[0]},${ev[ev.length - 1]}`];
    case 'text':
      return field.eqSql === undefined ? [`${n}:x`, `${n}:x*`, `${n}!=x`] : [`${n}:x`, `${n}!=x`];
    case 'seq':
      return [`${n}:1`, `${n}>1`, `${n}:${grid.prefix}-0001`, `${n}:1..9`];
    case 'number':
    case 'money':
      return [`${n}>1`, `${n}:1..9`, `${n}!=1`];
    case 'ts':
      return [`${n}>-7d`, `${n}:2026-10-01`, `${n}:2026-10-01..2026-10-15`, `${n}!=2026-10-01`];
    case 'bool':
      return [`${n}:1`, `${n}:khong`];
    case 'role':
      return [`${n}:RL-0001`, `${n}:mai`, `-${n}:mai`];
    case 'ref':
      return [`${n}:${prefixOfTable(field.refTable as string)}-0001`];
  }
}

const tableInfo = (table: string) =>
  f.reader.db.prepare(`SELECT name, "notnull" AS nn FROM pragma_table_info(?)`).all(table) as {
    name: string;
    nn: number;
  }[];

describe('whitelist §8.2 (meta)', () => {
  it('lưới khớp sổ prefix + bảng có cột tenant / display_seq / deleted_at đúng khai báo', () => {
    for (const [key, g] of Object.entries(GRIDS)) {
      expect(g.prefix, key).toBe(key);
      expect(ENTITY_TYPES[g.prefix], key).toBe(g.table);
      const cols = new Set(tableInfo(g.table).map((c) => c.name));
      expect(cols.has('workspace_id') && cols.has('display_seq'), key).toBe(true);
      expect(cols.has('deleted_at'), `${key}.softDelete`).toBe(g.softDelete);
    }
  });

  it('tên trường duy nhất / đúng ký tự parser; alias enum trỏ vào giá trị hợp lệ; ref có prefix; sortable là cột NOT NULL', () => {
    for (const [key, g] of Object.entries(GRIDS)) {
      const names = g.fields.flatMap((x) => x.names);
      expect(new Set(names).size, key).toBe(names.length);
      for (const fd of g.fields) {
        for (const n of fd.names) expect(n, key).toMatch(/^[a-z][a-z0-9_-]*$/);
        if (fd.type === 'enum') {
          expect((fd.enumValues ?? []).length, `${key}.${fd.names[0]}`).toBeGreaterThan(0);
          for (const [alias, v] of Object.entries(fd.valueAliases ?? {})) {
            expect(fd.enumValues?.map(String), `${key}.${fd.names[0]}:${alias}`).toContain(v);
            expect(fd.enumValues?.map(String), `alias ${alias} trùng giá trị thật`).not.toContain(alias);
          }
        }
        if (fd.type === 'ref') expect(prefixOfTable(fd.refTable ?? ''), `${key}.${fd.names[0]}`).not.toBeNull();
        if (fd.sortable) {
          const col = /^t\.([a-z_]+)$/.exec(fd.sql)?.[1];
          expect(col, `${key}.${fd.names[0]} sortable`).toBeDefined();
          expect(tableInfo(g.table).find((c) => c.name === col)?.nn, `${key}.${col} NOT NULL`).toBe(1);
        }
      }
    }
  });

  it('MỌI trường của MỌI lưới: chạy được trên DB thật và không quét bảng (EXPLAIN QUERY PLAN không có SCAN)', () => {
    let checked = 0;
    for (const [key, g] of Object.entries(GRIDS)) {
      const inputs = g.fields.flatMap((fd) => samples(g, fd));
      if (g.textEntity !== null) inputs.push('mai', '-mai', '"bao gia"');
      inputs.push('');
      for (const input of inputs) {
        const ctx = ctxOf(f.workspaceId, 'Asia/Ho_Chi_Minh');
        const pages: GridPage[] = [{}, { order: 'desc', after: { seq: 2 } }];
        for (const s of g.fields.filter((x) => x.sortable)) {
          pages.push({ sort: s.names[0] as string, after: { seq: 2, value: s.type === 'ts' ? '2026-10-01' : 1 } });
        }
        for (const page of pages) {
          const q = compileGridQuery(key, input, ctx, page);
          expect(() => f.reader.db.prepare(q.sql).all(...q.params), `${key} ${input}`).not.toThrow();
          const plan = (
            f.reader.db.prepare(`EXPLAIN QUERY PLAN ${q.sql}`).all(...q.params) as { detail: string }[]
          ).map((p) => p.detail);
          const scans = plan.filter((d) => /^SCAN /.test(d) && !/^SCAN search_fts VIRTUAL TABLE/.test(d));
          expect(scans, `${key} «${input}» ${JSON.stringify(page)}\n${plan.join('\n')}`).toEqual([]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(300);
  });
});
