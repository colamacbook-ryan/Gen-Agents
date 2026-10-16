import { describe, expect, it } from 'vitest';
import { DROPPED_LINE_MARKER, RedactingLineWriter } from '../src/lines.ts';
import { credentialInLine, credentialKeyAssignment, MAX_SCAN_CHARS, redactLine } from '../src/redact.ts';

// Mẫu credential dựng LÚC CHẠY từ mảnh ghép (không có chuỗi giống khoá thật trong repo — gitleaks).
const j = (...p: string[]) => p.join('');
const TOKENS: Record<string, string> = {
  anthropic: j('sk-', 'ant-', 'api03-', 'A'.repeat(40)),
  google_access: j('ya', '29.', 'a0AfH6SM', 'C'.repeat(30)),
  google_refresh: j('1/', '/0', 'gD'.repeat(20)),
  google_api_key: j('AI', 'za', 'Sy', 'D'.repeat(33)),
  jwt: j('ey', 'J', 'hbGciOiJIUzI1NiJ9', '.', 'eyJzdWIiOiIxMjM0In0', '.', 'E'.repeat(20)),
  canary_lower: 'GA-CANARY-0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0',
  canary_upper: 'GA-CANARY-0F1E2D3C-4B5A-6978-8796-A5B4C3D2E1F0',
  pem: j('-----BEGIN ', 'RSA PRIVATE KEY-----', 'MIIE', 'x'.repeat(50)),
};

/** Bọc chuỗi vào n lớp chuỗi JSON (mỗi lớp một lần escape). */
function nest(s: string, layers: number): string {
  let out = s;
  for (let i = 0; i < layers; i++) out = JSON.stringify({ msg: out });
  return out;
}

const isMarker = (line: string) => (JSON.parse(line) as { $ga?: string }).$ga === 'line_redacted';

/** Thay CẢ dòng: kết quả là đúng một dòng đánh dấu, không còn mảnh nào của dòng gốc. */
function expectWholeLineReplaced(line: string, secret: string) {
  const out = redactLine(line);
  expect(isMarker(out), line).toBe(true);
  expect(JSON.parse(out)).toEqual({ $ga: 'line_redacted', patternId: expect.stringMatching(/^[a-z0-9_]+$/i) });
  expect(out).not.toContain(secret);
}

