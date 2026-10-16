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

/** Bọc chuỗi vào n lớp chuỗi JSON (mỗi lớp một lần escape). */
function nest(s: string, layers: number): string {
  let out = s;
  for (let i = 0; i < layers; i++) out = JSON.stringify({ msg: out });
  return out;
}

const isMarker = (line: string) => (JSON.parse(line) as { $ga?: string }).$ga === 'line_redacted';

describe('redactLine — dùng bộ phát hiện tham chiếu của contracts, thay CẢ dòng', () => {
  it.each(Object.entries(TOKENS))('token %s trong dòng văn bản thường ⇒ dòng bị thay', (_k, tok) => {
    const out = redactLine(`trước ${tok} sau`);
    expect(isMarker(out)).toBe(true);
    expect(out).not.toContain(tok.slice(0, 12));
  });

  it('dòng đánh dấu là JSON hợp lệ, không chứa nội dung gốc', () => {
    const out = redactLine(JSON.stringify({ type: 'text', text: TOKENS.anthropic }));
    expect(JSON.parse(out)).toEqual({ $ga: 'line_redacted', patternId: expect.any(String) });
  });

  const KEYS = ['refresh_token', 'access_token', 'id_token', 'client_secret', 'private_key'];
  it.each(KEYS)('khoá %s trong JSON lồng 0/1/2/3 lớp escape (giá trị ngắn, không giống token) ⇒ bắt', (key) => {
    const inner = JSON.stringify({ [key]: 'v' });
    for (let layers = 0; layers <= 3; layers++) {
      const line = nest(inner, layers);
      expect(credentialInLine(line), `${key} @ ${layers} lớp: ${line}`).not.toBeNull();
    }
  });

  it.each([1, 2, 3])(
    'refresh_token trong log stream-json escape %i lớp, nhúng giữa văn bản (không phải JSON) ⇒ bắt',
    (n) => {
      const inner = nest('{"refresh_token":"abc"}', n - 1).slice(0); // chuỗi JSON n-1 lớp
      const escaped = JSON.stringify(inner).slice(1, -1); // thêm một lớp escape, bỏ nháy bọc ngoài
      expect(credentialInLine(`log: ${escaped} end`)).not.toBeNull();
    },
  );

  it.each([
    ['nháy kép', '{"refresh_token": "abc"}'],
    ['nháy đơn (repr Python)', "{'refresh_token': 'abc'}"],
    ['tab quanh dấu hai chấm', '{"refresh_token"\t:\t"abc"}'],
    ['nhiều khoảng trắng', '{"refresh_token"      :      "abc"}'],
    ['dạng key=value', 'REFRESH_TOKEN=xyz987 other'],
    ['escape + tab', '{\\"refresh_token\\"\t:\t\\"abc\\"}'],
  ])('refresh_token dạng %s ⇒ bắt', (_n, line) => {
    expect(credentialInLine(line)).not.toBeNull();
  });

  it.todo('khoá `password` — bộ tham chiếu contracts chưa có (CREDENTIAL_KEY_RE); chờ @ga/security / đề xuất L0');

  it('dòng sạch đi nguyên văn', () => {
    for (const ok of ['{"type":"text","text":"xin chào"}', 'RL-0001 MM-0041 ok', 'task-runner ask-me']) {
      expect(redactLine(ok)).toBe(ok);
    }
  });

  it('dòng vượt trần quét ⇒ thay, không quét', () => {
    expect(credentialInLine('a'.repeat(MAX_SCAN_CHARS + 1))).toBe('too_large');
  });

  it('tuyến tính: 1 MB chuỗi đối kháng mỗi mẫu < 500 ms', () => {
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
      credentialInLine(a.slice(0, MAX_SCAN_CHARS));
      expect(performance.now() - t0, a.slice(0, 20)).toBeLessThan(500);
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
});
