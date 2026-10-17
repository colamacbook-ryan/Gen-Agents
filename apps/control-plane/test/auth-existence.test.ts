// Không có oracle "tài khoản có tồn tại không" ở đăng nhập (task 3 của L-SYS): user lạ / bị vô hiệu nhận ĐÚNG chuỗi phản hồi
// như user thật sai mật khẩu — cùng mã, cùng retryAfterS khi bị khoá — và MỌI nhánh tốn đúng một lần băm (kể cả nhánh đang khoá).
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Clock, SYSTEM_WORKSPACE_ID } from '@ga/contracts';
import { type AppConnection, migrate, openWriter, SQLITE_MIGRATIONS_DIR } from '@ga/db';
import { deriveSubkey, passwordHasherRuns } from '@ga/security';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthService, firstPasswordFile, type LoginResult, SqliteAuthStore } from '../src/auth/index.ts';

class FakeClock implements Clock {
  private t = Date.parse('2026-10-17T08:00:00.000Z');
  now(): Date {
    return new Date(this.t);
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

const SYS_ACTOR = '0000000000000000000000SYS1';

interface Env {
  dir: string;
  conn: AppConnection;
  clock: FakeClock;
  service: AuthService;
  first: string;
}

async function setup(): Promise<Env> {
  const dir = mkdtempSync(join(tmpdir(), 'ga-auth-exist-'));
  const clock = new FakeClock();
  const conn = openWriter(join(dir, 'gen.sqlite'), { clock });
  migrate(conn, { dir: SQLITE_MIGRATIONS_DIR, appVersion: '0.0.0' });
  // DB v2.3.5: workspace / actor system đầu tiên chỉ tạo trong conn.bootstrap của chính workspace đó
  conn.bootstrap({ workspaceId: SYSTEM_WORKSPACE_ID, systemActorId: SYS_ACTOR }, (w) => {
    w.run(
      "INSERT INTO workspaces (id, kind, slug, name, short_code) VALUES (?, 'system', 'system', 'System', 'SYS0')",
      [SYSTEM_WORKSPACE_ID],
    );
    w.run(
      "INSERT INTO actors (id, workspace_id, kind, system_key, label) VALUES (?, ?, 'system', 'system', 'System')",
      [SYS_ACTOR, SYSTEM_WORKSPACE_ID],
    );
  });
  const firstPath = join(dir, 'first-password');
  const service = new AuthService({
    store: new SqliteAuthStore(conn),
    clock,
    csrfKey: deriveSubkey(Buffer.alloc(32, 9), 'csrf'),
    secureCookies: false,
    allowedOrigins: [],
    firstPassword: firstPasswordFile(firstPath),
  });
  await service.bootstrapOwner({ displayName: 'Chủ' });
  return { dir, conn, clock, service, first: readFileSync(firstPath, 'utf8').trim() };
}

/** Phần quan sát được từ ngoài (mã + retryAfterSeconds) + số lần băm của lượt đó. */
async function attempt(env: Env, username: string, password: string, ip: string) {
  const before = passwordHasherRuns();
  const r: LoginResult = await env.service.login({ username, password, ip, userAgent: null });
  const hashes = passwordHasherRuns() - before;
  if (r.ok) return { seen: 'ok', hashes };
  return { seen: `${r.code}:${'retryAfterSeconds' in r ? r.retryAfterSeconds : '-'}`, hashes };
}

describe('đăng nhập không lộ sự tồn tại của tài khoản', () => {
  let env: Env;
  beforeEach(async () => {
    env = await setup();
  });
  afterEach(() => {
    env.conn.close();
    rmSync(env.dir, { recursive: true, force: true });
  });

  it('user thật sai mật khẩu ≡ user lạ: cùng chuỗi mã / retryAfterS qua ngưỡng khoá; mọi lượt đúng 1 lần băm', async () => {
    const real: string[] = [];
    const ghost: string[] = [];
    for (let i = 1; i <= 7; i++) {
      const a = await attempt(env, 'admin', `sai-${i}`, `10.1.0.${i}`);
      const b = await attempt(env, 'khong-ton-tai', `sai-${i}`, `10.2.0.${i}`);
      real.push(a.seen);
      ghost.push(b.seen);
      expect([a.hashes, b.hashes]).toEqual([1, 1]);
    }
    expect(ghost).toEqual(real);
    // đã có ít nhất một lượt bị khoá (chính sách 4 lượt miễn phí) — chuỗi so sánh có ý nghĩa
    expect(real.some((s) => s.startsWith('locked:'))).toBe(true);
  });

  it('đang khoá: mật khẩu ĐÚNG của user thật ≡ user lạ (locked, cùng retryAfterS) và vẫn tốn đúng 1 lần băm', async () => {
    for (let i = 1; i <= 5; i++) {
      await attempt(env, 'admin', 'sai', `10.3.0.${i}`);
      await attempt(env, 'ghost-2', 'sai', `10.4.0.${i}`);
    }
    env.clock.advance(1_000);
    const a = await attempt(env, 'admin', env.first, '10.3.1.1');
    const b = await attempt(env, 'ghost-2', env.first, '10.4.1.1');
    expect(a.seen).toMatch(/^locked:\d+$/);
    expect(b.seen).toBe(a.seen);
    expect([a.hashes, b.hashes]).toEqual([1, 1]);
    // hết khoá: user thật vào được (khoá "ma" không đụng tới user thật)
    env.clock.advance(60 * 60_000);
    expect((await attempt(env, 'admin', env.first, '10.3.2.1')).seen).toBe('ok');
  });

  it('user bị vô hiệu ≡ user lạ (không được trả locked theo DB thật, không đăng nhập được)', async () => {
    env.conn.write(SYS_ACTOR, (w) =>
      w.run("UPDATE users SET disabled_at = '2026-10-17T07:00:00.000Z' WHERE username = 'admin'"),
    );
    const seq: Array<[string, string]> = [];
    for (let i = 1; i <= 6; i++) {
      const a = await attempt(env, 'admin', env.first, `10.5.0.${i}`);
      const b = await attempt(env, 'ghost-3', env.first, `10.6.0.${i}`);
      seq.push([a.seen, b.seen]);
      expect([a.hashes, b.hashes]).toEqual([1, 1]);
    }
    for (const [a, b] of seq) expect(a).toBe(b);
    expect(seq.every(([a]) => a !== 'ok')).toBe(true);
  });
});
