import { z } from 'zod';
import { type EntityPrefix, isEntityPrefix } from '../ids.ts';
import { Json, KeyStr, list, Nat, PageOf, queryList, str, Ulid } from './common.ts';
import { RouteIdRef } from './shapes.ts';

// Data Console (STD-07; BACKEND-TRIAL §3.6 OPS-32…36; DATABASE §6, §8): grid có phân trang keyset, lọc (ô truy vấn §8.1), sắp xếp,
// nhóm, chọn cột, view dựng sẵn, footer Σ, xuất CSV, trạng thái hàng (đề xuất / bị thay thế / Trọng thương).
// Phạm vi (owner chốt 2026-10-17): Data Console nằm trong MVP dùng thử; chỉ lớp game hoá (chibi, bối cảnh, hiệu ứng) để sau.
//
// Luật:
//   - Tên cột CHỈ từ whitelist của lưới (DATABASE §8.2); bộ biên dịch tham số hoá của L-DB (`packages/db/src/query-box`) là
//     nơi duy nhất sinh SQL. Hợp đồng chỉ mô tả hình dạng vào / ra.
//   - Sửa ô KHÔNG có route chung: `GridColumn.editRouteId` trỏ route ghi của lane sở hữu (SYS-38, SYS-48, OPS-03…) để mọi lần
//     ghi qua change set / guard của đúng miền. "+ Thêm hàng" = `GridInfo.createRouteId`.
//   - Chữ hiển thị (nhãn cột, tên view, tên lưới) lấy từ i18n theo khoá (`key`, `letter`); API không trả câu chữ.
//   - Xuất CSV: ô bắt đầu bằng `=`, `+`, `-`, `@`, tab hoặc CR PHẢI được thoát (tiền tố `'`) — chống CSV / formula injection.

/** Lưới theo DATABASE §6.1–§6.2 → prefix `display_id` của hàng. L-OPS bổ sung khoá mới qua PR "contract" (test giữ khớp prefix). */
export const GRID_PREFIX = {
  roles: 'RL',
  dna: 'DN',
  instructions: 'IN',
  skills: 'SK',
  knowledge: 'KN',
  memories: 'MM',
  tasks: 'TK',
  commitments: 'CM',
  ledger: 'LG',
  audit: 'AU',
  events: 'EV',
  capabilities: 'CAP',
  taxonomy: 'TX',
  polaris_checks: 'PC',
  wounds: 'RW',
  engine_accounts: 'EN',
  engine_bindings: 'EB',
  containers: 'CT',
  model_ranks: 'MR',
  system_agents: 'SA',
  telegram_bots: 'TG',
  telegram_allowlist: 'AL',
  proactive_policies: 'PP',
  proactive_jobs: 'PA',
  proactive_sends: 'PN',
  update_runs: 'UR',
  app_versions: 'UP',
  change_sets: 'CS',
  employee_cards: 'CD',
  trial_runs: 'TR',
  notifications: 'NT',
  characters: 'SN',
  avatars: 'AV',
} as const satisfies Record<string, EntityPrefix>;

export type GridKeyName = keyof typeof GRID_PREFIX;
export const GRID_KEYS = Object.keys(GRID_PREFIX) as [GridKeyName, ...GridKeyName[]];
export const GridKey = z.enum(GRID_KEYS);

export const GRID_PAGE_MAX = 500;
export const GRID_PAGE_DEFAULT = 200;
/** Truy vấn ô truy vấn chạy ở connection chỉ đọc, trần thời gian (DATABASE §8.3). */
export const GRID_QUERY_TIMEOUT_MS = 2000;

/** Tên cột DB-ngoài (whitelist, en không dấu): `status`, `created`, `tokens`… */
export const ColumnName = z
  .string()
  .max(32)
  .regex(/^[a-z][a-z0-9_]{0,31}$/)
  .meta({ example: 'status' });
/** Chữ cột kiểu Excel (A–ZZ); cột 0 đóng băng (checkbox + ID) không có chữ. */
export const ColumnLetter = z
  .string()
  .max(3)
  .regex(/^[A-Z]{1,3}$/)
  .meta({ example: 'A' });
export const QUERY_OPS = [':', '=', '!=', '>', '>=', '<', '<='] as const;
export const COLUMN_TYPES = ['text', 'enum', 'int', 'money', 'ts', 'bool', 'json'] as const;
/** `-cột` = giảm dần; tối đa 3 khoá, khoá hoà luôn là `display_seq` (keyset, không OFFSET). */
export const SortKey = z
  .string()
  .max(33)
  .regex(/^-?[a-z][a-z0-9_]{0,31}$/)
  .meta({ example: 'created' });
export const GRID_ROW_STATES = ['normal', 'proposed', 'superseded', 'wounded'] as const;

const EntityPrefixStr = z.string().min(2).max(3).refine(isEntityPrefix, 'prefix chưa đăng ký').meta({ example: 'RL' });

