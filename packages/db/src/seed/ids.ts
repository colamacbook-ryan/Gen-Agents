// id tất định của hàng seed tham chiếu (lane DB quyết — DB v2.3.4; = seed_row_id của db/spec/gen_seed.py, test đối chiếu vector):
// '0000000000' (phần thời gian ULID cố định = 0) + 16 ký tự Crockford base32 của 80 bit đầu
// sha256(UTF-8 'ga.seed-reference.v1:' + workspaceId + ':' + key). key = '<bảng>:<display_id viết thường>' (vd 'settings:st-0017').
// Cùng (workspace, key) ⇒ cùng id (chạy lại không nhân đôi); khác workspace ⇒ khác id. Không đơn điệu — thứ tự theo display_seq.
import { createHash } from 'node:crypto';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function seedRowId(workspaceId: string, key: string): string {
  const digest = createHash('sha256').update(`ga.seed-reference.v1:${workspaceId}:${key}`, 'utf8').digest();
  let n = 0n;
  for (const b of digest.subarray(0, 10)) n = (n << 8n) | BigInt(b);
  let out = '';
  for (let i = 15; i >= 0; i--) out += CROCKFORD[Number((n >> BigInt(5 * i)) & 31n)];
  return `0000000000${out}`;
}

/** `WorkspaceSeedTarget.idFor` cho một tenant. */
export function seedIdFor(workspaceId: string): (key: string) => string {
  return (key) => seedRowId(workspaceId, key);
}
