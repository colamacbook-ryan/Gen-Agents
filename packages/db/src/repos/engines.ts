// Họ engine: danh mục, trạng thái cài CLI, tài khoản, binding, kiểm đăng nhập (probe_runs trigger 'login_check'),
// capability registry, container, consent, tác tử hệ thống, Core agent (DATABASE §5.12, §9.5; INT-20, CONTRACT-r8*).
// Cột "kết quả runtime" (login_status ngoài in_progress, quota, selection_state, install_state…) chỉ actor system ghi —
// DB ép ('permission.system_only'); repo không mở lối khác.
import type {
  AuthMode,
  CapabilityKind,
  CapabilityRow,
  ConsentRow,
  ContainerRow,
  CoreAgentAccountView,
  CoreAgentStatusView,
  EngineAccountRow,
  EngineAccountView,
  EngineBindingRow,
  EngineInstallRow,
  EngineRow,
  InstallState,
  LoginStatus,
  ProbeRunRow,
  ProbeStatus,
  ProbeTrigger,
  QuotaState,
  SystemAgentRow,
} from './types.ts';

export interface EngineReads {
  catalog(): EngineRow[];
  engine(slug: string): EngineRow | null;
  installs(): EngineInstallRow[];
  install(engineSlug: string): EngineInstallRow | null;
  account(accountId: string): EngineAccountRow | null;
  accounts(filter?: { engineSlug?: string; status?: EngineAccountRow['status'] }): EngineAccountRow[];
  accountsView(): EngineAccountView[];
  binding(bindingId: string): EngineBindingRow | null;
  /** Binding sống của Role, theo priority tăng dần. */
  bindingsForRole(roleId: string): EngineBindingRow[];
  /** Binding sống của AI Hệ thống (consumer_kind 'system'). */
  systemBindings(): EngineBindingRow[];
  probeRun(probeRunId: string): ProbeRunRow | null;
  /** Lần kiểm đăng nhập MỚI NHẤT (trigger 'login_check') của tài khoản — "sẵn sàng" xét lần mới nhất (STD-11). */
  latestLoginCheck(accountId: string): ProbeRunRow | null;
  capabilities(accountId: string, kind?: CapabilityKind): CapabilityRow[];
  /** v_core_agent_status: một hàng mỗi workspace — nguồn của guard O4 (L-SYS). */
  coreAgentStatus(): CoreAgentStatusView | null;
  coreAgentAccounts(): CoreAgentAccountView[];
  container(containerId: string): ContainerRow | null;
  containerForRole(roleId: string): ContainerRow | null;
  /** Container AI Hệ thống (CT-0001) sống của workspace. */
  systemContainer(): ContainerRow | null;
  consent(consentId: string): ConsentRow | null;
  /** Đồng ý còn hiệu lực (chưa rút) cho subject (vd slug engine). */
  activeConsents(subject?: string): ConsentRow[];
  systemAgents(): SystemAgentRow[];
}

export interface CapabilityInput {
  kind: CapabilityKind;
  itemKey: string;
  /** 'unknown' ⇒ unknownReason bắt buộc (CHECK). Không đoán giá trị (STD-10). */
  valueState: 'known' | 'unknown';
  valueText?: string | null;
  valueJson?: string | null;
  unknownReason?: string | null;
  source: string;
  confidence: CapabilityRow['confidence'];
  ordinal?: number | null;
}

export interface EngineRepo extends EngineReads {
  /** Trạng thái cài CLI (theo ga-engine-install status) — CHỈ actor system (DB ép). */
  setInstallState(
    engineSlug: string,
    input: {
      installState: InstallState;
      installedVersion?: string | null;
      failureReason?: EngineInstallRow['failure_reason'];
      detail?: string | null;
      toolRestrictionVersion?: string | null;
    },
  ): EngineInstallRow;

