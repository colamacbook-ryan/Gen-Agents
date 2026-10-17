// Meta test chống IDOR chéo tenant (review bảo mật 2026-10-17): MỌI hàm ghi của MỌI họ repo, gọi trong tenant A với id
// của tenant B (đích hoặc tham chiếu trong input), phải bị repo từ chối bằng mã ổn định ('repo.not_found' /
// 'repo.invalid_ref') — không thành công, không để DB chặn hộ. Actor của từng ca CÓ quyền với thao tác đó, nên lỗi đến
// từ kiểm tenant chứ không phải kiểm quyền.
// Độ phủ: mỗi khoá của tx.<họ> phải nằm trong READS hoặc có ca / lý do NO_REF — thêm hàm ghi mới mà không thêm ca ⇒ đỏ.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addTenant, createFixture, type Fixture, type TenantHandle } from '../../src/repos/fixture/index.ts';
import { DbRuleError, type RoleRow, type WriteTx } from '../../src/repos/index.ts';

type Fam = Exclude<keyof WriteTx, 'workspaceId' | 'now' | 'actorId' | 'actor' | 'options'>;
type Who = 'owner' | 'system';

const READS: Record<Fam, readonly string[]> = {
  workspace: [
    'get',
    'members',
    'member',
    'owner',
    'actor',
    'systemActor',
    'actorForUser',
    'actorForRole',
    'setupChecklist',
  ],
  users: ['get', 'byUsername'],
  authSessions: ['byTokenHash'],
  settings: ['get', 'row', 'list'],
  secrets: ['get', 'list'],
  roles: ['get', 'getByDisplayId', 'list', 'view', 'promptBudget', 'positions', 'defaultPosition', 'polarisChecks'],
  dna: ['defs', 'fields', 'field', 'versions', 'sheet'],
  instructions: ['list', 'get', 'versions'],
  revisions: ['get', 'list', 'latest'],
  changeSets: ['get', 'items', 'listOpen'],
  engines: [
    'catalog',
    'engine',
    'installs',
    'install',
    'account',
    'accounts',
    'accountsView',
    'binding',
    'bindingsForRole',
    'systemBindings',
    'probeRun',
    'latestLoginCheck',
    'capabilities',
    'coreAgentStatus',
    'coreAgentAccounts',
    'container',
    'containerForRole',
    'systemContainer',
    'consent',
    'activeConsents',
    'systemAgents',
  ],
  sessions: ['get', 'list', 'running'],
  chat: ['thread', 'threads', 'telegramThread', 'message', 'messages'],
  tasks: ['get', 'getByDisplayId', 'list'],
  jobs: ['get', 'list'],
  wallet: [
    'get',
    'forRole',
    'treasury',
    'sink',
    'entry',
    'entryByIdempotencyKey',
    'entries',
    'leaderboard',
    'openWound',
    'wounds',
  ],
  telegram: [
    'bot',
    'botForRole',
    'bots',
    'allowlist',
    'allowed',
    'owners',
    'send',
    'sends',
    'proactivePolicy',
    'sentCount',
  ],
  tools: ['list', 'get', 'bySlug', 'grants', 'effectiveMode', 'egressRules'],
  audit: ['get', 'getByDisplayId', 'list', 'head'],
  avatar: ['current', 'history', 'state', 'states', 'library', 'skinAsset'],
};

/** Hàm ghi không nhận id nào từ input (phạm vi = workspace của giao dịch) — lý do ghi kèm. */
const NO_REF: Record<string, string> = {
  'workspace.update': 'chỉ sửa workspace của giao dịch',
  'settings.set': 'khoá settings, không id',
  'settings.remove': 'khoá settings, không id',
  'roles.create': 'không id tham chiếu',
  'engines.setInstallState': 'slug thuộc danh mục toàn cục; hàng cài đặt theo workspace giao dịch',
  'engines.updateSystemAgent': 'khoá tác tử hệ thống, không id',
  'engines.recordSystemAgentSelection': 'khoá tác tử hệ thống, không id',
  'jobs.enqueue': 'payload tự do, không id tham chiếu cột',
  'jobs.claim': 'lấy việc của workspace giao dịch',
  'jobs.reapExpiredLeases': 'phạm vi workspace giao dịch',
  'telegram.expireReservations': 'phạm vi workspace giao dịch',
};

