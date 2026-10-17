// Bootstrap bản cài: seed global → owner `admin` (mật khẩu lần đầu) → workspace tenant + membership owner. Owner đăng nhập
// được ngay, EXT-03 có workspace, mọi API khác chờ đổi mật khẩu. Chạy lại = không tạo thêm.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate, openReader, openWriter, SQLITE_MIGRATIONS_DIR } from '@ga/db';
import { masterKeyring } from '@ga/db/audit-writer';
import { ManualClock, referenceSeed } from '@ga/db/fixture';
import { createSqliteStore } from '@ga/db/sqlite';
import { deriveSubkey } from '@ga/security';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import { AuthService, firstPasswordFile, OWNER_USERNAME, SqliteAuthStore } from '../../src/auth/index.ts';
import { InMemoryEventBus } from '../../src/events/bus.ts';
import { resolveMembership } from '../../src/http/session.ts';
import { bootstrapInstall } from '../../src/onboarding/bootstrap.ts';
import { sysHandlers } from '../../src/onboarding/sys-handlers.ts';
import { createDbRecoveryProvider } from '../../src/recovery/provider.ts';
import { memoryLogger } from '../http/harness.ts';

const ORIGIN = 'http://localhost:7400';
let dir: string;
let cleanup: () => void;
let env: {
  store: ReturnType<typeof createSqliteStore>;
  auth: AuthService;
  authStore: SqliteAuthStore;
  reader: ReturnType<typeof openReader>;
  firstPath: string;
  app: ReturnType<typeof createApp>;
};

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'ga-boot-'));
  const clock = new ManualClock();
  const dbPath = join(dir, 'gen.sqlite');
  const writer = openWriter(dbPath, { clock });
  migrate(writer, { dir: SQLITE_MIGRATIONS_DIR, appVersion: '0.0.0' });
  const reader = openReader(dbPath, { clock });
  const store = createSqliteStore({ writer, reader, auditKeys: masterKeyring({ k1: randomBytes(32) }, 'k1') });
  const authStore = new SqliteAuthStore(writer);
  const firstPath = join(dir, 'first-password');
  const auth = new AuthService({
    store: authStore,
    clock,
    csrfKey: deriveSubkey(randomBytes(32), 'csrf'),
    secureCookies: false,
    allowedOrigins: [ORIGIN],
    firstPassword: firstPasswordFile(firstPath),
  });
  const app = createApp(
    {
      writer,
      reader,
      store,
      auth,
      clock,
      events: new InMemoryEventBus({ clock }),
      recovery: createDbRecoveryProvider({ store, reader }),
      logger: memoryLogger(),
      allowedOrigins: [ORIGIN],
    },
    sysHandlers,
  );
  env = { store, auth, authStore, reader, firstPath, app };
  cleanup = () => {
    reader.close();
    writer.close();
  };
});
afterAll(() => {
  cleanup();
  rmSync(dir, { recursive: true, force: true });
});

const boot = () =>
  bootstrapInstall({
    store: env.store,
    auth: env.auth,
    findUserId: (u) => env.authStore.findUserByUsername(u)?.id ?? null,
    ownerUsername: OWNER_USERNAME,
    seed: referenceSeed(),
  });

describe('bootstrapInstall', () => {
  it('lần đầu: owner + tenant + membership owner; lần hai: không tạo thêm', async () => {
    const first = await boot();
    expect(first.ownerCreated).toBe(true);
    expect(first.tenantCreated).toBe(true);
    const owner = env.authStore.findUserByUsername(OWNER_USERNAME);
    expect(owner).toBeDefined();
    const m = resolveMembership(env.reader, owner?.id as string);
    expect(m).toMatchObject({ ok: true, accessLevel: 'owner', workspaceId: first.workspaceId });
    const again = await boot();
    expect(again).toEqual({ ownerCreated: false, tenantCreated: false, workspaceId: first.workspaceId });
    expect(env.store.tenants()).toHaveLength(1);
  });

  it('owner đăng nhập bằng mật khẩu lần đầu qua /api/v1: bắt đổi mật khẩu, EXT-03 có workspace, SYS-06 ⇒ 403', async () => {
    const password = readFileSync(env.firstPath, 'utf8').trim();
    const login = await env.app.fetch(
      new Request(`${ORIGIN}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN },
        body: JSON.stringify({ username: OWNER_USERNAME, password }),
      }),
    );
    expect(login.status).toBe(200);
    const body = (await login.json()) as { mustChangePassword: boolean; user: { accessLevel: string } };
    expect(body).toMatchObject({ mustChangePassword: true, user: { accessLevel: 'owner' } });
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] as string;
    const me = await env.app.fetch(new Request(`${ORIGIN}/api/v1/auth/me`, { headers: { cookie } }));
    expect(me.status).toBe(200);
    expect(((await me.json()) as { onboardingDone: boolean }).onboardingDone).toBe(false);
    const other = await env.app.fetch(new Request(`${ORIGIN}/api/v1/onboarding/checklist`, { headers: { cookie } }));
    expect(other.status).toBe(403);
  });
});
