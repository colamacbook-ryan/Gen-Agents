// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateMinisignKey, minisignPublicKeyFile, signMinisign } from '../update-feed/minisign.ts';
import { DEFAULT_RELEASES, type FakeUpdateFeed, startUpdateFeed } from '../update-feed/server.ts';
import { tmp } from './helpers.ts';
import { verifyMinisign } from './minisign-verify.ts';

let feed: FakeUpdateFeed | undefined;
afterEach(async () => {
  await feed?.close();
  feed = undefined;
});

const get = async (url: string) => {
  const r = await fetch(url);
  return { status: r.status, text: await r.text() };
};

/** Binary `minisign` thật (nếu máy có) — đối chiếu định dạng với chính chủ. Đặt MINISIGN_BIN=/đường/minisign. */
const REAL = process.env.MINISIGN_BIN ?? (spawnSync('minisign', ['-v']).error ? undefined : 'minisign');

describe('minisign (định dạng ED, khoá test sinh lúc chạy)', () => {
  it('ký xong, bộ kiểm độc lập xác nhận; sai 1 byte thông điệp / sai trusted comment / khoá khác ⇒ từ chối', () => {
    const key = generateMinisignKey();
    const pub = minisignPublicKeyFile(key);
    const msg = Buffer.from('thông điệp phát hành');
    const sig = signMinisign(msg, key, 'timestamp:1760000000\tfile:manifest.json');
    expect(verifyMinisign(pub, msg, sig)).toEqual({ ok: true });
    expect(verifyMinisign(pub, Buffer.from('thông điệp phát hành!'), sig).ok).toBe(false);
    expect(verifyMinisign(pub, msg, sig.replace('timestamp:1760000000', 'timestamp:1760000001')).reason).toBe(
      'chữ ký chung sai',
    );
    expect(verifyMinisign(minisignPublicKeyFile(generateMinisignKey()), msg, sig).reason).toBe('key id không khớp');
    // cùng key id nhưng khoá thật khác (giả mạo key id) ⇒ sai chữ ký
    const forged = generateMinisignKey();
    forged.keyId = key.keyId;
    expect(verifyMinisign(minisignPublicKeyFile(forged), msg, sig).reason).toBe('chữ ký sai');
  });

  it('mỗi lần sinh ra khoá khác nhau (không có khoá cố định nào nằm trong repo)', () => {
    expect(minisignPublicKeyFile(generateMinisignKey())).not.toBe(minisignPublicKeyFile(generateMinisignKey()));
  });

  it.skipIf(!REAL)('TƯƠNG THÍCH: binary minisign thật kiểm được chữ ký của fake, và từ chối chữ ký sai', () => {
    const dir = tmp();
    const key = generateMinisignKey();
    const msg = 'manifest thật\n';
    writeFileSync(join(dir, 'm.json'), msg);
    writeFileSync(
      join(dir, 'm.json.minisig'),
      signMinisign(Buffer.from(msg), key, 'timestamp:1760000000\tfile:m.json'),
    );
    writeFileSync(join(dir, 'k.pub'), minisignPublicKeyFile(key));
    const out = execFileSync(REAL as string, ['-V', '-p', join(dir, 'k.pub'), '-m', join(dir, 'm.json')], {
      encoding: 'utf8',
    });
    expect(out).toContain('Signature and comment signature verified');
    writeFileSync(join(dir, 'm.json'), `${msg}x`);
    const bad = spawnSync(REAL as string, ['-V', '-p', join(dir, 'k.pub'), '-m', join(dir, 'm.json')], {
      encoding: 'utf8',
    });
    expect(bad.status).not.toBe(0);
  });
});

