// Kho bí mật: envelope encryption AES-256-GCM (DATABASE §9.5 "API key, bot token và bí mật khác"; BUILD-PLAN §A.1).
//
// - DEK ngẫu nhiên 256 bit mỗi bí mật; dữ liệu = AES-256-GCM(DEK, nonce 96 bit, AAD) với AAD gắn workspace_id ‖ secret_id ‖
//   kind (mã hoá độ dài từng trường — không mơ hồ). Chép ciphertext sang hàng / workspace / loại khác ⇒ giải mã thất bại.
// - DEK được bọc bằng KEK: AES-256-GCM(KEK, dek_nonce, AAD gắn cùng ngữ cảnh + kek_id).
// - KEK = HKDF(master key, "secret-store:kek:v1") [Gen duyệt 2026-10-16: tách miền với các khoá phụ khác dẫn xuất từ cùng master
//   key; DATABASE ghi "KEK = master key"]. `kek_id` = id của master key trong keyring.
// - Xoay KEK: `rewrapSecret` giải DEK bằng khoá cũ (trong keyring), bọc lại bằng khoá hiện hành; ciphertext giữ nguyên.
// - Cột khớp bảng `secrets`: ciphertext (‖ tag 16 byte), nonce, wrapped_dek (‖ tag), dek_nonce, kek_id, alg, last4, fingerprint.
// - Thiếu khoá (kek_id không có trong keyring) ⇒ `SecretKeyUnavailableError` — báo "không có khoá", KHÔNG báo nhầm là bị sửa
//   (BUILD-PLAN §B.9, CNS-144). Sai tag ⇒ `SecretDecryptError`.
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { lengthPrefixed } from './encoding.ts';
import { deriveSubkey, KEY_BYTES, type MasterKey, type MasterKeyring } from './keys.ts';

export const ENVELOPE_ALG = 'A256GCM' as const;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
/** Trần bản rõ: API key / bot token / token neo đều ngắn; chặn nạp nhầm tệp lớn vào kho. */
export const MAX_SECRET_BYTES = 16 * 1024;

export interface SecretContext {
  workspaceId: string;
  secretId: string;
  kind: string;
}

/** Đúng các cột mật mã của bảng `secrets`. */
export interface SealedSecret {
  ciphertext: Buffer;
  nonce: Buffer;
  wrappedDek: Buffer;
  dekNonce: Buffer;
  kekId: string;
  alg: typeof ENVELOPE_ALG;
  /** 4 ký tự cuối cho UI — null nếu bản rõ < 12 ký tự (4 ký tự là quá nhiều phần của một bí mật ngắn). */
  last4: string | null;
  /** HMAC-SHA256(K_fp, workspace_id ‖ bản rõ) hex — phát hiện trùng trong workspace, không lộ bản rõ. */
  fingerprint: string;
}

export class SecretKeyUnavailableError extends Error {
  readonly kekId: string;
  constructor(kekId: string) {
    super(`không có khoá để giải mã bí mật (kek_id ${kekId} không có trong keyring) — cần master key cũ`);
    this.name = 'SecretKeyUnavailableError';
    this.kekId = kekId;
  }
}

export class SecretDecryptError extends Error {
  constructor(message = 'giải mã bí mật thất bại (sai ngữ cảnh hoặc dữ liệu bị sửa)') {
    super(message);
    this.name = 'SecretDecryptError';
  }
}

function assertContext(ctx: SecretContext): void {
  for (const [k, v] of Object.entries(ctx)) {
    if (typeof v !== 'string' || v.length === 0 || v.length > 64)
      throw new RangeError(`ngữ cảnh bí mật: ${k} không hợp lệ`);
  }
}

const dataAad = (ctx: SecretContext) => lengthPrefixed('ga-secret.v1', ctx.workspaceId, ctx.secretId, ctx.kind);
const dekAad = (ctx: SecretContext, kekId: string) =>
  lengthPrefixed('ga-dek.v1', ctx.workspaceId, ctx.secretId, ctx.kind, kekId);

function gcmSeal(key: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): { nonce: Buffer; sealed: Buffer } {
  const nonce = randomBytes(NONCE_BYTES);
  const c = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG_BYTES });
  c.setAAD(aad);
  const sealed = Buffer.concat([c.update(plaintext), c.final(), c.getAuthTag()]);
  return { nonce, sealed };
}

function gcmOpen(key: Uint8Array, nonce: Uint8Array, sealed: Uint8Array, aad: Uint8Array): Buffer {
  if (nonce.byteLength !== NONCE_BYTES || sealed.byteLength < TAG_BYTES)
    throw new SecretDecryptError('dữ liệu mã hoá sai độ dài');
  const body = sealed.subarray(0, sealed.byteLength - TAG_BYTES);
  const tag = sealed.subarray(sealed.byteLength - TAG_BYTES);
  const d = createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG_BYTES });
  d.setAAD(aad);
  d.setAuthTag(tag);
  try {
    return Buffer.concat([d.update(body), d.final()]);
  } catch {
    throw new SecretDecryptError();
  }
}

