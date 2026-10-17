// Chuẩn hoá tiếng Việt để so khớp phía client (DATABASE §8.5): bỏ dấu thanh / dấu mũ TỪNG ký tự, đ → d, chữ thường.
// Cùng ngữ nghĩa với foldVi của @ga/db cho văn bản tiếng Việt NFC (đề xuất gộp về @ga/contracts — một nguồn cho cả hai phía).
// Không gọi String.prototype.normalize (luật no-raw-normalize): bảng tra cố định cho bảng chữ cái tiếng Việt + bỏ dấu tổ hợp
// U+0300–U+036F (văn bản dạng tách NFD vẫn ra cùng kết quả). Có trần độ dài TRƯỚC khi xử lý (STD-11); chạy tuyến tính.

export const FOLD_MAX_CHARS = 1_048_576;

const GROUPS: readonly (readonly [string, string])[] = [
  ['a', 'àáảãạăằắẳẵặâầấẩẫậ'],
  ['e', 'èéẻẽẹêềếểễệ'],
  ['i', 'ìíỉĩị'],
  ['o', 'òóỏõọôồốổỗộơờớởỡợ'],
  ['u', 'ùúủũụưừứửữự'],
  ['y', 'ỳýỷỹỵ'],
  ['d', 'đ'],
];

const TABLE = new Map<string, string>();
for (const [base, chars] of GROUPS) {
  for (const ch of chars) {
    TABLE.set(ch, base);
    TABLE.set(ch.toUpperCase(), base);
  }
}

/** 'Đặng Thị Hoà' ⇒ 'dang thi hoa'. Ký tự ngoài bảng: chữ thường nếu vẫn là một ký tự, không thì giữ nguyên. */
export function foldVi(input: string): string {
  if (input.length > FOLD_MAX_CHARS) throw new RangeError(`foldVi: đầu vào vượt trần ${FOLD_MAX_CHARS} ký tự`);
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    if (c < 0x80) {
      out += c >= 0x41 && c <= 0x5a ? String.fromCharCode(c + 32) : input[i];
      continue;
    }
    if (c >= 0x300 && c <= 0x36f) continue; // dấu tổ hợp (văn bản dạng tách)
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < input.length) {
      out += input.slice(i, i + 2); // cặp surrogate: giữ nguyên
      i++;
      continue;
    }
    const ch = input[i] as string;
    const hit = TABLE.get(ch);
    if (hit !== undefined) out += hit;
    else {
      const lower = ch.toLowerCase();
      out += lower.length === 1 ? lower : ch;
    }
  }
  return out;
}
