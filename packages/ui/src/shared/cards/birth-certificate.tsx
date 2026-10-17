import { formatDateTime } from '@ga/i18n';
import { useI18n } from '@ga/i18n/react';
import { ProvenanceMark, type ProvenanceSource } from '../provenance/provenance-mark.tsx';
import './cards.css';

export interface CertificateField {
  key: string;
  /** nhãn đã dịch */
  label: string;
  /** giá trị hiển thị (text) hoặc mức tính cách 1–5 */
  value: string | { trait: 1 | 2 | 3 | 4 | 5; text: string };
  source: ProvenanceSource;
  onConfirm?(): void;
  onEdit?(): void;
}

export interface CertificateSection {
  /** số La Mã: I, II… */
  roman: string;
  title: string;
  fields: readonly CertificateField[];
}

export interface BirthCertificateProps {
  /** tiêu đề giấy (đã dịch) */
  title: string;
  sections: readonly CertificateSection[];
  /** số hồ sơ — CHỈ hiện sau khi ký */
  fileNo?: string;
  signed?: { at: Date; by: string };
  /** mã mẫu giấy, vd "GA-01" */
  template?: string;
  timeZone?: string;
}

function TraitDots({ level, text }: { level: 1 | 2 | 3 | 4 | 5; text: string }) {
  const { t } = useI18n();
  return (
    <span className="ga-trait">
      <span className="ga-trait__dots" role="img" aria-label={t('birth.traitLevel', { level, max: 5 })}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={n <= level ? 'ga-trait__dot ga-trait__dot--on' : 'ga-trait__dot'} />
        ))}
      </span>
      {text}
    </span>
  );
}

/**
 * Giấy khai sinh dạng văn bản (Document, chế độ xem của cùng dữ liệu DNA): section serif small-caps, field theo 3 nguồn,
 * tính cách 5 nấc, con dấu CSS khi đã ký. Chỉ dạng Data Console — không chibi, không hoạt ảnh đóng dấu (để lớp game hoá).
 */
export function BirthCertificate({ title, sections, fileNo, signed, template, timeZone }: BirthCertificateProps) {
  const { t, locale } = useI18n();
  return (
    <article className="ga-cert" aria-label={title}>
      <header className="ga-cert__head">
        <h2 className="ga-cert__title">{title}</h2>
        <div>
          {signed && fileNo ? <div className="ga-cert__no">{fileNo}</div> : null}
          {template ? <div className="ga-cert__template">{template}</div> : null}
        </div>
      </header>
      {sections.map((s) => (
        <section key={s.roman} className="ga-cert__section" aria-label={`${s.roman}. ${s.title}`}>
          <h3 className="ga-cert__section-title">
            {s.roman}. {s.title}
          </h3>
          <dl className="ga-cert__fields">
            {s.fields.map((f) => (
              <FieldRow key={f.key} field={f} />
            ))}
          </dl>
        </section>
      ))}
      <footer className="ga-cert__sign">
        {signed ? (
          <>
            <span>{t('birth.signedBy', { name: signed.by })}</span>
            <span className="ga-cert__seal" role="img" aria-label={t('birth.sealLabel')}>
              <span>{t('birth.seal')}</span>
              <span className="ga-cert__seal-date">
                {formatDateTime(signed.at, locale, timeZone ? { timeZone } : {})}
              </span>
            </span>
          </>
        ) : (
          <span className="ga-cert__unsigned">{t('birth.unsigned')}</span>
        )}
      </footer>
    </article>
  );
}

function FieldRow({ field }: { field: CertificateField }) {
  return (
    <>
      <dt>{field.label}</dt>
      <dd>
        <ProvenanceMark source={field.source} onConfirm={field.onConfirm} onEdit={field.onEdit}>
          {typeof field.value === 'string' ? (
            field.value
          ) : (
            <TraitDots level={field.value.trait} text={field.value.text} />
          )}
        </ProvenanceMark>
      </dd>
    </>
  );
}
