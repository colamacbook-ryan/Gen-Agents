// Bộ phát hiện credential dùng chung (CNS-133, CNS-169, STD-11): mỗi lối vào một ca thuận + ca âm; biến thể mã hoá;
// ca KHÔNG chặn có chủ đích (hex thuần, UUID); che log giữ JSON hợp lệ.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CREDENTIAL_BLOCKED,
  credentialBlockedAudit,
  DETECTOR_IDS,
  detectCredential,
  isSensitiveKey,
  payloadOverLimit,
  redactLogLine,
  redactText,
  redactValue,
  SCAN_MAX_CHARS,
  scanText,
  screenPayload,
} from '../src/index.ts';
import { CANARY, SAMPLES } from './helpers.ts';

const wrap = (s: string) => `Báo cáo xong việc. Chi tiết: ${s} — hết.`;

describe('mỗi loại mẫu: bắt đúng id, ở mọi vị trí', () => {
  for (const [id, sample] of Object.entries(SAMPLES)) {
    it(id, () => {
      expect(DETECTOR_IDS).toContain(id);
      expect(detectCredential(sample)).toBe(id);
      expect(detectCredential(wrap(sample))).toBe(id);
      expect(detectCredential(JSON.stringify({ text: sample }))).not.toBeNull();
      const r = scanText(wrap(sample));
      expect(r.status).toBe('match');
    });
  }
});

describe('ca âm từng luật (chỉ chính luật đó lẽ ra phải bắt — thiếu điều kiện ⇒ không chặn)', () => {
  const negatives: Record<string, string[]> = {
    jwt: ['eyJhbGciOiJIUzI1NiJ9.short.x', 'eyJabc.def.ghi', 'eyJhbGciOiJIUzI1NiJ9 eyJzdWIiOiJ4In0'],
    google_oauth_access_token: ['ya29.short', 'ya29. tokens'],
    google_refresh_token: ['1//0abc', 'trang 1//0 của sách'],
    google_api_key: ['AIzaShort123'],
    vendor_api_key_sk_ant: ['sk-ant-short'],
    generic_sk_key: ['task-1234567890abcdefghijklmnop', 'desk-ABCDEFGHIJKLMNOPQRSTUVW', 'sk-short-ok'],
    github_token: ['ghp_short', 'xghp_abcdefghijklmnopqrstuvwxyzabcdefghij'],
    slack_token: ['xoxb-short'],
    aws_access_key_id: ['AKIA1234', 'AKIATESTONLY2345ABCDEXTRA', 'XAKIATESTONLY2345ABCD'],
    telegram_bot_token: ['12345:AAshort', '12345678901234:aabcdefghijklmnopqrstuvwxyzabcdefghijkl', 'giờ 10:30 sáng'],
    pem_private_key: ['-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----', '-----BEGIN CERTIFICATE-----'],
    credential_field: [
      'Bạn đổi password: ở trang cài đặt',
      'token: ok',
      'xpassword=abcdefghijkl',
      'access_token=short',
      'client_secret: "1234567"',
      'api_key field is required',
      'access_token',
    ],
    bearer_token: ['the bearer of this note', 'Bearer short'],
    url_userinfo: ['https://git.example.com/repo.git', 'mailto:user@example.com', 'https://user@host.example.com/'],
    canary: ['GA-CANARY-', 'GA-CANARY-xyz', 'GA CANARY 3f2b9c1e'],
    high_entropy: [
      'abcdefghijklmnopqrstuvwxyzabcdefgh',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      `${'aB3'.repeat(10)}a`,
    ],
  };
  for (const [id, cases] of Object.entries(negatives)) {
    it(id, () => {
      for (const c of cases) expect(detectCredential(c), c).toBeNull();
    });
  }
});

