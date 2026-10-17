import { formatDateTime } from '@ga/i18n';
import { useI18n } from '@ga/i18n/react';
import { useId } from 'react';
import './version.css';

export interface Revision {
  id: string;
  /** vd "v2.0" */
  version: string;
  at: Date;
  /** người tạo bản (tên) */
  by: string;
  note?: string;
  /** thay đổi phần LÕI (badge) */
  core?: boolean;
  /** là bản đang hiệu lực */
  current?: boolean;
}

export interface VersionTimelineProps {
  /** mới nhất trước */
  revisions: readonly Revision[];
  /** tối đa 2 id đang chọn để so sánh */
  selected: readonly string[];
  onSelectedChange(ids: string[]): void;
  label: string;
  timeZone?: string;
}

/** Dòng thời gian revision: version · lúc · người · ghi chú · badge LÕI. Tick hai bản để so sánh (chọn bản thứ ba bỏ bản chọn cũ nhất). */
export function VersionTimeline({ revisions, selected, onSelectedChange, label, timeZone }: VersionTimelineProps) {
  const { t, locale } = useI18n();
  const base = useId();
  const toggle = (id: string) => {
    if (selected.includes(id)) onSelectedChange(selected.filter((x) => x !== id));
    else onSelectedChange([...selected, id].slice(-2));
  };
  return (
    <ol className="ga-vt" aria-label={label}>
      {revisions.map((r) => {
        const isSel = selected.includes(r.id);
        const checkId = `${base}-${r.id}`;
        return (
          <li key={r.id} className={isSel ? 'ga-vt__item ga-vt__item--selected' : 'ga-vt__item'}>
            <input
              id={checkId}
              className="ga-vt__pick"
              type="checkbox"
              checked={isSel}
              onChange={() => toggle(r.id)}
              aria-label={t('version.pick', { version: r.version })}
            />
            <div className="ga-vt__body">
              <div className="ga-vt__head">
                <label htmlFor={checkId} className="ga-vt__version">
                  {r.version}
                </label>
                {r.core ? <span className="ga-vt__core">{t('version.core')}</span> : null}
                {r.current ? <span className="ga-vt__current">{t('version.current')}</span> : null}
              </div>
              <div className="ga-vt__meta">
                <time dateTime={r.at.toISOString()}>{formatDateTime(r.at, locale, timeZone ? { timeZone } : {})}</time>
                <span>{r.by}</span>
              </div>
              {r.note ? <div className="ga-vt__note">{r.note}</div> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
