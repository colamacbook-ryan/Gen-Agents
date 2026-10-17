// Khoá: đọc từ TỆP (compose secrets), keyring master key, dẫn xuất khoá phụ bằng HKDF (DATABASE §9.5, §9.6; BUILD-PLAN §B.2).
//
// Luật:
//   - Khoá vào tiến trình bằng tệp (compose `secrets:`, 0400), KHÔNG bằng env — `Config.Env` đọc được qua Docker API (CNS-143).
//     Env chỉ được mang ĐƯỜNG DẪN tệp (`*_FILE`). `assertNoRawKeysInEnv` từ chối chạy nếu khoá thô nằm trong env.
//   - Lỗi đọc / parse khoá KHÔNG BAO GIỜ chứa nội dung khoá (chỉ nhãn + số dòng) ⇒ không rò vào log.
//   - Khoá phụ (KEK, fingerprint, CSRF, HMAC IP, khoá audit) dẫn xuất từ master key bằng HKDF-SHA256, không lưu ở đâu.
//   - Khoá ký vé terminal là khoá RIÊNG `GA_TERM_TICKET_KEY` (G-04), KHÔNG dẫn xuất từ master key.
import { hkdfSync } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';

export const KEY_BYTES = 32;

export class KeyMaterialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeyMaterialError';
  }
}

/** Biến env mang ĐƯỜNG DẪN tệp khoá (không mang khoá) + đường mặc định của compose secrets. [ĐỀ XUẤT — L-SEC] cho L-OPS. */
export const KEY_FILES = {
  masterKey: { env: 'GENAGENTS_MASTER_KEY_FILE', defaultPath: '/run/secrets/ga_master_key' },
  termTicketKey: { env: 'GA_TERM_TICKET_KEY_FILE', defaultPath: '/run/secrets/ga_term_ticket_key' },
  supervisorKey: { env: 'GA_SUPERVISOR_KEY_FILE', defaultPath: '/run/secrets/ga_supervisor_key' },
  updaterKey: { env: 'GA_UPDATER_KEY_FILE', defaultPath: '/run/secrets/ga_updater_key' },
  egressKey: { env: 'GA_EGRESS_KEY_FILE', defaultPath: '/run/secrets/ga_egress_key' },
} as const;
export type KeyFileName = keyof typeof KEY_FILES;

/** Tên biến chứa khoá THÔ trong `.env` của host — không được có mặt trong env của tiến trình trong container. */
export const RAW_KEY_ENV_NAMES = [
  'GENAGENTS_MASTER_KEY',
  'GA_TERM_TICKET_KEY',
  'GA_SUPERVISOR_KEY',
  'GA_UPDATER_KEY',
  'GA_EGRESS_KEY',
] as const;

/** Từ chối chạy nếu env của tiến trình chứa khoá thô (compose cấu hình sai: đưa khoá bằng `environment:` thay vì `secrets:`). */
export function assertNoRawKeysInEnv(env: Readonly<Record<string, string | undefined>>): void {
  const found = RAW_KEY_ENV_NAMES.filter((n) => typeof env[n] === 'string' && env[n] !== '');
  if (found.length > 0) {
    throw new KeyMaterialError(
      `khoá thô nằm trong env (${found.join(', ')}) — phải đưa bằng tệp secret, env chỉ mang đường dẫn *_FILE`,
    );
  }
}

/** Đường dẫn tệp khoá: env `*_FILE` nếu có, không thì đường mặc định của compose secrets. */
export function keyFilePath(name: KeyFileName, env: Readonly<Record<string, string | undefined>>): string {
  const spec = KEY_FILES[name];
  const fromEnv = env[spec.env];
  return typeof fromEnv === 'string' && fromEnv.length > 0 ? fromEnv : spec.defaultPath;
}

const HEX64_RE = /^[0-9a-fA-F]{64}$/;
const B64_32_RE = /^[A-Za-z0-9+/_-]{43}={0,1}$/;

