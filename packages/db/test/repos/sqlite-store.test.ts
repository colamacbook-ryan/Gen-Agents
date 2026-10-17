// Store SQLite thật: fixture dựng toàn bộ bằng repo (seed thật + Onboarding Core agent) qua mọi guard DB.
import { afterEach, describe, expect, it } from 'vitest';
import { verifyAuditChain } from '../../src/audit-writer/index.ts';
import { createFixture, type Fixture } from '../../src/repos/fixture/index.ts';

let fx: Fixture | null = null;
afterEach(() => {
  fx?.close();
  fx = null;
});

describe('fixture + store SQLite', () => {
  it('Core agent sẵn sàng; tạo Role; audit nối chuỗi HMAC sạch', () => {
    fx = createFixture({ roles: 1 });
    const f = fx;
    const status = f.store.read(f.workspaceId, (tx) => tx.engines.coreAgentStatus());
    expect(status?.is_ready).toBe(1);
    expect(f.roles[0]?.display_id).toBe('RL-0001');
    const report = verifyAuditChain(f.reader, f.auditKeys, f.workspaceId);
    expect(report.firstIssue).toBeNull();
    expect(report.checked).toBeGreaterThan(5);
  });
});
