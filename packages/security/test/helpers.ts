// Tiện ích test: đồng hồ giả, ký minisign trong test (khoá sinh lúc chạy), mẫu credential GIẢ dựng lúc chạy
// (ghép chuỗi ⇒ gitleaks không thấy literal; không mẫu nào là credential thật).
import { createHash, generateKeyPairSync, type KeyObject, randomBytes, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Clock } from '@ga/contracts';

export class FakeClock implements Clock {
  private t: number;
  constructor(iso = '2026-10-16T08:00:00.000Z') {
    this.t = Date.parse(iso);
  }
  now(): Date {
    return new Date(this.t);
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

export function tempDir(prefix: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------- minisign trong test
export interface TestMinisignKey {
  keyId: Buffer;
  privateKey: KeyObject;
  publicText: string;
}

export function newMinisignKey(keyId: Buffer = randomBytes(8)): TestMinisignKey {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string };
  const raw = Buffer.concat([Buffer.from('Ed'), keyId, Buffer.from(jwk.x, 'base64url')]);
  return { keyId, privateKey, publicText: `untrusted comment: test key\n${raw.toString('base64')}\n` };
}

/** Ký đúng định dạng minisign (prehashed "ED"); `alg: 'Ed'` = legacy (ký thẳng tệp). */
export function minisignSign(
  message: Uint8Array,
  key: TestMinisignKey,
  opts: { trustedComment?: string; alg?: 'ED' | 'Ed' } = {},
): string {
  const alg = opts.alg ?? 'ED';
  const data = alg === 'ED' ? createHash('blake2b512').update(message).digest() : Buffer.from(message);
  const sig = sign(null, data, key.privateKey);
  const tc = opts.trustedComment ?? 'timestamp:1760600000\tfile:release-manifest.json\thashed';
  const global = sign(null, Buffer.concat([sig, Buffer.from(tc)]), key.privateKey);
  const line = Buffer.concat([Buffer.from(alg), key.keyId, sig]).toString('base64');
  return `untrusted comment: signature from test key\n${line}\ntrusted comment: ${tc}\n${global.toString('base64')}\n`;
}

// ---------------------------------------------------------------- mẫu credential giả (ghép lúc chạy)
const j = (...parts: string[]) => parts.join('');
const body = (n: number, alphabet = 'Ab3Cd4Ef5Gh6Jk7Mn8Pq9Rs2Tu') =>
  Array.from({ length: n }, (_, i) => alphabet[i % alphabet.length]).join('');

export const CANARY = j('GA-', 'CANARY-', '3f2b9c1e-8d4a-4f6b-9a1c-2e7d5b8c0a11');

/** Một mẫu GIẢ cho mỗi loại — dùng chung cho test chặn, che, biến thể, hiệu năng. */
export const SAMPLES: Record<string, string> = {
  jwt: j('eyJ', 'hbGciOiJIUzI1NiJ9', '.', 'eyJzdWIiOiJ4In0', '.', 'c2lnbmF0dXJlLXRlc3Q'),
  google_oauth_access_token: j('ya', '29.', 'A0ARrdaM-test-only-', body(12)),
  google_refresh_token: j('1/', '/0', 'gTestOnly', body(16)),
  google_api_key: j('AI', 'za', 'SyTestOnly', body(25)),
  vendor_api_key_sk_ant: j('sk-', 'ant-', 'api03-', body(30)),
  generic_sk_key: j('sk-', 'proj-', body(28)),
  github_token: j('gh', 'p_', body(36)),
  slack_token: j('xo', 'xb-', '1234567890-', body(16)),
  aws_access_key_id: j('AK', 'IA', 'TESTONLY2345ABCD'),
  stripe_secret_key: j('sk_', 'live_', body(24)),
  npm_token: j('np', 'm_', body(36)),
  gitlab_token: j('gl', 'pat-', body(20)),
  huggingface_token: j('h', 'f_', body(34)),
  google_oauth_client_secret: j('GOC', 'SPX-', body(28)),
  telegram_bot_token: j('123456789', ':', 'AA', body(33)),
  pem_private_key: j(
    '-----BEGIN ',
    'PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END ',
    'PRIVATE KEY-----',
  ),
  credential_field: j('"refresh', '_token": "', '1//', '0abc"'),
  bearer_token: j('curl -H "Bear', 'er ', 'abc.def-ghi_jkl~mno+pq/rs="'),
  url_userinfo: j('https://deploy:', 'Hunter2-Pass', '@git.example.com/repo.git'),
  canary: CANARY,
  high_entropy: body(40, 'Zq8XwLmN3vBtRk7HpYc2'),
};
