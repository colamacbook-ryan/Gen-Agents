import { z } from 'zod';
import { AVATAR_STATES } from '../events.ts';
import { FIXED_CODES } from '../ids.ts';
import {
  AnyId,
  ConfirmName,
  IdempotencyHeaders,
  IdOf,
  Int,
  idShape,
  Job,
  Json,
  KeyStr,
  list,
  Minor,
  Nat,
  PageOf,
  PosMinor,
  pageQueryShape,
  queryBool,
  Ref,
  str,
  Ts,
} from './common.ts';
import { accepted, defineLane, noContent, ok } from './define.ts';
import {
  ACCOUNT_LOGIN_STATUSES,
  Budget,
  EngineSlug,
  I18nParams,
  KNOWLEDGE_PROCESSING_STATES,
  ROLE_RUNTIMES,
  TAXONOMY_KINDS,
  TAXONOMY_LEVELS,
  TAXONOMY_STATUSES,
  TRIAL_STATES,
} from './shapes.ts';

// L-HR — nhân sự: Role, DNA, revision, Position, đào tạo (Instruction / Skill / Knowledge), cây, Kho nhân vật + avatar, thẻ,
// thử việc (BACKEND-TRIAL §3.3, SYS-30…79: 50 route). Tách khỏi L-SYS theo quyết định của Gen; thử việc gọi Judge qua dịch vụ
// AI Hệ thống của L-SYS. Chữ giao diện lấy từ i18n — response trả khoá + tham số (CNS-179).

const hr = defineLane('L-HR');

/** = CHECK `roles.color` (DATABASE schema v2.3.x). */
export const ROLE_COLORS = [
  'saffron',
  'coral',
  'rose',
  'orchid',
  'iris',
  'azure',
  'teal',
  'jade',
  'moss',
  'olive',
  'clay',
  'slate',
] as const;
/** = CHECK `roles.lifecycle_status`. */
export const ROLE_LIFECYCLES = ['draft', 'born', 'training', 'candidate', 'carded', 'suspended', 'archived'] as const;
export const INSTRUCTION_LAYERS = ['values', 'persona', 'style', 'drive', 'position', 'house_rules'] as const;
export const CARD_STATUSES = ['draft', 'issued', 'suspended', 'revoked', 'superseded'] as const;
export const AVATAR_SOURCES = ['library', 'upload', 'monogram', 'generated'] as const;
const BudgetState = z.enum(['green', 'yellow', 'red']);
const CardCheckCode = z.enum(FIXED_CODES.cardChecks);
/** `dna_fields.source` (đặc tả ghi `inferred`; DB là `ai_inferred` ⇒ theo DB). */
export const DNA_SOURCES = ['owner', 'ai_inferred', 'system'] as const;
/** `instructions.condition_kind`. */
export const INSTRUCTION_CONDITION_KINDS = ['always', 'channel', 'task_tag', 'state', 'trigger'] as const;
const PROMPT_TEXT_MAX = 65_536;
/** Ghi chú lý do: bắt buộc khi sửa mục lõi (dịch vụ kiểm — `isCore` không có trong request). */
const Reason500 = str(500, 1);

const RoleColor = z.enum(ROLE_COLORS);
const ConditionKind = z.strictObject({ kind: z.enum(INSTRUCTION_CONDITION_KINDS), value: str(200) });

// ---------------------------------------------------------------- Role (A3, A1)
const AvatarStateView = z.strictObject({
  state: z.enum(AVATAR_STATES),
  source: AnyId.nullable(),
  since: Ts,
  expiresAt: Ts.nullable(),
  characterDisabled: z.boolean(),
});

/** Cột A–M của `v_roles` + `avatar`. */
export const RoleRow = z.strictObject({
  ...idShape('RL'),
  name: str(60, 1),
  color: RoleColor,
  lifecycle: z.enum(ROLE_LIFECYCLES),
  runtime: z.enum(ROLE_RUNTIMES),
  // Chuỗi từ view (đối chiếu DB); chữ hiển thị chọn theo `runtime`.
  runtimeDetail: str(200).nullable(),
  engineSlug: EngineSlug.nullable(),
  modelKey: str(106, 1).nullable(),
  positionTitle: str(120).nullable(),
  balanceMinor: Minor.nullable(),
  tokensToday: Nat,
  skills: Nat,
  memories: Nat,
  budget: z.strictObject({ total: Nat, state: BudgetState }),
  lastActiveAt: Ts.nullable(),
  condition: z.enum(['normal', 'wounded']),
  rank: Nat.nullable(),
  rankTotal: Nat.nullable(),
  avatar: AvatarStateView,
});

/** Chọn ảnh đại diện (SYS-31 `avatar`, SYS-68). `generated` = "sinh tự động" (PS §4.7) — cách sinh chưa chốt. */
export const AvatarChoice = z.discriminatedUnion('source', [
  z.strictObject({ source: z.literal('library'), skinAssetRef: Ref('SN') }),
  z.strictObject({
    source: z.literal('upload'),
    attachmentRef: Ref('AT'),
    // Chuẩn hoá 0–1 theo ảnh; `zoom` = CHECK `avatars.crop_zoom` (1.0–3.0).
    crop: z
      .strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), zoom: z.number().min(1).max(3) })
      .optional(),
  }),
  z.strictObject({ source: z.literal('monogram') }),
  z.strictObject({ source: z.literal('generated') }),
]);

