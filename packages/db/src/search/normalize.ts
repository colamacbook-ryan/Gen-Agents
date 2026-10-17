// Chuẩn hoá tiếng Việt cho tìm kiếm + cột *_norm (DATABASE §8.5): NFC → bỏ dấu thanh / dấu mũ TỪNG ký tự → đ→d, Đ→D →
// chữ thường. Mỗi ký tự (code unit) của bản NFC đổi thành ĐÚNG MỘT ký tự ⇒ giữ nguyên độ dài: vị trí khớp trên bản không dấu
// tô sáng được đúng chỗ trên bản gốc. Không dùng remove_diacritics của FTS5 (không đổi đ → d).
// Chặn kích thước TRƯỚC khi chuẩn hoá (STD-11): NFC có thể phình (tối đa ~3×) — đầu vào vượt trần ⇒ RangeError.
// Chạy tuyến tính: mỗi ký tự tra bảng cache; ký tự lạ tính một lần (NFD của MỘT ký tự, độ dài bị chặn).

export const FOLD_MAX_CHARS = 1_048_576;

const COMBINING_RE = /[\u0300-\u036f]/g;
/** Bảng tra theo code unit (0 = chưa tính). Mỗi code unit đổi thành ĐÚNG MỘT code unit ⇒ giữ độ dài. */
const table = new Uint16Array(65_536);

function foldUnit(c: number): number {
  const hit = table[c] as number;
  if (hit !== 0) return hit;
  let out = c;
  if (c >= 0x41 && c <= 0x5a) out = c + 32;
  else if (c === 0x0110 || c === 0x0111)
    out = 0x64; // Đ / đ → d
  else if (c >= 0x80 && (c < 0xd800 || c > 0xdfff)) {
    const ch = String.fromCharCode(c);
    // lint-allow no-raw-normalize: NFD của đúng MỘT code unit (độ dài bị chặn), không phải chuỗi người dùng
    const base = ch.normalize('NFD').replace(COMBINING_RE, '').toLowerCase();
    const lower = ch.toLowerCase();
    out = base.length === 1 ? base.charCodeAt(0) : lower.length === 1 ? lower.charCodeAt(0) : c;
  }
  table[c] = out === 0 ? c : out;
  return out;
}

const CHUNK = 8192;

/** Chuẩn hoá để so khớp / index: 'Đặng Thị Hoà' ⇒ 'dang thi hoa'. Độ dài kết quả = độ dài bản NFC. Tuyến tính. */
export function foldVi(input: string): string {
  if (input.length > FOLD_MAX_CHARS) throw new RangeError(`foldVi: đầu vào vượt trần ${FOLD_MAX_CHARS} ký tự`);
  // lint-allow no-raw-normalize: NFC (gộp ký tự tổ hợp) sau khi đã chặn kích thước ở trên; NFC không phình như NFKC
  const nfc = input.normalize('NFC');
  const codes = new Uint16Array(nfc.length);
  for (let i = 0; i < nfc.length; i++) {
    const c = nfc.charCodeAt(i);
    codes[i] = c < 0x80 ? (c >= 0x41 && c <= 0x5a ? c + 32 : c) : foldUnit(c);
  }
  const parts: string[] = [];
  for (let i = 0; i < codes.length; i += CHUNK) {
    parts.push(String.fromCharCode(...codes.subarray(i, i + CHUNK)));
  }
  return parts.join('');
}
