// Bộ phát hiện credential dùng chung (CNS-133, CNS-169, STD-11): mỗi lối vào một ca thuận + ca âm; biến thể mã hoá;
// ca KHÔNG chặn có chủ đích (hex thuần, UUID); che log giữ JSON hợp lệ.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  CREDENTIAL_DETECTORS,
  CREDENTIAL_KEY_NAMES,
  CREDENTIAL_PATTERN_IDS,
  credentialBlockedAudit,
} from '@ga/contracts';
import { describe, expect, it } from 'vitest';
import {
  auditPatternId,
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
import { B64_ALPHABET, base64Secrets, CANARY, JS_SPACES, SAMPLES, URL_PASSWORD, urlCorpus } from './helpers.ts';

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
    aws_access_key_id: ['AKIA1234', 'XAKIATESTONLY2345ABCD', 'AKIAtestonly2345abcd'],
    telegram_bot_token: ['12345:AAshort', '12345678901234:aabcdefghijklmnopqrstuvwxyzabcdefghijkl', 'giờ 10:30 sáng'],
    pem_private_key: ['-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----', '-----BEGIN CERTIFICATE-----'],
    credential_assignment: [
      'Bạn đổi password: ở trang cài đặt',
      'token: ok',
      'api_key field is required',
      'access_token',
    ],
    bearer_token: ['the bearer of this note', 'Bearer short'],
    url_userinfo: [
      'https://git.example.com/repo.git',
      'mailto:user@example.com',
      'https://user@host.example.com/',
      'mailto:a:b@c',
      'urn:x:y@z',
      'https://u@h',
      'ws: lúc 10:30 gửi a@b',
      'xem http://a.example/c lúc 10:30 x@y',
    ],
    env_secret_assignment: [
      'MY_TOKEN_COUNT=5',
      'TOKEN=abcdefghij',
      'the_key is here',
      'API_KEY =',
      'MAX_TOKENS=4096',
      'MAX_TOKEN=4096',
    ],
    canary: ['GA-CANARY-', 'GA-CANARY-xyz', 'GA CANARY 3f2b9c1e'],
    high_entropy_run: [
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
    expect(detectCredential(JSON.stringify({ msg: JSON.stringify({ refresh_token: 'x' }) }))).toBe(
      'refresh_token_field',
    );
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
      expect(['credential_assignment', 'refresh_token_field'], line).toContain(detectCredential(line));
      const out = redactText(line);
      expect(out, line).not.toContain(v);
      expect(out).toMatch(/\[REDACTED:(credential_assignment|refresh_token_field)\]/);
    }
  });
  it('(b) giải \\uXXXX THẬT, lồng tới 3 lớp, rồi quét lại; dòng JSON sau khi che vẫn hợp lệ', () => {
    // lớp 1: chính chuỗi thoát \u0072; mỗi lớp sau: JSON.stringify thêm một lần (gấp đôi dấu \)
    const layers = [`{"\\u0072efresh_token":"${v}"}`];
    for (let d = 2; d <= 3; d++) layers.push(JSON.stringify(layers[d - 2]));
    layers.forEach((text, i) => {
      const line = `INFO got ${text} xong`;
      expect(detectCredential(line), `${i + 1} lớp`).toBe('refresh_token_field');
      expect(redactText(line), `${i + 1} lớp`).not.toContain(v.slice(0, 8));
    });
    for (const text of layers.slice(0, 2)) {
      const line = JSON.stringify({ level: 30, msg: text });
      const out = redactLogLine(line);
      expect(() => JSON.parse(out)).not.toThrow();
      expect(out).not.toContain(v.slice(0, 8));
      expect(out).toContain('[REDACTED:refresh_token_field]');
    }
    // dạng ví dụ của review: \\u0072efresh_token (2 lớp) và \\\\u0072 (3 lớp) trên dòng thô
    expect(detectCredential(`x \\\\u0072efresh_token\\\\":\\\\"${v}`)).toBe('refresh_token_field');
    expect(detectCredential(`x \\\\\\\\u0072efresh_token: ${v}`)).toBe('refresh_token_field');
    expect(detectCredential(`pct %2572efresh_token%253D${v}`)).toBe('refresh_token_field');
  });
  it('ca âm (a)/(b): tên mở rộng thiếu ranh giới, \\u giải ra chữ khác, không có dấu gán', () => {
    // giá trị < 8 ký tự với tên credential của contracts (`access_token=short`) NAY bị bắt bởi credential_field_name
    expect(detectCredential('access_token=short')).toBe('credential_field_name');
    expect(detectCredential('client_secret: "1234567"')).toBe('credential_field_name');
    // `password` / `passwd` là tên credential của contracts (3af4e6a): khớp MỌI vị trí như tham chiếu, giá trị ≥ 8
    expect(detectCredential('xpassword=abcdefghijkl')).toBe('credential_assignment');
    for (const s of [
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
      if (!['refresh_token_field', 'pem_private_key', 'env_secret_assignment'].includes(id)) {
        expect(out.includes(secretCore), id).toBe(false);
      }
      expect(out, id).toContain('[REDACTED:');
    }
  });
  it('credential_assignment: che GIÁ TRỊ, giữ tên khoá (JSON hợp lệ)', () => {
    const value = ['hunter', '2-very-long'].join('');
    const out = redactLogLine(JSON.stringify({ body: `password=${value}&x=1` }));
    expect(out).not.toContain(value);
    expect(JSON.parse(out).body).toBe('password=[REDACTED:credential_assignment]&x=1');
  });
  it('PEM: che từ BEGIN tới hết END', () => {
    const out = redactText(`a ${SAMPLES.pem_private_key} b`);
    expect(out).toBe('a [REDACTED:pem_private_key] b');
  });
  it('không để lại dấu \\ lẻ cuối đoạn che', () => {
    const s = JSON.stringify({ m: `x ${SAMPLES.high_entropy_run}\\` });
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
    const variants = CREDENTIAL_KEY_NAMES.flatMap((n) => [
      n,
      n.toUpperCase(),
      n.replace(/[_-]/g, ''),
      n.replace(/_/g, '-'),
    ]);
    for (const k of [...variants, 'refreshToken', 'apiKey', 'PASSWORD', 'authorization', 'Set-Cookie']) {
      expect(isSensitiveKey(k), k).toBe(true);
      expect(screenPayload({ a: [{ [k]: 'v' }] }), k).toMatchObject({
        status: 'denied',
        code: 'credential_like_payload',
        patternId: 'credential_field_name',
      });
    }
    for (const k of ['tokenBudget', 'tokens', 'secretId', 'keyboard', 'passage'])
      expect(isSensitiveKey(k), k).toBe(false);
  });
  it('credential trong giá trị lồng sâu / trong mảng / trong TÊN khoá ⇒ chặn, hash là của đoạn khớp', () => {
    const r = screenPayload({ items: [{ x: [1, 2, { note: `xem ${CANARY}` }] }] });
    expect(r).toEqual({
      status: 'denied',
      code: 'credential_like_payload',
      patternId: 'canary',
      auditPatternId: 'canary',
    });
    expect(JSON.stringify(r)).not.toContain(CANARY.slice(10));
    expect(screenPayload({ [SAMPLES.github_token as string]: 1 })).toMatchObject({ patternId: 'github_token' });
  });
  it('mọi mẫu trong SAMPLES đều bị chặn khi nằm trong payload', () => {
    for (const [id, s] of Object.entries(SAMPLES)) {
      expect(screenPayload({ text: wrap(s) }).status, id).toBe('denied');
    }
  });
  it('audit credential.blocked dựng bằng hàm của contracts từ auditPatternId — không mang payload (CNS-169)', () => {
    const r = screenPayload({ text: CANARY });
    if (r.status !== 'denied' || !('auditPatternId' in r)) throw new Error('phải bị chặn');
    const a = credentialBlockedAudit('send_telegram', r.auditPatternId);
    expect(a).toMatchObject({
      action: 'credential.blocked',
      result: 'denied',
      severity: 'warn',
      tool: 'send_telegram',
    });
    expect(a.detail).toEqual({ patternId: 'canary', tool: 'send_telegram' });
    expect(JSON.stringify(a)).not.toContain(CANARY);
  });
  it('mọi id mẫu của bộ dùng chung (kể cả encoded:*) ánh xạ được sang CREDENTIAL_PATTERN_IDS của contracts', () => {
    for (const id of [...DETECTOR_IDS, 'encoded_marker_flood', 'too_large', 'credential_field_name']) {
      expect(CREDENTIAL_PATTERN_IDS, id).toContain(auditPatternId(id));
      expect(CREDENTIAL_PATTERN_IDS).toContain(auditPatternId(`encoded:${id}`));
    }
    for (const id of DETECTOR_IDS.filter((x) => (CREDENTIAL_PATTERN_IDS as readonly string[]).includes(x))) {
      expect(auditPatternId(id)).toBe(id);
    }
  });
});

