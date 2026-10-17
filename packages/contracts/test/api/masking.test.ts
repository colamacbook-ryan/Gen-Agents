import { describe, expect, it } from 'vitest';
import { collectNodes } from '../../src/api/introspect.ts';
import { responseSchemaOf } from '../../src/api/routes.ts';
import { ROUTES, routeById, V_MASKED_FIELDS } from '../../src/index.ts';

// Review bảo mật PR #7 (M6, HANDLER-OBLIGATIONS #5): bảng "che cho viewer" khớp schema thật, không route nào mang cờ `redacted` mà không khai.

// Đúng danh sách của HANDLER-OBLIGATIONS #5 — thêm / bớt route ở đây là quyết định bảo mật, phải đổi cả tài liệu đó.
const OBLIGATION_5 = [
  'SYS-23',
  'SYS-37',
  'SYS-54',
  'WRK-34',
  'WRK-35',
  'OPS-21',
  'OPS-33',
  'OPS-34',
  'OPS-35',
  'OPS-36',
];

const pathsOf = (id: string): string[] => {
  const schema = responseSchemaOf(routeById(id) as never);
  return schema ? collectNodes(schema, '').map((n) => n.path) : [];
};

describe('V_MASKED_FIELDS', () => {
  it('đúng bằng danh sách route của nghĩa vụ #5', () => {
    expect(Object.keys(V_MASKED_FIELDS).sort()).toEqual([...OBLIGATION_5].sort());
  });

  it('route có thật, quyền đọc V (che chỉ có nghĩa với viewer), mỗi trường và cờ trỏ tới node CÓ THẬT của response', () => {
    for (const [id, spec] of Object.entries(V_MASKED_FIELDS)) {
      const route = routeById(id);
      expect(route, id).toBeDefined();
      expect(route?.auth, `${id}: route che cho viewer phải đọc được bởi viewer`).toBe('V');
      expect(route?.method, id).toBe('GET');
      const paths = pathsOf(id);
      for (const f of spec.fields) expect(paths, `${id}: trường che ${f} không có trong response`).toContain(f);
      for (const f of spec.flags) expect(paths, `${id}: cờ ${f} không có trong response`).toContain(f);
      expect(spec.note.length, `${id}: thiếu quy tắc cho handler`).toBeGreaterThan(20);
    }
  });

  it('cờ `redacted` là boolean bắt buộc (không optional / nullable) ở mọi nơi nó xuất hiện', () => {
    let seen = 0;
    for (const [id, spec] of Object.entries(V_MASKED_FIELDS)) {
      const schema = responseSchemaOf(routeById(id) as never);
      if (!schema) continue;
      const nodes = collectNodes(schema, '');
      for (const flag of spec.flags) {
        const node = nodes.find((n) => n.path === flag);
        expect(node?.type, `${id}${flag}`).toBe('boolean');
        seen++;
      }
    }
    expect(seen).toBe(10);
  });

  it('trường che / cờ chỉ rỗng ở OPS-34 (CSV, không có schema JSON); route khác phải khai ít nhất một trường VÀ một cờ', () => {
    for (const [id, spec] of Object.entries(V_MASKED_FIELDS)) {
      const route = routeById(id);
      if (route?.response.kind === 'csv') {
        expect(id).toBe('OPS-34');
        continue;
      }
      expect(spec.fields.length, id).toBeGreaterThan(0);
      expect(spec.flags.length, id).toBeGreaterThan(0);
    }
  });

  it('không có route V nào mang cờ `redacted` mà thiếu trong bảng (cờ mồ côi = che không ai kiểm)', () => {
    for (const r of ROUTES) {
      if (r.auth !== 'V' || r.response.kind !== 'json') continue;
      const hasFlag = pathsOf(r.id).some((p) => p.endsWith('.redacted'));
      if (hasFlag)
        expect(Object.keys(V_MASKED_FIELDS), `${r.id} có cờ redacted nhưng không khai trong V_MASKED_FIELDS`).toContain(
          r.id,
        );
    }
  });

  it('OPS-21: viewer chỉ có changedKeys — before / after nằm trong danh sách che, changedKeys thì không', () => {
    expect(V_MASKED_FIELDS['OPS-21'].fields).toEqual(['.before', '.after']);
    expect(pathsOf('OPS-21')).toContain('.changedKeys');
    expect(V_MASKED_FIELDS['OPS-21'].fields as readonly string[]).not.toContain('.changedKeys');
  });
});
