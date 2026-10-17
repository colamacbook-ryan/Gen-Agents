// Handler DEMO (CHỈ TEST — không bao giờ vào PRODUCTION_HANDLERS): cài giả tối thiểu cho một route mỗi loại, để chứng minh
// meta-test (test/meta/) đỏ / xanh đúng. Route thật của lane thay thế bản demo cùng id (meta-test tự bỏ bản demo).
//   public  OPS-01 · V: SYS-81 (open), SYS-41 (Ref path), SYS-16 (Ref query), GW-05 (core, Ref trong union của query)
//   A: SYS-34 (Ref path + body), WRK-43 (Ref body, 202), WRK-24 (idempotent) · O: SYS-10 (GET), SYS-05 (DELETE 204, setup)
//   ownerWhen: OPS-03 (setting_writers, PATCH), WRK-05 (body asOwner)
import { formatDisplayId } from '@ga/contracts';
import { defineHandler, type Handler } from '../../src/http/define-handler.ts';

export const DEMO_ULID = '01JDEM0DEM0DEM0DEM0DEM0DEM';

/** Bộ đếm "bút toán" của WRK-24 demo — phát lại idempotent PHẢI trả đúng kết quả cũ (không tăng). */
export const demoLedger = { seq: 0 };

export const DEMO_HANDLERS: readonly Handler[] = [
  defineHandler('OPS-01', () => ({
    status: 'ok',
    version: '0.0.0-test',
    components: { db: 'ok', supervisor: 'ok', updater: 'ok' },
  })),
  defineHandler('SYS-81', () => []),
  defineHandler('SYS-41', ({ params }, ctx) => {
    ctx.ref('RL', params.roleRef);
    return [];
  }),
  defineHandler('SYS-16', ({ query }, ctx) => {
    if (query.roleRef !== undefined) ctx.ref('RL', query.roleRef);
    return { items: [], nextCursor: null };
  }),
  defineHandler('GW-05', ({ query }, ctx) => {
    if (query.consumer !== undefined && query.consumer !== 'system') ctx.ref('RL', query.consumer);
    return [];
  }),
  defineHandler('SYS-34', ({ params }, ctx) => {
    const role = ctx.ref('RL', params.roleRef);
    return { role: { id: role.id, displayId: role.displayId } };
  }),
  defineHandler('WRK-43', ({ body }, ctx) => {
    if (body.roleRef !== undefined) ctx.ref('RL', body.roleRef);
    return { job: { jobDisplayId: 'JB-0001', state: 'queued' } };
  }),
  defineHandler('WRK-24', ({ params, body }, ctx) => {
    ctx.ref('RL', params.roleRef);
    demoLedger.seq++;
    return {
      entry: { id: DEMO_ULID, displayId: formatDisplayId('LG', demoLedger.seq) },
      balanceAfterMinor: body.amountMinor * demoLedger.seq,
      revived: false,
      rankAfter: null,
    };
  }),
  defineHandler('SYS-10', () => []),
  defineHandler('SYS-05', () => undefined),
  defineHandler('OPS-03', ({ params, body }) => ({
    key: params.settingKey,
    displayId: null,
    value: body.value,
    default: { kind: 'absent' },
    overridden: true,
    writers: ['owner', 'admin'],
    writable: true,
    locked: null,
  })),
  defineHandler('WRK-05', () => ({ allowlist: { id: DEMO_ULID, displayId: 'AL-0001' }, ownerChange: null })),
];
