// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
//
// Credential giả + trạng thái native giả. Mọi credential mang CANARY `GA-CANARY-<uuid>` (BUILD-PLAN §C.6): sau toàn bộ E2E,
// `pnpm sec:canary` quét mọi chỗ ngoài volume /auth và phải thấy 0 lần. Token có hình dạng thật (ya29., 1//0, sk-ant-, JWT) để
// bộ phát hiện credential (L-SEC) và gateway (L-GW) được thử trên dữ liệu giống thật.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { home, nowMs, uuid } from './common.ts';
import { FAKE_ACCOUNT_A } from './scenario.ts';

export type Engine = 'agy' | 'claude';

export const CREDENTIAL_FILE: Record<Engine, string> = { claude: '.credentials.json', agy: 'oauth_creds.json' };

/** Thư mục cấu hình của claude giả: CLAUDE_CONFIG_DIR (như CLI thật) hoặc ~/.claude. Transcript native nằm ở đây. */
export const claudeConfigDir = (env: NodeJS.ProcessEnv = process.env): string =>
  env.CLAUDE_CONFIG_DIR ?? join(home(env), '.claude');

/** Thư mục trạng thái của agy (đã thấy ở Spike 1b: ~/.gemini/antigravity-cli). Vị trí credential trong đó: GIẢ ĐỊNH (ASSUMPTIONS AG-AUTH-1). */
export const agyStateDir = (env: NodeJS.ProcessEnv = process.env): string =>
  join(home(env), '.gemini', 'antigravity-cli');

/**
 * Nơi đặt tệp credential. Mặc định nằm trong thư mục cấu hình của CLI; `GA_FAKE_AUTH_DIR` (chỉ có ở fake) chuyển RIÊNG tệp
 * credential sang thư mục khác, vd /auth/<en> — mô phỏng cách "nối bằng biến môi trường" (BUILD-PLAN §B.5 bước 4).
 */
export function credentialPath(engine: Engine, env: NodeJS.ProcessEnv = process.env): string {
  const dir = env.GA_FAKE_AUTH_DIR ?? (engine === 'claude' ? claudeConfigDir(env) : agyStateDir(env));
  return join(dir, CREDENTIAL_FILE[engine]);
}

export const newCanary = (env: NodeJS.ProcessEnv = process.env): string => env.GA_FAKE_CANARY ?? `GA-CANARY-${uuid()}`;

const b64url = (s: string): string => Buffer.from(s).toString('base64url');

export interface CredentialOpts {
  canary: string;
  account?: string;
  nowMs?: number;
  /** số lần xoay refresh token (0 = mới đăng nhập). */
  rotation?: number;
}

export function credentialJson(engine: Engine, o: CredentialOpts): string {
  const account = o.account ?? FAKE_ACCOUNT_A;
  const tail = `${randomBytes(12).toString('hex')}-${o.canary}`;
  const rotation = o.rotation ?? 0;
  const expires = (o.nowMs ?? Date.now()) + 3_600_000;
  if (engine === 'claude') {
    return JSON.stringify({
      claudeAiOauth: {
        accessToken: `sk-ant-oat01-FAKE-${tail}`,
        refreshToken: `sk-ant-ort01-FAKE-${tail}`,
        expiresAt: expires,
        scopes: ['user:inference', 'user:profile'],
      },
      fake: { account, canary: o.canary, rotation },
    });
  }
  const idToken = `${b64url('{"alg":"none"}')}.${b64url(JSON.stringify({ email: account, canary: o.canary }))}.fake`;
  return JSON.stringify({
    access_token: `ya29.FAKE-${tail}`,
    refresh_token: `1//0FAKE-${tail}`,
    token_type: 'Bearer',
    expiry: new Date(expires).toISOString(),
    id_token: idToken,
    fake: { account, canary: o.canary, rotation },
  });
}

/** Ghi nguyên tử (tệp tạm cùng thư mục + rename, 0600) — đúng kiểu CLI thật xoay token, nên sẽ thay thế symlink nếu có. */
export function writeFileAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  writeFileSync(tmp, content, { mode: 0o600 });
  renameSync(tmp, path);
}

export interface StoredCredential {
  path: string;
  account: string;
  canary: string;
  rotation: number;
}

/** Đọc credential giả; null nếu chưa đăng nhập (không có tệp). Tệp hỏng ⇒ ném lỗi (không nuốt). */
export function readCredential(engine: Engine, env: NodeJS.ProcessEnv = process.env): StoredCredential | null {
  const path = credentialPath(engine, env);
  if (!existsSync(path)) return null;
  const j = JSON.parse(readFileSync(path, 'utf8')) as {
    fake?: { account?: string; canary?: string; rotation?: number };
  };
  return {
    path,
    account: j.fake?.account ?? FAKE_ACCOUNT_A,
    canary: j.fake?.canary ?? '',
    rotation: j.fake?.rotation ?? 0,
  };
}

export function writeCredential(
  engine: Engine,
  env: NodeJS.ProcessEnv = process.env,
  account?: string,
): StoredCredential {
  const path = credentialPath(engine, env);
  const canary = newCanary(env);
  writeFileAtomic(path, credentialJson(engine, { canary, nowMs: nowMs(env), ...(account ? { account } : {}) }));
  return { path, account: account ?? FAKE_ACCOUNT_A, canary, rotation: 0 };
}

/** GA_FAKE_ROTATE_CREDS=1: sau lượt thành công, ghi lại credential bằng rename nguyên tử (token mới, cùng canary). */
export function rotateCredential(engine: Engine, env: NodeJS.ProcessEnv = process.env): void {
  const cur = readCredential(engine, env);
  if (!cur) return;
  writeFileAtomic(
    cur.path,
    credentialJson(engine, { canary: cur.canary, account: cur.account, nowMs: nowMs(env), rotation: cur.rotation + 1 }),
  );
}

/** Dùng bởi test / IT: tạo trạng thái "đã đăng nhập" không qua PTY. */
export function seedCredentials(
  engine: Engine,
  env: NodeJS.ProcessEnv = process.env,
  account?: string,
): StoredCredential {
  return writeCredential(engine, env, account);
}
