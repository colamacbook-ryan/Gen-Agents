// Chuẩn hoá tiếng Việt cho tìm kiếm + cột *_norm (DATABASE §8.5): NFC → bỏ dấu thanh / dấu mũ TỪNG ký tự → đ→d, Đ→D →
// chữ thường. Mỗi ký tự (code unit) của bản NFC đổi thành ĐÚNG MỘT ký tự ⇒ giữ nguyên độ dài: vị trí khớp trên bản không dấu
// tô sáng được đúng chỗ trên bản gốc. Không dùng remove_diacritics của FTS5 (không đổi đ → d).
// Chặn kích thước TRƯỚC khi chuẩn hoá (STD-11): NFC có thể phình (tối đa ~3×) — đầu vào vượt trần ⇒ RangeError.
// Chạy tuyến tính: mỗi ký tự tra bảng cache; ký tự lạ tính một lần (NFD của MỘT ký tự, độ dài bị chặn).

export const FOLD_MAX_CHARS = 1_048_576;

const COMBINING_RE = /[̀-ͯ]/g;
const cache = new Map<string, string>();

function foldChar(ch: string): string {
  const hit = cache.get(ch);
  if (hit !== undefined) return hit;
  let out: string;
  if (ch === 'đ' || ch === 'Đ') out = 'd';
  else {
    // lint-allow no-raw-normalize: NFD của đúng MỘT ký tự (độ dài bị chặn), không phải chuỗi người dùng
    const base = ch.normalize('NFD').replace(COMBINING_RE, '').toLowerCase();
    const lower = ch.toLowerCase();
    out = base.length === 1 ? base : lower.length === 1 ? lower : ch;
  }
  if (cache.size < 65_536) cache.set(ch, out);
  return out;
}

/** Chuẩn hoá để so khớp / index: 'Đặng Thị Hoà' ⇒ 'dang thi hoa'. Độ dài kết quả = độ dài bản NFC. */
export function foldVi(input: string): string {
  if (input.length > FOLD_MAX_CHARS) throw new RangeError(`foldVi: đầu vào vượt trần ${FOLD_MAX_CHARS} ký tự`);
  // lint-allow no-raw-normalize: NFC (gộp ký tự tổ hợp) sau khi đã chặn kích thước ở trên; NFC không phình như NFKC
  const nfc = input.normalize('NFC');
  let out = '';
  for (let i = 0; i < nfc.length; i++) {
    const c = nfc.charCodeAt(i);
    if (c < 0x80) {
      out += c >= 0x41 && c <= 0x5a ? String.fromCharCode(c + 32) : nfc[i];
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < nfc.length) {
      out += nfc[i] + (nfc[i + 1] as string); // cặp surrogate: giữ nguyên (2 code unit ⇒ 2 code unit)
      i++;
    } else {
      out += foldChar(nfc[i] as string);
    }
  }
  return out;
}
