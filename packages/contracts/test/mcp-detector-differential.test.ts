// Đối chiếu bộ quét tuyến tính (CREDENTIAL_DETECTORS) với BỘ REGEX THAM CHIẾU — bản trước khi tối ưu (commit 8544a72),
// cập nhật theo CNS-169 (Gen quyết 2026-10-16): `long_token_run` → `high_entropy_run` (hoa + thường + số, hex / UUID CỐ Ý
// không chặn) + tiền tố mới + `credential_assignment` (security review L-RT).
// Luật: tham chiếu bắt ⇒ bản mới PHẢI bắt (không yếu hơn). Review bảo mật M0 bắt hai hồi quy khi viết lại cho tuyến tính
// (refresh_token với > 8 khoảng trắng; `x-sk-…` / `--sk-…` do kiểm đầu từ loại cả '-'); test này chặn kiểu vá từng chỗ.
// Corpus: biên có hệ thống + ngẫu nhiên (PRNG cố định hạt giống), mọi chuỗi nằm trong trần kích thước (TOOL_PAYLOAD_LIMITS).
// Regex tham chiếu có mẫu bậc hai (long_token_run) — chỉ chạy trên chuỗi ngắn trong test, KHÔNG dùng ở runtime.
import { describe, expect, it } from 'vitest';
import { findCredentialLike, TOOL_PAYLOAD_LIMITS } from '../src/index.ts';

const NAMES =
  'refresh_token|access_token|id_token|auth_token|session_token|bearer_token|client_secret|secret_key|private_key|api_key|apikey|x-api-key|aws_secret_access_key';
/** Tham chiếu của high_entropy_run: đoạn token tối đại ≥ 32 có hoa + thường + số và KHÔNG chỉ gồm hex + '-'. */
const highEntropyRef = (s: string) =>
  s
    .split(/[^0-9A-Za-z_-]+/)
    .some((r) => r.length >= 32 && /\d/.test(r) && /[a-z]/.test(r) && /[A-Z]/.test(r) && !/^[0-9A-Fa-f-]+$/.test(r));

