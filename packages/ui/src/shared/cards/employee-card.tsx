import { formatDateTime } from '@ga/i18n';
import { useI18n } from '@ga/i18n/react';
import { RotateCw } from 'lucide-react';
import { Fragment, type ReactNode, useState } from 'react';
import { Button } from '../../primitives/button.tsx';
import './cards.css';

/** Trạng thái thẻ: mờ (chờ cấp) · hiệu lực · tạm ngưng · thu hồi · đã thay (FRONTEND-SPEC §5 EmployeeCard). */
export type CardStatus = 'pending' | 'active' | 'suspended' | 'revoked' | 'superseded';

export interface EmployeeCardProps {
  name: string;
  /** vị trí / chức danh đã dịch */
  position?: string;
  /** số thẻ (CD-…) */
  cardNo: string;
  status: CardStatus;
  issuedAt?: Date;
  /** thẻ đã bị thay bằng thẻ nào (chỉ khi `superseded`) */
  supersededBy?: string;
  /** avatar (RoleAvatar hoặc ChibiAvatar do lane khác cấp) */
  avatar?: ReactNode;
  /** dòng mặt sau (điều khoản, giờ làm…): nhãn đã dịch + giá trị */
  backLines?: readonly { label: string; value: string }[];
  /** mã QR (chưa có thư viện QR trong M3: để trống thì hiện số thẻ trong khung mono) */
  qr?: ReactNode;
  timeZone?: string;
  /** mặt đang hiện (điều khiển ngoài); bỏ trống ⇒ tự quản với nút "Lật thẻ" */
  side?: 'front' | 'back';
}

/** Thẻ nhân viên tỷ lệ ID-1: mặt trước / mặt sau, trạng thái bằng chữ + dáng thẻ (không chỉ màu). Ảnh PNG: chưa làm. */
export function EmployeeCard({
  name,
  position,
  cardNo,
  status,
  issuedAt,
  supersededBy,
  avatar,
  backLines = [],
  qr,
  timeZone,
  side,
}: EmployeeCardProps) {
  const { t, locale } = useI18n();
  const [own, setOwn] = useState<'front' | 'back'>('front');
  const shown = side ?? own;
  const statusLabel =
    status === 'superseded' && supersededBy
      ? t('card.status.supersededBy', { id: supersededBy })
      : t(`card.status.${status}`);
  return (
    <div className="ga-card-wrap">
      <figure className={`ga-card ga-card--${status}`} aria-label={t('card.label', { name })}>
        <div className="ga-card__face" hidden={shown !== 'front'}>
          <div className="ga-card__top">
            <span>{t('card.title')}</span>
            <span className="ga-card__no">{cardNo}</span>
          </div>
          <div className="ga-card__main">
            {avatar}
            <div>
              <div className="ga-card__name">{name}</div>
              {position ? <div className="ga-card__position">{position}</div> : null}
            </div>
          </div>
          <div className="ga-card__foot">
            <span className="ga-card__status">{statusLabel}</span>
            {issuedAt ? (
              <time dateTime={issuedAt.toISOString()}>
                {t('card.issued')} {formatDateTime(issuedAt, locale, timeZone ? { timeZone } : {})}
              </time>
            ) : null}
          </div>
        </div>
        <div className="ga-card__face" hidden={shown !== 'back'}>
          <div className="ga-card__top">
            <span>{t('card.back')}</span>
            <span className="ga-card__no">{cardNo}</span>
          </div>
          <div className="ga-card__main">
            <dl className="ga-card__lines">
              {backLines.map((l) => (
                <Fragment key={l.label}>
                  <dt>{l.label}</dt>
                  <dd>{l.value}</dd>
                </Fragment>
              ))}
            </dl>
            {qr ?? <span className="ga-card__code">{cardNo}</span>}
          </div>
        </div>
      </figure>
      {side === undefined ? (
        <Button
          size="sm"
          variant="ghost"
          icon={RotateCw}
          aria-pressed={own === 'back'}
          onClick={() => setOwn(own === 'front' ? 'back' : 'front')}
        >
          {t('card.flip')}
        </Button>
      ) : null}
    </div>
  );
}
