// Gói skin: manifest + một tệp JSON mỗi nhân vật (skins/<gói>/<phiên bản>/characters/<asset_code>.json).
// loadSkinPack kiểm manifest, kiểm từng nhân vật theo schema, đối chiếu manifest ↔ nhân vật, rồi đăng ký cả gói (hoặc không cái nào).
import { z } from 'zod';
import { ChibiSpecError, registerAll } from './registry.ts';
import { type ChibiParams, ChibiParamsV1, SCHEMA_VERSION, type ValidationIssue, validate } from './schema.ts';

/** engine `kind` / `gender` ↔ cột DB `skin_assets.char_kind` / `gender` (DATABASE v2.3.0) */
export const CHAR_KIND_TO_DB = {
  van: 'civil',
  vo: 'martial',
  muu: 'strategist',
  chu_cong: 'lord',
  linh: 'soldier',
} as const satisfies Record<ChibiParams['kind'], string>;
export const GENDER_TO_DB = { nam: 'male', nu: 'female' } as const satisfies Record<ChibiParams['gender'], string>;

const Text = z.string().min(1).max(200);
export const SkinPackManifestV1 = z.strictObject({
  schema: z.literal(1),
  pack: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  source: Text,
  license: Text,
  attribution: Text.nullable(),
  /** phiên bản schema tham số = skin_assets.params_schema_version */
  paramsSchema: z.literal(SCHEMA_VERSION),
  characters: z
    .array(
      z.strictObject({
        asset_code: ChibiParamsV1.shape.id,
        file: z.string().regex(/^characters\/[a-z0-9_-]+\.json$/),
        name: Text,
        han: Text.optional(),
        faction: Text,
        char_kind: z.enum(['civil', 'martial', 'strategist', 'lord', 'soldier']),
        gender: z.enum(['male', 'female']),
        /** sha256 (hex) của JSON chuẩn hoá (canonicalJson) của tệp nhân vật */
        params_sha256: z.string().regex(/^[0-9a-f]{64}$/),
      }),
    )
    .min(1)
    .max(200),
});
export type SkinPackManifest = z.infer<typeof SkinPackManifestV1>;

/** Nạp một gói: `read(file)` trả nội dung đã parse JSON của tệp nhân vật. Ném ChibiSpecError nếu bất kỳ chỗ nào sai. */
export function loadSkinPack(manifest: unknown, read: (file: string) => unknown): ChibiParams[] {
  const m = SkinPackManifestV1.safeParse(manifest);
  if (!m.success) {
    throw new ChibiSpecError(
      'manifest gói không hợp lệ',
      m.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  const issues: ValidationIssue[] = [];
  const specs: ChibiParams[] = [];
  m.data.characters.forEach((c, i) => {
    const r = validate(read(c.file));
    if (!r.ok) {
      issues.push(
        ...r.errors.map((e) => ({ path: `characters[${i}](${c.asset_code}).${e.path}`, message: e.message })),
      );
      return;
    }
    const s = r.value;
    const at = `characters[${i}](${c.asset_code})`;
    if (s.id !== c.asset_code) issues.push({ path: at, message: `id trong tệp "${s.id}" khác asset_code` });
    if (CHAR_KIND_TO_DB[s.kind] !== c.char_kind) issues.push({ path: at, message: 'char_kind lệch kind của nhân vật' });
    if (GENDER_TO_DB[s.gender] !== c.gender) issues.push({ path: at, message: 'gender lệch gender của nhân vật' });
    if (s.name !== c.name || s.faction !== c.faction || s.han !== c.han) {
      issues.push({ path: at, message: 'name / han / faction lệch tệp nhân vật' });
    }
    specs.push(s);
  });
  if (issues.length) throw new ChibiSpecError(`gói "${m.data.pack}" không nhất quán`, issues);
  return registerAll(specs);
}
