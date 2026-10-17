import { type ComponentProps, type ReactNode, useId } from 'react';
import './text-field.css';

export interface TextFieldProps extends Omit<ComponentProps<'input'>, 'id'> {
  label: ReactNode;
  hint?: ReactNode;
  /** lỗi inline (đã dịch); có lỗi ⇒ aria-invalid + aria-describedby */
  error?: ReactNode;
}

/** Ô nhập có `<label>` thật (STD-07 §10), gợi ý và lỗi inline gắn aria-describedby. */
export function TextField({ label, hint, error, className, ...input }: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [error ? errId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={['ga-field', className].filter(Boolean).join(' ')}>
      <label className="ga-field__label" htmlFor={id}>
        {label}
      </label>
      <input
        {...input}
        id={id}
        className="ga-field__input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {hint ? (
        <span id={hintId} className="ga-field__hint">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errId} className="ga-field__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
