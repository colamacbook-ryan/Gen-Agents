// Mức chuyển động (setting ui.avatar_motion): full | subtle | off. prefers-reduced-motion của hệ điều hành luôn ép 'off'.
export const MOTION_LEVELS = ['full', 'subtle', 'off'] as const;
export type MotionLevel = (typeof MOTION_LEVELS)[number];

/** OS đang yêu cầu giảm chuyển động? (không có matchMedia — SSR / Node — thì coi là không) */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
