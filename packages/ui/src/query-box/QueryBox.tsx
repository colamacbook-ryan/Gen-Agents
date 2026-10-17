// Ô truy vấn của lưới (STD-07 §5, FRONTEND-SPEC §5): mono trên nền sunken, chip điều kiện đã áp dụng kèm nút ×.
// Gõ mệnh đề rồi Enter ⇒ kiểm theo whitelist của lưới; sai thì báo lỗi tại chỗ (không áp truy vấn nửa vời — DATABASE §8.3).
// Backspace ở ô trống ⇒ lấy chip cuối ra sửa. Nguồn sự thật là chuỗi truy vấn đã áp (`value`); chip suy từ chuỗi đó.
import { type KeyboardEvent, type Ref, useId, useMemo, useState } from 'react';
import { IconSearch } from '../datagrid/icons.tsx';
import type { QueryBoxLabels } from '../datagrid/labels.ts';
import { type QueryField, resolveQuery } from './fields.ts';
import { clauseText, joinClauses, parseQuery, type QueryError, removeClause } from './parse.ts';

export interface QueryBoxProps {
  /** truy vấn đang áp dụng */
  value: string;
  fields: readonly QueryField[];
  /** prefix display_id của lưới (từ trần `SK-0004` ⇒ điều kiện id) */
  idPrefix?: string;
  onChange: (q: string) => void;
  placeholder: string;
  labels: QueryBoxLabels;
  inputRef?: Ref<HTMLInputElement>;
  /** lỗi máy chủ trả cho truy vấn đang áp (`query.invalid`) */
  serverError?: { reason: string; position: number | null } | null;
}

interface DraftError {
  error: QueryError;
  /** chuỗi đã kiểm (đã áp + nháp) — để cắt đoạn lỗi */
  text: string;
}

export function QueryBox(props: QueryBoxProps) {
  const { value, fields, idPrefix, onChange, placeholder, labels, inputRef, serverError } = props;
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<DraftError | null>(null);
  const errorId = useId();
  const chipsId = useId();

  const parsed = useMemo(() => parseQuery(value), [value]);
  const appliedError = useMemo(() => {
    if (!parsed.ok) return parsed.error;
    const r = resolveQuery(value, fields, idPrefix === undefined ? {} : { idPrefix });
    return r.ok ? null : r.error;
  }, [parsed, value, fields, idPrefix]);

  const apply = (): void => {
    if (draft.trim() === '') return;
    const next = joinClauses([value, draft]);
    const r = resolveQuery(next, fields, idPrefix === undefined ? {} : { idPrefix });
    if (!r.ok) {
      setDraftError({ error: r.error, text: next });
      return;
    }
    setDraftError(null);
    setDraft('');
    onChange(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      apply();
      return;
    }
    if (e.key === 'Escape') {
      if (draft !== '' || draftError) {
        e.preventDefault();
        e.stopPropagation();
        setDraft('');
        setDraftError(null);
      }
      return;
    }
    if (e.key === 'Backspace' && draft === '' && parsed.ok && parsed.clauses.length > 0) {
      e.preventDefault();
      const last = parsed.clauses.length - 1;
      const c = parsed.clauses[last];
      if (!c) return;
      setDraft(clauseText(value, c));
      onChange(removeClause(value, parsed.clauses, last));
    }
  };

  const err = draftError?.error ?? appliedError;
  const errText = draftError?.text ?? value;
  let message: string | null = null;
  if (err) message = labels.error(err.reason, errText.slice(err.position, err.position + Math.max(err.length, 1)));
  else if (serverError) message = labels.error(serverError.reason, '');

  return (
    <div className="ga-qb" data-anchor="panel:query-box" data-invalid={message ? '' : undefined}>
      <span className="ga-qb-icon">
        <IconSearch />
      </span>
      {parsed.ok ? (
        parsed.clauses.length > 0 && (
          <ul className="ga-qb-chips" id={chipsId} aria-label={labels.conditions}>
            {parsed.clauses.map((c, i) => {
              const text = clauseText(value, c);
              const bad =
                appliedError !== null &&
                appliedError.position >= c.start &&
                appliedError.position < Math.max(c.end, c.start + 1);
              return (
                <li key={`${c.start}:${text}`} className="ga-qb-chip" data-invalid={bad ? '' : undefined}>
                  {text}
                  <button
                    type="button"
                    className="ga-qb-x"
                    aria-label={labels.removeCondition(text)}
                    onClick={() => onChange(removeClause(value, parsed.clauses, i))}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <ul className="ga-qb-chips" aria-label={labels.conditions}>
          <li className="ga-qb-chip" data-invalid="">
            {value.length > 40 ? `${value.slice(0, 39)}…` : value}
            <button
              type="button"
              className="ga-qb-x"
              aria-label={labels.removeCondition(value)}
              onClick={() => onChange('')}
            >
              ×
            </button>
          </li>
        </ul>
      )}
      <input
        ref={inputRef}
        className="ga-qb-input"
        type="text"
        spellCheck={false}
        autoComplete="off"
        aria-label={labels.label}
        aria-invalid={draftError ? true : undefined}
        aria-describedby={message ? errorId : undefined}
        placeholder={parsed.ok && parsed.clauses.length > 0 ? '' : placeholder}
        value={draft}
        maxLength={500}
        onChange={(e) => {
          setDraft(e.target.value);
          if (draftError) setDraftError(null);
        }}
        onKeyDown={onKeyDown}
      />
      {message && (
        <div className="ga-qb-error" id={errorId} role="alert">
          {message}
        </div>
      )}
    </div>
  );
}