interface B {
  t: TenantHandle;
  role: RoleRow;
  position: string;
  task: string;
  thread: string;
  message: string;
  session: string;
  authSession: string;
  secret: string;
  bot: string;
  allow: string;
  wallet: string;
  audit: string;
  tool: string;
  grant: string;
  egress: string;
  policy: string;
  changeSet: string;
  instruction: string;
  probe: string;
  skin: string;
  avatar: string;
  job: string;
  send: string;
  consent: string;
  binding: string;
}

let f: Fixture;
let b: B;
let roleA: RoleRow;
let threadA: string;
let taskA: string;

const polaris = { expectedGainMinor: 0, rulesApplied: 'P1' };

beforeAll(() => {
  f = createFixture({ roles: 1 });
  roleA = f.roles[0] as RoleRow;
  const t = addTenant(f, { slug: 'other', shortCode: 'ZZ99', username: 'owner-b', roles: 1 });
  const role = t.roles[0] as RoleRow;
  const s = f.store;
  const ob = (fn: (tx: WriteTx) => unknown) => s.write(t.ownerActorId, fn as never);
  const sb = (fn: (tx: WriteTx) => unknown) => s.write(t.systemActorId, fn as never);
  const position = s.read(t.workspaceId, (tx) => tx.roles.defaultPosition()?.id as string);
  const task = (ob((tx) => tx.tasks.create({ title: 'b', source: 'web', assigneeRoleId: role.id })) as { id: string })
    .id;
  const thread = (
    ob((tx) => tx.chat.openThread({ kind: 'workspace', agent: 'role', roleId: role.id })) as { id: string }
  ).id;
  const message = (
    ob((tx) => tx.chat.append({ threadId: thread, authorKind: 'owner', channel: 'web', content: 'b' })) as {
      id: string;
    }
  ).id;
  const session = (
    sb((tx) => tx.sessions.start({ agentKind: 'role', trigger: 'chat', roleId: role.id })) as { id: string }
  ).id;
  const authSession = (
    sb((tx) =>
      tx.authSessions.create({ userId: t.ownerUserId, tokenHash: 'hb', expiresAt: '2027-01-01T00:00:00.000Z' }),
    ) as {
      id: string;
    }
  ).id;
  const secret = (
    ob((tx) =>
      tx.secrets.create({
        kind: 'telegram_bot_token',
        label: 'b',
        ciphertext: Buffer.from([1]),
        nonce: Buffer.from([1]),
        wrappedDek: Buffer.from([1]),
        dekNonce: Buffer.from([1]),
        kekId: 'k',
        fingerprint: 'fb',
      }),
    ) as { id: string }
  ).id;
  const bot = (
    ob((tx) => tx.telegram.createBot({ roleId: role.id, botUsername: 'b_bot', secretId: secret })) as { id: string }
  ).id;
  const allow = (ob((tx) => tx.telegram.captureOwner(bot, { tgUserId: 77, displayName: 'b' })) as { id: string }).id;
  const wallet = (ob((tx) => tx.wallet.openRoleWallet(role.id)) as { id: string }).id;
  const audit = s.read(t.workspaceId, (tx) => tx.audit.list().items[0]?.id as string);
  const tool = s.read(t.workspaceId, (tx) => tx.tools.list()[0]?.id as string);
  const grant = (ob((tx) => tx.tools.grant({ toolId: tool, roleId: role.id, mode: 'allow' })) as { id: string }).id;
  const egress = (
    ob((tx) => tx.tools.addEgressRule({ domainPattern: 'b.example', appliesTo: 'role', roleId: role.id })) as {
      id: string;
    }
  ).id;
  const policy = (
    ob((tx) =>
      tx.telegram.setProactivePolicy(role.id, { maxPerDay: 5, quietStartMin: 0, quietEndMin: 1, timezone: 'UTC' }),
    ) as { id: string }
  ).id;
  const cs = ob((tx) =>
    tx.changeSets.propose({
      scope: 'role',
      roleId: role.id,
      title: 'b',
      items: [
        {
          target: 'instruction',
          op: 'create',
          layer: 'style',
          ordinal: 1,
          name: 'b',
          content: 'b',
          tokenCount: 1,
          tokenizer: 't',
          source: 'owner',
        },
      ],
    }),
  ) as { changeSet: { id: string } };
  const instruction = s.read(t.workspaceId, (tx) => tx.instructions.list({ roleId: role.id })[0]?.id as string);
  const probe = s.read(t.workspaceId, (tx) => tx.engines.latestLoginCheck(t.coreAccount?.id as string)?.id as string);
  const skin = s.read(t.workspaceId, (tx) => tx.avatar.library()[0]?.skin_asset_id as string);
  const avatar = (ob((tx) => tx.avatar.assignMonogram(role.id)) as { avatar: { id: string } }).avatar.id;
  const job = (sb((tx) => tx.jobs.enqueue({ kind: 'probe', payload: {} })) as { job: { id: string } }).job.id;
  const send = (
    sb((tx) =>
      tx.telegram.reserveSend({
        roleId: role.id,
        triggerKind: 'task_done',
        urgency: 'normal',
        channel: 'telegram',
        dayLocal: '2026-10-17',
        reservedUntil: '2026-10-17T09:00:00.000Z',
        policyId: policy,
        polaris,
      }),
    ) as { id: string }
  ).id;
  const consent = s.read(t.workspaceId, (tx) => tx.engines.activeConsents()[0]?.id as string);
  const binding = s.read(t.workspaceId, (tx) => tx.engines.systemBindings()[0]?.id as string);
  b = {
    t,
    role,
    position,
    task,
    thread,
    message,
    session,
    authSession,
    secret,
    bot,
    allow,
    wallet,
    audit,
    tool,
    grant,
    egress,
    policy,
    changeSet: cs.changeSet.id,
    instruction,
    probe,
    skin,
    avatar,
    job,
    send,
    consent,
    binding,
  };
  for (const [k, v] of Object.entries(b)) if (v === undefined || v === null) throw new Error(`fixture B thiếu ${k}`);
  threadA = f.store.write(f.ownerActorId, (tx) =>
    tx.chat.openThread({ kind: 'workspace', agent: 'role', roleId: roleA.id }),
  ).id;
  taskA = f.store.write(f.ownerActorId, (tx) => tx.tasks.create({ title: 'a', source: 'web' })).id;
});
afterAll(() => f?.close());

