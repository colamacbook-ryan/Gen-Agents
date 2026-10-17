// Họ Role + DNA + instructions + change set → revision (DATABASE §5.2–5.4, §7.2–7.3). Mọi thứ chạm prompt đi qua MỘT cửa:
// change set (đề xuất) → apply (một revision, toàn bộ hoặc không gì). Owner sửa ô trực tiếp = change set tự áp ngay.
import type {
  ChangeSetItemRow,
  ChangeSetRow,
  ChangeSetScope,
  DnaFieldDefRow,
  DnaFieldRow,
  DnaFieldVersionRow,
  DnaSheetView,
  InstructionLayer,
  InstructionRow,
  InstructionVersionRow,
  Page,
  PageRequest,
  PolarisCheckInput,
  PolarisCheckRow,
  PositionRow,
  RevisionKind,
  RevisionRow,
  RoleColor,
  RoleLifecycle,
  RolePromptBudgetView,
  RoleRow,
  RoleRuntimeState,
  RoleView,
} from './types.ts';

export interface RoleListFilter {
  lifecycle?: readonly RoleLifecycle[];
  /** Mặc định false: bỏ hàng đã xoá mềm. */
  includeDeleted?: boolean;
}

export interface RoleReads {
  get(roleId: string): RoleRow | null;
  /** `RL-0001`; prefix sai ⇒ null. */
  getByDisplayId(displayId: string): RoleRow | null;
  list(filter?: RoleListFilter): RoleRow[];
  /** v_roles (lưới Danh sách Role). */
  view(roleId: string): RoleView | null;
  promptBudget(roleId: string): RolePromptBudgetView | null;
  positions(): PositionRow[];
  defaultPosition(): PositionRow | null;
  /** Lưới "Đối chiếu Polaris" của Role (PC-). */
  polarisChecks(roleId: string, page?: PageRequest): Page<PolarisCheckRow>;
}

export interface CreateRoleInput {
  name: string;
  color: RoleColor;
  description?: string | null;
  promptBudgetTokens?: number;
}

export interface RoleRepo extends RoleReads {
  /**
   * Tạo Role nháp (RL-) + actor kind 'role' của nó trong cùng giao dịch. name_norm = chuẩn hoá tiếng Việt (search/fold).
   * DB chặn khi Core agent chưa sẵn sàng (INT-20 ⇒ 'core_agent.not_ready').
   */
  create(input: CreateRoleInput): RoleRow;
  /** Sửa cột mô tả; `expectedVersion` (optimistic) lệch ⇒ 'repo.version_conflict'. */
  update(
    roleId: string,
    patch: { name?: string; color?: RoleColor; description?: string | null; promptBudgetTokens?: number },
    expectedVersion?: number,
  ): RoleRow;
  /** Đổi vòng đời; sang 'born' cấp born_at + registry_no (CHECK). */
  setLifecycle(roleId: string, to: RoleLifecycle, opts?: { registryNo?: string }): RoleRow;
  /** Trạng thái runtime (cột vận hành — không tăng version). */
  setRuntimeState(roleId: string, state: RoleRuntimeState, detail?: string | null): RoleRow;
  touchActive(roleId: string): void;
  softDelete(roleId: string): void;
}

export interface DnaReads {
  /** Danh mục field: chuẩn (workspace hệ thống) + field tự thêm của workspace. */
  defs(): DnaFieldDefRow[];
  fields(roleId: string, filter?: { status?: DnaFieldRow['status'] }): DnaFieldRow[];
  field(dnaFieldId: string): DnaFieldRow | null;
  versions(dnaFieldId: string): DnaFieldVersionRow[];
  sheet(roleId: string): DnaSheetView[];
}

export interface InstructionReads {
  list(filter: {
    roleId?: string;
    positionId?: string;
    layer?: InstructionLayer;
    status?: InstructionRow['status'];
  }): InstructionRow[];
  get(instructionId: string): InstructionRow | null;
  versions(instructionId: string): InstructionVersionRow[];
}

export interface RevisionReads {
  get(revisionId: string): RevisionRow | null;
  /** Timeline theo phạm vi (seq tăng dần). */
  list(scope: { roleId: string } | { positionId: string } | { workspace: true }): RevisionRow[];
  latest(scope: { roleId: string } | { positionId: string } | { workspace: true }): RevisionRow | null;
}