describe('sửa sau review MEDIUM (2026-10-16)', () => {
  it('URL userinfo: tên rỗng vẫn che mật khẩu; có tên che mật khẩu; chỉ tên thì không che', () => {
    const pw = ['s3', 'cret-pw'].join('');
    expect(redactText(`clone https://:${pw}@git.example.com/r.git`)).toBe(
      'clone https://:[REDACTED:url_userinfo]@git.example.com/r.git',
    );
    expect(redactText(`https://u:${pw}@h.example.com`)).toBe('https://u:[REDACTED:url_userinfo]@h.example.com');
    expect(redactText('https://u@h.example.com')).toBe('https://u@h.example.com');
    expect(detectCredential('https://u@h.example.com')).toBeNull();
  });
  it('AKIA / ASIA: bắt cả khi chữ / số dính liền phía sau (như tham chiếu `\\b(?:AKIA|ASIA)[0-9A-Z]{16}`); che hết đoạn', () => {
    const k = ['AK', 'IA', 'TESTONLY2345ABCD'].join('');
    for (const s of [k, `${k}EXTRA`, `${k}9`, `x ${k}xyz`, `_${k}`, ['AS', 'IA', 'TESTONLY2345ABCD', 'Q'].join('')]) {
      expect(detectCredential(s), s).toBe('aws_access_key_id');
    }
    expect(redactText(`id=${k}EXTRA end`)).toBe('id=[REDACTED:aws_access_key_id] end');
  });
  it('tên khoá từ contracts CREDENTIAL_KEY_NAMES: gán trong văn bản ⇒ bắt, mọi vị trí, mọi tên trong danh sách', () => {
    for (const n of CREDENTIAL_KEY_NAMES) {
      for (const line of [`${n}=abcd1234XYZ`, `x${n}: "abcd1234XYZ"`, `{"${n.toUpperCase()}":"abcd1234XYZ"}`]) {
        expect(detectCredential(line), line).not.toBeNull();
        expect(redactText(line), line).not.toContain('abcd1234XYZ');
      }
    }
  });
  it('env_secret_assignment khớp contracts: …_SECRET/TOKEN/PASSWORD/KEY/PAT = giá trị ≥ 8 ký tự; cấu hình ngắn KHÔNG chặn', () => {
    for (const s of [
      'DB_PASSWORD=hunter2024',
      'export GITHUB_PAT=abcd1234',
      'AWS_SECRET_ACCESS_KEY="zzzzzzzz"',
      'JWT_SIGNING_KEY = k1k2k3k4k5',
      "X_TOKEN: 'abcdefgh'",
      'x_SECRET=abcdefgh',
    ]) {
      expect(detectCredential(s), s).not.toBeNull();
    }
    expect(redactText('MY_APP_PAT=hunter2024 next')).toBe('MY_APP_PAT=[REDACTED:env_secret_assignment] next');
    expect(redactText('DB_PASSWORD=hunter2024 next')).not.toContain('hunter2024');
    // ca âm có chủ đích (Gen 2026-10-16): cấu hình bình thường, giá trị < 8 ký tự, hậu tố chữ thường, không có giá trị
    for (const s of [
      'MAX_TOKEN=4096',
      'MAX_TOKENS=4096',
      'DB_PASSWORD=hunter2',
      'X_TOKEN="',
      'API_KEY =',
      'app_secret: abcdefghij',
      'primary_key: id',
    ]) {
      expect(detectCredential(s), s).toBeNull();
    }
  });
});

