// Niêm phong một gói skin: sinh manifest.json từ các tệp nhân vật + cập nhật mục của gói trong ASSET_MANIFEST.json (sha256 tệp).
// Dùng:  pnpm --filter @ga/chibi skin:seal            (gói tam-quoc-chibi 1.0.0)
//        node scripts/seal-skin.ts <thư-mục-gói>      (đường dẫn tương đối từ gốc repo)
// Tệp nhân vật (characters/*.json) là SSOT: sửa tay hoặc do Xưởng sinh, rồi chạy lệnh này; không sửa manifest.json bằng tay.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/jcs.ts';
import { validate } from '../src/schema.ts';
import { CHAR_KIND_TO_DB, GENDER_TO_DB } from '../src/skin-pack.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const packDir = resolve(ROOT, process.argv[2] ?? 'skins/tam-quoc-chibi/1.0.0');
const [pack, version] = [packDir.split('/').at(-2) as string, packDir.split('/').at(-1) as string];
// thứ tự hiển thị trong Kho = thứ tự mã trong research/tam-quoc-characters.csv
const ORDER = ['tq046', 'tq044', 'tq080', 'tq043', 'tq045', 'tq047', 'tq010', 'tq141', 'tq031', 'tqx001'];

const sha256 = (b: string | Buffer): string => createHash('sha256').update(b).digest('hex');
const biome = (file: string): void => {
  execFileSync(join(ROOT, 'node_modules', '.bin', 'biome'), ['format', '--write', file], { stdio: 'inherit' });
};

const files = readdirSync(join(packDir, 'characters')).filter((f) => f.endsWith('.json'));
const specs = files.map((f) => {
  const r = validate(JSON.parse(readFileSync(join(packDir, 'characters', f), 'utf8')));
  if (!r.ok) throw new Error(`${f}: ${r.errors.map((e) => `${e.path} ${e.message}`).join('; ')}`);
  if (`${r.value.id}.json` !== f) throw new Error(`${f}: tên tệp phải là <id>.json`);
  return r.value;
});
specs.sort((a, b) => (ORDER.indexOf(a.id) + 1 || 999) - (ORDER.indexOf(b.id) + 1 || 999) || a.id.localeCompare(b.id));

const manifest = {
  schema: 1,
  pack,
  version,
  source: 'Afi Labs — vẽ bằng code (SVG + CSS)',
  license: 'Proprietary — Afi Labs',
  attribution: null,
  paramsSchema: 1,
  characters: specs.map((s) => ({
    asset_code: s.id,
    file: `characters/${s.id}.json`,
    name: s.name,
    ...(s.han ? { han: s.han } : {}),
    faction: s.faction,
    char_kind: CHAR_KIND_TO_DB[s.kind],
    gender: GENDER_TO_DB[s.gender],
    params_sha256: sha256(canonicalJson(s)),
  })),
};
const manifestPath = join(packDir, 'manifest.json');
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
biome(manifestPath);

// ASSET_MANIFEST.json: thay toàn bộ mục của gói này, giữ nguyên mục khác
const amPath = join(ROOT, 'ASSET_MANIFEST.json');
const am = JSON.parse(readFileSync(amPath, 'utf8')) as { assets: { path: string }[] };
const prefix = `${relative(ROOT, packDir).split('\\').join('/')}/`;
const mine = [manifestPath, ...specs.map((s) => join(packDir, 'characters', `${s.id}.json`))].map((p) => ({
  path: relative(ROOT, p).split('\\').join('/'),
  source: manifest.source,
  license: manifest.license,
  sha256: sha256(readFileSync(p)),
}));
am.assets = [...am.assets.filter((a) => !a.path.startsWith(prefix)), ...mine];
writeFileSync(amPath, `${JSON.stringify(am, null, 2)}\n`);
biome(amPath);
console.log(`✓ ${pack}@${version}: ${specs.length} nhân vật, ${mine.length} mục trong ASSET_MANIFEST.json`);
