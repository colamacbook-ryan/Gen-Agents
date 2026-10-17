// Mật khẩu của test được SINH LÚC CHẠY, không để literal trong mã nguồn (luật lane: khoá test sinh lúc chạy; gitleaks
// generic-api-key bắt mọi `password: '…'` có chữ số). Mỗi tiến trình test một bộ giá trị.
import { randomBytes } from 'node:crypto';

const salt = (): string => randomBytes(3).toString('hex');

/** mật khẩu ban đầu (in ở cuối lúc cài đặt) */
export const FIRST_PASSWORD = `cam vang ${salt()} nui`;
/** mật khẩu đúng của FakeAuthClient */
export const GOOD_PASSWORD = `dung ${salt()} khau`;
/** mật khẩu sai */
export const WRONG_PASSWORD = `sai ${salt()} roi`;
/** mật khẩu mới đạt chính sách (≥ 12 ký tự, nhiều ký tự khác nhau, không chứa tên đăng nhập) */
export const NEW_PASSWORD = `mot cum tu ${salt()} rat dai`;
/** mật khẩu mới khác NEW_PASSWORD (ca "hai mật khẩu không khớp") */
export const OTHER_PASSWORD = `mot cum khac ${salt()} nua`;
/** mật khẩu mới quá ngắn */
export const SHORT_PASSWORD = salt().slice(0, 4);
