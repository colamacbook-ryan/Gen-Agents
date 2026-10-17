import { describe, expect, it } from 'vitest';
import {
  GRID_KEYS,
  GRID_MIN_AUTH,
  ROUTES,
  routeById,
  SSE_EVENT_AUDIENCE,
  SSE_EVENT_TYPES,
  type SseEventTypeName,
  sseEventAllows,
} from '../../src/index.ts';

// Review bảo mật PR #7 (M7): mỗi loại sự kiện SSE có đối tượng nhận khai tường minh — không mặc định.

describe('SSE_EVENT_AUDIENCE: quét đủ 26 loại', () => {
  it('đúng 26 khoá = SSE_EVENT_TYPES, giá trị hợp lệ', () => {
    expect(SSE_EVENT_TYPES.length).toBe(26);
    expect(Object.keys(SSE_EVENT_AUDIENCE).sort()).toEqual([...SSE_EVENT_TYPES].sort());
    for (const t of SSE_EVENT_TYPES) expect(['V', 'A', 'O', 'recipient'], t).toContain(SSE_EVENT_AUDIENCE[t]);
  });

  it('các ghim bắt buộc: notification = recipient, telegram.capture = A, credential.blocked / pty.closed = O', () => {
    expect(SSE_EVENT_AUDIENCE.notification).toBe('recipient');
    expect(SSE_EVENT_AUDIENCE['telegram.capture']).toBe('A');
    expect(SSE_EVENT_AUDIENCE['credential.blocked']).toBe('O');
    expect(SSE_EVENT_AUDIENCE['pty.closed']).toBe('O');
    for (const t of ['chat.delta', 'chat.tool', 'chat.message', 'chat.turn', 'ui.action', 'log.line'] as const)
      expect(SSE_EVENT_AUDIENCE[t], t).toBe('A');
  });

  it('sự kiện mang PII / credential / nội dung hội thoại KHÔNG bao giờ ở mức V', () => {
    const sensitive: SseEventTypeName[] = [
      'telegram.capture',
      'credential.blocked',
      'pty.closed',
      'chat.delta',
      'chat.message',
      'engine.failover',
      'log.line',
    ];
    for (const t of sensitive) expect(SSE_EVENT_AUDIENCE[t], t).not.toBe('V');
  });
});

describe('sseEventAllows (fail-closed)', () => {
  const v = { auth: 'V', isRecipient: false } as const;
  const a = { auth: 'A', isRecipient: false } as const;
  const o = { auth: 'O', isRecipient: false } as const;

  it('theo bậc quyền; owner nhận mọi loại V / A / O nhưng KHÔNG nhận thông báo của người khác', () => {
    expect(sseEventAllows({ type: 'role.state' }, v)).toBe(true);
    expect(sseEventAllows({ type: 'chat.delta' }, v)).toBe(false);
    expect(sseEventAllows({ type: 'chat.delta' }, a)).toBe(true);
    expect(sseEventAllows({ type: 'credential.blocked' }, a)).toBe(false);
    expect(sseEventAllows({ type: 'credential.blocked' }, o)).toBe(true);
    expect(sseEventAllows({ type: 'notification' }, o)).toBe(false);
    expect(sseEventAllows({ type: 'notification' }, { auth: 'V', isRecipient: true })).toBe(true);
  });

  it('access_level lạ (auth = null) ⇒ không nhận gì, kể cả resync', () => {
    for (const t of SSE_EVENT_TYPES)
      expect(sseEventAllows({ type: t }, { auth: null, isRecipient: true }), t).toBe(false);
  });

  it('grid.changed chịu GRID_MIN_AUTH của lưới; thiếu lưới ⇒ từ chối', () => {
    for (const g of GRID_KEYS) {
      expect(sseEventAllows({ type: 'grid.changed', grid: g }, v), g).toBe(GRID_MIN_AUTH[g] === 'V');
      expect(sseEventAllows({ type: 'grid.changed', grid: g }, o), g).toBe(true);
    }
    expect(Object.values(GRID_MIN_AUTH)).toContain('A');
    expect(sseEventAllows({ type: 'grid.changed' }, o)).toBe(false);
  });
});

describe('scope: self (nghĩa vụ #7)', () => {
  it('đúng SYS-83 và SYS-84; không route nào khác tự nhận self; mặc định workspace', () => {
    expect(
      ROUTES.filter((r) => r.scope === 'self')
        .map((r) => r.id)
        .sort(),
    ).toEqual(['SYS-83', 'SYS-84']);
    expect(routeById('SYS-85')?.scope).toBe('workspace');
  });

  it('route self không có tham số chọn người dùng khác (userRef / userId / memberRef)', () => {
    for (const r of ROUTES.filter((x) => x.scope === 'self')) {
      for (const part of [r.request.params, r.request.query, r.request.body]) {
        const text = part ? JSON.stringify(Object.keys((part as { shape?: object }).shape ?? {})) : '';
        expect(text, r.id).not.toMatch(/user|member/i);
      }
    }
  });
});