export const SYS_30 = hr({
  id: 'SYS-30',
  method: 'GET',
  path: '/roles',
  auth: 'V',
  o4: 'blocked',
  request: {
    query: z.strictObject({
      // Ngữ pháp ô truy vấn DATABASE §8.1 (bộ biên dịch tham số hoá của L-DB).
      q: str(500, 1).optional(),
      // Khớp đúng tên (đổi tên Role ra ref).
      name: str(60, 1).optional(),
      ...pageQueryShape(),
    }),
  },
  response: ok(PageOf(RoleRow)),
  cli: ['roles', 'đổi tên Role ra ref'],
});

export const SYS_31 = hr({
  id: 'SYS-31',
  method: 'POST',
  path: '/roles',
  auth: 'A',
  o4: 'blocked',
  request: {
    body: z.strictObject({
      name: str(60, 1),
      gender: z.enum(['male', 'female', 'other']),
      description: str(2000),
      color: RoleColor.optional(),
      avatar: AvatarChoice.optional(),
    }),
  },
  // RL trước, AV sau, một transaction.
  response: ok(
    z.strictObject({
      role: z.strictObject({ ...idShape('RL'), lifecycle: z.literal('draft') }),
      interviewThread: IdOf('TH'),
      avatar: IdOf('AV').nullable(),
    }),
  ),
  errors: ['gate.core_agent_not_ready', 'db.character_library'],
  cli: ['birth'],
});

export const SYS_32 = hr({
  id: 'SYS-32',
  method: 'GET',
  path: '/roles/{roleRef}',
  auth: 'V',
  o4: 'blocked',
  request: { params: z.strictObject({ roleRef: Ref('RL') }) },
  response: ok(
    RoleRow.extend({
      registryNo: str(32, 1).nullable(),
      position: z.strictObject({ ...idShape('PS'), title: str(120) }),
      bindings: list(
        z.strictObject({
          ...idShape('EB'),
          engineSlug: EngineSlug,
          priority: Nat,
          loginStatus: z.enum(ACCOUNT_LOGIN_STATUSES),
        }),
        16,
      ),
      card: z.strictObject({ ...idShape('CD'), status: z.enum(CARD_STATUSES), coreDrift: z.boolean() }).nullable(),
      wallet: z.strictObject({ balanceMinor: Minor, rank: Nat.nullable(), rankTotal: Nat }).nullable(),
      wound: IdOf('RW').nullable(),
      budget: Budget,
      interview: IdOf('TH').nullable(),
    }),
  ),
  cli: ['role <role>'],
});

export const SYS_33 = hr({
  id: 'SYS-33',
  method: 'PATCH',
  path: '/roles/{roleRef}',
  auth: 'A',
  o4: 'blocked',
  request: {
    params: z.strictObject({ roleRef: Ref('RL') }),
    // `name` chỉ sửa khi Role còn `draft` (DB `db.immutable_identity`).
    body: z.strictObject({ name: str(60, 1).optional(), color: RoleColor.optional() }),
  },
  response: ok(RoleRow),
  errors: ['db.immutable_identity'],
  cli: ['role edit'],
});

export const SYS_34 = hr({
  id: 'SYS-34',
  method: 'POST',
  path: '/roles/{roleRef}/clone',
  auth: 'A',
  o4: 'blocked',
  request: { params: z.strictObject({ roleRef: Ref('RL') }), body: z.strictObject({ name: str(60, 1) }) },
  response: ok(z.strictObject({ role: IdOf('RL') })),
  errors: ['gate.core_agent_not_ready'],
  cli: ['role clone'],
});

export const SYS_35 = hr({
  id: 'SYS-35',
  method: 'POST',
  path: '/roles/{roleRef}/archive',
  auth: 'A',
  o4: 'blocked',
  request: { params: z.strictObject({ roleRef: Ref('RL') }) },
  // `conflict` khi còn thẻ hiệu lực.
  response: ok(RoleRow),
  cli: ['role archive'],
});

export const SYS_36 = hr({
  id: 'SYS-36',
  method: 'DELETE',
  path: '/roles/{roleRef}',
  auth: 'O',
  o4: 'blocked',
  request: { params: z.strictObject({ roleRef: Ref('RL') }), body: z.strictObject({ confirmName: ConfirmName }) },
  // Xoá mềm; purge sau `purge.grace_days` (DATABASE §10.9).
  response: accepted(z.strictObject({ purge: Job, graceDays: Nat })),
  errors: ['confirm.mismatch'],
  cli: ['role delete'],
});

// ---------------------------------------------------------------- DNA, ký, revision (A1, A3)
const DNA_TEXT_MAX = 20_000;

export const DnaRow = z.strictObject({
  ...idShape('DN'),
  group: KeyStr,
  key: str(128, 1),
  itemIndex: Nat,
  value: Json,
  valueType: KeyStr,
  source: z.enum(DNA_SOURCES),
  confirmedAt: Ts.nullable(),
  tier: KeyStr,
  inPrompt: z.boolean(),
  coveredBy: IdOf('IN').nullable(),
  tokenCount: Nat,
  version: Nat,
  isCore: z.boolean(),
});

export const SYS_37 = hr({
  id: 'SYS-37',
  method: 'GET',
  path: '/roles/{roleRef}/dna',
  auth: 'V',
  o4: 'blocked',
  request: {
    params: z.strictObject({ roleRef: Ref('RL') }),
    query: z.strictObject({ view: z.enum(['grid', 'paper']).optional() }),
  },
  response: ok(
    z.strictObject({
      rows: list(DnaRow, 500),
      progress: z.strictObject({ groupsDone: Nat, groupsTotal: Nat, inferredPending: Nat }),
      // `view = paper`: `v_dna_sheet` (cấu trúc mục dẫn xuất từ view; L-HR chốt ở PR "contract" nếu lệch).
      paper: z
        .strictObject({
          sections: list(
            z.strictObject({
              group: KeyStr,
              items: list(z.strictObject({ key: str(128, 1), itemIndex: Nat, value: Json }), 200),
            }),
            64,
          ),
        })
        .nullable(),
      signed: z.strictObject({ registryNo: str(32, 1), signedAt: Ts }).nullable(),
    }),
  ),
  cli: ['dna', 'REPL /dna', 'REPL /paper'],
});

