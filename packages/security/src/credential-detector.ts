// Bộ phát hiện credential DÙNG CHUNG: chặn payload ra (gateway, Telegram, export) + che log (redact.ts).
// Nguồn luật: BUILD-PLAN §B.4 (CNS-133), STD-11 (bộ lọc bảo mật mặc định chặn), quyết định Gen CNS-169 (2026-10-16).
//
// CNS-169 — CHẶN:
//   - tiền tố đã biết (`sk-ant-`, `sk-`, `ya29.`, `1//0`, `AIza`, `ghp_`/`gho_`/`ghs_`…, `xox[abpre]-`, AKIA…, bot Telegram…);
//   - JWT, khối PEM khoá riêng;
//   - cặp khoá–giá trị có tên khoá credential (`refresh_token: …`, `client_secret=…`, `password=…`);
//   - canary `GA-CANARY-<uuid>` (mọi hoa / thường, cả khi bị mã hoá percent / \u / base64 / base64url / hex);
//   - đoạn entropy cao ≥ 32 ký tự [A-Za-z0-9_-] có ĐỦ chữ hoa + chữ thường + chữ số.
// CNS-169 — KHÔNG chặn (ca có chủ đích): chuỗi hex thuần (mọi độ dài, mọi hoa / thường) và UUID chuẩn — mã commit, id là dữ
//   liệu hợp lệ. Đoạn chỉ gồm [0-9a-fA-F-] không bao giờ khớp luật entropy.
//
// Tính chất bắt buộc (STD-11 1.10–1.13):
//   - mặc định chặn: người gọi coi `too_large` như `match` (chặn / che toàn bộ);
//   - chặn kích thước TRƯỚC khi quét (`SCAN_MAX_CHARS`);
//   - chạy TUYẾN TÍNH: regex chỉ có quantifier có trần hoặc MỘT quantifier không giới hạn không lồng, không lookaround;
//     điều kiện phụ kiểm bằng code; mọi vòng lặp nhảy qua phần đã xét; test chuỗi 1 MB < 50 ms + tỉ lệ thời gian theo độ dài;
//   - KHÔNG YẾU HƠN bộ tham chiếu `CREDENTIAL_DETECTORS` của contracts (test đối chiếu `credential-differential.test.ts`).
//
// Biến thể (giảm rủi ro R3 "token bị biến đổi"):
//   (a) chuẩn hoá một lớp: %XX, %uXXXX, \uXXXX, \xXX, \/ \" \', &#NN; / &#xHH;, bỏ ký tự độ rộng 0, gập fullwidth — quét CẢ
//       chuỗi gốc lẫn chuỗi chuẩn hoá;
//   (b) dấu hiệu mạnh (canary, sk-ant-, ya29., 1//0, AIza, PEM, refresh_token) ở dạng base64 / base64url (3 độ lệch căn) và
//       hex (hoa / thường): tìm "kim" mã hoá sẵn bằng indexOf, giải một cửa sổ nhỏ để xác nhận. Hex thuần chỉ bị chặn khi
//       NỘI DUNG giải ra là credential.
// Rủi ro còn lại (BUILD-PLAN R3): mã hoá lồng nhiều lớp, chia nhỏ bằng khoảng trắng, mã hoá tự chế.
//
// Hiệu năng: vòng lặp JS theo từng ký tự đắt (máy 4 CPU dùng chung) ⇒ chỉ MỘT vòng lặp như vậy (luật entropy); mọi bộ khác
// lọc trước bằng includes / indexOf gốc của V8 rồi mới chạy regex có tiền tố chữ cố định.

import {
  boundedNfkc,
  CREDENTIAL_KEY_NAMES,
  CREDENTIAL_PATTERN_IDS,
  type CredentialPatternId,
  isCredentialKeyName,
} from '@ga/contracts';

/** Trần độ dài chuỗi được quét (1 Mi ký tự). Dài hơn ⇒ `too_large` ⇒ người gọi chặn / che toàn bộ. */
export const SCAN_MAX_CHARS = 1_048_576;

export interface CredentialSpan {
  start: number;
  end: number;
  patternId: string;
}

// ---------------------------------------------------------------- khung nhìn
const isDigit = (c: number) => c >= 48 && c <= 57;
const isUpper = (c: number) => c >= 65 && c <= 90;
const isLower = (c: number) => c >= 97 && c <= 122;
const isAlnum = (c: number) => isDigit(c) || isUpper(c) || isLower(c);
/**
 * Đúng tập `\s` của regex JS (WhiteSpace + LineTerminator, gồm NBSP, U+1680, U+2000–U+200A, U+2028/2029, U+202F, U+205F,
 * U+3000, U+FEFF). Bước xác nhận bằng code PHẢI dùng cùng tập với regex — lệch ⇒ regex khớp mà code không xác nhận được
 * ⇒ lọt (security review MEDIUM parser-differential, `refresh_token: <NBSP>"…"`).
 */
const isSpace = (c: number) =>
  (c >= 9 && c <= 13) ||
  c === 32 ||
  c === 0xa0 ||
  c === 0x1680 ||
  (c >= 0x2000 && c <= 0x200a) ||
  c === 0x2028 ||
  c === 0x2029 ||
  c === 0x202f ||
  c === 0x205f ||
  c === 0x3000 ||
  c === 0xfeff;
const isB64Char = (c: number) => isAlnum(c) || c === 43 || c === 47 || c === 95 || c === 45;

class View {
  readonly s: string;
  private readonly runRe = /[0-9A-Za-z_-]*/y;
  private cFrom = -1;
  private cEnd = -1;
  private scanCache: RunScan | null = null;
  constructor(s: string) {
    this.s = s;
  }
  /** Kết quả lượt quét theo ký tự DUY NHẤT (đoạn entropy cao + đoạn base64 ≥ 16) — tính một lần mỗi chuỗi. */
  runScan(): RunScan {
    this.scanCache ??= scanRuns(this.s);
    return this.scanCache;
  }
  /**
   * Số ký tự [0-9A-Za-z_-] liền nhau từ `from`. Nhớ đoạn vừa tính: truy vấn tăng dần trong cùng đoạn trả O(1) ⇒ mỗi đoạn
   * được quét (bằng regex gốc) tối đa một lần cho mỗi bộ phát hiện.
   */
  run(from: number): number {
    if (from >= this.s.length) return 0;
    if (from >= this.cFrom && from <= this.cEnd) return this.cEnd - from;
    this.runRe.lastIndex = from;
    this.runRe.test(this.s);
    this.cFrom = from;
    this.cEnd = this.runRe.lastIndex;
    return this.cEnd - from;
  }
  /** Đầu "từ" theo nghĩa rộng: ký tự trước không phải chữ / số ('_' và '-' VẪN là ranh giới — rộng hơn `\b`). */
  boundaryBefore(at: number): boolean {
    return at === 0 || !isAlnum(this.s.charCodeAt(at - 1));
  }
}

interface RunScan {
  /** đoạn [0-9A-Za-z_-] tối đại ≥ 32, đủ hoa + thường + số + ít nhất một ký tự ngoài [0-9a-fA-F-] (CNS-169) */
  entropy: Array<[number, number]>;
  /** đoạn [A-Za-z0-9+/_-] tối đại ≥ 16 (ứng viên base64 / base64url / hex cho lớp mã hoá) */
  encoded: Array<[number, number]>;
}

/**
 * Vòng lặp JS DUY NHẤT theo từng ký tự (mọi bộ khác dùng indexOf / regex gốc). Theo dõi song song hai loại đoạn:
 * đoạn token (luật entropy) và đoạn base64 (thêm '+' '/'). O(n), không cấp phát ngoài danh sách đoạn.
 */
function scanRuns(s: string): RunScan {
  const entropy: Array<[number, number]> = [];
  const encoded: Array<[number, number]> = [];
  const n = s.length;
  let tStart = 0;
  let flags = 0; // 1 hoa, 2 thường, 4 số, 8 ngoài hex
  let bStart = 0;
  for (let i = 0; i <= n; i++) {
    const c = i < n ? s.charCodeAt(i) : 0;
    if (c >= 48 && c <= 57) flags |= 4;
    else if (c >= 97 && c <= 122) flags |= c > 102 ? 10 : 2;
    else if (c >= 65 && c <= 90) flags |= c > 70 ? 9 : 1;
    else if (c === 95) flags |= 8;
    else if (c !== 45) {
      if (i - tStart >= 32 && flags === 15) entropy.push([tStart, i]);
      tStart = i + 1;
      flags = 0;
      if (c !== 43 && c !== 47) {
        if (i - bStart >= 16) encoded.push([bStart, i]);
        bStart = i + 1;
      }
    }
  }
  return { entropy, encoded };
}

function stickyEnd(re: RegExp, s: string, from: number): number {
  re.lastIndex = from;
  re.test(s);
  return re.lastIndex;
}