describe('URL userinfo — xấp xỉ TRÊN của parser URL (thuật toán chung với contracts, Gen 2026-10-16)', () => {
  const P = URL_PASSWORD;
  it('ca security review: scheme dính chữ phía trước, không gạch / nhiều gạch, `\\` thay `/`, TAB / LF / CR chen giữa', () => {
    for (const s of [
      `1.https://u:${P}@h`,
      `x.ftp://u:${P}@h`,
      `https:\\\\u:${P}@h`,
      `https:u:${P}@h`,
      `https:///u:${P}@h`,
      `HtTpS:/\\u:${P}@h`,
      `ht\ttps:/\n/u:${P}@h/x`,
      `wss:u:${P}@h`,
      `FILE://u:${P}@h`,
      `foo://u:${P}@h`,
      `https://:${P}@h`,
      `https://u@x:${P}@h`,
    ]) {
      expect(detectCredential(s), JSON.stringify(s)).toBe('url_userinfo');
      expect(redactText(`clone ${s} xong`), JSON.stringify(s)).not.toContain(P);
    }
    expect(redactText(`clone https:u:${P}@h.example.com/r xong`)).toBe(
      'clone https:u:[REDACTED:url_userinfo]@h.example.com/r xong',
    );
  });
  it('ca âm: mailto:, urn:, chỉ tên đăng nhập, scheme khác không có `//`, câu thường có giờ + email', () => {
    for (const s of [
      'mailto:a:b@c',
      'urn:x:y@z',
      'https://u@h',
      'redis:u:p@h',
      'ws: lúc 10:30 gửi a@b',
      'xem http://a/b 1:2 c@d',
    ]) {
      expect(detectCredential(s), s).toBeNull();
      expect(redactText(s)).toBe(s);
    }
  });
  it('mật khẩu rỗng (`u:@h`): vẫn báo như contracts, đoạn che rỗng nên chuỗi che giữ nguyên', () => {
    expect(detectCredential('https://u:@h')).toBe('url_userinfo');
    expect(redactText('https://u:@h')).toBe('https://u:@h');
    // xấp xỉ trên có chủ đích: tên scheme khớp ở BẤT KỲ đâu (`news:` kết thúc bằng `ws:`) ⇒ chặn nhầm hiếm, không lọt
    expect(detectCredential('news:comp.lang:x@y')).toBe('url_userinfo');
  });
  it('corpus đối chiếu new URL(): mọi chuỗi có URL.password ≠ "" đều bị bắt và che — đứng riêng lẫn nằm giữa câu', () => {
    let parsed = 0;
    let withPassword = 0;
    const misses: string[] = [];
    for (const s of urlCorpus()) {
      let password: string;
      try {
        password = new URL(s).password;
      } catch {
        continue; // không phải URL hợp lệ với parser ⇒ ngoài phạm vi so sánh
      }
      parsed++;
      if (password === '') continue;
      withPassword++;
      for (const t of [s, `log ${s} end`]) {
        const red = redactText(t);
        if (detectCredential(t) === null || red === t || (t.includes(P) && red.includes(P))) {
          misses.push(`${JSON.stringify(t)} ⇒ ${JSON.stringify(red)} (password ${JSON.stringify(password)})`);
        }
      }
    }
    console.info(`URL corpus: parse được ${parsed}, có password ${withPassword}, lọt ${misses.length}`);
    expect(misses.slice(0, 20)).toEqual([]);
    expect(withPassword).toBeGreaterThan(5000);
  });
});

