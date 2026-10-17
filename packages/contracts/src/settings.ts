import { z } from 'zod';
import { ULID_RE } from './ids.ts';

// Registry khoá `settings` (DATABASE §5.20, §11.2): Zod schema + mặc định + ai được sửa.
// DB chỉ lưu giá trị GHI ĐÈ; không có hàng = dùng mặc định ở đây — trừ khoá `preseeded` (ghi sẵn lúc tạo workspace để
// trigger DB fail-closed khi thiếu). Trigger DB là chốt cuối; schema ở đây chỉ để báo lỗi sớm, đúng chữ.
// v0: các khoá DATABASE v2.3.0 đã định nghĩa mặc định + `backup.remote_anchor` (v2.3.2–v2.3.3, CNS-176). Thêm khoá = PR "contract".

/**
 * Ai được ghi (= trigger DB): owner còn là thành viên, admin, actor `system` của chính workspace (lúc dựng / khôi phục).
 * Actor ghi lấy từ giao dịch (app_actor()), không từ tham số (CNS-176).
 */
export const SETTING_WRITERS = ['owner', 'admin', 'system'] as const;
export type SettingWriter = (typeof SETTING_WRITERS)[number];
/** Đa số khoá: owner / admin (UI), actor system khi dựng workspace. */
const OWNER_ADMIN = ['owner', 'admin', 'system'] as const satisfies readonly SettingWriter[];
/** Khoá định tuyến credential: CHỈ owner (admin cũng không) hoặc actor system (DB v2.3.2 settings_remote_anchor_*). */
const OWNER_OR_SYSTEM = ['owner', 'system'] as const satisfies readonly SettingWriter[];

export interface SettingDef<S extends z.ZodType = z.ZodType> {
  key: string;
  schema: S;
  /**
   * Mặc định khi không có hàng. `seed` = không có hằng trong code: giá trị do bước dựng workspace ghi sẵn (nguồn: registry
   * engines). `absent` = không có mặc định — thiếu hàng nghĩa là tính năng TẮT (vd chưa cấu hình neo ngoài máy).
   */
  default: z.infer<S> | 'seed' | 'absent';
  /** Ghi sẵn lúc tạo workspace (DATABASE §11.2). */
  preseeded: boolean;
  writers: readonly SettingWriter[];
  /** Mã ST- trong design (chỉ để đối chiếu màn A6; số thật cấp theo workspace). */
  designDisplayId?: string;
}

const int = (min: number, max: number) => z.number().int().min(min).max(max);

/**
 * `backup.remote_anchor.url` (DB v2.3.3): chỉ `https://`, authority = tới `/` đầu tiên hoặc hết chuỗi, không `@ \ %` /
 * khoảng trắng / tab / CR / LF. Lúc push, job kiểm lại `new URL(url).host === secrets.allowed_host` (chống lệch parser).
 */
export const REMOTE_ANCHOR_URL_RE = /^https:\/\/[^\s@\\%/]+(?:\/[^\s@\\%]*)?$/;

/** Authority của URL neo theo đúng cách DB tách (tới `/` đầu tiên hoặc hết chuỗi). */
export function remoteAnchorAuthority(url: string): string | null {
  if (!REMOTE_ANCHOR_URL_RE.test(url)) return null;
  const rest = url.slice('https://'.length);
  const slash = rest.indexOf('/');
  return slash === -1 ? rest : rest.slice(0, slash);
}
const bp = int(1, 10_000);

function def<S extends z.ZodType>(d: SettingDef<S>): SettingDef<S> {
  return d;
}

