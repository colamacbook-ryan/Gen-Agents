import { findCredentialLike } from '@ga/contracts';

// Che credential trong stdout / stderr của CLI trước khi rời container (BUILD-PLAN §B.5 bước 6, DATABASE §9.5 bước 7).
// MỘT NGUỒN LUẬT (review bảo mật MEDIUM parser-differential, Gen quyết): KHÔNG tự viết bộ phát hiện. Tạm dùng bộ tham chiếu
// của contracts (`findCredentialLike`, tuyến tính); khi @ga/security (L-SEC) vào nhánh thì thay bằng `redactLogLine`.
// Vì bộ tham chiếu chỉ trả có / không (không trả vị trí), runner thay CẢ DÒNG bằng một dòng đánh dấu — không cố che từng
// đoạn bằng parser riêng (nguồn của lệch parser). Dòng khớp nếu MỘT trong các dạng sau khớp bộ tham chiếu:
//   (a) dòng thô;
//   (b) dòng đã bỏ mọi dấu `\` (JSON lồng 1, 2, 3… lớp escape: `\"refresh_token\":` → `"refresh_token":`);
//   (c) nếu dòng là JSON: giá trị đã parse (bộ tham chiếu duyệt cả KHOÁ — refresh_token / access_token / id_token /
//       client_secret / private_key), và mọi chuỗi trong đó trông như JSON được parse tiếp tối đa 3 lớp.
// Chặn kích thước TRƯỚC khi quét (dòng > 1 MiB ⇒ thay bằng dấu hiệu, không quét). Mọi bước tuyến tính theo độ dài dòng.
// Quá tay có chủ đích: bộ tham chiếu bắt cả UUID / chuỗi token dài ⇒ một số dòng hợp lệ bị thay (chấp nhận tới khi có
// @ga/security, vốn không chặn hex / UUID — CNS-169).

export const MAX_SCAN_CHARS = 1_048_576;
const NESTED_JSON_DEPTH = 3;

export function redactedMarker(patternId: string): string {
  return JSON.stringify({ $ga: 'line_redacted', patternId: patternId.replace(/[^a-z0-9_]/gi, '_') });
}

function looksLikeJson(s: string): boolean {
  const t = s.trimStart();
  return t.startsWith('{') || t.startsWith('[') || t.startsWith('"');
}

/** Parse các chuỗi trông như JSON lồng bên trong (tối đa `depth` lớp) rồi quét bằng bộ tham chiếu. */
function scanParsed(value: unknown, depth: number): { patternId: string } | null {
  const hit = findCredentialLike(value);
  if (hit || depth <= 0) return hit;
  const stack: unknown[] = [value];
  let nodes = 0;
  while (stack.length > 0) {
    const v = stack.pop();
    if (++nodes > 20_000) return { patternId: 'too_many_nodes' };
    if (typeof v === 'string') {
      if (v.length > 1 && looksLikeJson(v)) {
        try {
          const inner = scanParsed(JSON.parse(v), depth - 1);
          if (inner) return inner;
        } catch {
          // không phải JSON: đã quét như chuỗi ở findCredentialLike
        }
      }
    } else if (Array.isArray(v)) {
      for (const x of v) stack.push(x);
    } else if (v !== null && typeof v === 'object') {
      for (const x of Object.values(v)) stack.push(x);
    }
  }
  return null;
}

/** Mẫu credential khớp trong một dòng (null = sạch). */
export function credentialInLine(line: string): string | null {
  if (line.length > MAX_SCAN_CHARS) return 'too_large';
  const raw = findCredentialLike(line);
  if (raw) return raw.patternId;
  if (line.includes('\\')) {
    const unescaped = findCredentialLike(line.split('\\').join(''));
    if (unescaped) return unescaped.patternId;
  }
  if (looksLikeJson(line)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return null;
    }
    const hit = scanParsed(parsed, NESTED_JSON_DEPTH);
    if (hit) return hit.patternId;
  }
  return null;
}

/** Dòng đi ra ngoài: nguyên văn nếu sạch, ngược lại một dòng đánh dấu (không chứa nội dung gốc). */
export function redactLine(line: string): string {
  const hit = credentialInLine(line);
  return hit === null ? line : redactedMarker(hit);
}
