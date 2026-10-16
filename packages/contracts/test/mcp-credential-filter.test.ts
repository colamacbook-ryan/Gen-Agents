// CNS-133 / INT-06: lọc credential là DEFAULT-DENY. Mọi tool bị lọc trừ danh sách miễn nhỏ; tool miễn chỉ được có tham số
// schema chặt. Review bảo mật M0 bắt `propose_edit` (newValue json) và `annotate` (note) lọt khỏi danh sách cho phép cũ.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  Anchor,
  CREDENTIAL_FILTER_EXEMPT,
  CREDENTIAL_PATTERNS,
  credentialFilterViolations,
  findCredentialLike,
  freeFormFields,
  MCP_TOOLS,
  requiresCredentialFilter,
  screenToolPayload,
  ToolArgs,
} from '../src/index.ts';

const CANARY = 'GA-CANARY-3f2b9c1e-8d4a-4f6b-9a1c-2e7d5b8c0a11';
const FAKE_JWT = `eyJhbGciOiJIUzI1NiJ9.${'eyJzdWIiOiJ4In0'}.${'c2lnbmF0dXJlLXRlc3Q'}`;
const FAKE_ACCESS = `ya29.${'A0ARrdaM-test-only-0123456789'}`;
const ANCHOR = 'grid:skills/row:SK-0004/col:C';

describe('registry: default-deny', () => {
  it('danh sách miễn hiện tại hợp lệ: mọi tool miễn chỉ có tham số schema chặt', () => {
    expect(credentialFilterViolations(ToolArgs, CREDENTIAL_FILTER_EXEMPT)).toEqual([]);
  });

  it('tool nào có trường tự do (string tự do / z.json / record / any) thì BẮT BUỘC bị lọc', () => {
    const free = MCP_TOOLS.filter((t) => freeFormFields(ToolArgs[t]).length > 0);
    expect(free).toEqual(
      expect.arrayContaining(['propose_edit', 'annotate', 'highlight', 'send_telegram', 'remember', 'set_field']),
    );
    for (const t of free) expect(requiresCredentialFilter(t), t).toBe(true);
  });

  it('tool mới / tên lạ mặc định bị lọc', () => {
    expect(requiresCredentialFilter('tool_moi_chua_khai')).toBe(true);
    expect(requiresCredentialFilter('')).toBe(true);
  });

  it('thêm tool có trường tự do vào danh sách miễn ⇒ đỏ (đối chứng âm cho cổng kiểm)', () => {
    const registry = { ...ToolArgs, leak: z.strictObject({ anchor: Anchor, text: z.string().max(200) }) };
    expect(credentialFilterViolations(registry, [...CREDENTIAL_FILTER_EXEMPT, 'leak'])).toEqual([
      { tool: 'leak', fields: ['$.text'] },
    ]);
    expect(credentialFilterViolations(ToolArgs, ['propose_edit'])).toEqual([
      { tool: 'propose_edit', fields: ['$.newValue'] },
    ]);
    expect(credentialFilterViolations(ToolArgs, ['annotate'])).toEqual([{ tool: 'annotate', fields: ['$.note'] }]);
    expect(credentialFilterViolations(ToolArgs, ['khong_ton_tai'])[0]?.tool).toBe('khong_ton_tai');
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

describe('anchor chặt không chở được credential', () => {
  it('anchor hợp lệ theo STD-08 §1', () => {
    for (const a of [
      ANCHOR,
      'panel:formula-bar',
      'role:RL-0001',
      'msg:MSG-0142',
      'file:AT-0007',
      'region:10,20,300,40@screen:dao-tao',
    ]) {
      expect(Anchor.safeParse(a).success, a).toBe(true);
    }
  });
  it('canary / JWT / token trong anchor bị schema từ chối', () => {
    for (const a of [CANARY, FAKE_JWT, FAKE_ACCESS, `panel:${CANARY}`, `grid:skills/row:SK-0004/col:${FAKE_ACCESS}`]) {
      expect(Anchor.safeParse(a).success, a).toBe(false);
    }
  });
});

describe('screenToolPayload — ca âm', () => {
  it('propose_edit mang canary / JWT / token (kể cả lồng trong json) bị chặn', () => {
    for (const newValue of [CANARY, FAKE_JWT, { a: [{ b: FAKE_ACCESS }] }, { refresh_token: 'x' }]) {
      const r = screenToolPayload('propose_edit', { anchor: ANCHOR, newValue });
      expect(r.status, JSON.stringify(newValue)).toBe('denied');
      if (r.status === 'denied') expect(r.code).toBe('credential_like_payload');
    }
  });
  it('annotate mang canary trong note bị chặn', () => {
    const r = screenToolPayload('annotate', { anchor: ANCHOR, note: `xem nè ${CANARY}`, n: 1 });
    expect(r).toEqual({ status: 'denied', code: 'credential_like_payload', patternId: 'canary' });
  });
  it('mọi tool không miễn: canary bị chặn; trường lạ ngoài schema cũng bị quét (quét payload thô trước khi parse)', () => {
    const samples: Record<string, unknown> = {
      recall: { query: CANARY },
      remember: { content: CANARY, kind: 'fact', scope: 'position' },
      set_field: { field: 'x', value: { nested: CANARY } },
      report_task: { taskId: null, status: 'done', summary: CANARY, certainty: null },
      send_telegram: { chatRef: 'c', text: CANARY },
      propose_change: { title: 't', items: [CANARY] },
      highlight: { anchor: ANCHOR, label: CANARY },
      annotate: { anchor: ANCHOR, note: CANARY, n: 1 },
      propose_edit: { anchor: ANCHOR, newValue: CANARY },
      navigate: { anchor: ANCHOR, extra: CANARY },
    };
    for (const [tool, args] of Object.entries(samples)) {
      const r = screenToolPayload(tool, args);
      expect(r.status, tool).not.toBe('ok');
    }
    expect(screenToolPayload('tool_moi', { x: CANARY }).status).toBe('denied');
  });
  it('đối chứng thuận: payload sạch đi qua', () => {
    expect(screenToolPayload('annotate', { anchor: ANCHOR, note: 'Câu này dài quá', n: 1 }).status).toBe('ok');
    expect(screenToolPayload('propose_edit', { anchor: ANCHOR, newValue: { text: 'ngắn hơn' } }).status).toBe('ok');
    expect(screenToolPayload('navigate', { anchor: ANCHOR }).status).toBe('ok');
  });
  it('mỗi mẫu credential tự bắt được mẫu của nó', () => {
    const samples: Record<string, string> = {
      jwt: FAKE_JWT,
      google_oauth_access_token: FAKE_ACCESS,
      google_refresh_token: `1//0${'abcdefghijklmnop'}`,
      google_api_key: `AIza${'x'.repeat(35)}`,
      vendor_api_key_sk_ant: `sk-ant-${'test0123456789'}`,
      pem_private_key: '-----BEGIN PRIVATE KEY-----',
      refresh_token_field: '{"refresh_token": "…"}',
      canary: CANARY,
    };
    for (const p of CREDENTIAL_PATTERNS) expect(findCredentialLike(samples[p.id])?.patternId, p.id).toBe(p.id);
    expect(findCredentialLike({ Refresh_Token: 'bất kỳ' })).toEqual({ patternId: 'credential_field_name' });
    expect(findCredentialLike({ note: 'nói về refresh token nói chung' })).toBeNull();
  });
});
