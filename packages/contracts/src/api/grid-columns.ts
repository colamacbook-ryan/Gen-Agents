import { COLUMN_TYPES, GRID_PREFIX, type GridKeyName } from './grids.ts';

// Whitelist cột của TỪNG lưới (review bảo mật PR #7, M8; DATABASE §8.2). Đây là hàng rào ở BIÊN HỢP ĐỒNG: `cols`, `sort`, `group` và
// tên trường trong `q` của OPS-33 / OPS-34 / OPS-35 phải nằm trong danh sách này, nếu không `400 query.invalid` — kể cả khi bộ biên dịch
// của L-DB (nguồn thật của SQL) có lỗi. Chủ ý KHÔNG có cột: hash, secret, cipher, token, password, khoá bọc (DEK), nonce, salt,
// `secret_id`, `token_last4`, `account_hint`, đường dẫn tệp, JSON thô của phiên / kết quả. Test quét tên cột theo mẫu nhạy cảm.
// Tên cột = tên ngoài (en không dấu, <= 32 ký tự); 15 lưới đầu lấy NGUYÊN từ `GRIDS` của L-DB (`packages/db/src/query-box/grids.ts`,
// kèm alias vi không dấu), 22 lưới sau do hợp đồng khai theo cột bảng DB — L-DB chưa có định nghĩa biên dịch cho chúng.

export type GridColumnType = (typeof COLUMN_TYPES)[number];

export interface ColumnDef {
  /** Tên chuẩn (en). */
  readonly name: string;
  /** Alias tiếng Việt không dấu cho ô truy vấn (`trang-thai` = `status`). */
  readonly aliases: readonly string[];
  readonly type: GridColumnType;
  /** Dùng được trong `q` (lọc) và `group`. Cột chỉ hiển thị (nội dung dài, JSON) = `false`. */
  readonly queryable: boolean;
  /** Dùng được trong `sort` (cột NOT NULL — keyset an toàn). */
  readonly sortable: boolean;
}

/**
 * Cú pháp rút gọn: `tên|alias|alias:kiểu` + hậu tố `*` (sort được) và `~` (chỉ hiển thị, không tra cứu).
 * Ví dụ `'created|tao:ts*'`, `'content:text~'`.
 */
function parse(spec: string): ColumnDef {
  const m = /^([a-z][a-z0-9_]{0,31})((?:\|[a-z][a-z0-9-]{0,31}){0,4}):([a-z]{2,5})([*~]{0,2})$/.exec(spec);
  if (!m) throw new Error(`GRID_COLUMNS: cột sai cú pháp: ${spec}`);
  const type = m[3] as GridColumnType;
  if (!(COLUMN_TYPES as readonly string[]).includes(type)) throw new Error(`GRID_COLUMNS: kiểu lạ ở ${spec}`);
  const flags = m[4] ?? '';
  return {
    name: m[1] as string,
    aliases: (m[2] ?? '').split('|').filter(Boolean),
    type,
    queryable: !flags.includes('~'),
    sortable: flags.includes('*'),
  };
}

