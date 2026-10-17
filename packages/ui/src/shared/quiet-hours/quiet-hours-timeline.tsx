import { useI18n } from '@ga/i18n/react';
import { type CSSProperties, type KeyboardEvent, type PointerEvent, useRef } from 'react';
import '../../primitives/text-field.css';
import './quiet-hours.css';

export const DAY_MINUTES = 1440;
export const STEP_MINUTES = 15;

export interface QuietHours {
  /** phút từ 00:00, bội của 15, [0, 1440) */
  start: number;
  end: number;
  weekends: boolean;
}

export interface QuietHoursTimelineProps {
  value: QuietHours;
  onChange(next: QuietHours): void;
  /** phút hiện tại trong ngày theo múi giờ workspace (đánh dấu); bỏ trống ⇒ không vẽ */
  nowMinutes?: number;
  disabled?: boolean;
}

export const snap = (minutes: number): number => {
  const m = Math.round(minutes / STEP_MINUTES) * STEP_MINUTES;
  return ((m % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
};

export const hhmm = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export const parseHhmm = (s: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  return mins >= 0 && mins < DAY_MINUTES ? mins : null;
};

/** Độ dài vùng im lặng (phút): đi từ `start` tới `end` theo chiều kim đồng hồ, qua nửa đêm nếu end ≤ start. */
export const quietLength = (v: Pick<QuietHours, 'start' | 'end'>): number =>
  v.end === v.start ? 0 : (v.end - v.start + DAY_MINUTES) % DAY_MINUTES;

/** Phút `m` có nằm trong vùng im lặng không (nửa mở [start, end)). */
export function isQuiet(v: Pick<QuietHours, 'start' | 'end'>, m: number): boolean {
  if (v.start === v.end) return false;
  return v.start < v.end ? m >= v.start && m < v.end : m >= v.start || m < v.end;
}

const pct = (m: number): string => `${(m / DAY_MINUTES) * 100}%`;

/**
 * QuietHoursTimeline: thanh 24h, kéo hai tay nắm (hoặc mũi tên ←/→ ±15 phút, Shift ±60), sọc chéo vùng im lặng, vạch giờ hiện tại,
 * tuỳ chọn cuối tuần. Hai ô giờ bên dưới là đường nhập chính xác bằng bàn phím.
 */
export function QuietHoursTimeline({ value, onChange, nowMinutes, disabled = false }: QuietHoursTimelineProps) {
  const { t } = useI18n();
  const bar = useRef<HTMLDivElement>(null);
  const drag = useRef<'start' | 'end' | null>(null);

  const setEdge = (edge: 'start' | 'end', minutes: number) => onChange({ ...value, [edge]: snap(minutes) });

  const fromPointer = (e: PointerEvent): number => {
    const rect = bar.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    return ratio * DAY_MINUTES;
  };

  const onKey = (edge: 'start' | 'end') => (e: KeyboardEvent) => {
    if (disabled) return;
    const step = e.shiftKey ? 60 : STEP_MINUTES;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      setEdge(edge, value[edge] + step);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      setEdge(edge, value[edge] - step);
    }
  };

  const wraps = value.start > value.end;
  const len = quietLength(value);
  const zoneStyle = {
    '--ga-qh-start': pct(value.start),
    '--ga-qh-end': pct(value.end),
    '--ga-qh-len': wraps ? pct(DAY_MINUTES - value.start) : pct(len),
    '--ga-qh-len-b': pct(value.end),
    ...(nowMinutes !== undefined ? { '--ga-qh-now': pct(nowMinutes) } : {}),
  } as CSSProperties;

  const handle = (edge: 'start' | 'end') => (
    <div
      className={`ga-qh__handle ga-qh__handle--${edge}`}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={edge === 'start' ? t('quiet.startLabel') : t('quiet.endLabel')}
      aria-valuemin={0}
      aria-valuemax={DAY_MINUTES - STEP_MINUTES}
      aria-valuenow={value[edge]}
      aria-valuetext={hhmm(value[edge])}
      aria-disabled={disabled || undefined}
      onKeyDown={onKey(edge)}
      onPointerDown={(e) => {
        if (disabled) return;
        drag.current = edge;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (drag.current === edge) setEdge(edge, fromPointer(e));
      }}
      onPointerUp={(e) => {
        drag.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      }}
    />
  );

  const hours = len / 60;
  return (
    <div className="ga-qh">
      <div className="ga-qh__bar" ref={bar} style={zoneStyle}>
        {len > 0 ? (
          wraps ? (
            <>
              <span className="ga-qh__zone ga-qh__zone--a-wrap" />
              <span className="ga-qh__zone ga-qh__zone--b" />
            </>
          ) : (
            <span className="ga-qh__zone" />
          )
        ) : null}
        {nowMinutes !== undefined ? (
          <span className="ga-qh__now" role="img" aria-label={t('quiet.now', { time: hhmm(nowMinutes) })} />
        ) : null}
        {handle('start')}
        {handle('end')}
      </div>
      <div className="ga-qh__ticks" aria-hidden="true">
        {['00', '06', '12', '18', '24'].map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      <div className="ga-qh__fields">
        <TimeField
          label={t('quiet.startLabel')}
          value={value.start}
          disabled={disabled}
          onCommit={(m) => onChange({ ...value, start: m })}
        />
        <TimeField
          label={t('quiet.endLabel')}
          value={value.end}
          disabled={disabled}
          onCommit={(m) => onChange({ ...value, end: m })}
        />
        <label className="ga-qh__weekend">
          <input
            type="checkbox"
            checked={value.weekends}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, weekends: e.currentTarget.checked })}
          />
          {t('quiet.weekends')}
        </label>
      </div>
      <p className="ga-qh__summary" role="status">
        {len === 0
          ? t('quiet.none')
          : t('quiet.summary', {
              start: hhmm(value.start),
              end: hhmm(value.end),
              hours: Number.isInteger(hours) ? hours : hours.toFixed(1),
            })}
      </p>
    </div>
  );
}

function TimeField({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onCommit(minutes: number): void;
}) {
  return (
    <label className="ga-field">
      <span className="ga-field__label">{label}</span>
      <input
        className="ga-field__input"
        type="time"
        step={STEP_MINUTES * 60}
        value={hhmm(value)}
        disabled={disabled}
        onChange={(e) => {
          const m = parseHhmm(e.currentTarget.value);
          if (m !== null) onCommit(snap(m));
        }}
      />
    </label>
  );
}
