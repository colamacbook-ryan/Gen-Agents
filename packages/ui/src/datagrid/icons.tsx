// Icon nét 1.5, currentColor, kiểu Lucide (STD-07 §8) — vẽ tay đường đơn giản, luôn aria-hidden (nút mang aria-label).
import type { ReactElement } from 'react';

const Svg = ({ size = 14, children }: { size?: number; children: ReactElement | ReactElement[] }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);

export const IconSearch = () => (
  <Svg size={12}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
);
export const IconFilter = () => (
  <Svg>
    <path d="M22 3H2l8 9.46V19l4 2v-8.54z" />
  </Svg>
);
export const IconSort = () => (
  <Svg>
    <path d="M3 6h11M3 12h8M3 18h5M18 5v15M15 17l3 3 3-3" />
  </Svg>
);
export const IconGroup = () => (
  <Svg>
    <rect x="3" y="3" width="18" height="5" rx="1" />
    <path d="M8 12h13M8 16h13M8 20h13M4 12v8" />
  </Svg>
);
export const IconColumns = () => (
  <Svg>
    <rect x="3" y="3" width="18" height="18" rx="1" />
    <path d="M9 3v18M15 3v18" />
  </Svg>
);
export const IconDensity = () => (
  <Svg>
    <path d="M3 5h18M3 10h18M3 15h18M3 20h18" />
  </Svg>
);
export const IconDownload = () => (
  <Svg>
    <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
  </Svg>
);
export const IconPlus = () => (
  <Svg size={12}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const IconChevron = ({ open }: { open: boolean }) => (
  <Svg size={12}>
    <path d={open ? 'm6 9 6 6 6-6' : 'm9 6 6 6-6 6'} />
  </Svg>
);
