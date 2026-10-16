// CNS-133 / INT-06: lọc credential là DEFAULT-DENY, KHÔNG có ngoại lệ — mọi tool bị quét trước khi parse.
// Review bảo mật M0 bắt hai lần: (1) `propose_edit` / `annotate` lọt khỏi danh sách cho phép thủ công;
// (2) tool "chỉ nhận anchor" được miễn quét trong khi slug anchor 40 ký tự vẫn chở được token chữ thường / hex.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ANCHOR_GRID_TABLES,
  ANCHOR_SCREENS,
  Anchor,
  CREDENTIAL_DETECTORS,
  findCredentialLike,
  freeFormFields,
  MCP_TOOLS,
  payloadLimitExceeded,
  STRICT_SCHEMA_TOOLS,
  screenToolPayload,
  strictSchemaViolations,
  TOOL_PAYLOAD_LIMITS,
  ToolArgs,
} from '../src/index.ts';

const CANARY = 'GA-CANARY-3f2b9c1e-8d4a-4f6b-9a1c-2e7d5b8c0a11';
const FAKE_JWT = `eyJhbGciOiJIUzI1NiJ9.${'eyJzdWIiOiJ4In0'}.${'c2lnbmF0dXJlLXRlc3Q'}`;
const FAKE_ACCESS = `ya29.${'A0ARrdaM-test-only-0123456789'}`;
const ANCHOR = 'grid:skills/row:SK-0004/col:C';

/** Biến thể token chữ thường (review lần 2): hex 40, base64url thường, sk-…, ya29.… */
const LOWERCASE_TOKENS = {
  hex40: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b',
  base64urlLower: 'q9x2k7m4n1p8r5t3w6y0z2b4d6f8h0j2l4n6p8r0',
  skLower: `sk-${'proj-abcdefghijklmnopqrstuvwx0123'}`,
  ya29Lower: `ya29.${'a0arrdam-lowercase-only-0123456789'}`,
};

describe('mọi tool đều bị quét — không có ngoại lệ', () => {
  it('canary ở trường bất kỳ (kể cả trường lạ ngoài schema) của MỌI tool + tên tool lạ ⇒ denied, không phải invalid', () => {
    for (const tool of [...MCP_TOOLS, 'tool_moi_chua_khai']) {
      const r = screenToolPayload(tool, { truong_la: CANARY });
      expect(r.status, tool).toBe('denied');
    }
  });

  it('tool schema chặt (navigate, tour) cũng bị quét', () => {
    expect(screenToolPayload('navigate', { anchor: `panel:${LOWERCASE_TOKENS.hex40}` })).toMatchObject({
      status: 'denied',
      code: 'credential_like_payload',
    });
    expect(screenToolPayload('tour', { anchors: [ANCHOR, LOWERCASE_TOKENS.base64urlLower] }).status).toBe('denied');
  });

  it('token chữ thường / hex qua navigate, tour, highlight đều bị chặn', () => {
    for (const [kind, tok] of Object.entries(LOWERCASE_TOKENS)) {
      const cases: Array<[string, unknown]> = [
        ['navigate', { anchor: `region:1,2,3,4@screen:${tok}` }],
        ['navigate', { anchor: `panel:${tok}` }],
        ['tour', { anchors: [ANCHOR, `grid:${tok}/row:SK-0001`] }],
        ['highlight', { anchor: ANCHOR, label: tok }],
        ['highlight', { anchor: ANCHOR, label: `xem ${tok} nhé` }],
      ];
      for (const [tool, args] of cases) {
        expect(screenToolPayload(tool, args).status, `${kind} qua ${tool}`).toBe('denied');
      }
    }
  });

  it('đối chứng thuận: anchor hợp lệ + nội dung sạch vẫn qua', () => {
    expect(screenToolPayload('navigate', { anchor: 'region:10,20,300,40@screen:a11' }).status).toBe('ok');
    expect(screenToolPayload('navigate', { anchor: ANCHOR }).status).toBe('ok');
    expect(
      screenToolPayload('tour', { anchors: [ANCHOR, 'panel:formula-bar', 'role:RL-0001', 'msg:MSG-0142'] }).status,
    ).toBe('ok');
    expect(screenToolPayload('highlight', { anchor: ANCHOR, label: 'Chỗ cần sửa' }).status).toBe('ok');
    expect(screenToolPayload('annotate', { anchor: ANCHOR, note: 'Câu này dài quá', n: 1 }).status).toBe('ok');
    expect(screenToolPayload('propose_edit', { anchor: ANCHOR, newValue: { text: 'ngắn hơn' } }).status).toBe('ok');
    // ULID (26 ký tự) và display_id không bị coi là token
    expect(
      screenToolPayload('report_task', {
        taskId: '01JABCDEFGHJKMNPQRSTVWXYZ0',
        status: 'done',
        summary: 'Xong TK-0462',
        certainty: null,
      }).status,
    ).toBe('ok');
  });
});

