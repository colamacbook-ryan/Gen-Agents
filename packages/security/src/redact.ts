// Bộ che bí mật DÙNG CHUNG cho mọi logger, output probe, blob log (DATABASE §9.5 bước 7; BUILD-PLAN §A.1 "pino + bộ lọc che").
// Cùng bộ mẫu với bộ chặn payload (CNS-169). Cách dùng với pino (lane dựng logger):
//   pino({ hooks: { streamWrite: redactLogLine } })   — che trên dòng JSON cuối cùng: phủ mọi trường, msg, err.stack.
// Thay thế giữ JSON hợp lệ: chuỗi thay `[REDACTED:<id>]` chỉ gồm ký tự an toàn; đoạn che không bao giờ nuốt dấu `"` hay để lại
// `\` lẻ ở cuối.
import { mergeSpans, SCAN_MAX_CHARS, scanText } from './credential-detector.ts';
import { isSensitiveKey } from './payload.ts';

const mark = (id: string) => `[REDACTED:${id.replace(/[^a-z0-9_:]/gi, '_')}]`;

/** Che mọi đoạn giống credential trong một chuỗi. Quá trần quét ⇒ che toàn bộ (mặc định chặn). */
export function redactText(text: string, opts: { maxChars?: number } = {}): string {
  const r = scanText(text, { maxChars: opts.maxChars ?? SCAN_MAX_CHARS });
  if (r.status === 'clean') return text;
  if (r.status === 'too_large') return `[REDACTED:too_large len=${r.length}]`;
  let out = '';
  let pos = 0;
  for (const sp of mergeSpans(r.spans)) {
    let end = sp.end;
    // không để lại '\' lẻ: bỏ dấu '\' cuối ra khỏi đoạn che nếu số '\' liền nhau ở cuối là lẻ
    let bs = 0;
    while (end - bs - 1 >= sp.start && text.charCodeAt(end - bs - 1) === 92) bs++;
    if (bs % 2 === 1) end--;
    if (sp.start < pos || end <= sp.start) continue;
    out += text.slice(pos, sp.start) + mark(sp.patternId);
    pos = end;
  }
  return out + text.slice(pos);
}

/** Hook `streamWrite` của pino: che trên dòng log đã tuần tự hoá. Dòng quá trần ⇒ thay bằng một dòng JSON báo đã che. */
export function redactLogLine(line: string): string {
  if (line.length > SCAN_MAX_CHARS) return `${JSON.stringify({ redacted: 'too_large', length: line.length })}\n`;
  return redactText(line);
}

const REDACT_LIMITS = { maxDepth: 16, maxNodes: 5000 } as const;

/**
 * Bản sao đã che của một giá trị bất kỳ (object log, lỗi, output probe): chuỗi qua `redactText`, khoá nhạy cảm ⇒ giá trị bị
 * thay hẳn, Error ⇒ {name, message, stack} đã che, Buffer ⇒ chỉ độ dài, vòng tham chiếu / quá sâu / quá nhiều nút ⇒ đánh dấu.
 */
export function redactValue(value: unknown): unknown {
  let nodes = 0;
  const seen = new WeakSet<object>();
  const walk = (v: unknown, depth: number): unknown => {
    if (++nodes > REDACT_LIMITS.maxNodes) return '[TRUNCATED]';
    if (typeof v === 'string') return redactText(v);
    if (v === null || typeof v === 'number' || typeof v === 'boolean' || v === undefined) return v;
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'function' || typeof v === 'symbol') return `[${typeof v}]`;
    if (depth >= REDACT_LIMITS.maxDepth) return '[TOO_DEEP]';
    const o = v as object;
    if (seen.has(o)) return '[Circular]';
    seen.add(o);
    if (Buffer.isBuffer(o) || o instanceof Uint8Array) return `[binary ${(o as Uint8Array).byteLength} bytes]`;
    if (o instanceof Error) {
      const out: Record<string, unknown> = { name: o.name, message: redactText(o.message) };
      if (o.stack) out.stack = redactText(o.stack);
      if ('cause' in o && o.cause !== undefined) out.cause = walk(o.cause, depth + 1);
      return out;
    }
    if (Array.isArray(o)) return o.map((x) => walk(x, depth + 1));
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(o)) {
      out[redactText(k)] = isSensitiveKey(k) ? '[REDACTED:credential_field_name]' : walk(x, depth + 1);
    }
    return out;
  };
  return walk(value, 0);
}