describe('khoảng trắng Unicode = đúng `\\s` của regex (review MEDIUM parser-differential)', () => {
  const unicode = JS_SPACES.filter((ch) => ch.charCodeAt(0) > 0x7f);
  it('tập `\\s` lấy từ engine có đủ NBSP, U+2000–U+200A, U+3000, U+FEFF', () => {
    for (const c of [0xa0, 0x2000, 0x2005, 0x200a, 0x3000, 0xfeff]) expect(JS_SPACES).toContain(String.fromCharCode(c));
  });
  it('mọi ký tự `\\s` làm dấu phân cách quanh dấu gán: bắt + che đúng giá trị', () => {
    const v = 'abcDEF123456';
    for (const sp of JS_SPACES) {
      for (const line of [
        `refresh_token:${sp}"${v}"`,
        `refresh_token${sp}=${sp}${v}`,
        `client_secret${sp}=${sp}${v}`,
        `{"api_key"${sp}:${sp}"${v}"}`,
        `access_token${sp}:${sp}${v} next`,
        `Authorization:${sp}${v}`,
        `DB_PASSWORD${sp}=${sp}${v}`,
      ]) {
        const tag = `${line.replace(sp, `<U+${sp.charCodeAt(0).toString(16)}>`)}`;
        expect(detectCredential(line), tag).not.toBeNull();
        expect(redactText(line), tag).not.toContain(v);
      }
    }
  });
  it('chuẩn hoá gập khoảng trắng Unicode thành space: `Bearer<NBSP>`, `Authorization: Bearer<U+3000>` vẫn bắt', () => {
    const v = 'abcDEF123456xyzQ7';
    for (const sp of unicode) {
      for (const line of [`Authorization: Bearer${sp}${v}`, `curl -H "Bearer${sp}${v}"`]) {
        expect(detectCredential(line), line).not.toBeNull();
        expect(redactText(line), line).not.toContain(v);
      }
    }
  });
  it('fail-closed: regex đã khớp mà bước xác nhận bằng code không chắc ⇒ vẫn báo, che cả đoạn (trước đây lọt)', () => {
    // `Authorization: <10 chữ> <từ ngắn>`: regex lấy 10 chữ làm giá trị, code tưởng là từ chỉ lược đồ ("Basic ") rồi thấy
    // giá trị ngắn ⇒ bản cũ `continue` (lọt)
    for (const line of ['Authorization: abcdefghij klm', 'authorization=Zyxwvuts q']) {
      expect(detectCredential(line), line).toBe('credential_assignment');
      expect(redactText(line), line).not.toMatch(/abcdefghij|Zyxwvuts/);
    }
  });
});