export const SYS_38 = hr({
  id: 'SYS-38',
  method: 'PATCH',
  path: '/roles/{roleRef}/dna/{dnaRef}',
  auth: 'A',
  o4: 'blocked',
  request: {
    params: z.strictObject({ roleRef: Ref('RL'), dnaRef: Ref('DN') }),
    // `reason` bắt buộc khi trường lõi (dịch vụ kiểm). `value` kiểm bằng JSON Schema của trường (`validation.failed`).
    body: z.strictObject({ value: Json.optional(), inPrompt: z.boolean().optional(), reason: Reason500.optional() }),
  },
  response: ok(z.strictObject({ changeSet: IdOf('CS'), revision: IdOf('RV'), field: DnaRow, budget: Budget })),
  errors: ['db.immutable_identity'],
  cli: ['dna set'],
});

export const SYS_39 = hr({
  id: 'SYS-39',
  method: 'POST',
  path: '/roles/{roleRef}/dna/confirm',
  auth: 'A',
  o4: 'blocked',
  request: {
    params: z.strictObject({ roleRef: Ref('RL') }),
    // Một trong: danh sách mã, hoặc tất cả.
    body: z.union([
      z.strictObject({ refs: z.array(Ref('DN')).min(1).max(64) }),
      z.strictObject({ all: z.literal(true) }),
    ]),
  },
  response: ok(z.strictObject({ confirmed: Nat, inferredPending: Nat })),
  cli: ['dna confirm', 'REPL /confirm'],
});

export const SYS_40 = hr({
  id: 'SYS-40',
  method: 'POST',
  path: '/roles/{roleRef}/sign',
  auth: 'A',
  o4: 'blocked',
  request: { params: z.strictObject({ roleRef: Ref('RL') }) },
  response: ok(z.strictObject({ registryNo: str(32, 1), signedAt: Ts, audit: IdOf('AU'), revision: IdOf('RV') })),
  errors: ['gate.sign_blocked'],
  errorReasons: { 'gate.sign_blocked': ['unconfirmed_inferred', 'budget_exceeded'] },
  cli: ['birth sign', 'REPL /sign'],
});

export const SYS_41 = hr({
  id: 'SYS-41',
  method: 'GET',
  path: '/roles/{roleRef}/revisions',
  auth: 'V',
  o4: 'blocked',
  request: { params: z.strictObject({ roleRef: Ref('RL') }) },
  response: ok(
    list(
      z.strictObject({
        ...idShape('RV'),
        version: str(16, 1)
          .regex(/^\d{1,6}\.\d{1,6}$/)
          .meta({ example: '1.0' }),
        isMajor: z.boolean(),
        note: str(500),
        by: IdOf('US').nullable(),
        at: Ts,
      }),
    ),
  ),
  cli: ['role history'],
});

export const SYS_42 = hr({
  id: 'SYS-42',
  method: 'GET',
  path: '/revisions/{revisionRef}/diff',
  auth: 'V',
  o4: 'blocked',
  request: {
    params: z.strictObject({ revisionRef: Ref('RV') }),
    query: z.strictObject({ against: Ref('RV'), format: z.enum(['read', 'yaml']).optional() }),
  },
  response: ok(
    z.strictObject({
      items: list(z.strictObject({ path: str(256, 1), before: Json, after: Json, isCore: z.boolean() }), 500),
    }),
  ),
  cli: ['role diff'],
});

export const SYS_43 = hr({
  id: 'SYS-43',
  method: 'POST',
  path: '/revisions/{revisionRef}/restore',
  auth: 'A',
  o4: 'blocked',
  request: { params: z.strictObject({ revisionRef: Ref('RV') }), body: z.strictObject({ reason: Reason500 }) },
  response: ok(z.strictObject({ revision: IdOf('RV'), budget: Budget })),
  errors: ['db.*'],
  cli: ['role restore'],
});

// ---------------------------------------------------------------- Position (MVP)
export const PositionRow = z.strictObject({
  ...idShape('PS'),
  title: str(120, 1),
  // JD (`positions.description`).
  jd: str(DNA_TEXT_MAX).nullable(),
  // `positions.kpis_md`.
  kpi: str(DNA_TEXT_MAX).nullable(),
  rewardCapMinor: PosMinor.nullable(),
  // CHƯA CHỐT: DATABASE §5.8 không có cột `heartbeat` ở `positions` (lịch ở `proactive_jobs` / `defaults.heartbeat_cron`).
  heartbeat: str(120).nullable(),
  dailyTokenQuota: Nat.nullable(),
  holder: IdOf('RL').nullable(),
});

export const SYS_44 = hr({
  id: 'SYS-44',
  method: 'GET',
  path: '/positions/{positionRef}',
  auth: 'V',
  o4: 'blocked',
  request: { params: z.strictObject({ positionRef: Ref('PS') }) },
  response: ok(PositionRow),
  cli: ['position'],
  cliOnly:
    'Position chưa có lưới ở Data Console (prefix PS có trong ENTITY_TYPES; chờ quyết định thêm khoá lưới `positions`); FS: cột Position GĐ2',
});

