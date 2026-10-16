// Schema của một nhân vật chibi = bộ tham số JSON (ChibiParamsV1). Nhân vật CHỈ là dữ liệu: tham số ngoại hình + hồ sơ nhận diện
// khai báo. Hành vi nằm trong khung xương chung (TRAITS theo bộ phận), nên schema CẤM khoá `over` (STD-09 §4).
//
// Đây là ranh giới tin cậy: `params_json` có thể đến từ DB / nhập gói / (GĐ2) AI sinh. Mọi giá trị đi vào chuỗi SVG đều là
// enum đóng, màu #RRGGBB, số có cận, hoặc chuỗi `Seconds` — không có chuỗi tự do nào được ghép vào markup (chống chèn SVG / CSS).
import { z } from 'zod';
import { EMOTES } from './emotes.ts';
import {
  BEARD_NAMES,
  BROW_NAMES,
  CAP_NAMES,
  COLLAR_NAMES,
  EARS_NAMES,
  EYE_NAMES,
  FACE_NAMES,
  FRONT_NAMES,
  HEM_NAMES,
  MASK_NAMES,
  MOUTH_NAMES,
  PROP_NAMES,
  STANCE_NAMES,
} from './params.ts';
import { AVATAR_STATES } from './state-keys.ts';
import { BROW_LAYERS, EYE_LAYERS, IDLE_VARIANTS, MOUTH_LAYERS } from './states.ts';
import { TOK, type TokenName } from './tokens.ts';

/** phiên bản schema hiện hành (= skin_assets.params_schema_version, DB: `$.schema` phải bằng cột này) */
export const SCHEMA_VERSION = 1;
/** trần kích thước một bộ tham số dạng chữ (byte UTF-8): chặn nhập khẩu khổng lồ trước khi parse (STD-11) */
export const MAX_SPEC_BYTES = 32 * 1024;

// ---------------------------------------------------------------- viên gạch nhỏ
/** màu #RRGGBB (không tên màu, không rgb(), không var(): để chuỗi đi vào thuộc tính SVG luôn an toàn) */
export const Hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'màu phải dạng #RRGGBB');
const num = (min: number, max: number) => z.number().min(min).max(max);
const noControl = (s: string): boolean => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32 || c === 127) return false;
  }
  return true;
};
/** chuỗi hiển thị ngắn (tên, nhãn...): không ký tự điều khiển. Engine không ghép chuỗi này vào markup trừ `name` (đã thoát). */
const text = (max: number) => z.string().min(1).max(max).refine(noControl, 'không được chứa ký tự điều khiển');
/** thời lượng CSS dạng giây, vd "-0.6s", "3.4s" */
const Seconds = z.string().regex(/^-?\d{1,2}(?:\.\d{1,3})?s$/, 'phải dạng giây, vd "3.4s"');
const Vec2 = z
  .tuple([num(-100, 100), num(-100, 100)])
  .refine(([x, y]) => Math.hypot(x, y) >= 10 && Math.hypot(x, y) <= 120, 'độ dài véc-tơ tay phải trong 10..120');
/** điểm trong lưới nhân vật 200×240 */
const Point = z.tuple([num(0, 200), num(0, 240)]);
const Opt = <T extends z.ZodType>(s: T) => s.optional();

