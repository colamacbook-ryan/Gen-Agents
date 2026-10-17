// Định danh (DATABASE §2.1, §2.12): ULID sinh ở app + display_id `PREFIX-0001` cấp từ id_counters TRONG cùng giao dịch
// với INSERT (writer duy nhất ⇒ tăng đúng thứ tự commit, rollback không để lỗ). Prefix ↔ bảng: ENTITY_TYPES của contracts
// (test đối chiếu với DB). users đếm ở workspace hệ thống. Không bao giờ dùng display_id làm khoá ngoại.
import { randomBytes } from 'node:crypto';
import {
  type Clock,
  ENTITY_TYPES,
  type EntityPrefix,
  type EntityTable,
  formatDisplayId,
  parseDisplayId,
  SYSTEM_WORKSPACE_ID,
} from '@ga/contracts';
import type { MaintenanceContext, WriteContext } from '../connection.ts';
import { dml } from '../repos/sql.ts';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** ULID (48 bit thời gian ms + 80 bit ngẫu nhiên, Crockford base32, 26 ký tự). Không đơn điệu — không mang thứ tự. */
export function newUlid(clock: Clock, random: (n: number) => Uint8Array = randomBytes): string {
  let t = clock.now().getTime();
  if (!Number.isSafeInteger(t) || t < 0 || t > 0xffff_ffff_ffff)
    throw new RangeError('ULID: thời điểm ngoài khoảng 48 bit');
  let time = '';
  for (let i = 0; i < 10; i++) {
    time = (CROCKFORD[t % 32] as string) + time;
    t = Math.floor(t / 32);
  }
  const bytes = random(10);
  if (bytes.length !== 10) throw new RangeError('ULID: nguồn ngẫu nhiên phải trả 10 byte');
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let rand = '';
  for (let i = 15; i >= 0; i--) rand += CROCKFORD[Number((n >> BigInt(5 * i)) & 31n)];
  return time + rand;
}

export type IdGenerator = () => string;

/** Bộ sinh id cho store: mặc định ULID theo đồng hồ inject. Test / fixture truyền bộ sinh tất định. */
export function ulidGenerator(clock: Clock): IdGenerator {
  return () => newUlid(clock);
}

/** Bộ sinh tất định cho test: '01J' + tiền tố 3 ký tự Crockford + bộ đếm 20 ký tự (vẫn là ULID hợp lệ về hình dạng). */
export function sequentialIds(tag: string): IdGenerator {
  if (!/^[0-9A-HJKMNP-TV-Z]{3}$/.test(tag)) throw new RangeError('sequentialIds: tag là 3 ký tự Crockford');
  let i = 0;
  return () => {
    i++;
    let s = '';
    let v = i;
    for (let k = 0; k < 20; k++) {
      s = (CROCKFORD[v % 32] as string) + s;
      v = Math.floor(v / 32);
    }
    return `01J${tag}${s}`;
  };
}

const TABLE_PREFIX = new Map<string, EntityPrefix>(
  (Object.entries(ENTITY_TYPES) as [EntityPrefix, EntityTable][]).map(([p, t]) => [t, p]),
);

/** Prefix display_id của bảng (null = bảng không có display_id). */
export function prefixOf(table: string): EntityPrefix | null {
  return TABLE_PREFIX.get(table) ?? null;
}

/** Workspace giữ bộ đếm của prefix: US đếm ở workspace hệ thống (DATABASE §2.12). */
export function counterWorkspace(prefix: EntityPrefix, workspaceId: string): string {
  return prefix === 'US' ? SYSTEM_WORKSPACE_ID : workspaceId;
}

export interface DisplayId {
  displaySeq: number;
  displayId: string;
}

/**
 * Cấp số kế tiếp cho (workspace, prefix) trong giao dịch đang mở: upsert id_counters (ngoại lệ NO_REPLACE_EXEMPT của DB —
 * cấp số bằng ON CONFLICT là đường hợp lệ duy nhất, DATABASE §2.2) rồi đọc lại last_seq.
 */
export function allocateDisplayId(
  w: WriteContext | MaintenanceContext,
  workspaceId: string,
  prefix: EntityPrefix,
): DisplayId {
  const ws = counterWorkspace(prefix, workspaceId);
  const [row] = dml(w).write(
    'INSERT INTO id_counters (workspace_id, prefix, last_seq) VALUES (?, ?, 1) ' +
      'ON CONFLICT (workspace_id, prefix) DO UPDATE SET last_seq = last_seq + 1 RETURNING last_seq',
    [ws, prefix],
  ).rows as { last_seq: number }[];
  if (row === undefined || !Number.isSafeInteger(row.last_seq) || row.last_seq <= 0) {
    throw new RangeError(`id_counters không trả số hợp lệ cho ${prefix}`);
  }
  return { displaySeq: row.last_seq, displayId: formatDisplayId(prefix, row.last_seq) };
}

/** Tách display_id và bắt buộc đúng bảng: `RL-0003` cho 'roles' ⇒ 3; sai prefix / sai định dạng ⇒ null. */
export function displaySeqFor(table: EntityTable, displayId: string): number | null {
  const p = parseDisplayId(displayId);
  if (p === null || p.table !== table) return null;
  return p.seq;
}

export { formatDisplayId, parseDisplayId };
