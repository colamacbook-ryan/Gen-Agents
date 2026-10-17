import { formatBytes } from '@ga/i18n';
import { useI18n } from '@ga/i18n/react';
import { Upload } from 'lucide-react';
import { type DragEvent, type ReactNode, useCallback, useId, useRef, useState } from 'react';
import { Button } from './button.tsx';
import './file-dropzone.css';

export interface FileDropzoneProps {
  /** tên đích hiện trên lớp phủ, vd "Kho tri thức của Mai" / "Đính kèm" (đã dịch) */
  targetLabel: string;
  onFiles(files: File[]): void;
  /** trần mỗi tệp (byte) — đọc từ cài đặt (vd ST-0018), không hardcode */
  maxBytes?: number;
  /** thuộc tính `accept` của input tệp */
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  /** hiện thanh "Chọn tệp" dưới vùng (đường vào bằng bàn phím) */
  picker?: boolean;
  children?: ReactNode;
}

const hasFiles = (e: DragEvent): boolean => Array.from(e.dataTransfer?.types ?? []).includes('Files');

/** Phủ vùng khi kéo tệp vào (viền đứt ember + tên đích) và đường chọn tệp bằng nút. Tệp quá trần bị từ chối ngay, nói rõ trần. */
export function FileDropzone({
  targetLabel,
  onFiles,
  maxBytes,
  accept,
  multiple = true,
  disabled = false,
  picker = true,
  children,
}: FileDropzoneProps) {
  const { t, locale } = useI18n();
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const depth = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const errId = useId();

  const accept_ = useCallback(
    (list: FileList | File[] | null | undefined) => {
      const files = Array.from(list ?? []);
      if (files.length === 0) return;
      if (maxBytes !== undefined) {
        const big = files.find((f) => f.size > maxBytes);
        if (big) {
          setError(t('dropzone.tooLarge', { limit: formatBytes(maxBytes, locale) }));
          return;
        }
      }
      setError(null);
      onFiles(files);
    },
    [maxBytes, onFiles, t, locale],
  );

  const reset = () => {
    depth.current = 0;
    setOver(false);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: kéo-thả không có vai tương tác; đường bàn phím là nút "Chọn tệp" ngay dưới
    <div
      className="ga-drop"
      onDragEnter={(e) => {
        if (disabled || !hasFiles(e)) return;
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(e) => {
        if (disabled || !hasFiles(e)) return;
        e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (disabled || !hasFiles(e)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(e) => {
        if (disabled || !hasFiles(e)) return;
        e.preventDefault();
        reset();
        accept_(e.dataTransfer.files);
      }}
    >
      {children}
      {over ? (
        <div className="ga-drop__overlay" aria-hidden="true">
          <span className="ga-drop__target">{t('dropzone.dropInto', { target: targetLabel })}</span>
        </div>
      ) : null}
      {picker ? (
        <div className="ga-drop__bar">
          <input
            ref={inputRef}
            type="file"
            className="ga-sr-only"
            tabIndex={-1}
            multiple={multiple}
            accept={accept}
            disabled={disabled}
            aria-label={t('dropzone.pick')}
            onChange={(e) => {
              accept_(e.currentTarget.files);
              e.currentTarget.value = '';
            }}
          />
          <Button size="sm" icon={Upload} disabled={disabled} onClick={() => inputRef.current?.click()}>
            {t('dropzone.pick')}
          </Button>
          <span>{t('dropzone.hint', { target: targetLabel })}</span>
          {error ? (
            <span id={errId} role="alert" className="ga-drop__error">
              {error}
            </span>
          ) : null}
        </div>
      ) : error ? (
        <span role="alert" className="ga-drop__error">
          {error}
        </span>
      ) : null}
    </div>
  );
}
