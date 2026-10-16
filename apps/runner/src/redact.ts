import { detectCredential, redactLogLine, SCAN_MAX_CHARS } from '@ga/security';

// Che credential trong stdout / stderr của CLI trước khi rời container (BUILD-PLAN §B.5 bước 6, DATABASE §9.5 bước 7).
// MỘT NGUỒN LUẬT (review bảo mật MEDIUM parser-differential, Gen quyết): runner KHÔNG tự phát hiện / chuẩn hoá escape /
// parse JSON — dùng bộ che dùng chung của @ga/security (cùng bộ mẫu với bộ chặn payload, CNS-169):
//   - `redactLogLine`: che từng đoạn giống credential bằng `[REDACTED:<id>]` (giữ JSON hợp lệ, tự giải escape ≤ 3 lớp);
//   - dòng > SCAN_MAX_CHARS ⇒ CẢ dòng bị thay bằng một dòng báo `{"redacted":"too_large",…}` (không quét).

export const MAX_SCAN_CHARS = SCAN_MAX_CHARS;

/** Dòng đi ra ngoài (không kèm '\n'): nguyên văn nếu sạch, ngược lại đã che theo đoạn. */
export function redactLine(line: string): string {
  const out = redactLogLine(line);
  // redactLogLine (hook streamWrite của pino) kèm '\n' cho dòng quá trần; người gọi tự thêm '\n' ⇒ bỏ để không đẻ dòng rỗng
  return out.endsWith('\n') ? out.slice(0, -1) : out;
}

/** id mẫu credential khớp đầu tiên trong dòng, `too_large` nếu quá trần quét, null nếu sạch. */
export function credentialInLine(line: string): string | null {
  return detectCredential(line);
}