// ---------------------------------------------------------------- ngoại hình (p)
export const AppearanceSchema = z
  .strictObject({
    skin: Opt(Hex),
    earSkin: Opt(Hex.nullable()),
    jawSkin: Opt(Hex.nullable()),
    blush: Opt(Hex),
    hair: Opt(Hex),
    iris: Opt(Hex),
    glow: Opt(Hex),
    whiteFx: Opt(Hex),
    face: Opt(z.enum(FACE_NAMES)),
    ears: Opt(z.enum(EARS_NAMES)),
    sclera: Opt(z.boolean()),
    eyeRing: Opt(Hex.nullable()),
    browColor: Opt(Hex.nullable()),
    robe: Opt(Hex),
    trim: Opt(Hex),
    inner: Opt(Hex),
    sash: Opt(Hex),
    buckle: Opt(Hex),
    shoe: Opt(Hex),
    sleeve: Opt(num(10, 60)),
    cap: Opt(z.enum(CAP_NAMES)),
    capColor: Opt(Hex),
    capAccent: Opt(Hex),
    crownY: Opt(num(-30, 40)),
    eyes: Opt(z.enum(EYE_NAMES)),
    liner: Opt(z.boolean()),
    brow: Opt(z.enum(BROW_NAMES)),
    mouth: Opt(z.enum(MOUTH_NAMES)),
    beard: Opt(z.enum(BEARD_NAMES)),
    beardColor: Opt(Hex),
    prop: Opt(z.enum(PROP_NAMES)),
    front: Opt(z.enum(FRONT_NAMES)),
    armL: Opt(Vec2),
    armR: Opt(Vec2),
    tails: Opt(z.boolean()),
    hem: Opt(z.enum(HEM_NAMES)),
    cape: Opt(Hex.nullable()),
    capeIn: Opt(Hex.nullable()),
    mask: Opt(z.enum(MASK_NAMES).nullable()),
    armor: Opt(z.boolean()),
    armorColor: Opt(Hex),
    tassel: Opt(Hex),
    collar: Opt(z.enum(COLLAR_NAMES)),
    patch: Opt(z.boolean()),
    rope: Opt(z.boolean()),
    ropeColor: Opt(Hex.nullable()),
    stance: Opt(z.enum(STANCE_NAMES)),
    ribbon: Opt(Hex.nullable()),
    line: Opt(Hex),
    flower: Opt(Hex),
    hilt: Opt(Hex),
    crownGold: Opt(Hex),
    holdL: Opt(z.boolean()),
    holdR: Opt(z.boolean()),
    lockL: Opt(z.boolean()),
    lockR: Opt(z.boolean()),
  })
  .refine((p) => !p.cape === !p.capeIn, 'cape và capeIn phải đi cùng nhau (áo choàng cần màu lót)');
export type Appearance = z.infer<typeof AppearanceSchema>;
/** khoá ngoại hình mà phép kiểm `param` được đọc */
export const APPEARANCE_KEYS = Object.keys(AppearanceSchema.shape) as [keyof Appearance, ...(keyof Appearance)[]];

// ---------------------------------------------------------------- cổng nhận diện khai báo (Check)
/** nhóm màu đóng, đánh giá trên màu #RRGGBB (spike: isRed, isWhite...). gHigh = kênh G > 190 */
export const COLOR_CLASSES = [
  'red',
  'white',
  'dark',
  'green',
  'gold',
  'earthYellow',
  'silver',
  'teal',
  'pink',
  'paleBlue',
  'gray',
  'cobalt',
  'paleGold',
  'gHigh',
] as const;
export type ColorClass = (typeof COLOR_CLASSES)[number];

const PartName = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/, 'tên phần tử dạng chữ thường, số, gạch ngang');
const AttrName = z.string().regex(/^[a-z][a-z0-9-]{0,19}$/);
const ColorIs = z.enum(COLOR_CLASSES);
const State = z.enum(AVATAR_STATES);
const Variant = z.enum(IDLE_VARIANTS);
const TOKEN_NAMES = Object.keys(TOK) as [TokenName, ...TokenName[]];

/** một phép kiểm trên SVG đã dựng, tham số ngoại hình, hoặc bảng hành vi đã gộp (xem identity.ts) */
export type Check =
  | { part: string; attr?: Record<string, string> }
  | { fill: string; is: ColorClass }
  | { trim: string; is: ColorClass }
  | { band: string; is: ColorClass }
  | { param: keyof Appearance; is: string | number | boolean | null }
  | {
      phase: {
        state: (typeof AVATAR_STATES)[number];
        variant?: (typeof IDLE_VARIANTS)[number];
        where: {
          eyes?: (typeof EYE_LAYERS)[number];
          mouth?: (typeof MOUTH_LAYERS)[number];
          brow?: (typeof BROW_LAYERS)[number];
          emote?: (typeof EMOTES)[number];
        };
      };
    }
  | { token: { state: (typeof AVATAR_STATES)[number]; variant?: (typeof IDLE_VARIANTS)[number]; has: TokenName } }
  | { noEmote: string[] }
  | { all: Check[] }
  | { any: Check[] }
  | { not: Check };