describe('tên credential mọi kiểu viết + base64_secret_run (contracts 0a2bfff, một nguồn với contracts)', () => {
  /** Các kiểu viết của một tên snake / kebab: camel, Pascal, kebab, UPPER, gạch kép, lẫn `_-`. */
  const spellings = (name: string): string[] => {
    const parts = name.split(/[_-]/);
    const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
    return [
      name,
      parts.map((w, i) => (i === 0 ? w : cap(w))).join(''),
      parts.map(cap).join(''),
      parts.join('-'),
      parts.join('_').toUpperCase(),
      parts.join('__'),
      parts.join('-_-'),
    ];
  };
  const value = ['abcd', '1234', 'XYZ'].join('');
  it('gán trong văn bản: mọi kiểu viết của mọi tên contracts (kể cả api_secret / api_token) ⇒ bắt + che giá trị', () => {
    expect(CREDENTIAL_KEY_NAMES).toEqual(expect.arrayContaining(['api_secret', 'api_token']));
    for (const name of CREDENTIAL_KEY_NAMES) {
      for (const n of spellings(name)) {
        for (const line of [`${n}=${value}`, `x${n}: "${value}"`, `{"${n}":"${value}"}`]) {
          expect(detectCredential(line), line).not.toBeNull();
          expect(redactText(line), line).not.toContain(value);
        }
      }
    }
  });
  it('refresh_token mọi kiểu viết + phép gán ⇒ refresh_token_field (bất kể giá trị)', () => {
    for (const n of spellings('refresh_token')) {
      expect(detectCredential(`${n}: ""`), n).toBe('refresh_token_field');
      expect(detectCredential(`"${n}"=x`), n).toBe('refresh_token_field');
    }
  });
  it('khoá object: chuẩn hoá bằng normalizeCredentialName của contracts — mọi kiểu viết ⇒ chặn + che', () => {
    for (const name of [...CREDENTIAL_KEY_NAMES, 'password', 'set-cookie']) {
      for (const n of spellings(name)) {
        expect(isSensitiveKey(n), n).toBe(true);
        expect(screenPayload({ data: { [n]: 'x' } }), n).toMatchObject({ code: 'credential_like_payload' });
        expect(JSON.stringify(redactValue({ [n]: value })), n).not.toContain(value);
      }
    }
    for (const k of ['token_count', 'keyboard', 'api', 'refresh', 'secretary'])
      expect(isSensitiveKey(k), k).toBe(false);
  });
  it('base64_secret_run: mọi secret base64 40 ký tự có + / mà contracts bắt thì bộ chung bắt; che cả đoạn', () => {
    const contractsB64 = CREDENTIAL_DETECTORS.find((d) => d.id === 'base64_secret_run') as {
      test: (s: string) => boolean;
    };
    let theirs = 0;
    let ours = 0;
    const misses: string[] = [];
    for (const v of base64Secrets(2000)) {
      const line = `k ${v} `;
      const hitOurs = detectCredential(line) !== null;
      if (contractsB64.test(line)) {
        theirs++;
        if (!hitOurs) misses.push(v);
      }
      if (hitOurs) ours++;
    }
    expect(misses).toEqual([]);
    expect(ours / 2000).toBeGreaterThanOrEqual(0.99);
    expect(theirs).toBeGreaterThan(1900);
    expect(detectCredential(SAMPLES.base64_secret_run as string)).toBe('base64_secret_run');
    expect(redactText(`secret ${SAMPLES.base64_secret_run} end`)).toBe('secret [REDACTED:base64_secret_run] end');
  });
  it('base64_secret_run ca âm: base64 ngắn (< 40), hex / UUID, đường tệp + URL GitHub / raw của repo này', () => {
    // base64 36 ký tự có + / (như contracts `b64(36)`): đoạn < 40 ⇒ không bắt
    const short = Array.from({ length: 36 }, (_, i) =>
      i === 7 ? '/' : i === 19 ? '+' : B64_ALPHABET[(i * 37 + 5) % 64],
    ).join('');
    expect(detectCredential(`v=${short}`)).toBeNull();
    const root = fileURLToPath(new URL('../../../', import.meta.url));
    const files = execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
    const sha = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b';
    const samples = files.flatMap((f) => [
      f,
      `/home/user/gen-agents/${f}`,
      `https://github.com/example-org/gen-agents/blob/${sha}/${f}`,
      `https://raw.githubusercontent.com/example-org/gen-agents/${sha}/${f}?plain=1#L10-L20`,
    ]);
    expect(samples.length).toBeGreaterThan(200);
    expect(samples.filter((x) => detectCredential(x) !== null)).toEqual([]);
  });
});

