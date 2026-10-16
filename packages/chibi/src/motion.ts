// Mức chuyển động (setting ui.avatar_motion): full | subtle | off. prefers-reduced-motion của hệ điều hành luôn ép 'off'.
export const MOTION_LEVELS = ['full', 'subtle', 'off'] as const;
export type MotionLevel = (typeof MOTION_LEVELS)[number];

/** mức hiệu lực: prefers-reduced-motion của hệ điều hành luôn ép 'off' */
export const effectiveMotion = (level?: MotionLevel): MotionLevel =>
  prefersReducedMotion() ? 'off' : (level ?? 'full');

/** thuộc tính trên thẻ svg (full = không có thuộc tính; o = off; s = subtle) */
export const motionAttr = (level: MotionLevel): string =>
  level === 'off' ? ' data-chb-mo="o"' : level === 'subtle' ? ' data-chb-mo="s"' : '';

/** OS đang yêu cầu giảm chuyển động? (không có matchMedia — SSR / Node — thì coi là không) */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