/** Trả true để dừng (chế độ "chỉ cần biết có / không"). */
type Emit = (start: number, end: number, patternId: string) => boolean;
interface Detector {
  id: string;
  /** "mạnh" = có dấu hiệu chữ cố định (dùng cho xác nhận nội dung giải mã); luật entropy không mạnh. */
  strong: boolean;
  /** Lọc trước rẻ (includes gốc); false ⇒ chắc chắn không khớp. */
  pre: (v: View) => boolean;
  find: (v: View, emit: Emit) => boolean;
}

const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// ---------------------------------------------------------------- tiền tố đã biết
interface PrefixRule {
  id: string;
  prefixes: readonly string[];
  /** số ký tự token tối thiểu ngay sau tiền tố */
  min: number;
  boundary: boolean;
}

/** Thứ tự = thứ tự thử: tiền tố cụ thể trước tiền tố chung (`sk-ant-` trước `sk-`). */
const PREFIX_RULES: readonly PrefixRule[] = [
  { id: 'google_oauth_access_token', prefixes: ['ya29.'], min: 10, boundary: false },
  { id: 'google_refresh_token', prefixes: ['1//0'], min: 10, boundary: false },
  { id: 'google_api_key', prefixes: ['AIza'], min: 30, boundary: false },
  { id: 'vendor_api_key_sk_ant', prefixes: ['sk-ant-'], min: 10, boundary: false },
  { id: 'generic_sk_key', prefixes: ['sk-'], min: 20, boundary: true },
  { id: 'github_token', prefixes: ['ghp_', 'gho_', 'ghs_', 'ghu_', 'ghr_'], min: 30, boundary: true },
  { id: 'github_token', prefixes: ['github_pat_'], min: 20, boundary: true },
  { id: 'slack_token', prefixes: ['xoxa-', 'xoxb-', 'xoxp-', 'xoxr-', 'xoxe-'], min: 10, boundary: true },
  { id: 'stripe_secret_key', prefixes: ['sk_live_', 'rk_live_', 'sk_test_', 'rk_test_'], min: 16, boundary: true },
  { id: 'npm_token', prefixes: ['npm_'], min: 30, boundary: true },
  { id: 'gitlab_token', prefixes: ['glpat-'], min: 20, boundary: true },
  { id: 'huggingface_token', prefixes: ['hf_'], min: 30, boundary: true },
  { id: 'google_oauth_client_secret', prefixes: ['GOCSPX-'], min: 20, boundary: true },
];
const PREFIX_FLAT = PREFIX_RULES.flatMap((r) => r.prefixes.map((p) => ({ p, rule: r })));
/** Một regex cho mọi tiền tố: tiền tố literal + đúng `min` ký tự token (quantifier có trần) ⇒ tuyến tính, quét gốc. */
// Ranh giới trước (luật `boundary`) nằm trong regex: lookbehind MỘT ký tự, không quantifier ⇒ ứng viên hụt ranh giới
// không tốn vòng JS nào.
const PREFIX_RE_SRC = PREFIX_FLAT.map(
  ({ p, rule }) => `${rule.boundary ? '(?<![0-9A-Za-z])' : ''}${escapeRe(p)}[0-9A-Za-z_-]{${rule.min}}`,
).join('|');

const knownPrefixes: Detector = {
  id: 'known_prefix',
  strong: true,
  // không lọc trước bằng includes: includes / indexOf của V8 với kim ngắn chậm hẳn trên văn bản lặp ký tự đầu của kim
  // (vd 'AIza' trên 'AAAA…' ≈ 8 ms/MB); regex gộp dưới đây tự lọc nhanh hơn
  pre: () => true,
  find(v, emit) {
    const re = new RegExp(PREFIX_RE_SRC, 'g');
    for (let m = re.exec(v.s); m; m = re.exec(v.s)) {
      const at = m.index;
      // luật = tiền tố đầu tiên (theo thứ tự thử) có đủ `min` ký tự token phía sau — giống cách regex chọn nhánh
      const hit = PREFIX_FLAT.find(
        ({ p, rule }) =>
          m[0].length === p.length + rule.min && m[0].startsWith(p) && (!rule.boundary || v.boundaryBefore(at)),
      );
      if (!hit) {
        // regex đã khớp mà bước xác định luật không chắc ⇒ vẫn báo (fail-closed), id của tiền tố đầu tiên trùng
        const id = PREFIX_FLAT.find(({ p }) => m[0].startsWith(p))?.rule.id ?? 'generic_sk_key';
        const stop = at + m[0].length + v.run(at + m[0].length);
        if (emit(at, stop, id)) return true;
        re.lastIndex = stop;
        continue;
      }
      const end = at + hit.p.length + v.run(at + hit.p.length);
      if (emit(at, end, hit.rule.id)) return true;
      re.lastIndex = end;
    }
    return false;
  },
};

/** AKIA / ASIA + đúng 16 ký tự [0-9A-Z] rồi hết đoạn chữ số (AWS access key id). */
const awsAccessKey: Detector = {
  id: 'aws_access_key_id',
  strong: true,
  pre: (v) => /A[KS]IA/.test(v.s),
  find(v, emit) {
    // ranh giới TRƯỚC trong regex (lookbehind MỘT ký tự, không quantifier; rộng hơn `\b` của tham chiếu vì cho cả '_').
    // KHÔNG đòi ranh giới SAU: tham chiếu `\b(?:AKIA|ASIA)[0-9A-Z]{16}` bắt cả khi chữ / số dính liền phía sau.
    const re = /(?<![0-9A-Za-z])A(?:KI|SI)A[0-9A-Z]{16}/g;
    for (let m = re.exec(v.s); m; m = re.exec(v.s)) {
      const end = m.index + 20 + v.run(m.index + 20);
      if (emit(m.index, end, this.id)) return true;
      re.lastIndex = end;
    }
    return false;
  },
};

/** Bot token Telegram: 8–10 chữ số ':' ≥ 35 ký tự token. Bot token của hệ nằm trong kho bí mật — không được ra kênh nào. */
const telegramBotToken: Detector = {
  id: 'telegram_bot_token',
  strong: true,
  pre: (v) => v.s.includes(':'),
  find(v, emit) {
    const s = v.s;
    const re = /:[0-9A-Za-z_-]{35}/g;
    for (let m = re.exec(s); m; m = re.exec(s)) {
      const colon = m.index;
      let d = 0;
      while (d < 11 && colon - d - 1 >= 0 && isDigit(s.charCodeAt(colon - d - 1))) d++;
      const start = colon - d;
      if (d < 8 || d > 10 || !v.boundaryBefore(start)) {
        re.lastIndex = colon + 1;
        continue;
      }
      const end = colon + 1 + v.run(colon + 1);
      if (emit(start, end, this.id)) return true;
      re.lastIndex = end;
    }
    return false;
  },
};

// ---------------------------------------------------------------- JWT, PEM
/** eyJ… '.' … '.' … — ba đoạn token ≥ 8 (đoạn đầu tính cả "eyJ", như contracts). */
const jwt: Detector = {
  id: 'jwt',
  strong: true,
  pre: (v) => v.s.includes('eyJ'),
  find(v, emit) {
    const re = /eyJ[0-9A-Za-z_-]{5}/g;
    for (let m = re.exec(v.s); m; m = re.exec(v.s)) {
      const at = m.index;
      const a = v.run(at);
      if (v.s.charCodeAt(at + a) === 46) {
        const b = v.run(at + a + 1);
        if (b >= 8 && v.s.charCodeAt(at + a + 1 + b) === 46) {
          const c = v.run(at + a + 2 + b);
          if (c >= 8) {
            const end = at + a + 2 + b + c;
            if (emit(at, end, this.id)) return true;
            re.lastIndex = end;
            continue;
          }
        }
      }
      // mọi 'eyJ' sau đó trong CÙNG đoạn token có cùng điểm kết thúc ⇒ kết quả không tốt hơn ⇒ nhảy qua cả đoạn
      re.lastIndex = at + a;
    }
    return false;
  },
};

const PEM_HEAD = '-----BEGIN ';
const PEM_FOOT = '-----END ';
const PEM_LABEL_RE = /[A-Z ]*/y;
const PEM_BODY_RE = /[A-Za-z0-9+/=\s\\:-]*/y;

/**
 * `-----BEGIN <[A-Z ]…PRIVATE KEY…>-----` (gồm RSA / EC / OPENSSH / ENCRYPTED / PGP … BLOCK). Đoạn [A-Z ] tối đại sau BEGIN
 * phải CHỨA "PRIVATE KEY" và ngay sau là "-----" — bao bộ tham chiếu `-----BEGIN [A-Z ]*PRIVATE KEY-----`.
 * Che: tới hết dòng `-----END …-----` kế tiếp; không có END ⇒ hết phần thân base64.
 */
