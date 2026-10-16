// Bộ CHE credential cho stdout / stderr của CLI trước khi rời container (BUILD-PLAN §B.5 bước 6, DATABASE §9.5 bước 7).
// Che (thay bằng [REDACTED]) — khác với CHẶN của gateway (L-GW). Không dùng regex: indexOf + đếm ký tự ⇒ tuyến tính.
// Phủ ít nhất các mẫu của contracts CREDENTIAL_DETECTORS có tiền tố nhận dạng được (sk-ant-, sk-, ya29., 1//0, AIza, JWT,
// PEM, refresh_token, canary GA-CANARY-). Không che "chuỗi token dài bất kỳ" (UUID phiên, sha) vì làm hỏng stream hợp lệ —
// lớp chặn rộng nằm ở gateway. TODO(L-SEC): thay bằng bộ phát hiện dùng chung @ga/security khi lane đó push.

export const REDACTED = '[REDACTED]';

function isWord(c: number): boolean {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
}
function isToken(c: number): boolean {
  return isWord(c) || c === 45;
}
function isHexOrDash(c: number): boolean {
  return (c >= 48 && c <= 57) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70) || c === 45;
}

/** Độ dài đoạn ký tự thoả `pred` liền nhau bắt đầu tại `from`. */
function runLen(s: string, from: number, pred: (c: number) => boolean): number {
  let i = from;
  while (i < s.length && pred(s.charCodeAt(i))) i++;
  return i - from;
}

type Range = [number, number];

/** prefix + ≥ min ký tự token ⇒ che cả prefix + đoạn. */
function prefixRanges(s: string, prefix: string, min: number, out: Range[], wordStart = false): void {
  let from = 0;
  for (;;) {
    const at = s.indexOf(prefix, from);
    if (at < 0) return;
    // kiểm đầu từ TRƯỚC khi đếm đoạn ⇒ "xsk-xsk-…" không bị đếm lại từng lần (tuyến tính)
    if (wordStart && at > 0 && isWord(s.charCodeAt(at - 1))) {
      from = at + 1;
      continue;
    }
    const n = runLen(s, at + prefix.length, isToken);
    // khớp ⇒ che rồi nhảy qua; không khớp ⇒ mọi lần xuất hiện sau trong CÙNG đoạn có đoạn ngắn hơn ⇒ cũng nhảy qua
    if (n >= min) out.push([at, at + prefix.length + n]);
    from = at + prefix.length + n;
  }
}

function jwtRanges(s: string, out: Range[]): void {
  let from = 0;
  for (;;) {
    const at = s.indexOf('eyJ', from);
    if (at < 0) return;
    const a = runLen(s, at, isToken);
    let end = -1;
    if (a >= 8 && s.charCodeAt(at + a) === 46) {
      const b = runLen(s, at + a + 1, isToken);
      if (b >= 8 && s.charCodeAt(at + a + 1 + b) === 46) {
        const c = runLen(s, at + a + 2 + b, isToken);
        if (c >= 8) end = at + a + 2 + b + c;
      }
    }
    if (end > 0) {
      out.push([at, end]);
      from = end;
    } else {
      from = at + Math.max(1, a);
    }
  }
}

function canaryRanges(s: string, out: Range[]): void {
  const prefix = 'GA-CANARY-';
  let from = 0;
  for (;;) {
    const at = s.indexOf(prefix, from);
    if (at < 0) return;
    const n = runLen(s, at + prefix.length, isHexOrDash);
    if (n >= 8) {
      out.push([at, at + prefix.length + n]);
      from = at + prefix.length + n;
    } else {
      from = at + 1;
    }
  }
}

/** PEM khoá riêng: từ `-----BEGIN` tới hết `-----END …-----` (hoặc hết chuỗi nếu chưa thấy END). */
function pemRanges(s: string, out: Range[]): void {
  let from = 0;
  for (;;) {
    const at = s.indexOf('-----BEGIN ', from);
    if (at < 0) return;
    const headEnd = s.indexOf('-----', at + 11);
    if (headEnd < 0 || s.slice(at, headEnd).indexOf('PRIVATE KEY') < 0) {
      from = at + 1;
      continue;
    }
    const endMarker = s.indexOf('-----END ', headEnd + 5);
    let end = s.length;
    if (endMarker >= 0) {
      const close = s.indexOf('-----', endMarker + 9);
      end = close >= 0 ? close + 5 : s.length;
    }
    out.push([at, end]);
    from = end;
  }
}

/** `refresh_token` (không phân biệt hoa thường) + dấu nháy? + khoảng trắng + `:`/`=` + khoảng trắng + nháy? ⇒ che giá trị. */
function refreshFieldRanges(s: string, out: Range[]): void {
  const lower = s.toLowerCase();
  const key = 'refresh_token';
  let from = 0;
  for (;;) {
    const at = lower.indexOf(key, from);
    if (at < 0) return;
    let i = at + key.length;
    if (s[i] === '"' || s[i] === "'") i++;
    while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++;
    if (s[i] === ':' || s[i] === '=') {
      i++;
      while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++;
      if (s[i] === '"' || s[i] === "'") i++;
      let j = i;
      while (j < s.length && s[j] !== '"' && s[j] !== "'" && s[j] !== ',' && s[j] !== '}' && s[j] !== ' ') j++;
      if (j > i) out.push([i, j]);
      from = Math.max(j, at + 1);
    } else {
      from = at + 1;
    }
  }
}

/** Che mọi đoạn giống credential. Tuyến tính theo độ dài chuỗi. */
export function redact(s: string): string {
  if (s.length === 0) return s;
  const ranges: Range[] = [];
  prefixRanges(s, 'sk-ant-', 10, ranges);
  prefixRanges(s, 'sk-', 20, ranges, true);
  prefixRanges(s, 'ya29.', 10, ranges);
  prefixRanges(s, '1//0', 10, ranges);
  prefixRanges(s, 'AIza', 30, ranges);
  jwtRanges(s, ranges);
  canaryRanges(s, ranges);
  pemRanges(s, ranges);
  refreshFieldRanges(s, ranges);
  if (ranges.length === 0) return s;
  ranges.sort((a, b) => a[0] - b[0]);
  let out = '';
  let pos = 0;
  for (const [a, b] of ranges) {
    if (b <= pos) continue;
    const start = Math.max(a, pos);
    out += s.slice(pos, start) + REDACTED;
    pos = b;
  }
  return out + s.slice(pos);
}