describe('CNS-169: KHÔNG chặn hex thuần / UUID (ca có chủ đích)', () => {
  const hex = (n: number, upper = false) => {
    const h = createHash('sha512').update(String(n)).digest('hex').repeat(4).slice(0, n);
    return upper ? h.toUpperCase() : h;
  };
  it('hex thường / hoa / trộn hoa thường, mọi độ dài 1–256', () => {
    for (let n = 1; n <= 256; n++) {
      expect(detectCredential(hex(n)), `hex ${n}`).toBeNull();
      expect(detectCredential(hex(n, true)), `HEX ${n}`).toBeNull();
      const mixed = [...hex(n)].map((c, i) => (i % 2 ? c.toUpperCase() : c)).join('');
      expect(detectCredential(mixed), `MiXeD ${n}`).toBeNull();
    }
  });
  it('UUID chuẩn (thường / hoa), mã commit git, sha256, ULID, display_id', () => {
    const cases = [
      '550e8400-e29b-41d4-a716-446655440000',
      '550E8400-E29B-41D4-A716-446655440000',
      'commit 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b đã merge',
      createHash('sha256').update('x').digest('hex'),
      '01JABCDEFGHJKMNPQRSTVWXYZ0',
      'RL-0001 SK-0004 TK-0462 GA-7K2Q-0001',
      `sha256:${createHash('sha256').update('y').digest('hex')}`,
      JSON.stringify({ id: '550e8400-e29b-41d4-a716-446655440000', sha: hex(40) }),
    ];
    for (const c of cases) expect(detectCredential(c), c).toBeNull();
  });
  it('văn bản thường không bị chặn (tiếng Việt, đường dẫn, URL không mật khẩu, số)', () => {
    const cases = [
      'Mai đã gửi báo cáo tuần cho anh lúc 14:00, kèm 3 tệp đính kèm.',
      '/home/user/projects/gen-agents/packages/security/src/index.ts',
      'https://docs.example.com/guide?page=2&lang=vi#muc-3',
      '1234567890 9876543210 3.14159',
      'đổi mật khẩu ở mục Cài đặt › Bảo mật',
    ];
    for (const c of cases) expect(detectCredential(c), c).toBeNull();
  });
  it('chuỗi chỉ chữ thường + số (không có chữ hoa) dài 40 không khớp luật entropy', () => {
    expect(detectCredential('q9x2k7m4n1p8r5t3w6y0z2b4d6f8h0j2l4n6p8r0')).toBeNull();
  });
});

describe('biến thể canary đủ dạng (STD-11: hoa, thường, hex, base64, base64url) + mã hoá thoát', () => {
  const b64 = (s: string) => Buffer.from(s).toString('base64');
  const b64url = (s: string) => Buffer.from(s).toString('base64url');
  const variants: Record<string, string> = {
    hoa: CANARY.toUpperCase(),
    thuong: CANARY.toLowerCase(),
    hex: Buffer.from(CANARY).toString('hex'),
    hexHoa: Buffer.from(CANARY).toString('hex').toUpperCase(),
    hexThuong: Buffer.from(CANARY.toLowerCase()).toString('hex'),
    base64: b64(CANARY),
    base64Lech1: b64(`x${CANARY}`),
    base64Lech2: b64(`xy${CANARY}`),
    base64url: b64url(CANARY),
    base64urlLech1: b64url(`_${CANARY}`),
    base64Thuong: b64(CANARY.toLowerCase()),
    trongChuoiBase64Dai: b64(`log line ${'z'.repeat(40)} ${CANARY} end`),
    percent: CANARY.replace(/-/g, '%2D'),
    percentToanBo: [...CANARY].map((c) => `%${c.charCodeAt(0).toString(16)}`).join(''),
    unicodeEscape: CANARY.replace(/-/g, '\\u002d'),
    hexEscape: CANARY.replace(/A/g, '\\x41'),
    htmlEntity: CANARY.replace(/-/g, '&#45;'),
    htmlEntityHex: CANARY.replace(/-/g, '&#x2d;'),
    zeroWidth: CANARY.split('').join('\u200b'),
    fullwidth: CANARY.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)),
    jsonLong: JSON.stringify(JSON.stringify({ note: CANARY })),
  };
  for (const [name, v] of Object.entries(variants)) {
    it(name, () => {
      expect(detectCredential(wrap(v)), v.slice(0, 80)).not.toBeNull();
      const red = redactText(wrap(v));
      expect(red).toContain('[REDACTED:');
    });
  }
  it('token tiền tố đã biết ở dạng hex / base64 cũng bị bắt (nội dung giải ra là credential)', () => {
    for (const id of ['vendor_api_key_sk_ant', 'google_oauth_access_token', 'google_refresh_token', 'google_api_key']) {
      const s = SAMPLES[id] as string;
      expect(detectCredential(Buffer.from(s).toString('hex')), `${id} hex`).toMatch(/^encoded:/);
      expect(detectCredential(Buffer.from(` ${s}`).toString('base64')), `${id} b64`).not.toBeNull();
    }
  });
  it('JSON lồng trong chuỗi: \\"refresh_token\\": và \\/ (1\\/\\/0…)', () => {
    expect(detectCredential(JSON.stringify({ msg: JSON.stringify({ refresh_token: 'x' }) }))).toBe('credential_field');
    expect(detectCredential((SAMPLES.google_refresh_token as string).replace(/\//g, '\\/'))).toBe(
      'google_refresh_token',
    );
  });
});

