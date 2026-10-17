// Thế giới test (CHỈ TEST): DataStore SQLite THẬT (@ga/db/fixture — migration vendor, mọi trigger, seed tham chiếu thật) với
// HAI tenant A và B, mỗi tenant 4 thành viên: owner, admin, operator, viewer — mỗi người một phiên đăng nhập thật trong
// `auth_sessions` (token ngẫu nhiên, DB chỉ giữ token_hash; CSRF = HMAC theo khoá dẫn xuất lúc chạy — không khoá literal).
//   - Tenant A = tenant của fixture (Core agent sẵn sàng); tenant B thêm bằng `addTenant` (Core agent sẵn sàng).
//   - `operator` có trong DB nhưng hợp đồng chưa định nghĩa ⇒ edge phải từ chối (accessLevelToAuth fail-closed).
//   - Đồng hồ: ManualClock của fixture — DÙNG CHUNG cho store, AuthService, bus (một nguồn giờ).
import { randomBytes } from 'node:crypto';
import { SYSTEM_WORKSPACE_ID, toDbTimestamp } from '@ga/contracts';
import { addTenant, createFixture, type Fixture, type ManualClock, type TenantHandle } from '@ga/db/fixture';
import type { DataStore } from '@ga/db/repos';
import { csrfTokenFor, deriveSubkey, newSessionToken, SESSION, sessionCookieName } from '@ga/security';

export const TENANT_KEYS = ['A', 'B'] as const;
export type TenantKey = (typeof TENANT_KEYS)[number];
export const MEMBER_ROLES = ['owner', 'admin', 'operator', 'viewer'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];
export type Who = `${TenantKey}.${MemberRole}` | 'anon';

export interface TestSession {
  readonly sessionId: string;
  readonly token: string;
  readonly tokenHash: string;
  /** Giá trị header `Cookie` (tên cookie theo `secureCookies = false` của test). */
  readonly cookie: string;
  readonly csrf: string;
}

export interface TestUser extends TestSession {
  readonly who: Exclude<Who, 'anon'>;
  readonly tenant: TenantKey;
  readonly role: MemberRole;
  readonly userId: string;
  readonly actorId: string;
  readonly username: string;
}

export interface TestTenant {
  readonly key: TenantKey;
  readonly workspaceId: string;
  readonly systemActorId: string;
  readonly handle: TenantHandle;
  readonly users: Readonly<Record<MemberRole, TestUser>>;
}

export interface TestWorld {
  readonly fx: Fixture;
  readonly clock: ManualClock;
  readonly store: DataStore;
  readonly writer: Fixture['writer'];
  readonly reader: Fixture['reader'];
  /** Khoá CSRF dẫn xuất từ master key ngẫu nhiên của lần chạy (AuthService của test dùng đúng khoá này). */
  readonly csrfKey: Buffer;
  /** Origin GUI hợp lệ (AuthService.allowedOrigins). */
  readonly origin: string;
  readonly secureCookies: false;
  readonly tenants: Readonly<Record<TenantKey, TestTenant>>;
  user(who: Exclude<Who, 'anon'>): TestUser;
  /** Phiên MỚI cho một user (vd thử phiên của người khác / phiên thứ hai). */
  newSession(userId: string): TestSession;
  /** Bật / tắt cờ bắt đổi mật khẩu của user (cổng đổi mật khẩu). */
  setMustChangePassword(who: Exclude<Who, 'anon'>, on: boolean): void;
  close(): void;
}

export const TEST_ORIGIN = 'http://localhost:7400';

let worldSeq = 0;

export function makeWorld(): TestWorld {
  const fx = createFixture();
  const n = ++worldSeq;
  const csrfKey = deriveSubkey(randomBytes(32), 'csrf');
  const sysActor = fx.store.systemActorId(SYSTEM_WORKSPACE_ID);

  const newSession = (userId: string): TestSession => {
    const { token, tokenHash } = newSessionToken();
    const expiresAt = toDbTimestamp(new Date(fx.clock.now().getTime() + SESSION.absoluteTtlSeconds * 1000));
    const row = fx.store.write(sysActor, (tx) => tx.authSessions.create({ userId, tokenHash, expiresAt }));
    return {
      sessionId: row.id,
      token,
      tokenHash,
      cookie: `${sessionCookieName(false)}=${token}`,
      csrf: csrfTokenFor(csrfKey, tokenHash),
    };
  };

  const buildTenant = (key: TenantKey, handle: TenantHandle, ownerUsername: string): TestTenant => {
    const users = {} as Record<MemberRole, TestUser>;
    users.owner = {
      who: `${key}.owner`,
      tenant: key,
      role: 'owner',
      userId: handle.ownerUserId,
      actorId: handle.ownerActorId,
      username: ownerUsername,
      ...newSession(handle.ownerUserId),
    };
    for (const role of ['admin', 'operator', 'viewer'] as const) {
      const username = `w${n}-${key.toLowerCase()}-${role}`;
      const u = fx.store.createUser({
        username,
        displayName: `${key} ${role}`,
        passwordHash: 'argon2id$testkit',
        mustChangePassword: false,
      });
      const { actor } = fx.store.write(
        handle.ownerActorId,
        (tx) => tx.workspace.addMember({ userId: u.id, accessLevel: role }),
        { channel: 'web' },
      );
      users[role] = {
        who: `${key}.${role}`,
        tenant: key,
        role,
        userId: u.id,
        actorId: actor.id,
        username,
        ...newSession(u.id),
      };
    }
    return Object.freeze({
      key,
      workspaceId: handle.workspaceId,
      systemActorId: handle.systemActorId,
      handle,
      users: Object.freeze(users),
    });
  };

  try {
    const a = buildTenant('A', fx, 'owner');
    const bHandle = addTenant(fx, { slug: `tenant-b-${n}`, shortCode: 'B7Q2', username: `w${n}-b-owner` });
    const b = buildTenant('B', bHandle, `w${n}-b-owner`);
    const tenants = Object.freeze({ A: a, B: b });
    const user = (who: Exclude<Who, 'anon'>): TestUser => {
      const [t, r] = who.split('.') as [TenantKey, MemberRole];
      return tenants[t].users[r];
    };
    return Object.freeze({
      fx,
      clock: fx.clock,
      store: fx.store,
      writer: fx.writer,
      reader: fx.reader,
      csrfKey,
      origin: TEST_ORIGIN,
      secureCookies: false as const,
      tenants,
      user,
      newSession,
      setMustChangePassword: (who: Exclude<Who, 'anon'>, on: boolean) => {
        const u = user(who);
        fx.store.write(sysActor, (tx) =>
          tx.users.setPassword(u.userId, { passwordHash: 'argon2id$testkit', mustChangePassword: on }),
        );
      },
      close: () => fx.close(),
    });
  } catch (e) {
    fx.close();
    throw e;
  }
}
