// Mật khẩu owner: argon2id (FS Chương 1, BUILD-PLAN §A.1), mật khẩu lần đầu dạng từ (STD-06), chính sách mật khẩu mới.
//
// Tham số argon2id [ĐỀ XUẤT — L-SEC]: OWASP Password Storage Cheat Sheet, cấu hình 1 — m = 46 MiB (47 104 KiB), t = 1, p = 1;
// salt 16 byte ngẫu nhiên, đầu ra 32 byte, chuỗi PHC chuẩn `$argon2id$v=19$m=…,t=…,p=…$salt$hash`.
// Đo trên máy cloud (4 CPU, Node 22): ~190 ms mỗi lần băm (WASM). Băm chạy trong worker_threads, một lần một lượt,
// hàng đợi có trần ⇒ đăng nhập dồn dập không chặn event loop và không ăn RAM vô hạn (46 MiB mỗi lượt).
// Thư viện: hash-wasm (MIT, không phụ thuộc, không binary native — chạy như nhau trên amd64 / arm64).
//
// Unicode: mật khẩu chuẩn hoá NFC trước khi băm / kiểm — gõ tiếng Việt có dấu trên macOS (thường NFD) và Windows (NFC)
// phải ra cùng một mật khẩu.
import { randomBytes, randomInt } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { constantTimeEqual } from './encoding.ts';
import { FIRST_PASSWORD_WORDS } from './wordlist.ts';

export const ARGON2ID = {
  version: 19,
  memoryKiB: 47_104,
  iterations: 1,
  parallelism: 1,
  hashLength: 32,
  saltLength: 16,
} as const;

/** Trần tham số khi KIỂM một chuỗi PHC đã lưu (chuỗi bị sửa trong DB không biến lần kiểm thành DoS bộ nhớ / CPU). */
const VERIFY_BOUNDS = {
  maxMemoryKiB: 1_048_576,
  maxIterations: 16,
  maxParallelism: 8,
  minSalt: 8,
  maxSalt: 64,
  minHash: 16,
  maxHash: 64,
} as const;

export const PASSWORD_RULES = {
  /** Mật khẩu mới tối thiểu 12 ký tự (code point) — đủ cho cụm từ dễ nhớ. [ĐỀ XUẤT — L-SEC] */
  minChars: 12,
  maxChars: 256,
  /** Trần byte UTF-8 của MỌI mật khẩu nhận vào (cả lúc đăng nhập) — kiểm trước khi băm. */
  maxBytes: 1024,
  /** Ít hơn ngần này ký tự khác nhau ⇒ quá lặp ("aaaaaaaaaaaa", "abababababab"). */
  minDistinctChars: 5,
} as const;

export class PasswordHashFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordHashFormatError';
  }
}

/** Hàng đợi băm đầy — người gọi trả "thử lại sau" (đăng nhập: rate_limited). */
export class PasswordHasherBusyError extends Error {
  constructor() {
    super('hàng đợi băm mật khẩu đầy');
    this.name = 'PasswordHasherBusyError';
  }
}

// ---------------------------------------------------------------- worker
interface Argon2Params {
  memoryKiB: number;
  iterations: number;
  parallelism: number;
  hashLength: number;
}

type WorkerReply = { id: number; ok: true; hash: Uint8Array } | { id: number; ok: false; error: string };

const MAX_PENDING = 16;

class Argon2Worker {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (h: Uint8Array) => void; reject: (e: Error) => void }>();

  run(password: Uint8Array, salt: Uint8Array, p: Argon2Params): Promise<Uint8Array> {
    if (this.pending.size >= MAX_PENDING) return Promise.reject(new PasswordHasherBusyError());
    const w = this.ensure();
    const id = this.nextId++;
    // bản sao riêng (Buffer nhỏ nằm chung pool 8 KB — không gửi cả pool sang worker)
    const msg = {
      id,
      password: new Uint8Array(password),
      salt: new Uint8Array(salt),
      memoryKiB: p.memoryKiB,
      iterations: p.iterations,
      parallelism: p.parallelism,
      hashLength: p.hashLength,
    };
    return new Promise<Uint8Array>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      w.ref();
      w.postMessage(msg, [msg.password.buffer, msg.salt.buffer]);
    });
  }

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('./argon2-worker.ts', import.meta.url));
    w.unref();
    w.on('message', (m: WorkerReply) => {
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (this.pending.size === 0) w.unref();
      if (m.ok) {
        hasherRuns++;
        p.resolve(m.hash);
      } else p.reject(new Error(`argon2id lỗi: ${m.error}`));
    });
    const fail = (err: Error) => {
      if (this.worker === w) this.worker = null;
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    };
    w.on('error', (e) => fail(e instanceof Error ? e : new Error(String(e))));
    w.on('exit', (code) => fail(new Error(`argon2 worker thoát (mã ${code})`)));
    this.worker = w;
    return w;
  }
}