const phaseWhere = z
  .strictObject({
    eyes: Opt(z.enum(EYE_LAYERS)),
    mouth: Opt(z.enum(MOUTH_LAYERS)),
    brow: Opt(z.enum(BROW_LAYERS)),
    emote: Opt(z.enum(EMOTES)),
  })
  .refine((w) => Object.keys(w).length > 0, 'where cần ít nhất một điều kiện');

const leaves = [
  z.strictObject({ part: PartName, attr: Opt(z.record(AttrName, z.string().max(40))) }),
  z.strictObject({ fill: PartName, is: ColorIs }),
  z.strictObject({ trim: PartName, is: ColorIs }),
  z.strictObject({ band: PartName, is: ColorIs }),
  z.strictObject({
    param: z.enum(APPEARANCE_KEYS),
    is: z.union([z.string().max(40), z.number(), z.boolean(), z.null()]),
  }),
  z.strictObject({ phase: z.strictObject({ state: State, variant: Opt(Variant), where: phaseWhere }) }),
  z.strictObject({ token: z.strictObject({ state: State, variant: Opt(Variant), has: z.enum(TOKEN_NAMES) }) }),
  z.strictObject({
    noEmote: z
      .array(z.string().regex(/^[a-z]{2,16}$/))
      .min(1)
      .max(16),
  }),
] as const;

/** Check lồng nhau có độ sâu tối đa (không đệ quy vô hạn: input không tin cậy không thể làm tràn ngăn xếp) */
const MAX_CHECK_DEPTH = 4;
const checkSchema = (depth: number): z.ZodType<Check> => {
  if (depth <= 0) return z.union(leaves) as unknown as z.ZodType<Check>;
  const sub = checkSchema(depth - 1);
  return z.union([
    ...leaves,
    z.strictObject({ all: z.array(sub).min(1).max(8) }),
    z.strictObject({ any: z.array(sub).min(1).max(8) }),
    z.strictObject({ not: sub }),
  ]) as unknown as z.ZodType<Check>;
};
export const CheckSchema: z.ZodType<Check> = checkSchema(MAX_CHECK_DEPTH);

// ---------------------------------------------------------------- hồ sơ nhận diện
const MustItem = z.strictObject({
  p: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  label: text(240),
  check: CheckSchema,
});
const ExtraItem = z.strictObject({ label: text(300), check: CheckSchema });
export const IdentitySchema = z.strictObject({
  /** phần tử (data-part) phải đọc được ở 32 px */
  p1: PartName,
  must: z.array(MustItem).min(2).max(3),
  extra: z.array(ExtraItem).max(8),
  colors: z.array(text(120)).min(1).max(8),
  props: z.array(text(80)).max(8),
  face: text(240),
  source: text(400),
});
export type Identity = z.infer<typeof IdentitySchema>;

// ---------------------------------------------------------------- nhân vật
export const CHAR_KINDS = ['vo', 'van', 'muu', 'chu_cong', 'linh'] as const;
export const GENDERS = ['nam', 'nu'] as const;