type Case = [name: string, who: Who, call: (tx: WriteTx) => unknown, expected?: readonly string[]];

function cases(): Case[] {
  const accA = () => f.coreAccount?.id as string;
  const send = (over: () => Record<string, unknown>) => (tx: WriteTx) =>
    tx.telegram.reserveSend({
      roleId: roleA.id,
      triggerKind: 'task_done',
      urgency: 'normal',
      channel: 'telegram',
      dayLocal: '2026-10-17',
      reservedUntil: '2026-10-17T09:00:00.000Z',
      polaris,
      ...over(),
    } as never);
  return [
    ['workspace.addMember', 'owner', (tx) => tx.workspace.addMember({ userId: b.t.ownerUserId, accessLevel: 'admin' })],
    ['workspace.setAccessLevel', 'owner', (tx) => tx.workspace.setAccessLevel(b.t.ownerUserId, 'admin')],
    ['workspace.removeMember', 'owner', (tx) => tx.workspace.removeMember(b.t.ownerUserId)],
    [
      'users.setPassword',
      'system',
      (tx) => tx.users.setPassword(b.t.ownerUserId, { passwordHash: 'x', mustChangePassword: false }),
    ],
    ['users.recordLoginSuccess', 'system', (tx) => tx.users.recordLoginSuccess(b.t.ownerUserId)],
    ['users.recordLoginFailure', 'system', (tx) => tx.users.recordLoginFailure(b.t.ownerUserId, {})],
    ['users.updateProfile', 'owner', (tx) => tx.users.updateProfile(b.t.ownerUserId, { displayName: 'x' })],
    [
      'authSessions.create',
      'system',
      (tx) =>
        tx.authSessions.create({ userId: b.t.ownerUserId, tokenHash: 'x', expiresAt: '2027-01-01T00:00:00.000Z' }),
    ],
    ['authSessions.touch', 'system', (tx) => tx.authSessions.touch(b.authSession)],
    ['authSessions.revoke', 'system', (tx) => tx.authSessions.revoke(b.authSession)],
    ['authSessions.revokeAllForUser', 'system', (tx) => tx.authSessions.revokeAllForUser(b.t.ownerUserId)],
    [
      'secrets.create',
      'owner',
      (tx) =>
        tx.secrets.create({
          kind: 'integration_token',
          label: 'x',
          ciphertext: Buffer.from([1]),
          nonce: Buffer.from([1]),
          wrappedDek: Buffer.from([1]),
          dekNonce: Buffer.from([1]),
          kekId: 'k',
          fingerprint: 'x',
          rotatedFromId: b.secret,
        }),
    ],
    ['secrets.revoke', 'owner', (tx) => tx.secrets.revoke(b.secret)],
    ['secrets.markUsed', 'system', (tx) => tx.secrets.markUsed(b.secret)],
    ['roles.update', 'owner', (tx) => tx.roles.update(b.role.id, { name: 'x' })],
    ['roles.setLifecycle', 'owner', (tx) => tx.roles.setLifecycle(b.role.id, 'born')],
    ['roles.setRuntimeState', 'system', (tx) => tx.roles.setRuntimeState(b.role.id, 'sleeping')],
    ['roles.touchActive', 'system', (tx) => tx.roles.touchActive(b.role.id)],
    ['roles.softDelete', 'owner', (tx) => tx.roles.softDelete(b.role.id)],
    [
      'changeSets.propose',
      'owner',
      (tx) =>
        tx.changeSets.propose({
          scope: 'role',
          roleId: b.role.id,
          title: 'x',
          items: [
            {
              target: 'instruction',
              op: 'create',
              layer: 'style',
              ordinal: 1,
              name: 'x',
              content: 'x',
              tokenCount: 1,
              tokenizer: 't',
              source: 'owner',
            },
          ],
        }),
    ],
    [
      'changeSets.propose#instructionId',
      'owner',
      (tx) =>
        tx.changeSets.propose({
          scope: 'role',
          roleId: roleA.id,
          title: 'x',
          items: [
            {
              target: 'instruction',
              op: 'update',
              instructionId: b.instruction,
              baseVersion: 1,
              patch: { content: 'x' },
              tokenCount: 1,
            },
          ],
        }),
    ],
    [
      'changeSets.propose#sourceSession',
      'owner',
      (tx) =>
        tx.changeSets.propose({
          scope: 'role',
          roleId: roleA.id,
          title: 'x',
          source: { sessionId: b.session },
          items: [
            {
              target: 'instruction',
              op: 'create',
              layer: 'style',
              ordinal: 1,
              name: 'x',
              content: 'x',
              tokenCount: 1,
              tokenizer: 't',
              source: 'owner',
            },
          ],
        }),
    ],
    ['changeSets.apply', 'owner', (tx) => tx.changeSets.apply(b.changeSet)],
    ['changeSets.reject', 'owner', (tx) => tx.changeSets.reject(b.changeSet)],
    [
      'engines.createAccount',
      'owner',
      (tx) =>
        tx.engines.createAccount({
          engineSlug: f.coreEngine,
          label: 'x',
          authMethod: 'subscription',
          authVolume: 'ga-auth-x',
          consentId: b.consent,
        }),
    ],
    [
      'engines.createAccount#secret',
      'owner',
      (tx) =>
        tx.engines.createAccount({ engineSlug: f.coreEngine, label: 'x', authMethod: 'api_key', secretId: b.secret }),
    ],
    ['engines.updateAccount', 'owner', (tx) => tx.engines.updateAccount(b.t.coreAccount?.id as string, { label: 'x' })],
    ['engines.beginLogin', 'owner', (tx) => tx.engines.beginLogin(b.t.coreAccount?.id as string)],
    [
      'engines.recordLoginResult',
      'system',
      (tx) => tx.engines.recordLoginResult(b.t.coreAccount?.id as string, { loginStatus: 'expired' }),
    ],
    [
      'engines.recordQuota',
      'system',
      (tx) => tx.engines.recordQuota(b.t.coreAccount?.id as string, { quotaState: 'ok' }),
    ],
    ['engines.recordOutage', 'system', (tx) => tx.engines.recordOutage(b.t.coreAccount?.id as string, null)],
    [
      'engines.createBinding',
      'owner',
      (tx) =>
        tx.engines.createBinding({
          consumerKind: 'system',
          engineAccountId: b.t.coreAccount?.id as string,
          priority: 2,
        }),
    ],
    [
      'engines.createBinding#role',
      'owner',
      (tx) =>
        tx.engines.createBinding({ consumerKind: 'role', roleId: b.role.id, engineAccountId: accA(), priority: 1 }),
    ],
    ['engines.updateBinding', 'owner', (tx) => tx.engines.updateBinding(b.binding, { priority: 3 })],
    ['engines.recordSelection', 'system', (tx) => tx.engines.recordSelection(b.binding, 'valid')],
    ['engines.removeBinding', 'owner', (tx) => tx.engines.removeBinding(b.binding)],
    [
      'engines.startProbe',
      'system',
      (tx) =>
        tx.engines.startProbe({ engineAccountId: b.t.coreAccount?.id as string, trigger: 'manual', authMode: 'oauth' }),
    ],
    [
      'engines.startProbe#container',
      'system',
      (tx) =>
        tx.engines.startProbe({
          engineAccountId: accA(),
          trigger: 'manual',
          authMode: 'oauth',
          containerId: b.t.systemContainerId,
        }),
    ],
    ['engines.finishProbe', 'system', (tx) => tx.engines.finishProbe(b.probe, { status: 'ok' })],
    [
      'engines.upsertCapabilities',
      'system',
      (tx) =>
        tx.engines.upsertCapabilities({ engineAccountId: accA(), probeRunId: b.probe, authMode: 'oauth', items: [] }),
    ],
    [
      'engines.ensureContainer',
      'owner',
      (tx) =>
        tx.engines.ensureContainer({ kind: 'role', roleId: b.role.id, containerName: 'x', desiredState: 'sleeping' }),
    ],
    [
      'engines.updateContainer',
      'owner',
      (tx) => tx.engines.updateContainer(b.t.systemContainerId as string, { desiredState: 'sleeping' }),
    ],
    [
      'engines.grantConsent',
      'owner',
      (tx) =>
        tx.engines.grantConsent({
          userId: b.t.ownerUserId,
          consentKind: 'engine_tos_risk',
          subject: f.coreEngine,
          noticeVersion: '1',
          noticeHash: 'h',
        }),
      ['permission.denied'],
    ],
    ['engines.revokeConsent', 'owner', (tx) => tx.engines.revokeConsent(b.consent)],
    ['sessions.start', 'system', (tx) => tx.sessions.start({ agentKind: 'role', trigger: 'chat', roleId: b.role.id })],
    [
      'sessions.start#task',
      'system',
      (tx) => tx.sessions.start({ agentKind: 'role', trigger: 'task', roleId: roleA.id, taskId: b.task }),
    ],
    [
      'sessions.start#thread',
      'system',
      (tx) => tx.sessions.start({ agentKind: 'role', trigger: 'chat', roleId: roleA.id, threadId: b.thread }),
    ],
    [
      'sessions.start#account',
      'system',
      (tx) => tx.sessions.start({ agentKind: 'system', trigger: 'probe', engineAccountId: b.t.coreAccount?.id }),
    ],
    ['sessions.setPhase', 'system', (tx) => tx.sessions.setPhase(b.session, 'acting')],
    ['sessions.finish', 'system', (tx) => tx.sessions.finish(b.session, { status: 'ok' })],
    ['chat.openThread', 'owner', (tx) => tx.chat.openThread({ kind: 'workspace', agent: 'role', roleId: b.role.id })],
    [
      'chat.openThread#bot',
      'owner',
      (tx) =>
        tx.chat.openThread({ kind: 'telegram', agent: 'role', roleId: roleA.id, telegramBotId: b.bot, tgChatId: 1 }),
    ],
    ['chat.updateThread', 'owner', (tx) => tx.chat.updateThread(b.thread, { title: 'x' })],
    [
      'chat.append',
      'owner',
      (tx) => tx.chat.append({ threadId: b.thread, authorKind: 'owner', channel: 'web', content: 'x' }),
    ],
    [
      'chat.append#reply',
      'owner',
      (tx) =>
        tx.chat.append({ threadId: threadA, authorKind: 'owner', channel: 'web', content: 'x', replyToId: b.message }),
    ],
    [
      'chat.append#session',
      'system',
      (tx) =>
        tx.chat.append({
          threadId: threadA,
          authorKind: 'system',
          channel: 'system',
          content: 'x',
          sessionId: b.session,
        }),
    ],
    ['chat.finalize', 'system', (tx) => tx.chat.finalize(b.message, { status: 'final' })],
    ['chat.redact', 'owner', (tx) => tx.chat.redact(b.message, 'x')],
    ['tasks.create', 'owner', (tx) => tx.tasks.create({ title: 'x', source: 'web', assigneeRoleId: b.role.id })],
    ['tasks.create#parent', 'owner', (tx) => tx.tasks.create({ title: 'x', source: 'web', parentTaskId: b.task })],
    ['tasks.create#position', 'owner', (tx) => tx.tasks.create({ title: 'x', source: 'web', positionId: b.position })],
    ['tasks.create#thread', 'owner', (tx) => tx.tasks.create({ title: 'x', source: 'web', threadId: b.thread })],
    ['tasks.update', 'owner', (tx) => tx.tasks.update(b.task, { title: 'x' })],
    ['tasks.update#assignee', 'owner', (tx) => tx.tasks.update(taskA, { assigneeRoleId: b.role.id })],
    ['tasks.transition', 'owner', (tx) => tx.tasks.transition(b.task, 'cancelled')],
    ['tasks.verify', 'owner', (tx) => tx.tasks.verify(b.task, 'verified')],
    [
      'tasks.recordFailureDisclosure',
      'owner',
      (tx) => tx.tasks.recordFailureDisclosure(b.task, { disclosure: 'owner_found' }),
    ],
    [
      'tasks.recordFailureDisclosure#audit',
      'owner',
      (tx) => tx.tasks.recordFailureDisclosure(taskA, { disclosure: 'owner_found', auditId: b.audit }),
    ],
    ['tasks.addUsage', 'system', (tx) => tx.tasks.addUsage(b.task, { tokens: 1, costMicroUsd: 1 })],
    ['tasks.softDelete', 'owner', (tx) => tx.tasks.softDelete(b.task)],
    ['jobs.heartbeat', 'system', (tx) => tx.jobs.heartbeat(b.job, 'w', 1000)],
    ['jobs.succeed', 'system', (tx) => tx.jobs.succeed(b.job, 'w')],
    ['jobs.fail', 'system', (tx) => tx.jobs.fail(b.job, 'w', { error: 'x' })],
    ['jobs.cancel', 'system', (tx) => tx.jobs.cancel(b.job)],
    ['wallet.openRoleWallet', 'owner', (tx) => tx.wallet.openRoleWallet(b.role.id)],
    [
      'wallet.post',
      'owner',
      (tx) =>
        tx.wallet.post({
          entryType: 'grant',
          debitWalletId: tx.wallet.treasury().id,
          creditWalletId: b.wallet,
          amountMinor: 1,
          reason: 'x',
        }),
    ],
    [
      'wallet.post#role',
      'owner',
      (tx) =>
        tx.wallet.post({
          entryType: 'grant',
          debitWalletId: tx.wallet.treasury().id,
          creditWalletId: tx.wallet.sink().id,
          amountMinor: 1,
          reason: 'x',
          roleId: b.role.id,
        }),
    ],
    [
      'wallet.post#evidence',
      'owner',
      (tx) =>
        tx.wallet.post({
          entryType: 'grant',
          debitWalletId: tx.wallet.treasury().id,
          creditWalletId: tx.wallet.sink().id,
          amountMinor: 1,
          reason: 'x',
          evidenceAuditId: b.audit,
        }),
    ],
    [
      'wallet.post#task',
      'owner',
      (tx) =>
        tx.wallet.post({
          entryType: 'grant',
          debitWalletId: tx.wallet.treasury().id,
          creditWalletId: tx.wallet.sink().id,
          amountMinor: 1,
          reason: 'x',
          taskId: b.task,
        }),
    ],
    [
      'telegram.createBot',
      'owner',
      (tx) => tx.telegram.createBot({ roleId: b.role.id, botUsername: 'x', secretId: b.secret }),
    ],
    ['telegram.setBotStatus', 'owner', (tx) => tx.telegram.setBotStatus(b.bot, 'paused')],
    ['telegram.recordGetMe', 'system', (tx) => tx.telegram.recordGetMe(b.bot, { ok: true, botTgId: 1 })],
    ['telegram.advanceOffset', 'system', (tx) => tx.telegram.advanceOffset(b.bot, 1)],
    ['telegram.recordPollError', 'system', (tx) => tx.telegram.recordPollError(b.bot, 'x')],
    ['telegram.softDeleteBot', 'owner', (tx) => tx.telegram.softDeleteBot(b.bot)],
    ['telegram.restoreBot', 'owner', (tx) => tx.telegram.restoreBot(b.bot)],
    ['telegram.captureOwner', 'owner', (tx) => tx.telegram.captureOwner(b.bot, { tgUserId: 9, displayName: 'x' })],
    [
      'telegram.addAllowed',
      'owner',
      (tx) => tx.telegram.addAllowed(b.bot, { tgUserId: 9, displayName: 'x', addedVia: 'manual' }),
    ],
    ['telegram.removeAllowed', 'owner', (tx) => tx.telegram.removeAllowed(b.allow)],
    ['telegram.setProactivePolicy', 'owner', (tx) => tx.telegram.setProactivePolicy(b.role.id, { maxPerDay: 1 })],
    ['telegram.reserveSend', 'system', send(() => ({ roleId: b.role.id }))],
    ['telegram.reserveSend#policy', 'system', send(() => ({ policyId: b.policy }))],
    ['telegram.reserveSend#task', 'system', send(() => ({ taskId: b.task }))],
    ['telegram.reserveSend#polarisAudit', 'system', send(() => ({ polaris: { ...polaris, auditId: b.audit } }))],
    ['telegram.reserveSend#polarisSession', 'system', send(() => ({ polaris: { ...polaris, sessionId: b.session } }))],
    [
      'telegram.recordSuppressed',
      'system',
      (tx) =>
        tx.telegram.recordSuppressed({
          roleId: b.role.id,
          triggerKind: 'task_done',
          urgency: 'normal',
          channel: 'telegram',
          dayLocal: '2026-10-17',
          status: 'suppressed_cap',
        }),
    ],
    ['telegram.markSent', 'system', (tx) => tx.telegram.markSent(b.send)],
    ['telegram.markFailed', 'system', (tx) => tx.telegram.markFailed(b.send, 'x')],
    ['tools.setToolStatus', 'owner', (tx) => tx.tools.setToolStatus(b.tool, 'disabled')],
    ['tools.grant', 'owner', (tx) => tx.tools.grant({ toolId: b.tool, roleId: roleA.id, mode: 'allow' })],
    [
      'tools.grant#role',
      'owner',
      (tx) => tx.tools.grant({ toolId: tx.tools.list()[0]?.id as string, roleId: b.role.id, mode: 'allow' }),
    ],
    ['tools.revokeGrant', 'owner', (tx) => tx.tools.revokeGrant(b.grant)],
    [
      'tools.addEgressRule',
      'owner',
      (tx) => tx.tools.addEgressRule({ domainPattern: 'x.example', appliesTo: 'role', roleId: b.role.id }),
    ],
    ['tools.updateEgressRule', 'owner', (tx) => tx.tools.updateEgressRule(b.egress, { note: 'x' })],
    ['tools.removeEgressRule', 'owner', (tx) => tx.tools.removeEgressRule(b.egress)],
    ['audit.append', 'owner', (tx) => tx.audit.append({ action: 'test.cross', roleId: b.role.id })],
    ['audit.append#session', 'owner', (tx) => tx.audit.append({ action: 'test.cross', sessionId: b.session })],
    ['audit.append#task', 'owner', (tx) => tx.audit.append({ action: 'test.cross', taskId: b.task })],
    ['avatar.assignLibrary', 'owner', (tx) => tx.avatar.assignLibrary(roleA.id, b.skin)],
    [
      'avatar.assignLibrary#role',
      'owner',
      (tx) => tx.avatar.assignLibrary(b.role.id, tx.avatar.library()[0]?.skin_asset_id as string),
    ],
    [
      'avatar.assignUpload',
      'owner',
      (tx) =>
        tx.avatar.assignUpload(b.role.id, { blobId: b.message, mime: 'image/png', sizeBytes: 1, width: 1, height: 1 }),
    ],
    ['avatar.assignMonogram', 'owner', (tx) => tx.avatar.assignMonogram(b.role.id)],
    ['avatar.restore', 'owner', (tx) => tx.avatar.restore(roleA.id, b.avatar)],
    ['avatar.setSkinEnabled', 'owner', (tx) => tx.avatar.setSkinEnabled(b.skin, false)],
  ];
}