describe('khoá object: chuẩn hoá CHẶT (review MEDIUM — hồi quy khi chỉ bỏ `_` / `-`)', () => {
  const fullwidth = (s: string) => [...s].map((c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)).join('');
  const NBSP = String.fromCharCode(0xa0);
  const keys = [
    'api key',
    'api.key',
    'api:key',
    'api_key ',
    ' api_key',
    `api_key${NBSP}`,
    'Refresh.Token',
    'client secret',
    'x:api:key',
    'pass word',
    fullwidth('api_key'),
    fullwidth('password'),
    `${fullwidth('Access')}_token`,
  ];
  it('khoá có dấu cách, `.`, `:`, khoảng trắng cuối, fullwidth ⇒ vẫn là khoá nhạy cảm', () => {
    for (const k of keys) {
      expect(isSensitiveKey(k), JSON.stringify(k)).toBe(true);
      expect(screenPayload({ data: { [k]: 'x' } }), JSON.stringify(k)).toMatchObject({
        code: 'credential_like_payload',
        patternId: 'credential_field_name',
      });
      expect(JSON.stringify(redactValue({ [k]: 'v4lue-x' })), JSON.stringify(k)).not.toContain('v4lue-x');
    }
  });
  it('khoá thường không bị coi là nhạy cảm', () => {
    for (const k of ['token count', 'keyboard', 'api', 'secretary', 'my.key.id', 'passport']) {
      expect(isSensitiveKey(k), k).toBe(false);
    }
  });
});