const pemPrivateKey: Detector = {
  id: 'pem_private_key',
  strong: true,
  pre: (v) => v.s.includes(PEM_HEAD) && v.s.includes('PRIVATE KEY'),
  find(v, emit) {
    const s = v.s;
    let from = 0;
    let nextFoot = -2; // con trỏ đơn điệu: '-----END ' đầu tiên ≥ vị trí đang xét (chỉ tìm lại khi đã vượt qua)
    for (;;) {
      const at = s.indexOf(PEM_HEAD, from);
      if (at < 0) return false;
      const start = at + PEM_HEAD.length;
      const end = stickyEnd(PEM_LABEL_RE, s, start);
      if (s.startsWith('-----', end) && s.slice(start, end).includes('PRIVATE KEY')) {
        let stop = end + 5;
        if (nextFoot !== -1 && nextFoot < stop) nextFoot = s.indexOf(PEM_FOOT, stop);
        if (nextFoot >= 0) {
          const e = stickyEnd(PEM_LABEL_RE, s, nextFoot + PEM_FOOT.length);
          stop = s.startsWith('-----', e) ? e + 5 : e;
        } else {
          stop = stickyEnd(PEM_BODY_RE, s, stop);
        }
        if (emit(at, stop, this.id)) return true;
        from = Math.max(at + 1, stop);
        continue;
      }
      from = Math.max(at + 1, end);
    }
  },
};

// ---------------------------------------------------------------- cặp khoá–giá trị, Bearer, userinfo URL
/**
 * MỘT nguồn luật cho tên credential trong VĂN BẢN (contracts 0a2bfff / fd1fd84, Gen 2026-10-16): tên = `CREDENTIAL_KEY_NAMES`
 * của contracts; vế trái phép gán trong chuỗi thô theo đúng ngữ pháp của contracts — giữa các phần của tên cho `[_-]*`
 * (literal kề `[_-]*` khác lớp ⇒ không backtrack), không phân biệt hoa thường, khớp ở MỌI vị trí như tham chiếu
 * `credential_assignment` (`refreshToken`, `Refresh-Token`, `REFRESH__TOKEN`, `xapi_key` đều khớp). Thêm tên ở contracts ⇒
 * bộ này tự phủ (test đối chiếu lấy chính danh sách contracts làm corpus).
 */
const REFERENCE_FIELD_SRC = [...new Set(CREDENTIAL_KEY_NAMES)]
  .map((n) => n.split(/[_-]/).map(escapeRe).join('[_-]*'))
  .join('|');
/** Phần thêm RIÊNG của security (ngoài contracts): tên chung chung ⇒ cần ranh giới trước (tránh chặn câu văn). */
const SECURITY_EXTRA_FIELD_SRC = ['set[_-]*cookie', 'cookie', 'bearer', 'auth[_-]*code'].join('|');
/** Lọc trước có / không: mọi tên khoá (contracts + phần thêm + authorization) đều chứa một trong các mảnh này. */
const FIELD_HINT_RE = /token|secret|key|passw|authorization|cookie|bearer|code/i;
const VALUE_MIN = 8;
/** (\" | " | ')? + \s* + [:=] + \s* + (\" | " | ')? — hai \s* tách nhau bởi literal, không lồng. */
const SEP_SRC = String.raw`\\?["']?\s*[:=]\s*\\?["']?`;
/** ≥ 8 ký tự giá trị (đúng lớp ký tự của VALUE_RE). */
const VALUE8_SRC = String.raw`[^\s"'${'`'}\\,;&<>{}()[\]]{8}`;
/** Ranh giới trước tên mở rộng nằm trong regex (lookbehind MỘT ký tự, không quantifier) ⇒ ứng viên hụt ranh giới không tốn vòng JS. */
const NOT_ALNUM_BEFORE = '(?<![0-9A-Za-z])';
/**
 * Nhánh 1: tên credential của contracts (mọi vị trí) + giá trị ≥ 8. Nhánh 2: tên thêm của security (cần ranh giới).
 * Nhánh 3: Authorization (+ từ lược đồ "Basic " / "Bearer " tuỳ chọn) + giá trị.
 */
