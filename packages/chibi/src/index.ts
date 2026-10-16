// @ga/chibi — engine chibi vẽ bằng code (SVG + CSS). Nhân vật = bộ tham số JSON có schema; khung xương chung giữ mọi hành vi.

import { evaluate, evaluateIdentity, viewOfElement, viewOfString } from './identity.ts';
import { mount } from './mount.ts';
import { cast, getChar, hasChar, register, registerAll, unregister } from './registry.ts';
import { svg } from './render.ts';
import { resolve } from './resolve.ts';
import { freeze, getBudget, injectCSS, keyframeNames, scan, setBudget } from './runtime.ts';
import { ChibiParamsV1, parse, toJsonSchema, validate } from './schema.ts';
import { AVATAR_STATES, stateI18nKeys } from './state-keys.ts';

export type { CheckContext, IdentityReport, PartView, SvgView } from './identity.ts';
export { colorIs, evaluate, evaluateIdentity, viewOfElement, viewOfString } from './identity.ts';
export { canonicalJson } from './jcs.ts';
export type { MotionLevel } from './motion.ts';
export { MOTION_LEVELS } from './motion.ts';
export type { ChibiHandle } from './mount.ts';
export { mount } from './mount.ts';
export { ChibiSpecError, cast, getChar, hasChar, register, registerAll, unregister } from './registry.ts';
export type { SvgOptions } from './render.ts';
export { svg } from './render.ts';
export type { Resolved } from './resolve.ts';
export { resolve } from './resolve.ts';
export type { StateOptions } from './runtime.ts';
export { freeze, getBudget, injectCSS, keyframeNames, scan, setBudget } from './runtime.ts';
export type { Appearance, Check, ChibiParams, ColorClass, ValidationIssue, ValidationResult } from './schema.ts';
export {
  AppearanceSchema,
  CHAR_KINDS,
  ChibiParamsV1,
  COLOR_CLASSES,
  GENDERS,
  MAX_SPEC_BYTES,
  parse,
  SCHEMA_VERSION,
  toJsonSchema,
  validate,
} from './schema.ts';
export type { SkinPackManifest } from './skin-pack.ts';
export { CHAR_KIND_TO_DB, GENDER_TO_DB, loadSkinPack, SkinPackManifestV1 } from './skin-pack.ts';
export type { AvatarState } from './state-keys.ts';
export { AVATAR_STATES, stateI18nKeys } from './state-keys.ts';
export type { IdleVariant } from './states.ts';
export { IDLE_VARIANTS } from './states.ts';

/** gom API dưới một tên (tương đương `window.Chibi` của spike, nhưng là module) */
export const Chibi = {
  version: 'v4',
  schema: ChibiParamsV1,
  validate,
  parse,
  register,
  registerAll,
  unregister,
  toJsonSchema,
  get cast() {
    return cast();
  },
  /** 16 khoá trạng thái theo thứ tự ưu tiên (contracts AVATAR_STATES) */
  states: AVATAR_STATES,
  stateI18nKeys,
  svg,
  mount,
  resolve,
  injectCSS,
  get budget() {
    return getBudget();
  },
  set budget(n: number) {
    setBudget(n);
  },
  freeze,
  scan,
  keyframeNames,
  evaluateIdentity,
  evaluate,
  viewOfString,
  viewOfElement,
  getChar,
  hasChar,
};
