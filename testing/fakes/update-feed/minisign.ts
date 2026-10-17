// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
//
// Ký minisign (định dạng "ED": Ed25519 trên BLAKE2b-512 của thông điệp) bằng node:crypto, KHÔNG dùng khoá thật:
// khoá test sinh lúc chạy (BUILD-PLAN §C.3). Tương thích định dạng với binary `minisign` đã kiểm tay (xem ASSUMPTIONS UF-1).
//   khoá công khai : base64( "Ed" ‖ keyId(8) ‖ pubkey(32) )
//   chữ ký         : base64( "ED" ‖ keyId(8) ‖ Ed25519(BLAKE2b-512(msg)) )
//   chữ ký chung   : Ed25519( chữ ký(64) ‖ trustedComment )
import { createHash, createPublicKey, generateKeyPairSync, type KeyObject, randomBytes, sign } from 'node:crypto';

export interface MinisignKey {
  keyId: Buffer;
  publicKey: KeyObject;
  privateKey: KeyObject;
  /** 32 byte công khai thô. */
  publicRaw: Buffer;
}

export function generateMinisignKey(): MinisignKey {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  return { keyId: randomBytes(8), publicKey, privateKey, publicRaw: spki.subarray(spki.length - 32) };
}

/** Nội dung tệp .pub (comment không được tin — chỉ thông tin). */
export function minisignPublicKeyFile(key: MinisignKey): string {
  const idHex = Buffer.from(key.keyId).reverse().toString('hex').toUpperCase();
  const b64 = Buffer.concat([Buffer.from('Ed'), key.keyId, key.publicRaw]).toString('base64');
  return `untrusted comment: minisign public key: ${idHex}\n${b64}\n`;
}

/** Khoá công khai dạng base64 một dòng (dùng khi image updater-test ghim khoá). */
export const minisignPublicKeyBase64 = (key: MinisignKey): string =>
  Buffer.concat([Buffer.from('Ed'), key.keyId, key.publicRaw]).toString('base64');

export function signMinisign(message: Uint8Array, key: MinisignKey, trustedComment: string): string {
  const prehash = createHash('blake2b512').update(message).digest();
  const sig = sign(null, prehash, key.privateKey);
  const global = sign(null, Buffer.concat([sig, Buffer.from(trustedComment)]), key.privateKey);
  return [
    'untrusted comment: signature from minisign secret key',
    Buffer.concat([Buffer.from('ED'), key.keyId, sig]).toString('base64'),
    `trusted comment: ${trustedComment}`,
    global.toString('base64'),
    '',
  ].join('\n');
}

/** Dựng KeyObject công khai từ 32 byte thô (dùng cho bộ kiểm trong test). */
export function publicKeyFromRaw(raw: Buffer): KeyObject {
  return createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]),
    format: 'der',
    type: 'spki',
  });
}
