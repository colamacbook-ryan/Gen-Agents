// Bản TS của token (cho test đối chiếu với tokens.css và cho code cần giá trị thật, vd SVG). Nguồn: STD-07 §8.
export const ENTITY_COLORS = {
  saffron: '#E0A43A',
  coral: '#E4785F',
  rose: '#D9708F',
  orchid: '#B97BD0',
  iris: '#8C86E0',
  azure: '#5B9BD5',
  teal: '#2BB3A3',
  jade: '#4FB57A',
  moss: '#8DA65A',
  olive: '#B5A642',
  clay: '#C08463',
  slate: '#8A97A8',
} as const;
export type EntityColor = keyof typeof ENTITY_COLORS;
export const ENTITY_COLOR_NAMES = Object.keys(ENTITY_COLORS) as EntityColor[];

/** Thang khoảng cách duy nhất (px). */
export const SPACING_SCALE = [4, 8, 12, 16, 24, 32] as const;

/** Tông trạng thái: luôn đi kèm icon + chữ. */
export const STATUS_TONES = ['ok', 'info', 'warn', 'danger', 'idle'] as const;
export type StatusTone = (typeof STATUS_TONES)[number];

export const entityClass = (color: EntityColor): string => `ga-entity-${color}`;