const DEFAULT_EXPECT = ['repo.not_found', 'repo.invalid_ref'];

describe('chống IDOR chéo tenant — mọi hàm ghi', () => {
  it('độ phủ: mọi hàm của tx.<họ> là đọc, có ca chéo tenant, hoặc NO_REF có lý do', () => {
    const covered = new Set(cases().map(([n]) => n.split('#')[0] as string));
    const missing: string[] = [];
    f.store.write(f.ownerActorId, (tx) => {
      for (const fam of Object.keys(READS) as Fam[]) {
        const obj = tx[fam] as unknown as Record<string, unknown>;
        expect(obj, fam).toBeTypeOf('object');
        for (const m of Object.keys(obj)) {
          const name = `${fam}.${m}`;
          if (READS[fam].includes(m) || covered.has(name) || Object.hasOwn(NO_REF, name)) continue;
          missing.push(name);
        }
      }
    });
    expect(missing).toEqual([]);
    // không có họ nào ngoài danh sách READS
    const fams = f.store.write(f.ownerActorId, (tx) =>
      Object.keys(tx).filter(
        (k) => typeof (tx as unknown as Record<string, unknown>)[k] === 'object' && k !== 'actor' && k !== 'options',
      ),
    );
    expect(fams.sort()).toEqual(Object.keys(READS).sort());
  });

  it.each(cases().map((c) => [c[0], c] as const))('%s với id tenant B ⇒ bị từ chối', (_name, c) => {
    const [, who, call, expected] = c;
    const actor = who === 'owner' ? f.ownerActorId : f.systemActorId;
    let err: unknown = null;
    try {
      f.store.write(actor, (tx) => call(tx));
    } catch (e) {
      err = e;
    }
    expect(err, 'phải bị từ chối').toBeInstanceOf(DbRuleError);
    expect(expected ?? DEFAULT_EXPECT).toContain((err as DbRuleError).rule);
  });

  it('dữ liệu tenant B không đổi sau mọi lần thử', () => {
    f.store.read(b.t.workspaceId, (tx) => {
      expect(tx.roles.get(b.role.id)?.name).toBe('Role 1');
      expect(tx.roles.get(b.role.id)?.deleted_at).toBeNull();
      expect(tx.tasks.get(b.task)?.status).toBe('todo');
      expect(tx.telegram.bot(b.bot)?.status).toBe('pending');
      expect(tx.jobs.get(b.job)?.status).toBe('queued');
    });
  });
});