describe('phép gán khoá credential, giá trị NGẮN (credential_field_name — runner bỏ rào riêng, L-RT 2026-10-16)', () => {
  const nest = (s: string, layers: number) => {
    let out = s;
    for (let i = 0; i < layers; i++) out = JSON.stringify({ msg: out });
    return out;
  };
  const KEYS = ['refresh_token', 'access_token', 'id_token', 'client_secret', 'private_key', 'api_key', 'api_token'];
  it('khoá JSON có nháy, `name=…`, `name: …`, giá trị 1 ký tự; JSON lồng 0–3 lớp ⇒ bắt', () => {
    for (const key of KEYS) {
      for (let layers = 0; layers <= 3; layers++) {
        const line = nest(JSON.stringify({ [key]: 'v' }), layers);
        expect(detectCredential(line), `${key} @ ${layers} lớp: ${line}`).not.toBeNull();
      }
      for (const line of [`${key}=v`, `${key}: v`, `'${key}': 'v'`, `x.${key}=ab`, `${key.toUpperCase()}: 1`]) {
        expect(detectCredential(line), line).not.toBeNull();
      }
    }
  });
  it('chữ trong tên khoá viết `\\uXXXX` (tổng ≤ 3 lớp giải) ⇒ bắt', () => {
    for (let layers = 0; layers <= 2; layers++) {
      for (const inner of ['{"\\u0061ccess_token":"v"}', '{"api\\u005fkey":"v"}', '{"\\u0049D_TOKEN":"v"}']) {
        const line = nest(inner, layers);
        expect(detectCredential(line), line).not.toBeNull();
      }
    }
  });
  it('che đúng giá trị (giá trị có nháy ⇒ tới nháy đóng, kể cả có dấu cách), JSON vẫn hợp lệ', () => {
    expect(redactText('INFO {"access_token":"x.y z"}')).toBe(
      'INFO {"access_token":"[REDACTED:credential_field_name]"}',
    );
    expect(redactText("{'client_secret': 'ab'}")).toBe("{'client_secret': '[REDACTED:credential_field_name]'}");
    expect(redactText('api_key=v&x=1')).toBe('api_key=[REDACTED:credential_field_name]&x=1');
    const line = redactLogLine(JSON.stringify({ msg: JSON.stringify({ id_token: 'a b' }) }));
    expect(JSON.parse(JSON.parse(line).msg)).toEqual({ id_token: '[REDACTED:credential_field_name]' });
  });
  it('ca âm: không có giá trị, khoá chỉ CHỨA tên credential, chỉ nhắc tên, null / true / false', () => {
    for (const line of [
      '{"api_key":""}',
      "{'api_key': ''}",
      'api_key:',
      'api_key: ,',
      'apikeys: 3',
      'x_api_key_count 4',
      'MAX_TOKEN=4096',
      'MAX_TOKENS=4096',
      'my_access_token=x',
      'access_token_count: 2',
      '{"access_token": null}',
      '{"id_token":false}',
      'Rotate your refresh_token regularly',
      'docs: access_token and id_token are described here',
      '{"field":"refresh_token"}',
      'task-runner ask-me',
    ]) {
      expect(detectCredential(line), line).toBeNull();
    }
  });
});

