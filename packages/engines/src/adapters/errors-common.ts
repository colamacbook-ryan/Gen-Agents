/** Lỗi do người gọi dùng adapter sai cách (vd xin argv đăng nhập PTY cho tài khoản API key). */
export class AdapterError extends Error {
  readonly code: 'login_not_interactive' | 'unsupported_auth_method';
  constructor(code: AdapterError['code'], message: string) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
  }
}