const REFERENCE: ReadonlyArray<{ id: string; re: RegExp | ((s: string) => boolean) }> = [
  { id: 'jwt', re: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ },
  { id: 'google_oauth_access_token', re: /ya29\.[0-9A-Za-z_-]{10,}/ },
  { id: 'google_refresh_token', re: /1\/\/0[0-9A-Za-z_-]{10,}/ },
  { id: 'google_api_key', re: /AIza[0-9A-Za-z_-]{30,}/ },
  { id: 'vendor_api_key_sk_ant', re: /sk-ant-[0-9A-Za-z_-]{10,}/ },
  { id: 'pem_private_key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: 'refresh_token_field', re: /["']?refresh_token["']?\s*[:=]/i },
  { id: 'canary', re: /GA-CANARY-[0-9a-f-]{8,}/i },
  { id: 'generic_sk_key', re: /\bsk-[0-9A-Za-z_-]{20,}/ },
  { id: 'stripe_secret_key', re: /\b[sr]k_(?:live|test)_[0-9A-Za-z_-]{16,}/ },
  { id: 'github_token', re: /\bgh[pousr]_[0-9A-Za-z_-]{30,}|\bgithub_pat_[0-9A-Za-z_-]{40,}/ },
  { id: 'slack_token', re: /\bxox[abpre]-[0-9A-Za-z_-]{10,}/ },
  { id: 'gitlab_token', re: /\bglpat-[0-9A-Za-z_-]{20,}/ },
  { id: 'aws_access_key_id', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}/ },
  { id: 'telegram_bot_token', re: /\b\d{8,10}:[0-9A-Za-z_-]{35,}/ },
  { id: 'credential_assignment', re: new RegExp(`(?:${NAMES})["']?\\s*[:=]\\s*["']?[A-Za-z0-9._~+/=-]{8,}`, 'i') },
  {
    id: 'env_secret_assignment',
    re: /\b[A-Z][A-Z0-9_]*_(?:SECRET|TOKEN|PASSWORD|PASSWD|KEY|PAT)\s*[:=]\s*["']?[^\s"']{8,}/,
  },
  { id: 'high_entropy_run', re: highEntropyRef },
];
const refHit = (p: (typeof REFERENCE)[number], s: string) => (typeof p.re === 'function' ? p.re(s) : p.re.test(s));

// PRNG mulberry32 — tất định
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = prng(20261016);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

const TOKEN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
const LOWER_HEX = '0123456789abcdef';
const PRINTABLE = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');
const SPACES = [' ', '\t', '\n', '\r', '\v', '\f', ' ', ' ', '　', '﻿'];
const run = (n: number, alphabet = TOKEN) => Array.from({ length: n }, () => pick([...alphabet])).join('');
const flipCase = (s: string) => [...s].map((c) => (rnd() < 0.5 ? c.toUpperCase() : c.toLowerCase())).join('');

function corpus(): string[] {
  const out: string[] = [];
  // refresh_token: nháy 0/1 mỗi bên × khoảng trắng 0–64 (mọi loại \s) × ':' / '=' × hoa / thường
  for (const q1 of ['', '"', "'"]) {
    for (const q2 of ['', '"', "'"]) {
      for (let n = 0; n <= 64; n++) {
        for (const sep of [':', '=']) {
          const ws = Array.from({ length: n }, () => pick(SPACES)).join('');
          out.push(`${q1}${flipCase('refresh_token')}${q2}${ws}${sep} "v"`);
        }
      }
    }
  }
  // sk-: ký tự đứng trước lấy từ TOÀN BỘ ASCII in được (+ đầu chuỗi), phần sau dài quanh ngưỡng 20
  for (const before of ['', ...PRINTABLE]) {
    for (let n = 17; n <= 23; n++) out.push(`${before}sk-${run(n)}`);
    out.push(`x${before}sk-${run(21)}`, `${before}${before}sk-${run(20)}`);
  }
  // các tiền tố khác: độ dài quanh ngưỡng, bọc bởi ký tự ASCII in được ngẫu nhiên
  const prefixes: Array<[string, number]> = [
    ['ya29.', 10],
    ['1//0', 10],
    ['AIza', 30],
    ['sk-ant-', 10],
    ['GA-CANARY-', 8],
    ['ga-canary-', 8],
    ['sk_live_', 16],
    ['sk_test_', 16],
    ['rk_live_', 16],
    ['ghp_', 30],
    ['gho_', 30],
    ['ghs_', 30],
    ['ghu_', 30],
    ['ghr_', 30],
    ['github_pat_', 40],
    ['xoxa-', 10],
    ['xoxb-', 10],
    ['xoxp-', 10],
    ['xoxr-', 10],
    ['xoxe-', 10],
    ['glpat-', 20],
  ];
  for (const [p, min] of prefixes) {
    for (let n = Math.max(0, min - 3); n <= min + 3; n++) {
      for (let k = 0; k < 12; k++) {
        const body = p.toLowerCase().includes('canary') ? run(n, `${LOWER_HEX}-`) : run(n);
        out.push(`${run(int(0, 3), PRINTABLE)}${p}${body}${run(int(0, 3), PRINTABLE)}`);
      }
    }
  }
  // AWS: AKIA / ASIA + 14–18 ký tự [0-9A-Z] (đôi khi lẫn chữ thường), ký tự trước ngẫu nhiên
  for (const p of ['AKIA', 'ASIA']) {
    for (let n = 14; n <= 18; n++) {
      for (let k = 0; k < 12; k++) {
        const body = run(n, rnd() < 0.8 ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' : TOKEN);
        out.push(`${run(int(0, 2), PRINTABLE)}${p}${body}${run(int(0, 2), PRINTABLE)}`);
      }
    }
  }
  // Telegram: 6–12 chữ số + ':' + 33–37 ký tự token
  for (let d = 6; d <= 12; d++) {
    for (let n = 33; n <= 37; n++) {
      out.push(`${run(int(0, 2), PRINTABLE)}${run(d, '0123456789')}:${run(n)}`);
    }
  }
  // phép gán credential: mọi tên × nháy × khoảng trắng × ':' / '=' × giá trị 6–10 ký tự (nhúng giữa dòng log / JSON)
  const VALUE = 'ABCDEFabcdef0123456789._~+/=-';
  for (const name of NAMES.split('|')) {
    for (const q of ['', '"', "'"]) {
      for (const sep of [':', '=']) {
        for (let n = 6; n <= 10; n++) {
          const ws1 = run(int(0, 3), ' \t');
          const ws2 = run(int(0, 3), ' \t');
          out.push(`INFO got {${q}${flipCase(name)}${q}${ws1}${sep}${ws2}${q}${run(n, VALUE)}${q}}`);
        }
      }
    }
  }
  // gán kiểu .env: tên UPPER_SNAKE (+ biến thể chữ thường / thiếu '_') × hậu tố × nháy × khoảng trắng × giá trị 6–10 ký tự
  const SUFFIX = ['SECRET', 'TOKEN', 'PASSWORD', 'PASSWD', 'KEY', 'PAT', 'KEYS', 'TOKENS', 'Key'];
  for (const suffix of SUFFIX) {
    for (const head of ['JWT', 'DATADOG_API', 'A', 'X9', 'my', '_X', 'GITHUB']) {
      for (const sep of ['=', ':', ' = ', '\t:\t']) {
        for (const q of ['', '"', "'"]) {
          for (let n = 6; n <= 10; n++) {
            const value = run(n, rnd() < 0.7 ? LOWER_HEX : `${TOKEN}!@#$%`);
            out.push(`${run(int(0, 2), PRINTABLE)}${head}_${suffix}${sep}${q}${value}${q}`);
          }
        }
      }
    }
  }
  // đoạn entropy: hex hoa / thường / trộn, UUID, chuỗi token ngẫu nhiên dài 28–40
  for (let n = 28; n <= 40; n++) {
    out.push(
      run(n, '0123456789abcdef'),
      run(n, '0123456789ABCDEF'),
      run(n, '0123456789abcdefABCDEF'),
      run(n, 'abcdefghijklmnopqrstuvwxyz0123456789'),
      run(n),
      `${run(n, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')}${run(2, '0123456789')}${run(2, 'abcdefghijklmnopqrstuvwxyz')}`,
    );
  }
  for (let k = 0; k < 50; k++) {
    const u = [8, 4, 4, 4, 12].map((n) => run(n, LOWER_HEX)).join('-');
    out.push(u, u.toUpperCase(), `${u}${run(4)}`);
  }
  // JWT: ba đoạn quanh ngưỡng 8, có / không có tiền tố eyJ
  for (let a = 4; a <= 12; a++) {
    for (let b = 6; b <= 10; b++) {
      for (let c = 6; c <= 10; c++) {
        out.push(
          `eyJ${run(a)}.${run(b)}.${run(c)}`,
          `${run(2, PRINTABLE)}eyJ${run(a)}.${run(b)}.${run(c)}${run(2, PRINTABLE)}`,
        );
      }
    }
  }
  // PEM: [A-Z ] 0–60 trước PRIVATE KEY, có / không có -----
  for (let n = 0; n <= 60; n++) {
    const mid = run(n, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ ');
    out.push(
      `-----BEGIN ${mid}PRIVATE KEY-----`,
      `-----BEGIN ${mid}PRIVATE KEY----`,
      `-----BEGIN ${mid}PRIVATE KEY`,
      `x-----BEGIN ${mid} PRIVATE KEY-----y`,
    );
  }
  // đoạn token dài 28–36: toàn chữ, toàn số, trộn, hex thường, có _ / -
  for (let n = 28; n <= 36; n++) {
    out.push(
      'a'.repeat(n),
      '7'.repeat(n),
      `${'a'.repeat(n - 1)}7`,
      `7${'_'.repeat(n - 1)}`,
      run(n, LOWER_HEX),
      run(n),
      `${run(n)} ${run(n)}`,
    );
    out.push(`${'-'.repeat(n - 2)}a1`, `${'_'.repeat(n)}`, `${run(int(1, 5), PRINTABLE)}${run(n)}`);
  }
  // ngẫu nhiên: ASCII in được + tiền tố chèn ngẫu nhiên
  const inserts = [
    'sk-',
    'ya29.',
    '1//0',
    'AIza',
    'eyJ',
    'refresh_token',
    'GA-CANARY-',
    '-----BEGIN ',
    'PRIVATE KEY-----',
    '.',
    '"',
    'access_token=',
    '"client_secret":"',
    'ghp_',
    'xoxb-',
    'AKIA',
    ':',
    'sk_live_',
    '_SECRET=',
    'API_KEY: ',
    'GITHUB_TOKEN=',
  ];
  for (let k = 0; k < 6000; k++) {
    let s = '';
    const parts = int(1, 8);
    for (let j = 0; j < parts; j++) s += rnd() < 0.4 ? pick(inserts) : run(int(0, 40), rnd() < 0.5 ? TOKEN : PRINTABLE);
    out.push(s);
  }
  return out;
}

describe('bộ quét tuyến tính KHÔNG yếu hơn bộ regex tham chiếu', () => {
  it('cố ý KHÔNG chặn (CNS-169): hex mọi độ dài / hoa thường, UUID, đoạn thiếu một lớp ký tự', () => {
    for (const s of [
      '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b',
      '9F86D081884C7D659A2FEAA0C55AD015A3BF4F1B',
      '9F86d081884C7d659A2feaa0C55ad015A3bf4F1b',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      '3f2b9c1e-8d4a-4f6b-9a1c-2e7d5b8c0a11',
      '3F2B9C1E-8D4A-4F6B-9A1C-2E7D5B8C0A11',
      'q9x2k7m4n1p8r5t3w6y0z2b4d6f8h0j2l4n6p8r0',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCD',
      'đã đẩy commit 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b lên nhánh main',
    ]) {
      expect(findCredentialLike(s), s).toBeNull();
      for (const p of REFERENCE) expect(refHit(p, s), `${p.id}: ${s}`).toBe(false);
    }
  });

  const cases = corpus();

  it('mọi chuỗi trong corpus nằm trong trần kích thước', () => {
    expect(cases.every((s) => s.length <= TOOL_PAYLOAD_LIMITS.maxStringChars)).toBe(true);
  });

  it('tham chiếu bắt ⇒ bản mới bắt', () => {
    let refHits = 0;
    let newOnly = 0;
    const misses: string[] = [];
    const perPattern: Record<string, number> = {};
    for (const s of cases) {
      const ref = REFERENCE.filter((p) => refHit(p, s)).map((p) => p.id);
      const hit = findCredentialLike(s) !== null;
      if (ref.length > 0) {
        refHits++;
        for (const id of ref) perPattern[id] = (perPattern[id] ?? 0) + 1;
        if (!hit) misses.push(`${ref.join(',')} ⇐ ${JSON.stringify(s).slice(0, 120)}`);
      } else if (hit) newOnly++;
    }
    // in số ca để báo cáo (vitest --reporter=verbose hiện dòng này)
    console.info(
      `đối chiếu: ${cases.length} ca, tham chiếu bắt ${refHits}, bản mới lọt ${misses.length}, bản mới bắt thêm ${newOnly}; theo mẫu ${JSON.stringify(perPattern)}`,
    );
    expect(misses).toEqual([]);
    expect(refHits).toBeGreaterThan(1000);
    for (const p of REFERENCE) expect(perPattern[p.id] ?? 0, `corpus phải chạm mẫu ${p.id}`).toBeGreaterThan(0);
  });

  it('hai hồi quy đã báo: refresh_token + 9..64 khoảng trắng; ký tự "-" trước sk-', () => {
    for (let n = 9; n <= 64; n++)
      expect(findCredentialLike(`refresh_token${' '.repeat(n)}: x`), `${n} khoảng trắng`).not.toBeNull();
    for (const s of [`x-sk-${'a1'.repeat(10)}`, `--sk-${'a1'.repeat(10)}`, `"sk-${'a1'.repeat(10)}`]) {
      expect(findCredentialLike(s), s).not.toBeNull();
    }
  });
});
