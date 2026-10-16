// Chặn payload ra có nội dung giống credential (CNS-133, CNS-169) — mọi tool có dữ liệu đi ra / ghi bền, tin Telegram, export.
// Thứ tự BẮT BUỘC: (1) chặn kích thước (không quét gì nếu vượt trần) → (2) quét MỌI khoá + MỌI chuỗi giá trị, không có tool /
// trường nào được miễn. Kết quả `denied` mang id mẫu + SHA-256 đoạn khớp (audit chỉ lưu hash, không lưu payload).
import { createHash } from 'node:crypto';
import { TOOL_PAYLOAD_LIMITS } from '@ga/contracts';
import { CREDENTIAL_BLOCKED, scanText } from './credential-detector.ts';

export interface PayloadLimits {
  maxStringChars: number;
  maxTotalChars: number;
  maxDepth: number;
  maxNodes: number;
}

/**
 * Tên khoá mang credential — so sau khi chuẩn hoá (chữ thường, bỏ mọi ký tự ngoài a–z0–9) ⇒ `refresh_token`, `refreshToken`,
 * `Refresh-Token` là một. Bao `CREDENTIAL_KEY_RE` của contracts (refresh/access/id_token, client_secret, private_key).
 */
export const SENSITIVE_KEY_NAMES: ReadonlySet<string> = new Set([
  'refreshtoken',
  'accesstoken',
  'idtoken',
  'authtoken',
  'sessiontoken',
  'oauthtoken',
  'token',
  'clientsecret',
  'secret',
  'secretkey',
  'privatekey',
  'apikey',
  'xapikey',
  'password',
  'passwd',
  'authorization',
  'proxyauthorization',
  'bearer',
  'cookie',
  'setcookie',
  'authcode',
]);

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_NAMES.has(key.toLowerCase().replace(/[^a-z0-9]/g, ''));
}

export type PayloadScreenResult =
  | { status: 'ok' }
  | { status: 'denied'; code: 'payload_too_large'; reason: string }
  | { status: 'denied'; code: typeof CREDENTIAL_BLOCKED.denialCode; patternId: string; matchSha256: string };

/** Đo payload mà không đi quá trần — dừng ngay khi vượt (không duyệt hết mảng 1 triệu phần tử). null = trong trần. */
export function payloadOverLimit(value: unknown, limits: PayloadLimits = TOOL_PAYLOAD_LIMITS): string | null {
  let nodes = 0;
  let chars = 0;
  const stack: Array<{ v: unknown; d: number }> = [{ v: value, d: 0 }];
  while (stack.length > 0) {
    const { v, d } = stack.pop() as { v: unknown; d: number };
    if (++nodes > limits.maxNodes) return 'quá nhiều nút';
    if (d > limits.maxDepth) return 'lồng quá sâu';
    if (typeof v === 'string') {
      if (v.length > limits.maxStringChars) return 'chuỗi quá dài';
      chars += v.length;
    } else if (Array.isArray(v)) {
      if (v.length > limits.maxNodes) return 'mảng quá dài';
      for (const x of v) stack.push({ v: x, d: d + 1 });
    } else if (v !== null && typeof v === 'object') {
      if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) {
        return 'không phải object JSON thuần';
      }
      const keys = Object.keys(v);
      if (keys.length > limits.maxNodes) return 'quá nhiều khoá';
      for (const k of keys) {
        if (k.length > limits.maxStringChars) return 'khoá quá dài';
        chars += k.length;
        stack.push({ v: (v as Record<string, unknown>)[k], d: d + 1 });
      }
    } else if (v !== null && typeof v !== 'number' && typeof v !== 'boolean') {
      return `kiểu không phải JSON: ${typeof v}`;
    }
    if (chars > limits.maxTotalChars) return 'payload quá lớn';
  }
  return null;
}

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

function denyText(s: string, limits: PayloadLimits): PayloadScreenResult | null {
  const r = scanText(s, { maxChars: limits.maxStringChars, firstOnly: true });
  if (r.status === 'clean') return null;
  if (r.status === 'too_large') return { status: 'denied', code: 'payload_too_large', reason: 'chuỗi quá dài' };
  const sp = r.spans[0];
  return {
    status: 'denied',
    code: CREDENTIAL_BLOCKED.denialCode,
    patternId: r.patternId,
    matchSha256: sha256(sp ? s.slice(sp.start, sp.end) : s),
  };
}

/**
 * Cổng cho MỌI payload ra (giá trị JSON thuần). Mặc định chặn: vượt trần ⇒ denied; khoá nhạy cảm ⇒ denied (bất kể giá trị);
 * chuỗi (khoá hoặc giá trị) khớp mẫu ⇒ denied. `limits` mặc định = TOOL_PAYLOAD_LIMITS của contracts.
 */
export function screenPayload(value: unknown, limits: PayloadLimits = TOOL_PAYLOAD_LIMITS): PayloadScreenResult {
  const over = payloadOverLimit(value, limits);
  if (over) return { status: 'denied', code: 'payload_too_large', reason: over };
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const v = stack.pop();
    if (typeof v === 'string') {
      const d = denyText(v, limits);
      if (d) return d;
    } else if (Array.isArray(v)) {
      for (const x of v) stack.push(x);
    } else if (v !== null && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (isSensitiveKey(k)) {
          return {
            status: 'denied',
            code: CREDENTIAL_BLOCKED.denialCode,
            patternId: 'credential_field_name',
            matchSha256: sha256(k),
          };
        }
        const d = denyText(k, limits);
        if (d) return d;
        stack.push(x);
      }
    }
  }
  return { status: 'ok' };
}

/** Metadata audit `credential.blocked` (CNS-169): tool, Role, id mẫu, hash đoạn khớp — KHÔNG có payload. */
export function credentialBlockedAudit(input: {
  tool: string;
  roleId: string | null;
  result: Extract<PayloadScreenResult, { patternId: string }>;
}): {
  event: typeof CREDENTIAL_BLOCKED.auditEvent;
  severity: typeof CREDENTIAL_BLOCKED.severity;
  tool: string;
  roleId: string | null;
  patternId: string;
  matchSha256: string;
} {
  return {
    event: CREDENTIAL_BLOCKED.auditEvent,
    severity: CREDENTIAL_BLOCKED.severity,
    tool: input.tool,
    roleId: input.roleId,
    patternId: input.result.patternId,
    matchSha256: input.result.matchSha256,
  };
}