describe('contracts fd1fd84 / 3af4e6a: password / passwd, NFKC, trần độ dài tên (không ném RangeError)', () => {
  it('password / passwd: khoá object, phép gán giá trị ≥ 8 ⇒ bắt; câu văn / giá trị ngắn ⇒ không (như contracts)', () => {
    const v = ['pAsS', '1w0rD', 'pAsS'].join('');
    expect(screenPayload({ password: 'x' })).toMatchObject({ patternId: 'credential_field_name' });
    expect(screenPayload({ Passwd: v })).toMatchObject({ patternId: 'credential_field_name' });
    for (const s of [`password=${v}`, `"password": "${v}"`, `login with passwd: '${v}'`]) {
      expect(detectCredential(s), s).not.toBeNull();
      expect(redactText(s), s).not.toContain(v);
    }
    for (const s of [
      'Quên password? Bấm "Đặt lại mật khẩu"',
      'password: tối thiểu 12 ký tự',
      'Đổi password mỗi 90 ngày, không dùng lại passwd cũ',
      'the password field is required',
      'password=****',
      'password = short',
    ]) {
      expect(detectCredential(s), s).toBeNull();
    }
  });
  it('NFKC: tên credential viết fullwidth trong chuỗi > 64 Ki ký tự, chữ khoanh tròn ⇒ vẫn bắt (che cả chuỗi)', () => {
    const fw = (t: string) => [...t].map((c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)).join('');
    const circledA = String.fromCharCode(0x24d0);
    const value = ['abcd', '1234', 'XYZ'].join('');
    const big = `${'văn bản thường '.repeat(5000)}${fw('api_key')}=${value} hết`;
    expect(big.length).toBeGreaterThan(65_536);
    expect(detectCredential(big)).not.toBeNull();
    expect(redactText(big)).not.toContain(value);
    const circled = `log ${circledA}ccess_token=${value}`;
    expect(detectCredential(circled)).not.toBeNull();
    expect(redactText(circled)).not.toContain(value);
  });
  it('khoá / tên dài quá trần: không ném lỗi, coi là nhạy cảm (fail-closed)', () => {
    const hugeKey = `api${'_'.repeat(20_000)}key`;
    expect(isSensitiveKey(hugeKey)).toBe(true);
    expect(isSensitiveKey('x'.repeat(20_000))).toBe(true);
    expect(() => redactValue({ [hugeKey]: 'v4lue-x' })).not.toThrow();
    expect(JSON.stringify(redactValue({ [hugeKey]: 'v4lue-x' }))).not.toContain('v4lue-x');
    expect(() => detectCredential(`${hugeKey}=v`)).not.toThrow();
    expect(detectCredential(`${hugeKey}=v`)).not.toBeNull();
    expect(() => redactText(`${hugeKey}: v ${'refresh_token '.repeat(10)}`)).not.toThrow();
  });
});

describe('bản NFKC (security review MEDIUM ×2): khớp ⇒ che cả chuỗi; NFKC vượt trần ⇒ too_large, không quét', () => {
  const fw = (t: string) => [...t].map((c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)).join('');
  const FDFA = String.fromCharCode(0xfdfa);
  it('credential A dạng ASCII + credential B CÙNG id chỉ lộ sau NFKC (fullwidth) ⇒ B cũng bị che (cả chuỗi)', () => {
    const a = ['abcd', '1234', 'XYZ'].join('');
    const b = ['QWERTY', '98765z'].join('');
    for (const pad of [0, 70_000]) {
      const line = `${'x '.repeat(pad / 2)}api_key=${a} ${fw('api_key')}=${b} hết`;
      expect(detectCredential(line)).not.toBeNull();
      const out = redactText(line);
      expect(out, `pad ${pad}`).not.toContain(a);
      expect(out, `pad ${pad}`).not.toContain(b);
    }
    // chỉ có B (fullwidth) trong chuỗi > 64 Ki ký tự ⇒ detectCredential báo ngay khớp của bản NFKC
    expect(detectCredential(`${'y '.repeat(40_000)}${fw('client_secret')}=${b}`)).toBe('credential_assignment');
  });
  it('100 Ki ký tự U+FDFA (NFKC ×18 > trần) ⇒ too_large, không quét, < 250 ms', () => {
    const s = FDFA.repeat(100_000);
    const t0 = performance.now();
    expect(detectCredential(s)).toBe('too_large');
    expect(scanText(s)).toEqual({ status: 'too_large', length: 100_000 });
    expect(redactText(s)).toBe('[REDACTED:too_large len=100000]');
    expect(performance.now() - t0).toBeLessThan(250);
  });
  it('NFKC trong trần vẫn quét bình thường; tiếng Việt 1 MiB (NFKC không đổi) không thành too_large', () => {
    const v = ['abcd', '1234', 'XYZ'].join('');
    expect(detectCredential(`${FDFA.repeat(50_000)} api_key=${v}`)).toBe('credential_assignment');
    const viet = 'Xin chào, đây là một câu tiếng Việt bình thường lúc 14:00. '.repeat(18_000).slice(0, SCAN_MAX_CHARS);
    expect(detectCredential(viet)).toBeNull();
    expect(redactText(viet)).toBe(viet);
  });
});