export const SETTINGS = {
  'economy.initial_grant_minor': def({
    key: 'economy.initial_grant_minor',
    schema: int(1, Number.MAX_SAFE_INTEGER),
    default: 100_000,
    preseeded: true,
    writers: OWNER_ADMIN,
  }),
  'economy.token_cost_to_wallet': def({
    key: 'economy.token_cost_to_wallet',
    schema: z.boolean(),
    default: false,
    preseeded: false,
    writers: OWNER_ADMIN,
  }),
  'economy.penalty.self_reported_max_bp': def({
    key: 'economy.penalty.self_reported_max_bp',
    schema: bp,
    default: 1000,
    preseeded: true,
    writers: OWNER_ADMIN,
  }),
  'economy.penalty.concealment_min_bp': def({
    key: 'economy.penalty.concealment_min_bp',
    schema: bp,
    default: 5000,
    preseeded: true,
    writers: OWNER_ADMIN,
  }),
  'economy.penalty.harness_bp': def({
    key: 'economy.penalty.harness_bp',
    schema: z.literal(10_000),
    default: 10_000,
    preseeded: true,
    writers: OWNER_ADMIN,
  }),
  'economy.penalty.dissatisfaction_presets_bp': def({
    key: 'economy.penalty.dissatisfaction_presets_bp',
    schema: z.array(bp).min(1).max(16),
    default: [500, 1000, 2000, 3000],
    preseeded: true,
    writers: OWNER_ADMIN,
  }),
  'economy.penalty.self_confessed_harness_as_self_reported': def({
    key: 'economy.penalty.self_confessed_harness_as_self_reported',
    schema: z.boolean(),
    default: true,
    preseeded: true,
    writers: OWNER_ADMIN,
    designDisplayId: 'ST-0016',
  }),
  'economy.revive_suggest_minor': def({
    key: 'economy.revive_suggest_minor',
    schema: int(1, Number.MAX_SAFE_INTEGER),
    default: 50_000,
    preseeded: true,
    writers: OWNER_ADMIN,
  }),
  'economy.wound_commitment_horizon_hours': def({
    key: 'economy.wound_commitment_horizon_hours',
    schema: int(1, 24 * 365),
    default: 72,
    preseeded: true,
    writers: OWNER_ADMIN,
  }),
  'economy.reflection_max_runs': def({
    key: 'economy.reflection_max_runs',
    schema: int(1, 100),
    default: 3,
    preseeded: true,
    writers: OWNER_ADMIN,
  }),
  'budget.runtime_overhead_estimate_tokens': def({
    key: 'budget.runtime_overhead_estimate_tokens',
    schema: int(1, 2000),
    default: 250,
    preseeded: true,
    writers: OWNER_ADMIN,
    designDisplayId: 'ST-0015',
  }),
  'system.core_agent_engine': def({
    key: 'system.core_agent_engine',
    // slug trong danh mục `engines` (core_capable = 1, adapter_status = 'ready'); DB ép bằng settings_core_agent_*
    schema: z.string().regex(/^[a-z0-9][a-z0-9-]{1,31}$/),
    default: 'seed',
    preseeded: true,
    writers: OWNER_ADMIN,
    designDisplayId: 'ST-0017',
  }),
  'chat.attachment_max_bytes': def({
    key: 'chat.attachment_max_bytes',
    schema: int(1, 104_857_600),
    default: 26_214_400,
    preseeded: true,
    writers: OWNER_ADMIN,
    designDisplayId: 'ST-0018',
  }),
  'avatar.transient_seconds': def({
    key: 'avatar.transient_seconds',
    schema: int(1, 600),
    default: 20,
    preseeded: false,
    writers: OWNER_ADMIN,
  }),
  'avatar.idle_after_minutes': def({
    key: 'avatar.idle_after_minutes',
    schema: int(1, 1440),
    default: 10,
    preseeded: false,
    writers: OWNER_ADMIN,
  }),
  'ui.avatar_motion': def({
    key: 'ui.avatar_motion',
    schema: z.enum(['full', 'subtle', 'off']),
    default: 'full',
    preseeded: false,
    writers: OWNER_ADMIN,
  }),
  'defaults.prompt_budget_tokens': def({
    key: 'defaults.prompt_budget_tokens',
    schema: int(200, 8000),
    default: 2000,
    preseeded: false,
    writers: OWNER_ADMIN,
  }),
  'audit.retention_days': def({
    key: 'audit.retention_days',
    schema: int(1, 36_500),
    default: 730,
    preseeded: false,
    writers: OWNER_ADMIN,
  }),
  'log.retention_days': def({
    key: 'log.retention_days',
    schema: int(1, 3650),
    default: 14,
    preseeded: false,
    writers: OWNER_ADMIN,
  }),
  'backup.remote_anchor': def({
    key: 'backup.remote_anchor',
    schema: z.strictObject({
      url: z.string().max(2048).regex(REMOTE_ANCHOR_URL_RE),
      secret_id: z.string().regex(ULID_RE),
    }),
    default: 'absent',
    preseeded: false,
    writers: OWNER_OR_SYSTEM,
  }),
  'purge.grace_days': def({
    key: 'purge.grace_days',
    schema: int(1, 3650),
    default: 30,
    preseeded: false,
    writers: OWNER_ADMIN,
  }),
} as const;

export type SettingKey = keyof typeof SETTINGS;

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(SETTINGS, key);
}

/** Actor loại `who` có được ghi khoá này không (UI ẩn / chặn sớm; DB là chốt cuối). */
export function settingWritableBy(key: SettingKey, who: SettingWriter): boolean {
  return (SETTINGS[key].writers as readonly SettingWriter[]).includes(who);
}

/** Giá trị JSON đúng dạng DB đòi (DB v2.3.3: JSON chuẩn = `JSON.stringify` của giá trị đã parse, không khoá trùng). */
export function settingValueJson<K extends SettingKey>(key: K, value: unknown): string {
  return JSON.stringify(parseSettingValue(key, value));
}

/** Kiểm một giá trị trước khi ghi (DB vẫn là chốt cuối). */
export function parseSettingValue<K extends SettingKey>(
  key: K,
  value: unknown,
): z.infer<(typeof SETTINGS)[K]['schema']> {
  return SETTINGS[key].schema.parse(value) as z.infer<(typeof SETTINGS)[K]['schema']>;
}