describe('canary đủ dạng (STD-11 1.10)', () => {
  it('canary chữ hoa / chữ thường / hex hoa ⇒ denied qua mọi kiểu trường', () => {
    for (const c of [CANARY, CANARY.toLowerCase(), `GA-CANARY-${'3F2B9C1E8D4A4F6B'}`]) {
      expect(screenToolPayload('send_telegram', { chatRef: 'c', text: c }).status, c).toBe('denied');
      expect(screenToolPayload('propose_change', { title: 't', items: [{ [c]: 1 }] }).status, `khoá ${c}`).toBe(
        'denied',
      );
    }
  });
});

describe('anchor: ngữ pháp đóng từ registry', () => {
  it('bảng / màn / panel ngoài registry, prefix lệch bảng, slug tự do ⇒ schema từ chối', () => {
    for (const a of [
      'region:1,2,3,4@screen:dao-tao',
      'region:1,2,3,4@screen:a12',
      'panel:khong-co',
      'grid:khong_co/row:SK-0001',
      'grid:skills/row:RL-0001',
      'grid:skills/row:SK-123456789',
      'row:ZZ-0001',
      CANARY,
      FAKE_JWT,
    ]) {
      expect(Anchor.safeParse(a).success, a).toBe(false);
    }
  });
  it('mọi bảng lưới và mọi màn trong registry đều tạo được anchor hợp lệ', () => {
    expect(ANCHOR_GRID_TABLES).toContain('skills');
    for (const s of ANCHOR_SCREENS) expect(Anchor.safeParse(`region:0,0,1,1@screen:${s}`).success, s).toBe(true);
    expect(Anchor.safeParse('grid:audit_log/row:AU-00007/col:B').success).toBe(true);
  });
});

