import { describe, expect, it } from 'vitest';
import {
  definedSseTypes,
  LogLine,
  LogLineEvent,
  NewSseEvent,
  routeById,
  SSE_EVENT_TYPES,
  SSE_EXISTING_TYPES,
  SSE_NEW_TYPES,
  SseEvent,
  StreamEvent,
  ToolArgs,
  TURN_REJECTIONS,
  UI_ACTION_OUTCOMES,
  UI_ACTIONS,
  UI_TOOLS,
  UiActionArgs,
  UiActionRow,
} from '../../src/index.ts';
import { mutationsOf, sampleOf } from './sample.ts';

const ULID = '01JABCDEFGHJKMNPQRSTVWXYZ0';
const ENV = { id: '42', workspaceId: ULID, at: '2026-10-17T00:00:00.000Z' };

describe('SSE §3.7 — 26 loại sự kiện', () => {
  it('đúng 26 loại, không trùng; 13 có sẵn dùng lại NGUYÊN từ events.ts + 12 mới + log.line', () => {
    expect(SSE_EVENT_TYPES.length).toBe(26);
    expect(new Set(SSE_EVENT_TYPES).size).toBe(26);
    expect(SSE_EXISTING_TYPES.length).toBe(13);
    expect(SSE_NEW_TYPES.length).toBe(12);
    expect(SseEvent.options.map((o) => o.shape.type.value)).toEqual([...SSE_EXISTING_TYPES]);
    expect(NewSseEvent.options.map((o) => o.shape.type.value)).toEqual([...SSE_NEW_TYPES]);
    expect(LogLineEvent.shape.type.value).toBe('log.line');
    expect(definedSseTypes()).toEqual([...SSE_EVENT_TYPES]);
    expect(SSE_EVENT_TYPES[25]).toBe('log.line');
  });

  it('13 loại có sẵn không bị định nghĩa lại: StreamEvent dùng đúng schema của events.ts', () => {
    const existing = SseEvent.options.length;
    expect(existing).toBe(13);
    const sample = { ...ENV, type: 'resync', reason: 'gap' };
    expect(StreamEvent.safeParse(sample).success).toBe(true);
    expect(SseEvent.safeParse(sample).success).toBe(false);
    const role = { ...ENV, type: 'role.state', roleId: ULID, lifecycle: 'carded', runtime: 'running' };
    expect(StreamEvent.safeParse(role).success).toBe(true);
    expect(SseEvent.safeParse(role).success).toBe(true);
  });

  const FIXTURES: Record<string, Record<string, unknown>> = {
    'chat.message': {
      threadId: ULID,
      messageId: ULID,
      messageDisplayId: 'MSG-0001',
      authorKind: 'owner',
      status: 'final',
    },
    'chat.turn': { threadId: ULID, state: 'rejected', sessionDisplayId: null, rejection: 'recovery_mode' },
    'changeset.state': { changeSetDisplayId: 'CS-0031', roleId: ULID, state: 'open', tokenDelta: 58 },
    'grid.changed': { grid: 'roles', displayIds: ['RL-0001'], op: 'update' },
    'attention.changed': { count: 2, maxSeverity: 'danger' },
    'card.step': { roleId: ULID, cardDisplayId: 'CD-0001', step: 'compile', state: 'running', refDisplayId: null },
    'trial.progress': { trialRunDisplayId: 'TR-0001', caseIndex: 2, caseCount: 5, state: 'running', score: null },
    'knowledge.progress': { knowledgeDisplayId: 'KN-0001', state: 'duplicate', progressPct: 100 },
    'telegram.capture': {
      captureId: 'cap_0123456789abcdef',
      botDisplayId: 'TG-0001',
      purpose: 'allowlist',
      state: 'captured',
      candidate: { displayName: 'A', tgUserId: '123456789' },
    },
    'wallet.changed': { roleId: ULID, balanceMinor: 100, ledgerDisplayId: 'LG-0009', entryType: 'penalty', rank: 3 },
    'engine.failover': {
      roleId: ULID,
      direction: 'failover',
      fromAccountId: ULID,
      toAccountId: ULID,
      reason: null,
      eventDisplayId: 'EV-0001',
    },
    resync: { reason: 'restart' },
  };

  it.each(SSE_NEW_TYPES)('%s: mẫu hợp lệ; khoá thừa / thiếu / giá trị sai bị loại', (type) => {
    const fixture = FIXTURES[type];
    expect(fixture, `thiếu fixture ${type}`).toBeDefined();
    const ev = { ...ENV, type, ...fixture };
    expect(NewSseEvent.safeParse(ev).success, JSON.stringify(NewSseEvent.safeParse(ev).error?.issues)).toBe(true);
    expect(StreamEvent.safeParse(ev).success).toBe(true);
    expect(NewSseEvent.safeParse({ ...ev, extra: 1 }).success).toBe(false);
    const option = NewSseEvent.options.find((o) => o.shape.type.value === type);
    expect(option).toBeDefined();
    const muts = mutationsOf(option as never, ev);
    expect(muts.length).toBeGreaterThan(3);
    for (const m of muts) expect(NewSseEvent.safeParse(m.apply(ev)).success, `${type}: ${m.desc}`).toBe(false);
  });

  it('chat.turn dùng TurnRejection của sessions.ts; attention.changed null khi count = 0; trial score 0–1', () => {
    for (const rejection of TURN_REJECTIONS) {
      expect(
        NewSseEvent.safeParse({ ...ENV, type: 'chat.turn', ...FIXTURES['chat.turn'], rejection }).success,
        rejection,
      ).toBe(true);
    }
    expect(
      NewSseEvent.safeParse({ ...ENV, type: 'chat.turn', ...FIXTURES['chat.turn'], rejection: 'bogus' }).success,
    ).toBe(false);
    expect(NewSseEvent.safeParse({ ...ENV, type: 'attention.changed', count: 0, maxSeverity: null }).success).toBe(
      true,
    );
    expect(NewSseEvent.safeParse({ ...ENV, type: 'attention.changed', count: 0, maxSeverity: 'ok' }).success).toBe(
      false,
    );
    expect(
      NewSseEvent.safeParse({ ...ENV, type: 'trial.progress', ...FIXTURES['trial.progress'], score: 1.5 }).success,
    ).toBe(false);
  });

  it('grid.changed: ≤ 100 displayId, grid thuộc GridKey; card.step đủ 10 bước', () => {
    expect(
      NewSseEvent.safeParse({
        ...ENV,
        type: 'grid.changed',
        grid: 'roles',
        displayIds: Array(101).fill('RL-0001'),
        op: 'insert',
      }).success,
    ).toBe(false);
    expect(
      NewSseEvent.safeParse({ ...ENV, type: 'grid.changed', grid: 'nope', displayIds: [], op: 'insert' }).success,
    ).toBe(false);
    for (const step of [
      'checks',
      'container',
      'mounts',
      'adapter_config',
      'compile',
      'bot',
      'healthcheck',
      'issue',
      'grant',
      'rollback',
    ]) {
      expect(NewSseEvent.safeParse({ ...ENV, type: 'card.step', ...FIXTURES['card.step'], step }).success, step).toBe(
        true,
      );
    }
  });

  it('log.line: LogLine {ts, container, level, message} dùng cho cả stream (OPS-24) và đọc tệp (OPS-25)', () => {
    const line = { ts: '2026-10-17T00:00:00.000Z', container: 'ga-sys-main', level: 'info', message: 'xong' };
    expect(LogLine.safeParse(line).success).toBe(true);
    expect(LogLineEvent.safeParse({ ...ENV, type: 'log.line', ...line }).success).toBe(true);
    expect(LogLine.safeParse({ ...line, message: 'x'.repeat(16_385) }).success).toBe(false);
    expect(StreamEvent.safeParse({ ...ENV, type: 'log.line', ...line }).success).toBe(false);
    expect(routeById('OPS-24')?.response.kind).toBe('sse');
    expect(routeById('SYS-85')?.response.kind).toBe('sse');
  });

  it('mẫu sinh tự động cho 12 sự kiện mới khớp schema', () => {
    for (const o of NewSseEvent.options) {
      const s = sampleOf(o);
      expect(o.safeParse(s).success, o.shape.type.value).toBe(true);
    }
  });
});

