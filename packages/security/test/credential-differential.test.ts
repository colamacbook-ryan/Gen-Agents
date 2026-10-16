// Test đối chiếu "KHÔNG YẾU HƠN tham chiếu" (STD-11 1.10–1.13; CNS-133, CNS-169):
//   (A) bộ regex tham chiếu theo quyết định CNS-169 (viết thẳng bằng regex, KHÔNG dùng ở runtime — có mẫu bậc hai) bắt
//       ⇒ bộ của @ga/security PHẢI bắt;
//   (B) bộ tham chiếu `CREDENTIAL_DETECTORS` của contracts (do L0 giữ) bắt ⇒ bộ của @ga/security PHẢI bắt — trừ đúng một
//       ngoại lệ có chủ đích của CNS-169: đoạn chỉ khớp luật "đoạn token dài" cũ mà KHÔNG đủ hoa + thường + số + ký tự ngoài
//       hex (hex thuần / UUID / chỉ một kiểu chữ). Khi contracts cập nhật theo CNS-169, ngoại lệ này tự hết tác dụng;
//   (C) hex thuần / UUID: bộ của @ga/security KHÔNG BAO GIỜ bắt.
// Corpus: biên có hệ thống + ngẫu nhiên (PRNG hạt giống cố định), mọi chuỗi nằm trong trần quét.
import { CREDENTIAL_DETECTORS, CREDENTIAL_KEY_NAMES } from '@ga/contracts';
import { describe, expect, it } from 'vitest';
import { detectCredential } from '../src/index.ts';
import { base64Secrets, JS_SPACES, urlCorpus } from './helpers.ts';

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
  /** tên mọi kiểu viết (contracts 0a2bfff): giữa các phần cho `[_-]*` */
  { id: 'refresh_token_field', re: /["']?refresh[_-]*token["']?\s*[:=]/i },
  {
    id: 'credential_assignment',
    re: new RegExp(
      `(?:${CREDENTIAL_KEY_NAMES.map((n) => n.split(/[_-]/).join('[_-]*')).join('|')})["']?\\s*[:=]\\s*["']?[A-Za-z0-9._~+/=-]{8,}`,
      'i',
    ),
  },
  /**
   * Khoá = đúng một tên credential (ranh giới hai phía) + dấu gán + giá trị NGẮN bất kỳ ≥ 1 ký tự (L-RT 2026-10-16): nháy
   * mở rồi một ký tự không phải nháy, hoặc một ký tự không phải khoảng trắng / phân cách; trừ null / true / false.
   */
  {
    id: 'credential_key_assignment',
    re: new RegExp(
      `(?<![A-Za-z0-9_-])(?:${CREDENTIAL_KEY_NAMES.map((n) => n.split(/[_-]/).join('[_-]*')).join('|')})(?![A-Za-z0-9_-])["']?\\s*[:=]\\s*(?!(?:null|true|false)(?![A-Za-z0-9_]))(?:"[^"]|'[^']|[^\\s"',;}\\])])`,
      'i',
    ),
  },
  { id: 'aws_access_key_id', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}/ },
  /** = contracts `env_secret_assignment` (c4285e8). */
  {
    id: 'env_secret_assignment',
    re: /\b[A-Z][A-Z0-9_]*_(?:SECRET|TOKEN|PASSWORD|PASSWD|KEY|PAT)\s*[:=]\s*["']?[^\s"']{8}/,
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
/** Đúng tập `\s` của regex JS (lấy từ engine): ASCII + NBSP, U+1680, U+2000–U+200A, U+2028/9, U+202F, U+205F, U+3000, U+FEFF. */
const SPACES = JS_SPACES;
const run = (n: number, alphabet = TOKEN) => Array.from({ length: n }, () => pick([...alphabet])).join('');
/** Kiểu viết khác của tên snake / kebab: phân cách ngẫu nhiên '', '-', '_', '__', '-_-' (contracts so sau khi bỏ `_` / `-`). */
const spell = (name: string) => name.split(/[_-]/).join(pick(['', '-', '_', '__', '-_-']));
const flipCase = (s: string) => [...s].map((c) => (rnd() < 0.5 ? c.toUpperCase() : c.toLowerCase())).join('');

function corpus(): string[] {
  const out: string[] = [];
  for (const q1 of ['', '"', "'"]) {
    for (const q2 of ['', '"', "'"]) {
      for (let n = 0; n <= 64; n++) {
        for (const sep of [':', '=']) {
          const ws = Array.from({ length: n }, () => pick(SPACES)).join('');
          out.push(`${q1}${flipCase(spell('refresh_token'))}${q2}${ws}${sep} "v"`);
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
  // TOÀN BỘ danh sách tên khoá của contracts — thêm tên ở contracts thì corpus tự phủ
  const names = [...CREDENTIAL_KEY_NAMES];
  const seps = [':', '=', ' : ', '": "', "'='", '=\t', '":"'];
  // khoảng trắng Unicode làm dấu phân cách (review MEDIUM parser-differential): mọi ký tự `\s` ngoài ASCII
  for (const sp of SPACES.filter((c) => c.charCodeAt(0) > 0x7f))
    seps.push(`${sp}:${sp}`, `"${sp}=${sp}"`, `${sp}${sp}=`);
  for (const name of names) {
    for (const sep of seps) {
      for (let n = 6; n <= 10; n++) {
        const before = pick(['', ' ', 'x', '_', '"', '{"', 'INFO got {"', 'a1']);
        const body = run(n, VALUE);
        out.push(`${before}${flipCase(name)}${sep}${body}`, `INFO ${JSON.stringify({ [name]: body })} end`);
        out.push(`${before}${flipCase(spell(name))}${sep}${body}`);
      }
    }
  }
  // khoá credential + giá trị NGẮN (0–7 ký tự) ở các dạng khoá rõ ràng + ca âm (khoá dài hơn tên, không giá trị, literal JSON)
  for (const name of CREDENTIAL_KEY_NAMES) {
    for (let n = 0; n <= 7; n++) {
      const v = run(n, VALUE);
      const k = flipCase(spell(name));
      out.push(`{"${k}":"${v}"}`, `${k}=${v}`, `${k}: ${v}`, `'${k}': '${v}'`, `log {\\"${k}\\":\\"${v}\\"}`);
      out.push(`MAX_${k}=${v}`, `${k}_count: ${v}`, `${k}s=${v}`, `{"${k}": null}`, `${k}: , ${v}`);
    }
  }
  // AKIA / ASIA: ký tự trước (đầu chuỗi / ranh giới / chữ) × đuôi dính liền (chữ, số, không gì) — review MEDIUM
  for (const p of ['AKIA', 'ASIA']) {
    for (const before of ['', ' ', '_', '-', 'x', '1', '"']) {
      for (const after of ['', ' ', 'X', '9', 'abc', '_']) {
        out.push(`${before}${p}${run(16, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')}${after}`);
        out.push(`${before}${p}${run(15, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')}${after}`);
      }
    }
  }
  // gán biến môi trường bí mật: tên UPPER_SNAKE (+ chữ thường) × hậu tố × dấu gán × giá trị 0–3 ký tự
  for (const suffix of ['SECRET', 'TOKEN', 'PASSWORD', 'PASSWD', 'KEY', 'PAT', 'secret', 'token', 'TOKENS']) {
    for (const name of ['DB', 'GITHUB', 'MY_APP', 'X1', 'aws_secret_ACCESS']) {
      for (const sep of ['=', ' = ', ':', '="']) {
        out.push(`${pick(['', 'export ', ' '])}${name}_${suffix}${sep}${run(int(0, 3), VALUE)}`);
        out.push(`${pick(['', 'export ', ' ', 'x'])}${name}_${suffix}${sep}${run(int(6, 10), VALUE)}`);
      }
    }
  }
  // URL có userinfo (corpus đối chiếu new URL(), cùng bộ với test của detector) — (B) so với contracts `url_userinfo`
  out.push(...urlCorpus(5000).filter((_, i) => i % 4 === 0));
  // secret base64 có + / (contracts base64_secret_run): 40–48 ký tự, đứng riêng / trong câu / trong đường dẫn
  for (const v of base64Secrets(600, 40)) out.push(`k ${v} `, v);
  for (const v of base64Secrets(200, 48, 11)) out.push(`/srv/${v}/x`, `${v.slice(0, 20)} ${v.slice(20)}`);
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
