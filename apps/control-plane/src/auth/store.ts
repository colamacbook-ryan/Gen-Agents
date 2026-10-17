// Kho dữ liệu đăng nhập owner (bảng `users`, `auth_sessions` — DATABASE §5; BUILD-PLAN §B.4 `auth/`).
// Cổng (interface) để AuthService không phụ thuộc DB cụ thể + bản SQLite qua hợp đồng kết nối ⑥-05:
//   - mọi ghi đi qua `conn.write(actorId, fn)`; actor = actor system của WORKSPACE HỆ THỐNG (đăng nhập xảy ra trước khi có
//     workspace tenant — Onboarding bước 1 mới tạo); seed tham chiếu (CNS-170) tạo actor này lúc cài;
//   - DB chỉ giữ `password_hash` (argon2id PHC) và `token_hash` (SHA-256) — không bao giờ mật khẩu / token thô;
//   - thời điểm theo đồng hồ inject được (toDbTimestamp), không theo DEFAULT của SQLite.
import { type Clock, formatDisplayId, SYSTEM_WORKSPACE_ID, toDbTimestamp } from '@ga/contracts';
import { type AppConnection, systemActorId } from '@ga/db';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  mustChangePassword: boolean;
  failedLoginCount: number;
  lockedUntil: string | null;
  disabledAt: string | null;
}

export interface AuthSessionRow {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
}

export interface AuthStore {
  countUsers(): number;
  createOwner(input: { id: string; username: string; displayName: string; passwordHash: string; at: Date }): void;
  findUserByUsername(username: string): AuthUser | undefined;
  findUserById(id: string): AuthUser | undefined;
  /** Tăng đếm sai NGUYÊN TỬ (UPDATE … +1 RETURNING) rồi đặt khoá tạm theo `lockSeconds(đếm mới)`. */
  registerFailedLogin(
    userId: string,
    at: Date,
    lockSeconds: (count: number) => number,
  ): { failedLoginCount: number; lockedUntil: string | null };
  registerSuccessfulLogin(userId: string, at: Date): void;
  setPasswordHash(userId: string, passwordHash: string, opts: { mustChange: boolean; at: Date }): void;
  createSession(row: {
    id: string;
    userId: string;
    tokenHash: string;
    at: Date;
    expiresAt: Date;
    ip: string | null;
    userAgent: string | null;
  }): void;
  findSessionByTokenHash(tokenHash: string): AuthSessionRow | undefined;
  touchSession(id: string, at: Date): void;
  revokeSession(id: string, at: Date): void;
  /** Thu hồi mọi phiên còn hiệu lực của user (đổi mật khẩu). Trả số phiên đã thu hồi. */
  revokeUserSessions(userId: string, at: Date): number;
}

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  must_change_password: number;
  failed_login_count: number;
  locked_until: string | null;
  disabled_at: string | null;
}

const USER_COLS =
  'id, username, display_name, password_hash, must_change_password, failed_login_count, locked_until, disabled_at';

const toUser = (r: UserRow | undefined): AuthUser | undefined =>
  r && {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    passwordHash: r.password_hash,
    mustChangePassword: r.must_change_password === 1,
    failedLoginCount: r.failed_login_count,
    lockedUntil: r.locked_until,
    disabledAt: r.disabled_at,
  };

/** Bản SQLite. `actorId` mặc định = actor system của workspace hệ thống (tra một lần, lười). */
export class SqliteAuthStore implements AuthStore {
  private readonly conn: AppConnection;
  private actor: string | null;

  constructor(conn: AppConnection, opts: { actorId?: string } = {}) {
    this.conn = conn;
    this.actor = opts.actorId ?? null;
  }

  private actorId(): string {
    this.actor ??= systemActorId(this.conn, SYSTEM_WORKSPACE_ID);
    return this.actor;
  }

  countUsers(): number {
    return (this.conn.db.prepare('SELECT count(*) AS n FROM users').get() as { n: number }).n;
  }

