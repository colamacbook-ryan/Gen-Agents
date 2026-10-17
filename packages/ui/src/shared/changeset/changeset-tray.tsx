import { formatInt } from '@ga/i18n';
import { useI18n } from '@ga/i18n/react';
import { Check } from 'lucide-react';
import { Button } from '../../primitives/button.tsx';
import { WarningBanner } from '../../primitives/warning-banner.tsx';
import './changeset.css';

export interface ChangeSetItem {
  /** mã đề xuất (CS-…) */
  id: string;
  /** đích, mono, vd "IN-0003 · D" */
  target: string;
  /** lý do đã dịch */
  reason: string;
  /** thay đổi Token prompt nếu áp dụng (có dấu) */
  tokenDelta: number;
}

export interface TokenBudget {
  current: number;
  ceiling: number;
}

export interface ChangeSetTrayProps {
  items: readonly ChangeSetItem[];
  onApply(id: string): void;
  onReject(id: string): void;
  onApplyAll(): void;
  /** có thì cảnh báo khi áp dụng hết làm vượt trần Token prompt (INT-03/04) */
  budget?: TokenBudget;
  busy?: boolean;
}

const signed = (n: number, locale: 'vi' | 'en'): string =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatInt(Math.abs(n), locale)}`;

/** Khay "n đề xuất chờ duyệt" đầu vùng dữ liệu: mỗi mục có đích, lý do, token_delta; "Áp dụng mọi đề xuất chờ duyệt" (FRONTEND-SPEC §5). */
export function ChangeSetTray({ items, onApply, onReject, onApplyAll, budget, busy = false }: ChangeSetTrayProps) {
  const { t, locale } = useI18n();
  if (items.length === 0) return null;
  const total = items.reduce((sum, i) => sum + i.tokenDelta, 0);
  const after = budget ? budget.current + total : null;
  const over = budget !== undefined && after !== null && after > budget.ceiling;
  return (
    <section className="ga-cs" aria-label={t('changeset.title', { count: items.length })}>
      <div className="ga-cs__head">
        <span className="ga-cs__title">{t('changeset.title', { count: items.length })}</span>
        <span className="ga-cs__total" title={t('changeset.totalHint')}>
          {signed(total, locale)}
        </span>
      </div>
      <ul className="ga-cs__list">
        {items.map((i) => (
          <li key={i.id} className="ga-cs__row">
            <span className="ga-cs__target">{i.target}</span>
            <span className="ga-cs__reason" title={i.reason}>
              {i.reason}
            </span>
            <span
              className={
                i.tokenDelta > 0
                  ? 'ga-cs__delta ga-cs__delta--up'
                  : i.tokenDelta < 0
                    ? 'ga-cs__delta ga-cs__delta--down'
                    : 'ga-cs__delta'
              }
            >
              {signed(i.tokenDelta, locale)}
            </span>
            <span className="ga-cs__actions">
              <Button size="sm" icon={Check} disabled={busy} onClick={() => onApply(i.id)}>
                {t('changeset.apply')}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onReject(i.id)}>
                {t('changeset.reject')}
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <div className="ga-cs__foot">
        {budget && after !== null ? (
          <span className="ga-cs__after">
            {t('changeset.after', { after: formatInt(after, locale), ceiling: formatInt(budget.ceiling, locale) })}
          </span>
        ) : null}
        {over && budget ? (
          <WarningBanner tone="warn">
            {t('changeset.overCeiling', {
              count: items.length,
              after: formatInt(after as number, locale),
              ceiling: formatInt(budget.ceiling, locale),
            })}
          </WarningBanner>
        ) : null}
        <div>
          <Button variant={over ? 'danger' : 'primary'} disabled={busy} busy={busy} onClick={onApplyAll}>
            {over ? t('changeset.applyAllOver') : t('changeset.applyAll')}
          </Button>
        </div>
      </div>
    </section>
  );
}