describe('gán credential theo tên khoá trên DÒNG THÔ (Gen 2026-10-16, review MEDIUM parser-differential của runner)', () => {
  const v = ['abcd', 'EFGH', '1234', '._~+/=-'].join('');
  it('(a) văn bản thường + JSON nhúng giữa dòng, mọi tên trong bộ tham chiếu, không phân biệt hoa thường, không cần ranh giới', () => {
    const lines = [
      `INFO got {"refresh_token":"${v}"} xong`,
      `client_secret=${v}`,
      `DEBUG body access_token: '${v}' end`,
      `{"ID_TOKEN" : "${v}"}`,
      `cfg private_key=${v}`,
      `xaccess_token=${v}`,
      `valid_token=${v}`,
      `level=info msg="token" Access_Token = ${v}`,
    ];
    for (const line of lines) {
      expect(detectCredential(line), line).toBe('credential_field');
      const out = redactText(line);
      expect(out, line).not.toContain(v);
      expect(out).toContain('[REDACTED:credential_field]');
    }
  });
  it('(b) giải \\uXXXX THẬT, lồng tới 3 lớp, rồi quét lại; dòng JSON sau khi che vẫn hợp lệ', () => {
    // lớp 1: chính chuỗi thoát \u0072; mỗi lớp sau: JSON.stringify thêm một lần (gấp đôi dấu \)
    const layers = [`{"\\u0072efresh_token":"${v}"}`];
    for (let d = 2; d <= 3; d++) layers.push(JSON.stringify(layers[d - 2]));
    layers.forEach((text, i) => {
      const line = `INFO got ${text} xong`;
      expect(detectCredential(line), `${i + 1} lớp`).toBe('credential_field');
      expect(redactText(line), `${i + 1} lớp`).not.toContain(v.slice(0, 8));
    });
    for (const text of layers.slice(0, 2)) {
      const line = JSON.stringify({ level: 30, msg: text });
      const out = redactLogLine(line);
      expect(() => JSON.parse(out)).not.toThrow();
      expect(out).not.toContain(v.slice(0, 8));
      expect(out).toContain('[REDACTED:credential_field]');
    }
    // dạng ví dụ của review: \\u0072efresh_token (2 lớp) và \\\\u0072 (3 lớp) trên dòng thô
    expect(detectCredential(`x \\\\u0072efresh_token\\\\":\\\\"${v}`)).toBe('credential_field');
    expect(detectCredential(`x \\\\\\\\u0072efresh_token: ${v}`)).toBe('credential_field');
    expect(detectCredential('pct %2572efresh_token%253D' + v)).toBe('credential_field');
  });
  it('ca âm (a)/(b): giá trị < 8 ký tự, tên mở rộng thiếu ranh giới, \\u giải ra chữ khác, không có dấu gán', () => {
    for (const s of [
      'access_token=short',
      'client_secret: "1234567"',
      'xpassword=abcdefghijkl',
      '\\u0073efresh_token=abcdefghijk',
      'refresh_token is documented here',
      '\\\\u0072efresh_tokens and more',
    ]) {
      expect(detectCredential(s), s).toBeNull();
    }
  });
});

