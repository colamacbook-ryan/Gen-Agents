// Khoá từ tệp + HKDF + kho bí mật envelope AES-256-GCM + xoay KEK (DATABASE §9.5, §9.6; BUILD-PLAN §B.2, §B.9).
import { hkdfSync, randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertNoRawKeysInEnv,
  createMasterKeyring,
  deriveAuditKey,
  deriveSubkey,
  ENVELOPE_ALG,
  KeyMaterialError,
  keyFilePath,
  loadKeyFile,
  loadMasterKeyringFromFile,
  MAX_SECRET_BYTES,
  masterKeyId,
  openSecret,
  parseKeyText,
  rewrapSecret,
  SecretDecryptError,
  SecretKeyUnavailableError,
  sealSecret,
} from '../src/index.ts';
import { tempDir } from './helpers.ts';

const key = () => randomBytes(32);

describe('khoá từ tệp', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => {
    tmp = tempDir('ga-keys-');
  });
  afterEach(() => tmp.cleanup());

  const write = (name: string, content: string, mode = 0o600) => {
    const p = join(tmp.dir, name);
    writeFileSync(p, content);
    chmodSync(p, mode);
    return p;
  };

  it('parseKeyText: hex 64, base64, base64url của đúng 32 byte', () => {
    const k = key();
    expect(parseKeyText(k.toString('hex'), 't').equals(k)).toBe(true);
    expect(parseKeyText(` ${k.toString('base64')}\n`, 't').equals(k)).toBe(true);
    expect(parseKeyText(k.toString('base64url'), 't').equals(k)).toBe(true);
  });

  it('ca âm parseKeyText: sai độ dài / ký tự lạ / toàn một byte — lỗi KHÔNG chứa nội dung khoá', () => {
    const secretish = randomBytes(31).toString('hex');
    for (const bad of [secretish, `${randomBytes(32).toString('hex')}00`, 'zz'.repeat(32), '', '00'.repeat(32)]) {
      try {
        parseKeyText(bad, 'master key');
        throw new Error('phải ném');
      } catch (e) {
        expect(e).toBeInstanceOf(KeyMaterialError);
        if (bad.length > 8) expect((e as Error).message).not.toContain(bad.slice(0, 16));
      }
    }
  });

  it('loadKeyFile: 0600 / 0400 / 0440 đọc được; một dòng khoá, chú thích # bỏ qua', () => {
    const k = key();
    for (const mode of [0o600, 0o400, 0o440]) {
      const p = write(`k${mode}`, `# khoá vé terminal\n${k.toString('hex')}\n`, mode);
      expect(loadKeyFile(p, 'term').equals(k)).toBe(true);
    }
  });

  it('ca âm loadKeyFile: quyền cho người khác, nhiều dòng, thư mục, không tồn tại, quá lớn', () => {
    const k = key().toString('hex');
    expect(() => loadKeyFile(write('a', k, 0o644), 'term')).toThrow(/mở quyền cho người khác/);
    expect(() => loadKeyFile(write('b', k, 0o604), 'term')).toThrow(KeyMaterialError);
    expect(() => loadKeyFile(write('c', `${k}\n${key().toString('hex')}`), 'term')).toThrow(/đúng một dòng/);
    const d = join(tmp.dir, 'dir');
    mkdirSync(d);
    expect(() => loadKeyFile(d, 'term')).toThrow(/không phải tệp thường/);
    expect(() => loadKeyFile(join(tmp.dir, 'nope'), 'term')).toThrow(/ENOENT/);
    expect(() => loadKeyFile(write('e', 'x'.repeat(5000)), 'term')).toThrow(/quá lớn/);
  });

  it('keyring từ tệp: dòng đầu = khoá hiện hành, khoá cũ giữ để giải mã; id không lộ khoá', () => {
    const [k1, k2] = [key(), key()];
    const ring = loadMasterKeyringFromFile(write('mk', `${k2.toString('hex')}\n${k1.toString('base64')}\n`));
    expect(ring.current.id).toBe(masterKeyId(k2));
    expect(ring.ids()).toEqual([masterKeyId(k2), masterKeyId(k1)]);
    expect(ring.get(masterKeyId(k1))?.key.equals(k1)).toBe(true);
    expect(ring.current.id).toMatch(/^mk-[0-9a-f]{16}$/);
    expect(k2.toString('hex')).not.toContain(ring.current.id.slice(3));
    expect(() => createMasterKeyring([k1, k1])).toThrow(/trùng/);
    expect(() => createMasterKeyring([])).toThrow(/rỗng/);
    expect(() => loadMasterKeyringFromFile(write('empty', '# chỉ chú thích\n'))).toThrow(/không có dòng khoá/);
  });

  it('khoá thô trong env ⇒ từ chối chạy; chỉ *_FILE thì được; lỗi không in giá trị', () => {
    const raw = key().toString('hex');
    expect(() => assertNoRawKeysInEnv({ GENAGENTS_MASTER_KEY: raw })).toThrow(/GENAGENTS_MASTER_KEY/);
    expect(() => assertNoRawKeysInEnv({ GA_TERM_TICKET_KEY: raw })).toThrow(KeyMaterialError);
    try {
      assertNoRawKeysInEnv({ GA_SUPERVISOR_KEY: raw });
    } catch (e) {
      expect((e as Error).message).not.toContain(raw);
    }
    expect(() =>
      assertNoRawKeysInEnv({ GENAGENTS_MASTER_KEY_FILE: '/run/secrets/ga_master_key', GENAGENTS_MASTER_KEY: '' }),
    ).not.toThrow();
    expect(keyFilePath('masterKey', {})).toBe('/run/secrets/ga_master_key');
    expect(keyFilePath('termTicketKey', { GA_TERM_TICKET_KEY_FILE: '/x/term' })).toBe('/x/term');
  });
});

