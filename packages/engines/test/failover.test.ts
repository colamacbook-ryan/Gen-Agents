import { TURN_OUTCOMES, type TurnOutcome } from '@ga/contracts';
import { describe, expect, it } from 'vitest';
import {
  decideFailover,
  FAILOVER_REASONS,
  type FailoverCandidate,
  type FailoverInput,
  failoverReasonFor,
  isRunnable,
  pickStartBinding,
} from '../src/index.ts';

// Chính sách fallback (PS §8.4 — nguồn duy nhất; INT-05, INT-20; BUILD-PLAN §B.5 bước 7; ma trận extra/failover-matrix).
// Loại CLI dùng slug trung tính (type-a/b/c): chính sách không phụ thuộc tên CLI.

function b(
  over: Partial<FailoverCandidate> & { bindingId: string; engineSlug: string; priority: number },
): FailoverCandidate {
  return {
    engineAccountId: `acc-${over.bindingId}`,
    enabled: true,
    loginStatus: 'logged_in',
    quotaState: 'ok',
    installState: 'installed',
    adapterAvailable: true,
    ...over,
  };
}

const A = b({ bindingId: 'eb-a', engineSlug: 'type-a', priority: 1 });
const B = b({ bindingId: 'eb-b', engineSlug: 'type-b', priority: 2 });
const C = b({ bindingId: 'eb-c', engineSlug: 'type-c', priority: 3 });

function role(outcome: TurnOutcome, bindings: FailoverCandidate[], extra: Partial<FailoverInput> = {}): FailoverInput {
  const current = bindings[0] ?? A;
  return { consumer: 'role', outcome, current, bindings, attemptedBindingIds: [current.bindingId], ...extra };
}

const FAILOVER_OUTCOMES: TurnOutcome[] = [
  'login_expired',
  'AUTH_REQUIRED',
  'outage',
  'quota_exhausted',
  'account_suspended',
];

describe('lý do fallback', () => {
  it('bốn lý do = enum events.failover_reason; AUTH_REQUIRED ⇒ login_expired; ok / transient ⇒ không phải lý do', () => {
    expect([...FAILOVER_REASONS].sort()).toEqual(['account_suspended', 'login_expired', 'outage', 'quota_exhausted']);
    expect(failoverReasonFor('ok')).toBeNull();
    expect(failoverReasonFor('transient')).toBeNull();
    expect(failoverReasonFor('AUTH_REQUIRED')).toBe('login_expired');
    for (const r of FAILOVER_REASONS) expect(failoverReasonFor(r)).toBe(r);
    for (const o of TURN_OUTCOMES) expect(() => failoverReasonFor(o)).not.toThrow();
  });
});

describe('Core agent KHÔNG fallback dưới mọi hình thức (INT-20)', () => {
  it('mọi kết quả lỗi ⇒ recovery (O4), kể cả khi có binding loại khác chạy được', () => {
    for (const outcome of FAILOVER_OUTCOMES) {
      const d = decideFailover({
        consumer: 'core_agent',
        outcome,
        current: A,
        bindings: [A, B, C],
        attemptedBindingIds: [],
      });
      expect(d.action, outcome).toBe('recovery');
      expect(d).not.toHaveProperty('to');
    }
  });
  it('ok ⇒ none; transient ⇒ không phải lý do (không vào O4 vì lỗi tạm)', () => {
    expect(
      decideFailover({ consumer: 'core_agent', outcome: 'ok', current: A, bindings: [A, B], attemptedBindingIds: [] }),
    ).toEqual({
      action: 'none',
    });
    expect(
      decideFailover({
        consumer: 'core_agent',
        outcome: 'transient',
        current: A,
        bindings: [A, B],
        attemptedBindingIds: [],
      }),
    ).toEqual({ action: 'not_failover_reason' });
  });
  it('kể cả đang đăng nhập lại: vẫn recovery, không fallback', () => {
    const cur = { ...A, loginStatus: 'in_progress' as const };
    const d = decideFailover({
      consumer: 'core_agent',
      outcome: 'outage',
      current: cur,
      bindings: [cur, B],
      attemptedBindingIds: [],
    });
    expect(d.action).toBe('recovery');
  });
});

describe('Role: ma trận 4 lý do × (1 loại / ≥ 2 loại) × in_progress', () => {
  for (const outcome of FAILOVER_OUTCOMES) {
    const reason = failoverReasonFor(outcome);
    it(`${outcome}: ≥ 2 loại ⇒ sang loại ưu tiên kế tiếp`, () => {
      const d = decideFailover(role(outcome, [A, B, C]));
      expect(d).toMatchObject({ action: 'failover', reason, to: { bindingId: 'eb-b' } });
      if (d.action === 'failover') expect(d.severity).toBe(reason === 'account_suspended' ? 'danger' : 'warn');
    });
    it(`${outcome}: chỉ 1 loại ⇒ chờ (single_cli), không fallback`, () => {
      expect(decideFailover(role(outcome, [A]))).toEqual({ action: 'wait', reason, why: 'single_cli' });
    });
    it(`${outcome}: tài khoản đang đăng nhập lại ⇒ chờ (login_in_progress), không fallback`, () => {
      const cur = { ...A, loginStatus: 'in_progress' as const };
      expect(decideFailover(role(outcome, [cur, B]))).toEqual({ action: 'wait', reason, why: 'login_in_progress' });
    });
  }
  it('account_suspended vẫn fallback, kèm cảnh báo đỏ (Q-R8c)', () => {
    expect(decideFailover(role('account_suspended', [A, B]))).toMatchObject({ action: 'failover', severity: 'danger' });
  });
  it('ok ⇒ none; transient ⇒ không phải lý do fallback', () => {
    expect(decideFailover(role('ok', [A, B]))).toEqual({ action: 'none' });
    expect(decideFailover(role('transient', [A, B]))).toEqual({ action: 'not_failover_reason' });
  });
});