describe('redactLine — phát hiện ⇒ thay CẢ dòng (fail-closed, không che từng đoạn)', () => {
  it.each(Object.entries(TOKENS))('token %s trong dòng văn bản thường ⇒ cả dòng bị thay', (_k, tok) => {
    expectWholeLineReplaced(`trước ${tok} sau`, tok.slice(0, 12));
    expect(redactLine(`trước ${tok} sau`)).not.toContain('trước');
  });

  it.each([
    ['giá trị ngắn', '{"refresh_token":"abc"}', 'abc'],
    ['giá trị có khoảng trắng / dấu chấm, có tiền tố', 'INFO {"access_token":"x.y z"}', 'x.y z'],
    ['giá trị có escape \\" ở giữa', '{"refresh_token":"ab\\"cd"}', 'cd'],
    ['giá trị có escape, có tiền tố', 'INFO {"client_secret":"a\\"b c"}', 'b c'],
    ['JSON nhúng escape 1 lớp, giá trị 1 ký tự', 'log: {\\"client_secret\\":\\"v\\"} end', '"v'],
    ['escape unicode \\u0022', 'log {\\u0022refresh_token\\u0022:\\u0022abc\\u0022}', 'abc'],
    ['dấu : dạng \\u003a', 'x "id_token"\\u003a"q"', '"q"'],
    ['nháy đơn (repr Python)', "{'refresh_token': 'abc'}", 'abc'],
    ['tab quanh dấu hai chấm', '{"refresh_token"\t:\t"abc"}', 'abc'],
    ['key=value', 'retry with refresh_token=abc now', 'abc'],
    ['KEY=value chữ hoa', 'REFRESH_TOKEN=xyz other', 'xyz'],
    ['header HTTP trong log', 'GET / x-api-key: k1', 'k1'],
    ['tên khoá có tiền tố', 'new_access_token: q', ': q'],
    ['password ≥ 8 ký tự (bộ chung)', 'login password=hunter2hunter2 ok', 'hunter2'],
  ])('%s ⇒ thay cả dòng', (_n, line, secret) => {
    expect(credentialInLine(line), line).not.toBeNull();
    expectWholeLineReplaced(line, secret);
  });

  const KEYS = ['refresh_token', 'access_token', 'id_token', 'client_secret', 'private_key', 'api_key'];
  it.each(KEYS)('khoá %s, giá trị 1 ký tự, JSON lồng 0/1/2/3 lớp escape ⇒ thay cả dòng', (key) => {
    const inner = JSON.stringify({ [key]: 'v' });
    for (let layers = 0; layers <= 3; layers++) {
      const line = nest(inner, layers);
      expect(credentialInLine(line), `${key} @ ${layers} lớp: ${line}`).not.toBeNull();
      expect(isMarker(redactLine(line))).toBe(true);
    }
  });

  it.each([
    'Rotate your refresh_token regularly',
    'docs: access_token and id_token are described here',
    '{"field":"refresh_token"}',
    '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0', // UUID không bị chặn (CNS-169)
    'deadbeef'.repeat(8), // hex không bị chặn (CNS-169)
    '{"type":"text","text":"xin chào"}',
    'RL-0001 MM-0041 ok',
    'task-runner ask-me',
  ])('dòng sạch / chỉ nhắc tên khoá giữ nguyên: %j', (line) => {
    expect(credentialInLine(line)).toBeNull();
    expect(redactLine(line)).toBe(line);
  });

  it.each(['{"api_key":""}', 'api_key:', 'api_key: ,', 'apikeys: 3', 'x_api_key_count 4'])(
    'rào phép gán: không có giá trị / không phải phép gán ⇒ không bắt: %j',
    (line) => {
      expect(credentialKeyAssignment(line)).toBe(false);
    },
  );

  it('dòng vượt trần quét (> 1 Mi ký tự) ⇒ thay bằng dòng đánh dấu too_large, không quét', () => {
    const line = 'a'.repeat(MAX_SCAN_CHARS + 1);
    expect(credentialInLine(line)).toBe('too_large');
    expect(JSON.parse(redactLine(line))).toEqual({ $ga: 'line_redacted', patternId: 'too_large' });
  });

  it('tuyến tính: 1 MiB chuỗi đối kháng mỗi mẫu < 1 s (cả rào phép gán)', () => {
    const n = MAX_SCAN_CHARS;
    const attacks = [
      'xsk-'.repeat(n / 4),
      '\\'.repeat(n),
      '\\"'.repeat(n / 2),
      'eyJaaaaaaaa.'.repeat(Math.floor(n / 12)),
      '-----BEGIN '.repeat(Math.floor(n / 11)),
      'refresh_token '.repeat(Math.floor(n / 14)),
      'refresh_token\\u0022'.repeat(Math.floor(n / 19)),
      `access_token${'\\u0020'.repeat(10)}`.repeat(Math.floor(n / 72)),
      'api_key:'.repeat(n / 8),
      '['.repeat(n / 2) + ']'.repeat(n / 2),
      JSON.stringify({ a: '{"b":"{\\"c\\":1}"}'.repeat(Math.floor(n / 40)) }),
      `"${'{\\"x\\":'.repeat(Math.floor(n / 10))}"`,
    ];
    for (const a of attacks) {
      const line = a.slice(0, MAX_SCAN_CHARS);
      const t0 = performance.now();
      redactLine(line);
      credentialKeyAssignment(line);
      expect(performance.now() - t0, a.slice(0, 20)).toBeLessThan(1000);
    }
  });
});

describe('RedactingLineWriter — che theo DÒNG hoàn chỉnh', () => {
  it('token bị cắt giữa hai khúc vẫn được che (che sau khi ráp dòng)', () => {
    let out = '';
    const w = new RedactingLineWriter((s) => {
      out += s;
    });
    const s = TOKENS.anthropic as string;
    w.push(Buffer.from(`a ${s.slice(0, 10)}`));
    w.push(Buffer.from(`${s.slice(10)} b\nc`));
    w.end();
    const lines = out.split('\n');
    expect(isMarker(lines[0] as string)).toBe(true);
    expect(lines[1]).toBe('c');
    expect(out).not.toContain(s.slice(0, 12));
  });

  it('UTF-8 nhiều byte cắt giữa khúc không vỡ', () => {
    let out = '';
    const w = new RedactingLineWriter((s) => {
      out += s;
    });
    const b = Buffer.from('xin chào\n');
    w.push(b.subarray(0, 7));
    w.push(b.subarray(7));
    w.end();
    expect(out).toBe('xin chào\n');
  });

  it('dòng vượt trần bị BỎ (không cắt đôi), dòng sau vẫn đi tiếp', () => {
    let out = '';
    const w = new RedactingLineWriter((s) => {
      out += s;
    }, 100);
    w.push(`${'x'.repeat(60)}`);
    w.push(`${'y'.repeat(60)}${TOKENS.anthropic}\nok\n`);
    w.end();
    expect(out).toBe(`${DROPPED_LINE_MARKER}\nok\n`);
  });

  it('kết quả che DÀI hơn trần ⇒ bỏ cả dòng (không phá giao thức stdout)', () => {
    let out = '';
    const w = new RedactingLineWriter((s) => {
      out += s;
    }, 40);
    // `password=<8 ký tự>` (17 ≤ 40) ⇒ dòng đánh dấu (> 40)
    const line = 'password=hunter2h';
    expect(line.length).toBeLessThanOrEqual(40);
    expect(redactLine(line).length).toBeGreaterThan(40);
    w.push(`${line}\nok\n`);
    w.end();
    expect(out).toBe(`${DROPPED_LINE_MARKER}\nok\n`);
  });
});