export const SYS_45 = hr({
  id: 'SYS-45',
  method: 'PATCH',
  path: '/positions/{positionRef}',
  auth: 'A',
  // Đặt / đổi / gỡ hạn mức (`dailyTokenQuota`) và trần thưởng (`rewardCapMinor`) là NỚI hàng rào ⇒ owner (Gen, fail-closed).
  // `present`: khoá có mặt (kể cả `null` = gỡ trần). Sửa `title` / `jd` / `kpi` / `heartbeat` vẫn A.
  ownerWhen: [
    { in: 'body', field: 'dailyTokenQuota', present: true },
    { in: 'body', field: 'rewardCapMinor', present: true },
  ],
  o4: 'blocked',
  request: {
    params: z.strictObject({ positionRef: Ref('PS') }),
    body: z.strictObject({
      title: str(120, 1).optional(),
      jd: str(DNA_TEXT_MAX).optional(),
      kpi: str(DNA_TEXT_MAX).optional(),
      rewardCapMinor: PosMinor.optional(),
      heartbeat: str(120).optional(),
      dailyTokenQuota: Nat.optional(),
    }),
  },
  response: ok(PositionRow),
  errors: ['db.*'],
  cli: ['position set'],
  cliOnly:
    'Position chưa có lưới ở Data Console (prefix PS có trong ENTITY_TYPES; chờ quyết định thêm khoá lưới `positions`); FS: cột Position GĐ2',
});

// ---------------------------------------------------------------- Instructions, Skills, Knowledge (A2 Bảng)
export const InstructionRow = z.strictObject({
  ...idShape('IN'),
  ordinal: Nat,
  layer: z.enum(INSTRUCTION_LAYERS),
  name: str(120, 1),
  content: str(PROMPT_TEXT_MAX),
  condition: ConditionKind.nullable(),
  engineScope: list(EngineSlug, 32).nullable(),
  enabled: z.boolean(),
  tokenCount: Nat,
  source: KeyStr,
  updatedAt: Ts.nullable(),
  isCore: z.boolean(),
  proposed: z.boolean(),
});

export const SYS_46 = hr({
  id: 'SYS-46',
  method: 'GET',
  path: '/roles/{roleRef}/instructions',
  auth: 'V',
  o4: 'blocked',
  request: {
    params: z.strictObject({ roleRef: Ref('RL') }),
    query: z.strictObject({ includeHouseRules: queryBool().optional() }),
  },
  response: ok(
    z.strictObject({
      rows: list(InstructionRow, 500),
      footer: z.strictObject({
        alwaysTokens: Nat,
        positionTokens: Nat,
        houseRulesTokens: Nat,
        conditionalWorstExtra: Nat,
        pendingDelta: Int,
      }),
    }),
  ),
  cli: ['instr'],
});

const InstructionWriteResult = z.strictObject({
  instruction: IdOf('IN'),
  changeSet: IdOf('CS'),
  revision: IdOf('RV'),
  budget: Budget,
});

export const SYS_47 = hr({
  id: 'SYS-47',
  method: 'POST',
  path: '/instructions',
  auth: 'A',
  o4: 'blocked',
  request: {
    body: z.strictObject({
      scope: z.enum(['role', 'position', 'workspace']),
      roleRef: Ref('RL').optional(),
      positionRef: Ref('PS').optional(),
      layer: z.enum(INSTRUCTION_LAYERS),
      name: str(120, 1),
      content: str(DNA_TEXT_MAX, 1),
      condition: ConditionKind.optional(),
      engineScope: list(EngineSlug, 32).optional(),
      enabled: z.boolean().optional(),
      // Bắt buộc khi lõi (dịch vụ kiểm).
      reason: Reason500.optional(),
    }),
  },
  response: ok(InstructionWriteResult),
  errors: ['db.*'],
  cli: ['instr add'],
});

export const SYS_48 = hr({
  id: 'SYS-48',
  method: 'PATCH',
  path: '/instructions/{instructionRef}',
  auth: 'A',
  o4: 'blocked',
  request: {
    params: z.strictObject({ instructionRef: Ref('IN') }),
    body: z.strictObject({
      name: str(120, 1).optional(),
      content: str(DNA_TEXT_MAX, 1).optional(),
      condition: ConditionKind.nullable().optional(),
      engineScope: list(EngineSlug, 32).nullable().optional(),
      enabled: z.boolean().optional(),
      ordinal: Nat.optional(),
      // Bắt buộc khi `isCore`.
      reason: Reason500.optional(),
    }),
  },
  response: ok(InstructionWriteResult),
  errors: ['db.*'],
  cli: ['instr edit', 'instr toggle'],
});

export const SkillRow = z.strictObject({
  ...idShape('SK'),
  slug: str(64, 2),
  description: str(2000),
  contentMd: str(200_000),
  fileCount: Nat,
  engineSupport: list(EngineSlug, 32).nullable(),
  status: z.enum(['learned', 'disabled', 'proposed']),
  indexTokens: Nat,
  loadTokens: Nat,
  uses7d: Nat,
  lastUsedAt: Ts.nullable(),
  version: Nat,
  category: IdOf('TX').nullable(),
  tierLabel: str(64),
  notLoadedOn: EngineSlug.nullable(),
});