const hasher = new Argon2Worker();

/** Byte UTF-8 (NFC) của mật khẩu; null nếu rỗng hoặc vượt trần (không băm). */
function passwordBytes(password: string): Buffer | null {
  if (typeof password !== 'string' || password.length === 0) return null;
  const buf = Buffer.from(password.normalize('NFC'), 'utf8');
  return buf.byteLength > PASSWORD_RULES.maxBytes ? null : buf;
}

// ---------------------------------------------------------------- PHC
interface ParsedPhc extends Argon2Params {
  salt: Buffer;
  hash: Buffer;
}

const PHC_RE =
  /^\$argon2id\$v=19\$m=(\d{1,8}),t=(\d{1,3}),p=(\d{1,3})\$([A-Za-z0-9+/]{11,88})\$([A-Za-z0-9+/]{22,88})$/;

function b64NoPad(buf: Uint8Array): string {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '');
}

function decodeB64NoPad(text: string): Buffer | null {
  const buf = Buffer.from(text, 'base64');
  return b64NoPad(buf) === text ? buf : null;
}

function parsePhc(phc: string): ParsedPhc {
  const m = PHC_RE.exec(phc);
  if (!m) throw new PasswordHashFormatError('chuỗi băm mật khẩu không đúng dạng PHC argon2id v19');
  const [memoryKiB, iterations, parallelism] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const salt = decodeB64NoPad(m[4] as string);
  const hash = decodeB64NoPad(m[5] as string);
  const b = VERIFY_BOUNDS;
  if (
    !salt ||
    !hash ||
    memoryKiB > b.maxMemoryKiB ||
    memoryKiB < 8 * parallelism ||
    iterations < 1 ||
    iterations > b.maxIterations ||
    parallelism < 1 ||
    parallelism > b.maxParallelism ||
    salt.byteLength < b.minSalt ||
    salt.byteLength > b.maxSalt ||
    hash.byteLength < b.minHash ||
    hash.byteLength > b.maxHash
  ) {
    throw new PasswordHashFormatError('tham số băm mật khẩu ngoài khoảng cho phép');
  }
  return { memoryKiB, iterations, parallelism, hashLength: hash.byteLength, salt, hash };
}

/** Băm mật khẩu mới (đã qua `validateNewPassword` hoặc là mật khẩu lần đầu do hệ thống sinh). */
export async function hashPassword(password: string): Promise<string> {
  const pw = passwordBytes(password);
  if (!pw) throw new RangeError(`mật khẩu phải 1–${PASSWORD_RULES.maxBytes} byte`);
  const salt = randomBytes(ARGON2ID.saltLength);
  const hash = await hasher.run(pw, salt, ARGON2ID).finally(() => pw.fill(0));
  const a = ARGON2ID;
  return `$argon2id$v=${a.version}$m=${a.memoryKiB},t=${a.iterations},p=${a.parallelism}$${b64NoPad(salt)}$${b64NoPad(hash)}`;
}

/**
 * Kiểm mật khẩu với chuỗi PHC đã lưu; so sánh hằng thời gian. Mật khẩu rỗng / quá trần byte ⇒ false (không băm).
 * Chuỗi PHC hỏng ⇒ ném `PasswordHashFormatError` (lỗi dữ liệu — không nuốt thành "sai mật khẩu").
 */
export async function verifyPassword(password: string, phc: string): Promise<boolean> {
  const parsed = parsePhc(phc);
  const pw = passwordBytes(password);
  if (!pw) return false;
  const got = await hasher.run(pw, parsed.salt, parsed).finally(() => pw.fill(0));
  return constantTimeEqual(got, parsed.hash);
}

