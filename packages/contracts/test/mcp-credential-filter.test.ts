// CNS-133 / INT-06: lọc credential là DEFAULT-DENY, KHÔNG có ngoại lệ — mọi tool bị quét trước khi parse.
// Review bảo mật M0 bắt hai lần: (1) `propose_edit` / `annotate` lọt khỏi danh sách cho phép thủ công;
// (2) tool "chỉ nhận anchor" được miễn quét trong khi slug anchor 40 ký tự vẫn chở được token chữ thường / hex.
// CNS-169 (Gen quyết 2026-10-16): hex / UUID / đoạn thiếu một lớp ký tự CỐ Ý không chặn (trừ khi có tiền tố đã biết);
// lần chặn ⇒ audit `credential.blocked` (cảnh báo owner), không phải harness.violation.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ANCHOR_GRID_TABLES,
  ANCHOR_SCREENS,
  Anchor,
  CREDENTIAL_BLOCKED,
  CREDENTIAL_DETECTORS,
  CREDENTIAL_PATTERN_IDS,
  findCredentialLike,
  freeFormFields,
  MCP_TOOLS,
  PENALTY_EVIDENCE_ACTIONS,
  payloadLimitExceeded,
  SseEvent,
  STRICT_SCHEMA_TOOLS,
  screenToolPayload,
  strictSchemaViolations,
  TOOL_PAYLOAD_LIMITS,
  ToolArgs,
} from '../src/index.ts';

const CANARY = 'GA-CANARY-3f2b9c1e-8d4a-4f6b-9a1c-2e7d5b8c0a11';
/**
 * Giá trị GIẢ dựng lúc chạy (luật lane: không để chuỗi giống credential nằm nguyên văn trong mã nguồn — gitleaks quét lịch
 * sử). `fake(n, bảng)` lặp bảng ký tự cho đủ n; `kv(tên, dấu, giá trị)` ghép phép gán.
 */
const fake = (n: number, alphabet = '0123456789abcdef') =>
  Array.from({ length: n }, (_, i) => alphabet[(i * 7 + 3) % alphabet.length]).join('');
const kv = (name: readonly string[], sep: string, value: string) => `${name.join('_')}${sep}${value}`;
const FAKE_JWT = `eyJhbGciOiJIUzI1NiJ9.${'eyJzdWIiOiJ4In0'}.${'c2lnbmF0dXJlLXRlc3Q'}`;
const FAKE_ACCESS = `ya29.${'A0ARrdaM-test-only-0123456789'}`;
const ANCHOR = 'grid:skills/row:SK-0004/col:C';

/** Token có tiền tố đã biết (kể cả chữ thường) + đoạn entropy cao (hoa + thường + số) ⇒ luôn chặn. */
const BLOCKED_TOKENS = {
  skLower: `sk-${'proj-abcdefghijklmnopqrstuvwx0123'}`,
  ya29Lower: `ya29.${'a0arrdam-lowercase-only-0123456789'}`,
  highEntropy: 'q9X2k7M4n1P8r5T3w6Y0z2B4d6F8h0J2l4N6p8R0',
};
/** CỐ Ý không chặn (CNS-169): hex mọi hoa thường, UUID, base32 / base64url chỉ chữ thường không tiền tố. */
const ALLOWED_IDENTIFIERS = {
  hex40: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b',
  hex64Upper: 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855',
  uuid: '3f2b9c1e-8d4a-4f6b-9a1c-2e7d5b8c0a11',
  base64urlLower: 'q9x2k7m4n1p8r5t3w6y0z2b4d6f8h0j2l4n6p8r0',
};