describe('giới hạn kích thước TRƯỚC khi quét (mặc định chặn)', () => {
  it('chuỗi > SCAN_MAX_CHARS ⇒ too_large, không quét', () => {
    const big = 'a'.repeat(SCAN_MAX_CHARS + 1);
    expect(scanText(big)).toEqual({ status: 'too_large', length: SCAN_MAX_CHARS + 1 });
    expect(detectCredential(big)).toBe('too_large');
    expect(redactText(big)).toBe(`[REDACTED:too_large len=${SCAN_MAX_CHARS + 1}]`);
  });
  it('trần tuỳ chỉnh', () => {
    expect(detectCredential('abc', { maxChars: 2 })).toBe('too_large');
  });
  it('chuẩn hoá áp cho mọi chuỗi tới trần quét (cả dòng log 1 MB)', () => {
    const v = CANARY.replace(/-/g, '%2D');
    const s = `${' '.repeat(SCAN_MAX_CHARS - v.length - 1)}${v}`;
    expect(detectCredential(s)).toBe('canary');
    expect(redactText(s).endsWith('[REDACTED:canary]')).toBe(true);
  });
  it('lũ kim mã hoá (dựng có chủ đích) ⇒ chặn cả chuỗi', () => {
    const needle = Buffer.from('GA-CANARY-').toString('base64').slice(0, 13); // "R0EtQ0FOQVJZL"
    expect(detectCredential(`${needle}xyz `.repeat(400))).toBe('encoded_marker_flood');
  });
});

describe('che log (redactText / redactLogLine / redactValue)', () => {
  it('che đúng đoạn, giữ phần còn lại', () => {
    const s = `user=mai token=${SAMPLES.github_token} xong`;
    const out = redactText(s);
    expect(out).toBe('user=mai token=[REDACTED:github_token] xong');
  });
  it('mọi mẫu: dòng log JSON sau khi che vẫn parse được và không còn bí mật', () => {
    for (const [id, sample] of Object.entries(SAMPLES)) {
      const line = JSON.stringify({ level: 30, msg: `kết quả ${sample}`, nested: JSON.stringify({ v: sample }) });
      const out = redactLogLine(line);
      expect(() => JSON.parse(out), id).not.toThrow();
      const secretCore = id === 'url_userinfo' ? 'Hunter2-Pass' : sample.length > 24 ? sample.slice(-12) : sample;
      if (id !== 'credential_field' && id !== 'pem_private_key') expect(out.includes(secretCore), id).toBe(false);
      expect(out, id).toContain('[REDACTED:');
    }
  });
  it('credential_field: che GIÁ TRỊ, giữ tên khoá (JSON hợp lệ)', () => {
    const value = ['hunter', '2-very-long'].join('');
    const out = redactLogLine(JSON.stringify({ body: `password=${value}&x=1` }));
    expect(out).not.toContain(value);
    expect(JSON.parse(out).body).toBe('password=[REDACTED:credential_field]&x=1');
  });
  it('PEM: che từ BEGIN tới hết END', () => {
    const out = redactText(`a ${SAMPLES.pem_private_key} b`);
    expect(out).toBe('a [REDACTED:pem_private_key] b');
  });
  it('không để lại dấu \\ lẻ cuối đoạn che', () => {
    const s = JSON.stringify({ m: `x ${SAMPLES.high_entropy}\\` });
    expect(() => JSON.parse(redactLogLine(s))).not.toThrow();
  });
  it('dòng log quá trần ⇒ thay bằng dòng JSON báo đã che', () => {
    const out = redactLogLine('x'.repeat(SCAN_MAX_CHARS + 5));
    expect(JSON.parse(out)).toEqual({ redacted: 'too_large', length: SCAN_MAX_CHARS + 5 });
  });
  it('redactValue: khoá nhạy cảm, Error (message + stack), lồng, vòng, Buffer, sâu', () => {
    const err = new Error(`gọi API lỗi với ${SAMPLES.vendor_api_key_sk_ant}`);
    const circ: Record<string, unknown> = { a: 1 };
    circ.self = circ;
    let deep: Record<string, unknown> = { leaf: SAMPLES.jwt };
    for (let i = 0; i < 40; i++) deep = { d: deep };
    const out = redactValue({
      refreshToken: 'anything',
      'Client-Secret': 'x',
      nested: [{ note: `xem ${CANARY}` }],
      err,
      circ,
      buf: Buffer.from('bí mật'),
      deep,
      n: 3,
    }) as Record<string, unknown>;
    const json = JSON.stringify(out);
    expect(out.refreshToken).toBe('[REDACTED:credential_field_name]');
    expect(out['Client-Secret']).toBe('[REDACTED:credential_field_name]');
    expect(json).not.toContain(CANARY);
    expect(json).not.toContain(SAMPLES.vendor_api_key_sk_ant);
    expect(json).toContain('[Circular]');
    expect(json).toContain('[binary');
    expect(json).toContain('[TOO_DEEP]');
    expect(out.n).toBe(3);
  });
});

