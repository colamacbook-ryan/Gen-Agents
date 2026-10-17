// Tìm kiếm toàn văn (DATABASE §8.5): repo ghi search_documents trong CÙNG giao dịch; chuẩn hoá tiếng Việt (bỏ dấu, đ → d);
// chuỗi người dùng không bao giờ thành cú pháp FTS; bm25 tiêu đề ×5; lọc; cô lập tenant.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '../../src/ids/index.ts';
import { addTenant, createFixture, type Fixture, type TenantHandle } from '../../src/repos/fixture/index.ts';
import {
  ftsQuery,
  markSearchDocumentDead,
  SEARCH_BODY_MAX,
  SEARCH_QUERY_MAX_CHARS,
  SEARCH_QUERY_MAX_TERMS,
  type SearchDocInput,
  type SearchHit,
  searchDocuments,
  upsertSearchDocument,
} from '../../src/search/index.ts';

let f: Fixture;
let other: TenantHandle;
beforeAll(() => {
  f = createFixture();
  other = addTenant(f, { slug: 'khac', shortCode: '9X3M', username: 'khac', roles: 0 });
});
afterAll(() => f?.close());

const put = (d: SearchDocInput, ws = f.workspaceId, actor = f.ownerActorId) =>
  f.writer.write(actor, (w) => upsertSearchDocument(w, ws, d));
const find = (text: string, opts = {}, ws = f.workspaceId) => searchDocuments(f.reader, ws, text, opts);
const ids = (hits: SearchHit[]) => hits.map((h) => h.entityId);
const rowsOf = (entityId: string) =>
  f.reader.db.prepare('SELECT * FROM search_documents WHERE entity_id = ?').all(entityId) as Record<string, unknown>[];

