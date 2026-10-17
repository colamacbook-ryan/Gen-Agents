// DataStore trên SQLite: một kết nối ghi (conn.write / bootstrap) + một kết nối chỉ đọc (snapshot nhất quán mỗi read).
// Mọi lỗi SQLite ra ngoài thành DbRuleError (rule ổn định + code contracts) — không nuốt, giao dịch rollback toàn bộ.
import type { ActorSystemKey, SeedReference } from '@ga/contracts';
import type { AuditKeyring } from '../../audit-writer/index.ts';
import { type AppConnection, systemActorId as connSystemActorId, type StatementRunner } from '../../connection.ts';
import { type IdGenerator, ulidGenerator } from '../../ids/index.ts';
import { seedIdFor } from '../../seed/ids.ts';
import { applyGlobalSeed, applyWorkspaceSeed, type SeedApplyResult } from '../../seed/reference.ts';
import { createInstallUser, createTenantWorkspace } from '../../seed/tenant.ts';
import { DbRuleError, notFound, withDbErrors } from '../errors.ts';
import type { CreatedTenant, CreateTenantInput, CreateUserInput, DataStore, ReadTx, WriteTx } from '../store.ts';
import type { ActorRow, WorkspaceRow, WriteOptions } from '../types.ts';
import { auditRepo } from './audit.ts';
import { avatarRepo } from './avatar.ts';
import type { Ctx, TxOptions } from './ctx.ts';
import { nowTs } from './ctx.ts';
import { engineRepo } from './engines.ts';
import { changeSetRepo, dnaReads, instructionReads, revisionReads, roleRepo } from './roles.ts';
import { chatRepo, sessionRepo } from './sessions.ts';
import { telegramRepo } from './telegram.ts';
import { walletRepo } from './wallet.ts';
import { jobRepo, taskRepo } from './work.ts';
import { authSessionRepo, secretRepo, settingsRepo, userRepo, workspaceRepo } from './workspace.ts';

export interface SqliteStoreOptions {
  /** Kết nối ghi duy nhất (openWriter). */
  writer: AppConnection;
  /** Kết nối chỉ đọc (openReader); mặc định dùng writer cho đọc (test / công cụ). */
  reader?: AppConnection;
  /** Khoá HMAC audit (master key ⇒ HKDF theo workspace). */
  auditKeys: AuditKeyring;
  /** Bộ sinh id; mặc định ULID theo đồng hồ của writer. */
  newId?: IdGenerator;
}

function runnerOf(conn: AppConnection): StatementRunner {
  const prep = (q: Parameters<StatementRunner['run']>[0], params?: readonly unknown[]) => {
    if (typeof q !== 'string') throw new TypeError('runner đọc chỉ nhận SQL chuỗi');
    return { stmt: conn.db.prepare(q), params: (params ?? []) as unknown[] };
  };
  return {
    run: (q, params) => {
      const { stmt, params: p } = prep(q, params);
      return stmt.run(...p);
    },
    get: <R>(q: Parameters<StatementRunner['get']>[0], params?: readonly unknown[]) => {
      const { stmt, params: p } = prep(q, params);
      return stmt.get(...p) as R | undefined;
    },
    all: <R>(q: Parameters<StatementRunner['all']>[0], params?: readonly unknown[]) => {
      const { stmt, params: p } = prep(q, params);
      return stmt.all(...p) as R[];
    },
  };
}

