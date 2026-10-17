// Gói skin tam-quoc-chibi 1.0.0: manifest ↔ tệp nhân vật ↔ ASSET_MANIFEST.json ↔ ràng buộc seed của DB (skin_assets chibi).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CHAR_KIND_TO_DB,
  ChibiSpecError,
  canonicalJson,
  cast,
  GENDER_TO_DB,
  hasChar,
  loadSkinPack,
  SkinPackManifestV1,
  unregister,
} from '../src/index.ts';
import { CODES, clone, manifest, PACK_DIR, REPO, rawSpec, readJson } from './support/pack.ts';

afterEach(() => {
  for (const c of cast()) unregister(c.id);
});

const sha = (b: string | Buffer) => createHash('sha256').update(b).digest('hex');
type M = { characters: Record<string, unknown>[] };
const first = (m: M): Record<string, unknown> => {
  const c = m.characters[0];
  if (!c) throw new Error('manifest không có nhân vật');
  return c;
};
const reader = (over?: Record<string, unknown>) => (file: string) => over?.[file] ?? readJson(file);

describe('manifest gói', () => {
  it('đúng schema, đúng nguồn + license (STD-04), đúng 10 mã theo thứ tự Kho', () => {
    const m = SkinPackManifestV1.parse(manifest());
    expect(m).toMatchObject({
      pack: 'tam-quoc-chibi',
      version: '1.0.0',
      source: 'Afi Labs — vẽ bằng code (SVG + CSS)',
      license: 'Proprietary — Afi Labs',
      attribution: null,
      paramsSchema: 1,
    });
    expect(m.characters.map((c) => c.asset_code)).toEqual([...CODES]);
  });

  it('char_kind / gender khớp enum của DB và khớp tham số nhân vật; params_sha256 = sha256(JCS) của tệp', () => {
    const m = SkinPackManifestV1.parse(manifest());
    for (const c of m.characters) {
      const s = rawSpec(c.asset_code);
      expect(c.char_kind).toBe(CHAR_KIND_TO_DB[s.kind]);
      expect(c.gender).toBe(GENDER_TO_DB[s.gender]);
      expect(c.params_sha256).toBe(sha(canonicalJson(s)));
      expect(c.file).toBe(`characters/${c.asset_code}.json`);
    }
    expect(new Set(m.characters.map((c) => c.char_kind))).toEqual(
      new Set(['civil', 'martial', 'strategist', 'lord', 'soldier']),
    );
    expect(new Set(m.characters.map((c) => c.gender))).toEqual(new Set(['male', 'female']));
  });

  it('mọi tệp của gói có trong ASSET_MANIFEST.json với sha256 đúng + license cho phép', () => {
    const am = JSON.parse(readFileSync(join(REPO, 'ASSET_MANIFEST.json'), 'utf8')) as {
      assets: { path: string; sha256: string; license: string; source: string }[];
    };
    const files = ['manifest.json', ...readdirSync(join(PACK_DIR, 'characters')).map((f) => `characters/${f}`)];
    expect(files).toHaveLength(11);
    for (const f of files) {
      const e = am.assets.find((a) => a.path === `skins/tam-quoc-chibi/1.0.0/${f}`);
      expect(e, f).toBeTruthy();
      expect(e?.sha256).toBe(sha(readFileSync(join(PACK_DIR, f))));
      expect(e?.license).toBe('Proprietary — Afi Labs');
      expect(e?.source).toBe('Afi Labs — vẽ bằng code (SVG + CSS)');
    }
  });

  it('JCS: khoá sắp xếp, không khoảng trắng, ổn định theo thứ tự khoá đầu vào', () => {
    expect(canonicalJson({ b: [1, { z: 1, a: 2 }], a: 'x', u: undefined })).toBe('{"a":"x","b":[1,{"a":2,"z":1}]}');
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
    expect(() => canonicalJson({ a: Number.NaN })).toThrow();
  });
});

describe('loadSkinPack()', () => {
  it('nạp đủ 10 nhân vật', () => {
    const out = loadSkinPack(manifest(), reader());
    expect(out.map((s) => s.id)).toEqual([...CODES]);
    expect(cast()).toHaveLength(10);
  });

  it('manifest sai → ChibiSpecError, không đăng ký gì', () => {
    const m = clone(manifest()) as Record<string, unknown>;
    m.evil = true;
    expect(() => loadSkinPack(m, reader())).toThrow(ChibiSpecError);
    expect(cast()).toHaveLength(0);
  });

  it('đường dẫn tệp thoát ra ngoài thư mục characters/ bị từ chối', () => {
    const m = clone(manifest()) as { characters: { file: string }[] };
    (m.characters[0] as { file: string }).file = '../../../etc/passwd';
    expect(() => loadSkinPack(m, reader())).toThrow(ChibiSpecError);
  });

  it.each([
    [
      'asset_code lệch id trong tệp',
      (m: M) => {
        first(m).asset_code = 'tq999';
        first(m).file = 'characters/tq046.json';
      },
      /id trong tệp/,
    ],
    [
      'char_kind lệch',
      (m: M) => {
        first(m).char_kind = 'soldier';
      },
      /char_kind/,
    ],
    [
      'gender lệch',
      (m: M) => {
        first(m).gender = 'female';
      },
      /gender/,
    ],
    [
      'tên lệch',
      (m: M) => {
        first(m).name = 'Người khác';
      },
      /name/,
    ],
  ])('%s → từ chối cả gói', (_n, mutate, re) => {
    const m = clone(manifest()) as { characters: Record<string, unknown>[] };
    mutate(m);
    expect(() => loadSkinPack(m, reader())).toThrow(re);
    expect(cast()).toHaveLength(0);
  });

  it('một tệp nhân vật có `over` → cả gói bị từ chối, thông báo nêu rõ lý do', () => {
    const bad = { ...(clone(rawSpec('tq044')) as object), over: { wait: { m: ['stomp'] } } };
    let err: unknown;
    try {
      loadSkinPack(manifest(), reader({ 'characters/tq044.json': bad }));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ChibiSpecError);
    expect((err as ChibiSpecError).message).toMatch(/over/);
    expect(hasChar('tq046')).toBe(false);
  });

  it('thiếu tệp (read ném lỗi) → lỗi truyền ra, không nuốt', () => {
    expect(() =>
      loadSkinPack(manifest(), (f) => {
        if (f.endsWith('tq045.json')) throw new Error('ENOENT giả');
        return readJson(f);
      }),
    ).toThrow(/ENOENT giả/);
    expect(cast()).toHaveLength(0);
  });
});