const SPECS: Record<GridKeyName, readonly string[]> = {
  roles: [
    'id:int*',
    'created|tao:ts*',
    'updated|sua:ts',
    'name|ten:text',
    'status|trang-thai:enum',
    'run|chay:enum',
    'condition|the-trang:enum',
    'color|mau:enum',
  ],
  dna: [
    'id:int*',
    'created|tao:ts*',
    'updated|sua:ts',
    'role|vai:text',
    'source|nguon:enum',
    'status|trang-thai:enum',
    'prompt:bool',
    'tokens:int',
    'key|khoa:text',
    'group|nhom:enum',
    'tier|tang:enum',
    'confirmed|xac-nhan:bool',
    'value:json~',
  ],
  instructions: [
    'id:int*',
    'created|tao:ts*',
    'updated|sua:ts',
    'role|vai:text',
    'layer|lop:enum',
    'cond|dieu-kien:enum',
    'engine:text',
    'on|bat:bool',
    'tokens:int',
    'source|nguon:enum',
    'status|trang-thai:enum',
    'name:text~',
    'content:text~',
    'ordinal:int~',
  ],
  skills: [
    'id:int*',
    'created|tao:ts*',
    'updated|sua:ts',
    'role|vai:text',
    'engine:text',
    'on|bat:bool',
    'tokens:int',
    'uses:int',
    'version:int',
    'slug:text',
    'status|trang-thai:enum',
    'origin|nguon:enum',
    'cat|chung-loai:text',
    'tier|bac:text',
    'description:text~',
    'content:text~',
  ],
  knowledge: [
    'id:int*',
    'created|tao:ts*',
    'updated|sua:ts',
    'role|vai:text',
    'type|loai:text',
    'scope|pham-vi:enum',
    'indexed:bool',
    'recall:int',
    'dup|trung:bool',
    'status|trang-thai:enum',
  ],
  memories: [
    'id:int*',
    'created|tao:ts*',
    'updated|sua:ts',
    'role|vai:text',
    'scope|pham-vi:enum',
    'kind|loai:enum',
    'status|trang-thai:enum',
    'conf|tin-cay:real',
    'source|nguon:enum',
    'ref:text',
    'sens|nhay-cam:enum',
    'content:text~',
  ],
  tasks: [
    'id:int*',
    'created|tao:ts*',
    'updated|sua:ts',
    'role|vai:text',
    'status|trang-thai:enum',
    'due|han:ts',
    'source|kenh:enum',
    'priority|uu-tien:enum',
    'verified|danh-gia:enum',
  ],
  commitments: [
    'id:int*',
    'created|tao:ts*',
    'updated|sua:ts',
    'role|vai:text',
    'status|trang-thai:enum',
    'due|han:ts*',
    'source|kenh:enum',
  ],
  ledger: [
    'id:int*',
    'created|tao:ts*',
    'role|vai:text',
    'type|loai:enum',
    'amount|so-tien:money*',
    'task|viec:text',
    'class|hang:enum',
  ],
  audit: [
    'id:int*',
    'created|tao:ts*',
    'role|vai:text',
    'actor:text',
    'action|hanh-dong:text',
    'result|ket-qua:enum',
    'tool:text',
    'channel|kenh:enum',
  ],
  events: ['id:int*', 'created|tao:ts*', 'role|vai:text', 'kind|loai:text', 'severity|muc:enum'],
  capabilities: [
    'id:int*',
    'created|tao:ts*',
    'updated|sua:ts',
    'account|tai-khoan:text',
    'kind|loai:enum',
    'state|trang-thai:enum',
    'confidence|tin-cay:enum',
  ],
  taxonomy: [
    'id:int*',
    'created|tao:ts*',
    'updated|sua:ts',
    'name|ten:text',
    'domain|mien:enum',
    'level|tang:enum',
    'parent:text',
    'status|trang-thai:enum',
    'source|nguon:enum',
  ],
  polaris_checks: ['id:int*', 'created|tao:ts*', 'role|vai:text', 'kind|loai:enum', 'rule|luat:text', 'gain:money'],
  wounds: ['id:int*', 'created|tao:ts*', 'role|vai:text', 'open|dang-mo:bool'],
  engine_accounts: [
    'id:int*',
    'created:ts*',
    'updated:ts',
    'engine:text',
    'label:text',
    'auth:enum',
    'login:enum',
    'quota:enum',
    'quota_pct:real',
    'quota_reset:ts',
    'outage:ts',
    'cli:text',
    'cli_pinned:text',
    'overhead:int',
    'status:enum',
  ],
  engine_bindings: [
    'id:int*',
    'created:ts*',
    'updated:ts',
    'consumer:enum',
    'role:text',
    'account:text',
    'priority:int',
    'model:text',
    'effort:enum',
    'on:bool',
    'selection:enum',
  ],
  containers: [
    'id:int*',
    'created:ts*',
    'updated:ts',
    'kind:enum',
    'role:text',
    'name:text',
    'image:text',
    'desired:enum',
    'observed:enum',
    'health:enum',
    'health_checked:ts',
    'cpu:real',
    'mem_mb:int',
    'started:ts',
    'stopped:ts',
    'cold_start_ms:int',
  ],
  model_ranks: [
    'id:int*',
    'created:ts*',
    'updated:ts',
    'engine:text',
    'model:text',
    'rank:int',
    'source:enum',
    'ranked:ts',
  ],
  system_agents: [
    'id:int*',
    'created:ts*',
    'updated:ts',
    'key:text',
    'model:text',
    'effort:enum',
    'on:bool',
    'selection:enum',
  ],
  telegram_bots: [
    'id:int*',
    'created:ts*',
    'updated:ts',
    'role:text',
    'username:text',
    'status:enum',
    'getme_ok:ts',
    'last_update:ts',
    'error:text~',
  ],
  telegram_allowlist: [
    'id:int*',
    'created:ts*',
    'updated:ts',
    'bot:text',
    'tg_user:int',
    'name:text',
    'owner:bool',
    'via:enum',
    'status:enum',
  ],
  proactive_policies: [
    'id:int*',
    'created:ts*',
    'updated:ts',
    'role:text',
    'on:bool',
    'max_per_day:int',
    'quiet_start:int',
    'quiet_end:int',
    'weekend_differs:bool',
    'timezone:text',
    'channel:enum',
    'break_quiet:enum',
  ],
  proactive_jobs: [
    'id:int*',
    'created:ts*',
    'updated:ts',
    'position:text',
    'name:text',
    'cron:text',
    'timezone:text',
    'action:enum',
    'trigger:enum',
    'on:bool',
    'misfire:enum',
    'next_run:ts',
    'last_run:ts',
    'last_status:enum',
  ],
  proactive_sends: [
    'id:int*',
    'created:ts*',
    'role:text',
    'policy:text',
    'trigger:enum',
    'urgency:enum',
    'day:text',
    'channel:enum',
    'status:enum',
    'sent:ts',
    'reason:text~',
  ],
  update_runs: [
    'id:int*',
    'created:ts*',
    'updated:ts',
    'from:text',
    'to:text',
    'trigger:enum',
    'status:enum',
    'started:ts',
    'finished:ts',
    'duration_ms:int',
    'schema_from:int',
    'schema_to:int',
    'error:text~',
  ],
  app_versions: [
    'id:int*',
    'created:ts*',
    'updated:ts',
    'semver:text',
    'channel:enum',
    'released:ts',
    'schema:int',
    'source:enum',
    'status:enum',
    'discovered:ts',
  ],
  change_sets: [
    'id:int*',
    'created:ts*',
    'updated:ts',
    'scope:enum',
    'role:text',
    'title:text',
    'status:enum',
    'proposed_by:enum',
    'decided:ts',
  ],
  employee_cards: [
    'id:int*',
    'created:ts*',
    'updated:ts',
    'role:text',
    'status:enum',
    'issued:ts',
    'suspended:ts',
    'revoked:ts',
    'tokens:int',
  ],
  trial_runs: [
    'id:int*',
    'created:ts*',
    'role:text',
    'status:enum',
    'scenarios:int',
    'passed:int',
    'score:real',
    'threshold:real',
    'judge:enum',
    'decided:ts',
  ],
  notifications: [
    'id:int*',
    'created:ts*',
    'updated:ts',
    'kind:enum',
    'severity:enum',
    'title:text',
    'target:text',
    'read:ts',
    'dismissed:ts',
    'resolved:ts',
  ],
  characters: [
    'id:int*',
    'created:ts*',
    'updated:ts',
    'pack:text',
    'code:text',
    'kind:enum',
    'name:text~',
    'faction:enum',
    'status:enum',
    'enabled:bool',
    'char_kind:enum',
    'gender:enum',
  ],
  avatars: [
    'id:int*',
    'created:ts*',
    'role:text',
    'source:enum',
    'mime:text',
    'size:int',
    'width:int',
    'height:int',
    'skin_pack:text',
  ],
  sessions: [
    'id:int*',
    'created:ts*',
    'agent:enum',
    'role:text',
    'position:text',
    'task:text',
    'trigger:enum',
    'engine:text',
    'model:text',
    'effort:enum',
    'status:enum',
    'phase:enum',
    'error:text',
    'started:ts',
    'ended:ts',
    'duration_ms:int',
    'cold_start_ms:int',
    'tokens_in:int',
    'tokens_out:int',
    'cost_micro:int',
    'failover:int',
  ],
  permission_requests: [
    'id:int*',
    'created:ts*',
    'updated:ts',
    'role:text',
    'tool:text',
    'scope:text',
    'reason:text~',
    'task:text',
    'session:text',
    'status:enum',
    'decided:ts',
    'note:text~',
  ],
  tool_grants: [
    'id:int*',
    'created:ts*',
    'updated:ts',
    'tool:text',
    'role:text',
    'position:text',
    'mode:enum',
    'expires:ts',
    'note:text~',
  ],
  tools: [
    'id:int*',
    'created:ts*',
    'updated:ts',
    'slug:text',
    'name:text',
    'kind:enum',
    'risk:enum',
    'default_mode:enum',
    'builtin:bool',
    'status:enum',
    'tokens:int',
  ],
};