const FIELD_RE_SRC = `(${REFERENCE_FIELD_SRC})${SEP_SRC}${VALUE8_SRC}|${NOT_ALNUM_BEFORE}(${SECURITY_EXTRA_FIELD_SRC})${SEP_SRC}${VALUE8_SRC}|${NOT_ALNUM_BEFORE}(authorization)${SEP_SRC}(?:[A-Za-z]{1,10}\\s)?${VALUE8_SRC}`;
/** Giá trị: ký tự không phải khoảng trắng / nháy / phân cách cấu trúc (trần 4096). */
const VALUE_RE = /[^\s"'`\\,;&<>{}()[\]]{0,4096}/y;
const SCHEME_RE = /[A-Za-z]{1,10}\s/y;

/**
 * `<tên khoá credential>["']?\s*[:=]<giá trị>`. Riêng `refresh_token` (bộ tham chiếu) chặn kể cả khi không có giá trị và
 * không cần ranh giới trước; các tên khác cần ranh giới + giá trị ≥ 8 ký tự (tránh chặn câu "đổi password: ở đâu").
 * Che: chỉ phần giá trị (giữ JSON của dòng log hợp lệ).
 */
const credentialField: Detector = {
  id: 'credential_assignment',
  strong: true,
  pre: (v) => FIELD_HINT_RE.test(v.s),
  find(v, emit) {
    const s = v.s;
    // (1) refresh_token theo đúng bộ tham chiếu: tên + (\" | " | ')? + \s* + [:=] — không cần giá trị, không cần ranh giới
    const ref = /refresh[_-]*token\\?["']?\s*[:=]/gi;
    for (let m = ref.exec(s); m; m = ref.exec(s)) {
      const vs = valueStart(s, m.index + m[0].length, false);
      const e = stickyEnd(VALUE_RE, s, vs);
      if (e > vs ? emit(vs, e, 'refresh_token_field') : emit(m.index, m.index + m[0].length, 'refresh_token_field'))
        return true;
      ref.lastIndex = Math.max(ref.lastIndex, e);
    }
    // (2) tên khoá credential + giá trị ≥ 8 ký tự NGAY TRONG regex (\s* tách bởi literal, không lồng) ⇒ JS chỉ chạy trên
    //     ứng viên thật. Nhánh 1: tên của tham chiếu `credential_assignment` (contracts) — khớp MỌI vị trí như tham chiếu;
    //     nhánh 2 (tên mở rộng) và 3 (Authorization) đòi ranh giới trước, kiểm ngay trong regex.
    const re = new RegExp(FIELD_RE_SRC, 'gi');
    for (let m = re.exec(s); m; m = re.exec(s)) {
      const at = m.index;
      const nameText = (m[1] ?? m[2] ?? m[3]) as string;
      // regex đã xác nhận tên + dấu gán + ≥ 8 ký tự giá trị. Bước code chỉ để lấy ĐÚNG đoạn giá trị cần che; nếu code
      // không xác nhận lại được (lệch tập ký tự…) ⇒ vẫn báo, che cả đoạn khớp (fail-closed, review MEDIUM)
      const nameEnd = sepAfter(s, at + nameText.length);
      const vs = nameEnd < 0 ? -1 : valueStart(s, nameEnd, m[3] !== undefined);
      const e = vs < 0 ? -1 : stickyEnd(VALUE_RE, s, vs);
      if (vs < 0 || e - vs < VALUE_MIN) {
        const stop = stickyEnd(VALUE_RE, s, at + m[0].length);
        if (emit(at, stop, this.id)) return true;
        re.lastIndex = stop;
        continue;
      }
      if (emit(vs, e, this.id)) return true;
      re.lastIndex = Math.max(re.lastIndex, e);
    }
    return false;
  },
};

/** Khoá = đúng một tên credential (ranh giới hai phía) + dấu gán; nhóm 1 = khoá. Lookaround một ký tự, không quantifier. */
/**
 * Tên credential cũng là từ thường trong câu văn — contracts 3af4e6a (Gen duyệt): `password` / `passwd` chỉ bắt khi là
 * KHOÁ object hoặc phép gán giá trị ≥ 8 ("password: tối thiểu 12 ký tự", "password = short" không chặn) ⇒ không áp luật
 * giá trị ngắn bên dưới (luật ≥ 8 của credential_assignment vẫn áp).
 */
const PROSE_CREDENTIAL_NAMES: ReadonlySet<string> = new Set(['password', 'passwd']);
const SHORT_VALUE_FIELD_SRC = CREDENTIAL_KEY_NAMES.filter((n) => !PROSE_CREDENTIAL_NAMES.has(n))
  .map((n) => n.split(/[_-]/).map(escapeRe).join('[_-]*'))
  .join('|');
const KEY_ASSIGN_RE_SRC = `(?<![A-Za-z0-9_-])(${SHORT_VALUE_FIELD_SRC})(?![A-Za-z0-9_-])${SEP_SRC}`;
/** Giá trị có nháy: tới nháy đóng cùng loại (trần 4096). */
const DQ_VALUE_RE = /[^"]{0,4096}/y;
const SQ_VALUE_RE = /[^']{0,4096}/y;
/** Giá trị literal JSON không phải bí mật. */
const JSON_LITERAL_RE = /(?:null|true|false)(?![A-Za-z0-9_])/y;

/**
 * Phép gán mà KHOÁ là đúng một tên credential theo `isCredentialKeyName` của contracts (trừ PROSE_CREDENTIAL_NAMES; cả
 * khoá — `MAX_TOKEN`,
 * `my_access_token`, `apikeys` không tính), giá trị dài BẤT KỲ, kể cả < 8 ký tự (L-RT 2026-10-16: runner bỏ rào riêng
 * `credentialKeyAssignment`, chỉ còn một nguồn). Dạng khoá rõ ràng: `"name": "…"` / `'name': '…'` (kể cả `\"` của JSON
 * lồng), `name=…`, `name: …`. Chữ trong tên viết `\uXXXX` ⇒ bước giải (≤ 3 lớp) đưa về các dạng này. Không có giá trị
 * (`"api_key": ""`, `api_key:` cuối dòng, `api_key: ,`) hay giá trị là `null` / `true` / `false` ⇒ không bắt.
 * Che: giá trị có nháy ⇒ tới nháy đóng; không nháy ⇒ đoạn VALUE_RE; giá trị mở đầu bằng `{` `[` `\` … ⇒ chỉ báo (đoạn che
 * rỗng, giữ JSON hợp lệ). Ứng viên regex bắt đầu bằng tên literal; mỗi giá trị quét một lần (lastIndex nhảy qua) ⇒ tuyến tính.
 */
const credentialKeyAssignment: Detector = {
  id: 'credential_field_name',
  strong: true,
  pre: (v) => /token|secret|key/i.test(v.s),
  find(v, emit) {
    const s = v.s;
    const re = new RegExp(KEY_ASSIGN_RE_SRC, 'gi');
    for (let m = re.exec(s); m; m = re.exec(s)) {
      if (!isCredentialKeyName(m[1] as string)) continue;
      const vs = m.index + m[0].length;
      const q = s.charCodeAt(vs - 1);
      let e: number;
      if (q === 34 || q === 39) {
        // giá trị có nháy: rỗng (nháy đóng ngay, hoặc `\"` đóng của JSON lồng) ⇒ không phải phép gán có giá trị
        e = stickyEnd(q === 34 ? DQ_VALUE_RE : SQ_VALUE_RE, s, vs);
        if (e > vs && s.charCodeAt(e - 1) === 92) e--;
        if (e <= vs) continue;
      } else {
        const c = s.charCodeAt(vs);
        if (vs >= s.length || isSpace(c) || c === 44 || c === 59 || c === 125 || c === 93 || c === 41) continue;
        if (stickyEnd(JSON_LITERAL_RE, s, vs) > vs) continue;
        e = stickyEnd(VALUE_RE, s, vs);
      }
      if (emit(vs, e, this.id)) return true;
      re.lastIndex = Math.max(re.lastIndex, e);
    }
    return false;
  },
};

/** Vị trí ngay sau dấu [:=] theo sau tên khoá (bỏ \ " ' và khoảng trắng); -1 nếu không có. */
function sepAfter(s: string, i: number): number {
  if (s.charCodeAt(i) === 92) i++;
  if (s.charCodeAt(i) === 34 || s.charCodeAt(i) === 39) i++;
  while (i < s.length && isSpace(s.charCodeAt(i))) i++;
  const c = s.charCodeAt(i);
  return c === 58 || c === 61 ? i + 1 : -1;
}

/** Đầu giá trị sau dấu [:=]: bỏ khoảng trắng, \ " ', và (với Authorization) từ chỉ lược đồ "Basic " / "Bearer ". */
function valueStart(s: string, i: number, skipScheme: boolean): number {
  while (i < s.length && isSpace(s.charCodeAt(i))) i++;
  if (s.charCodeAt(i) === 92) i++;
  if (s.charCodeAt(i) === 34 || s.charCodeAt(i) === 39) i++;
  if (skipScheme) {
    const w = stickyEnd(SCHEME_RE, s, i);
    if (w > i) i = w;
  }
  return i;
}

/**
 * Gán biến môi trường bí mật (contracts `env_secret_assignment`, c4285e8):
 *   `\b[A-Z][A-Z0-9_]*_(?:SECRET|TOKEN|PASSWORD|PASSWD|KEY|PAT)\s*[:=]\s*["']?[^\s"']{8}`
 * Bộ này ⊇ tham chiếu: bắt đầu từ hậu tố literal (tên phía trước bất kỳ, không đòi chữ hoa đầu), cho thêm `\"` / nháy
 * quanh tên của JSON lồng; giá trị PHẢI ≥ 8 ký tự [^\s"'] như tham chiếu — `MAX_TOKEN=4096` là cấu hình, không chặn.
 * Regex bắt đầu bằng hậu tố literal, `{8}` có trần ⇒ tuyến tính.
 */
const ENV_SECRET_RE = /_(?:SECRET|TOKEN|PASSWORD|PASSWD|KEY|PAT)\\?["']?\s*[:=]\s*\\?["']?[^\s"']{8}/g;
const ENV_VALUE_RE = /[^\s"']*/y;

const envSecretAssignment: Detector = {
  id: 'env_secret_assignment',
  strong: true,
  pre: (v) => /_(?:SECRET|TOKEN|PASSW|KEY|PAT)/.test(v.s),
  find(v, emit) {
    const s = v.s;
    const re = new RegExp(ENV_SECRET_RE.source, 'g');
    for (let m = re.exec(s); m; m = re.exec(s)) {
      const vs = m.index + m[0].length - 8;
      const e = stickyEnd(ENV_VALUE_RE, s, vs);
      if (emit(vs, e, this.id)) return true;
      re.lastIndex = Math.max(re.lastIndex, e);
    }
    return false;
  },
};

const BEARER_TOKEN_RE = /[0-9A-Za-z_.~+/=-]*/y;

/** `Bearer <token ≥ 16>` (header HTTP trong log / payload). */
const bearerToken: Detector = {
  id: 'bearer_token',
  strong: true,
  pre: (v) => /bearer/i.test(v.s),
  find(v, emit) {
    const s = v.s;
    // khoảng cách = `\s` (⊇ `[ \t]` của contracts): NBSP / U+3000 / U+FEFF… sau "Bearer" cũng là dấu cách (review MEDIUM)
    const re = /bearer\s{1,16}[0-9A-Za-z_.~+/=-]{16}/gi;
    for (let m = re.exec(s); m; m = re.exec(s)) {
      if (!v.boundaryBefore(m.index)) {
        re.lastIndex = m.index + 1;
        continue;
      }
      const i = m.index + 6 + (/^\s+/.exec(m[0].slice(6))?.[0].length ?? 0);
      const e = stickyEnd(BEARER_TOKEN_RE, s, i);
      if (emit(i, e, this.id)) return true;
      re.lastIndex = e;
    }
    return false;
  },
};

const isTabNl = (c: number) => c === 9 || c === 10 || c === 13;
/** TAB / LF / CR chen được ở mọi chỗ (parser URL bỏ chúng). Đứng giữa hai literal khác lớp ⇒ không mơ hồ, không backtrack. */
const URL_TNL = '[\\t\\n\\r]*';
/**
 * Ứng viên A: tên scheme + ':' ở BẤT KỲ đâu (không cần ranh giới trái: `1.https:`, `x.ftp:` đều tính), không phân biệt
 * hoa thường. `https` / `wss` đứng trước `http` / `ws` (nhánh riêng, không `s?` kề `[\t\n\r]*`).
 */
const URL_A_SRC = ['https', 'http', 'wss', 'ws', 'ftp', 'file']
  .map((name) => `${[...name].join(URL_TNL)}${URL_TNL}:`)
  .join('|');
/** Ứng viên B: mọi `://`. */
const URL_B_SRC = `:${URL_TNL}/${URL_TNL}/`;
/** Ký tự hết authority — A: `/ \ ? #` hoặc khoảng trắng (`\s` trừ TAB / LF / CR, kể cả NBSP); B: như A nhưng `\` không cắt. */
const URL_STOP_A_RE = /[/\\?#]|[^\S\t\n\r]/g;
const URL_STOP_B_RE = /[/?#]|[^\S\t\n\r]/g;

/** Bảng ký tự dừng ASCII (1 = dừng) cho vòng lùi; ngoài ASCII dùng `isSpace` (= `\s`). */
const asciiStopTable = (backslash: boolean): Uint8Array => {
  const t = new Uint8Array(128);
  for (const c of [47, 63, 35, 11, 12, 32]) t[c] = 1;
  if (backslash) t[92] = 1;
  return t;
};
const URL_STOP_A_TABLE = asciiStopTable(true);
const URL_STOP_B_TABLE = asciiStopTable(false);

/**
 * Bộ kiểm authority cho MỘT loại ứng viên. Điểm đầu authority p tăng ngặt giữa các ứng viên cùng loại ⇒ q ('@' đầu tiên
 * ≥ p), điểm hết authority, '@' cuối trước điểm hết đều chỉ tiến:
 *   - không còn '@' ≥ p ⇒ `null` (không ứng viên nào sau đó có thể khớp);
 *   - điểm hết = điểm dừng đầu tiên ≥ p (regex gốc, nhớ lại khi p chưa vượt qua);
 *   - authority hết TRƯỚC q ⇒ lùi MỘT lần từ q tìm điểm dừng cuối trước q ⇒ ứng viên sau cùng q có p ≤ điểm đó bị loại
 *     trong O(1) (chuỗi kiểu `x://x://…@` không tốn một lần regex mỗi ứng viên). Mỗi đoạn lùi nằm giữa điểm dừng đã biết và
 *     q, các đoạn không chồng nhau ⇒ tuyến tính.
 * Trả '@' cuối trong authority, hoặc -1 nếu authority không có '@'.
 */
function authorityScanner(s: string, stopRe: RegExp, table: Uint8Array) {
  let q = s.indexOf('@');
  let endAt = -1;
  let stopQ = -1;
  let stopBeforeQ = -1;
  let atLast = -1;
  let atNext = q;
  return (p: number): number | null => {
    while (q >= 0 && q < p) q = s.indexOf('@', q + 1);
    if (q < 0) return null;
    if (p > endAt) {
      if (stopQ === q && stopBeforeQ >= p) return -1;
      stopRe.lastIndex = p;
      endAt = stopRe.test(s) ? stopRe.lastIndex - 1 : s.length;
      if (endAt < q && stopQ !== q) {
        let k = q - 1;
        for (; k > endAt; k--) {
          const c = s.charCodeAt(k);
          if (c < 128 ? table[c] === 1 : isSpace(c)) break;
        }
        stopQ = q;
        stopBeforeQ = k;
      }
    }
    if (q >= endAt) return -1;
    while (atNext >= 0 && atNext < endAt) {
      atLast = atNext;
      atNext = s.indexOf('@', atNext + 1);
    }
    return atLast;
  };
}

/**
 * Mật khẩu trong URL — xấp xỉ TRÊN của parser URL (fail-closed; thuật toán chung với contracts, Gen 2026-10-16, sau ba
 * vòng security review parser-differential):
 *   1. TAB / LF / CR coi như không có (parser URL bỏ chúng ở mọi chỗ);
 *   2. ứng viên A: `http: https: ws: wss: ftp: file:` ở BẤT KỲ đâu, bỏ qua `[/\\]*` (kể cả 0 dấu); authority hết ở
 *      `/ \ ? #` hoặc khoảng trắng;
 *   3. ứng viên B: mọi `://`; authority hết ở `/ ? #` hoặc khoảng trắng;
 *   4. authority có '@', đoạn trước '@' CUỐI có ':' ⇒ báo; che từ sau ':' ĐẦU TIÊN tới '@' cuối (mật khẩu rỗng ⇒ vẫn báo,
 *      đoạn che rỗng nên không che gì).
 * Lệch có chủ đích với parser: khoảng trắng thô cắt authority (parser percent-encode khoảng trắng trong userinfo) — quét văn
 * bản mà không dừng ở khoảng trắng thì câu thường ("ws: lúc 10:30 gửi a@b") bị chặn nhầm.
 * Tuyến tính: ứng viên tìm bằng regex gốc (`test` + `lastIndex`, không cấp phát); mỗi ứng viên O(1) ngoài các con trỏ chỉ
 * tiến; ':' đầu tiên ≥ p nằm trước ':' của ứng viên kế tiếp (đoạn bỏ qua chỉ gồm `/ \` TAB LF CR).
 */
const urlUserinfo: Detector = {
  id: 'url_userinfo',
  strong: true,
  pre: (v) => v.s.includes('@') && v.s.includes(':'),
  find(v, emit) {
    const s = v.s;
    const n = s.length;
    const run = (re: RegExp, skipSlashes: boolean, scan: (p: number) => number | null): boolean => {
      let lastEmitted = -1;
      while (re.test(s)) {
        let p = re.lastIndex;
        while (skipSlashes && p < n) {
          const c = s.charCodeAt(p);
          if (c === 47 || c === 92 || isTabNl(c)) p++;
          else break;
        }
        const lastAt = scan(p);
        if (lastAt === null) return false;
        // cùng '@' cuối với đoạn vừa báo ⇒ đoạn mới nằm trong đoạn cũ (bắt đầu muộn hơn, cùng điểm cuối) — bỏ
        if (lastAt < p || lastAt === lastEmitted) continue;
        const colon = s.indexOf(':', p);
        if (colon < 0 || colon >= lastAt) continue;
        lastEmitted = lastAt;
        if (emit(colon + 1, lastAt, 'url_userinfo')) return true;
      }
      return false;
    };
    return (
      run(new RegExp(URL_A_SRC, 'gi'), true, authorityScanner(s, URL_STOP_A_RE, URL_STOP_A_TABLE)) ||
      run(new RegExp(URL_B_SRC, 'g'), false, authorityScanner(s, URL_STOP_B_RE, URL_STOP_B_TABLE))
    );
  },
};

// ---------------------------------------------------------------- canary, entropy cao
const CANARY_TAIL_RE = /[0-9a-fA-F-]*/y;

/** Canary do CLI giả ghi: `GA-CANARY-<uuid>` (contracts: `/GA-CANARY-[0-9a-f-]{8}/i`). Che hết phần [0-9a-f-]. */
const canary: Detector = {
  id: 'canary',
  strong: true,
  pre: (v) => /ga-canary-/i.test(v.s),
  find(v, emit) {
    const s = v.s;
    const re = /GA-CANARY-[0-9a-f-]{8}/gi;
    for (let m = re.exec(s); m; m = re.exec(s)) {
      const e = stickyEnd(CANARY_TAIL_RE, s, m.index + m[0].length);
      if (emit(m.index, e, this.id)) return true;
      re.lastIndex = e;
    }
    return false;
  },
};

/**
 * Đoạn [0-9A-Za-z_-] tối đại dài ≥ 32 có đủ chữ hoa + chữ thường + chữ số (CNS-169) và có ít nhất một ký tự NGOÀI
 * [0-9a-fA-F-] ⇒ hex thuần / UUID (kể cả hex trộn hoa thường) không bao giờ khớp. Vòng lặp JS DUY NHẤT theo từng ký tự.
 */
const highEntropy: Detector = {
  id: 'high_entropy_run',
  strong: false,
  pre: () => true,
  find(v, emit) {
    for (const [a, b] of v.runScan().entropy) if (emit(a, b, this.id)) return true;
    return false;
  },
};

/** Đoạn tối đại trên lớp base64 [A-Za-z0-9+/=_-] ≥ 40 (lookbehind một ký tự ⇒ chỉ thử ở đầu đoạn, tuyến tính) — = contracts. */
const BASE64_RUN_SRC = '(?<![A-Za-z0-9+/=_-])[A-Za-z0-9+/=_-]{40,}';
const SEG_DIGIT_RE = /\d/;
const SEG_LOWER_RE = /[a-z]/;
const SEG_UPPER_RE = /[A-Z]/;
const SEG_NON_HEX_RE = /[G-Zg-z]/;

/** Đủ hoa + thường + số, có chữ ngoài hex, và ≥ 1/4 cặp chữ / số liền kề đổi lớp (hoa ↔ thường ↔ số) — = contracts. */
function isBase64LikeSegment(seg: string): boolean {
  if (!SEG_DIGIT_RE.test(seg) || !SEG_LOWER_RE.test(seg) || !SEG_UPPER_RE.test(seg) || !SEG_NON_HEX_RE.test(seg)) {
    return false;
  }
  let pairs = 0;
  let changes = 0;
  let prev = -1; // 0 = hoa, 1 = thường, 2 = số, -1 = ký tự khác
  for (let i = 0; i < seg.length; i++) {
    const c = seg.charCodeAt(i);
    const cls = isUpper(c) ? 0 : isLower(c) ? 1 : isDigit(c) ? 2 : -1;
    if (cls >= 0 && prev >= 0) {
      pairs++;
      if (cls !== prev) changes++;
    }
    prev = cls;
  }
  return pairs > 0 && changes * 4 >= pairs;
}

/**
 * Secret base64 chuẩn có `+` / `/` (contracts `base64_secret_run`, review tay M0): đoạn [A-Za-z0-9+/=_-] ≥ 40 có `+` hoặc
 * `/`, có một đoạn con giữa hai `/` dài ≥ 10 thoả `isBase64LikeSegment`. Đoạn con duyệt bằng indexOf trên chính đoạn (không cấp
 * phát mảng như split, không quét ra ngoài đoạn) — chỉ cắt chuỗi con khi dài ≥ 10. Che: cả đoạn base64.
 */
const base64SecretRun: Detector = {
  id: 'base64_secret_run',
  strong: false,
  pre: (v) => v.s.includes('/') || v.s.includes('+'),
  find(v, emit) {
    const s = v.s;
    const re = new RegExp(BASE64_RUN_SRC, 'g');
    for (let m = re.exec(s); m; m = re.exec(s)) {
      const r = m[0];
      if (!r.includes('/') && !r.includes('+')) continue;
      let hit = false;
      for (let a = 0; a <= r.length && !hit; ) {
        let b = r.indexOf('/', a);
        if (b < 0) b = r.length;
        if (b - a >= 10 && isBase64LikeSegment(r.slice(a, b))) hit = true;
        a = b + 1;
      }
      if (hit && emit(m.index, m.index + r.length, this.id)) return true;
    }
    return false;
  },
};

/** Thứ tự: mẫu cụ thể trước (id có nghĩa cho audit), luật entropy / base64 cuối. */
export const DETECTORS: readonly Detector[] = [
  jwt,
  knownPrefixes,
  awsAccessKey,
  telegramBotToken,
  pemPrivateKey,
  credentialField,
  credentialKeyAssignment,
  envSecretAssignment,
  bearerToken,
  urlUserinfo,
  canary,
  highEntropy,
  base64SecretRun,
];

/** Mọi id mẫu có thể trả về (id của luật tiền tố + các bộ khác; `refresh_token_field` do bộ gán credential phát). */
export const DETECTOR_IDS: readonly string[] = [
  ...new Set(
    DETECTORS.flatMap((d) =>
      d === knownPrefixes
        ? PREFIX_RULES.map((r) => r.id)
        : d === credentialField
          ? ['refresh_token_field', 'credential_assignment']
          : [d.id],
    ),
  ),
];

/**
 * Id mẫu ghi vào audit `credential.blocked` phải thuộc `CREDENTIAL_PATTERN_IDS` của contracts. Id trùng giữ nguyên;
 * `encoded:<id>` ⇒ id bên trong; id chỉ có ở bộ dùng chung ⇒ id gần nghĩa nhất (đề xuất L0 thêm vào contracts).
 */
const AUDIT_ID_FALLBACK: Readonly<Record<string, CredentialPatternId>> = {
  npm_token: 'generic_sk_key',
  huggingface_token: 'generic_sk_key',
  google_oauth_client_secret: 'generic_sk_key',
  bearer_token: 'credential_assignment',
  url_userinfo: 'credential_assignment',
  encoded_marker_flood: 'high_entropy_run',
};

export function auditPatternId(id: string): CredentialPatternId {
  if (id.startsWith('encoded:')) return auditPatternId(id.slice('encoded:'.length));
  if ((CREDENTIAL_PATTERN_IDS as readonly string[]).includes(id)) return id as CredentialPatternId;
  return AUDIT_ID_FALLBACK[id] ?? 'high_entropy_run';
}

function runDetectorsOn(v: View, emit: Emit, strongOnly = false): boolean {
  for (const d of DETECTORS) if ((!strongOnly || d.strong) && d.pre(v) && d.find(v, emit)) return true;
  return false;
}

function runDetectors(text: string, emit: Emit, strongOnly = false): boolean {
  return runDetectorsOn(new View(text), emit, strongOnly);
}

// ---------------------------------------------------------------- (a) chuẩn hoá (giải tới 3 lớp)
/**
 * Một lớp giải: %XX, %uXXXX, \uXXXX, \xXX, \\ \/ \" \' \n \r \t, &#NN; / &#xHH;, bỏ ký tự độ rộng 0, gập fullwidth.
 * `\\` giải thành `\` (đúng ngữ nghĩa JSON) ⇒ `\\u0072efresh_token` (JSON lồng 2 lớp) qua lớp 1 thành `refresh_token`,
 * qua lớp 2 thành `refresh_token`. Mỗi lớp là MỘT lượt replace (regex chỉ có quantifier có trần) ⇒ tuyến tính.
 */
const ESC_RE =
  /%u[0-9A-Fa-f]{4}|%[0-9A-Fa-f]{2}|\\u[0-9A-Fa-f]{4}|\\x[0-9A-Fa-f]{2}|\\[\\nrt/"']|&#[xX][0-9A-Fa-f]{1,6};|&#[0-9]{1,7};|[\u200b-\u200d\u2060\ufeff\u00ad]|[\uff01-\uff5e]|[\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/g;
/** Số lớp giải tối đa (JSON / percent lồng tới 3 lớp). Mỗi lớp chỉ chạy khi lớp trước còn thay đổi chuỗi. */
export const MAX_DECODE_LAYERS = 3;

function decodeEntity(e: string, hex?: string, dec?: string): string {
  const cp = hex !== undefined ? Number.parseInt(hex, 16) : Number.parseInt(dec as string, 10);
  return cp <= 0x10ffff ? String.fromCodePoint(cp) : e;
}

function decodeEscape(e: string): string {
  const c0 = e.charCodeAt(0);
  if (c0 === 37) return String.fromCharCode(Number.parseInt(e[1] === 'u' ? e.slice(2) : e.slice(1), 16));
  if (c0 === 92) {
    const k = e[1];
    if (k === 'u' || k === 'x') return String.fromCharCode(Number.parseInt(e.slice(2), 16));
    return k === 'n' ? '\n' : k === 'r' ? '\r' : k === 't' ? '\t' : (k as string);
  }
  if (c0 === 38) {
    const hex = e[2] === 'x' || e[2] === 'X';
    return decodeEntity(e, hex ? e.slice(3, -1) : undefined, hex ? undefined : e.slice(2, -1));
  }
  if (c0 >= 0xff01 && c0 <= 0xff5e) return String.fromCharCode(c0 - 0xfee0);
  if (isSpace(c0) && c0 !== 0xfeff) return ' '; // khoảng trắng Unicode ⇒ ' '
  return ''; // ký tự độ rộng 0
}

/** Có gì để giải không (một lượt regex gốc, không cấp phát). */
const NEEDS_NORM_RE =
  /[%\\&\u200b-\u200d\u2060\ufeff\u00ad\uff01-\uff5e\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/;
/**
 * Khoảng trắng Unicode (trừ U+FEFF — bị BỎ như ký tự độ rộng 0 để token bị chèn U+FEFF vẫn liền lại; vai trò dấu cách của
 * nó đã được `isSpace` = `\s` phủ) ⇒ gập thành ' ' (review MEDIUM: NBSP / U+2000–U+200A / U+3000 làm dấu phân cách).
 */
const UNICODE_SPACE_CHARS: readonly string[] = [
  0xa0,
  0x1680,
  ...Array.from({ length: 11 }, (_, i) => 0x2000 + i),
  0x2028,
  0x2029,
  0x202f,
  0x205f,
  0x3000,
].map((c) => String.fromCharCode(c));
const FULLWIDTH_RE = /[\uff01-\uff5e]/g;
const ENTITY_RE = /&#[xX]([0-9A-Fa-f]{1,6});|&#([0-9]{1,7});/g;
/**
 * Bước giải cần callback JS mỗi lần khớp (entity HTML, fullwidth) chỉ chạy với chuỗi ≤ 64 Ki ký tự — phủ MỌI lối ra
 * (chuỗi tool ≤ 16 Ki, tin Telegram ≤ 4096). Dòng log lớn hơn chỉ qua các bước giải gốc (\u, \x, \\, %, độ rộng 0).
 */
export const CALLBACK_DECODE_MAX_CHARS = 65_536;
/** Trần số chuỗi thoát mỗi lớp ở đường chậm (che có vị trí); vượt ⇒ che cả chuỗi (mặc định chặn), không giải từng cái. */
export const MAX_MAPPED_ESCAPES = 65_536;

/**
 * Bước giải literal của đường nhanh, đúng ngữ nghĩa JSON từng lớp: `\\` → ký tự giữ chỗ (để `\u` phía sau KHÔNG ăn mất
 * dấu `\` vừa giải — `\\u0072` qua một lớp phải ra `\u0072`, không ra `\r`), rồi `\"` `\'` `\/`, rồi `\u` → `%u` và
 * `\x` → `%` cho `unescape` giải (chuỗi không hợp lệ như `%user` được giữ nguyên), bỏ ký tự độ rộng 0; cuối lớp trả ký tự
 * giữ chỗ về `\`.
 */
const BACKSLASH_PLACEHOLDER = '\u0001';
const QUICK_LITERAL_STEPS: ReadonlyArray<readonly [string, string]> = [
  ['\\\\', BACKSLASH_PLACEHOLDER],
  ['\\"', '"'],
  ["\\'", "'"],
  ['\\/', '/'],
  ['\\u', '%u'],
  ['\\x', '%'],
  ...[0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0x00ad].map((c) => [String.fromCharCode(c), ''] as const),
];

/**
 * Đường nhanh (chỉ để PHÁT HIỆN): mỗi lớp toàn bước gốc của V8 (split/join, `unescape`); callback JS chỉ cho entity HTML /
 * fullwidth ở chuỗi ≤ CALLBACK_DECODE_MAX_CHARS. Lớp chỉ lặp khi lớp trước còn đổi chuỗi; ≤ MAX_DECODE_LAYERS lớp.
 * null = không có gì để giải. Kết quả có thể rộng hơn ngữ nghĩa JSON (vd `\u` không hợp lệ) — chỉ làm phát hiện rộng hơn.
 */
function quickNormalize(s: string): string | null {
  if (!NEEDS_NORM_RE.test(s)) return null;
  let t = s;
  for (let k = 0; k < MAX_DECODE_LAYERS; k++) {
    let x = t;
    // split/join (memchr gốc) nhanh hơn nhiều so với regex replace khi chuỗi thoát dồn dập
    for (const [from, to] of QUICK_LITERAL_STEPS) if (x.includes(from)) x = x.split(from).join(to);
    if (x.includes('%')) x = unescape(x);
    if (x.includes(BACKSLASH_PLACEHOLDER)) x = x.split(BACKSLASH_PLACEHOLDER).join('\\');
    x = foldUnicodeSpaces(x); // khoảng trắng Unicode do lớp này giải ra (vd `&#160;`, `\u3000`) ⇒ ' '
    if (x.length <= CALLBACK_DECODE_MAX_CHARS) {
      if (x.includes('&#')) x = x.replace(ENTITY_RE, decodeEntity);
      x = x.replace(FULLWIDTH_RE, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
    }
    if (x === t) break;
    t = x;
    if (!NEEDS_NORM_RE.test(t)) break;
  }
  return t === s ? null : t;
}

interface Mapped {
  text: string;
  /** vị trí đầu (trong chuỗi trước lớp này) của ký tự `p` sau khi giải */
  mapStart(p: number): number;
  /** vị trí cuối (loại trừ, trong chuỗi trước lớp này) của ký tự `p` sau khi giải */
  mapEnd(p: number): number;
}

/**
 * Đường chậm (chỉ khi chuỗi đã giải CÓ khớp và cần vị trí để che): giải MỘT lớp kèm bản đồ vị trí theo đoạn.
 * Chi phí theo số chuỗi thoát; null = lớp này không đổi gì.
 */
function normalizeWithMap(s: string): Mapped | null {
  const parts: string[] = [];
  const nStart: number[] = [];
  const oStart: number[] = [];
  const oEnd: number[] = [];
  const copy: boolean[] = [];
  let n = 0;
  let last = 0;
  let changed = false;
  const pushCopy = (a: number, b: number) => {
    parts.push(s.slice(a, b));
    nStart.push(n);
    oStart.push(a);
    oEnd.push(b);
    copy.push(true);
    n += b - a;
  };
  const re = new RegExp(ESC_RE.source, 'g');
  let count = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (++count > MAX_MAPPED_ESCAPES) throw new TooManyEscapes();
    changed = true;
    if (m.index > last) pushCopy(last, m.index);
    const d = decodeEscape(m[0]);
    for (let k = 0; k < d.length; k++) {
      nStart.push(n + k);
      oStart.push(m.index);
      oEnd.push(m.index + m[0].length);
      copy.push(false);
    }
    parts.push(d);
    n += d.length;
    last = m.index + m[0].length;
  }
  if (!changed) return null;
  if (last < s.length) pushCopy(last, s.length);
  const seg = (p: number): number => {
    let lo = 0;
    let hi = nStart.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((nStart[mid] as number) <= p) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  return {
    text: parts.join(''),
    mapStart: (p) => {
      const i = seg(p);
      return copy[i] ? (oStart[i] as number) + p - (nStart[i] as number) : (oStart[i] as number);
    },
    mapEnd: (p) => {
      const i = seg(p);
      return copy[i] ? (oStart[i] as number) + p - (nStart[i] as number) + 1 : (oEnd[i] as number);
    },
  };
}

class TooManyEscapes extends Error {}

/**
 * Giải tới MAX_DECODE_LAYERS lớp, ghép bản đồ vị trí các lớp ⇒ vị trí trong chuỗi gốc. null = không có gì để giải HOẶC
 * quá MAX_MAPPED_ESCAPES chuỗi thoát (người gọi che cả chuỗi).
 */
function decodeLayersWithMap(s: string): Mapped | null {
  const layers: Mapped[] = [];
  let t = s;
  for (let k = 0; k < MAX_DECODE_LAYERS; k++) {
    let m: Mapped | null;
    try {
      m = normalizeWithMap(t);
    } catch (e) {
      if (e instanceof TooManyEscapes) return null;
      throw e;
    }
    if (!m) break;
    layers.push(m);
    t = m.text;
  }
  if (layers.length === 0) return null;
  return {
    text: t,
    mapStart: (p) => {
      let q = p;
      for (let i = layers.length - 1; i >= 0; i--) q = (layers[i] as Mapped).mapStart(q);
      return q;
    },
    mapEnd: (p) => {
      let idx = p;
      let end = p + 1;
      for (let i = layers.length - 1; i >= 0; i--) {
        end = (layers[i] as Mapped).mapEnd(idx);
        idx = end - 1;
      }
      return end;
    },
  };
}

// ---------------------------------------------------------------- (b) dấu hiệu mạnh ở dạng mã hoá
/** Dấu hiệu ≥ 4 byte có thể bị Role mã hoá để lách (canary hai dạng hoa / thường). */
const ENCODED_MARKERS = [
  'GA-CANARY-',
  'ga-canary-',
  'sk-ant-',
  'ya29.',
  '1//0',
  'AIza',
  '-----BEGIN ',
  'PRIVATE KEY',
  'refresh_token',
];

interface Needle {
  text: string;
  kind: 'b64' | 'hex';
  /** khoảng cách từ đầu nhóm 4 ký tự base64 tới đầu kim */
  groupStart: number;
}

/** Kim base64 (3 độ lệch căn × chuẩn / url-safe) + hex (thường / hoa) — chỉ phần ký tự KHÔNG phụ thuộc byte lân cận. */
function buildNeedles(): Needle[] {
  const out: Needle[] = [];
  for (const marker of ENCODED_MARKERS) {
    const m = Buffer.from(marker, 'latin1');
    for (let a = 0; a < 3; a++) {
      const e1 = Buffer.concat([Buffer.alloc(a, 0x00), m, Buffer.alloc(2, 0x00)]).toString('base64');
      const e2 = Buffer.concat([Buffer.alloc(a, 0xff), m, Buffer.alloc(2, 0xff)]).toString('base64');
      let i = 0;
      while (i < e1.length && e1[i] !== e2[i]) i++;
      let j = i;
      while (j < e1.length && e1[j] === e2[j]) j++;
      const text = e1.slice(i, j);
      if (text.length < 4) continue;
      out.push({ text, kind: 'b64', groupStart: i });
      const url = text.replace(/\+/g, '-').replace(/\//g, '_');
      if (url !== text) out.push({ text: url, kind: 'b64', groupStart: i });
    }
    const hex = m.toString('hex');
    out.push({ text: hex, kind: 'hex', groupStart: 0 }, { text: hex.toUpperCase(), kind: 'hex', groupStart: 0 });
  }
  return out;
}
const NEEDLES = buildNeedles();

/** Cửa sổ giải mã quanh kim (đủ cho dấu hiệu + phần đuôi mà bộ mạnh cần, vd 30 ký tự sau AIza, 8 hex sau canary). */
const WINDOW_BYTES = 192;

function decodeWindow(s: string, at: number, n: Needle): string {
  if (n.kind === 'hex') return Buffer.from(s.slice(at, at + WINDOW_BYTES * 2), 'hex').toString('latin1');
  const start = at - n.groupStart;
  const pad = start < 0 ? 'A'.repeat((4 - (-start % 4)) % 4 || 4) : '';
  const from = Math.max(0, start);
  const chunk = s.slice(from, from + Math.ceil(WINDOW_BYTES / 3) * 4);
  return Buffer.from(pad + chunk, 'base64').toString('latin1');
}

/** Biên đoạn base64 (hoặc hex) chứa vị trí `at` — dùng để che cả đoạn mã hoá. */
function encodedRunBounds(s: string, at: number): [number, number] {
  let a = at;
  while (a > 0 && isB64Char(s.charCodeAt(a - 1))) a--;
  let b = at;
  while (b < s.length && isB64Char(s.charCodeAt(b))) b++;
  while (b < s.length && b - at < 2 + 4096 && s.charCodeAt(b) === 61) b++;
  return [a, b];
}

/**
 * Trần số lần xác nhận kim mỗi chuỗi. Văn bản / base64 / hex ngẫu nhiên 1 MB gần như không chạm kim nào (kim ≥ 4 ký tự
 * base64 hoặc ≥ 8 ký tự hex); vượt trần chỉ xảy ra khi bị dựng có chủ đích ⇒ mặc định chặn (coi cả chuỗi là khớp).
 */
const MAX_NEEDLE_CONFIRMS = 256;

/**
 * Kim chỉ tính khi nằm trong đoạn base64 ≥ 16 (từ lượt quét ký tự). Không có đoạn nào (văn bản thường) ⇒ bỏ qua hẳn;
 * có ⇒ indexOf từng kim trên chuỗi gốc (memchr gốc) rồi tìm nhị phân xem trúng có nằm trong đoạn không.
 */
function scanEncoded(s: string, ranges: ReadonlyArray<[number, number]>, emit: Emit): boolean {
  if (ranges.length === 0) return false;
  /** vị trí `at` có nằm trong một đoạn base64 ≥ 16 không — tìm nhị phân (ranges đã sắp tăng). */
  const inRange = (at: number): boolean => {
    let lo = 0;
    let hi = ranges.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((ranges[mid] as [number, number])[0] <= at) lo = mid;
      else hi = mid - 1;
    }
    const r = ranges[lo] as [number, number];
    return at >= r[0] && at < r[1];
  };
  const done: Array<[number, number]> = [];
  let confirms = 0;
  for (const n of NEEDLES) {
    let from = 0;
    for (;;) {
      const at = s.indexOf(n.text, from);
      if (at < 0) break;
      from = at + 1;
      if (!inRange(at) || done.some(([a, b]) => at >= a && at < b)) continue;
      if (++confirms > MAX_NEEDLE_CONFIRMS) return emit(0, s.length, 'encoded_marker_flood');
      let hit: string | null = null;
      runDetectors(
        decodeWindow(s, at, n),
        (_a, _b, id) => {
          hit = id;
          return true;
        },
        true,
      );
      if (!hit) continue;
      const [a, b] = encodedRunBounds(s, at);
      done.push([a, b]);
      if (emit(a, b, `encoded:${hit}`)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- API quét
export type TextScanResult =
  | { status: 'clean' }
  | { status: 'match'; patternId: string; spans: CredentialSpan[] }
  | { status: 'too_large'; length: number };

/** Có ký tự ngoài ASCII in được (+ TAB / LF / CR) — chỉ khi đó NFKC mới có thể đổi chuỗi. */
const NON_ASCII_RE = /[^\t\n\r\x20-\x7e]/;
/** Khoảng trắng Unicode cần gập (lớp ký tự dựng lúc chạy từ UNICODE_SPACE_CHARS, không có ký tự lạ trong mã nguồn). */
const UNICODE_SPACE_G_RE = new RegExp(`[${UNICODE_SPACE_CHARS.join('')}]`, 'g');

/**
 * Gập khoảng trắng Unicode (NBSP, U+1680, U+2000–U+200A, U+2028/9, U+202F, U+205F, U+3000) thành ' ' TRƯỚC mọi lượt quét
 * (review MEDIUM parser-differential, bước b). Thay 1:1 (mọi ký tự trên là một đơn vị UTF-16) ⇒ vị trí trong chuỗi đã gập
 * = vị trí trong chuỗi gốc, đoạn che dùng thẳng cho chuỗi gốc. Mọi detector dùng tập `\s` nên kết quả không đổi về ngữ nghĩa,
 * chỉ bỏ được lượt quét thứ hai (chuỗi hai byte đầy U+3000 tốn gấp đôi). U+FEFF không gập ở đây (bị BỎ ở bước chuẩn hoá).
 */
function foldUnicodeSpaces(s: string): string {
  // mỗi vòng: tìm ký tự khoảng trắng Unicode kế tiếp, gập MỌI lần xuất hiện của đúng ký tự đó (split/join gốc); trước vị
  // trí tìm thấy không còn ký tự nào cần gập ⇒ quét tiếp từ đó. Số vòng ≤ số loại ký tự có mặt (≤ 17) ⇒ tuyến tính.
  const re = UNICODE_SPACE_G_RE;
  re.lastIndex = 0;
  let x = s;
  for (let m = re.exec(x); m !== null; m = re.exec(x)) {
    const at = m.index;
    x = x.split(m[0]).join(' ');
    re.lastIndex = at + 1;
  }
  return x;
}

/** Quét một chuỗi đã chặn kích thước. null ⇒ bản NFKC vượt trần (`too_large`, không quét gì). */
function collect(raw: string, firstOnly: boolean, max: number): CredentialSpan[] | null {
  const s = foldUnicodeSpaces(raw);
  // NFKC tính TRƯỚC mọi lượt quét bằng `boundedNfkc` của contracts (theo khúc, độ dài THẬT, dừng ngay khi vượt trần —
  // security review MEDIUM: NFKC nở tới 18×, vd U+FDFA): vượt trần ⇒ too_large, không quét (như chuỗi gốc quá trần)
  let nf: string | null = s;
  if (NON_ASCII_RE.test(s)) {
    nf = boundedNfkc(s, max);
    if (nf === null) return null;
  }
  const spans: CredentialSpan[] = [];
  const emit: Emit = (start, end, patternId) => {
    spans.push({ start, end, patternId });
    return firstOnly;
  };
  const view = new View(s);
  if (runDetectorsOn(view, emit)) return spans;

  const quick = quickNormalize(s);
  if (quick !== null) {
    let quickHit: string | null = null;
    runDetectors(quick, (_a, _b, id) => {
      quickHit = id;
      return true;
    });
    if (quickHit !== null) {
      // cần vị trí trong chuỗi gốc ⇒ đường chậm có bản đồ; không ánh xạ được ⇒ che / chặn cả chuỗi (mặc định chặn)
      const mapped = decodeLayersWithMap(s);
      const before = spans.length;
      const stop =
        mapped !== null &&
        runDetectors(mapped.text, (a, b, id) => {
          const start = mapped.mapStart(a);
          spans.push({ start, end: b > a ? mapped.mapEnd(b - 1) : start, patternId: id });
          return firstOnly;
        });
      if (spans.length === before) spans.push({ start: 0, end: s.length, patternId: quickHit });
      if (stop || firstOnly) return spans;
    }
  }

  // NFKC (contracts testWithNfkc): ký tự tương thích — fullwidth ngoài trần 64 Ki của bước gập, chữ khoanh tròn, chữ in
  // trên / dưới, chữ ghép… ⇒ quét thêm bản NFKC. Vị trí KHÔNG ánh xạ được (NFKC đổi độ dài) ⇒ bản NFKC khác chuỗi và có
  // BẤT KỲ khớp nào thì che / chặn CẢ chuỗi (fail-closed, security review MEDIUM: suy "khớp mới" bằng đếm theo id lọt khi
  // lượt trước đếm trùng một đoạn).
  if (nf !== s) {
    let nfHit: string | null = null;
    runDetectors(nf, (_a, _b, id) => {
      nfHit = id;
      return true;
    });
    if (nfHit !== null) {
      spans.push({ start: 0, end: s.length, patternId: nfHit });
      if (firstOnly) return spans;
    }
  }

  scanEncoded(s, view.runScan().encoded, emit);
  return spans;
}

/** Sắp + gộp đoạn chồng / liền nhau; id của đoạn gộp = id của đoạn bắt đầu sớm nhất. */
export function mergeSpans(spans: readonly CredentialSpan[]): CredentialSpan[] {
  const sorted = [...spans].sort((x, y) => x.start - y.start || y.end - x.end);
  const out: CredentialSpan[] = [];
  for (const sp of sorted) {
    const last = out[out.length - 1];
    if (last && sp.start <= last.end) {
      if (sp.end > last.end) last.end = sp.end;
    } else out.push({ ...sp });
  }
  return out;
}

/** Quét một chuỗi. `firstOnly` (chặn payload): dừng ở mẫu đầu tiên. Quá trần ⇒ `too_large` (không quét). */
export function scanText(text: string, opts: { maxChars?: number; firstOnly?: boolean } = {}): TextScanResult {
  const max = opts.maxChars ?? SCAN_MAX_CHARS;
  if (text.length > max) return { status: 'too_large', length: text.length };
  const firstOnly = opts.firstOnly ?? false;
  const spans = collect(text, firstOnly, max);
  if (spans === null) return { status: 'too_large', length: text.length };
  if (spans.length === 0) return { status: 'clean' };
  if (!firstOnly) spans.sort((a, b) => a.start - b.start || b.end - a.end);
  return { status: 'match', patternId: (spans[0] as CredentialSpan).patternId, spans };
}

/** id mẫu khớp đầu tiên, `too_large` nếu quá trần, null nếu sạch. Dùng cho chặn. */
export function detectCredential(text: string, opts: { maxChars?: number } = {}): string | null {
  const r = scanText(text, { ...opts, firstOnly: true });
  if (r.status === 'clean') return null;
  return r.status === 'too_large' ? 'too_large' : r.patternId;
}
