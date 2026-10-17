import type { ReactNode } from 'react';
import './modal.css';

export interface ScrimProps {
  /** bấm vào nền (không phải vào khung) ⇒ gọi; bỏ trống ⇒ nền không đóng được */
  onDismiss?: () => void;
  variant?: 'center' | 'drawer' | 'top';
  children: ReactNode;
}

/** Nền mờ phủ toàn màn của modal / drawer / palette. Bấm nền chỉ là lối tắt cho chuột; bàn phím đóng bằng Esc (useOverlayBehavior). */
export function Scrim({ onDismiss, variant = 'center', children }: ScrimProps) {
  const cls = variant === 'center' ? 'ga-scrim' : `ga-scrim ga-scrim--${variant}`;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: lối tắt cho chuột; bàn phím đóng bằng Esc trong useOverlayBehavior
    <div
      className={cls}
      onMouseDown={(e) => {
        if (onDismiss && e.target === e.currentTarget) onDismiss();
      }}
    >
      {children}
    </div>
  );
}
