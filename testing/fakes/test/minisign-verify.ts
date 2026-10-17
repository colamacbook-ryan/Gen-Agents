// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
// Bộ kiểm minisign ĐỘC LẬP (viết lại từ đặc tả định dạng, không dùng chung code ký) làm "oracle" cho test update-feed.
// Bộ kiểm thật của sản phẩm nằm ở @ga/security (L-SEC).
import { createHash, verify } from 'node:crypto';
import { publicKeyFromRaw } from '../update-feed/minisign.ts';

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

export function verifyMinisign(publicKeyFile: string, message: Uint8Array, sigFile: string): VerifyResult {
  const pk = Buffer.from(publicKeyFile.split('\n')[1] ?? '', 'base64');
  if (pk.length !== 42 || pk.subarray(0, 2).toString() !== 'Ed')
    return { ok: false, reason: 'khoá công khai sai định dạng' };
  const sl = sigFile.split('\n');
  const sigBlob = Buffer.from(sl[1] ?? '', 'base64');
  if (sigBlob.length !== 74) return { ok: false, reason: 'chữ ký sai độ dài' };
  if (sigBlob.subarray(0, 2).toString() !== 'ED') return { ok: false, reason: 'không phải thuật toán ED (prehash)' };
  if (!sigBlob.subarray(2, 10).equals(pk.subarray(2, 10))) return { ok: false, reason: 'key id không khớp' };
  const sig = sigBlob.subarray(10);
  const key = publicKeyFromRaw(pk.subarray(10));
  const prehash = createHash('blake2b512').update(message).digest();
  if (!verify(null, prehash, key, sig)) return { ok: false, reason: 'chữ ký sai' };
  const tcLine = sl[2] ?? '';
  if (!tcLine.startsWith('trusted comment: ')) return { ok: false, reason: 'thiếu trusted comment' };
  const global = Buffer.from(sl[3] ?? '', 'base64');
  const tc = Buffer.from(tcLine.slice('trusted comment: '.length));
  if (!verify(null, Buffer.concat([sig, tc]), key, global)) return { ok: false, reason: 'chữ ký chung sai' };
  return { ok: true };
}