/** Một dòng khoá: 64 ký tự hex, hoặc base64 / base64url của đúng 32 byte. Lỗi không kèm nội dung. */
export function parseKeyText(text: string, label: string): Buffer {
  const t = text.trim();
  let key: Buffer | null = null;
  if (HEX64_RE.test(t)) key = Buffer.from(t, 'hex');
  else if (B64_32_RE.test(t)) {
    const buf = Buffer.from(t.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    key = buf.byteLength === KEY_BYTES ? buf : null;
  }
  if (!key || key.byteLength !== KEY_BYTES) {
    throw new KeyMaterialError(`${label}: khoá phải là 32 byte (64 ký tự hex hoặc base64) — nội dung không in ra`);
  }
  const first = key[0];
  if (key.every((b) => b === first)) throw new KeyMaterialError(`${label}: khoá toàn một byte lặp lại — từ chối`);
  return key;
}

/** Trần kích thước tệp khoá — đọc trước khi parse (tệp lạ / nhầm đường không bị nạp hết vào RAM). */
const MAX_KEY_FILE_BYTES = 4096;

/**
 * Đọc tệp khoá. Từ chối: không phải tệp thường, quá lớn, có quyền cho "others" (mode & 0o007) — compose secrets / tệp
 * install.sh sinh phải là 0400 / 0440 / 0600. Trả các dòng không rỗng, bỏ dòng chú thích `#`.
 */
export function readKeyFileLines(path: string, label: string): string[] {
  let st: ReturnType<typeof statSync>;
  try {
    st = statSync(path);
  } catch (e) {
    throw new KeyMaterialError(
      `${label}: không đọc được tệp khoá ${path} (${(e as NodeJS.ErrnoException).code ?? 'lỗi'})`,
    );
  }
  if (!st.isFile()) throw new KeyMaterialError(`${label}: ${path} không phải tệp thường`);
  if (st.size > MAX_KEY_FILE_BYTES) throw new KeyMaterialError(`${label}: tệp khoá quá lớn (${st.size} byte)`);
  if ((st.mode & 0o007) !== 0) {
    throw new KeyMaterialError(
      `${label}: tệp khoá ${path} mở quyền cho người khác (mode ${(st.mode & 0o777).toString(8)}) — cần 0400/0440/0600`,
    );
  }
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
}

/** Một khoá 32 byte từ tệp (khoá vé terminal, khoá supervisor…): đúng một dòng khoá. */
export function loadKeyFile(path: string, label: string): Buffer {
  const lines = readKeyFileLines(path, label);
  if (lines.length !== 1) throw new KeyMaterialError(`${label}: tệp phải có đúng một dòng khoá (có ${lines.length})`);
  return parseKeyText(lines[0] as string, label);
}

// ---------------------------------------------------------------- HKDF
/**
 * Khoá phụ dẫn xuất từ master key. Mỗi mục đích một cặp (salt, info) riêng — tách miền, không dùng lại khoá.
 * `audit` theo đúng DATABASE §9.6: salt "genagents-audit", info "audit-chain:v1:" ‖ workspace_id.
 */
export const SUBKEY_PURPOSES = {
  kek: { salt: 'genagents-kek', info: 'secret-store:kek:v1' },
  kekId: { salt: 'genagents-kek-id', info: 'kek-id:v1' },
  fingerprint: { salt: 'genagents-fingerprint', info: 'secret-fingerprint:v1' },
  csrf: { salt: 'genagents-csrf', info: 'csrf:v1' },
  ipHmac: { salt: 'genagents-ip', info: 'ip-hmac:v1' },
  audit: { salt: 'genagents-audit', info: 'audit-chain:v1:' },
} as const;
export type SubkeyPurpose = keyof typeof SUBKEY_PURPOSES;

function assertKey(key: Uint8Array, label: string): void {
  if (key.byteLength !== KEY_BYTES) throw new KeyMaterialError(`${label}: khoá phải đúng ${KEY_BYTES} byte`);
}

/** HKDF-SHA256(master, salt, info ‖ context) → `length` byte. `context` chỉ dùng cho mục đích có ngữ cảnh (audit). */
export function deriveSubkey(master: Uint8Array, purpose: SubkeyPurpose, context = '', length = KEY_BYTES): Buffer {
  assertKey(master, 'master key');
  const p = SUBKEY_PURPOSES[purpose];
  if (purpose === 'audit' && context.length === 0) throw new KeyMaterialError('khoá audit cần workspace_id');
  if (purpose !== 'audit' && context.length > 0) throw new KeyMaterialError(`mục đích ${purpose} không nhận ngữ cảnh`);
  return Buffer.from(hkdfSync('sha256', master, Buffer.from(p.salt), Buffer.from(p.info + context), length));
}

/** K_audit = HKDF-SHA256(master_key, salt="genagents-audit", info="audit-chain:v1:" ‖ workspace_id) — DATABASE §9.6. */
export function deriveAuditKey(master: Uint8Array, workspaceId: string): Buffer {
  return deriveSubkey(master, 'audit', workspaceId);
}

// ---------------------------------------------------------------- keyring master key
export interface MasterKey {
  /** `mk-<16 hex>` = HKDF(master, kekId) — ghi vào `secrets.kek_id`, `audit_log.hash_key_id`. Không lộ khoá. */
  readonly id: string;
  readonly key: Buffer;
}

export interface MasterKeyring {
  /** Khoá hiện hành: mọi bí mật mới bọc bằng khoá này. */
  readonly current: MasterKey;
  get(id: string): MasterKey | undefined;
  ids(): string[];
}

export function masterKeyId(key: Uint8Array): string {
  return `mk-${deriveSubkey(key, 'kekId', '', 8).toString('hex')}`;
}

/** keys[0] = khoá hiện hành; các khoá sau = khoá cũ còn giữ để giải mã / kiểm đoạn audit cũ (xoay KEK). */
export function createMasterKeyring(keys: readonly Uint8Array[]): MasterKeyring {
  if (keys.length === 0) throw new KeyMaterialError('keyring rỗng');
  const entries = new Map<string, MasterKey>();
  for (const k of keys) {
    assertKey(k, 'master key');
    const id = masterKeyId(k);
    if (entries.has(id)) throw new KeyMaterialError('keyring có khoá trùng');
    entries.set(id, Object.freeze({ id, key: Buffer.from(k) }));
  }
  const current = entries.get(masterKeyId(keys[0] as Uint8Array)) as MasterKey;
  return Object.freeze({
    current,
    get: (id: string) => entries.get(id),
    ids: () => [...entries.keys()],
  });
}

/**
 * Keyring từ tệp (compose secret). Mỗi dòng một khoá; dòng đầu là khoá hiện hành. Xoay master key: thêm khoá mới lên
 * ĐẦU tệp, giữ khoá cũ ở dưới tới khi mọi bí mật đã `rewrapSecret` sang khoá mới (và đoạn audit cũ đã hết hạn giữ).
 */
export function loadMasterKeyringFromFile(path: string): MasterKeyring {
  const lines = readKeyFileLines(path, 'master key');
  if (lines.length === 0) throw new KeyMaterialError('master key: tệp không có dòng khoá nào');
  return createMasterKeyring(lines.map((l, i) => parseKeyText(l, `master key (dòng khoá ${i + 1})`)));
}