describe('chặn payload (screenPayload) — kích thước trước, rồi mọi khoá + mọi chuỗi', () => {
  it('payload sạch ⇒ ok', () => {
    expect(screenPayload({ summary: 'Xong TK-0462', items: [{ title: 'Viết bài', n: 2 }], ok: true })).toEqual({
      status: 'ok',
    });
  });
  it('vượt trần ⇒ payload_too_large và KHÔNG quét (dù có credential)', () => {
    const r = screenPayload({ text: `${CANARY}${'a'.repeat(20_000)}` });
    expect(r).toMatchObject({ status: 'denied', code: 'payload_too_large' });
    const deep = JSON.parse(`${'['.repeat(40)}1${']'.repeat(40)}`);
    expect(screenPayload(deep)).toMatchObject({ code: 'payload_too_large' });
    expect(payloadOverLimit(new Array(20_000).fill(1))).not.toBeNull();
    expect(screenPayload({ when: new Date() })).toMatchObject({ code: 'payload_too_large' });
  });
  it('khoá nhạy cảm (mọi kiểu viết) ⇒ chặn bất kể giá trị', () => {
    for (const k of [
      'refresh_token',
      'refreshToken',
      'Refresh-Token',
      'client_secret',
      'apiKey',
      'PASSWORD',
      'authorization',
    ]) {
      expect(isSensitiveKey(k), k).toBe(true);
      expect(screenPayload({ a: [{ [k]: 'v' }] }), k).toMatchObject({
        status: 'denied',
        code: CREDENTIAL_BLOCKED.denialCode,
        patternId: 'credential_field_name',
      });
    }
    for (const k of ['tokenBudget', 'tokens', 'secretId', 'keyboard', 'passage'])
      expect(isSensitiveKey(k), k).toBe(false);
  });
  it('credential trong giá trị lồng sâu / trong mảng / trong TÊN khoá ⇒ chặn, hash là của đoạn khớp', () => {
    const r = screenPayload({ items: [{ x: [1, 2, { note: `xem ${CANARY}` }] }] });
    expect(r).toMatchObject({ status: 'denied', code: 'credential_like_payload', patternId: 'canary' });
    expect((r as { matchSha256: string }).matchSha256).toBe(createHash('sha256').update(CANARY).digest('hex'));
    expect(screenPayload({ [SAMPLES.github_token as string]: 1 })).toMatchObject({ patternId: 'github_token' });
  });
  it('mọi mẫu trong SAMPLES đều bị chặn khi nằm trong payload', () => {
    for (const [id, s] of Object.entries(SAMPLES)) {
      expect(screenPayload({ text: wrap(s) }).status, id).toBe('denied');
    }
  });
  it('audit credential.blocked không mang payload (CNS-169)', () => {
    const r = screenPayload({ text: CANARY });
    if (r.status !== 'denied' || !('patternId' in r)) throw new Error('phải bị chặn');
    const a = credentialBlockedAudit({ tool: 'send_telegram', roleId: 'RL-0001', result: r });
    expect(a).toEqual({
      event: 'credential.blocked',
      severity: 'warning',
      tool: 'send_telegram',
      roleId: 'RL-0001',
      patternId: 'canary',
      matchSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(JSON.stringify(a)).not.toContain(CANARY);
  });
});
