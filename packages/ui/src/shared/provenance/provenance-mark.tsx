import { useT } from '@ga/i18n/react';
import { Cpu, Lock, User } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../../primitives/button.tsx';
import { Icon } from '../../primitives/icon.tsx';
import './provenance.css';

/** Nguồn của một giá trị: owner nhập · AI suy ra · hệ thống ghi. */
export type ProvenanceSource = 'owner' | 'ai' | 'system';

export interface ProvenanceMarkProps {
  source: ProvenanceSource;
  children: ReactNode;
  /** chỉ với `ai`: xác nhận giá trị AI suy ra (chuyển thành owner) */
  onConfirm?(): void;
  /** chỉ với `ai`: sửa giá trị */
  onEdit?(): void;
}

const ICON = { owner: User, ai: Cpu, system: Lock } as const;

/**
 * Đánh dấu nguồn field: owner (chữ thường) · AI suy ra (gạch chân ember + nền soft, kèm nút Xác nhận / Sửa) · hệ thống (mono).
 * Nguồn luôn có nhãn chữ (ẩn thị giác với owner để giữ bảng gọn, nhưng trình đọc màn hình luôn đọc được).
 */
export function ProvenanceMark({ source, children, onConfirm, onEdit }: ProvenanceMarkProps) {
  const t = useT();
  const label = t(`provenance.${source}`);
  return (
    <span className={`ga-prov ga-prov--${source}`}>
      {children}
      {source === 'owner' ? (
        <span className="ga-sr-only">{label}</span>
      ) : (
        <span className="ga-prov__tag" title={label}>
          <Icon icon={ICON[source]} size={10} />
          {label}
        </span>
      )}
      {source === 'ai' && (onConfirm || onEdit) ? (
        <span className="ga-prov__actions">
          {onConfirm ? (
            <Button size="sm" variant="ghost" onClick={onConfirm}>
              {t('provenance.confirm')}
            </Button>
          ) : null}
          {onEdit ? (
            <Button size="sm" variant="ghost" onClick={onEdit}>
              {t('provenance.edit')}
            </Button>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

/** Chú giải ba nguồn (đặt đầu bảng DNA / giấy khai sinh). */
export function ProvenanceLegend() {
  const t = useT();
  return (
    <ul className="ga-prov-legend" aria-label={t('provenance.legend')}>
      {(['owner', 'ai', 'system'] as const).map((s) => (
        <li key={s}>
          <ProvenanceMark source={s}>{t('provenance.sample')}</ProvenanceMark>
        </li>
      ))}
    </ul>
  );
}
