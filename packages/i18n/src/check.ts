// Kiểm bảng chuỗi (dùng trong test của gói và của L-COPY / `pnpm i18n:check`). Hàm thuần, không đọc tệp.
import { flattenMessages, placeholdersOf } from './keys.ts';

export type IssueCode =
  | 'bad_key'
  | 'not_string'
  | 'empty'
  | 'extra_key'
  | 'placeholder_mismatch'
  | 'internal_code'
  | 'nesting_syntax'
  | 'forbidden_wound_word';

export interface CheckIssue {
  code: IssueCode;
  key: string;
  message: string;
}

/** Đoạn khoá: chữ + số + gạch dưới (khoá lý do / trạng thái của view DB là snake_case: `login_expired`, `quota_exhausted`). */
const KEY_SEGMENT = /^[A-Za-z0-9_]+$/;

/**
 * Mã nội bộ không được hiện trong chữ người dùng thấy (FRONTEND-SPEC O4 "Chữ hiển thị", CNS-179): mã câu hỏi (Q-R8a, Q-I7),
 * mã kiểm toán (CNS-123), mã ý đồ (INT-20), mã chuẩn (STD-07) và các nhãn trạng thái tài liệu.
 */
const INTERNAL_CODE =
  /\b(?:CNS-\d+|INT-\d+|STD-\d+|Q-[A-Z]{1,2}\d+[a-z]?)\b|\[(?:CHỐT|ĐỀ XUẤT|SUY LUẬN|Gen quyết|CHƯA VERIFY)/;

/** Cú pháp lồng của i18next (`$t(khoá)`): chuỗi lấy từ nguồn ngoài không được kéo thêm khoá khác vào. */
const NESTING = /\$t\(/;

/** Từ cấm quanh trạng thái 0 ₲ (FRONTEND-SPEC §1.9, INT-09): chỉ "Trọng thương" / "nghỉ dưỡng thương". */
// \b của JS chỉ hiểu ASCII ("thế" kết thúc bằng ký tự ngoài ASCII) ⇒ dùng ranh giới theo Unicode. Chuỗi phải ở dạng NFC (test kiểm vi.json).
const WOUND_FORBIDDEN = /(?<![\p{L}\p{N}])(?:chết|xoá|thay thế|sa thải)(?![\p{L}\p{N}])/iu;

/** Luật áp cho MỌI chuỗi (vi lẫn en). */
function valueIssues(key: string, value: unknown, viKeyHasWound: boolean): CheckIssue[] {
  if (typeof value !== 'string') return [{ code: 'not_string', key, message: 'giá trị phải là chuỗi' }];
  const out: CheckIssue[] = [];
  if (value.trim() === '') out.push({ code: 'empty', key, message: 'chuỗi rỗng' });
  if (INTERNAL_CODE.test(value)) out.push({ code: 'internal_code', key, message: 'lộ mã nội bộ trong chữ hiển thị' });
  if (NESTING.test(value)) out.push({ code: 'nesting_syntax', key, message: 'chứa cú pháp lồng $t(…) của i18next' });
  if (viKeyHasWound && WOUND_FORBIDDEN.test(value)) {
    out.push({ code: 'forbidden_wound_word', key, message: 'từ cấm quanh trạng thái Trọng thương' });
  }
  return out;
}

export function checkMessages(vi: unknown, en?: unknown): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const viFlat = flattenMessages(vi);
  for (const [key, value] of Object.entries(viFlat)) {
    if (!key.split('.').every((s) => KEY_SEGMENT.test(s))) {
      issues.push({ code: 'bad_key', key, message: 'đoạn khoá chỉ gồm chữ, số, gạch dưới' });
    }
    issues.push(...valueIssues(key, value, /wound/i.test(key)));
  }
  if (en !== undefined) {
    for (const [key, value] of Object.entries(flattenMessages(en))) {
      const base = viFlat[key];
      if (base === undefined) {
        issues.push({ code: 'extra_key', key, message: 'có trong en nhưng không có trong vi (vi là bản gốc)' });
        continue;
      }
      issues.push(...valueIssues(key, value, /wound/i.test(key)));
      if (typeof base === 'string' && typeof value === 'string') {
        const a = placeholdersOf(base).sort().join(',');
        const b = placeholdersOf(value).sort().join(',');
        if (a !== b) {
          issues.push({ code: 'placeholder_mismatch', key, message: `tham số lệch: vi {${a}} ≠ en {${b}}` });
        }
      }
    }
  }
  return issues;
}