export const SYS_49 = hr({
  id: 'SYS-49',
  method: 'GET',
  path: '/roles/{roleRef}/skills',
  auth: 'V',
  o4: 'blocked',
  request: { params: z.strictObject({ roleRef: Ref('RL') }) },
  response: ok(
    z.strictObject({
      rows: list(SkillRow, 500),
      footer: z.strictObject({ indexTokensPrimary: Nat, loadTokensTotal: Nat, pendingDelta: Int }),
    }),
  ),
  cli: ['skill <role>'],
});

const SKILL_SLUG = /^[a-z0-9-]{2,64}$/;
const SkillSlug = str(64, 2).regex(SKILL_SLUG).meta({ example: 'my-skill' });

export const SYS_50 = hr({
  id: 'SYS-50',
  method: 'POST',
  path: '/skills',
  auth: 'A',
  o4: 'blocked',
  request: {
    body: z.strictObject({
      slug: SkillSlug,
      description: str(2000, 1),
      contentMd: str(200_000, 1),
      engineSupport: list(EngineSlug, 32).optional(),
      categoryRef: Ref('TX').optional(),
      fileRefs: z.array(Ref('AT')).max(50).optional(),
    }),
  },
  // `conflict` khi trùng slug.
  response: ok(z.strictObject({ skill: IdOf('SK'), version: Nat })),
  cli: ['skill add'],
});

export const SYS_51 = hr({
  id: 'SYS-51',
  method: 'PATCH',
  path: '/skills/{skillRef}',
  auth: 'A',
  o4: 'blocked',
  request: {
    params: z.strictObject({ skillRef: Ref('SK') }),
    body: z.strictObject({
      description: str(2000, 1).optional(),
      contentMd: str(200_000, 1).optional(),
      engineSupport: list(EngineSlug, 32).optional(),
      categoryRef: Ref('TX').optional(),
    }),
  },
  // Version mới.
  response: ok(z.strictObject({ skill: IdOf('SK'), version: Nat })),
  cli: ['skill edit'],
});

export const SYS_52 = hr({
  id: 'SYS-52',
  method: 'POST',
  path: '/skills/import',
  auth: 'A',
  o4: 'blocked',
  // Gói .zip / .tar của thư mục `.claude/skills/` (CLI tự đóng gói thư mục dưới `/work`).
  request: { body: z.strictObject({ attachmentRef: Ref('AT') }) },
  response: ok(
    z.strictObject({
      created: list(IdOf('SK'), 500),
      skipped: list(z.strictObject({ name: str(128, 1), reason: KeyStr }), 500),
    }),
  ),
  errors: ['upload.type_rejected'],
  cli: ['skill import <thư mục>'],
});

export const SYS_53 = hr({
  id: 'SYS-53',
  method: 'PUT',
  path: '/roles/{roleRef}/skills/{skillRef}',
  auth: 'A',
  o4: 'blocked',
  request: {
    params: z.strictObject({ roleRef: Ref('RL'), skillRef: Ref('SK') }),
    body: z.strictObject({ status: z.enum(['learned', 'disabled']), pinVersion: Nat.min(1).optional() }),
  },
  response: ok(z.strictObject({ changeSet: IdOf('CS'), revision: IdOf('RV'), budget: Budget })),
  errors: ['db.*'],
  cli: ['skill learn', 'skill disable'],
});

export const KnowledgeRow = z.strictObject({
  ...idShape('KN'),
  fileName: str(255, 1),
  fileType: str(64, 1),
  sizeBytes: Nat,
  chunkCount: Nat,
  summary: str(4000).nullable(),
  state: z.enum(KNOWLEDGE_PROCESSING_STATES),
  progressPct: z.number().int().min(0).max(100).nullable(),
  duplicateOf: IdOf('KN').nullable(),
  similarity: z.number().min(0).max(1).nullable(),
  lastRecalledAt: Ts.nullable(),
  recallCount: Nat,
  category: IdOf('TX').nullable(),
});

export const SYS_54 = hr({
  id: 'SYS-54',
  method: 'GET',
  path: '/roles/{roleRef}/knowledge',
  auth: 'V',
  o4: 'blocked',
  request: { params: z.strictObject({ roleRef: Ref('RL') }) },
  response: ok(z.strictObject({ rows: list(KnowledgeRow, 500), footer: z.strictObject({ chunks: Nat }) })),
  cli: ['kn <role>'],
});

export const SYS_55 = hr({
  id: 'SYS-55',
  method: 'POST',
  path: '/roles/{roleRef}/knowledge',
  auth: 'A',
  o4: 'blocked',
  request: {
    params: z.strictObject({ roleRef: Ref('RL') }),
    body: z.strictObject({ attachmentRefs: z.array(Ref('AT')).min(1).max(20), categoryRef: Ref('TX').optional() }),
  },
  // Rồi SSE `knowledge.progress`.
  response: accepted(z.strictObject({ items: list(IdOf('KN'), 20) })),
  errors: ['upload.not_clean'],
  cli: ['kn add'],
});

export const SYS_56 = hr({
  id: 'SYS-56',
  method: 'POST',
  path: '/knowledge/{knowledgeRef}/duplicate',
  auth: 'A',
  o4: 'blocked',
  request: {
    params: z.strictObject({ knowledgeRef: Ref('KN') }),
    body: z.strictObject({ action: z.enum(['replace', 'keep_both', 'drop']) }),
  },
  response: ok(KnowledgeRow),
  cli: ['kn dup'],
});

export const SYS_57 = hr({
  id: 'SYS-57',
  method: 'DELETE',
  path: '/knowledge/{knowledgeRef}',
  auth: 'A',
  o4: 'blocked',
  request: { params: z.strictObject({ knowledgeRef: Ref('KN') }) },
  // Xoá mềm.
  response: noContent(),
  cli: ['kn rm'],
});

