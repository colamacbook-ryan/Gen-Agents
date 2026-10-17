import { useT } from '@ga/i18n/react';
import './skeleton.css';

export interface SkeletonProps {
  variant?: 'text' | 'rect' | 'block' | 'circle';
  /** độ rộng theo bậc cố định (không style nội tuyến — CSP) */
  width?: 25 | 50 | 75 | 100;
}

/** Khối chờ đúng hình nội dung, shimmer nhẹ. Dùng thay cho spinner toàn màn (STD-07 §9). */
export function Skeleton({ variant = 'text', width = 100 }: SkeletonProps) {
  const cls = ['ga-skel', `ga-skel--${variant}`, variant !== 'circle' && `ga-skel--w-${width}`]
    .filter(Boolean)
    .join(' ');
  return <span className={cls} aria-hidden="true" />;
}

const LINE_WIDTHS = [100, 75, 100, 50, 75] as const;

/** Đoạn văn: `lines` dòng, độ rộng so le. */
export function SkeletonLines({ lines = 3 }: { lines?: number }) {
  const t = useT();
  return (
    <div className="ga-skel-lines" role="status" aria-busy="true">
      <span className="ga-sr-only">{t('common.loading')}</span>
      {Array.from({ length: lines }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: danh sách tĩnh, không có thứ tự động
        <Skeleton key={i} width={LINE_WIDTHS[i % LINE_WIDTHS.length]} />
      ))}
    </div>
  );
}

export interface SkeletonGridProps {
  rows?: number;
  /** số cột dữ liệu (ngoài cột ID đóng băng) */
  columns?: 3 | 4 | 5 | 6;
}

/** Lưới chờ: toolbar 36 + hàng 28, cột 0 là ID. */
export function SkeletonGrid({ rows = 8, columns = 4 }: SkeletonGridProps) {
  const t = useT();
  const cls = columns === 4 ? 'ga-skel-grid' : `ga-skel-grid ga-skel-grid--c${columns}`;
  return (
    <div className={cls} role="status" aria-busy="true">
      <span className="ga-sr-only">{t('common.loading')}</span>
      <div className="ga-skel-grid__toolbar" aria-hidden="true">
        <Skeleton variant="rect" width={25} />
        <Skeleton variant="rect" width={50} />
      </div>
      {Array.from({ length: rows }, (_, r) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: hàng chờ tĩnh
        <div className="ga-skel-grid__row" key={r} aria-hidden="true">
          {Array.from({ length: columns + 1 }, (_, c) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: ô chờ tĩnh
            <Skeleton key={c} width={c === 0 ? 75 : LINE_WIDTHS[(r + c) % LINE_WIDTHS.length]} />
          ))}
        </div>
      ))}
    </div>
  );
}
