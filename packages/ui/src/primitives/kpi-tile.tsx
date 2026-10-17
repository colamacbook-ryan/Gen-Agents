import type { ReactNode } from 'react';
import './kpi-tile.css';

export interface KpiTileProps {
  label: string;
  value: string;
  unit?: string;
  /** bảng / view nguồn (mono, mờ) — vd "v_roles" (STD-07: UI là cửa sổ nhìn vào DB) */
  source?: string;
  /** dòng phụ (delta, ngưỡng…) */
  note?: ReactNode;
  noteTone?: 'ok' | 'warn' | 'danger';
  /** tooltip công thức */
  title?: string;
  spark?: readonly number[];
  /** bắt buộc khi có `spark`: mô tả bằng chữ cho trình đọc màn hình */
  sparkLabel?: string;
}

const W = 56;
const H = 20;

/** Đường gấp khúc của sparkline: giá trị chuẩn hoá vào khung 56×20, chừa 2px quanh mép. */
export function sparkPoints(values: readonly number[]): { points: string; lastY: number } {
  if (values.length === 0) return { points: '', lastY: H / 2 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = values.length > 1 ? (W - 4) / (values.length - 1) : 0;
  const ys = values.map((v) => 2 + (H - 4) * (1 - (v - min) / span));
  const pts = ys.map((y, i) => `${(2 + i * step).toFixed(1)},${y.toFixed(1)}`);
  return { points: pts.join(' '), lastY: ys[ys.length - 1] as number };
}

/** KPI tile cao 72px: số mono 20px, nhãn micro, nguồn bảng. Không card rỗng (STD-07 §9). */
export function KpiTile({ label, value, unit, source, note, noteTone, title, spark, sparkLabel }: KpiTileProps) {
  const sp = spark && spark.length > 0 ? sparkPoints(spark) : null;
  return (
    <div className="ga-kpi" title={title}>
      <div className="ga-kpi__top">
        <span className="ga-kpi__label">{label}</span>
        {source ? <span className="ga-kpi__src">{source}</span> : null}
      </div>
      <div className="ga-kpi__main">
        <span className="ga-kpi__value">{value}</span>
        {unit ? <span className="ga-kpi__unit">{unit}</span> : null}
        {sp ? (
          <svg
            className="ga-kpi__spark"
            role="img"
            aria-label={sparkLabel}
            width={52}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            fill="none"
          >
            <polyline
              points={sp.points}
              stroke="currentColor"
              strokeWidth={1.25}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle cx={W - 2} cy={sp.lastY} r={1.75} fill="currentColor" />
          </svg>
        ) : null}
      </div>
      {note ? <div className={noteTone ? `ga-kpi__note ga-kpi__note--${noteTone}` : 'ga-kpi__note'}>{note}</div> : null}
    </div>
  );
}

/** Dải KPI: một panel viền subtle, các ô cách nhau bằng đường kẻ. */
export function KpiStrip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="ga-kpi-strip" aria-label={label}>
      {children}
    </section>
  );
}