  createOwner(input: { id: string; username: string; displayName: string; passwordHash: string; at: Date }): void {
    this.conn.write(this.actorId(), (w) => {
      const seq = (w.get<{ n: number }>('SELECT COALESCE(MAX(display_seq), 0) + 1 AS n FROM users') as { n: number }).n;
      w.run(
        `INSERT INTO users (id, display_id, display_seq, username, display_name, password_hash, must_change_password,
           created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          input.id,
          formatDisplayId('US', seq),
          seq,
          input.username,
          input.displayName,
          input.passwordHash,
          toDbTimestamp(input.at),
        ],
      );
    });
  }

  findUserByUsername(username: string): AuthUser | undefined {
    return toUser(
      this.conn.db.prepare(`SELECT ${USER_COLS} FROM users WHERE username = ?`).get(username) as UserRow | undefined,
    );
  }

  findUserById(id: string): AuthUser | undefined {
    return toUser(this.conn.db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).get(id) as UserRow | undefined);
  }

  registerFailedLogin(
    userId: string,
    at: Date,
    lockSeconds: (count: number) => number,
  ): { failedLoginCount: number; lockedUntil: string | null } {
    return this.conn.write(this.actorId(), (w) => {
      const r = w.get<{ n: number }>(
        'UPDATE users SET failed_login_count = failed_login_count + 1, updated_at = ? WHERE id = ? RETURNING failed_login_count AS n',
        [toDbTimestamp(at), userId],
      );
      if (!r) throw new Error('registerFailedLogin: không có user');
      const secs = lockSeconds(r.n);
      const lockedUntil = secs > 0 ? toDbTimestamp(new Date(at.getTime() + secs * 1000)) : null;
      if (lockedUntil) w.run('UPDATE users SET locked_until = ? WHERE id = ?', [lockedUntil, userId]);
      return { failedLoginCount: r.n, lockedUntil };
    });
  }

  registerSuccessfulLogin(userId: string, at: Date): void {
    const ts = toDbTimestamp(at);
    this.conn.write(this.actorId(), (w) => {
      w.run(
        'UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?',
        [ts, ts, userId],
      );
    });
  }

  setPasswordHash(userId: string, passwordHash: string, opts: { mustChange: boolean; at: Date }): void {
    const ts = toDbTimestamp(opts.at);
    this.conn.write(this.actorId(), (w) => {
      w.run(
        `UPDATE users SET password_hash = ?, must_change_password = ?,
           password_changed_at = CASE WHEN ? = 0 THEN ? ELSE password_changed_at END, updated_at = ? WHERE id = ?`,
        [passwordHash, opts.mustChange ? 1 : 0, opts.mustChange ? 1 : 0, ts, ts, userId],
      );
    });
  }

  createSession(row: {
    id: string;
    userId: string;
    tokenHash: string;
    at: Date;
    expiresAt: Date;
    ip: string | null;
    userAgent: string | null;
  }): void {
    const ts = toDbTimestamp(row.at);
    this.conn.write(this.actorId(), (w) => {
      w.run(
        `INSERT INTO auth_sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at, ip, user_agent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.id, row.userId, row.tokenHash, ts, toDbTimestamp(row.expiresAt), ts, row.ip, row.userAgent],
      );
    });
  }

  findSessionByTokenHash(tokenHash: string): AuthSessionRow | undefined {
    const r = this.conn.db
      .prepare(
        `SELECT id, user_id, token_hash, created_at, expires_at, last_seen_at, revoked_at
           FROM auth_sessions WHERE token_hash = ?`,
      )
      .get(tokenHash) as
      | {
          id: string;
          user_id: string;
          token_hash: string;
          created_at: string;
          expires_at: string;
          last_seen_at: string | null;
          revoked_at: string | null;
        }
      | undefined;
    return (
      r && {
        id: r.id,
        userId: r.user_id,
        tokenHash: r.token_hash,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
        lastSeenAt: r.last_seen_at,
        revokedAt: r.revoked_at,
      }
    );
  }

  touchSession(id: string, at: Date): void {
    this.conn.write(this.actorId(), (w) => {
      w.run('UPDATE auth_sessions SET last_seen_at = ? WHERE id = ? AND revoked_at IS NULL', [toDbTimestamp(at), id]);
    });
  }

  revokeSession(id: string, at: Date): void {
    this.conn.write(this.actorId(), (w) => {
      w.run('UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', [toDbTimestamp(at), id]);
    });
  }

  revokeUserSessions(userId: string, at: Date): number {
    return this.conn.write(this.actorId(), (w) => {
      return w.run('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [
        toDbTimestamp(at),
        userId,
      ]).changes;
    });
  }
}

/** Đồng hồ → mốc DB (so chuỗi = so thời gian, DATABASE §2.4). */
export const dbNow = (clock: Clock) => toDbTimestamp(clock.now());