  /** Tạo tài khoản (EN-). Người ghi: owner / admin / system (DB ép). Engine cần consent ⇒ consentId bắt buộc. */
  createAccount(input: {
    engineSlug: string;
    label: string;
    authMethod: EngineAccountRow['auth_method'];
    /** subscription: tên volume ga-auth-* (CHECK a-z0-9-, 3–63). */
    authVolume?: string | null;
    secretId?: string | null;
    consentId?: string | null;
    cliVersionPinned?: string | null;
  }): EngineAccountRow;
  updateAccount(
    accountId: string,
    patch: { label?: string; status?: EngineAccountRow['status']; consentId?: string | null },
    expectedVersion?: number,
  ): EngineAccountRow;
  /** Owner bấm "Đăng nhập / Đăng nhập lại": login_status = in_progress + login_started_at = app_now(). */
  beginLogin(accountId: string): EngineAccountRow;
  /** Kết quả kiểm đăng nhập — CHỈ actor system. accountHint phải đã che (mask) trước khi vào đây (§9.8). */
  recordLoginResult(
    accountId: string,
    input: {
      loginStatus: Exclude<LoginStatus, 'in_progress'>;
      accountHint?: string | null;
      cliVersion?: string | null;
    },
  ): EngineAccountRow;
  /** Quota quét được — CHỈ actor system. */
  recordQuota(
    accountId: string,
    input: { quotaState: QuotaState; remainingPct?: number | null; resetAt?: string | null },
  ): EngineAccountRow;
  /** Sự cố hãng (outage_since; null = hết) — CHỈ actor system. */
  recordOutage(accountId: string, since: string | null): EngineAccountRow;

  /** Binding (EB-) tài khoản ↔ consumer. Container của consumer phải có trước (DB). */
  createBinding(input: {
    consumerKind: EngineBindingRow['consumer_kind'];
    roleId?: string | null;
    engineAccountId: string;
    priority: number;
    modelKey?: string | null;
    effort?: string | null;
  }): EngineBindingRow;
  updateBinding(
    bindingId: string,
    patch: { priority?: number; modelKey?: string | null; effort?: string | null; isEnabled?: boolean },
    expectedVersion?: number,
  ): EngineBindingRow;
  /** Kết quả kiểm model — CHỈ actor system. */
  recordSelection(bindingId: string, state: EngineBindingRow['selection_state']): EngineBindingRow;
  removeBinding(bindingId: string): void;

  /** Bắt đầu một lượt probe / kiểm đăng nhập (status running). */
  startProbe(input: {
    engineAccountId: string;
    trigger: ProbeTrigger;
    authMode: AuthMode;
    containerId?: string | null;
    cliVersion?: string | null;
  }): ProbeRunRow;
  finishProbe(
    probeRunId: string,
    input: { status: Exclude<ProbeStatus, 'running'>; summaryJson?: string | null; error?: string | null },
  ): ProbeRunRow;
  /**
   * Ghi kết quả quét capability của một lượt probe: hàng mới ⇒ INSERT (CAP-), hàng có ⇒ cập nhật last_seen; hàng cũ không
   * còn thấy ⇒ missing_since. Trả số hàng theo từng loại.
   */
  upsertCapabilities(input: {
    engineAccountId: string;
    probeRunId: string;
    authMode: AuthMode;
    cliVersion?: string | null;
    items: readonly CapabilityInput[];
  }): { inserted: number; updated: number; missing: number };

  /** Container mong muốn (CT-). Một container sống mỗi Role; AI Hệ thống kind 'system'. */
  ensureContainer(input: {
    kind: ContainerRow['kind'];
    roleId?: string | null;
    containerName: string;
    imageRef?: string | null;
    desiredState: ContainerRow['desired_state'];
  }): ContainerRow;
  updateContainer(
    containerId: string,
    patch: {
      desiredState?: ContainerRow['desired_state'];
      observedState?: ContainerRow['observed_state'];
      stateDetail?: string | null;
      health?: ContainerRow['health'];
      imageRef?: string | null;
      imageDigest?: string | null;
      lastStartedAt?: string | null;
      lastStoppedAt?: string | null;
    },
  ): ContainerRow;

  /** Đồng ý điều khoản (CN-) — user_id = owner đang thao tác. */
  grantConsent(input: {
    userId: string;
    consentKind: ConsentRow['consent_kind'];
    subject: string;
    noticeVersion: string;
    noticeHash: string;
    lang?: string | null;
  }): ConsentRow;
  revokeConsent(consentId: string): ConsentRow;

  updateSystemAgent(
    systemKey: SystemAgentRow['system_key'],
    patch: { modelKey?: string | null; effort?: string | null; isEnabled?: boolean },
  ): SystemAgentRow;
  /** Kết quả kiểm model của tác tử hệ thống — CHỈ actor system. */
  recordSystemAgentSelection(
    systemKey: SystemAgentRow['system_key'],
    state: SystemAgentRow['selection_state'],
  ): SystemAgentRow;
}