describe('đồng bộ từ repo (cùng giao dịch)', () => {
  it('Role: tạo / đổi tên / xoá mềm; tìm không dấu, đ → d, tiền tố gõ dở, chữ hoa', () => {
    const role = f.store.write(f.ownerActorId, (tx) => tx.roles.create({ name: 'Đặng Thị Hồng', color: 'jade' }));
    for (const q of ['dang', 'Đặng', 'ĐẶNG', 'hồng', 'hon', 'thi hong']) {
      expect(ids(find(q, { entityTypes: ['RL'] })), q).toEqual([role.id]);
    }
    expect(find('dang')[0]).toMatchObject({ entityType: 'RL', displayId: role.display_id, title: 'Đặng Thị Hồng' });
    f.store.write(f.ownerActorId, (tx) => tx.roles.update(role.id, { name: 'Trần Văn Nam' }));
    expect(find('dang', { entityTypes: ['RL'] })).toEqual([]);
    expect(ids(find('tran nam'))).toEqual([role.id]);
    expect(rowsOf(role.id)).toHaveLength(1);
    f.store.write(f.ownerActorId, (tx) => tx.roles.softDelete(role.id));
    expect(find('tran nam')).toEqual([]);
    expect(ids(find('tran nam', { includeDead: true }))).toEqual([role.id]);
  });

  it('giao dịch lỗi ⇒ không còn tài liệu mồ côi (ghi index cùng giao dịch với hàng gốc)', () => {
    expect(() =>
      f.store.write(f.ownerActorId, (tx) => {
        tx.roles.create({ name: 'Quang Huy', color: 'jade' });
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(find('quang huy', { includeDead: true })).toEqual([]);
  });

  it('Task: tạo / chuyển trạng thái (status trong index theo kịp) / xoá mềm', () => {
    const t = f.store.write(f.ownerActorId, (tx) => tx.tasks.create({ title: 'Gọi điện cho Phúc', source: 'web' }));
    expect(ids(find('phuc', { entityTypes: ['TK'] }))).toEqual([t.id]);
    f.store.write(f.ownerActorId, (tx) => tx.tasks.transition(t.id, 'cancelled'));
    expect(rowsOf(t.id)[0]?.status).toBe('cancelled');
    f.store.write(f.ownerActorId, (tx) => tx.tasks.softDelete(t.id));
    expect(find('phuc')).toEqual([]);
  });
});

describe('ftsQuery: chuỗi người dùng không bao giờ thành cú pháp FTS', () => {
  it('mỗi từ được trích dẫn + tiền tố; toán tử / cột / ngoặc / nháy chỉ là ký tự phân cách', () => {
    expect(ftsQuery('Mai bảo')).toBe('"mai"* "bao"*');
    expect(ftsQuery('NEAR(a b) OR title_norm:x "y" * ^z -w AND')).toBe(
      '"near"* "a"* "b"* "or"* "title"* "norm"* "x"* "y"* "z"* "w"* "and"*',
    );
    expect(ftsQuery('')).toBeNull();
    expect(ftsQuery('!!! "" ()* ^')).toBeNull();
    expect(() => ftsQuery('a'.repeat(SEARCH_QUERY_MAX_CHARS + 1))).toThrow(RangeError);
    const many = Array.from({ length: SEARCH_QUERY_MAX_TERMS + 5 }, (_, i) => `t${i}`).join(' ');
    expect(ftsQuery(many)?.split(' ')).toHaveLength(SEARCH_QUERY_MAX_TERMS);
  });

  it('chuỗi thù địch chạy thật trên FTS5 không lỗi cú pháp và không khớp sai', () => {
    put({ entityType: 'KN', entityId: newUlid(f.clock), title: 'tài liệu an toàn', body: 'nội dung' });
    for (const q of [
      'NEAR(tai lieu)',
      'title_norm:tai',
      '"tai',
      'tai OR 1',
      '{title_norm body_norm}: x',
      '^tai',
      'tai*)',
      "'; DROP TABLE search_fts; --",
      '\u0000tai',
    ]) {
      expect(() => find(q), q).not.toThrow();
    }
    // "tai OR 1" là 3 từ AND (không phải OR) ⇒ không khớp tài liệu thiếu từ "or" / "1"
    expect(find('tai OR 1')).toEqual([]);
    expect(find('tai lieu').length).toBeGreaterThan(0);
  });
});

describe('xếp hạng + lọc', () => {
  it('bm25: khớp tiêu đề xếp trên khớp thân (tiêu đề ×5)', () => {
    const inTitle = newUlid(f.clock);
    const inBody = newUlid(f.clock);
    put({ entityType: 'MM', entityId: inBody, title: 'ghi chú', body: 'quả kiwi xanh ở chợ' });
    put({ entityType: 'MM', entityId: inTitle, title: 'kiwi', body: 'ghi chú về chợ' });
    expect(ids(find('kiwi'))).toEqual([inTitle, inBody]);
  });

  it('entityTypes / roleId / chunk / limit; cập nhật giữ một hàng; body dài bị cắt ở trần', () => {
    const kn = newUlid(f.clock);
    const role = newUlid(f.clock);
    put({ entityType: 'KN', entityId: kn, roleId: role, title: 'cẩm nang xoài', body: null });
    put({ entityType: 'KN', entityId: kn, chunkId: 'c1', roleId: role, title: null, body: 'đoạn xoài một' });
    expect(ids(find('xoai'))).toEqual([kn]);
    expect(find('xoai', { includeChunks: true })).toHaveLength(2);
    expect(find('xoai', { entityTypes: [] })).toEqual([]);
    expect(find('xoai', { entityTypes: ['MM'] })).toEqual([]);
    expect(ids(find('xoai', { roleId: role }))).toEqual([kn]);
    expect(find('xoai', { roleId: newUlid(f.clock) })).toEqual([]);
    expect(find('xoai', { includeChunks: true, limit: 0 })).toHaveLength(1);
    put({ entityType: 'KN', entityId: kn, roleId: role, title: 'cẩm nang ổi', body: null });
    expect(find('xoai')).toEqual([]);
    expect(rowsOf(kn)).toHaveLength(2); // gốc + chunk, không nhân bản
    const long = newUlid(f.clock);
    put({ entityType: 'KN', entityId: long, title: 'dài', body: `${'a '.repeat(SEARCH_BODY_MAX / 2)}duaoi` });
    expect(String(rowsOf(long)[0]?.body_norm ?? '').length).toBe(SEARCH_BODY_MAX);
    expect(find('duaoi')).toEqual([]);
  });
});

describe('cô lập tenant', () => {
  it('tìm chỉ trong workspace; đánh dấu chết / ghi đè theo workspace khác không chạm tài liệu của tenant kia', () => {
    const b = newUlid(f.clock);
    put({ entityType: 'MM', entityId: b, title: 'ngựa vằn' }, other.workspaceId, other.ownerActorId);
    expect(find('ngua van')).toEqual([]);
    expect(ids(find('ngua van', {}, other.workspaceId))).toEqual([b]);
    f.writer.write(f.ownerActorId, (w) => markSearchDocumentDead(w, f.workspaceId, 'MM', b));
    expect(ids(find('ngua van', {}, other.workspaceId))).toEqual([b]);
    // upsert cùng entity_id từ workspace A KHÔNG "chuyển" tài liệu của B sang A — fail-closed (UNIQUE)
    expect(() => put({ entityType: 'MM', entityId: b, title: 'chiếm' })).toThrow();
    expect(rowsOf(b)).toEqual([expect.objectContaining({ workspace_id: other.workspaceId, title: 'ngựa vằn' })]);
  });
});
