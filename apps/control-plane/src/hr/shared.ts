// Tiện ích dùng chung của handler L-HR: ép kiểu cột view (SqlValue), ánh xạ hàng DB → hình dạng hợp đồng, luật quyền
// theo TRẠNG THÁI ĐÃ LƯU (không theo cờ client gửi).
import { AVATAR_STATES } from '@ga/contracts';
import type { RoleRow as DbRole, ReadTx } from '@ga/db/repos';
import { DbRuleError } from '@ga/db/repos';
import type { HandlerContext } from '../context/context.ts';
import { ApiError, notFound } from '../http/errors.ts';

/** Cột view có thể là Buffer / bigint (SqlValue): ép về chuỗi. */
export function asStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (Buffer.isBuffer(v)) return v.toString('utf8');
  return String(v);
}

export function asNum(v: unknown, fallback = 0): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : Number(asStr(v));
  return Number.isFinite(n) ? n : fallback;
}

export const asBool = (v: unknown): boolean => asNum(v) === 1 || v === true;

/** Viewer chỉ đọc: nội dung nhạy cảm phải che (HANDLER-OBLIGATIONS #5). Quyết theo PHIÊN, không theo request. */
export const isViewerOnly = (ctx: HandlerContext): boolean => ctx.actor.authLevel === 'V';
export const isOwner = (ctx: HandlerContext): boolean => ctx.actor.authLevel === 'O';

export const idOf = (r: { id: string; display_id: string }) => ({ id: r.id, displayId: r.display_id });

/** Ước lượng token cục bộ (chưa có tokenizer ở repo): ⌈byte UTF-8 / 4⌉. Nhãn tokenizer ghi cùng để compiler đo lại sau. */
export const TOKENIZER_LABEL = 'estimate-bytes4';
export function estimateTokens(text: string): number {
  return Math.ceil(Buffer.byteLength(text, 'utf8') / 4);
}

const BUDGET_STATE: Record<string, 'green' | 'yellow' | 'red'> = {
  ok: 'green',
  green: 'green',
  near: 'yellow',
  yellow: 'yellow',
  over: 'red',
  red: 'red',
};
export const budgetStateOf = (v: unknown): 'green' | 'yellow' | 'red' => BUDGET_STATE[asStr(v) ?? ''] ?? 'green';

/** Cùng quy tắc màu của v_role_prompt_budget (CNS-004): xanh < 75% ≤ vàng ≤ 100% < đỏ. */
export function stateOfTotals(worst: number, budget: number): 'green' | 'yellow' | 'red' {
  if (worst > budget) return 'red';
  if (worst * 4 >= budget * 3) return 'yellow';
  return 'green';
}

const KEY_RE = /^[a-z][a-z0-9_.-]{0,63}$/;
export const keyOr = (v: unknown, fallback: string): string => {
  const s = asStr(v);
  return s !== null && KEY_RE.test(s) ? s : fallback;
};

/** Ngân sách prompt của Role (`v_role_prompt_budget`); Role chưa có binding ⇒ 0 + ngân sách của Role. */
export function budgetOf(tx: ReadTx, role: DbRole) {
  const b = tx.roles.promptBudget(role.id);
  const budget = b ? asNum(b.budget, role.prompt_budget_tokens) : role.prompt_budget_tokens;
  const worst = b ? asNum(b.total_worst) : 0;
  const pending = b ? asNum(b.pending_delta) : 0;
  const measured = b !== null && asStr(b.overhead_source) === 'measured';
  const cardOk = b !== null && asBool(b.card_ok);
  // khoá i18n suy từ trường có cấu trúc (không đọc chữ tiếng Việt của view)
  let cardBlockReason: string | null = null;
  if (!cardOk) {
    if (b === null) cardBlockReason = 'not_compiled';
    else if (!measured) cardBlockReason = 'overhead_not_measured';
    else if (b.measured_prompt_tokens === null) cardBlockReason = 'prompt_not_measured';
    else if (asNum(b.card_total_worst) > budget) cardBlockReason = 'over_budget';
    else cardBlockReason = 'not_compiled';
  }
  return {
    totalDefault: b ? asNum(b.total_default) : 0,
    worst,
    budget,
    state: b ? budgetStateOf(b.budget_state) : ('green' as const),
    promptLabel: b !== null && asStr(b.prompt_source) === 'measured' ? ('measured' as const) : ('estimated' as const),
    overheadLabel: measured ? 'overhead.measured' : 'overhead.estimated',
    signOk: b !== null && asBool(b.sign_ok),
    cardOk,
    cardBlockReason,
    breakdown: {
      dn: b ? asNum(b.dna_tokens) : 0,
      in: b ? asNum(b.instruction_tokens) : 0,
      houseRules: b ? asNum(b.house_rules_tokens) : 0,
      position: b ? asNum(b.position_tokens) : 0,
      skillIndex: b ? asNum(b.skill_index_tokens) : 0,
      frame: b ? asNum(b.frame_tokens) : 0,
      polaris: b ? asNum(b.polaris_tokens) : 0,
      runtime: b ? asNum(b.runtime_overhead_tokens) : 0,
    },
    pendingDelta: pending,
    ifApplyAll: { worst: Math.max(0, worst + pending), state: stateOfTotals(Math.max(0, worst + pending), budget) },
  };
}