describe('schema chặt (lớp phòng thủ thứ hai, không phải miễn quét)', () => {
  it('STRICT_SCHEMA_TOOLS hiện tại không có trường tự do', () => {
    expect(strictSchemaViolations(ToolArgs, STRICT_SCHEMA_TOOLS)).toEqual([]);
  });

  it('tool có string tự do / z.json / record / any không được khai là schema chặt', () => {
    const free = MCP_TOOLS.filter((t) => freeFormFields(ToolArgs[t]).length > 0);
    expect(free).toEqual(
      expect.arrayContaining(['propose_edit', 'annotate', 'highlight', 'send_telegram', 'remember', 'set_field']),
    );
    for (const t of free) expect(STRICT_SCHEMA_TOOLS as readonly string[], t).not.toContain(t);
  });

  it('thêm tool có trường tự do vào danh sách schema chặt ⇒ đỏ (đối chứng âm)', () => {
    const registry = { ...ToolArgs, leak: z.strictObject({ anchor: Anchor, text: z.string().max(200) }) };
    expect(strictSchemaViolations(registry, [...STRICT_SCHEMA_TOOLS, 'leak'])).toEqual([
      { tool: 'leak', fields: ['$.text'] },
    ]);
    expect(strictSchemaViolations(ToolArgs, ['propose_edit'])).toEqual([
      { tool: 'propose_edit', fields: ['$.newValue'] },
    ]);
    expect(strictSchemaViolations(ToolArgs, ['annotate'])).toEqual([{ tool: 'annotate', fields: ['$.note'] }]);
    expect(strictSchemaViolations(ToolArgs, ['khong_ton_tai'])[0]?.tool).toBe('khong_ton_tai');
  });

  it('bộ phân loại: z.json / record / any / chuỗi không neo đều là tự do; regex neo + max là chặt', () => {
    expect(freeFormFields(z.json())).toEqual(['$']);
    expect(freeFormFields(z.record(z.string(), z.string()))).toEqual(['$']);
    expect(freeFormFields(z.any())).toEqual(['$']);
    expect(
      freeFormFields(
        z
          .string()
          .regex(/[a-z]+/)
          .max(10),
      ),
    ).toEqual(['$']);
    expect(freeFormFields(z.string().regex(/^[a-z]+$/))).toEqual(['$']);
    expect(
      freeFormFields(
        z
          .string()
          .regex(/^[a-z]+$/)
          .max(10),
      ),
    ).toEqual([]);
    expect(freeFormFields(z.looseObject({ a: z.number() }))).toEqual(['$.*']);
    expect(freeFormFields(ToolArgs.tour)).toEqual([]);
  });
});

describe('screenToolPayload — ca âm propose_edit / annotate', () => {
  it('propose_edit mang canary / JWT / token lồng / khoá refresh_token ⇒ denied', () => {
    for (const newValue of [
      CANARY,
      FAKE_JWT,
      { a: [{ b: FAKE_ACCESS }] },
      { refresh_token: 'x' },
      LOWERCASE_TOKENS.hex40,
    ]) {
      const r = screenToolPayload('propose_edit', { anchor: ANCHOR, newValue });
      expect(r.status, JSON.stringify(newValue)).toBe('denied');
      if (r.status === 'denied') expect(r.code).toBe('credential_like_payload');
    }
  });
  it('annotate mang canary trong note ⇒ denied', () => {
    const r = screenToolPayload('annotate', { anchor: ANCHOR, note: `xem nè ${CANARY}`, n: 1 });
    expect(r).toEqual({ status: 'denied', code: 'credential_like_payload', patternId: 'canary' });
  });
  it('mỗi mẫu credential tự bắt được mẫu của nó; câu thường không bị bắt', () => {
    const samples: Record<string, string> = {
      jwt: FAKE_JWT,
      google_oauth_access_token: FAKE_ACCESS,
      google_refresh_token: `1//0${'abcdefghijklmnop'}`,
      google_api_key: `AIza${'x'.repeat(35)}`,
      vendor_api_key_sk_ant: `sk-ant-${'test0123456789'}`,
      pem_private_key: '-----BEGIN PRIVATE KEY-----',
      refresh_token_field: '{"refresh_token": "…"}',
      canary: CANARY,
      generic_sk_key: LOWERCASE_TOKENS.skLower,
      long_token_run: LOWERCASE_TOKENS.hex40,
    };
    for (const p of CREDENTIAL_DETECTORS) expect(findCredentialLike(samples[p.id])?.patternId, p.id).toBe(p.id);
    expect(findCredentialLike({ Refresh_Token: 'bất kỳ' })).toEqual({ patternId: 'credential_field_name' });
    expect(findCredentialLike({ note: 'nói về refresh token nói chung, mã TK-0462, RL-0001' })).toBeNull();
    expect(findCredentialLike('01JABCDEFGHJKMNPQRSTVWXYZ0')).toBeNull();
  });
});

// ---------------------------------------------------------------- STD-11 1.10: chặn kích thước trước khi quét + quét tuyến tính
const MB = 1 << 20;
function fastest(fn: () => unknown): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    fn();
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}