/** Nội dung một mục đề xuất. token_count do người gọi tính (tokenizer cục bộ, DATABASE §7.5). */
export type ChangeItemInput =
  | {
      target: 'dna';
      op: 'create';
      defId: string;
      itemIndex?: number;
      valueJson: string;
      valueNum?: number | null;
      prose?: string | null;
      isInPrompt?: boolean;
      tokenCount: number;
      tokenizer: string;
      source: DnaFieldRow['source'];
      sourceMessageId?: string | null;
      reason?: string | null;
    }
  | {
      target: 'dna';
      op: 'update';
      dnaFieldId: string;
      /** version hiện tại lúc đề xuất — lệch lúc apply ⇒ mục bị từ chối 'repo.version_conflict'. */
      baseVersion: number;
      valueJson: string;
      valueNum?: number | null;
      prose?: string | null;
      isInPrompt?: boolean;
      tokenCount: number;
      reason?: string | null;
    }
  | {
      target: 'instruction';
      op: 'create';
      layer: InstructionLayer;
      ordinal: number;
      name: string;
      content: string;
      conditionKind?: InstructionRow['condition_kind'];
      conditionValue?: string | null;
      engineScope?: string | null;
      isEnabled?: boolean;
      tokenCount: number;
      tokenizer: string;
      source: InstructionRow['source'];
      lang?: string;
      reason?: string | null;
    }
  | {
      target: 'instruction';
      op: 'update';
      instructionId: string;
      baseVersion: number;
      patch: {
        name?: string;
        content?: string;
        ordinal?: number;
        conditionKind?: InstructionRow['condition_kind'];
        conditionValue?: string | null;
        engineScope?: string | null;
        isEnabled?: boolean;
      };
      tokenCount: number;
      reason?: string | null;
    };

export interface ProposeChangeSetInput {
  scope: ChangeSetScope;
  roleId?: string;
  positionId?: string;
  title: string;
  source?: { threadId?: string | null; messageId?: string | null; sessionId?: string | null };
  items: readonly ChangeItemInput[];
  /** Bắt buộc khi người đề xuất là actor Role (DB: change_sets_polaris). */
  polaris?: PolarisCheckInput | null;
}

export interface ApplyChangeSetInput {
  /** Mục được duyệt (mặc định: mọi mục pending). Mục pending còn lại ⇒ rejected. */
  acceptItemIds?: readonly string[];
  /** Bắt buộc khi chạm lõi (DN lõi / IN lớp giá trị-tính cách) — DB đòi note ở revision lõi. */
  note?: string | null;
  /** Mặc định 'edit' (lõi ⇒ 'core_edit' tự suy). */
  kind?: RevisionKind;
}

export interface ApplyChangeSetResult {
  changeSet: ChangeSetRow;
  revision: RevisionRow;
  accepted: ChangeSetItemRow[];
  rejected: ChangeSetItemRow[];
  /** Mục từ chối vì base_version lệch (đề xuất đã cũ). */
  stale: ChangeSetItemRow[];
}

export interface ChangeSetReads {
  get(changeSetId: string): ChangeSetRow | null;
  items(changeSetId: string): ChangeSetItemRow[];
  listOpen(filter?: { roleId?: string; scope?: ChangeSetScope }): ChangeSetRow[];
}

export interface ChangeSetRepo extends ChangeSetReads {
  /** proposed_by = actor của giao dịch (DB v2.3.3 ép). Tạo hàng chính 'proposed' cho mục create + version 'proposed'. */
  propose(input: ProposeChangeSetInput): { changeSet: ChangeSetRow; items: ChangeSetItemRow[] };
  /**
   * Duyệt + áp (DATABASE §7.2 T2): một revision (semver; lõi ⇒ major+1), version 'accepted', hàng chính = cache của version
   * mới, roles.current_revision_id, change_sets.status, job brain_sync (outbox). Biên dịch prompt KHÔNG ở đây (L-GW gọi
   * compiler trong cùng giao dịch).
   */
  apply(changeSetId: string, input?: ApplyChangeSetInput): ApplyChangeSetResult;
  reject(changeSetId: string, reason?: string | null): ChangeSetRow;
}
