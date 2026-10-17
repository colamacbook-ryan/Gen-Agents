import { useT } from '@ga/i18n/react';
import { X } from 'lucide-react';
import { type KeyboardEventHandler, type ReactNode, type RefObject, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from '../primitives/button.tsx';
import { Scrim } from './scrim.tsx';
import { useOverlayBehavior } from './use-overlay-behavior.ts';
import './modal.css';

export interface ModalProps {
  open: boolean;
  /** đóng bằng nút ×, Esc, bấm nền. Bỏ trống + `blocking` = overlay chặn không đóng được (chế độ khắc phục). */
  onClose?: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** không đóng được (không nút ×, không Esc, không bấm nền); role `alertdialog` */
  blocking?: boolean;
  /** cho phép bấm nền để đóng (mặc định tắt: tránh mất dữ liệu nhập dở) */
  closeOnScrimClick?: boolean;
  initialFocus?: RefObject<HTMLElement | null>;
  className?: string;
  /** phím bấm trong khung (vd ⌘↵ xác nhận) */
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  /** id phần tử mô tả nội dung (alertdialog nên có) */
  describedBy?: string;
}

/** Modal 10px bo góc, bẫy focus, trả focus, Esc, khoá cuộn nền. Một modal tại một thời điểm (không modal chồng modal). */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  blocking = false,
  closeOnScrimClick = false,
  initialFocus,
  className,
  onKeyDown,
  describedBy,
}: ModalProps) {
  const t = useT();
  const frame = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useOverlayBehavior(frame, { open, onEscape: blocking ? undefined : onClose, initialFocus });
  if (!open) return null;
  const cls = ['ga-modal', size !== 'md' && `ga-modal--${size}`, className].filter(Boolean).join(' ');
  return createPortal(
    <Scrim onDismiss={closeOnScrimClick && !blocking ? onClose : undefined}>
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-modal hợp lệ cho cả dialog lẫn alertdialog; role chọn theo `blocking` */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: khung dialog / alertdialog (role chọn theo `blocking`) nhận phím ⌘↵ của ConfirmModal */}
      <div
        ref={frame}
        className={cls}
        role={blocking ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="ga-modal__head">
          <h2 id={titleId} className="ga-modal__title">
            {title}
          </h2>
          {!blocking && onClose ? (
            <IconButton icon={X} size="sm" iconSize={14} label={t('common.close')} onClick={onClose} />
          ) : null}
        </div>
        <div className="ga-modal__body">{children}</div>
        {footer ? <div className="ga-modal__foot">{footer}</div> : null}
      </div>
    </Scrim>,
    document.body,
  );
}

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  initialFocus?: RefObject<HTMLElement | null>;
}

/** Drawer phải 400px (O2 Thông báo). */
export function Drawer({ open, onClose, title, children, initialFocus }: DrawerProps) {
  const t = useT();
  const frame = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useOverlayBehavior(frame, { open, onEscape: onClose, initialFocus });
  if (!open) return null;
  return createPortal(
    <Scrim variant="drawer" onDismiss={onClose}>
      <div ref={frame} className="ga-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="ga-modal__head">
          <h2 id={titleId} className="ga-modal__title">
            {title}
          </h2>
          <IconButton icon={X} size="sm" iconSize={14} label={t('common.close')} onClick={onClose} />
        </div>
        <div className="ga-modal__body">{children}</div>
      </div>
    </Scrim>,
    document.body,
  );
}
