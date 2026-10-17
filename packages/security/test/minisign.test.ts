// Kiểm chữ ký minisign cho updater (BUILD-PLAN §A.1, §B.9, CNS-141). Vector THẬT do minisign 0.11 sinh (test/fixtures/minisign/,
// xem README.txt) + chữ ký dựng trong test bằng khoá sinh lúc chạy cho các ca biên.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compareSemver,
  MAX_MANIFEST_BYTES,
  MinisignKeyError,
  parseMinisignPublicKey,
  parseSemver,
  verifyMinisign,
  verifyReleaseManifest,
} from '../src/index.ts';
import { minisignSign, newMinisignKey } from './helpers.ts';

const FX = join(import.meta.dirname, 'fixtures', 'minisign');
const fx = (n: string) => readFileSync(join(FX, n));
const fxt = (n: string) => readFileSync(join(FX, n), 'utf8');

const PUB_A = parseMinisignPublicKey(fxt('release-a.pub'));
const PUB_B = parseMinisignPublicKey(fxt('release-b.pub'));
const M011 = fx('manifest-0.1.1.bin');
const SIG011 = fxt('manifest-0.1.1.json.minisig');

describe('tương thích định dạng với minisign thật', () => {
  it('chữ ký đúng + khoá ghim đúng ⇒ qua; trả trusted comment', () => {
    expect(verifyMinisign(M011, SIG011, PUB_A)).toEqual({
      ok: true,
      trustedComment: 'timestamp:1760600000\tfile:release-manifest.json\thashed',
    });
    expect(verifyMinisign(fx('manifest-0.1.0.bin'), fxt('manifest-0.1.0.json.minisig'), PUB_A).ok).toBe(true);
  });
  it('ca âm: ký bằng khoá khác (khoá B) ⇒ key_mismatch; ghim khoá B mà chữ ký của A ⇒ key_mismatch', () => {
    expect(verifyMinisign(M011, fxt('manifest-0.1.1.otherkey.minisig'), PUB_A)).toEqual({
      ok: false,
      reason: 'key_mismatch',
    });
    expect(verifyMinisign(M011, SIG011, PUB_B)).toEqual({ ok: false, reason: 'key_mismatch' });
  });
  it('ca âm: chữ ký legacy "Ed" (minisign -l) bị từ chối', () => {
    expect(verifyMinisign(M011, fxt('manifest-0.1.1.legacy.minisig'), PUB_A)).toEqual({
      ok: false,
      reason: 'legacy_signature',
    });
  });
  it('ca âm: sửa 1 byte manifest ⇒ bad_signature', () => {
    for (const i of [0, 10, M011.byteLength - 2]) {
      const m = Buffer.from(M011);
      m[i] = (m[i] as number) ^ 1;
      expect(verifyMinisign(m, SIG011, PUB_A)).toEqual({ ok: false, reason: 'bad_signature' });
    }
  });
  it('ca âm: đổi trusted comment / chữ ký toàn cục ⇒ bad_global_signature', () => {
    const forgedComment = SIG011.replace('timestamp:1760600000', 'timestamp:1999999999');
    expect(verifyMinisign(M011, forgedComment, PUB_A)).toEqual({ ok: false, reason: 'bad_global_signature' });
    const lines = SIG011.split('\n');
    const g = Buffer.from(lines[3] as string, 'base64');
    g[5] = (g[5] as number) ^ 1;
    lines[3] = g.toString('base64');
    expect(verifyMinisign(M011, lines.join('\n'), PUB_A)).toEqual({ ok: false, reason: 'bad_global_signature' });
  });
  it('ca âm: cùng key_id nhưng khoá công khai khác (khoá giả mạo id) ⇒ bad_signature', () => {
    const rawA = Buffer.from(fxt('release-a.pub').trim().split('\n')[1] as string, 'base64');
    const rawB = Buffer.from(fxt('release-b.pub').trim().split('\n')[1] as string, 'base64');
    const spoof = Buffer.concat([rawA.subarray(0, 10), rawB.subarray(10)]).toString('base64');
    expect(verifyMinisign(M011, SIG011, parseMinisignPublicKey(spoof))).toEqual({ ok: false, reason: 'bad_signature' });
  });
  it('ca âm: tệp chữ ký hỏng / thiếu dòng / base64 sai / sai độ dài / thuật toán lạ / quá lớn', () => {
    const lines = SIG011.trimEnd().split('\n');
    const bad = [
      '',
      lines.slice(0, 3).join('\n'),
      [lines[0], 'không-phải-base64!', lines[2], lines[3]].join('\n'),
      [lines[0], Buffer.alloc(70).toString('base64'), lines[2], lines[3]].join('\n'),
      [`x${lines[0]}`, lines[1], lines[2], lines[3]].join('\n'),
      [lines[0], lines[1], 'trusted:x', lines[3]].join('\n'),
    ];
    for (const b of bad) expect(verifyMinisign(M011, b, PUB_A)).toEqual({ ok: false, reason: 'malformed' });
    const raw = Buffer.from(lines[1] as string, 'base64');
    raw.write('XX', 0, 'latin1');
    expect(verifyMinisign(M011, [lines[0], raw.toString('base64'), lines[2], lines[3]].join('\n'), PUB_A)).toEqual({
      ok: false,
      reason: 'unsupported_algorithm',
    });
    expect(verifyMinisign(Buffer.alloc(MAX_MANIFEST_BYTES + 1), SIG011, PUB_A)).toEqual({
      ok: false,
      reason: 'too_large',
    });
  });
  it('ca âm: khoá công khai ghim hỏng ⇒ ném lỗi (lỗi đóng gói, không lặng lẽ bỏ qua)', () => {
    expect(() => parseMinisignPublicKey('')).toThrow(MinisignKeyError);
    expect(() => parseMinisignPublicKey('RWQ')).toThrow(MinisignKeyError);
    expect(() => parseMinisignPublicKey(Buffer.alloc(42).toString('base64'))).toThrow(MinisignKeyError);
  });
});