export const ChibiParamsV1 = z.strictObject({
  schema: z.literal(SCHEMA_VERSION),
  /** = skin_assets.asset_code */
  id: z.string().regex(/^[a-z][a-z0-9_-]{1,31}$/, 'id dạng chữ thường / số, 2-32 ký tự (asset_code)'),
  name: text(60),
  han: Opt(text(12)),
  role: text(40),
  faction: text(30),
  kind: z.enum(CHAR_KINDS),
  gender: z.enum(GENDERS),
  /** màu Role gợi ý (chỉ tô bóng dưới chân) */
  own: Hex,
  /** khung cắt avatar tròn: [x, y, cạnh] trong lưới 200×240 */
  crop: z.tuple([num(-100, 100), num(-100, 100), num(100, 300)]),
  anim: Opt(z.strictObject({ phase: Opt(Seconds), breath: Opt(Seconds), blink: Opt(Seconds), bdelay: Opt(Seconds) })),
  /** tinh chỉnh khi tay đưa đạo cụ che mặt (chỉ nhân vật cầm quạt dùng) */
  cover: Opt(z.strictObject({ target: Opt(Point), propAngle: Opt(num(-180, 180)) })),
  /** ghi chú trò riêng (tài liệu, engine không đọc) */
  note: Opt(text(600)),
  p: AppearanceSchema,
  identity: IdentitySchema,
});
export type ChibiParams = z.infer<typeof ChibiParamsV1>;

/** JSON Schema (draft 2020-12) của ChibiParamsV1: cho công cụ ngoài / Xưởng nhân vật GĐ2. Phép refine không biểu diễn được thì bỏ. */
export const toJsonSchema = (): Record<string, unknown> =>
  z.toJSONSchema(ChibiParamsV1, { unrepresentable: 'any', io: 'input' }) as Record<string, unknown>;

// ---------------------------------------------------------------- validate / parse
export interface ValidationIssue {
  /** đường dẫn tới trường lỗi, vd "p.robe" hoặc "identity.must[0].check" */
  path: string;
  message: string;
}
export type ValidationResult = { ok: true; value: ChibiParams } | { ok: false; errors: ValidationIssue[] };

const pathOf = (p: readonly PropertyKey[]): string =>
  p.reduce<string>((acc, k) => (typeof k === 'number' ? `${acc}[${k}]` : acc ? `${acc}.${String(k)}` : String(k)), '');

const OVER_MSG =
  'nhân vật không được có `over` riêng: hành vi đến từ TRAITS theo bộ phận của khung chung (STD-09 §4); cần hành vi mới thì thêm vào thư viện, không thêm vào dữ liệu nhân vật';

function flatten(issues: readonly z.core.$ZodIssue[], base: readonly PropertyKey[] = []): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  for (const is of issues) {
    const path = [...base, ...is.path];
    if (is.code === 'unrecognized_keys') {
      for (const k of is.keys) {
        out.push({
          path: pathOf([...path, k]),
          message: k === 'over' ? OVER_MSG : `khoá không có trong schema: "${k}"`,
        });
      }
    } else if (is.code === 'invalid_union') {
      // chọn nhánh khớp nhất (ít lỗi nhất) để thông báo có ích thay vì "Invalid input"
      const best = [...is.errors].sort((a, b) => a.length - b.length)[0] ?? [];
      const sub = flatten(best, path);
      out.push(...(sub.length ? sub : [{ path: pathOf(path), message: 'không khớp mẫu hợp lệ nào' }]));
    } else {
      out.push({ path: pathOf(path), message: is.message });
    }
  }
  return out;
}

/** Kiểm một giá trị (object đã parse JSON) theo ChibiParamsV1. Không ném lỗi; trả danh sách lỗi có đường dẫn. */
export function validate(spec: unknown): ValidationResult {
  const r = ChibiParamsV1.safeParse(spec);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, errors: flatten(r.error.issues) };
}

/** Parse + kiểm từ chuỗi JSON (vd `params_json` đọc từ DB). Chặn quá MAX_SPEC_BYTES trước khi parse. */
export function parse(json: string): ValidationResult {
  if (new TextEncoder().encode(json).length > MAX_SPEC_BYTES) {
    return { ok: false, errors: [{ path: '', message: `bộ tham số vượt trần ${MAX_SPEC_BYTES} byte` }] };
  }
  let v: unknown;
  try {
    v = JSON.parse(json);
  } catch (e) {
    return { ok: false, errors: [{ path: '', message: `JSON không hợp lệ: ${(e as Error).message}` }] };
  }
  return validate(v);
}
