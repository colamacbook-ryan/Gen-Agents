// Ngữ cảnh của handler (`ctx`) — mọi quyền lực của handler đi qua đây, gắn chặt với actor của PHIÊN:
//   - `ctx.actor`: từ phiên (http/session.ts), không bao giờ từ request.
//   - `ctx.read(fn)` / `ctx.write(fn)`: qua DataStore, workspace / actor = của phiên; KHÔNG có tham số workspace / actor
//     (ghi bằng actor khác là không thể từ handler). `app_actor()` do conn.write gắn.
//   - `ctx.ref(prefix, value)`: rào IDOR (context/ref.ts) trong workspace của actor.
//   - `ctx.events.publish(event)`: workspace luôn = của actor (bus ghi đè phong bì).
// Route `public` không có actor: mọi lối trên ném lỗi (500) — fail-closed, không có "actor rỗng".
import type { Clock, EntityPrefix, Route, StreamEvent } from '@ga/contracts';
import type { AppConnection } from '@ga/db';
import type { DataStore, ReadTx, WriteTx } from '@ga/db/repos';
import type { EventBus, PublishOptions, StreamEventInput } from '../events/bus.ts';
import type { Logger } from '../http/logger.ts';
import type { Actor } from '../http/session.ts';
import { type RefOptions, type ResolvedRef, resolveRef } from './ref.ts';

export interface WriteCallOptions {
  /** Lý do (bắt buộc với thay đổi lõi / phạt / xoá — repo đòi ở từng hàm cần). */
  reason?: string;
}

export interface HandlerContext {
  readonly requestId: string;
  readonly route: Route;
  readonly actor: Actor;
  readonly clock: Clock;
  readonly logger: Logger;
  read<T>(fn: (tx: ReadTx) => T): T;
  write<T>(fn: (tx: WriteTx) => T, options?: WriteCallOptions): T;
  ref(prefix: EntityPrefix | readonly EntityPrefix[], value: string, opts?: RefOptions): ResolvedRef;
  readonly events: { publish(event: StreamEventInput, opts?: PublishOptions): StreamEvent };
}

export interface ContextDeps {
  store: DataStore;
  reader: AppConnection;
  clock: Clock;
  events: EventBus;
  logger: Logger;
}

export class PublicRouteContextError extends Error {
  constructor(what: string) {
    super(`route public không có actor — ctx.${what} không dùng được`);
    this.name = 'PublicRouteContextError';
  }
}

export function createHandlerContext(
  deps: ContextDeps,
  req: { requestId: string; route: Route; actor: Actor },
): HandlerContext {
  const actor: Actor = Object.freeze({ ...req.actor });
  const ws = actor.workspaceId;
  const ctx: HandlerContext = {
    requestId: req.requestId,
    route: req.route,
    actor,
    clock: deps.clock,
    logger: deps.logger,
    read: (fn) =>
      deps.store.read(ws, (tx) => {
        if (tx.workspaceId !== ws) throw new Error('ctx.read: workspace của giao dịch lệch workspace của phiên');
        return fn(tx);
      }),
    write: (fn, options = {}) =>
      deps.store.write(
        actor.id,
        (tx) => {
          if (tx.workspaceId !== ws || tx.actorId !== actor.id) {
            throw new Error('ctx.write: workspace / actor của giao dịch lệch phiên');
          }
          return fn(tx);
        },
        {
          channel: 'web',
          requestId: req.requestId,
          ...(options.reason !== undefined ? { reason: options.reason } : {}),
        },
      ),
    ref: (prefix, value, opts) => resolveRef(deps.reader, ws, prefix, value, opts),
    events: Object.freeze({
      publish: (event: StreamEventInput, opts?: PublishOptions) => deps.events.publish(ws, event, opts),
    }),
  };
  return Object.freeze(ctx);
}

/** Ngữ cảnh của route `public`: không actor, không DB, không bus. */
export function createPublicContext(
  deps: Pick<ContextDeps, 'clock' | 'logger'>,
  req: { requestId: string; route: Route },
): HandlerContext {
  const deny = (what: string) => () => {
    throw new PublicRouteContextError(what);
  };
  const ctx = {
    requestId: req.requestId,
    route: req.route,
    get actor(): Actor {
      throw new PublicRouteContextError('actor');
    },
    clock: deps.clock,
    logger: deps.logger,
    read: deny('read'),
    write: deny('write'),
    ref: deny('ref'),
    events: Object.freeze({ publish: deny('events.publish') }),
  } as HandlerContext;
  return Object.freeze(ctx);
}
