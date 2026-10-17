import { ENTITY_TYPES, type EntityPrefix } from '../ids.ts';
import { Anchor } from '../mcp.ts';
import { type AuthLevel, authAtLeast, maxAuth } from './define.ts';
import { GRID_KEYS, GRID_PREFIX, type GridKeyName } from './grids.ts';
import { SSE_EVENT_AUDIENCE, type SseEventTypeName } from './sse.ts';

// Quyền ĐỌC của các route đọc TỔNG QUÁT (OPS-33/34 lưới, OPS-35 bản ghi, OPS-36 tìm kiếm, SYS-23 anchor, SYS-17/19 ghim vào chat)
// — review bảo mật PR #7 (HIGH). Các route này nhận prefix / lưới do client chọn, nên quyền route (`V`) KHÔNG đủ: mỗi loại bản ghi
// có mức đọc riêng. Quyền tối thiểu = `max(route.auth, RECORD_ACCESS[prefix], GRID_MIN_AUTH[lưới])`.
// KHÔNG có mặc định: prefix thiếu trong `RECORD_ACCESS` ⇒ lỗi kiểu lúc compile VÀ test quét `ENTITY_TYPES` đỏ.

/** Mức đọc của một loại bản ghi: `V` mọi thành viên · `A` admin / owner · `O` owner · `deny` không bao giờ qua API đọc tổng quát. */
export type RecordAccess = Exclude<AuthLevel, 'public'> | 'deny';

/**
 * `deny` = mang credential / ciphertext / danh tính đăng nhập thô: `US` (users: email, username, mật khẩu băm), `SEC` (secrets:
 * ciphertext, DEK bọc), `BK` (backups: đường dẫn, kho chứa DB có secret đã mã hoá). Muốn liệt kê thành viên dùng `MemberView`
 * (join `workspace_members`), không dùng bản ghi `US`.
 * `A` = mang PII Telegram hoặc cấu hình nhạy cảm: `TG`, `AL` (tgUserId, tên hiển thị), `TH`, `MSG` (hội thoại kênh Telegram: nội
 * dung người ngoài), `CN` (đồng ý + `account_hint`), `ST` (settings: giá trị neo ngoài máy, khoá nhạy cảm).
 * Còn lại `V` (nội dung `confidential` do route che theo `V_MASKED_FIELDS`).
 */
export const RECORD_ACCESS: Record<EntityPrefix, RecordAccess> = {
  US: 'deny',
  RL: 'V',
  AV: 'V',
  SN: 'V',
  DN: 'V',
  RV: 'V',
  CS: 'V',
  IN: 'V',
  TX: 'V',
  SK: 'V',
  KN: 'V',
  MM: 'V',
  PS: 'V',
  AS: 'V',
  TT: 'V',
  TK: 'V',
  CM: 'V',
  SS: 'V',
  WL: 'V',
  LG: 'V',
  RW: 'V',
  EN: 'V',
  EB: 'V',
  SA: 'V',
  PB: 'V',
  CAP: 'V',
  MR: 'V',
  GC: 'V',
  CT: 'V',
  TG: 'A',
  AL: 'A',
  PP: 'V',
  PA: 'V',
  PN: 'V',
  TL: 'V',
  GR: 'V',
  PM: 'V',
  EG: 'V',
  PC: 'V',
  CD: 'V',
  TR: 'V',
  TH: 'A',
  MSG: 'A',
  AT: 'V',
  AN: 'V',
  UA: 'V',
  AU: 'V',
  EV: 'V',
  NT: 'V',
  JB: 'V',
  UP: 'V',
  BK: 'deny',
  UR: 'V',
  ST: 'A',
  SEC: 'deny',
  CN: 'A',
};

/** Prefix đọc được qua route tổng quát (loại `deny`). OPS-35 chỉ nhận ref thuộc tập này; prefix khác ⇒ `404 not_found`. */
export const READABLE_PREFIXES: readonly EntityPrefix[] = (Object.keys(ENTITY_TYPES) as EntityPrefix[]).filter(
  (p) => RECORD_ACCESS[p] !== 'deny',
);

