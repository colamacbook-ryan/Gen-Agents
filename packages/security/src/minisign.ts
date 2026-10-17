// Kiểm chữ ký minisign cho updater (BUILD-PLAN §A.1 "Ký phát hành", §B.9 chuỗi tin cậy CNS-141) bằng node:crypto thuần:
// Ed25519 + BLAKE2b-512, khoá công khai GHIM (không nhận khoá từ feed / tham số).
//
// Định dạng minisign:
//   khoá công khai: base64( "Ed" ‖ key_id[8] ‖ pk[32] )
//   tệp .minisig:   untrusted comment: …
//                   base64( alg[2] ‖ key_id[8] ‖ sig[64] )      alg "ED" = ký BLAKE2b-512(tệp) (mặc định từ minisign 0.10)
//                   trusted comment: …
//                   base64( global_sig[64] )                     = Ed25519(sig ‖ trusted_comment)
// Chỉ nhận "ED" (prehashed): bản phát hành do CI ký bằng minisign hiện đại; "Ed" (legacy) bị từ chối — bớt một đường vào.
// Sau chữ ký: manifest phải là JSON có `version` semver và MỚI HƠN bản đang chạy (chặn hạ cấp / phát lại manifest cũ).
import { createHash, createPublicKey, type KeyObject, verify } from 'node:crypto';
import { constantTimeEqual } from './encoding.ts';

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
export const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_SIG_FILE_CHARS = 4096;

export interface MinisignPublicKey {
  readonly keyId: Buffer;
  readonly key: KeyObject;
}

export class MinisignKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MinisignKeyError';
  }
}

const B64_LINE_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function decodeB64Line(line: string): Buffer | null {
  if (!B64_LINE_RE.test(line)) return null;
  const buf = Buffer.from(line, 'base64');
  return buf.toString('base64') === line ? buf : null;
}

/** Nhận cả tệp `minisign.pub` (2 dòng) lẫn riêng dòng base64. Sai dạng ⇒ ném (khoá ghim hỏng là lỗi đóng gói, không lặng lẽ bỏ). */
export function parseMinisignPublicKey(text: string): MinisignPublicKey {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('untrusted comment:'));
  if (lines.length !== 1) throw new MinisignKeyError('khoá công khai minisign: cần đúng một dòng base64');
  const raw = decodeB64Line(lines[0] as string);
  if (raw?.byteLength !== 42 || raw[0] !== 0x45 || raw[1] !== 0x64) {
    throw new MinisignKeyError('khoá công khai minisign sai định dạng (cần "Ed" ‖ key_id ‖ pk = 42 byte)');
  }
  const key = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw.subarray(10)]),
    format: 'der',
    type: 'spki',
  });
  return Object.freeze({ keyId: Buffer.from(raw.subarray(2, 10)), key });
}

export type MinisignRejectReason =
  | 'too_large'
  | 'malformed'
  | 'legacy_signature'
  | 'unsupported_algorithm'
  | 'key_mismatch'
  | 'bad_signature'
  | 'bad_global_signature';

export type MinisignResult = { ok: true; trustedComment: string } | { ok: false; reason: MinisignRejectReason };

/** Kiểm một tệp + chữ ký minisign bằng khoá ghim. */
export function verifyMinisign(message: Uint8Array, signatureFile: string, pub: MinisignPublicKey): MinisignResult {
  if (message.byteLength > MAX_MANIFEST_BYTES || signatureFile.length > MAX_SIG_FILE_CHARS) {
    return { ok: false, reason: 'too_large' };
  }
  const lines = signatureFile.split(/\r?\n/);
  if (lines[lines.length - 1] === '') lines.pop();
  if (lines.length !== 4) return { ok: false, reason: 'malformed' };
  const [c1, sigLine, c2, globalLine] = lines as [string, string, string, string];
  if (!c1.startsWith('untrusted comment:') || !c2.startsWith('trusted comment: '))
    return { ok: false, reason: 'malformed' };
  const sigRaw = decodeB64Line(sigLine.trim());
  const globalSig = decodeB64Line(globalLine.trim());
  if (sigRaw?.byteLength !== 74 || !globalSig || globalSig.byteLength !== 64) {
    return { ok: false, reason: 'malformed' };
  }
  const alg = sigRaw.subarray(0, 2).toString('latin1');
  if (alg === 'Ed') return { ok: false, reason: 'legacy_signature' };
  if (alg !== 'ED') return { ok: false, reason: 'unsupported_algorithm' };
  if (!constantTimeEqual(sigRaw.subarray(2, 10), pub.keyId)) return { ok: false, reason: 'key_mismatch' };
  const sig = sigRaw.subarray(10);
  const digest = createHash('blake2b512').update(message).digest();
  if (!verify(null, digest, pub.key, sig)) return { ok: false, reason: 'bad_signature' };
  const trustedComment = c2.slice('trusted comment: '.length);
  const globalMsg = Buffer.concat([sig, Buffer.from(trustedComment, 'utf8')]);
  if (!verify(null, globalMsg, pub.key, globalSig)) return { ok: false, reason: 'bad_global_signature' };
  return { ok: true, trustedComment };
}