// ---------------------------------------------------------------- Taxonomy + sơ đồ cây (A2 Sơ đồ)
const TreeNodeId = z
  .string()
  .max(20)
  .regex(/^(?:SK|KN)-\d{4,12}$/)
  .meta({ example: 'SK-0001' });

export const SYS_58 = hr({
  id: 'SYS-58',
  method: 'GET',
  path: '/taxonomy',
  auth: 'V',
  o4: 'blocked',
  request: { query: z.strictObject({ kind: z.enum(TAXONOMY_KINDS) }) },
  response: ok(
    list(
      z.strictObject({
        ...idShape('TX'),
        level: z.enum(TAXONOMY_LEVELS),
        name: str(80, 1),
        parent: IdOf('TX').nullable(),
        status: z.enum(TAXONOMY_STATUSES),
      }),
    ),
  ),
  cli: ['tree', 'taxonomy'],
});

export const SYS_59 = hr({
  id: 'SYS-59',
  method: 'POST',
  path: '/taxonomy',
  auth: 'A',
  o4: 'blocked',
  request: {
    body: z.strictObject({
      kind: z.enum(TAXONOMY_KINDS),
      level: z.enum(TAXONOMY_LEVELS),
      name: str(80, 1),
      parentRef: Ref('TX').optional(),
    }),
  },
  response: ok(IdOf('TX')),
  errors: ['db.*'],
  cli: ['taxonomy add'],
});

export const SYS_60 = hr({
  id: 'SYS-60',
  method: 'GET',
  path: '/roles/{roleRef}/tree',
  auth: 'V',
  o4: 'blocked',
  request: {
    params: z.strictObject({ roleRef: Ref('RL') }),
    query: z.strictObject({ kind: z.enum(['skills', 'knowledge']) }),
  },
  // `v_tree_nodes`, `skill_prereqs`, `v_role_skill_tree`. `x`, `y` = `null` tới khi DB có cột toạ độ (T8).
  response: ok(
    z.strictObject({
      nodes: list(
        z.strictObject({
          displayId: TreeNodeId,
          label: str(200),
          tierLabel: str(64),
          tierIndex: Nat,
          state: z.enum(['learned', 'unlockable', 'locked', 'proposed']),
          notLoadedOn: EngineSlug.nullable(),
          categoryPath: list(IdOf('TX'), 8),
          x: z.number().nullable(),
          y: z.number().nullable(),
        }),
        2000,
      ),
      edges: list(
        z.strictObject({
          from: TreeNodeId,
          to: TreeNodeId,
          kind: z.enum(['upgrade', 'requires']),
          proposed: z.boolean(),
        }),
        5000,
      ),
      categories: list(IdOf('TX'), 500),
    }),
  ),
  cli: ['tree'],
});

export const SYS_61 = hr({
  id: 'SYS-61',
  method: 'POST',
  path: '/skill-prereqs',
  auth: 'A',
  o4: 'blocked',
  // Owner tự thêm cạnh; AI chỉ đề xuất qua change set. `db.*`: vòng lặp.
  request: {
    body: z.strictObject({ fromRef: Ref('SK'), toRef: Ref('SK'), kind: z.enum(['upgrade', 'requires']) }),
  },
  response: ok(z.strictObject({ from: TreeNodeId, to: TreeNodeId, kind: z.enum(['upgrade', 'requires']) })),
  errors: ['db.*'],
  cli: ['tree link'],
});

export const SYS_62 = hr({
  id: 'SYS-62',
  method: 'PUT',
  path: '/roles/{roleRef}/tree/layout',
  auth: 'A',
  o4: 'blocked',
  request: {
    params: z.strictObject({ roleRef: Ref('RL') }),
    body: z.strictObject({
      kind: z.enum(['skills', 'knowledge']),
      positions: z.array(z.strictObject({ ref: Ref(['SK', 'KN']), x: z.number(), y: z.number() })).max(2000),
    }),
  },
  response: noContent(),
  // Chưa có cột toạ độ ở DATABASE v2.3.x: lane DB thêm cột, hoặc bỏ route này (T8).
  pendingDb: true,
  noCli: 'chỉ frontend (toạ độ kéo thả)',
});

// ---------------------------------------------------------------- Kho nhân vật + avatar (A11, modal Ảnh đại diện)
export const CharacterRow = z.strictObject({
  ...idShape('SN'),
  assetCode: str(64, 1),
  nameVi: str(120),
  nameZh: str(120),
  faction: KeyStr,
  charKind: KeyStr,
  gender: KeyStr,
  packSlug: str(64, 1),
  packVersion: str(32, 1),
  source: KeyStr,
  license: str(64, 1),
  attribution: str(500).nullable(),
  isEnabled: z.boolean(),
  isSelectable: z.boolean(),
  rolesUsing: Nat,
});

export const SYS_63 = hr({
  id: 'SYS-63',
  method: 'GET',
  path: '/characters',
  auth: 'V',
  o4: 'blocked',
  request: { query: z.strictObject({ enabled: queryBool().optional() }) },
  response: ok(list(CharacterRow)),
  cli: ['characters', 'birth (chọn avatar)'],
});

export const SYS_64 = hr({
  id: 'SYS-64',
  method: 'GET',
  path: '/characters/{characterRef}',
  auth: 'V',
  o4: 'blocked',
  request: { params: z.strictObject({ characterRef: Ref('SN') }) },
  response: ok(
    CharacterRow.extend({
      // `ChibiParamsV1` (engine chibi chạy phía client).
      params: Json,
      paramsSchemaVersion: Nat,
      identity: z.strictObject({ traits: Json, colors: Json, props: Json, refs: Json }),
      roles: list(IdOf('RL'), 500),
    }),
  ),
  cli: ['character show'],
});