describe('update-feed: các bản phát hành', () => {
  it('danh sách mặc định có đủ: hợp lệ, chữ ký sai, bị sửa, không chữ ký, hạ cấp, đổi compose', () => {
    expect(DEFAULT_RELEASES.map((r) => `${r.version}:${r.variant}`)).toEqual([
      '0.1.0:valid',
      '0.1.1:valid',
      '0.1.2-bad:valid',
      '0.1.3-unsigned:unsigned',
      '0.1.3-badsig:badsig',
      '0.1.3-tampered:tampered',
      '0.1.4-compose:valid',
      '0.0.9-downgrade:downgrade',
    ]);
  });

  it('feed.json liệt kê bản; manifest + .minisig lấy qua HTTP; khoá công khai qua /minisign.pub và /_test/pubkey', async () => {
    feed = await startUpdateFeed();
    const list = JSON.parse((await get(`${feed.url}/feed.json`)).text) as {
      releases: Array<{ version: string; manifest: string; signature: string }>;
    };
    expect(list.releases.map((r) => r.version)).toHaveLength(DEFAULT_RELEASES.length);
    const pub = (await get(`${feed.url}/minisign.pub`)).text;
    expect(pub).toBe(feed.publicKeyFile);
    expect(JSON.parse((await get(`${feed.url}/_test/pubkey`)).text)).toMatchObject({
      publicKeyBase64: feed.publicKeyBase64,
    });
    const m = await get(`${feed.url}/releases/0.1.1/manifest.json`);
    const s = await get(`${feed.url}/releases/0.1.1/manifest.json.minisig`);
    expect(verifyMinisign(pub, Buffer.from(m.text), s.text)).toEqual({ ok: true });
    expect(JSON.parse(m.text)).toMatchObject({
      version: '0.1.1',
      images: { 'gen-agents': 'localhost:5000/genagents/gen-agents:0.1.1' },
    });
  });

  it('bản hợp lệ qua; chữ ký sai / bị sửa / không chữ ký / khoá lạ đều bị từ chối bởi bộ kiểm độc lập', async () => {
    feed = await startUpdateFeed();
    const verdict = async (v: string) => {
      const m = await get(`${feed?.url}/releases/${v}/manifest.json`);
      const s = await get(`${feed?.url}/releases/${v}/manifest.json.minisig`);
      return s.status === 404
        ? 'no-signature'
        : verifyMinisign(feed?.publicKeyFile as string, Buffer.from(m.text), s.text);
    };
    expect(await verdict('0.1.0')).toEqual({ ok: true });
    expect(await verdict('0.1.1')).toEqual({ ok: true });
    expect(await verdict('0.1.2-bad')).toEqual({ ok: true }); // "bad" = healthcheck trượt do image, chữ ký vẫn đúng
    expect(await verdict('0.1.4-compose')).toEqual({ ok: true });
    expect(await verdict('0.1.3-unsigned')).toBe('no-signature');
    expect(await verdict('0.1.3-badsig')).toMatchObject({ ok: false, reason: 'key id không khớp' });
    expect(await verdict('0.1.3-tampered')).toMatchObject({ ok: false, reason: 'chữ ký sai' });
    // bản hạ cấp: chữ ký ĐÚNG, nên việc từ chối phải dựa vào so version (updater), không phải chữ ký
    expect(await verdict('0.0.9-downgrade')).toEqual({ ok: true });
  });

  it('bản tampered: nội dung phục vụ KHÁC nội dung đã ký; bản compose khai đổi compose + khoá .env + migration', async () => {
    feed = await startUpdateFeed();
    expect((await get(`${feed.url}/releases/0.1.3-tampered/manifest.json`)).text).toContain('0.1.3-tampered+evil');
    const c = JSON.parse((await get(`${feed.url}/releases/0.1.4-compose/manifest.json`)).text);
    expect(c).toMatchObject({
      compose: { changed: true },
      envAdd: ['GA_FAKE_NEW_SETTING'],
      migrations: ['0001-add-env-key.sh'],
    });
    expect(JSON.parse((await get(`${feed.url}/releases/0.1.1/manifest.json`)).text)).toMatchObject({
      compose: { changed: false },
      envAdd: [],
      migrations: [],
    });
  });

  it('khoá test sinh lúc chạy: hai feed có khoá khác nhau; chữ ký feed này không qua được khoá feed kia', async () => {
    feed = await startUpdateFeed();
    const other = await startUpdateFeed();
    try {
      expect(other.publicKeyFile).not.toBe(feed.publicKeyFile);
      const m = await get(`${feed.url}/releases/0.1.1/manifest.json`);
      const s = await get(`${feed.url}/releases/0.1.1/manifest.json.minisig`);
      expect(verifyMinisign(other.publicKeyFile, Buffer.from(m.text), s.text).ok).toBe(false);
    } finally {
      await other.close();
    }
  });

  it('ca âm: bản lạ / đường lạ ⇒ 404; method khác GET ⇒ 405', async () => {
    feed = await startUpdateFeed({ releases: [{ version: '1.0.0', variant: 'valid' }] });
    expect((await get(`${feed.url}/releases/9.9.9/manifest.json`)).status).toBe(404);
    expect((await get(`${feed.url}/releases/1.0.0/other.json`)).status).toBe(404);
    expect((await get(`${feed.url}/releases/..%2F..%2Fetc/manifest.json`)).status).toBe(404);
    expect((await fetch(`${feed.url}/feed.json`, { method: 'POST' })).status).toBe(405);
  });
});