const AVATAR_STATE_SET: ReadonlySet<string> = new Set(AVATAR_STATES);

/** Trạng thái avatar (`v_role_avatar_state`). Chưa có hàng ⇒ 'normal' (không bịa nguồn). */
export function avatarView(tx: ReadTx, role: DbRole) {
  const s = tx.avatar.state(role.id);
  const state = asStr(s?.state);
  const sourceId = asStr(s?.source_id);
  const sourceDisplay = asStr(s?.source_display_id);
  return {
    state: (state !== null && AVATAR_STATE_SET.has(state) ? state : 'normal') as (typeof AVATARS)[number],
    source: sourceId !== null && sourceDisplay !== null ? { id: sourceId, displayId: sourceDisplay } : null,
    since: asStr(s?.since_at) ?? role.created_at,
    expiresAt: asStr(s?.expires_at),
    characterDisabled: s !== null && asBool(s.character_disabled),
  };
}
const AVATARS = AVATAR_STATES;

/** Hàng RoleRow của hợp đồng (cột A–M của `v_roles` + avatar). Không có / đã xoá ⇒ 404. */
export function roleRowOf(tx: ReadTx, roleId: string) {
  const role = tx.roles.get(roleId);
  const v = tx.roles.view(roleId);
  if (role === null || v === null || role.deleted_at !== null) throw notFound();
  return {
    id: role.id,
    displayId: role.display_id,
    name: role.name,
    color: role.color,
    lifecycle: role.lifecycle_status,
    runtime: role.runtime_state,
    runtimeDetail: role.runtime_detail,
    engineSlug: asStr(v.engine_slug),
    modelKey: asStr(v.model_key),
    positionTitle: asStr(v.position_title),
    balanceMinor: v.balance_minor,
    tokensToday: asNum(v.tokens_today),
    skills: asNum(v.skills_count),
    memories: asNum(v.memories_count),
    // màu & tổng dùng cùng một số: bản "nặng nhất" (quy tắc CNS-004 áp lên total_worst)
    budget: { total: asNum(v.prompt_tokens_worst), state: budgetStateOf(v.budget_state) },
    lastActiveAt: role.last_active_at,
    condition: role.condition,
    rank: v.coin_rank === null ? null : asNum(v.coin_rank),
    rankTotal: v.total_roles === null ? null : asNum(v.total_roles),
    avatar: avatarView(tx, role),
  };
}

/**
 * LUẬT QUYỀN ÁP THAY ĐỔI (INTENT: Giá trị > Nội quy > Polaris). Áp một change set chạm lõi (giá trị / tính cách / DN `is_core`)
 * hoặc Nội quy (`house_rules`) CHỈ owner — bất kể ai đề xuất. `touches*` phải tính từ TRẠNG THÁI ĐÃ LƯU của hàng, không từ cờ
 * client gửi. Ném `auth.forbidden` (không lộ gì thêm).
 */
export function assertMayApply(ctx: HandlerContext, touches: { core: boolean; houseRules: boolean }): void {
  if ((touches.core || touches.houseRules) && !isOwner(ctx)) {
    throw new ApiError('auth.forbidden', { reason: touches.houseRules ? 'owner_only_house_rules' : 'owner_only_core' });
  }
}

/** Người duyệt ≠ người đề xuất (INTENT): áp một change set ĐÃ CÓ do actor khác đề xuất; tự duyệt đề xuất của chính mình ⇒ từ chối. */
export function assertApproverIsNotProposer(proposedBy: string, approverActorId: string): void {
  if (proposedBy === approverActorId) throw new ApiError('auth.forbidden', { reason: 'self_approval' });
}

/** Lý do bắt buộc khi chạm lõi (dịch vụ kiểm — `isCore` không có trong request). */
export function requireReasonForCore(core: boolean, reason: string | undefined): string | undefined {
  const r = reason?.trim();
  if (core && (r === undefined || r.length === 0)) {
    throw new ApiError('validation.failed', { field: 'reason', reason: 'required_for_core' });
  }
  return r === undefined || r.length === 0 ? undefined : r;
}

/**
 * Repo là chốt cuối của luật quyền (áp lõi / Nội quy chỉ owner, DB v2.3.5): `permission.*` từ DB ⇒ `auth.forbidden` của
 * hợp đồng (không để lọt thành `db.rule_violation`). Handler vẫn kiểm trước (assertMayApply) để từ chối sớm, trước mọi ghi.
 */
export function withPermissionMapping<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof DbRuleError && e.rule.startsWith('permission.')) {
      throw new ApiError('auth.forbidden', { reason: 'db_permission' });
    }
    throw e;
  }
}