const kekOf = (mk: MasterKey) => deriveSubkey(mk.key, 'kek');

function fingerprintOf(mk: MasterKey, ctx: SecretContext, plaintext: Uint8Array): string {
  return createHmac('sha256', deriveSubkey(mk.key, 'fingerprint'))
    .update(lengthPrefixed('ga-fp.v1', ctx.workspaceId))
    .update(plaintext)
    .digest('hex');
}

function last4Of(plaintext: Buffer): string | null {
  const s = plaintext.toString('utf8');
  const chars = [...s];
  return chars.length >= 12 ? chars.slice(-4).join('') : null;
}

/** Mã hoá một bí mật mới bằng khoá hiện hành của keyring. */
export function sealSecret(plaintext: string | Uint8Array, ctx: SecretContext, keyring: MasterKeyring): SealedSecret {
  assertContext(ctx);
  const pt = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : Buffer.from(plaintext);
  if (pt.byteLength === 0 || pt.byteLength > MAX_SECRET_BYTES) {
    throw new RangeError(`bí mật phải 1–${MAX_SECRET_BYTES} byte`);
  }
  const mk = keyring.current;
  const dek = randomBytes(KEY_BYTES);
  try {
    const data = gcmSeal(dek, pt, dataAad(ctx));
    const wrap = gcmSeal(kekOf(mk), dek, dekAad(ctx, mk.id));
    return {
      ciphertext: data.sealed,
      nonce: data.nonce,
      wrappedDek: wrap.sealed,
      dekNonce: wrap.nonce,
      kekId: mk.id,
      alg: ENVELOPE_ALG,
      last4: last4Of(pt),
      fingerprint: fingerprintOf(mk, ctx, pt),
    };
  } finally {
    dek.fill(0);
    pt.fill(0);
  }
}

type SealedInput = Pick<SealedSecret, 'ciphertext' | 'nonce' | 'wrappedDek' | 'dekNonce' | 'kekId'> & { alg: string };

function unwrapDek(sealed: SealedInput, ctx: SecretContext, keyring: MasterKeyring): Buffer {
  if (sealed.alg !== ENVELOPE_ALG) throw new SecretDecryptError(`thuật toán lạ: ${sealed.alg}`);
  const mk = keyring.get(sealed.kekId);
  if (!mk) throw new SecretKeyUnavailableError(sealed.kekId);
  const dek = gcmOpen(kekOf(mk), sealed.dekNonce, sealed.wrappedDek, dekAad(ctx, sealed.kekId));
  if (dek.byteLength !== KEY_BYTES) throw new SecretDecryptError('DEK sai độ dài');
  return dek;
}

/** Giải mã — CHỈ injector gọi lúc khởi động container được gán (DATABASE §9.5). Trả Buffer (người gọi xoá sau khi dùng). */
export function openSecret(sealed: SealedInput, ctx: SecretContext, keyring: MasterKeyring): Buffer {
  assertContext(ctx);
  const dek = unwrapDek(sealed, ctx, keyring);
  try {
    return gcmOpen(dek, sealed.nonce, sealed.ciphertext, dataAad(ctx));
  } finally {
    dek.fill(0);
  }
}

/**
 * Xoay KEK: bọc lại DEK bằng khoá hiện hành (ciphertext + nonce dữ liệu giữ nguyên), tính lại fingerprint bằng khoá mới.
 * Đã ở khoá hiện hành ⇒ null (không cần ghi). Kiểm toàn vẹn bản rõ trước khi trả (giải mã đầy đủ một lần).
 */
export function rewrapSecret(
  sealed: SealedInput,
  ctx: SecretContext,
  keyring: MasterKeyring,
): Pick<SealedSecret, 'wrappedDek' | 'dekNonce' | 'kekId' | 'fingerprint'> | null {
  assertContext(ctx);
  if (sealed.kekId === keyring.current.id) return null;
  const dek = unwrapDek(sealed, ctx, keyring);
  try {
    const pt = gcmOpen(dek, sealed.nonce, sealed.ciphertext, dataAad(ctx));
    const mk = keyring.current;
    const wrap = gcmSeal(kekOf(mk), dek, dekAad(ctx, mk.id));
    const fingerprint = fingerprintOf(mk, ctx, pt);
    pt.fill(0);
    return { wrappedDek: wrap.sealed, dekNonce: wrap.nonce, kekId: mk.id, fingerprint };
  } finally {
    dek.fill(0);
  }
}