/** Mức đọc tối thiểu của từng lưới = mức của prefix hàng. Lưới KHÔNG được trỏ vào prefix `deny` (kiểm lúc nạp module). */
export const GRID_MIN_AUTH: Record<GridKeyName, Exclude<AuthLevel, 'public'>> = Object.fromEntries(
  GRID_KEYS.map((key) => {
    const access = RECORD_ACCESS[GRID_PREFIX[key]];
    if (access === 'deny') throw new Error(`lưới ${key} trỏ vào prefix ${GRID_PREFIX[key]} bị deny`);
    return [key, access];
  }),
) as Record<GridKeyName, Exclude<AuthLevel, 'public'>>;

/**
 * Quyền đọc hiệu lực của một route đọc tổng quát với một loại bản ghi (prefix) hoặc một lưới:
 * `max(route.auth, RECORD_ACCESS[prefix], GRID_MIN_AUTH[lưới])`; prefix lạ hoặc `deny` ⇒ `'deny'` (fail-closed).
 * Dịch vụ gọi SAU khi tra ra prefix của bản ghi THẬT (ULID không mang prefix) và TRƯỚC khi trả nội dung.
 */
export function effectiveReadAuth(route: { auth: AuthLevel }, target: EntityPrefix | GridKeyName): AuthLevel | 'deny' {
  const isGrid = Object.hasOwn(GRID_PREFIX, target);
  const prefix = (isGrid ? GRID_PREFIX[target as GridKeyName] : target) as EntityPrefix;
  const access = Object.hasOwn(RECORD_ACCESS, prefix) ? RECORD_ACCESS[prefix] : undefined;
  if (access === undefined || access === 'deny') return 'deny';
  const level = maxAuth(route.auth, access);
  return isGrid ? maxAuth(level, GRID_MIN_AUTH[target as GridKeyName]) : level;
}

// ---------------------------------------------------------------- anchor chỉ trỏ vào bản ghi đọc được
const ANCHOR_ENTITY_RE = /(?:^|\/)(?:row|role|msg|file):([A-Z]{2,3})-/;

/** Prefix của bản ghi mà anchor trỏ tới (`grid:…/row:US-0001` → `US`); anchor không trỏ bản ghi (panel / region) ⇒ `null`. */
export function anchorEntityPrefix(anchor: string): EntityPrefix | null {
  const m = ANCHOR_ENTITY_RE.exec(anchor);
  const prefix = m?.[1];
  return prefix !== undefined && Object.hasOwn(ENTITY_TYPES, prefix) ? (prefix as EntityPrefix) : null;
}

/**
 * `Anchor` (mcp.ts) + KHÔNG trỏ vào bản ghi `deny`: ghim vào chat (SYS-17/19) hoặc resolve (SYS-23) sẽ chụp snapshot đưa vào
 * prompt của model / trả cho client — anchor `row:US-0001` / `row:SEC-0001` thành đường lấy dữ liệu bị cấm. Mức A của `AL` / `TG`…
 * do dịch vụ kiểm bằng `effectiveReadAuth` (anchor chỉ là cú pháp).
 */
export const ReadableAnchor = Anchor.refine((a) => {
  const prefix = anchorEntityPrefix(a);
  return prefix === null || RECORD_ACCESS[prefix] !== 'deny';
}, 'anchor trỏ vào bản ghi không đọc được qua API').meta({ example: 'role:RL-0001' });

/**
 * Người này có được nhận sự kiện SSE này không (fail-closed). `viewer.auth = null` (access_level lạ) ⇒ không nhận gì.
 * `grid.changed` còn phải đạt `GRID_MIN_AUTH[grid]`; `recipient` chỉ khi `isRecipient`.
 */
export function sseEventAllows(
  event: { readonly type: SseEventTypeName; readonly grid?: GridKeyName },
  viewer: { readonly auth: Exclude<AuthLevel, 'public'> | null; readonly isRecipient: boolean },
): boolean {
  if (viewer.auth === null) return false;
  const audience = SSE_EVENT_AUDIENCE[event.type];
  if (audience === undefined) return false;
  if (audience === 'recipient') return viewer.isRecipient;
  let need: AuthLevel = audience;
  if (event.type === 'grid.changed') {
    if (event.grid === undefined || GRID_MIN_AUTH[event.grid] === undefined) return false;
    need = maxAuth(need, GRID_MIN_AUTH[event.grid]);
  }
  return authAtLeast(viewer.auth, need);
}
