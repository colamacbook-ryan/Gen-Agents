// Test đối chiếu "KHÔNG YẾU HƠN tham chiếu" (STD-11 1.10–1.13; CNS-133, CNS-169):
//   (A) bộ regex tham chiếu theo quyết định CNS-169 (viết thẳng bằng regex, KHÔNG dùng ở runtime — có mẫu bậc hai) bắt
//       ⇒ bộ của @ga/security PHẢI bắt;
//   (B) bộ tham chiếu `CREDENTIAL_DETECTORS` của contracts (do L0 giữ) bắt ⇒ bộ của @ga/security PHẢI bắt — trừ đúng một
//       ngoại lệ có chủ đích của CNS-169: đoạn chỉ khớp luật "đoạn token dài" cũ mà KHÔNG đủ hoa + thường + số + ký tự ngoài
//       hex (hex thuần / UUID / chỉ một kiểu chữ). Khi contracts cập nhật theo CNS-169, ngoại lệ này tự hết tác dụng;
//   (C) hex thuần / UUID: bộ của @ga/security KHÔNG BAO GIỜ bắt.
// Corpus: biên có hệ thống + ngẫu nhiên (PRNG hạt giống cố định), mọi chuỗi nằm trong trần quét.
import { CREDENTIAL_DETECTORS } from '@ga/contracts';
import { describe, expect, it } from 'vitest';
import { detectCredential } from '../src/index.ts';