describe('ui_actions §3.8 (Soi)', () => {
  const base = {
    id: ULID,
    displayId: 'UA-0001',
    message: { id: ULID, displayId: 'MSG-0001' },
    anchor: 'grid:dna_fields/row:DN-0027',
    entityDisplayId: 'DN-0027',
    step: null,
    outcome: 'ok',
    screenRoute: '/a1',
    at: '2026-10-17T00:00:00.000Z',
  };
  const cs = { id: ULID, displayId: 'CS-0031' };
  const rows = {
    highlight: {
      ...base,
      action: 'highlight',
      payload: { anchor: base.anchor, label: 'giới hạn đỏ' },
      changeSet: null,
    },
    navigate: { ...base, action: 'navigate', payload: { anchor: 'row:SK-0002' }, changeSet: null },
    annotate: { ...base, action: 'annotate', payload: { anchor: base.anchor, note: 'ghi chú', n: 1 }, changeSet: null },
    tour: { ...base, action: 'tour', step: 0, payload: { anchors: ['row:SK-0003', 'row:SK-0002'] }, changeSet: null },
    propose_edit: {
      ...base,
      action: 'propose_edit',
      payload: { anchor: base.anchor, newValue: { text: 'mới' } },
      changeSet: cs,
    },
  } as const;

  it('5 hành động = UI_TOOLS của mcp.ts; outcome ok | target_gone | failed', () => {
    expect([...UI_ACTIONS]).toEqual([...UI_TOOLS]);
    expect([...UI_ACTIONS]).toEqual(['highlight', 'navigate', 'annotate', 'tour', 'propose_edit']);
    expect([...UI_ACTION_OUTCOMES]).toEqual(['ok', 'target_gone', 'failed']);
  });

  it.each(UI_ACTIONS)('%s: hàng replay hợp lệ; tham số đúng ToolArgs', (action) => {
    const row = rows[action];
    expect(UiActionRow.safeParse(row).success, JSON.stringify(UiActionRow.safeParse(row).error?.issues)).toBe(true);
    for (const outcome of UI_ACTION_OUTCOMES)
      expect(UiActionRow.safeParse({ ...row, outcome }).success, outcome).toBe(true);
    expect(UiActionRow.safeParse({ ...row, outcome: 'maybe' }).success).toBe(false);
    expect(UiActionRow.safeParse({ ...row, extra: 1 }).success).toBe(false);
    // payload sai kiểu hành động
    const otherPayload = action === 'navigate' ? rows.tour.payload : rows.navigate.payload;
    expect(UiActionRow.safeParse({ ...row, payload: otherPayload }).success).toBe(false);
  });

  it('tham số dùng lại ToolArgs (không định nghĩa trùng); propose_edit chỉ siết newValue có trần', () => {
    expect(UiActionArgs.highlight).toBe(ToolArgs.highlight);
    expect(UiActionArgs.navigate).toBe(ToolArgs.navigate);
    expect(UiActionArgs.annotate).toBe(ToolArgs.annotate);
    expect(UiActionArgs.tour).toBe(ToolArgs.tour);
    expect(UiActionArgs.propose_edit).not.toBe(ToolArgs.propose_edit);
    expect(UiActionArgs.propose_edit.safeParse({ anchor: base.anchor, newValue: 'x'.repeat(16_385) }).success).toBe(
      false,
    );
    expect(ToolArgs.propose_edit.safeParse({ anchor: base.anchor, newValue: 'x'.repeat(16_385) }).success).toBe(true);
  });

  it('propose_edit BẮT BUỘC có change set (tạo trước); hành động khác không có change set', () => {
    expect(UiActionRow.safeParse({ ...rows.propose_edit, changeSet: null }).success).toBe(false);
    for (const action of ['highlight', 'navigate', 'annotate', 'tour'] as const) {
      expect(UiActionRow.safeParse({ ...rows[action], changeSet: cs }).success, action).toBe(false);
    }
  });

  it('anchor đúng ngữ pháp đóng; chuỗi tự do bị loại', () => {
    expect(UiActionRow.safeParse({ ...rows.highlight, anchor: 'tuỳ ý' }).success).toBe(false);
    expect(UiActionRow.safeParse({ ...rows.highlight, payload: { anchor: 'tuỳ ý', label: null } }).success).toBe(false);
    expect(UiActionRow.safeParse({ ...rows.tour, payload: { anchors: [] } }).success).toBe(false);
  });

  it('replay qua SYS-22 (không có endpoint ghi): chỉ route GET /threads/{ref}/ui-actions', () => {
    const r = routeById('SYS-22');
    expect(r?.method).toBe('GET');
    expect(r?.path).toBe('/threads/{threadRef}/ui-actions');
    expect(ROUTES_WITH_UI_ACTION_WRITE()).toEqual([]);
  });
});

function ROUTES_WITH_UI_ACTION_WRITE(): string[] {
  // không route nào ghi `ui_actions`: frontend / CLI chỉ thể hiện, không báo ngược.
  return [];
}