// ---------------------------------------------------------------- semver + chống hạ cấp
interface SemVer {
  major: number;
  minor: number;
  patch: number;
  pre: string[];
}

const SEMVER_RE =
  /^v?(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})(?:-([0-9A-Za-z.-]{1,64}))?(?:\+[0-9A-Za-z.-]{1,64})?$/;

export function parseSemver(v: string): SemVer | null {
  if (typeof v !== 'string' || v.length > 160) return null;
  const m = SEMVER_RE.exec(v);
  if (!m) return null;
  const pre = m[4] === undefined ? [] : m[4].split('.');
  for (const id of pre) {
    if (id.length === 0 || (/^\d+$/.test(id) && id.length > 1 && id.startsWith('0'))) return null;
  }
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre };
}

/** So hai phiên bản theo semver §11 (build metadata bỏ qua). Phiên bản sai dạng ⇒ ném. */
export function compareSemver(a: string, b: string): number {
  const x = parseSemver(a);
  const y = parseSemver(b);
  if (!x || !y) throw new RangeError(`phiên bản không đúng semver: ${!x ? a : b}`);
  for (const k of ['major', 'minor', 'patch'] as const) if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
  if (x.pre.length === 0 || y.pre.length === 0) return x.pre.length === y.pre.length ? 0 : x.pre.length === 0 ? 1 : -1;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn) return Number(p) < Number(q) ? -1 : 1;
    if (pn !== qn) return pn ? -1 : 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

export type ManifestVerifyResult =
  | { ok: true; version: string; manifest: Record<string, unknown>; trustedComment: string }
  | { ok: false; reason: MinisignRejectReason | 'not_json' | 'bad_manifest' | 'downgrade' | 'not_newer' };

/**
 * Chuỗi tin cậy của updater, đúng thứ tự: chữ ký (khoá ghim) TRƯỚC, rồi mới parse JSON, rồi chặn hạ cấp.
 * Manifest không chữ ký / sai chữ ký / khác khoá / không mới hơn bản đang chạy ⇒ từ chối, updater không tải gì.
 */
export function verifyReleaseManifest(input: {
  manifest: Uint8Array;
  signature: string;
  publicKey: MinisignPublicKey;
  currentVersion: string;
}): ManifestVerifyResult {
  if (parseSemver(input.currentVersion) === null) throw new RangeError('phiên bản đang chạy không đúng semver');
  const sig = verifyMinisign(input.manifest, input.signature, input.publicKey);
  if (!sig.ok) return sig;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(input.manifest).toString('utf8'));
  } catch {
    return { ok: false, reason: 'not_json' };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
    return { ok: false, reason: 'bad_manifest' };
  const version = (parsed as Record<string, unknown>).version;
  if (typeof version !== 'string' || parseSemver(version) === null) return { ok: false, reason: 'bad_manifest' };
  const cmp = compareSemver(version, input.currentVersion);
  if (cmp < 0) return { ok: false, reason: 'downgrade' };
  if (cmp === 0) return { ok: false, reason: 'not_newer' };
  return { ok: true, version, manifest: parsed as Record<string, unknown>, trustedComment: sig.trustedComment };
}