describe('mọi tool đều bị quét — không có ngoại lệ', () => {
  it('canary ở trường bất kỳ (kể cả trường lạ ngoài schema) của MỌI tool + tên tool lạ ⇒ denied, không phải invalid', () => {
    for (const tool of [...MCP_TOOLS, 'tool_moi_chua_khai']) {
      const r = screenToolPayload(tool, { truong_la: CANARY });
      expect(r.status, tool).toBe('denied');
    }
  });

  it('tool schema chặt (navigate, tour) cũng bị quét', () => {
    expect(screenToolPayload('navigate', { anchor: `panel:${BLOCKED_TOKENS.highEntropy}` })).toMatchObject({
      status: 'denied',
      code: 'credential_like_payload',
    });
    expect(screenToolPayload('tour', { anchors: [ANCHOR, BLOCKED_TOKENS.skLower] }).status).toBe('denied');
  });

  it('token có tiền tố / entropy cao qua navigate, tour, highlight đều bị chặn', () => {
    for (const [kind, tok] of Object.entries(BLOCKED_TOKENS)) {
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

  it('hex / UUID / base32 thường KHÔNG bị chặn (CNS-169); tool schema chặt vẫn từ chối anchor tự do bằng schema', () => {
    for (const [kind, tok] of Object.entries(ALLOWED_IDENTIFIERS)) {
      expect(findCredentialLike(tok), kind).toBeNull();
      expect(screenToolPayload('highlight', { anchor: ANCHOR, label: `đã đẩy ${tok}` }).status, kind).toBe('ok');
      expect(
        screenToolPayload('remember', { content: `Mã đơn của khách: ${tok}`, kind: 'fact' }).status,
        `remember ${kind}`,
      ).not.toBe('denied');
      // schema chặt: anchor ngoài ngữ pháp ⇒ invalid (không lọt), dù không bị coi là credential
      expect(screenToolPayload('navigate', { anchor: `panel:${tok}` }).status, `navigate ${kind}`).toBe('invalid');
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
      BLOCKED_TOKENS.highEntropy,
      `INFO got {${kv(['"refresh', 'token"'], ':', `"1//0${fake(10, 'abcdefghij')}"`)}}`,
    ]) {
      const r = screenToolPayload('propose_edit', { anchor: ANCHOR, newValue });
      expect(r.status, JSON.stringify(newValue)).toBe('denied');
      if (r.status === 'denied') expect(r.code).toBe('credential_like_payload');
    }
  });
  it('annotate mang canary trong note ⇒ denied', () => {
    const r = screenToolPayload('annotate', { anchor: ANCHOR, note: `xem nè ${CANARY}`, n: 1 });
    expect(r).toMatchObject({ status: 'denied', code: 'credential_like_payload', patternId: 'canary' });
  });
  it('credential_assignment: JSON nhúng giữa dòng, key=value, nháy đơn ⇒ chặn; chỉ nhắc tên / giá trị ngắn ⇒ không', () => {
    const embedded = kv(['access', 'token'], '=', fake(20));
    for (const s of [
      `INFO got {${kv(['"refresh', 'token"'], ':', `"${fake(6, 'abc.def-')}${fake(6, '0123456789')}"`)}} từ CLI`,
      `DEBUG resp={${kv(['"access', 'token"'], ': ', `"${fake(24, 'abcdefgh-0123456789')}"`)}}`,
      embedded,
      kv(['client', 'secret'], ': ', `'${fake(16, 'ZmFvYXJiYXp1eA')}'`),
      `cfg ${kv(['ID', 'TOKEN'], ' = ', '"aaaa.bbbb.cccc"')}`,
      `{${kv(["'api", "key'"], ':', `'k_${fake(8, '0123456789')}'`)}}`,
      `x-api-key: ${fake(40)}`,
    ]) {
      expect(findCredentialLike(s), s).not.toBeNull();
    }
    expect(findCredentialLike(embedded)?.patternId).toBe('credential_assignment');
    for (const s of [
      'access_token hết hạn sau 1 giờ, cần làm mới',
      'Trường access_token là gì?',
      'access_token: ngắn',
      'access_token = 1234567',
      'đặt client_secret trong trang cài đặt',
    ]) {
      expect(findCredentialLike(s), s).toBeNull();
    }
  });

  it('env_secret_assignment: dòng kiểu .env UPPER_SNAKE ⇒ chặn (cả giá trị hex); câu văn / giá trị ngắn ⇒ không', () => {
    for (const [s, id] of [
      [kv(['JWT', 'SECRET'], '=', fake(64)), 'env_secret_assignment'],
      // chứa `API_KEY` ⇒ credential_assignment (không phân biệt hoa thường) bắt trước — vẫn bị chặn
      [kv(['DATADOG', 'API', 'KEY'], '=', fake(32)), 'credential_assignment'],
      [kv(['GITHUB', 'TOKEN'], ': ', `"${fake(12, 'abcdefghij0123')}"`), 'env_secret_assignment'],
      [`export ${kv(['DB', 'PASSWORD'], '=', `'${fake(10, 'p@ss-w0rd')}'`)}`, 'env_secret_assignment'],
      [kv(['NPM', 'PAT'], '=', fake(9, 'abcdef')), 'env_secret_assignment'],
    ] as const) {
      expect(findCredentialLike(s)?.patternId, s).toBe(id);
    }
    for (const s of [
      'Role cần token để gọi API, secret không bao giờ in ra',
      'đặt KEY trong tệp .env rồi khởi động lại',
      kv(['SOME', 'KEY'], '=', 'short'),
      kv(['Some', 'Key'], '=', fake(32)),
      kv(['some', 'secret'], '=', fake(32)),
      kv(['MONKEY'], '=', fake(32)),
      kv(['API', 'KEYS'], '=', fake(32)),
      `commit ${fake(40)} đã đẩy`,
    ]) {
      expect(findCredentialLike(s), s).toBeNull();
    }
  });

  it('lần chặn ⇒ audit credential.blocked (cảnh báo owner), KHÔNG phải án phạt; không mang payload', () => {
    const r = screenToolPayload('send_telegram', { chatRef: 'c', text: `token ${BLOCKED_TOKENS.highEntropy}` });
    expect(r.status).toBe('denied');
    if (r.status !== 'denied' || r.code !== 'credential_like_payload') throw new Error('phải bị chặn');
    expect(r.audit).toEqual({
      action: 'credential.blocked',
      result: 'denied',
      channel: 'gateway',
      severity: 'warn',
      tool: 'send_telegram',
      detail: { patternId: 'high_entropy_run', tool: 'send_telegram' },
    });
    expect(PENALTY_EVIDENCE_ACTIONS as readonly string[]).not.toContain(CREDENTIAL_BLOCKED.action);
    expect(JSON.stringify(r.audit)).not.toContain(BLOCKED_TOKENS.highEntropy);
    // tên tool lạ (có thể chính là credential) ⇒ 'unknown'
    const odd = screenToolPayload(`ghp_${'a'.repeat(36)}`, {});
    if (odd.status !== 'denied' || odd.code !== 'credential_like_payload') throw new Error('phải bị chặn');
    expect(odd.audit.tool).toBe('unknown');
    expect(JSON.stringify(odd.audit)).not.toContain('ghp_');
    // id mẫu đồng bộ với bộ phát hiện + sự kiện SSE cho owner parse được
    expect([...CREDENTIAL_PATTERN_IDS]).toEqual([
      ...CREDENTIAL_DETECTORS.map((d) => d.id),
      'encoded_marker_flood',
      'credential_field_name',
      'too_deep',
    ]);
    expect(
      SseEvent.safeParse({
        id: '1',
        workspaceId: '01JABCDEFGHJKMNPQRSTVWXYZ0',
        at: '2026-10-16T08:00:00.000Z',
        type: 'credential.blocked',
        roleId: '01JABCDEFGHJKMNPQRSTVWXYZ0',
        tool: 'send_telegram',
        patternId: 'high_entropy_run',
        severity: 'warn',
        auditDisplayId: 'AU-00001',
      }).success,
    ).toBe(true);
  });

  it('url_userinfo tách authority như parser URL: mật khẩu chứa " \' < > @, userinfo dài, username rỗng', () => {
    const pw = (x: string) => `${x}${fake(6, 'Pw9x')}`;
    for (const s of [
      `https://u:${pw('"')}@h/x`,
      `https://u:${pw("'")}@h`,
      `https://u:${pw('<')}@h`,
      `https://u:${pw('>')}@h`,
      `https://u:${pw('a@b')}@h`,
      `https://${'u'.repeat(2500)}:${'p'.repeat(2500)}@h/`,
      `https://:${pw('')}@h`,
      `log: ftp://deploy:${pw('')}@files.internal:21/up`,
      `https://u:p\t${pw('')}@h`,
    ]) {
      expect(findCredentialLike(s)?.patternId, s.slice(0, 60)).toBe('url_userinfo');
    }
    for (const s of [
      'https://u@h',
      'mailto:a@b',
      'a:b@c',
      'https://h:8080/x@y',
      'https://u@h:8080',
      'https://h/a:b@c',
    ]) {
      expect(findCredentialLike(s), s).toBeNull();
    }
  });

  it('url_userinfo ⊇ new URL(): mọi chuỗi URL hợp lệ có password khác rỗng đều bị bắt (corpus ngẫu nhiên tất định)', () => {
    // Khoảng trắng (trừ TAB / LF / CR mà parser URL bỏ qua) kết thúc authority khi quét văn bản — corpus không chèn khoảng
    // trắng vào userinfo (URL có khoảng trắng thô không đứng nguyên trong văn bản chạy).
    let seed = 20261016;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return seed / 4294967296;
    };
    const ALPHA = 'abcXYZ019:@"\'<>%!$&()*+,;=~._-\t\n[]';
    const pick = (n: number) => Array.from({ length: n }, () => ALPHA[Math.floor(rnd() * ALPHA.length)]).join('');
    let withPassword = 0;
    const misses: string[] = [];
    for (let k = 0; k < 20_000; k++) {
      const scheme = ['https', 'http', 'ftp', 'postgres', 'x-y', 'ws'][Math.floor(rnd() * 6)];
      const s = `${scheme}://${pick(Math.floor(rnd() * 12))}@${pick(Math.floor(rnd() * 3))}h${['', '/p', '?q=1', '#f', ':8080/x'][Math.floor(rnd() * 5)]}`;
      let u: URL;
      try {
        u = new URL(s);
      } catch {
        continue;
      }
      if (u.password === '') continue;
      withPassword++;
      if (findCredentialLike(s) === null || findCredentialLike(`xem ${s} nhé`) === null) misses.push(JSON.stringify(s));
    }
    expect(withPassword).toBeGreaterThan(500);
    expect(misses.slice(0, 5)).toEqual([]);
  });

  it('npm / hf / GOCSPX / Bearer / URL có mật khẩu (L-SEC) — ca âm không bắt', () => {
    for (const s of [
      'the bearer of this note',
      'Bearer short',
      'https://example.com/a@b',
      'git@github.com:org/repo.git',
      'mailto:user@example.com',
      'https://user@example.com/x',
      // ranh giới trước: chữ / số liền trước tiền tố ⇒ không phải token (giá trị chữ thường để không chạm high_entropy_run)
      `xnpm_${fake(36, 'abc123')}`,
      `ahf_${fake(34, 'abc123')}`,
      'npm_install',
    ]) {
      expect(findCredentialLike(s), s).toBeNull();
    }
    for (const s of [
      `https://:${fake(10, 'pw12')}@host/x`,
      `see ${['bear', 'er'].join('')}\t${fake(16, 'tok123')}`,
      `"npm_${fake(30, 'k9')}"`,
    ]) {
      expect(findCredentialLike(s), s).not.toBeNull();
    }
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
      generic_sk_key: BLOCKED_TOKENS.skLower,
      stripe_secret_key: `sk_live_${'abcdefghij0123456789'}`,
      github_token: `ghp_${'abcdefghijklmnopqrstuvwxyz0123456789'}`,
      slack_token: `xoxb-${'1234567890-abcdefghij'}`,
      gitlab_token: `glpat-${'abcdefghij0123456789'}`,
      aws_access_key_id: `AKIA${'IOSFODNN7EXAMPLE'}`,
      telegram_bot_token: `123456789:${'AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsawq'}`,
      credential_assignment: kv(['access', 'token'], '=', fake(13, 'abcdefgh12345')),
      env_secret_assignment: kv(['JWT', 'SECRET'], '=', fake(64)),
      high_entropy_run: BLOCKED_TOKENS.highEntropy,
      npm_token: `npm_${fake(36, 'aB3dE5gH7j')}`,
      huggingface_token: `hf_${fake(34, 'qW2eR4tY6u')}`,
      google_oauth_client_secret: `GOCSPX-${fake(28, 'zX1cV2bN3m-_')}`,
      bearer_token: `Authorization: ${['Bear', 'er'].join('')} ${fake(24, 'abc.def~123+/=')}`,
      url_userinfo: `postgres://app:${fake(12, 'pAsS-w0rd')}@db.internal:5432/x`,
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

// Trần thời gian chỉ để tách TUYẾN TÍNH (~10–30 ms / MiB cho cả bộ) khỏi SIÊU TUYẾN TÍNH (bậc hai trên 1 MiB ≈ 10^12 bước,
// hàng phút): 200 ms chừa biên cho máy CI bận + vitest chạy song song nhiều tệp test, vẫn bắt được ReDoS với biên cực lớn.
// Ở runtime chuỗi không bao giờ tới 1 MiB: payloadLimitExceeded chặn > 16 KiB / chuỗi, > 64 KiB / payload TRƯỚC khi quét.
const SCAN_BUDGET_MS = 200;

describe('hiệu năng bộ quét (ReDoS) — chuỗi 1 MiB, mỗi lượt dưới trần tuyến tính', () => {
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
    'access_token= lặp': 'access_token='.repeat(Math.floor(MB / 13)),
    'access_token + 1 MB khoảng trắng': `access_token${' '.repeat(MB)}`,
    'access_token: + 1 MB khoảng trắng': `access_token:${' '.repeat(MB)}`,
    '"client_secret":" lặp': '"client_secret":"'.repeat(Math.floor(MB / 17)),
    'chữ số + : lặp (gần token Telegram)': '123456789:'.repeat(Math.floor(MB / 10)),
    'ghp_ lặp': 'ghp_'.repeat(Math.floor(MB / 4)),
    'AKIA lặp': 'AKIA'.repeat(Math.floor(MB / 4)),
    'hex 1 MB (không chặn, quét hết)': '0123456789abcdef'.repeat(MB / 16),
    'UUID lặp': '3f2b9c1e-8d4a-4f6b-9a1c-2e7d5b8c0a11 '.repeat(Math.floor(MB / 37)),
    ':// lặp': '://'.repeat(Math.floor(MB / 3)),
    '://a: + 1 MiB không @': `://a:${'b'.repeat(MB)}`,
    '://: + 1 MiB @ (authority dài, có mật khẩu)': `://a:${'@'.repeat(MB)}`,
    '://@ lặp': '://@'.repeat(Math.floor(MB / 4)),
    ':// + 1 MiB TAB/LF': `://${'\t\n'.repeat(MB / 2)}`,
    ':/:/ lặp (gần ://)': ':/:/'.repeat(Math.floor(MB / 4)),
    '://u:p lặp (không @)': '://u:pppppppppp '.repeat(Math.floor(MB / 16)),
    'Bearer lặp': 'Bearer '.repeat(Math.floor(MB / 7)),
    'bearer + 1 MiB tab': `bearer${'\t'.repeat(MB)}`,
    'hf_ / npm_ lặp': 'hf_npm_'.repeat(Math.floor(MB / 7)),
    'A_A_A_… (gần .env)': 'A_'.repeat(MB / 2),
    'A_KEY lặp': 'A_KEY'.repeat(Math.floor(MB / 5)),
    'X_SECRET= + 1 MB khoảng trắng': `X_SECRET=${' '.repeat(MB)}`,
    'X_TOKEN + 1 MB khoảng trắng': `X_TOKEN${' '.repeat(MB)}`,
    '_KEY= lặp': ' A_KEY='.repeat(Math.floor(MB / 7)),
  };
  for (const [name, str] of Object.entries(adversarial)) {
    it(name, () => {
      const ms = fastest(() => findCredentialLike(str));
      expect(ms, `${name}: ${ms.toFixed(1)} ms`).toBeLessThan(SCAN_BUDGET_MS);
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
    expect(ms).toBeLessThan(SCAN_BUDGET_MS);
  });
  it('chuỗi đúng sát trần: được quét (sạch ⇒ ok, token ⇒ denied); vượt trần 1 ký tự ⇒ payload_too_large', () => {
    expect(screenToolPayload('propose_edit', { anchor: ANCHOR, newValue: 'a'.repeat(cap) }).status).toBe('ok');
    expect(
      screenToolPayload('propose_edit', {
        anchor: ANCHOR,
        newValue: `${'a'.repeat(cap - 41)} ${BLOCKED_TOKENS.highEntropy}`,
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
