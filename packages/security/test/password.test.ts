// argon2id + mật khẩu lần đầu + chính sách mật khẩu mới (FS Chương 1, STD-06). Mỗi lối vào có ca âm.

import { argon2id } from 'hash-wasm';
import { describe, expect, it } from 'vitest';
import {
  ARGON2ID,
  FIRST_PASSWORD_WORDS,
  firstPasswordEntropyBits,
  generateFirstPassword,
  hashPassword,
  needsRehash,
  PASSWORD_RULES,
  PasswordHasherBusyError,
  PasswordHashFormatError,
  validateNewPassword,
  verifyAgainstDummy,
  verifyPassword,
} from '../src/index.ts';

describe('argon2id', () => {
  it('băm ra chuỗi PHC đúng tham số, kiểm đúng / sai', async () => {
    const phc = await hashPassword('tide-amber-quiet-9142');
    expect(phc).toMatch(
      new RegExp(
        `^\\$argon2id\\$v=19\\$m=${ARGON2ID.memoryKiB},t=${ARGON2ID.iterations},p=${ARGON2ID.parallelism}\\$[A-Za-z0-9+/]{22}\\$[A-Za-z0-9+/]{43}$`,
      ),
    );
    expect(await verifyPassword('tide-amber-quiet-9142', phc)).toBe(true);
    expect(await verifyPassword('tide-amber-quiet-9143', phc)).toBe(false);
    expect(await verifyPassword('', phc)).toBe(false);
    expect(needsRehash(phc)).toBe(false);
  });

  it('salt ngẫu nhiên: cùng mật khẩu ⇒ hai chuỗi băm khác nhau', async () => {
    const [a, b] = await Promise.all([hashPassword('cùng-một-mật-khẩu'), hashPassword('cùng-một-mật-khẩu')]);
    expect(a).not.toBe(b);
  });

  it('chuẩn hoá NFC: tiếng Việt gõ NFD (macOS) và NFC (Windows) là một mật khẩu', async () => {
    const nfc = 'mật khẩu bí mật 2026'.normalize('NFC');
    const nfd = nfc.normalize('NFD');
    expect(nfd).not.toBe(nfc);
    const phc = await hashPassword(nfd);
    expect(await verifyPassword(nfc, phc)).toBe(true);
  });

  it('kiểm được chuỗi băm tham số cũ (do hash-wasm sinh) và báo cần băm lại', async () => {
    const salt = new Uint8Array(16).fill(7);
    const old = await argon2id({
      password: 'mật khẩu cũ rất dài',
      salt,
      parallelism: 1,
      iterations: 2,
      memorySize: 19_456,
      hashLength: 32,
      outputType: 'encoded',
    });
    expect(await verifyPassword('mật khẩu cũ rất dài', old)).toBe(true);
    expect(needsRehash(old)).toBe(true);
  });

  it('ca âm: mật khẩu vượt trần byte ⇒ kiểm trả false (không băm), băm ném lỗi', async () => {
    const phc = await hashPassword('ngắn nhưng đủ dài');
    const huge = 'a'.repeat(PASSWORD_RULES.maxBytes + 1);
    expect(await verifyPassword(huge, phc)).toBe(false);
    await expect(hashPassword(huge)).rejects.toThrow(RangeError);
  });

  it('ca âm: chuỗi băm hỏng / sai thuật toán / tham số ngoài khoảng ⇒ PasswordHashFormatError (không nuốt thành "sai mật khẩu")', async () => {
    const phc = await hashPassword('một mật khẩu');
    const bad = [
      '',
      'plaintext',
      phc.replace('argon2id', 'argon2i'),
      phc.replace('v=19', 'v=16'),
      phc.replace(/m=\d+/, 'm=4194304'),
      phc.replace(/t=\d+/, 't=99'),
      phc.replace(/p=\d+/, 'p=64'),
      `${phc}$extra`,
      phc.replace(/\$[^$]+$/, '$short'),
    ];
    for (const b of bad) {
      await expect(verifyPassword('một mật khẩu', b), b).rejects.toThrow(PasswordHashFormatError);
      expect(needsRehash(b), b).toBe(true);
    }
  });

  it('băm chạy ngoài event loop chính (worker): timer vẫn chạy trong lúc băm', async () => {
    let ticks = 0;
    const timer = setInterval(() => ticks++, 10);
    const t0 = performance.now();
    await hashPassword('đo-thời-gian-băm');
    const ms = performance.now() - t0;
    clearInterval(timer);
    console.info(
      `argon2id m=${ARGON2ID.memoryKiB} KiB t=${ARGON2ID.iterations} p=${ARGON2ID.parallelism}: ${ms.toFixed(0)} ms`,
    );
    expect(ticks).toBeGreaterThan(Math.floor(ms / 10 / 4));
  });

  it('hàng đợi có trần: quá 16 lượt đồng thời ⇒ PasswordHasherBusyError', async () => {
    const jobs = Array.from({ length: 17 }, (_, i) => hashPassword(`song song ${i}`).then(() => 'ok' as const));
    const results = await Promise.allSettled(jobs);
    const busy = results.filter((r) => r.status === 'rejected' && r.reason instanceof PasswordHasherBusyError);
    expect(busy.length).toBe(1);
    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(16);
  }, 120_000);

  it('verifyAgainstDummy luôn false (dùng cho tên đăng nhập không tồn tại)', async () => {
    expect(await verifyAgainstDummy('bất kỳ')).toBe(false);
  });
});