export const GRID_COLUMNS: Record<GridKeyName, readonly ColumnDef[]> = Object.fromEntries(
  Object.entries(SPECS).map(([grid, specs]) => {
    const cols = specs.map(parse);
    const names = new Set<string>();
    for (const c of cols)
      for (const n of [c.name, ...c.aliases]) {
        if (names.has(n)) throw new Error(`GRID_COLUMNS.${grid}: trùng tên / alias ${n}`);
        names.add(n);
      }
    return [grid, cols];
  }),
) as unknown as Record<GridKeyName, readonly ColumnDef[]>;

/** Tên + alias → cột (tra ô truy vấn). */
export function findGridColumn(grid: GridKeyName, nameOrAlias: string): ColumnDef | undefined {
  return GRID_COLUMNS[grid].find((c) => c.name === nameOrAlias || c.aliases.includes(nameOrAlias));
}

// ---------------------------------------------------------------- kiểm bộ chọn của OPS-33 / 34 / 35

/**
 * Tên trường trong ô truy vấn: token (ngoài ngoặc kép) có dạng `[-]tên` + toán tử (`:` `=` `!=` `>` `>=` `<` `<=`). Từ trần,
 * cụm trong ngoặc kép, mã `MM-0041` không phải trường. Đây là bộ quét THÔ để chặn tên cột lạ ở biên — ngữ pháp đầy đủ do
 * bộ phân tích của L-DB quyết.
 */
