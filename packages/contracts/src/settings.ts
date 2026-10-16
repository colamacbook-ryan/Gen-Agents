import { z } from 'zod';

// Registry khoá `settings` (DATABASE §5.20, §11.2): Zod schema + mặc định + ai được sửa.
// DB chỉ lưu giá trị GHI ĐÈ; không có hàng = dùng mặc định ở đây — trừ khoá `preseeded` (ghi sẵn lúc tạo workspace để
// trigger DB fail-closed khi thiếu). Trigger DB là chốt cuối; schema ở đây chỉ để báo lỗi sớm, đúng chữ.
// v0: chỉ các khoá DATABASE v2.3.0 đã định nghĩa mặc định. Thêm khoá = PR "contract".

export type SettingWriter = 'owner_admin';

export interface SettingDef<S extends z.ZodType = z.ZodType> {
  key: string;
  schema: S;
  /** Mặc định khi không có hàng. `seed` = không có hằng trong code: giá trị do bước dựng workspace ghi sẵn (nguồn: registry engines). */
  default: z.infer<S> | 'seed';
  /** Ghi sẵn lúc tạo workspace (DATABASE §11.2). */
  preseeded: boolean;
  writers: SettingWriter;
  /** Mã ST- trong design (chỉ để đối chiếu màn A6; số thật cấp theo workspace). */
  designDisplayId?: string;
}

const int = (min: number, max: number) => z.number().int().min(min).max(max);
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
    writers: 'owner_admin',
  }),
  'economy.token_cost_to_wallet': def({
    key: 'economy.token_cost_to_wallet',
    schema: z.boolean(),
    default: false,
    preseeded: false,
    writers: 'owner_admin',
  }),
  'economy.penalty.self_reported_max_bp': def({
    key: 'economy.penalty.self_reported_max_bp',
    schema: bp,
    default: 1000,
    preseeded: true,
    writers: 'owner_admin',
  }),
  'economy.penalty.concealment_min_bp': def({
    key: 'economy.penalty.concealment_min_bp',
    schema: bp,
    default: 5000,
    preseeded: true,
    writers: 'owner_admin',
  }),
  'economy.penalty.harness_bp': def({
    key: 'economy.penalty.harness_bp',
    schema: z.literal(10_000),
    default: 10_000,
    preseeded: true,
    writers: 'owner_admin',
  }),
  'economy.penalty.dissatisfaction_presets_bp': def({
    key: 'economy.penalty.dissatisfaction_presets_bp',
    schema: z.array(bp).min(1),
    default: [500, 1000, 2000, 3000],
    preseeded: true,
    writers: 'owner_admin',
  }),
  'economy.penalty.self_confessed_harness_as_self_reported': def({
    key: 'economy.penalty.self_confessed_harness_as_self_reported',
    schema: z.boolean(),
    default: true,
    preseeded: true,
    writers: 'owner_admin',
    designDisplayId: 'ST-0016',
  }),
  'economy.revive_suggest_minor': def({
    key: 'economy.revive_suggest_minor',
    schema: int(1, Number.MAX_SAFE_INTEGER),
    default: 50_000,
    preseeded: true,
    writers: 'owner_admin',
  }),
  'economy.wound_commitment_horizon_hours': def({
    key: 'economy.wound_commitment_horizon_hours',
    schema: int(1, 24 * 365),
    default: 72,
    preseeded: true,
    writers: 'owner_admin',
  }),
  'economy.reflection_max_runs': def({
    key: 'economy.reflection_max_runs',
    schema: int(1, 100),
    default: 3,
    preseeded: true,
    writers: 'owner_admin',
  }),
  'budget.runtime_overhead_estimate_tokens': def({
    key: 'budget.runtime_overhead_estimate_tokens',
    schema: int(1, 2000),
    default: 250,
    preseeded: true,
    writers: 'owner_admin',
    designDisplayId: 'ST-0015',
  }),
  'system.core_agent_engine': def({
    key: 'system.core_agent_engine',
    // slug trong danh mục `engines` (core_capable = 1, adapter_status = 'ready'); DB ép bằng settings_core_agent_*
    schema: z.string().regex(/^[a-z0-9][a-z0-9-]{1,31}$/),
    default: 'seed',
    preseeded: true,
    writers: 'owner_admin',
    designDisplayId: 'ST-0017',
  }),
  'chat.attachment_max_bytes': def({
    key: 'chat.attachment_max_bytes',
    schema: int(1, 104_857_600),
    default: 26_214_400,
    preseeded: true,
    writers: 'owner_admin',
    designDisplayId: 'ST-0018',
  }),
  'avatar.transient_seconds': def({
    key: 'avatar.transient_seconds',
    schema: int(1, 600),
    default: 20,
    preseeded: false,
    writers: 'owner_admin',
  }),
  'avatar.idle_after_minutes': def({
    key: 'avatar.idle_after_minutes',
    schema: int(1, 1440),
    default: 10,
    preseeded: false,
    writers: 'owner_admin',
  }),
  'ui.avatar_motion': def({
    key: 'ui.avatar_motion',
    schema: z.enum(['full', 'subtle', 'off']),
    default: 'full',
    preseeded: false,
    writers: 'owner_admin',
  }),
  'defaults.prompt_budget_tokens': def({
    key: 'defaults.prompt_budget_tokens',
    schema: int(200, 8000),
    default: 2000,
    preseeded: false,
    writers: 'owner_admin',
  }),
  'audit.retention_days': def({
    key: 'audit.retention_days',
    schema: int(1, 36_500),
    default: 730,
    preseeded: false,
    writers: 'owner_admin',
  }),
  'log.retention_days': def({
    key: 'log.retention_days',
    schema: int(1, 3650),
    default: 14,
    preseeded: false,
    writers: 'owner_admin',
  }),
  'purge.grace_days': def({
    key: 'purge.grace_days',
    schema: int(1, 3650),
    default: 30,
    preseeded: false,
    writers: 'owner_admin',
  }),
} as const;

export type SettingKey = keyof typeof SETTINGS;

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(SETTINGS, key);
}

/** Kiểm một giá trị trước khi ghi (DB vẫn là chốt cuối). */
export function parseSettingValue<K extends SettingKey>(
  key: K,
  value: unknown,
): z.infer<(typeof SETTINGS)[K]['schema']> {
  return SETTINGS[key].schema.parse(value) as z.infer<(typeof SETTINGS)[K]['schema']>;
}