describe('Role: chọn đích fallback (mỗi điều kiện tự chặn được một mình)', () => {
  const blockers: Array<[string, Partial<FailoverCandidate>]> = [
    ['binding tắt', { enabled: false }],
    ['CLI chưa cài', { installState: 'not_installed' }],
    ['CLI đang cài', { installState: 'installing' }],
    ['CLI cài lỗi', { installState: 'failed' }],
    ['adapter chưa có / coming_soon', { adapterAvailable: false }],
    ['tài khoản hết hạn', { loginStatus: 'expired' }],
    ['tài khoản bị khoá', { loginStatus: 'suspended' }],
    ['tài khoản lỗi kiểm', { loginStatus: 'error' }],
    ['tài khoản đang đăng nhập lại', { loginStatus: 'in_progress' }],
    ['hết quota', { quotaState: 'exhausted' }],
  ];
  for (const [name, over] of blockers) {
    it(`${name} ⇒ bỏ qua, sang ưu tiên kế tiếp; nếu là đích duy nhất ⇒ chờ no_eligible_cli`, () => {
      const blocked = { ...B, ...over };
      expect(decideFailover(role('outage', [A, blocked, C]))).toMatchObject({
        action: 'failover',
        to: { bindingId: 'eb-c' },
      });
      const twoTypes = decideFailover(role('outage', [A, blocked]));
      if (over.enabled === false) {
        // Binding tắt không tính là một loại CLI của Role ⇒ coi như chỉ 1 loại.
        expect(twoTypes).toEqual({ action: 'wait', reason: 'outage', why: 'single_cli' });
      } else {
        expect(twoTypes).toEqual({ action: 'wait', reason: 'outage', why: 'no_eligible_cli' });
      }
    });
  }
  it('trạng thái login unknown / quota low vẫn là đích hợp lệ (không đoán là hỏng)', () => {
    for (const over of [
      { loginStatus: 'unknown' as const },
      { quotaState: 'low' as const },
      { quotaState: 'unknown' as const },
    ]) {
      expect(decideFailover(role('quota_exhausted', [A, { ...B, ...over }]))).toMatchObject({ action: 'failover' });
    }
  });
  it('không fallback trong cùng một loại CLI (kể cả có binding thứ hai cùng loại)', () => {
    const sameType = b({ bindingId: 'eb-a2', engineSlug: 'type-a', priority: 2 });
    expect(decideFailover(role('quota_exhausted', [A, sameType]))).toEqual({
      action: 'wait',
      reason: 'quota_exhausted',
      why: 'single_cli',
    });
    expect(decideFailover(role('quota_exhausted', [A, sameType, C]))).toMatchObject({ to: { bindingId: 'eb-c' } });
  });
  it('theo thứ tự ưu tiên của Role, không theo thứ tự mảng; hoà ưu tiên ⇒ theo bindingId (tất định)', () => {
    const lowFirst = [C, A, B];
    expect(decideFailover(role('outage', lowFirst, { current: A, attemptedBindingIds: ['eb-a'] }))).toMatchObject({
      to: { bindingId: 'eb-b' },
    });
    const tieX = b({ bindingId: 'eb-x', engineSlug: 'type-x', priority: 2 });
    expect(decideFailover(role('outage', [A, tieX, B]))).toMatchObject({ to: { bindingId: 'eb-b' } });
  });
  it('chuỗi fallback dừng khi hết loại, không lặp vòng', () => {
    const tried = ['eb-a'];
    let current = A;
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      const d = decideFailover({
        consumer: 'role',
        outcome: 'outage',
        current,
        bindings: [A, B, C],
        attemptedBindingIds: tried,
      });
      if (d.action !== 'failover') {
        expect(d).toEqual({ action: 'wait', reason: 'outage', why: 'no_eligible_cli' });
        break;
      }
      seen.push(d.to.bindingId);
      tried.push(d.to.bindingId);
      current = d.to;
    }
    expect(seen).toEqual(['eb-b', 'eb-c']);
  });
  it('current không cần nằm trong danh sách bindings; đã thử thì không quay lại', () => {
    expect(decideFailover(role('outage', [B, C], { current: A, attemptedBindingIds: [] }))).toMatchObject({
      to: { bindingId: 'eb-b' },
    });
    expect(
      decideFailover(role('outage', [A, B, C], { current: B, attemptedBindingIds: ['eb-a', 'eb-b'] })),
    ).toMatchObject({ to: { bindingId: 'eb-c' } });
  });
});

describe('binding bắt đầu lượt ("quay về ưu tiên 1")', () => {
  it('chọn ưu tiên cao nhất chạy được; ưu tiên 1 hồi lại thì quay về; không có ⇒ null', () => {
    expect(pickStartBinding([C, B, A])?.bindingId).toBe('eb-a');
    expect(pickStartBinding([{ ...A, quotaState: 'exhausted' }, B])?.bindingId).toBe('eb-b');
    expect(
      pickStartBinding([
        { ...A, enabled: false },
        { ...B, installState: 'failed' },
      ]),
    ).toBeNull();
    expect(isRunnable(A)).toBe(true);
  });
});
