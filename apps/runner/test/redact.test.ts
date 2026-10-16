import { describe, expect, it } from 'vitest';
import { DROPPED_LINE_MARKER, RedactingLineWriter } from '../src/lines.ts';
import { credentialInLine, MAX_SCAN_CHARS, redactLine } from '../src/redact.ts';

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
const SECRET = 'hunter2hunter2'; // giá trị ≥ 8 ký tự (bộ chung đòi cho tên khoá mở rộng)

/** Bọc chuỗi vào n lớp chuỗi JSON (mỗi lớp một lần escape). */
function nest(s: string, layers: number): string {
  let out = s;
  for (let i = 0; i < layers; i++) out = JSON.stringify({ msg: out });
  return out;
}

const isRedacted = (line: string) => line.includes('[REDACTED:');

describe('redactLine — bộ che dùng chung @ga/security (redactLogLine), che theo ĐOẠN', () => {
  it.each(Object.entries(TOKENS))(
    'token %s trong dòng văn bản thường ⇒ đoạn bị che, phần còn lại giữ nguyên',
    (_k, tok) => {
      const out = redactLine(`trước ${tok} sau`);
      expect(isRedacted(out)).toBe(true);
      expect(out.startsWith('trước ')).toBe(true);
      expect(out).not.toContain(tok.slice(0, 12));
      expect(out).not.toContain('\n');
    },
  );

  it('dòng JSON sau khi che vẫn là JSON hợp lệ, không chứa token', () => {
    const out = redactLine(JSON.stringify({ type: 'text', text: TOKENS.anthropic }));
    const v = JSON.parse(out) as { type: string; text: string };
    expect(v.type).toBe('text');
    expect(v.text).toMatch(/^\[REDACTED:[a-z0-9_:]+\]$/);
  });

  const KEYS = ['refresh_token', 'access_token', 'id_token', 'client_secret', 'private_key', 'password'];
  it.each(KEYS)('khoá %s trong JSON lồng 0/1/2/3 lớp escape ⇒ bắt + che, giá trị không lọt', (key) => {
    const inner = JSON.stringify({ [key]: SECRET });
    for (let layers = 0; layers <= 3; layers++) {
      const line = nest(inner, layers);
      expect(credentialInLine(line), `${key} @ ${layers} lớp: ${line}`).not.toBeNull();
      const out = redactLine(line);
      expect(out, `${key} @ ${layers} lớp`).not.toContain(SECRET);
      expect(() => JSON.parse(out)).not.toThrow();
    }
  });

  it.each([1, 2])('refresh_token trong log stream-json escape %i lớp, nhúng giữa văn bản ⇒ bắt + che', (n) => {
    const inner = nest(`{"refresh_token":"${SECRET}"}`, n - 1);
    const escaped = JSON.stringify(inner).slice(1, -1); // thêm một lớp escape, bỏ nháy bọc ngoài
    const line = `log: ${escaped} end`;
    expect(credentialInLine(line)).not.toBeNull();
    expect(redactLine(line)).not.toContain(SECRET);
  });

  it.each([
    ['nháy kép', `{"refresh_token": "${SECRET}"}`],
    ['nháy đơn (repr Python)', `{'refresh_token': '${SECRET}'}`],
    ['tab quanh dấu hai chấm', `{"refresh_token"\t:\t"${SECRET}"}`],
    ['nhiều khoảng trắng', `{"refresh_token"      :      "${SECRET}"}`],
    ['dạng key=value', `REFRESH_TOKEN=${SECRET} other`],
    ['key=value giữa dòng', `retry with refresh_token=${SECRET} now`],
    ['tiền tố + JSON nhúng', `INFO {"refresh_token":"${SECRET}"}`],
    ['tiền tố + JSON nhúng escape 1 lớp', `INFO {\\"refresh_token\\":\\"${SECRET}\\"}`],
    ['escape unicode \\u0022', `log {\\u0022refresh_token\\u0022:\\u0022${SECRET}\\u0022}`],
    ['password key=value', `login password=${SECRET} ok`],
  ])('%s ⇒ bắt + che', (_n, line) => {
    expect(credentialInLine(line), line).not.toBeNull();
    const out = redactLine(line);
    expect(out, line).not.toContain(SECRET);
    expect(isRedacted(out)).toBe(true);
  });

  it.each([
    'Rotate your refresh_token regularly',
    'docs: access_token and id_token are described here',
    '{"field":"refresh_token"}',
    'đổi password: ở đâu',
    '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0', // UUID không bị chặn (CNS-169)
    'deadbeef'.repeat(8), // hex không bị chặn (CNS-169)
  ])('ca âm — chỉ nhắc tên khoá / UUID / hex: %j đi nguyên văn', (line) => {
    expect(credentialInLine(line)).toBeNull();
    expect(redactLine(line)).toBe(line);
  });

  it('dòng sạch đi nguyên văn', () => {
    for (const ok of ['{"type":"text","text":"xin chào"}', 'RL-0001 MM-0041 ok', 'task-runner ask-me']) {
      expect(redactLine(ok)).toBe(ok);
    }
  });

  it('dòng vượt trần quét (> 1 Mi ký tự) ⇒ CẢ dòng bị thay bằng một dòng báo, không kèm \\n', () => {
    const line = `${TOKENS.anthropic} ${'a'.repeat(MAX_SCAN_CHARS)}`;
    expect(credentialInLine(line)).toBe('too_large');
    const out = redactLine(line);
    expect(JSON.parse(out)).toEqual({ redacted: 'too_large', length: line.length });
    expect(out.includes('\n')).toBe(false);
  });

  it('tuyến tính: 1 MB chuỗi đối kháng mỗi mẫu < 1 s', () => {
    const n = MAX_SCAN_CHARS;
    const attacks = [
      'xsk-'.repeat(n / 4),
      '\\'.repeat(n),
      '\\"'.repeat(n / 2),
      'eyJaaaaaaaa.'.repeat(Math.floor(n / 12)),
      '-----BEGIN '.repeat(Math.floor(n / 11)),
      'refresh_token '.repeat(Math.floor(n / 14)),
      '['.repeat(n / 2) + ']'.repeat(n / 2),
      JSON.stringify({ a: '{"b":"{\\"c\\":1}"}'.repeat(Math.floor(n / 40)) }),
      `"${'{\\"x\\":'.repeat(Math.floor(n / 10))}"`,
    ];
    for (const a of attacks) {
      const t0 = performance.now();
      redactLine(a.slice(0, MAX_SCAN_CHARS));
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
    expect(lines[0]).toMatch(/^a \[REDACTED:[a-z0-9_:]+\] b$/);
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

  it('che làm dòng DÀI hơn trần ⇒ bỏ cả dòng (không phá giao thức stdout)', () => {
    let out = '';
    const w = new RedactingLineWriter((s) => {
      out += s;
    }, 40);
    // `password=<8 ký tự>` (17 ≤ 40) ⇒ sau khi che `password=[REDACTED:…]` (> 40)
    const line = `password=${SECRET.slice(0, 8)}`;
    expect(line.length).toBeLessThanOrEqual(40);
    expect(redactLine(line).length).toBeGreaterThan(40);
    w.push(`${line}\nok\n`);
    w.end();
    expect(out).toBe(`${DROPPED_LINE_MARKER}\nok\n`);
  });
});
