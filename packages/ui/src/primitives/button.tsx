import type { LucideIcon } from 'lucide-react';
import { LoaderCircle } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { Icon } from './icon.tsx';
import './button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  /** icon đứng trước chữ */
  icon?: LucideIcon;
  /** đang xử lý: khoá nút, hiện spinner nhỏ, aria-busy */
  busy?: boolean;
  /** gợi ý phím tắt mono nhỏ, vd "N" hoặc "⌘↵" */
  kbd?: string;
  children?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  busy = false,
  kbd,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const cls = ['ga-btn', variant !== 'secondary' && `ga-btn--${variant}`, size === 'sm' && 'ga-btn--sm', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button {...rest} type={type} className={cls} disabled={disabled || busy} aria-busy={busy || undefined}>
      {busy ? (
        <Icon icon={LoaderCircle} size={14} className="ga-spinner" />
      ) : icon ? (
        <Icon icon={icon} size={14} />
      ) : null}
      {children}
      {kbd ? <span className="ga-btn__kbd">{kbd}</span> : null}
    </button>
  );
}

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children' | 'aria-label'> {
  icon: LucideIcon;
  /** bắt buộc: nút chỉ có icon phải có nhãn truy cập (STD-07 §10) */
  label: string;
  size?: 'md' | 'sm';
  iconSize?: number;
}

export function IconButton({
  icon,
  label,
  size = 'md',
  iconSize = 16,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  const cls = ['ga-icon-btn', size === 'sm' && 'ga-icon-btn--sm', className].filter(Boolean).join(' ');
  return (
    <button {...rest} type={type} className={cls} aria-label={label} title={rest.title ?? label}>
      <Icon icon={icon} size={iconSize} />
    </button>
  );
}
