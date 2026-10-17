// Thanh công thức (STD-07 §5 mục 2, FRONTEND-SPEC §5): 32px = ô tham chiếu `SK-0004 · D` (120px) | fx | nội dung 1 dòng.
// Ô dài (prompt, SKILL.md, memory) ⇒ editor nhiều dòng ~160px (mono 12, số dòng bên trái, nền sunken) + "Lưu ô ⌘↵" / "Huỷ".
// Hàng LÕI: thêm ô Lý do bắt buộc. Dùng chung cho DataGrid và panel chi tiết node của Sơ đồ (component độc lập, không biết lưới).
import { type KeyboardEvent, type Ref, useId, useRef, useState } from 'react';
import type { FormulaBarLabels } from '../datagrid/labels.ts';

export interface FormulaBarProps {
  /** ô tham chiếu, vd 'IN-0003 · D'; null = chưa chọn ô */
  cellRef: string | null;
  columnLabel: string | null;
  /** nội dung đầy đủ của ô (văn bản thuần) */
  value: string;
  /** nhãn kiểu dữ liệu (badge nhỏ) */
  kindLabel?: string | null;
  /** số token của ô (máy chủ đếm), đã định dạng */
  tokens?: string | null;
  /** cho phép mở editor */
  canEdit: boolean;
  /** đang ở chế độ editor nhiều dòng */
  expanded: boolean;
  /** hàng LÕI: bắt nhập lý do */
  requireReason: boolean;
  saving: boolean;
  /** lỗi lưu (đã dịch) */
  error: string | null;
  labels: FormulaBarLabels;
  onOpen: () => void;
  onSave: (value: string, reason: string | null) => void;
  onCancel: () => void;
  /** ref của textarea (lưới đưa focus vào khi mở editor) */
  editorRef?: Ref<HTMLTextAreaElement>;
}

export function FormulaBar(props: FormulaBarProps) {
  const { cellRef, columnLabel, value, kindLabel, tokens, canEdit, expanded, labels } = props;
  if (expanded && cellRef !== null) {
    // key = ô: đổi ô thì nháp được dựng lại từ nội dung mới; dữ liệu nền đổi trong lúc sửa KHÔNG ghi đè nháp
    return <ExpandedBar key={cellRef} {...props} cellRef={cellRef} />;
  }
  const firstLine = value.split('\n', 1)[0] ?? '';
  return (
    <section className="ga-fb" data-anchor="panel:formula-bar" aria-label={labels.region}>
      <div className="ga-fb-line">
        <span className="ga-fb-ref">{cellRef ?? '—'}</span>
        <span className="ga-fb-fx" aria-hidden="true">
          fx
        </span>
        <span className="ga-fb-body">
          {cellRef === null ? (
            <span className="ga-fb-value" data-empty="">
              {labels.noCell}
            </span>
          ) : (
            <>
              {columnLabel && <span className="ga-fb-col">{columnLabel}</span>}
              <span className="ga-fb-value" title={firstLine}>
                {firstLine}
              </span>
              {tokens && <span className="ga-fb-badge">{labels.tokens(tokens)}</span>}
              {kindLabel && <span className="ga-fb-badge">{kindLabel}</span>}
              {canEdit && (
                <button type="button" className="ga-fb-btn" onClick={props.onOpen}>
                  {labels.openEditor}
                </button>
              )}
            </>
          )}
        </span>
      </div>
    </section>
  );
}

function ExpandedBar(props: FormulaBarProps & { cellRef: string }) {
  const { cellRef, columnLabel, value, tokens, requireReason, saving, error, labels } = props;
  const [draft, setDraft] = useState(value);
  const [reason, setReason] = useState('');
  const gutterRef = useRef<HTMLDivElement>(null);
  const reasonId = useId();
  const statusId = useId();

  const lineCount = Math.max(1, draft.split('\n').length);
  const reasonMissing = requireReason && reason.trim() === '';
  const canSave = !saving && !reasonMissing && draft !== value;

  const save = (): void => {
    if (!canSave) return;
    props.onSave(draft, requireReason ? reason.trim() : null);
  };
  const onKey = (e: KeyboardEvent<HTMLElement>): void => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      props.onCancel();
    }
  };

  return (
    <section className="ga-fb" data-anchor="panel:formula-bar" aria-label={labels.region} data-expanded="">
      <div className="ga-fb-line">
        <span className="ga-fb-ref">{cellRef}</span>
        <span className="ga-fb-fx" aria-hidden="true">
          fx
        </span>
        <span className="ga-fb-body">
          {columnLabel && <span className="ga-fb-col">{columnLabel}</span>}
          <span className="ga-fb-value" />
          {tokens && <span className="ga-fb-badge">{labels.tokens(tokens)}</span>}
          <button type="button" className="ga-fb-btn" onClick={props.onCancel} disabled={saving}>
            {labels.cancel}
          </button>
          <button type="button" className="ga-fb-btn ga-fb-btn-save" onClick={save} disabled={!canSave}>
            {labels.save} <span className="ga-fb-kbd">⌘↵</span>
          </button>
        </span>
      </div>
      <div className="ga-fb-editor">
        <div className="ga-fb-gutter" ref={gutterRef} aria-hidden="true">
          {Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')}
        </div>
        <textarea
          ref={props.editorRef}
          className="ga-fb-text"
          aria-label={labels.editorLabel(cellRef)}
          aria-describedby={statusId}
          spellCheck={false}
          wrap="off"
          value={draft}
          readOnly={saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onScroll={(e) => {
            if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
        />
      </div>
      {requireReason && (
        <div className="ga-fb-reason">
          <label htmlFor={reasonId}>{labels.reason}</label>
          <input
            id={reasonId}
            type="text"
            value={reason}
            maxLength={500}
            aria-required="true"
            placeholder={labels.reasonRequired}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={onKey}
          />
        </div>
      )}
      <div className="ga-fb-status" id={statusId}>
        <span>{labels.lines(String(lineCount))}</span>
        {saving && <span>{labels.saving}</span>}
        {error && (
          <span className="ga-fb-error" role="alert">
            {error}
          </span>
        )}
        {!error && reasonMissing && <span>{labels.reasonRequired}</span>}
        <span className="ga-fb-hint">{labels.hint}</span>
      </div>
    </section>
  );
}
