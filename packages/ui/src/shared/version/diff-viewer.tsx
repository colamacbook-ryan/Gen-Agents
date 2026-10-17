import { useI18n } from '@ga/i18n/react';
import { Fragment, useMemo } from 'react';
import { diffLines, diffStats, diffWords, mergeOps } from './diff.ts';
import './version.css';

export type DiffMode = 'read' | 'yaml';

export interface DiffViewerProps {
  before: string;
  after: string;
  mode: DiffMode;
  onModeChange?(mode: DiffMode): void;
  /** tiêu đề đã dịch, vd "v1.3 → v1.4" */
  title?: string;
}

/**
 * DiffViewer: "Dạng đọc" (diff theo từ, chèn / gạch như sửa giấy tờ) hoặc "YAML" (diff theo dòng, mono, có dấu +/−).
 * Chèn / xoá luôn có ký hiệu + chữ cho trình đọc màn hình, không chỉ màu.
 */
export function DiffViewer({ before, after, mode, onModeChange, title }: DiffViewerProps) {
  const { t } = useI18n();
  const result = useMemo(
    () => (mode === 'yaml' ? diffLines(before, after) : diffWords(before, after)),
    [before, after, mode],
  );
  const stats = useMemo(() => diffStats(result.ops), [result]);
  const merged = useMemo(() => mergeOps(result.ops, mode === 'yaml' || result.coarse ? '\n' : ''), [result, mode]);

  return (
    <section className="ga-diff" aria-label={t('version.diffTitle')}>
      <div className="ga-diff__bar">
        {title ? <span>{title}</span> : null}
        <span className="ga-diff__stat ga-diff__stat--add">+{stats.added}</span>
        <span className="ga-diff__stat ga-diff__stat--del">−{stats.removed}</span>
        {onModeChange ? (
          <fieldset className="ga-diff__mode">
            <legend className="ga-sr-only">{t('version.diffMode')}</legend>
            <button type="button" aria-pressed={mode === 'read'} onClick={() => onModeChange('read')}>
              {t('version.modeRead')}
            </button>
            <button type="button" aria-pressed={mode === 'yaml'} onClick={() => onModeChange('yaml')}>
              {t('version.modeYaml')}
            </button>
          </fieldset>
        ) : null}
      </div>
      {result.coarse ? <div className="ga-diff__coarse">{t('version.coarse')}</div> : null}
      {mode === 'read' ? (
        <p className="ga-diff__read">
          {merged.map((op, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: kết quả diff tĩnh theo (before, after)
            <Fragment key={i}>
              {op.kind === 'equal' ? (
                op.text
              ) : op.kind === 'add' ? (
                <ins>
                  <span className="ga-sr-only">{t('version.added')} </span>
                  {op.text}
                </ins>
              ) : (
                <del>
                  <span className="ga-sr-only">{t('version.removed')} </span>
                  {op.text}
                </del>
              )}
            </Fragment>
          ))}
        </p>
      ) : (
        <div className="ga-diff__code">
          {result.ops.map((op, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: kết quả diff tĩnh theo (before, after)
            <div key={i} className={op.kind === 'equal' ? 'ga-diff__line' : `ga-diff__line ga-diff__line--${op.kind}`}>
              <span className="ga-diff__gutter" aria-hidden="true">
                {op.kind === 'add' ? '+' : op.kind === 'del' ? '−' : ' '}
              </span>
              {op.kind === 'equal' ? null : (
                <span className="ga-sr-only">{op.kind === 'add' ? t('version.added') : t('version.removed')}</span>
              )}
              <span>{op.text === '' ? ' ' : op.text}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
