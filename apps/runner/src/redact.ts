import { CREDENTIAL_KEY_NAMES, findCredentialLike, normalizeCredentialName } from '@ga/contracts';
import { detectCredential, SCAN_MAX_CHARS } from '@ga/security';

// Che credential trong stdout / stderr của CLI trước khi rời container (BUILD-PLAN §B.5 bước 6, DATABASE §9.5 bước 7).
// FAIL-CLOSED (Gen quyết sau security review MEDIUM — che từng đoạn để lọt phần đuôi / escape / giá trị ngắn): phát hiện ⇒ thay
// CẢ DÒNG bằng `redactedMarker(patternId)`. KHÔNG che từng đoạn output CLI (`redactLogLine` chỉ dành cho log nội bộ).
// Điều kiện phát hiện (trần kích thước TRƯỚC — dòng > SCAN_MAX_CHARS ⇒ `too_large`, không quét), OR của:
//   1. `detectCredential(line)` — bộ dùng chung @ga/security (giải escape ≤ 3 lớp, mẫu token, phép gán giá trị ≥ 8 ký tự);
//   2. dòng parse được JSON ⇒ `findCredentialLike(parsed)` của contracts (duyệt KHOÁ: bắt khoá credential bất kể độ dài giá trị);
//   3. `credentialKeyAssignment(line)` — rào bổ sung, CHỈ THÊM che (không bao giờ nới bộ 1–2): tên khoá trong
//      contracts CREDENTIAL_KEY_NAMES, so theo `normalizeCredentialName` của contracts (mọi kiểu viết: refreshToken,
//      Refresh-Token, REFRESH_TOKEN…), theo sau (bỏ qua nháy / `\` / khoảng trắng / `"`…) là `:` hoặc `=` rồi một giá trị
//      không rỗng ⇒ bắt, bất kể độ dài giá trị và tiền tố dòng (vd `INFO {"access_token":"x.y z"}`, JSON lồng nhiều lớp).
// Mọi bước tuyến tính theo độ dài dòng.

export const MAX_SCAN_CHARS = SCAN_MAX_CHARS;

export function redactedMarker(patternId: string): string {
  return JSON.stringify({ $ga: 'line_redacted', patternId: patternId.replace(/[^a-z0-9_]/gi, '_') });
}

/** Tên khoá đã chuẩn hoá như contracts (bỏ `_` / `-`, chữ thường) — dòng được chuẩn hoá cùng cách trước khi tìm. */
const KEY_NAMES: readonly string[] = [...new Set(CREDENTIAL_KEY_NAMES.map(normalizeCredentialName))];
/** Trần số ký tự bỏ qua mỗi phía của dấu `:` / `=` (giữ tuyến tính: mỗi lần khớp tên tốn O(1)). */
const MAX_SKIP = 64;

const isHex = (c: number) => (c >= 48 && c <= 57) || (c >= 97 && c <= 102);

/** `\u` + 4 hex (chữ thường — dòng đã chuẩn hoá) bắt đầu tại i ⇒ mã ký tự, ngược lại -1. */
function unicodeEscapeAt(s: string, i: number): number {
  if (s.charCodeAt(i) !== 117 || i + 4 >= s.length) return -1;
  for (let k = 1; k <= 4; k++) if (!isHex(s.charCodeAt(i + k))) return -1;
  return Number.parseInt(s.slice(i + 1, i + 5), 16);
}

const FILLER = new Set([34, 39, 92, 32, 9]); // " ' \ space tab
const SEPARATOR = new Set([58, 61]); // : =
const VALUE_END = new Set([44, 125, 93, 41]); // , } ] )

/**
 * Bỏ qua "đệm" (nháy, `\`, khoảng trắng, `"` / `'` / ` ` / `\`…) từ vị trí i, tối đa MAX_SKIP ký tự.
 * Trả vị trí ký tự đầu tiên không phải đệm và mã ký tự đó sau giải `\uXXXX` (-1 nếu hết dòng / vượt trần).
 */
function skipFiller(s: string, i: number): { pos: number; code: number } {
  const stop = Math.min(s.length, i + MAX_SKIP);
  let p = i;
  while (p < stop) {
    const c = s.charCodeAt(p);
    if (c === 92) {
      const u = unicodeEscapeAt(s, p + 1);
      if (u >= 0) {
        if (FILLER.has(u)) {
          p += 6;
          continue;
        }
        return { pos: p, code: u };
      }
    }
    if (!FILLER.has(c)) return { pos: p, code: c };
    p++;
  }
  return { pos: p, code: -1 };
}

const escapeLen = (s: string, p: number) => (s.charCodeAt(p) === 92 && unicodeEscapeAt(s, p + 1) >= 0 ? 6 : 1);

/** Rào 3: có phép gán `<tên khoá credential> : / = <giá trị không rỗng>` ở đâu đó trong dòng (mọi dạng nháy / escape). */
export function credentialKeyAssignment(line: string): boolean {
  const lower = normalizeCredentialName(line);
  for (const name of KEY_NAMES) {
    let from = 0;
    for (;;) {
      const i = lower.indexOf(name, from);
      if (i < 0) break;
      from = i + 1;
      const sep = skipFiller(lower, i + name.length);
      if (!SEPARATOR.has(sep.code)) continue;
      const val = skipFiller(lower, sep.pos + escapeLen(lower, sep.pos));
      if (val.code >= 0 && !VALUE_END.has(val.code)) return true;
    }
  }
  return false;
}

function looksLikeJson(s: string): boolean {
  const c = s.trimStart().charCodeAt(0);
  return c === 123 || c === 91 || c === 34; // { [ "
}

/** id mẫu credential khớp trong dòng (`too_large` nếu quá trần quét), null nếu sạch. */
export function credentialInLine(line: string): string | null {
  if (line.length > MAX_SCAN_CHARS) return 'too_large';
  const shared = detectCredential(line);
  if (shared !== null) return shared;
  if (looksLikeJson(line)) {
    let parsed: unknown;
    let ok = false;
    try {
      parsed = JSON.parse(line);
      ok = true;
    } catch {
      // không phải JSON trọn dòng: rào 3 vẫn quét chuỗi thô
    }
    if (ok) {
      const hit = findCredentialLike(parsed);
      if (hit) return hit.patternId;
    }
  }
  return credentialKeyAssignment(line) ? 'credential_field_name' : null;
}

/** Dòng đi ra ngoài: nguyên văn nếu sạch, ngược lại MỘT dòng đánh dấu (không chứa nội dung gốc). */
export function redactLine(line: string): string {
  const hit = credentialInLine(line);
  return hit === null ? line : redactedMarker(hit);
}
