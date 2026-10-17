// Tham số ngoại hình của một nhân vật + các danh sách ĐÓNG (tên bộ phận dùng được).
// Danh sách là SSOT cho: kiểu TS, schema (enum), và bảng bộ phận (parts/*.ts — thiếu / thừa khoá là lỗi biên dịch).
// Thêm bộ phận mới = thêm tên vào đây + thêm bản vẽ vào parts/ (đi qua review), KHÔNG thêm vào dữ liệu nhân vật.

import { INK } from './color.ts';

export const FACE_NAMES = ['round', 'square', 'oval'] as const;
export const EYE_NAMES = ['round', 'big', 'phoenix', 'sharp', 'slit', 'ring', 'small', 'dot'] as const;
export const BROW_NAMES = ['soft', 'thin', 'thick', 'sharp', 'swept', 'silk', 'curl', 'wisp'] as const;
export const MOUTH_NAMES = ['smile', 'calm', 'smirk', 'small'] as const;
export const BEARD_NAMES = ['none', 'short', 'long2', 'long', 'tiger'] as const;
export const CAP_NAMES = [
  'soft',
  'wrap',
  'official',
  'crownbun',
  'flowerbun',
  'ponytail',
  'sqcap',
  'band',
  'knot',
  'helm',
  'bunband',
] as const;
/** đạo cụ cầm ở tay phải */
export const HELD_NAMES = ['fan', 'sword', 'swordT', 'chopsticks', 'silkfan'] as const;
/** đạo cụ dựng sau lưng */
export const BACK_NAMES = ['glaive', 'serpent', 'spear', 'spearLong'] as const;
export const PROP_NAMES = ['none', ...HELD_NAMES, ...BACK_NAMES] as const;
/** vật dụng ở thân trước */
export const FRONT_NAMES = ['none', 'twinswords', 'bag', 'baby'] as const;
export const EARS_NAMES = ['normal', 'long'] as const;
export const MASK_NAMES = ['red', 'white', 'black'] as const;
export const HEM_NAMES = ['plain', 'feather'] as const;
export const COLLAR_NAMES = ['v', 'high'] as const;
export const STANCE_NAMES = ['normal', 'wide'] as const;

export type FaceName = (typeof FACE_NAMES)[number];
export type EyeName = (typeof EYE_NAMES)[number];
export type BrowName = (typeof BROW_NAMES)[number];
export type MouthName = (typeof MOUTH_NAMES)[number];
export type BeardName = (typeof BEARD_NAMES)[number];
export type CapName = (typeof CAP_NAMES)[number];
export type HeldName = (typeof HELD_NAMES)[number];
export type BackName = (typeof BACK_NAMES)[number];
export type PropName = (typeof PROP_NAMES)[number];
export type FrontName = (typeof FRONT_NAMES)[number];

export type Vec2 = readonly [number, number];

/** Tham số đầy đủ (đã gộp mặc định của khung). Trường tuỳ chọn không có mặc định = không vẽ. */
export interface Params {
  id: string;
  ink: string;
  skin: string;
  earSkin: string | null;
  jawSkin: string | null;
  blush: string;
  hair: string;
  iris: string;
  glow: string;
  whiteFx: string;
  face: FaceName;
  ears: (typeof EARS_NAMES)[number];
  sclera: boolean;
  eyeRing: string | null;
  browColor: string | null;
  robe: string;
  trim: string;
  inner: string;
  sash: string;
  buckle: string;
  shoe: string;
  sleeve: number;
  cap: CapName;
  capColor: string;
  capAccent: string;
  crownY: number;
  eyes: EyeName;
  liner: boolean;
  brow: BrowName;
  mouth: MouthName;
  beard: BeardName;
  beardColor: string;
  prop: PropName;
  front: FrontName;
  armL: Vec2;
  armR: Vec2;
  tails: boolean;
  hem: (typeof HEM_NAMES)[number];
  cape: string | null;
  capeIn: string | null;
  mask: (typeof MASK_NAMES)[number] | null;
  armor: boolean;
  armorColor: string;
  tassel: string;
  collar: (typeof COLLAR_NAMES)[number];
  patch: boolean;
  rope: boolean;
  ropeColor: string | null;
  stance: (typeof STANCE_NAMES)[number];
  ribbon: string | null;
  // không có mặc định
  line?: string;
  flower?: string;
  hilt?: string;
  crownGold?: string;
  holdL?: boolean;
  holdR?: boolean;
  lockL?: boolean;
  lockR?: boolean;
}

/** tham số mặc định của khung xương (không gồm `id`) */
export const DEF: Omit<Params, 'id'> = {
  ink: INK,
  skin: '#F6D5B4',
  earSkin: null,
  jawSkin: null,
  blush: '#F08C8C',
  hair: '#251B26',
  iris: '#2B1E2A',
  glow: '#B8704E',
  whiteFx: '#F3EFE7',
  face: 'round',
  ears: 'normal',
  sclera: false,
  eyeRing: null,
  browColor: null,
  robe: '#7A8CA8',
  trim: '#3A4A66',
  inner: '#F3EFE8',
  sash: '#3A4A66',
  buckle: '#E0B04A',
  shoe: '#2B2230',
  sleeve: 28,
  cap: 'soft',
  capColor: '#2E4C86',
  capAccent: '#9DB4E0',
  crownY: 5,
  eyes: 'round',
  liner: false,
  brow: 'soft',
  mouth: 'smile',
  beard: 'none',
  beardColor: '#1F1822',
  prop: 'none',
  front: 'none',
  armL: [8, 42],
  armR: [26, 30],
  tails: false,
  hem: 'plain',
  cape: null,
  capeIn: null,
  mask: null,
  armor: false,
  armorColor: '#E2B13C',
  tassel: '#C8363B',
  collar: 'v',
  patch: false,
  rope: false,
  ropeColor: null,
  stance: 'normal',
  ribbon: null,
};

/** Trường nào của Params người dùng được phép đặt (mọi khoá của DEF trừ `ink`, cộng các trường không có mặc định). */
export const SETTABLE_KEYS = [
  ...(Object.keys(DEF) as (keyof typeof DEF)[]).filter((k) => k !== 'ink'),
  'line',
  'flower',
  'hilt',
  'crownGold',
  'holdL',
  'holdR',
  'lockL',
  'lockR',
] as const;
