import type { LucideIcon } from 'lucide-react';

export interface IconProps {
  icon: LucideIcon;
  /** 16px mặc định (bảng + sidebar), STD-07 §8. */
  size?: number;
  className?: string;
}

/** Icon Lucide nét 1.5, `currentColor`, trang trí (aria-hidden). Icon-only button phải có aria-label ở nút. */
export function Icon({ icon: Glyph, size = 16, className }: IconProps) {
  return <Glyph size={size} strokeWidth={1.5} aria-hidden="true" focusable="false" className={className} />;
}