describe('verifyReleaseManifest: chữ ký → JSON → chặn hạ cấp', () => {
  it('bản mới hơn, đúng chữ ký ⇒ ok', () => {
    const r = verifyReleaseManifest({ manifest: M011, signature: SIG011, publicKey: PUB_A, currentVersion: '0.1.0' });
    expect(r).toMatchObject({ ok: true, version: '0.1.1' });
  });
  it('ca âm: manifest hạ cấp (0.1.0 đã ký hợp lệ, đang chạy 0.1.1) ⇒ downgrade; cùng bản ⇒ not_newer', () => {
    const m010 = fx('manifest-0.1.0.bin');
    const s010 = fxt('manifest-0.1.0.json.minisig');
    expect(
      verifyReleaseManifest({ manifest: m010, signature: s010, publicKey: PUB_A, currentVersion: '0.1.1' }),
    ).toEqual({
      ok: false,
      reason: 'downgrade',
    });
    expect(
      verifyReleaseManifest({ manifest: M011, signature: SIG011, publicKey: PUB_A, currentVersion: '0.1.1' }),
    ).toEqual({
      ok: false,
      reason: 'not_newer',
    });
  });
  it('ca âm: không chữ ký / sai khoá ⇒ từ chối TRƯỚC khi parse', () => {
    expect(verifyReleaseManifest({ manifest: M011, signature: '', publicKey: PUB_A, currentVersion: '0.1.0' }).ok).toBe(
      false,
    );
    expect(
      verifyReleaseManifest({ manifest: M011, signature: SIG011, publicKey: PUB_B, currentVersion: '0.1.0' }),
    ).toEqual({
      ok: false,
      reason: 'key_mismatch',
    });
  });
  it('ca âm: ký đúng nhưng không phải JSON / thiếu version / version sai semver / là mảng', () => {
    const k = newMinisignKey();
    const pub = parseMinisignPublicKey(k.publicText);
    const run = (body: string) =>
      verifyReleaseManifest({
        manifest: Buffer.from(body),
        signature: minisignSign(Buffer.from(body), k),
        publicKey: pub,
        currentVersion: '0.1.0',
      });
    expect(run('{không phải json')).toEqual({ ok: false, reason: 'not_json' });
    expect(run('{"channel":"stable"}')).toEqual({ ok: false, reason: 'bad_manifest' });
    expect(run('{"version":"latest"}')).toEqual({ ok: false, reason: 'bad_manifest' });
    expect(run('[{"version":"9.9.9"}]')).toEqual({ ok: false, reason: 'bad_manifest' });
    expect(run('{"version":"0.2.0"}')).toMatchObject({ ok: true, version: '0.2.0' });
    expect(() =>
      verifyReleaseManifest({ manifest: M011, signature: SIG011, publicKey: PUB_A, currentVersion: 'dev' }),
    ).toThrow(RangeError);
  });
  it('chữ ký dựng trong test khớp đúng định dạng (đối chứng bộ ký test với minisign thật)', () => {
    const k = newMinisignKey();
    const body = Buffer.from('{"version":"1.0.0"}');
    expect(verifyMinisign(body, minisignSign(body, k), parseMinisignPublicKey(k.publicText)).ok).toBe(true);
    expect(verifyMinisign(body, minisignSign(body, k, { alg: 'Ed' }), parseMinisignPublicKey(k.publicText))).toEqual({
      ok: false,
      reason: 'legacy_signature',
    });
  });
});

describe('semver', () => {
  it('thứ tự semver §11 (ví dụ của đặc tả) + tiền tố v + build metadata bỏ qua', () => {
    const order = [
      '1.0.0-alpha',
      '1.0.0-alpha.1',
      '1.0.0-alpha.beta',
      '1.0.0-beta',
      '1.0.0-beta.2',
      '1.0.0-beta.11',
      '1.0.0-rc.1',
      '1.0.0',
      '1.0.1',
      '1.1.0',
      '2.0.0',
      '10.0.0',
    ];
    for (let i = 0; i < order.length - 1; i++) {
      expect(compareSemver(order[i] as string, order[i + 1] as string), `${order[i]} < ${order[i + 1]}`).toBe(-1);
      expect(compareSemver(order[i + 1] as string, order[i] as string)).toBe(1);
    }
    expect(compareSemver('v0.1.0', '0.1.0')).toBe(0);
    expect(compareSemver('1.0.0+build.5', '1.0.0')).toBe(0);
  });
  it('ca âm: chuỗi không đúng semver', () => {
    for (const b of ['', '1', '1.0', '01.0.0', '1.0.0-', '1.0.0-01', 'x.y.z', '1.0.0-a..b', `${'9'.repeat(12)}.0.0`]) {
      expect(parseSemver(b), b).toBeNull();
    }
    expect(() => compareSemver('1.0', '1.0.0')).toThrow(RangeError);
  });
});