/** Tham chiếu CNS-169 (đặc tả bằng regex). Luật entropy: đoạn token TỐI ĐẠI ≥ 32, đủ hoa + thường + số, có ký tự ngoài hex. */
const REFERENCE: ReadonlyArray<{ id: string; re: RegExp }> = [
  { id: 'jwt', re: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ },
  { id: 'ya29', re: /ya29\.[0-9A-Za-z_-]{10,}/ },
  { id: '1//0', re: /1\/\/0[0-9A-Za-z_-]{10,}/ },
  { id: 'AIza', re: /AIza[0-9A-Za-z_-]{30,}/ },
  { id: 'sk-ant', re: /sk-ant-[0-9A-Za-z_-]{10,}/ },
  { id: 'sk', re: /\bsk-[0-9A-Za-z_-]{20,}/ },
  { id: 'github', re: /\bgh[pousr]_[0-9A-Za-z]{36,}/ },
  { id: 'slack', re: /\bxox[abpr]-[0-9A-Za-z-]{10,}/ },
  { id: 'pem', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: 'refresh_token_field', re: /["']?refresh_token["']?\s*[:=]/i },
  {
    id: 'credential_assignment',
    re: /(refresh_token|access_token|id_token|client_secret|private_key)["']?\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{8,}/i,
  },
  { id: 'canary', re: /GA-CANARY-[0-9a-f-]{8,}/i },
  {
    id: 'high_entropy',
    re: /(?<![0-9A-Za-z_-])(?=[0-9A-Za-z_-]*[A-Z])(?=[0-9A-Za-z_-]*[a-z])(?=[0-9A-Za-z_-]*\d)(?=[0-9A-Za-z_-]*[G-Zg-z_])[0-9A-Za-z_-]{32,}(?![0-9A-Za-z_-])/,
  },
];

const RUN_RE = /[0-9A-Za-z_-]{32,}/g;
/** Có đoạn token ≥ 32 thoả luật entropy CNS-169 không (để tách ngoại lệ có chủ đích của (B)). */
function cns169EntropyRun(s: string): boolean {
  for (const m of s.matchAll(RUN_RE)) {
    const t = m[0];
    if (/[A-Z]/.test(t) && /[a-z]/.test(t) && /\d/.test(t) && /[G-Zg-z_]/.test(t)) return true;
  }
  return false;
}

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
const SPACES = [' ', '\t', '\n', '\r', '\v', '\f', ' ', ' ', '\u3000', '\ufeff'];
const run = (n: number, alphabet = TOKEN) => Array.from({ length: n }, () => pick([...alphabet])).join('');
const flipCase = (s: string) => [...s].map((c) => (rnd() < 0.5 ? c.toUpperCase() : c.toLowerCase())).join('');

function corpus(): string[] {
  const out: string[] = [];
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
  for (const before of ['', ...PRINTABLE]) {
    for (let n = 17; n <= 23; n++) out.push(`${before}sk-${run(n)}`);
    out.push(`x${before}sk-${run(21)}`, `${before}${before}sk-${run(20)}`);
  }
  const prefixes: Array<[string, number]> = [
    ['ya29.', 10],
    ['1//0', 10],
    ['AIza', 30],
    ['sk-ant-', 10],
    ['GA-CANARY-', 8],
    ['ga-canary-', 8],
    ['ghp_', 36],
    ['gho_', 36],
    ['ghs_', 36],
    ['xoxb-', 10],
    ['xoxp-', 10],
  ];
  for (const [p, min] of prefixes) {
    for (let n = Math.max(0, min - 3); n <= min + 3; n++) {
      for (let k = 0; k < 12; k++) {
        const b = p.toLowerCase().includes('canary') ? run(n, `${LOWER_HEX}-`) : run(n);
        out.push(`${run(int(0, 3), PRINTABLE)}${p}${b}${run(int(0, 3), PRINTABLE)}`);
      }
    }
  }
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
  for (let n = 0; n <= 60; n++) {
    const mid = run(n, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ ');
    out.push(
      `-----BEGIN ${mid}PRIVATE KEY-----`,
      `-----BEGIN ${mid}PRIVATE KEY----`,
      `-----BEGIN ${mid}PRIVATE KEY`,
      `x-----BEGIN ${mid} PRIVATE KEY-----y`,
    );
  }
  for (let n = 28; n <= 36; n++) {
    out.push(
      'a'.repeat(n),
      '7'.repeat(n),
      `${'a'.repeat(n - 1)}7`,
      `7${'_'.repeat(n - 1)}`,
      run(n, LOWER_HEX),
      run(n, '0123456789ABCDEFabcdef'),
      run(n),
      `${run(n)} ${run(n)}`,
      `${'-'.repeat(n - 2)}a1`,
      `${'_'.repeat(n)}`,
      `${run(int(1, 5), PRINTABLE)}${run(n)}`,
      `${run(n - 2, 'abcdefghijklmnopqrstuvwxyz')}Q7`,
    );
  }
  // gán credential theo tên khoá (tham chiếu credential_assignment): tên × hoa/thường × ký tự đứng trước × dấu gán × độ dài giá trị
  const VALUE = 'ABCabc0123._~+/=-';
  const names = ['refresh_token', 'access_token', 'id_token', 'client_secret', 'private_key'];
  const seps = [':', '=', ' : ', '": "', "'='", '=\t', '":"'];
  for (const name of names) {
    for (const sep of seps) {
      for (let n = 6; n <= 10; n++) {
        const before = pick(['', ' ', 'x', '_', '"', '{"', 'INFO got {"', 'a1']);
        const body = run(n, VALUE);
        out.push(`${before}${flipCase(name)}${sep}${body}`, `INFO ${JSON.stringify({ [name]: body })} end`);
      }
    }
  }
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
    'ghp_',
    'xoxb-',
    'client_secret=',
    'access_token: ',
    '.',
    '"',
  ];
  for (let k = 0; k < 6000; k++) {
    let s = '';
    const parts = int(1, 8);
    for (let j = 0; j < parts; j++) s += rnd() < 0.4 ? pick(inserts) : run(int(0, 40), rnd() < 0.5 ? TOKEN : PRINTABLE);
    out.push(s);
  }
  return out;
}

describe('đối chiếu với tham chiếu', () => {
  const cases = corpus();

  it('(A) tham chiếu CNS-169 bắt ⇒ @ga/security bắt', () => {
    const misses: string[] = [];
    const perPattern: Record<string, number> = {};
    for (const s of cases) {
      const ref = REFERENCE.filter((p) => p.re.test(s)).map((p) => p.id);
      for (const id of ref) perPattern[id] = (perPattern[id] ?? 0) + 1;
      if (ref.length > 0 && detectCredential(s) === null)
        misses.push(`${ref.join(',')} ⇐ ${JSON.stringify(s).slice(0, 120)}`);
    }
    console.info(`(A) ${cases.length} ca; theo mẫu ${JSON.stringify(perPattern)}; lọt ${misses.length}`);
    expect(misses).toEqual([]);
    for (const p of REFERENCE) expect(perPattern[p.id] ?? 0, `corpus phải chạm mẫu ${p.id}`).toBeGreaterThan(0);
  });

  it('(B) tham chiếu contracts bắt ⇒ @ga/security bắt (trừ ngoại lệ hex / một kiểu chữ của CNS-169)', () => {
    const misses: string[] = [];
    let refHits = 0;
    let exempt = 0;
    for (const s of cases) {
      const ids = CREDENTIAL_DETECTORS.filter((d) => d.test(s)).map((d) => d.id);
      if (ids.length === 0) continue;
      refHits++;
      if (detectCredential(s) !== null) continue;
      if (ids.every((id) => id === 'long_token_run') && !cns169EntropyRun(s)) {
        exempt++;
        continue;
      }
      misses.push(`${ids.join(',')} ⇐ ${JSON.stringify(s).slice(0, 120)}`);
    }
    console.info(`(B) contracts bắt ${refHits}, ngoại lệ CNS-169 ${exempt}, lọt ${misses.length}`);
    expect(misses).toEqual([]);
    expect(refHits).toBeGreaterThan(1000);
  });

  it('(D) mọi ca tham chiếu credential_assignment bắt, khi bị thoát JSON lồng 1–3 lớp (\\uXXXX), vẫn bị bắt', () => {
    const hits = cases.filter((s) =>
      (REFERENCE.find((r) => r.id === 'credential_assignment') as { re: RegExp }).re.test(s),
    );
    expect(hits.length).toBeGreaterThan(100);
    const misses: string[] = [];
    for (const s of hits) {
      let t = s.replace(/[a-z]/, (c) => `\\u00${c.charCodeAt(0).toString(16)}`);
      for (let layer = 1; layer <= 3; layer++) {
        if (detectCredential(`log ${t} end`) === null) misses.push(`${layer} lớp ⇐ ${JSON.stringify(t).slice(0, 120)}`);
        t = JSON.stringify(t).slice(1, -1);
      }
    }
    expect(misses).toEqual([]);
  });

  it('(C) hex thuần / UUID trong corpus không bao giờ bị bắt', () => {
    const hexOnly = cases.filter((s) => /^[0-9a-fA-F-]+$/.test(s));
    expect(hexOnly.length).toBeGreaterThan(10);
    for (const s of hexOnly) expect(detectCredential(s), s).toBeNull();
  });
});