describe('HKDF', () => {
  it('K_audit đúng công thức DATABASE §9.6 và khác theo workspace', () => {
    const mk = key();
    const ws = '01JWS00000000000000000AFI0';
    const want = Buffer.from(
      hkdfSync('sha256', mk, Buffer.from('genagents-audit'), Buffer.from(`audit-chain:v1:${ws}`), 32),
    );
    expect(deriveAuditKey(mk, ws).equals(want)).toBe(true);
    expect(deriveAuditKey(mk, '01JWS00000000000000000AFI1').equals(want)).toBe(false);
  });
  it('mỗi mục đích một khoá khác nhau; ca âm: audit thiếu workspace, mục đích khác nhận ngữ cảnh, master sai độ dài', () => {
    const mk = key();
    const ks = (['kek', 'kekId', 'fingerprint', 'csrf', 'ipHmac'] as const).map((p) =>
      deriveSubkey(mk, p).toString('hex'),
    );
    expect(new Set(ks).size).toBe(ks.length);
    expect(() => deriveSubkey(mk, 'audit')).toThrow(/workspace_id/);
    expect(() => deriveSubkey(mk, 'csrf', 'x')).toThrow(/không nhận ngữ cảnh/);
    expect(() => deriveSubkey(randomBytes(16), 'csrf')).toThrow(/32 byte/);
  });
});

