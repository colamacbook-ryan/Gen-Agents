// Họ engine trên SQLite: danh mục (workspace hệ thống), trạng thái cài CLI, tài khoản, binding, kiểm đăng nhập (probe_runs),
// capability registry, container, consent, tác tử hệ thống, Core agent (view). Cổng người ghi do DB ép (system-only, owner /
// admin, consent, Core agent) — repo chỉ dựng câu lệnh đúng và để DB là chốt cuối.
import type { CapabilityInput, EngineRepo } from '../engines.ts';
import { invalidInput, notFound, permissionDenied } from '../errors.ts';
import type {
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
  ProbeRunRow,
  SystemAgentRow,
} from '../types.ts';
import {
  allow,
  audited,
  type Ctx,
  getRow,
  insertRow,
  mustGetRow,
  nowTs,
  OWNER_ADMIN,
  OWNER_ADMIN_SYSTEM,
  ref,
  refEngine,
  selectAll,
  selectOne,
  softDeleteRow,
  updateRow,
  Where,
} from './ctx.ts';

const b01 = (v: boolean | undefined): 0 | 1 | undefined => (v === undefined ? undefined : v ? 1 : 0);

export function engineRepo(ctx: Ctx): EngineRepo {
  const live = () => new Where(ctx, { live: true });
  const systemAgent = (key: SystemAgentRow['system_key']) => {
    const row = selectOne<SystemAgentRow>(ctx, 'system_agents', live().eq('system_key', key));
    if (row === null) throw notFound(`tác tử hệ thống ${key}`);
    return row;
  };
  return {
    catalog: () => ctx.r.all<EngineRow>('SELECT * FROM engines ORDER BY priority_order, slug'),
    engine: (slug) => ctx.r.get<EngineRow>('SELECT * FROM engines WHERE slug = ?', [slug]) ?? null,
    installs: () => selectAll<EngineInstallRow>(ctx, 'engine_installs', live(), 'engine_slug'),
    install: (slug) => selectOne<EngineInstallRow>(ctx, 'engine_installs', live().eq('engine_slug', slug), 'id'),
    account: (id) => getRow<EngineAccountRow>(ctx, 'engine_accounts', id),
    accounts: (f) =>
      selectAll<EngineAccountRow>(
        ctx,
        'engine_accounts',
        live().eq('engine_slug', f?.engineSlug).eq('status', f?.status),
      ),
    accountsView: () =>
      ctx.r.all<EngineAccountView>('SELECT * FROM v_engine_accounts WHERE workspace_id = ?', [ctx.ws]),
    binding: (id) => getRow<EngineBindingRow>(ctx, 'engine_bindings', id),
    bindingsForRole: (roleId) =>
      selectAll<EngineBindingRow>(ctx, 'engine_bindings', live().eq('role_id', roleId), 'priority, display_seq'),
    systemBindings: () =>
      selectAll<EngineBindingRow>(
        ctx,
        'engine_bindings',
        live().add("consumer_kind = 'system'"),
        'priority, display_seq',
      ),
    probeRun: (id) => getRow<ProbeRunRow>(ctx, 'probe_runs', id),
    latestLoginCheck: (accountId) =>
      selectOne<ProbeRunRow>(
        ctx,
        'probe_runs',
        new Where(ctx).eq('engine_account_id', accountId).add("trigger = 'login_check'"),
        'display_seq DESC',
      ),
    capabilities: (accountId, kind) =>
      selectAll<CapabilityRow>(
        ctx,
        'capabilities',
        live().eq('engine_account_id', accountId).eq('kind', kind),
        'kind, ordinal, item_key',
      ),
    coreAgentStatus: () =>
      ctx.r.get<CoreAgentStatusView>('SELECT * FROM v_core_agent_status WHERE workspace_id = ?', [ctx.ws]) ?? null,
    coreAgentAccounts: () =>
      ctx.r.all<CoreAgentAccountView>('SELECT * FROM v_core_agent_accounts WHERE workspace_id = ?', [ctx.ws]),
    container: (id) => getRow<ContainerRow>(ctx, 'containers', id),
    containerForRole: (roleId) => selectOne<ContainerRow>(ctx, 'containers', live().eq('role_id', roleId)),
    systemContainer: () => selectOne<ContainerRow>(ctx, 'containers', live().add("kind = 'system'")),
    consent: (id) => getRow<ConsentRow>(ctx, 'consents', id),
    activeConsents: (subject) =>
      selectAll<ConsentRow>(ctx, 'consents', new Where(ctx).add('revoked_at IS NULL').eq('subject', subject)),
    systemAgents: () => selectAll<SystemAgentRow>(ctx, 'system_agents', live()),

    setInstallState: (slug, i) => {
      allow(ctx, 'engines.setInstallState', ['system']);
      const before = selectOne<EngineInstallRow>(ctx, 'engine_installs', live().eq('engine_slug', slug), 'id');
      const values = {
        install_state: i.installState,
        installed_version: i.installedVersion ?? null,
        failure_reason: i.failureReason ?? null,
        detail: i.detail ?? null,
        tool_restriction_version: i.toolRestrictionVersion ?? null,
        checked_at: nowTs(ctx),
      };
      const row =
        before === null
          ? insertRow<EngineInstallRow>(ctx, 'engine_installs', { engine_slug: slug, ...values })
          : updateRow<EngineInstallRow>(ctx, 'engine_installs', before.id, values);
      return audited(ctx, { action: 'engine_install.state', table: 'engine_installs', row, before });
    },
    createAccount: (i) => {
      allow(ctx, 'engines.createAccount', OWNER_ADMIN_SYSTEM);
      refEngine(ctx, i.engineSlug);
      ref(ctx, 'secrets', i.secretId);
      ref(ctx, 'consents', i.consentId);
      const row = insertRow<EngineAccountRow>(ctx, 'engine_accounts', {
        engine_slug: i.engineSlug,
        label: i.label,
        auth_method: i.authMethod,
        auth_volume: i.authVolume ?? null,
        secret_id: i.secretId ?? null,
        consent_id: i.consentId ?? null,
        cli_version_pinned: i.cliVersionPinned ?? null,
      });
      return audited(ctx, { action: 'engine_account.create', table: 'engine_accounts', row });
    },
    updateAccount: (id, p, expectedVersion) => {
      allow(ctx, 'engines.updateAccount', OWNER_ADMIN_SYSTEM);
      ref(ctx, 'consents', p.consentId);
      const before = mustGetRow<EngineAccountRow>(ctx, 'engine_accounts', id);
      const row = updateRow<EngineAccountRow>(
        ctx,
        'engine_accounts',
        id,
        { label: p.label, status: p.status, consent_id: p.consentId },
        { expectedVersion },
      );
      return audited(ctx, { action: 'engine_account.update', table: 'engine_accounts', row, before });
    },
    beginLogin: (id) => {
      allow(ctx, 'engines.beginLogin', OWNER_ADMIN);
      const before = mustGetRow<EngineAccountRow>(ctx, 'engine_accounts', id);
      // login_started_at do trigger engine_accounts_login_started_* đặt theo app_now()
      const row = updateRow<EngineAccountRow>(
        ctx,
        'engine_accounts',
        id,
        { login_status: 'in_progress' },
        { bumpVersion: false },
      );
      return audited(ctx, { action: 'engine_account.login_start', table: 'engine_accounts', row, before });
    },
    recordLoginResult: (id, i) => {
      allow(ctx, 'engines.recordLoginResult', ['system']);
      const before = mustGetRow<EngineAccountRow>(ctx, 'engine_accounts', id);
      const row = updateRow<EngineAccountRow>(
        ctx,
        'engine_accounts',
        id,
        {
          login_status: i.loginStatus,
          login_checked_at: nowTs(ctx),
          account_hint: i.accountHint,
          cli_version_current: i.cliVersion,
        },
        { bumpVersion: false },
      );
      return audited(ctx, { action: 'engine_account.login_result', table: 'engine_accounts', row, before });
    },
    recordQuota: (id, i) => {
      allow(ctx, 'engines.recordQuota', ['system']);
      if (i.remainingPct !== undefined && i.remainingPct !== null && !(i.remainingPct >= 0 && i.remainingPct <= 100)) {
        throw invalidInput('remainingPct 0–100');
      }
      mustGetRow<EngineAccountRow>(ctx, 'engine_accounts', id);
      return updateRow<EngineAccountRow>(
        ctx,
        'engine_accounts',
        id,
        {
          quota_state: i.quotaState,
          quota_remaining_pct: i.remainingPct ?? null,
          quota_reset_at: i.resetAt ?? null,
          quota_scanned_at: nowTs(ctx),
        },
        { bumpVersion: false },
      );
    },
    recordOutage: (id, since) => {
      allow(ctx, 'engines.recordOutage', ['system']);
      const before = mustGetRow<EngineAccountRow>(ctx, 'engine_accounts', id);
      const row = updateRow<EngineAccountRow>(
        ctx,
        'engine_accounts',
        id,
        { outage_since: since },
        { bumpVersion: false },
      );
      return audited(ctx, { action: 'engine_account.outage', table: 'engine_accounts', row, before });
    },
    createBinding: (i) => {
      allow(ctx, 'engines.createBinding', OWNER_ADMIN_SYSTEM);
      ref(ctx, 'roles', i.roleId);
      ref(ctx, 'engine_accounts', i.engineAccountId);
      if (!Number.isSafeInteger(i.priority) || i.priority < 1) throw invalidInput('priority ≥ 1');
      const row = insertRow<EngineBindingRow>(ctx, 'engine_bindings', {
        consumer_kind: i.consumerKind,
        role_id: i.roleId ?? null,
        engine_account_id: i.engineAccountId,
        priority: i.priority,
        model_key: i.modelKey ?? null,
        effort: i.effort ?? null,
      });
      return audited(ctx, { action: 'engine_binding.create', table: 'engine_bindings', row });
    },
    updateBinding: (id, p, expectedVersion) => {
      allow(ctx, 'engines.updateBinding', OWNER_ADMIN_SYSTEM);
      const before = mustGetRow<EngineBindingRow>(ctx, 'engine_bindings', id);
      const row = updateRow<EngineBindingRow>(
        ctx,
        'engine_bindings',
        id,
        { priority: p.priority, model_key: p.modelKey, effort: p.effort, is_enabled: b01(p.isEnabled) },
        { expectedVersion },
      );
      return audited(ctx, { action: 'engine_binding.update', table: 'engine_bindings', row, before });
    },
    recordSelection: (id, state) => {
      allow(ctx, 'engines.recordSelection', ['system']);
      mustGetRow<EngineBindingRow>(ctx, 'engine_bindings', id);
      return updateRow<EngineBindingRow>(
        ctx,
        'engine_bindings',
        id,
        { selection_state: state, selection_checked_at: nowTs(ctx) },
        { bumpVersion: false },
      );
    },
    removeBinding: (id) => {
      allow(ctx, 'engines.removeBinding', OWNER_ADMIN_SYSTEM);
      const before = mustGetRow<EngineBindingRow>(ctx, 'engine_bindings', id);
      const row = softDeleteRow<EngineBindingRow>(ctx, 'engine_bindings', id);
      audited(ctx, { action: 'engine_binding.remove', table: 'engine_bindings', row, before });
    },
    startProbe: (i) => {
      allow(ctx, 'engines.startProbe', ['system']);
      ref(ctx, 'containers', i.containerId);
      const acc = mustGetRow<EngineAccountRow>(ctx, 'engine_accounts', i.engineAccountId);
      return insertRow<ProbeRunRow>(ctx, 'probe_runs', {
        engine_account_id: acc.id,
        engine_slug: acc.engine_slug,
        trigger: i.trigger,
        auth_mode: i.authMode,
        container_id: i.containerId ?? null,
        cli_version: i.cliVersion ?? null,
        started_at: nowTs(ctx),
      });
    },
    finishProbe: (id, i) => {
      allow(ctx, 'engines.finishProbe', ['system']);
      const cur = mustGetRow<ProbeRunRow>(ctx, 'probe_runs', id);
      const finished = nowTs(ctx);
      const row = updateRow<ProbeRunRow>(
        ctx,
        'probe_runs',
        id,
        {
          status: i.status,
          finished_at: finished,
          duration_ms: Math.max(0, Date.parse(finished) - Date.parse(cur.started_at)),
          summary_json: i.summaryJson ?? null,
          error: i.error ?? null,
        },
        { extraWhere: { sql: "status = 'running'", params: [] } },
      );
      return audited(ctx, {
        action: row.trigger === 'login_check' ? 'engine.login_check' : 'engine.probe',
        table: 'probe_runs',
        row,
        before: cur,
      });
    },
    upsertCapabilities: (i) => {
      allow(ctx, 'engines.upsertCapabilities', ['system']);
      const run = mustGetRow<ProbeRunRow>(ctx, 'probe_runs', i.probeRunId);
      if (run.engine_account_id !== i.engineAccountId) throw invalidInput('probe run không thuộc tài khoản này');
      const now = nowTs(ctx);
      let inserted = 0;
      let updated = 0;
      const seen = new Set<string>();
      for (const c of i.items) {
        if (c.valueState === 'unknown' && !c.unknownReason)
          throw invalidInput(`capability ${c.kind}:${c.itemKey} unknown cần lý do`);
        const k = `${c.kind}\u0000${c.itemKey}`;
        if (seen.has(k)) throw invalidInput(`capability trùng trong lượt: ${c.kind}:${c.itemKey}`);
        seen.add(k);
        const values = capValues(c, i, now);
        const cur = selectOne<CapabilityRow>(
          ctx,
          'capabilities',
          new Where(ctx).eq('engine_account_id', i.engineAccountId).eq('kind', c.kind).eq('item_key', c.itemKey),
          'id',
        );
        if (cur === null) {
          insertRow(ctx, 'capabilities', {
            engine_account_id: i.engineAccountId,
            kind: c.kind,
            item_key: c.itemKey,
            first_seen_at: now,
            ...values,
          });
          inserted++;
        } else {
          updateRow(ctx, 'capabilities', cur.id, values, { bumpVersion: false });
          updated++;
        }
      }
      let missing = 0;
      for (const r of selectAll<CapabilityRow>(
        ctx,
        'capabilities',
        new Where(ctx).eq('engine_account_id', i.engineAccountId).add('missing_since IS NULL'),
      )) {
        if (!seen.has(`${r.kind}\u0000${r.item_key}`)) {
          updateRow(ctx, 'capabilities', r.id, { missing_since: now }, { bumpVersion: false });
          missing++;
        }
      }
      return { inserted, updated, missing };
    },
    ensureContainer: (i) => {
      allow(ctx, 'engines.ensureContainer', OWNER_ADMIN_SYSTEM);
      ref(ctx, 'roles', i.roleId);
      const cur = selectOne<ContainerRow>(
        ctx,
        'containers',
        i.kind === 'system'
          ? live().add("kind = 'system'")
          : live()
              .add("kind = 'role'")
              .eq('role_id', i.roleId ?? null),
      );
      if (cur !== null) return cur;
      const row = insertRow<ContainerRow>(ctx, 'containers', {
        kind: i.kind,
        role_id: i.roleId ?? null,
        container_name: i.containerName,
        image_ref: i.imageRef ?? null,
        desired_state: i.desiredState,
        observed_state: 'absent',
      });
      return audited(ctx, { action: 'container.create', table: 'containers', row });
    },
    updateContainer: (id, p) => {
      allow(ctx, 'engines.updateContainer', OWNER_ADMIN_SYSTEM);
      const before = mustGetRow<ContainerRow>(ctx, 'containers', id);
      const row = updateRow<ContainerRow>(
        ctx,
        'containers',
        id,
        {
          desired_state: p.desiredState,
          observed_state: p.observedState,
          state_detail: p.stateDetail,
          health: p.health,
          health_checked_at: p.health === undefined ? undefined : nowTs(ctx),
          image_ref: p.imageRef,
          image_digest: p.imageDigest,
          last_started_at: p.lastStartedAt,
          last_stopped_at: p.lastStoppedAt,
        },
        { bumpVersion: p.desiredState !== undefined || p.imageRef !== undefined },
      );
      if (p.desiredState !== undefined || p.imageRef !== undefined) {
        audited(ctx, { action: 'container.update', table: 'containers', row, before });
      }
      return row;
    },
    grantConsent: (i) => {
      const actor = allow(ctx, 'engines.grantConsent', OWNER_ADMIN);
      // đồng ý điều khoản là của CHÍNH người bấm — không ghi thay người khác
      if (i.userId !== actor.user_id)
        throw permissionDenied('engines.grantConsent: userId phải là người đang thao tác');
      const row = insertRow<ConsentRow>(ctx, 'consents', {
        user_id: i.userId,
        consent_kind: i.consentKind,
        subject: i.subject,
        notice_version: i.noticeVersion,
        notice_hash: i.noticeHash,
        lang: i.lang ?? null,
        accepted_at: nowTs(ctx),
      });
      return audited(ctx, { action: 'consent.grant', table: 'consents', row });
    },
    revokeConsent: (id) => {
      allow(ctx, 'engines.revokeConsent', OWNER_ADMIN);
      const before = mustGetRow<ConsentRow>(ctx, 'consents', id);
      const row = updateRow<ConsentRow>(
        ctx,
        'consents',
        id,
        { revoked_at: nowTs(ctx) },
        { extraWhere: { sql: 'revoked_at IS NULL', params: [] } },
      );
      return audited(ctx, { action: 'consent.revoke', table: 'consents', row, before });
    },
    updateSystemAgent: (key, p) => {
      allow(ctx, 'engines.updateSystemAgent', OWNER_ADMIN);
      const before = systemAgent(key);
      const row = updateRow<SystemAgentRow>(ctx, 'system_agents', before.id, {
        model_key: p.modelKey,
        effort: p.effort,
        is_enabled: b01(p.isEnabled),
      });
      return audited(ctx, { action: 'system_agent.update', table: 'system_agents', row, before });
    },
    recordSystemAgentSelection: (key, state) => {
      allow(ctx, 'engines.recordSystemAgentSelection', ['system']);
      const before = systemAgent(key);
      return updateRow<SystemAgentRow>(
        ctx,
        'system_agents',
        before.id,
        { selection_state: state, selection_checked_at: nowTs(ctx) },
        { bumpVersion: false },
      );
    },
  };
}

function capValues(
  c: CapabilityInput,
  i: { authMode: string; cliVersion?: string | null; probeRunId: string },
  now: string,
) {
  return {
    value_state: c.valueState,
    value_text: c.valueText ?? null,
    value_json: c.valueJson ?? null,
    unknown_reason: c.valueState === 'unknown' ? (c.unknownReason ?? null) : null,
    source: c.source,
    confidence: c.confidence,
    auth_mode: i.authMode,
    cli_version: i.cliVersion ?? null,
    ordinal: c.ordinal ?? null,
    last_seen_at: now,
    last_probe_run_id: i.probeRunId,
    missing_since: null,
  };
}
