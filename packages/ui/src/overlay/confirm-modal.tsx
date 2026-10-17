import { boundedNfkc } from '@ga/contracts';
import { useT } from '@ga/i18n/react';
import { OctagonX, TriangleAlert } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from '../primitives/button.tsx';
import { Icon } from '../primitives/icon.tsx';
import { formatCombo } from '../primitives/shortcuts.tsx';
import { TextField } from '../primitives/text-field.tsx';
import { Modal } from './modal.tsx';
import './confirm-modal.css';

/** Trần ký tự khi chuẩn hoá chữ gõ xác nhận (NFKC có trần của @ga/contracts, rào L-36). */
const PHRASE_MAX = 256;

/**
 * Chữ gõ có khớp chữ cần gõ không: bỏ khoảng trắng hai đầu, so NFKC (gõ tiếng Việt kiểu tổ hợp / dựng sẵn vẫn khớp),
 * phân biệt hoa thường (xác nhận là ma sát có chủ đích).
 */
export function phraseMatches(typed: string, phrase: string): boolean {
  const a = boundedNfkc(typed.trim(), PHRASE_MAX);
  const b = boundedNfkc(phrase.trim(), PHRASE_MAX);
  return a !== null && b !== null && b !== '' && a === b;
}

export interface ConfirmModalProps {
  open: boolean;
  /** vd "Thu hồi thẻ nhân viên của Mai?" */
  title: ReactNode;
  /** bước 1: hệ quả CỤ THỂ (có số liệu), ít nhất một dòng */
  consequences: readonly [ReactNode, ...ReactNode[]];
  /** bước 2: chữ phải gõ lại (tên Role / version…) */
  confirmPhrase: string;
  /** nhãn nút thực hiện ở bước 2, vd "Thu hồi thẻ" */
  confirmLabel: string;
  /** `danger` (xoá, thu hồi, rollback) hoặc `warn` */
  tone?: 'danger' | 'warn';
  onConfirm(): void | Promise<void>;
  onCancel(): void;
  /** `onConfirm` ném lỗi: giữ nguyên bước 2, hiện câu chung; lỗi thật chuyển cho người gọi (log, toast) */
  onError?(error: unknown): void;
}

/**
 * Modal xác nhận 2 bước cho hành động nguy hiểm (STD-01 §4, STD-07 §10, STD-06 §3):
 * bước 1 liệt kê hệ quả cụ thể, bước 2 gõ lại tên. Nút thực hiện chỉ bật khi chữ gõ khớp. `⌘↵` / `Ctrl ↵` xác nhận ở bước 2.
 */
export function ConfirmModal({
  open,
  title,
  consequences,
  confirmPhrase,
  confirmLabel,
  tone = 'danger',
  onConfirm,
  onCancel,
  onError,
}: ConfirmModalProps) {
  const t = useT();
  const [step, setStep] = useState<1 | 2>(1);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const safeButton = useRef<HTMLButtonElement>(null);
  const phraseInput = useRef<HTMLInputElement>(null);

  // mỗi lần mở: về bước 1, xoá chữ đã gõ
  useEffect(() => {
    if (open) {
      setStep(1);
      setTyped('');
      setBusy(false);
      setFailed(false);
    }
  }, [open]);

  // sang bước 2: đưa con trỏ vào ô gõ
  useEffect(() => {
    if (open && step === 2) phraseInput.current?.focus();
  }, [open, step]);

  const matches = phraseMatches(typed, confirmPhrase);

  const run = async () => {
    if (!matches || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await onConfirm();
    } catch (error) {
      setFailed(true);
      onError?.(error);
    } finally {
      setBusy(false);
    }
  };

  const footer =
    step === 1 ? (
      <>
        <Button ref={safeButton} onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={() => setStep(2)}>
          {t('confirm.continue')}
        </Button>
      </>
    ) : (
      <>
        <Button onClick={() => setStep(1)} disabled={busy}>
          {t('common.back')}
        </Button>
        <Button
          variant={tone === 'danger' ? 'danger' : 'primary'}
          disabled={!matches}
          busy={busy}
          kbd={formatCombo('mod+enter')}
          onClick={() => void run()}
        >
          {confirmLabel}
        </Button>
      </>
    );

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={footer}
      initialFocus={safeButton}
      onKeyDown={(e) => {
        if (step === 2 && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void run();
        }
      }}
    >
      <div>
        <p className="ga-confirm__step">{t('confirm.step', { current: step, total: 2 })}</p>
        {step === 1 ? (
          <>
            <p className="ga-confirm__lead">{t('confirm.consequencesLead')}</p>
            <ul className="ga-confirm__list">
              {consequences.map((c, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: danh sách hệ quả tĩnh trong một lần mở
                <li key={i} className="ga-confirm__item">
                  <span
                    className={
                      tone === 'warn' ? 'ga-confirm__item-icon ga-confirm__item-icon--warn' : 'ga-confirm__item-icon'
                    }
                  >
                    <Icon icon={tone === 'warn' ? TriangleAlert : OctagonX} size={16} />
                  </span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <TextField
              label={t('confirm.typeLabel', { phrase: confirmPhrase })}
              value={typed}
              onChange={(e) => setTyped(e.currentTarget.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={busy}
              ref={phraseInput}
            />
            {failed ? (
              <p role="alert" className="ga-confirm__error">
                {t('confirm.failed')}
              </p>
            ) : null}
          </>
        )}
      </div>
    </Modal>
  );
}