export const SYS_65 = hr({
  id: 'SYS-65',
  method: 'POST',
  path: '/characters/{characterRef}/assign',
  auth: 'A',
  o4: 'blocked',
  request: {
    params: z.strictObject({ characterRef: Ref('SN') }),
    body: z.strictObject({ roleRef: Ref('RL') }),
  },
  // AV nguồn `library` + trỏ `roles.avatar_id`, một transaction. `db.character_library`: nhân vật đã tắt.
  response: ok(z.strictObject({ avatar: IdOf('AV') })),
  errors: ['db.character_library'],
  cli: ['character assign', 'avatar --library'],
});

export const SYS_66 = hr({
  id: 'SYS-66',
  method: 'PUT',
  path: '/characters/{characterRef}/enabled',
  auth: 'A',
  o4: 'blocked',
  request: {
    params: z.strictObject({ characterRef: Ref('SN') }),
    body: z.strictObject({ enabled: z.boolean() }),
  },
  response: ok(z.strictObject({ isEnabled: z.boolean(), rolesUsing: Nat })),
  // CLI hỏi xác nhận khi `rolesUsing > 0`.
  cli: ['character enable', 'character disable'],
});

export const SYS_67 = hr({
  id: 'SYS-67',
  method: 'GET',
  path: '/roles/{roleRef}/avatars',
  auth: 'V',
  o4: 'blocked',
  request: { params: z.strictObject({ roleRef: Ref('RL') }) },
  response: ok(
    list(
      z.strictObject({
        ...idShape('AV'),
        source: z.enum(AVATAR_SOURCES),
        skinAsset: IdOf('SN').nullable(),
        isCurrent: z.boolean(),
        createdAt: Ts,
      }),
    ),
  ),
  cli: ['avatar history'],
});

export const SYS_68 = hr({
  id: 'SYS-68',
  method: 'POST',
  path: '/roles/{roleRef}/avatars',
  auth: 'A',
  o4: 'blocked',
  // Như trường `avatar` của SYS-31.
  request: { params: z.strictObject({ roleRef: Ref('RL') }), body: AvatarChoice },
  response: ok(z.strictObject({ avatar: IdOf('AV') })),
  errors: ['upload.too_large', 'db.character_library'],
  cli: ['avatar <role> --library', 'avatar <role> --upload', 'avatar <role> --monogram'],
});

export const SYS_69 = hr({
  id: 'SYS-69',
  method: 'POST',
  path: '/avatars/{avatarRef}/restore',
  auth: 'A',
  o4: 'blocked',
  request: { params: z.strictObject({ avatarRef: Ref('AV') }) },
  // `db.character_library`: trigger `roles_avatar_u`.
  response: ok(z.strictObject({ avatar: IdOf('AV') })),
  errors: ['db.character_library'],
  cli: ['avatar restore'],
});

// ---------------------------------------------------------------- Thẻ + thử việc (A4)
const CHECK_STATES = ['ok', 'warn', 'err', 'pending'] as const;

export const SYS_70 = hr({
  id: 'SYS-70',
  method: 'GET',
  path: '/roles/{roleRef}/card-checks',
  auth: 'V',
  o4: 'blocked',
  request: { params: z.strictObject({ roleRef: Ref('RL') }) },
  // `v_card_checks` + `card_ok` của `v_role_prompt_budget`. CNS-179: chữ theo `detailKey` + `detailParams`; `detail` chỉ đối chiếu.
  response: ok(
    z.strictObject({
      checks: list(
        z.strictObject({
          code: CardCheckCode,
          state: z.enum(CHECK_STATES),
          required: z.boolean(),
          evidence: AnyId.nullable(),
          detailKey: KeyStr,
          detailParams: I18nParams,
          detail: str(500),
          fixHint: KeyStr.nullable(),
        }),
        16,
      ),
      cardOk: z.boolean(),
      blockReason: KeyStr.nullable(),
    }),
  ),
  cli: ['card checks'],
});

export const SYS_71 = hr({
  id: 'SYS-71',
  method: 'POST',
  path: '/roles/{roleRef}/trial-runs',
  auth: 'A',
  o4: 'blocked',
  request: { params: z.strictObject({ roleRef: Ref('RL') }) },
  // Rồi SSE `trial.progress`.
  response: accepted(z.strictObject({ trialRun: IdOf('TR'), job: Job })),
  errors: ['gate.core_agent_not_ready', 'turn.rejected'],
  cli: ['trial run'],
});

export const SYS_72 = hr({
  id: 'SYS-72',
  method: 'GET',
  path: '/trial-runs/{trialRunRef}',
  auth: 'V',
  o4: 'blocked',
  request: { params: z.strictObject({ trialRunRef: Ref('TR') }) },
  // DB `trial_runs.status` dùng `pending`; hợp đồng dùng `queued` (đặc tả §3.3) — L-HR ánh xạ.
  response: ok(
    z.strictObject({
      ...idShape('TR'),
      state: z.enum(TRIAL_STATES),
      score: z.number().min(0).max(1).nullable(),
      threshold: z.number().min(0).max(1),
      passed: Nat,
      total: Nat,
      cases: list(
        z.strictObject({ prompt: str(4000), expected: str(4000), result: str(4000), score: z.number().min(0).max(1) }),
        20,
      ),
      judgeSession: IdOf('SS').nullable(),
      skipReason: str(500).nullable(),
    }),
  ),
  cli: ['trial show'],
});

