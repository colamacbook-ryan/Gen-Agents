import { describe, expect, it } from 'vitest';
import { DROPPED_LINE_MARKER, RedactingLineWriter } from '../src/lines.ts';
import { REDACTED, redact } from '../src/redact.ts';

// Mẫu credential dựng LÚC CHẠY từ mảnh ghép (không có chuỗi giống khoá thật trong repo — gitleaks).
const j = (...p: string[]) => p.join('');
const SAMPLES: Record<string, string> = {
  anthropic: j('sk-', 'ant-', 'api03-', 'A'.repeat(40)),
  generic_sk: j('sk-', 'proj-', 'B'.repeat(30)),
  google_access: j('ya', '29.', 'a0AfH6SM', 'C'.repeat(30)),
  google_refresh: j('1/', '/0', 'gD'.repeat(20)),
  google_api_key: j('AI', 'za', 'Sy', 'D'.repeat(33)),
  jwt: j('ey', 'J', 'hbGciOiJIUzI1NiJ9', '.', 'eyJzdWIiOiIxMjM0In0', '.', 'E'.repeat(20)),
  canary_lower: 'GA-CANARY-0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0',
  canary_upper: 'GA-CANARY-0F1E2D3C-4B5A-6978-8796-A5B4C3D2E1F0',
};

describe('redact — che credential trong output CLI', () => {
  it.each(Object.entries(SAMPLES))('che %s', (_k, secret) => {
    const out = redact(`trước ${secret} sau`);
    expect(out).toBe(`trước ${REDACTED} sau`);
    expect(out).not.toContain(secret.slice(4, 20));
  });

  it('che PEM khoá riêng nhiều dòng (trong một chuỗi JSON đã escape)', () => {
    const pem = j('-----BEGIN ', 'RSA PRIVATE KEY-----\\nMIIE', 'x'.repeat(50), '\\n-----END RSA PRIVATE KEY-----');
    const out = redact(`{"k":"${pem}","n":1}`);
    expect(out).toBe(`{"k":"${REDACTED}","n":1}`);
    expect(JSON.parse(out)).toEqual({ k: REDACTED, n: 1 });
  });

  it('che giá trị trường refresh_token (JSON và dạng key=value)', () => {
    expect(redact('{"refresh_token": "abc.def-123"}')).toBe(`{"refresh_token": "${REDACTED}"}`);
    expect(redact('REFRESH_TOKEN=xyz987 other')).toBe(`REFRESH_TOKEN=${REDACTED} other`);
  });

  it('JSONL vẫn parse được sau khi che', () => {
    const line = JSON.stringify({ type: 'text', text: `token ${SAMPLES.anthropic} và ${SAMPLES.canary_lower}` });
    const parsed = JSON.parse(redact(line)) as { text: string };
    expect(parsed.text).toBe(`token ${REDACTED} và ${REDACTED}`);
  });

  it('không che nhầm: UUID phiên, sha256 hex, ULID, display_id, từ thường chứa "sk-"', () => {
    const benign = [
      '{"session_id":"0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0"}',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      '01JABCDEFGHJKMNPQRSTVWXYZ0 RL-0001 MM-0041',
      'task-runner ask-me desk-lamp',
      'sk-short',
    ];
    for (const b of benign) expect(redact(b)).toBe(b);
  });

  it('tuyến tính: 1 MB chuỗi đối kháng mỗi mẫu < 300 ms', () => {
    const attacks = [
      'xsk-'.repeat(262_144),
      'sk-'.repeat(349_525),
      'eyJ'.repeat(349_525),
      'eyJaaaaaaaa.'.repeat(87_381),
      '-----BEGIN '.repeat(95_325),
      'GA-CANARY-'.repeat(104_857),
      'refresh_token '.repeat(74_898),
      '1//0'.repeat(262_144),
      'a'.repeat(1_048_576),
    ];
    for (const a of attacks) {
      const t0 = performance.now();
      redact(a);
      expect(performance.now() - t0).toBeLessThan(300);
    }
  });
});

describe('RedactingLineWriter — che theo DÒNG hoàn chỉnh', () => {
  it('token bị cắt giữa hai khúc vẫn được che (che sau khi ráp dòng)', () => {
    let out = '';
    const w = new RedactingLineWriter((s) => {
      out += s;
    });
    const s = SAMPLES.anthropic as string;
    w.push(Buffer.from(`a ${s.slice(0, 10)}`));
    w.push(Buffer.from(`${s.slice(10)} b\nc`));
    w.end();
    expect(out).toBe(`a ${REDACTED} b\nc\n`);
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
    w.push(`${'y'.repeat(60)}${SAMPLES.anthropic}\nok\n`);
    w.end();
    expect(out).toBe(`${DROPPED_LINE_MARKER}\nok\n`);
  });
});