/** Phần chọn dữ liệu dùng chung của OPS-33 (hàng) và OPS-34 (xuất): cùng truy vấn, cùng whitelist. */
export const gridSelectShape = {
  /** Ô truy vấn DATABASE §8.1 (mệnh đề nối bằng AND). Sai ngữ pháp / cột ngoài whitelist ⇒ `400 query.invalid` (`detail.reason`, `detail.position`). */
  q: str(500, 1).optional(),
  /** Khoá view dựng sẵn (`GridInfo.views[].key`); bộ lọc của view cộng với `q`. */
  view: KeyStr.optional(),
  sort: queryList(SortKey, 3, 'created').optional(),
  cols: queryList(ColumnName, 64, 'status').optional(),
} as const;

export const GridColumn = z.strictObject({
  name: ColumnName,
  letter: ColumnLetter,
  type: z.enum(COLUMN_TYPES),
  editable: z.boolean(),
  queryable: z.boolean(),
  sortable: z.boolean(),
  /** Alias tiếng Việt không dấu của tên cột (`trang-thai` = `status`) cho ô truy vấn / gợi ý. */
  aliases: list(KeyStr, 8),
  /** Giá trị enum (khoá) cho dropdown inline và gợi ý lọc; `null` nếu không phải enum. */
  values: list(KeyStr, 64).nullable(),
  /** Toán tử ô truy vấn chấp nhận cho cột này (rỗng nếu `queryable = false`). */
  ops: list(z.enum(QUERY_OPS), QUERY_OPS.length),
  /** Route ghi của lane sở hữu (`SYS-38`…); `null` = không sửa tại ô. */
  editRouteId: RouteIdRef.nullable(),
});

export const GridView = z.strictObject({
  key: KeyStr,
  q: str(500).nullable(),
  sort: list(SortKey, 3),
  cols: list(ColumnName, 64),
});

export const GridInfo = z.strictObject({
  key: GridKey,
  prefix: EntityPrefixStr,
  /** Bảng / view nguồn (đối chiếu DATABASE §6). */
  source: str(64, 1),
  exportable: z.boolean(),
  defaultSort: list(SortKey, 3),
  views: list(GridView, 16),
  /** Khoá các ô Σ ở footer (`GridRowsPage.footer`). */
  footerKeys: list(KeyStr, 32),
  /** "+ Thêm hàng" = route tạo của lane sở hữu; `null` nếu lưới không cho thêm tay. */
  createRouteId: RouteIdRef.nullable(),
  columns: list(GridColumn, 64),
});

/** Một mệnh đề đã phân tích của ô truy vấn — client vẽ chip điều kiện, không phải tự parse. */
export const QueryClause = z.strictObject({
  negated: z.boolean(),
  /** `id` = từ trần dạng `MM-0041`; `word` / `phrase` = text tự do (FTS §8.5). */
  kind: z.enum(['field', 'phrase', 'word', 'id']),
  /** Tên cột chuẩn (en) sau khi đổi alias; `null` với word / phrase / id. */
  field: ColumnName.nullable(),
  op: z.enum(QUERY_OPS).nullable(),
  values: list(str(200), 32),
  /** Vị trí ký tự (từ 0) trong `q` để chip trỏ về đúng chỗ. */
  position: Nat,
});

export const GridRow = z.strictObject({
  id: Ulid,
  /** Cột 0 (ID mono). */
  displayId: str(20, 6),
  /** `proposed` = nền accent + Áp dụng / Bỏ; `superseded` = mờ + "→ `supersededBy`"; `wounded` = dải trái xám. */
  state: z.enum(GRID_ROW_STATES),
  supersededBy: str(20, 6).nullable(),
  /** Giá trị ô theo tên cột (chỉ cột whitelist, đã che theo quyền `confidential`). */
  cells: z.record(ColumnName, Json).refine((o) => Object.keys(o).length <= 64, 'quá nhiều cột'),
});

export const GridRowsPage = PageOf(GridRow).extend({
  /** Tổng số hàng khớp truy vấn; `null` khi đếm quá đắt (client hiện "≥ N"). */
  total: Nat.nullable(),
  /** Ô Σ: khoá theo `GridInfo.footerKeys`. */
  footer: z.record(KeyStr, z.number()).refine((o) => Object.keys(o).length <= 32, 'quá nhiều ô footer'),
  /** Mệnh đề đã phân tích của `q` (kèm `view`); `[]` nếu không có `q`. */
  clauses: list(QueryClause, 64),
  /** "MM-0046 (mã cũ) → MM-0107" (DATABASE §8.1, `id_aliases`). */
  aliasHints: list(z.strictObject({ from: str(20, 6), to: str(20, 6) }), 50),
  /** Có `group`: số hàng mỗi nhóm trên TOÀN tập khớp (hàng vẫn phân trang keyset, sort theo cột nhóm trước). */
  groups: list(z.strictObject({ value: Json, count: Nat }), GRID_PAGE_MAX).nullable(),
});

/** Prefix của một lưới (tra ngược cho test / CLI). */
export function gridPrefix(key: GridKeyName): EntityPrefix {
  return GRID_PREFIX[key];
}