export function createSqliteStore(opts: SqliteStoreOptions): DataStore {
  const writer = opts.writer;
  const reader = opts.reader ?? opts.writer;
  const clock = writer.clock;
  const newId = opts.newId ?? ulidGenerator(clock);
  const auditDeps = { keyring: opts.auditKeys };
  if (writer.role === 'reader') throw new DbRuleError('repo.invalid_input', 'writer phải là kết nối ghi');

  function build(ctx: Ctx): WriteTx {
    return {
      workspaceId: ctx.ws,
      now: () => nowTs(ctx),
      actorId: ctx.actor?.id as string,
      actor: ctx.actor as ActorRow,
      options: ctx.options,
      workspace: workspaceRepo(ctx),
      users: userRepo(ctx),
      authSessions: authSessionRepo(ctx),
      settings: settingsRepo(ctx),
      secrets: secretRepo(ctx),
      roles: roleRepo(ctx),
      dna: dnaReads(ctx),
      instructions: instructionReads(ctx),
      revisions: revisionReads(ctx),
      changeSets: changeSetRepo(ctx),
      engines: engineRepo(ctx),
      sessions: sessionRepo(ctx),
      chat: chatRepo(ctx),
      tasks: taskRepo(ctx),
      jobs: jobRepo(ctx),
      wallet: walletRepo(ctx),
      telegram: telegramRepo(ctx),
      audit: auditRepo(ctx),
      avatar: avatarRepo(ctx),
    };
  }

  const txOptions = (o: WriteOptions): TxOptions => ({
    ...o,
    channel: o.channel ?? 'system',
    requestId: o.requestId ?? newId(),
  });

  const store: DataStore = {
    clock,
    read<T>(workspaceId: string, fn: (tx: ReadTx) => T): T {
      return withDbErrors(() => {
        const r = runnerOf(reader);
        const run = () => {
          if (r.get('SELECT 1 AS ok FROM workspaces WHERE id = ?', [workspaceId]) === undefined) {
            throw notFound(`workspace ${workspaceId}`);
          }
          const out = fn(
            build({ ws: workspaceId, r, w: null, actor: null, clock, newId, options: txOptions({}), auditDeps }),
          );
          if (out instanceof Promise) throw new DbRuleError('repo.invalid_input', 'store.read chỉ nhận hàm đồng bộ');
          return out;
        };
        // snapshot nhất quán: một giao dịch đọc (DEFERRED) trên kết nối đọc; đang trong giao dịch ghi ⇒ chạy thẳng
        return reader.db.inTransaction ? run() : reader.db.transaction(run).deferred();
      });
    },
    write<T>(actorId: string, fn: (tx: WriteTx) => T, options: WriteOptions = {}): T {
      return withDbErrors(() =>
        writer.write(actorId, (w) => {
          const actor = w.get<ActorRow>('SELECT * FROM actors WHERE id = ? AND purged_at IS NULL', [actorId]);
          if (actor === undefined)
            throw new DbRuleError('repo.unknown_actor', `actor ${actorId} không tồn tại / đã purge`);
          return fn(
            build({ ws: actor.workspace_id, r: w, w, actor, clock, newId, options: txOptions(options), auditDeps }),
          );
        }),
      );
    },
    systemActorId: (workspaceId, key: ActorSystemKey = 'system') =>
      withDbErrors(() => {
        try {
          return connSystemActorId(reader, workspaceId, key);
        } catch (e) {
          throw new DbRuleError('repo.not_found', `actor system '${key}' của workspace ${workspaceId}`, { cause: e });
        }
      }),
    installGlobal: (seed: SeedReference): SeedApplyResult => withDbErrors(() => applyGlobalSeed(writer, seed)),
    createUser: (i: CreateUserInput) =>
      withDbErrors(() =>
        createInstallUser(writer, {
          userId: newId(),
          username: i.username,
          displayName: i.displayName,
          passwordHash: i.passwordHash,
          mustChangePassword: i.mustChangePassword,
          email: i.email,
          locale: i.locale,
          timezone: i.timezone,
        }),
      ),
    createTenant: (i: CreateTenantInput, seed: SeedReference): CreatedTenant =>
      withDbErrors(() => {
        const workspaceId = newId();
        const actorIds: Record<string, string> = {};
        for (const t of seed.perWorkspace) {
          if (t.table !== 'actors') continue;
          for (const r of t.rows) if (typeof r.system_key === 'string') actorIds[r.system_key] = newId();
        }
        if (actorIds.system === undefined)
          throw new DbRuleError('repo.invalid_input', 'seed thiếu actor system của tenant');
        const out = createTenantWorkspace(writer, seed, {
          workspaceId,
          slug: i.slug,
          name: i.name,
          shortCode: i.shortCode,
          locale: i.locale,
          timezone: i.timezone,
          actorIds: actorIds as Record<string, string> & { system: string },
          owner: { userId: i.ownerUserId, actorId: newId() },
        });
        return {
          workspace: out.workspace,
          systemActorId: actorIds.system,
          ownerActorId: out.ownerActorId,
          seed: out.seed,
        };
      }),
    ensureWorkspaceSeed: (workspaceId: string, seed: SeedReference) =>
      withDbErrors(() => {
        const actors = reader.db
          .prepare("SELECT id, system_key FROM actors WHERE workspace_id = ? AND kind = 'system' AND purged_at IS NULL")
          .all(workspaceId) as { id: string; system_key: string }[];
        const actorIds: Record<string, string> = {};
        for (const a of actors) actorIds[a.system_key] = a.id;
        if (actorIds.system === undefined) throw notFound(`actor system của workspace ${workspaceId}`);
        for (const t of seed.perWorkspace) {
          if (t.table !== 'actors') continue;
          for (const r of t.rows) {
            if (typeof r.system_key === 'string' && actorIds[r.system_key] === undefined)
              actorIds[r.system_key] = newId();
          }
        }
        return applyWorkspaceSeed(writer, seed, {
          workspaceId,
          actorIds: actorIds as Record<string, string> & { system: string },
          idFor: seedIdFor(workspaceId),
        });
      }),
    tenants: () =>
      withDbErrors(
        () =>
          reader.db
            .prepare("SELECT * FROM workspaces WHERE kind = 'tenant' ORDER BY created_at, id")
            .all() as WorkspaceRow[],
      ),
  };
  return store;
}
