// Chặn payload ra có nội dung giống credential (CNS-133, CNS-169) — mọi tool có dữ liệu đi ra / ghi bền, tin Telegram, export.
// Thứ tự BẮT BUỘC: (1) chặn kích thước (không quét gì nếu vượt trần) → (2) quét MỌI khoá + MỌI chuỗi giá trị, không có tool /
// trường nào được miễn. Kết quả `denied` mang id mẫu — KHÔNG mang payload / đoạn khớp / hash (contracts CREDENTIAL_BLOCKED:
// audit chỉ {patternId, tool}). Lần chặn ⇒ audit `credential.blocked`, cảnh báo owner, KHÔNG phạt (CNS-169).
import {
  CREDENTIAL_KEY_NAMES,
  type CredentialPatternId,
  isCredentialKeyName,
  normalizeCredentialName,
  TOOL_PAYLOAD_LIMITS,
} from '@ga/contracts';
import { auditPatternId, scanText } from './credential-detector.ts';

export interface PayloadLimits {
  maxStringChars: number;
  maxTotalChars: number;
  maxDepth: number;
  maxNodes: number;
}

/**
 * Tên khoá mang credential — MỘT nguồn luật (contracts 0a2bfff): `isCredentialKeyName` của contracts (tên
 * `CREDENTIAL_KEY_NAMES` mọi kiểu viết) + `SECURITY_EXTRA_KEY_NAMES`, chuẩn hoá bằng chính `normalizeCredentialName` của
 * contracts (bỏ `_` / `-`, hạ chữ thường: `Refresh-Token` = `refresh_token` = `refreshToken` = `REFRESH__TOKEN`).
 */

/** Phần thêm RIÊNG của security (ngoài contracts): tên chung chung chỉ chặn khi là KHOÁ object, không chặn câu văn. */
export const SECURITY_EXTRA_KEY_NAMES = [
  'password',
  'passwd',
  'secret',
  'token',
  'oauth_token',
  'authorization',
  'proxy-authorization',
  'bearer',
  'cookie',
  'set-cookie',
  'auth_code',
] as const;

export const SENSITIVE_KEY_NAMES: ReadonlySet<string> = new Set(
  [...CREDENTIAL_KEY_NAMES, ...SECURITY_EXTRA_KEY_NAMES].map(normalizeCredentialName),
);

export function isSensitiveKey(key: string): boolean {
  return isCredentialKeyName(key) || SENSITIVE_KEY_NAMES.has(normalizeCredentialName(key));
}

export type PayloadScreenResult =
  | { status: 'ok' }
  | { status: 'denied'; code: 'payload_too_large'; reason: string }
  | {
      status: 'denied';
      code: 'credential_like_payload';
      /** id mẫu chính xác của bộ dùng chung (để log nội bộ) */
      patternId: string;
      /** id cho audit `credential.blocked` (thuộc CREDENTIAL_PATTERN_IDS của contracts) — gateway gọi
       *  `credentialBlockedAudit(tool, auditPatternId)` của contracts. Không có payload / đoạn khớp / hash. */
      auditPatternId: CredentialPatternId;
    };

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

function denyText(s: string, limits: PayloadLimits): PayloadScreenResult | null {
  const r = scanText(s, { maxChars: limits.maxStringChars, firstOnly: true });
  if (r.status === 'clean') return null;
  if (r.status === 'too_large') return { status: 'denied', code: 'payload_too_large', reason: 'chuỗi quá dài' };
  return {
    status: 'denied',
    code: 'credential_like_payload',
    patternId: r.patternId,
    auditPatternId: auditPatternId(r.patternId),
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
            code: 'credential_like_payload',
            patternId: 'credential_field_name',
            auditPatternId: 'credential_field_name',
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
