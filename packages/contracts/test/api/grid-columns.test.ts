import { describe, expect, it } from 'vitest';
import {
  ColumnName,
  GRID_COLUMNS,
  GRID_KEYS,
  GRID_PREFIX,
  GRID_SELF_SCOPED,
  GRID_WRITE_ROUTES,
  gridOfPrefix,
  gridSelectionIssues,
  queryFieldNames,
  requestSchemaOf,
  routeById,
} from '../../src/index.ts';

// Review bảo mật PR #7 (M8): whitelist cột theo lưới; cols / sort / group / q của OPS-33 / 34 / 35 bị kiểm ở biên hợp đồng.

const SENSITIVE = /hash|secret|cipher|token|password|dek|nonce|salt/i;
// Ngoại lệ HẸP: cột ĐẾM token (số nguyên) — KHÔNG phải token xác thực. Mỗi tên một lý do; thêm tên khác là quyết định bảo mật.
const TOKEN_COUNT_EXCEPTIONS: Record<string, string> = {
  tokens: 'số token của prompt / mục DNA / skill / công cụ (đo ngân sách), kiểu int',
  tokens_in: 'số token vào của phiên, kiểu int',
  tokens_out: 'số token ra của phiên, kiểu int',
};

describe('GRID_COLUMNS', () => {
  it('đủ 37 lưới, khoá = GRID_KEYS; mỗi lưới có cột id (sort được) và created', () => {
    expect(GRID_KEYS.length).toBe(37);
    expect(Object.keys(GRID_COLUMNS).sort()).toEqual([...GRID_KEYS].sort());
    for (const k of GRID_KEYS) {
      const cols = GRID_COLUMNS[k];
      expect(
        cols.find((c) => c.name === 'id'),
        k,
      ).toMatchObject({ type: 'int', sortable: true, queryable: true });
      expect(
        cols.find((c) => c.name === 'created'),
        k,
      ).toMatchObject({ type: 'ts', sortable: true });
      for (const c of cols) expect(ColumnName.safeParse(c.name).success, `${k}.${c.name}`).toBe(true);
    }
  });

  it('không cột / alias nào khớp mẫu nhạy cảm, trừ ngoại lệ HẸP (cột đếm token kiểu int, có lý do)', () => {
    const used = new Set<string>();
    for (const k of GRID_KEYS)
      for (const c of GRID_COLUMNS[k])
        for (const n of [c.name, ...c.aliases]) {
          if (!SENSITIVE.test(n)) continue;
          expect(Object.keys(TOKEN_COUNT_EXCEPTIONS), `${k}.${n} nhạy cảm, không có ngoại lệ`).toContain(n);
          expect(c.type, `${k}.${n}`).toBe('int');
          used.add(n);
        }
    // ngoại lệ không dùng là ngoại lệ thừa — gỡ đi.
    expect([...used].sort()).toEqual(Object.keys(TOKEN_COUNT_EXCEPTIONS).sort());
  });

  it('mọi khoá sửa ô của GRID_WRITE_ROUTES là cột CÓ THẬT của lưới đó', () => {
    for (const k of GRID_KEYS)
      for (const col of Object.keys(GRID_WRITE_ROUTES[k].edit))
        expect(
          GRID_COLUMNS[k].map((c) => c.name),
          `${k}: khoá sửa ô ${col}`,
        ).toContain(col);
  });

  it('GRID_SELF_SCOPED trỏ vào lưới có thật; notifications là lưới của riêng từng người', () => {
    expect(GRID_SELF_SCOPED).toEqual(['notifications']);
    for (const g of GRID_SELF_SCOPED) expect(GRID_KEYS).toContain(g);
  });

  it('gridOfPrefix: tra ngược prefix → lưới; prefix không có lưới ⇒ undefined', () => {
    for (const k of GRID_KEYS) expect(gridOfPrefix(GRID_PREFIX[k])).toBe(k);
    expect(gridOfPrefix('AN')).toBeUndefined();
  });
});