export function queryFieldNames(q: string): string[] {
  const out: string[] = [];
  let inQuote = false;
  let token = '';
  const flush = () => {
    const m = /^-?([A-Za-z][A-Za-z0-9_-]*)(?::|!=|>=|<=|=|>|<)/.exec(token);
    if (m) out.push((m[1] as string).toLowerCase());
    token = '';
  };
  for (const ch of q) {
    if (ch === '"') {
      inQuote = !inQuote;
      if (!inQuote) token = '';
      continue;
    }
    if (inQuote) continue;
    if (/\s/.test(ch)) flush();
    else token += ch;
  }
  flush();
  return out;
}

/** Lưới của một prefix hàng (`undefined` nếu prefix không có lưới). */
export function gridOfPrefix(prefix: string): GridKeyName | undefined {
  return (Object.keys(GRID_PREFIX) as GridKeyName[]).find((k) => GRID_PREFIX[k] === prefix);
}

export interface GridSelection {
  readonly q?: string | undefined;
  readonly sort?: readonly string[] | undefined;
  readonly cols?: readonly string[] | undefined;
  readonly group?: string | undefined;
}

/** Vi phạm whitelist của một bộ chọn trên một lưới (rỗng = hợp lệ). Mọi tên LẠ ⇒ vi phạm (fail-closed). */
export function gridSelectionIssues(grid: GridKeyName, sel: GridSelection): string[] {
  const issues: string[] = [];
  const cols = GRID_COLUMNS[grid];
  for (const c of sel.cols ?? [])
    if (!cols.some((x) => x.name === c)) issues.push(`cols: cột ${c} không thuộc lưới ${grid}`);
  for (const s of sel.sort ?? []) {
    const name = s.startsWith('-') ? s.slice(1) : s;
    if (!cols.some((x) => x.name === name && x.sortable))
      issues.push(`sort: ${name} không sắp xếp được ở lưới ${grid}`);
  }
  if (sel.group !== undefined && !cols.some((x) => x.name === sel.group && x.queryable))
    issues.push(`group: ${sel.group} không nhóm được ở lưới ${grid}`);
  if (sel.q !== undefined)
    for (const f of queryFieldNames(sel.q)) {
      const c = findGridColumn(grid, f);
      if (!c || !c.queryable) issues.push(`q: trường ${f} không tra cứu được ở lưới ${grid}`);
    }
  return issues;
}