/** Chuỗi đã lưu dùng tham số khác tham số hiện hành ⇒ băm lại sau lần đăng nhập đúng. Chuỗi hỏng ⇒ true. */
export function needsRehash(phc: string): boolean {
  try {
    const p = parsePhc(phc);
    return (
      p.memoryKiB !== ARGON2ID.memoryKiB ||
      p.iterations !== ARGON2ID.iterations ||
      p.parallelism !== ARGON2ID.parallelism ||
      p.hashLength !== ARGON2ID.hashLength ||
      p.salt.byteLength !== ARGON2ID.saltLength
    );
  } catch {
    return true;
  }
}

let dummyPhc: Promise<string> | null = null;
let hasherRuns = 0;

/**
 * Chuỗi băm "giả" cho tên đăng nhập không tồn tại. Gọi lúc khởi động (AuthService) để lần đăng nhập đầu với user lạ không
 * tốn thêm một lần băm. Lỗi ⇒ KHÔNG giữ promise bị reject (lần sau tính lại) — giữ lại thì mọi lần đăng nhập user lạ sẽ
 * thất bại ngay không băm ⇒ thời gian lệch hẳn user thật (lộ user) và bước chống dò user hỏng luôn (review MEDIUM).
 */
export function prepareDummyHash(): Promise<string> {
  if (!dummyPhc) {
    const p = hashPassword(randomBytes(24).toString('base64url'));
    dummyPhc = p;
    p.catch(() => {
      if (dummyPhc === p) dummyPhc = null;
    });
  }
  return dummyPhc;
}

/** Tốn đúng một lần kiểm (như mật khẩu thật) — dùng khi tên đăng nhập không tồn tại; luôn trả false. */
export async function verifyAgainstDummy(password: string): Promise<false> {
  await verifyPassword(password, await prepareDummyHash());
  return false;
}

/** Số lần băm argon2id đã chạy xong (chẩn đoán + test "đường user lạ tốn đúng một lần kiểm"). */
export function passwordHasherRuns(): number {
  return hasherRuns;
}

// ---------------------------------------------------------------- mật khẩu lần đầu (STD-06, FS Ch.0)
export const FIRST_PASSWORD_FORMAT = { words: 3, digits: 4, separator: '-' } as const;

/** Entropy (bit) của mật khẩu lần đầu = 3·log2(số từ) + log2(10^4). */
export function firstPasswordEntropyBits(): number {
  const f = FIRST_PASSWORD_FORMAT;
  return f.words * Math.log2(FIRST_PASSWORD_WORDS.length) + f.digits * Math.log2(10);
}

/** Vài từ dễ đọc + 4 chữ số, vd `tide-amber-quiet-9142`. CSPRNG (`crypto.randomInt`, không lệch). */
export function generateFirstPassword(): string {
  const f = FIRST_PASSWORD_FORMAT;
  const words = Array.from({ length: f.words }, () => FIRST_PASSWORD_WORDS[randomInt(FIRST_PASSWORD_WORDS.length)]);
  const digits = String(randomInt(10 ** f.digits)).padStart(f.digits, '0');
  return [...words, digits].join(f.separator);
}

// ---------------------------------------------------------------- chính sách mật khẩu mới
export type PasswordPolicyViolation =
  | 'too_short'
  | 'too_long'
  | 'too_repetitive'
  | 'contains_username'
  | 'same_as_current';

export function validateNewPassword(
  password: string,
  ctx: { username: string; currentPassword?: string },
): { ok: true } | { ok: false; reason: PasswordPolicyViolation } {
  const pw = password.normalize('NFC');
  const chars = [...pw];
  if (chars.length < PASSWORD_RULES.minChars) return { ok: false, reason: 'too_short' };
  if (chars.length > PASSWORD_RULES.maxChars || Buffer.byteLength(pw, 'utf8') > PASSWORD_RULES.maxBytes) {
    return { ok: false, reason: 'too_long' };
  }
  if (new Set(chars).size < PASSWORD_RULES.minDistinctChars) return { ok: false, reason: 'too_repetitive' };
  const user = ctx.username.normalize('NFC').toLowerCase();
  if (user.length >= 3 && pw.toLowerCase().includes(user)) return { ok: false, reason: 'contains_username' };
  if (ctx.currentPassword !== undefined && ctx.currentPassword.normalize('NFC') === pw) {
    return { ok: false, reason: 'same_as_current' };
  }
  return { ok: true };
}