describe('queryFieldNames', () => {
  it('lấy tên trường; bỏ từ trần, cụm trong ngoặc kép, mã hiển thị; hiểu phủ định và toán tử', () => {
    expect(queryFieldNames('role:Mai status:active tokens>200')).toEqual(['role', 'status', 'tokens']);
    expect(queryFieldNames('-status:active created>=2026-10-01')).toEqual(['status', 'created']);
    expect(queryFieldNames('MM-0041 hello "password_hash:x y" world')).toEqual([]);
    expect(queryFieldNames('Status:Done')).toEqual(['status']);
    expect(queryFieldNames('a!=b')).toEqual(['a']);
  });
});

describe('OPS-33 / 34 / 35: cols, sort, group, q kiểm theo whitelist của lưới', () => {
  const parse = (id: string, value: unknown) => requestSchemaOf(routeById(id) as never).safeParse(value);
  const q33 = (query: Record<string, unknown>, gridKey = 'roles') => parse('OPS-33', { params: { gridKey }, query });

  it('ca dương: cột thuộc whitelist, alias vi, phủ định, cụm trong ngoặc kép', () => {
    expect(q33({}).success).toBe(true);
    expect(q33({ cols: 'name,status,color', sort: '-created,id', group: 'status' }).success).toBe(true);
    expect(q33({ q: 'trang-thai:hoat-dong -color:red "mật khẩu:x"' }).success).toBe(true);
    expect(q33({ cols: 'tokens,value', sort: '-created' }, 'dna').success).toBe(true);
  });

  it('ca âm: cột nhạy cảm / lạ ở cols, sort, group, q bị từ chối (OPS-33 và OPS-34 như nhau)', () => {
    for (const id of ['OPS-33', 'OPS-34']) {
      const t = (query: Record<string, unknown>, gridKey = 'roles') => parse(id, { params: { gridKey }, query });
      expect(t({ cols: 'name,password_hash' }).success, id).toBe(false);
      expect(t({ cols: 'secret_id' }, 'engine_accounts').success, id).toBe(false);
      expect(t({ sort: 'password_hash' }).success, id).toBe(false);
      expect(t({ sort: '-name' }).success, `${id}: name không sort được`).toBe(false);
      expect(t({ q: 'password_hash:abc' }).success, id).toBe(false);
      expect(t({ q: 'status:active -secret:x' }).success, id).toBe(false);
      expect(t({ cols: 'status' }, 'tools').success, id).toBe(true);
      expect(t({ cols: 'engine' }, 'roles').success, `${id}: cột của lưới khác`).toBe(false);
    }
    expect(q33({ group: 'name_norm' }).success).toBe(false);
    expect(q33({ group: 'content' }, 'memories').success, 'content chỉ hiển thị, không nhóm').toBe(false);
    expect(q33({ q: 'content:abc' }, 'memories').success, 'content chỉ hiển thị, không tra cứu').toBe(false);
  });

  it('gridSelectionIssues: mỗi vi phạm nói rõ phần nào', () => {
    const issues = gridSelectionIssues('roles', { cols: ['x'], sort: ['-y'], group: 'z', q: 'w:1' });
    expect(issues.length).toBe(4);
    expect(issues.map((s) => s.split(':')[0]).sort()).toEqual(['cols', 'group', 'q', 'sort']);
  });

  it('OPS-35: mã hiển thị → whitelist của lưới theo prefix; prefix không có lưới không được chọn cột; ULID để handler kiểm', () => {
    const t = (recordRef: string, cols?: string) =>
      parse('OPS-35', { params: { recordRef }, query: cols ? { cols } : {} });
    expect(t('MM-0041').success).toBe(true);
    expect(t('MM-0041', 'content,status').success).toBe(true);
    expect(t('MM-0041', 'password_hash').success).toBe(false);
    expect(t('MM-0041', 'engine').success).toBe(false);
    expect(t('AN-0001', 'status').success, 'AN không có lưới').toBe(false);
    expect(t('AN-0001').success).toBe(true);
    expect(t('01JABCDEFGHJKMNPQRSTVWXYZ0', 'status').success, 'ULID: handler kiểm sau khi tra prefix thật').toBe(true);
  });
});