describe('envelope AES-256-GCM', () => {
  const ctx = {
    workspaceId: '01JWS00000000000000000AFI0',
    secretId: '01JSEC0000000000000000000A',
    kind: 'telegram_bot_token',
  };
  const token = ['123456789', ':AAbcdefghijklmnopqrstuvwxyz0123456789'].join('');

  it('niêm + mở; đúng cột bảng secrets; nonce / DEK ngẫu nhiên mỗi lần', () => {
    const ring = createMasterKeyring([key()]);
    const a = sealSecret(token, ctx, ring);
    const b = sealSecret(token, ctx, ring);
    expect(openSecret(a, ctx, ring).toString('utf8')).toBe(token);
    expect(a.alg).toBe(ENVELOPE_ALG);
    expect(a.kekId).toBe(ring.current.id);
    expect(a.nonce.byteLength).toBe(12);
    expect(a.dekNonce.byteLength).toBe(12);
    expect(a.wrappedDek.byteLength).toBe(48);
    expect(a.ciphertext.byteLength).toBe(Buffer.byteLength(token) + 16);
    expect(a.last4).toBe('6789');
    expect(a.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(a.ciphertext.includes(Buffer.from(token))).toBe(false);
    expect(sealSecret('ngắn', ctx, ring).last4).toBeNull();
    expect(sealSecret(token, { ...ctx, workspaceId: '01JWS00000000000000000AFI9' }, ring).fingerprint).not.toBe(
      a.fingerprint,
    );
  });

  it('ca âm: sai từng trường ngữ cảnh AAD ⇒ SecretDecryptError', () => {
    const ring = createMasterKeyring([key()]);
    const sealed = sealSecret(token, ctx, ring);
    for (const k of ['workspaceId', 'secretId', 'kind'] as const) {
      expect(() => openSecret(sealed, { ...ctx, [k]: `${ctx[k]}X` }, ring), k).toThrow(SecretDecryptError);
    }
  });

  it('ca âm: sửa từng byte / từng cột mật mã ⇒ SecretDecryptError (không lộ bản rõ)', () => {
    const ring = createMasterKeyring([key()]);
    const sealed = sealSecret(token, ctx, ring);
    const flip = (b: Buffer, i = 0) => {
      const c = Buffer.from(b);
      c[i] = (c[i] as number) ^ 1;
      return c;
    };
    const tampered = [
      { ...sealed, ciphertext: flip(sealed.ciphertext) },
      { ...sealed, ciphertext: flip(sealed.ciphertext, sealed.ciphertext.byteLength - 1) },
      { ...sealed, nonce: flip(sealed.nonce) },
      { ...sealed, wrappedDek: flip(sealed.wrappedDek) },
      { ...sealed, dekNonce: flip(sealed.dekNonce) },
      { ...sealed, ciphertext: sealed.ciphertext.subarray(0, 10) },
      { ...sealed, alg: 'A128GCM' },
    ];
    for (const t of tampered) expect(() => openSecret(t, ctx, ring)).toThrow(SecretDecryptError);
  });

  it('ca âm: đổi ciphertext giữa hai bí mật cùng khoá ⇒ thất bại (AAD gắn secret_id)', () => {
    const ring = createMasterKeyring([key()]);
    const ctx2 = { ...ctx, secretId: '01JSEC0000000000000000000B' };
    const s1 = sealSecret('bí mật một', ctx, ring);
    const s2 = sealSecret('bí mật hai', ctx2, ring);
    expect(() => openSecret({ ...s2, ciphertext: s1.ciphertext, nonce: s1.nonce }, ctx2, ring)).toThrow(
      SecretDecryptError,
    );
    expect(() => openSecret(s1, ctx2, ring)).toThrow(SecretDecryptError);
  });

  it('thiếu khoá ⇒ SecretKeyUnavailableError ("không có khoá", không báo nhầm là bị sửa); kek_id đổi sang khoá khác ⇒ DecryptError', () => {
    const [k1, k2] = [key(), key()];
    const sealed = sealSecret(token, ctx, createMasterKeyring([k1]));
    expect(() => openSecret(sealed, ctx, createMasterKeyring([k2]))).toThrow(SecretKeyUnavailableError);
    const both = createMasterKeyring([k2, k1]);
    expect(() => openSecret({ ...sealed, kekId: masterKeyId(k2) }, ctx, both)).toThrow(SecretDecryptError);
  });

  it('xoay KEK: rewrap sang khoá mới, ciphertext giữ nguyên, khoá cũ bỏ được; đã ở khoá mới ⇒ null', () => {
    const [oldK, newK] = [key(), key()];
    const sealed = sealSecret(token, ctx, createMasterKeyring([oldK]));
    const rotating = createMasterKeyring([newK, oldK]);
    const up = rewrapSecret(sealed, ctx, rotating);
    if (!up) throw new Error('phải rewrap');
    expect(up.kekId).toBe(masterKeyId(newK));
    const after = { ...sealed, ...up };
    const onlyNew = createMasterKeyring([newK]);
    expect(openSecret(after, ctx, onlyNew).toString()).toBe(token);
    expect(() => openSecret(sealed, ctx, onlyNew)).toThrow(SecretKeyUnavailableError);
    expect(up.fingerprint).toBe(sealSecret(token, ctx, onlyNew).fingerprint);
    expect(up.fingerprint).not.toBe(sealed.fingerprint);
    expect(rewrapSecret(after, ctx, onlyNew)).toBeNull();
    // rewrap không cứu được bí mật bị sửa
    expect(() =>
      rewrapSecret({ ...sealed, ciphertext: Buffer.alloc(sealed.ciphertext.byteLength) }, ctx, rotating),
    ).toThrow(SecretDecryptError);
  });

  it('ca âm: bản rõ rỗng / quá trần; ngữ cảnh rỗng', () => {
    const ring = createMasterKeyring([key()]);
    expect(() => sealSecret('', ctx, ring)).toThrow(RangeError);
    expect(() => sealSecret('x'.repeat(MAX_SECRET_BYTES + 1), ctx, ring)).toThrow(RangeError);
    expect(() => sealSecret('abc', { ...ctx, kind: '' }, ring)).toThrow(RangeError);
  });
});
