import type { ReactNode } from 'react';
import './empty-state.css';

/** Bộ minh hoạ (FRONTEND-SPEC §5 EmptyState): bàn trống, tủ hồ sơ, giá sách, ổ cắm, sổ, cây, sao. */
export type EmptyIllustration = 'desk' | 'cabinet' | 'shelf' | 'socket' | 'ledger' | 'tree' | 'star';

const ART: Record<EmptyIllustration, ReactNode> = {
  desk: (
    <>
      <rect x="22" y="12" width="20" height="14" rx="2" />
      <path d="M32 26v6M26 32h12" />
      <path d="M8 38h48M14 38v16M50 38v16" />
      <circle className="ga-empty__dot" cx="32" cy="19" r="2" />
    </>
  ),
  cabinet: (
    <>
      <rect x="14" y="8" width="36" height="48" rx="3" />
      <path d="M14 24h36M14 40h36" />
      <path d="M27 16h10M27 32h10M27 48h10" />
      <circle className="ga-empty__dot" cx="32" cy="32" r="2" />
    </>
  ),
  shelf: (
    <>
      <path d="M8 22h48M8 44h48" />
      <rect x="14" y="8" width="6" height="14" rx="1" />
      <rect x="24" y="12" width="6" height="10" rx="1" />
      <path d="M44 22l4-14" />
      <circle className="ga-empty__dot" cx="32" cy="34" r="2" />
    </>
  ),
  socket: (
    <>
      <rect x="10" y="18" width="24" height="28" rx="4" />
      <path d="M18 28v4M26 28v4" />
      <path d="M44 24v16M50 24v16M42 32h10M47 40v10" />
      <circle className="ga-empty__dot" cx="22" cy="40" r="2" />
    </>
  ),
  ledger: (
    <>
      <path d="M32 14c-6-4-14-4-22-2v38c8-2 16-2 22 2 6-4 14-4 22-2V12c-8-2-16-2-22 2Z" />
      <path d="M32 14v38M16 22h10M16 30h10M38 22h10M38 30h10" />
      <circle className="ga-empty__dot" cx="32" cy="14" r="2" />
    </>
  ),
  tree: (
    <>
      <rect x="24" y="8" width="16" height="10" rx="2" />
      <path d="M32 18v8M14 26h36M14 26v6M32 26v6M50 26v6" />
      <rect x="8" y="32" width="12" height="8" rx="2" strokeDasharray="3 2" />
      <rect x="26" y="32" width="12" height="8" rx="2" strokeDasharray="3 2" />
      <rect x="44" y="32" width="12" height="8" rx="2" strokeDasharray="3 2" />
      <circle className="ga-empty__dot" cx="32" cy="13" r="2" />
    </>
  ),
  star: (
    <>
      <path d="M32 6c1.6 10 5 20 14 26-9 6-12.4 16-14 26-1.6-10-5-20-14-26 9-6 12.4-16 14-26Z" />
      <circle className="ga-empty__dot" cx="32" cy="32" r="2.5" />
    </>
  ),
};

export interface EmptyStateProps {
  illustration: EmptyIllustration;
  /** 1 câu (serif) */
  title: ReactNode;
  /** 1 câu giải thích */
  description?: ReactNode;
  /** 1 CTA */
  action?: ReactNode;
}

/** Trạng thái trống: minh hoạ nét 1,5px đơn sắc + 1 điểm ember; 1 câu + 1 câu giải thích + 1 CTA. Không robot, không 3D. */
export function EmptyState({ illustration, title, description, action }: EmptyStateProps) {
  return (
    <div className="ga-empty">
      <svg
        className="ga-empty__art"
        width={64}
        height={64}
        viewBox="0 0 64 64"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        {ART[illustration]}
      </svg>
      <h2 className="ga-empty__title">{title}</h2>
      {description ? <p className="ga-empty__desc">{description}</p> : null}
      {action ? <div className="ga-empty__action">{action}</div> : null}
    </div>
  );
}