describe('hiệu năng bộ quét (ReDoS) — chuỗi 1 MB, mỗi lượt < 50 ms', () => {
  const adversarial: Record<string, string> = {
    'toàn a': 'a'.repeat(MB),
    'toàn 0': '0'.repeat(MB),
    'xen kẽ a0': 'a0'.repeat(MB / 2),
    'sk- lặp': 'sk-'.repeat(Math.floor(MB / 3)),
    'eyJ lặp': 'eyJ'.repeat(Math.floor(MB / 3)),
    'eyJ…. lặp (gần JWT)': `${'eyJaaaaaaaaa.'.repeat(Math.floor(MB / 13))}`,
    'ya29. lặp': 'ya29.'.repeat(Math.floor(MB / 5)),
    '1//0 lặp': '1//0'.repeat(Math.floor(MB / 4)),
    'AIza lặp': 'AIza'.repeat(Math.floor(MB / 4)),
    'BEGIN + 1 MB chữ hoa': `-----BEGIN ${'A'.repeat(MB)}`,
    'refresh_token + 1 MB khoảng trắng': `refresh_token${' '.repeat(MB)}`,
    'GA-CANARY- lặp': 'GA-CANARY-'.repeat(Math.floor(MB / 10)),
    'gạch nối': '-'.repeat(MB),
  };
  for (const [name, str] of Object.entries(adversarial)) {
    it(name, () => {
      const ms = fastest(() => findCredentialLike(str));
      expect(ms, `${name}: ${ms.toFixed(1)} ms`).toBeLessThan(50);
    });
  }
});

describe('chặn kích thước TRƯỚC khi quét', () => {
  const cap = TOOL_PAYLOAD_LIMITS.maxStringChars;
  it('chuỗi 1 MB ⇒ denied payload_too_large, nhanh, không quét', () => {
    let r: ReturnType<typeof screenToolPayload> | undefined;
    const ms = fastest(() => {
      r = screenToolPayload('propose_edit', { anchor: ANCHOR, newValue: 'a0'.repeat(MB / 2) });
    });
    expect(r).toMatchObject({ status: 'denied', code: 'payload_too_large' });
    expect(ms).toBeLessThan(50);
  });
  it('chuỗi đúng sát trần: được quét (sạch ⇒ ok, token ⇒ denied); vượt trần 1 ký tự ⇒ payload_too_large', () => {
    expect(screenToolPayload('propose_edit', { anchor: ANCHOR, newValue: 'a'.repeat(cap) }).status).toBe('ok');
    expect(
      screenToolPayload('propose_edit', {
        anchor: ANCHOR,
        newValue: `${'a'.repeat(cap - 40)}${LOWERCASE_TOKENS.hex40}`,
      }),
    ).toMatchObject({
      status: 'denied',
      code: 'credential_like_payload',
    });
    expect(screenToolPayload('propose_edit', { anchor: ANCHOR, newValue: 'a'.repeat(cap + 1) })).toMatchObject({
      status: 'denied',
      code: 'payload_too_large',
    });
  });
  it('trần tổng / độ sâu / số nút / khoá dài / tên tool dài', () => {
    expect(payloadLimitExceeded({ items: Array.from({ length: 5 }, () => 'x'.repeat(cap)) })).toBe('payload quá lớn');
    let deep: unknown = 'x';
    for (let i = 0; i < 40; i++) deep = [deep];
    expect(payloadLimitExceeded(deep)).toBe('lồng quá sâu');
    expect(payloadLimitExceeded(Array.from({ length: 20_000 }, (_, i) => i))).toBe('mảng quá dài');
    expect(payloadLimitExceeded({ ['k'.repeat(cap + 1)]: 1 })).toBe('khoá quá dài');
    expect(screenToolPayload('t'.repeat(65), {})).toMatchObject({ status: 'denied', code: 'payload_too_large' });
    expect(payloadLimitExceeded({ anchor: ANCHOR, note: 'ok', n: 1 })).toBeNull();
  });
});