describe('mật khẩu lần đầu (STD-06: vài từ dễ đọc)', () => {
  it('dạng từ-từ-từ-4 chữ số, từ thuộc danh sách, CSPRNG không trùng trong 2000 lần', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const p = generateFirstPassword();
      const m = /^([a-z]{3,8})-([a-z]{3,8})-([a-z]{3,8})-(\d{4})$/.exec(p);
      expect(m, p).not.toBeNull();
      for (const w of (m as RegExpExecArray).slice(1, 4)) expect(FIRST_PASSWORD_WORDS).toContain(w);
      seen.add(p);
    }
    expect(seen.size).toBe(2000);
  });
  it('entropy ≥ 40 bit; danh sách từ không trùng, chỉ a–z 3–8 ký tự, không chứa tên model / CLI / owner', () => {
    expect(firstPasswordEntropyBits()).toBeGreaterThanOrEqual(40);
    expect(new Set(FIRST_PASSWORD_WORDS).size).toBe(FIRST_PASSWORD_WORDS.length);
    for (const w of FIRST_PASSWORD_WORDS) expect(w).toMatch(/^[a-z]{3,8}$/);
    const banned =
      /(a[g]y|antigravit[y]|cla[u]de|code[x]|opencla[w]|gem[i]ni|gp[t]|op[u]s|son[n]et|hai[k]u|lla[m]a|mistra[l]|gr[o]k|deepsee[k]|qwe[n]|r[y]an|colamacboo[k])/;
    expect(FIRST_PASSWORD_WORDS.filter((w) => banned.test(w))).toEqual([]);
  });
  it('mật khẩu lần đầu qua được bộ phát hiện credential? — không cần (không bao giờ đi ra kênh nào), nhưng băm được', async () => {
    const p = generateFirstPassword();
    expect(await verifyPassword(p, await hashPassword(p))).toBe(true);
  });
});

describe('chính sách mật khẩu mới', () => {
  const ctx = { username: 'admin', currentPassword: 'tide-amber-quiet-9142' };
  it('đạt', () => {
    expect(validateNewPassword('một câu dễ nhớ cho riêng tôi', ctx)).toEqual({ ok: true });
  });
  it('ca âm từng luật', () => {
    expect(validateNewPassword('ngắn quá', ctx)).toEqual({ ok: false, reason: 'too_short' });
    expect(validateNewPassword('x'.repeat(PASSWORD_RULES.maxChars + 1), ctx)).toMatchObject({ reason: 'too_long' });
    expect(validateNewPassword('ạ'.repeat(400), ctx)).toMatchObject({ ok: false });
    expect(validateNewPassword('aaaaaaaaaaaaaaaa', ctx)).toEqual({ ok: false, reason: 'too_repetitive' });
    expect(validateNewPassword('abababababababab', ctx)).toEqual({ ok: false, reason: 'too_repetitive' });
    expect(validateNewPassword('my-Admin-password-2026', ctx)).toEqual({ ok: false, reason: 'contains_username' });
    expect(validateNewPassword('tide-amber-quiet-9142', ctx)).toEqual({ ok: false, reason: 'same_as_current' });
    expect(validateNewPassword('tide-amber-quiet-9142'.normalize('NFD'), ctx)).toEqual({
      ok: false,
      reason: 'same_as_current',
    });
  });
});