export const SYS_73 = hr({
  id: 'SYS-73',
  method: 'POST',
  path: '/roles/{roleRef}/trial-runs/skip',
  auth: 'A',
  o4: 'blocked',
  request: { params: z.strictObject({ roleRef: Ref('RL') }), body: z.strictObject({ reason: str(500, 10) }) },
  response: ok(z.strictObject({ trialRun: IdOf('TR') })),
  errors: ['db.required'],
  cli: ['trial skip --reason'],
});

export const SYS_74 = hr({
  id: 'SYS-74',
  method: 'POST',
  path: '/roles/{roleRef}/cards',
  auth: 'A',
  o4: 'blocked',
  idempotent: true,
  request: {
    params: z.strictObject({ roleRef: Ref('RL') }),
    headers: IdempotencyHeaders,
    body: z.strictObject({}),
  },
  // Rồi SSE `card.step`. Kết quả cuối đọc ở SYS-76 (`status = issued`, `front.grant` null khi cấp lại, `supersededBy`).
  // `recovery.blocked` cũng khi DB chặn `draft → issued` lúc recovery.
  response: accepted(z.strictObject({ job: Job, card: IdOf('CD') })),
  errors: ['gate.card_blocked'],
  cli: ['card issue'],
});

export const CardRow = z.strictObject({
  ...idShape('CD'),
  role: IdOf('RL'),
  status: z.enum(CARD_STATUSES),
  issuedAt: Ts.nullable(),
  dnaSignature: str(128),
  coreDrift: z.boolean(),
  supersededBy: IdOf('CD').nullable(),
});

export const SYS_75 = hr({
  id: 'SYS-75',
  method: 'GET',
  path: '/cards',
  auth: 'V',
  o4: 'blocked',
  request: { query: z.strictObject({ status: z.enum(CARD_STATUSES).optional() }) },
  response: ok(list(CardRow)),
  cli: ['cards'],
});

export const SYS_76 = hr({
  id: 'SYS-76',
  method: 'GET',
  path: '/cards/{cardRef}',
  auth: 'V',
  o4: 'blocked',
  request: { params: z.strictObject({ cardRef: Ref('CD') }) },
  response: ok(
    CardRow.extend({
      front: z.strictObject({
        name: str(60, 1),
        positionTitle: str(120),
        roleDisplayId: str(20, 1),
        registryNo: str(32, 1),
        bornAt: Ts,
        engineSlug: EngineSlug,
        promptTokens: Nat,
        grant: IdOf('LG').nullable(),
        botUsername: str(64).nullable(),
      }),
      back: z.strictObject({ signature: str(128), trial: IdOf('TR').nullable(), allowlistCount: Nat }),
      history: list(z.strictObject({ status: z.enum(CARD_STATUSES), at: Ts, by: AnyId.nullable() }), 100),
    }),
  ),
  cli: ['card show'],
});

export const SYS_77 = hr({
  id: 'SYS-77',
  method: 'POST',
  path: '/cards/{cardRef}/suspend',
  auth: 'A',
  o4: 'open',
  request: { params: z.strictObject({ cardRef: Ref('CD') }) },
  // Container dừng, bot trả lời hệ thống.
  response: ok(CardRow),
  cli: ['card suspend', 'emergency'],
});

export const SYS_78 = hr({
  id: 'SYS-78',
  method: 'POST',
  path: '/cards/{cardRef}/resume',
  auth: 'A',
  // Review bảo mật PR #7 (M5): suspend là công tắc dừng nên mở khi recovery; resume khởi động lại container có credential
  // ⇒ KHÔNG mở khi `mode = recovery` (423 recovery.blocked). Muốn nối lại trong sự cố: gỡ sự cố trước (CLI `emergency`).
  o4: 'blocked',
  request: { params: z.strictObject({ cardRef: Ref('CD') }) },
  // `suspended → issued`.
  response: ok(CardRow),
  cli: ['card resume', 'emergency'],
});

export const SYS_79 = hr({
  id: 'SYS-79',
  method: 'POST',
  path: '/cards/{cardRef}/revoke',
  auth: 'O',
  o4: 'blocked',
  request: { params: z.strictObject({ cardRef: Ref('CD') }), body: z.strictObject({ confirmName: ConfirmName }) },
  // Role về "Đã đào tạo".
  response: ok(CardRow),
  errors: ['confirm.mismatch'],
  cli: ['card revoke'],
});

export const HR_ROUTES = [
  SYS_30,
  SYS_31,
  SYS_32,
  SYS_33,
  SYS_34,
  SYS_35,
  SYS_36,
  SYS_37,
  SYS_38,
  SYS_39,
  SYS_40,
  SYS_41,
  SYS_42,
  SYS_43,
  SYS_44,
  SYS_45,
  SYS_46,
  SYS_47,
  SYS_48,
  SYS_49,
  SYS_50,
  SYS_51,
  SYS_52,
  SYS_53,
  SYS_54,
  SYS_55,
  SYS_56,
  SYS_57,
  SYS_58,
  SYS_59,
  SYS_60,
  SYS_61,
  SYS_62,
  SYS_63,
  SYS_64,
  SYS_65,
  SYS_66,
  SYS_67,
  SYS_68,
  SYS_69,
  SYS_70,
  SYS_71,
  SYS_72,
  SYS_73,
  SYS_74,
  SYS_75,
  SYS_76,
  SYS_77,
  SYS_78,
  SYS_79,
] as const;
