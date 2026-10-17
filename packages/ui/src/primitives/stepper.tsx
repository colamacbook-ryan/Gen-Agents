import type { I18nKey } from '@ga/i18n';
import { useT } from '@ga/i18n/react';
import { Check, GitBranch, LoaderCircle, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Icon } from './icon.tsx';
import './stepper.css';

export type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'branch';

export interface StepperStep {
  id: string;
  label: ReactNode;
  status: StepStatus;
  detail?: ReactNode;
}

export interface StepperProps {
  steps: readonly StepperStep[];
  /** ngang (A7) · dọc (G2, dải A3.E) */
  orientation?: 'horizontal' | 'vertical';
  /** nhãn truy cập của danh sách bước */
  label: string;
}

const STATUS_KEY: Record<StepStatus, I18nKey> = {
  pending: 'stepper.pending',
  running: 'stepper.running',
  done: 'stepper.done',
  error: 'stepper.error',
  branch: 'stepper.branch',
};

/** Stepper: chờ / đang chạy / xong / lỗi / rẽ nhánh. Trạng thái luôn có chữ + icon, không chỉ màu. */
export function Stepper({ steps, orientation = 'horizontal', label }: StepperProps) {
  const t = useT();
  return (
    <ol className={`ga-stepper ga-stepper--${orientation === 'vertical' ? 'v' : 'h'}`} aria-label={label}>
      {steps.map((s, i) => (
        <li
          key={s.id}
          className={`ga-step ga-step--${s.status}`}
          aria-current={s.status === 'running' ? 'step' : undefined}
        >
          <span className="ga-step__marker" aria-hidden="true">
            {s.status === 'done' ? (
              <Icon icon={Check} size={14} />
            ) : s.status === 'error' ? (
              <Icon icon={X} size={14} />
            ) : s.status === 'running' ? (
              <Icon icon={LoaderCircle} size={14} className="ga-spinner" />
            ) : s.status === 'branch' ? (
              <Icon icon={GitBranch} size={14} />
            ) : (
              i + 1
            )}
          </span>
          <span className="ga-step__body">
            <span className="ga-step__label">{s.label}</span>
            <span className="ga-step__status">{t(STATUS_KEY[s.status])}</span>
            {s.detail ? <span className="ga-step__detail">{s.detail}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
