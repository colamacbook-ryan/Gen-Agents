import { describe, expect, it } from 'vitest';
import { collectNodes } from '../../src/api/introspect.ts';
import { responseSchemaOf } from '../../src/api/routes.ts';
import { idPrefixOf, RECORD_ACCESS, ROUTES, routeById, V_MASKED_FIELDS } from '../../src/index.ts';

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
  // round 5: họ hàng do review PR #7 (f88090b) chỉ ra.
  'OPS-02',
  'GW-05',
  'GW-06',
];

const pathsOf = (id: string): string[] => {
  const schema = responseSchemaOf(routeById(id) as never);
  return schema ? collectNodes(schema, '').map((n) => n.path) : [];
};

describe('V_MASKED_FIELDS', () => {
  it('đúng bằng danh sách route của nghĩa vụ #5 (+ họ hàng round 5)', () => {
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
    expect(seen).toBe(13);
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

// ---------------------------------------------------------------- hàng rào hệ thống (round 5)
// Mỗi route V: MỌI trường có tên nhạy cảm, hoặc mang ID của loại bản ghi mà RECORD_ACCESS đã hạn chế ở A / O, phải (a) nằm trong
// V_MASKED_FIELDS của route, (b) hoặc route đã ≥ A, (c) hoặc nằm trong danh sách ngoại lệ HẸP bên dưới (kèm lý do). Thêm route /
// trường mới mà quên ⇒ đỏ — chặn "đường anh em" của các review trước (OPS-02, GW-05/06, SYS-16/18/22).
const SENSITIVE_NAME = /hint|email|value|content|body|summary|snippet/i;

// route:đường-dẫn-trường (hoặc route:* cho cả route) → lý do vì sao không che.
const EXEMPT: Record<string, string> = {
  'SYS-37:.rows[].valueType': 'tên kiểu dữ liệu của mục DNA (text / list …), không phải nội dung',
  'SYS-80:.kpis[].value': 'số liệu tổng hợp của dashboard, không phải nội dung bản ghi',
  'SYS-46:.rows[].content':
    'prompt của Role: không có cột sensitivity; Data Console đọc cùng dữ liệu ở V (chỉ che hàng confidential). Gen duyệt',
  'SYS-46:.rows[].condition.value': 'từ khoá điều kiện của chỉ dẫn, cùng nguồn với `content`',
  'SYS-49:.rows[].contentMd': 'nội dung skill (prompt của Role), như SYS-46. Gen duyệt',
  'SYS-70:.checks[].fixHint': 'khoá i18n của gợi ý sửa, không phải dữ liệu',
  'GW-18:[].valueState': 'enum known / unknown',
  'GW-18:[].value': 'giá trị khả năng engine do quét CLI (danh sách model, cờ), không PII',
  'WRK-16:.resultSummary': 'tóm tắt kết quả công việc, không có cột sensitivity; như SYS-46. Gen duyệt',
  'OPS-32:*': 'mô tả lưới (GridInfo / GridColumn): `values` là tập khoá enum đóng, không có nội dung bản ghi',
  'OPS-33:.clauses[].values': 'mệnh đề ô truy vấn do CHÍNH viewer gõ (đã qua whitelist), không phải dữ liệu bản ghi',
  'OPS-33:.aliasHints': 'mã cũ → mã mới của cùng lưới (display_id), không có nội dung',
  'OPS-33:.groups[].value': 'giá trị nhóm của cột được phép nhóm — handler che cùng quy tắc với `cells`',
  'OPS-35:.routeHint': 'khoá route để điều hướng, không phải dữ liệu',
  'OPS-36:[].routeHint': 'khoá route để điều hướng, không phải dữ liệu',
  // ID tham chiếu (loại bản ghi mức A / deny nhưng chỉ ID, không nội dung; muốn đọc phải qua route mức tương ứng)
  'EXT-03:.user': 'chính người gọi (id + displayId), không email / username',
  'SYS-25:.items[].sourceMessage': 'chỉ ID của tin nhắn nguồn; nội dung đọc qua SYS-18 (A)',
  'SYS-26:.sourceMessage': 'chỉ ID của tin nhắn nguồn; nội dung đọc qua SYS-18 (A)',
  'SYS-32:.interview': 'chỉ ID của cuộc phỏng vấn; nội dung đọc qua SYS-16 / SYS-18 (A)',
  'SYS-41:[].by': 'ID người ký (member), không email / username',
  'WRK-21:.entries.items[].recordedBy': 'ID người ghi sổ (member), không email / username',
  'OPS-02:.settings[].displayId': 'ID dòng cài đặt; `value` đã che',
};

function isMasked(id: string, path: string): boolean {
  const spec = (V_MASKED_FIELDS as Record<string, { fields: readonly string[] }>)[id];
  return (spec?.fields ?? []).some(
    (f) => path === f || path.startsWith(`${f}.`) || path.startsWith(`${f}|`) || path.startsWith(`${f}[`),
  );
}

function isExempt(id: string, path: string): boolean {
  if (Object.hasOwn(EXEMPT, `${id}:*`)) return true;
  return Object.keys(EXEMPT).some((k) => {
    if (!k.startsWith(`${id}:`)) return false;
    const e = k.slice(id.length + 1);
    return path === e || path.startsWith(`${e}.`) || path.startsWith(`${e}|`) || path.startsWith(`${e}[`);
  });
}

describe('hàng rào hệ thống: route V không để lọt trường đã bị hạn chế', () => {
  const vRoutes = ROUTES.filter((r) => r.auth === 'V' && r.response.kind === 'json');

  it('route V có trường tên nhạy cảm (hint / email / value / content / body / summary / snippet) ⇒ đã khai che hoặc có ngoại lệ có lý do', () => {
    const leaks: string[] = [];
    for (const r of vRoutes) {
      const nodes = collectNodes(responseSchemaOf(r) as never, '');
      const seen = new Set<string>();
      const reported = new Set<string>();
      for (const n of nodes) {
        if (n.key === null || !SENSITIVE_NAME.test(n.key) || seen.has(n.path)) continue;
        seen.add(n.path);
        if (n.type === 'object') continue;
        // chỉ báo nút NGOÀI CÙNG (Json tự do bung thành nhiều nhánh `|n` bên dưới).
        if (
          [...reported].some(
            (q) => n.path.startsWith(`${q}|`) || n.path.startsWith(`${q}[`) || n.path.startsWith(`${q}.`),
          )
        )
          continue;
        if (!isMasked(r.id, n.path) && !isExempt(r.id, n.path)) {
          leaks.push(`${r.id} ${n.path}`);
          reported.add(n.path);
        }
      }
    }
    expect(
      leaks,
      'trường nhạy cảm ở route V chưa che (khai trong V_MASKED_FIELDS, nâng route lên A, hoặc thêm ngoại lệ có lý do)',
    ).toEqual([]);
  });

  it('route V có ID của loại bản ghi mà RECORD_ACCESS hạn chế ở A / O ⇒ đã khai che hoặc có ngoại lệ', () => {
    const leaks: string[] = [];
    for (const r of vRoutes) {
      const nodes = collectNodes(responseSchemaOf(r) as never, '');
      const seen = new Set<string>();
      for (const n of nodes) {
        const prefix = idPrefixOf(n.schema);
        if (!prefix || seen.has(n.path)) continue;
        const level = RECORD_ACCESS[prefix];
        if (level !== 'A' && level !== 'O' && level !== 'deny') continue;
        seen.add(n.path);
        if (!isMasked(r.id, n.path) && !isExempt(r.id, n.path)) leaks.push(`${r.id} ${n.path} (${prefix} = ${level})`);
      }
    }
    expect(leaks, 'route V trả ID của loại bản ghi mức A / O / deny').toEqual([]);
  });

  it('SYS-16 / SYS-18 / SYS-22 (nội dung chat) đã nâng lên A; mọi route nhận thread / message ref không còn ở V', () => {
    for (const id of ['SYS-16', 'SYS-18', 'SYS-22']) expect(routeById(id)?.auth, id).toBe('A');
    expect(routeById('WRK-28')?.auth).toBe('A');
  });

  it('ngoại lệ không thừa: mỗi ngoại lệ trỏ tới route V có thật', () => {
    for (const key of Object.keys(EXEMPT)) {
      const id = key.split(':')[0] as string;
      expect(
        vRoutes.map((r) => r.id),
        key,
      ).toContain(id);
    }
  });
});

describe('round 5: OPS-02 / GW-05 / GW-06', () => {
  it('OPS-02: viewer thấy khoá + metadata, `value` và `default.value` của MỌI khoá bị che', () => {
    expect(V_MASKED_FIELDS['OPS-02'].fields).toEqual(['.settings[].value', '.settings[].default|0.value']);
    expect(V_MASKED_FIELDS['OPS-02'].flags).toEqual(['.settings[].redacted']);
    expect(routeById('OPS-02')?.auth).toBe('V');
  });

  it('GW-05 / GW-06: accountHint bị che cho viewer; GW-06 che cả danh sách đồng ý (CN)', () => {
    expect(V_MASKED_FIELDS['GW-05'].fields).toEqual(['[].accountHint']);
    expect(V_MASKED_FIELDS['GW-06'].fields).toEqual(['.accountHint', '.consents']);
  });
});
