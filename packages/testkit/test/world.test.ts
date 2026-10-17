import { SYSTEM_WORKSPACE_ID } from '@ga/contracts';
import { hashSessionToken, readSessionCookie, verifyCsrfToken } from '@ga/security';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MEMBER_ROLES, makeWorld, TENANT_KEYS, type TestWorld } from '../src/index.ts';

let w: TestWorld;
beforeAll(() => {
  w = makeWorld();
});
afterAll(() => w.close());

describe('makeWorld — 2 tenant × owner/admin/operator/viewer + phiên thật', () => {
  it('hai workspace khác nhau, mỗi tenant đủ 4 mức với membership đúng trong DB', () => {
    expect(w.tenants.A.workspaceId).not.toBe(w.tenants.B.workspaceId);
    for (const t of TENANT_KEYS) {
      const tenant = w.tenants[t];
      const members = w.store.read(tenant.workspaceId, (tx) => tx.workspace.members());
      for (const role of MEMBER_ROLES) {
        const u = tenant.users[role];
        expect(u.who).toBe(`${t}.${role}`);
        const m = members.find((x) => x.user_id === u.userId);
        expect(m?.access_level).toBe(role);
        expect(m?.removed_at).toBeNull();
        const actor = w.store.read(tenant.workspaceId, (tx) => tx.workspace.actor(u.actorId));
        expect(actor?.workspace_id).toBe(tenant.workspaceId);
        expect(actor?.user_id).toBe(u.userId);
      }
    }
  });

  it('không user nào thuộc hai tenant (MVP)', () => {
    const a = new Set(Object.values(w.tenants.A.users).map((u) => u.userId));
    for (const u of Object.values(w.tenants.B.users)) expect(a.has(u.userId)).toBe(false);
  });

  it('phiên: DB chỉ giữ token_hash; cookie đọc lại được; CSRF đúng khoá và gắn đúng phiên', () => {
    const owner = w.user('A.owner');
    const viewer = w.user('B.viewer');
    expect(readSessionCookie(owner.cookie, { secure: false })).toBe(owner.token);
    expect(hashSessionToken(owner.token)).toBe(owner.tokenHash);
    const row = w.store.read(SYSTEM_WORKSPACE_ID, (tx) => tx.authSessions.byTokenHash(owner.tokenHash));
    expect(row?.user_id).toBe(owner.userId);
    expect(JSON.stringify(row)).not.toContain(owner.token);
    expect(verifyCsrfToken(w.csrfKey, owner.tokenHash, owner.csrf)).toBe(true);
    expect(verifyCsrfToken(w.csrfKey, viewer.tokenHash, owner.csrf)).toBe(false);
  });

  it('newSession cấp phiên mới khác phiên cũ; setMustChangePassword bật / tắt cờ', () => {
    const u = w.user('A.admin');
    const s = w.newSession(u.userId);
    expect(s.token).not.toBe(u.token);
    w.setMustChangePassword('A.admin', true);
    expect(w.store.read(w.tenants.A.workspaceId, (tx) => tx.users.get(u.userId))?.must_change_password).toBe(1);
    w.setMustChangePassword('A.admin', false);
    expect(w.store.read(w.tenants.A.workspaceId, (tx) => tx.users.get(u.userId))?.must_change_password).toBe(0);
  });

  it('hai world độc lập (DB riêng, username không trùng)', () => {
    const w2 = makeWorld();
    try {
      expect(w2.fx.writer.db.name).not.toBe(w.fx.writer.db.name);
      expect(w2.user('A.viewer').username).not.toBe(w.user('A.viewer').username);
    } finally {
      w2.close();
    }
  });
});
