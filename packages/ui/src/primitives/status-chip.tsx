import type { I18nKey } from '@ga/i18n';
import { useT } from '@ga/i18n/react';
import {
  Archive,
  BookOpen,
  CircleCheck,
  Droplet,
  FileText,
  Hourglass,
  IdCard,
  type LucideIcon,
  Moon,
  OctagonX,
  Pause,
  Sprout,
  Square,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Icon } from './icon.tsx';
import './status-chip.css';

export type ChipTone = 'ok' | 'info' | 'warn' | 'danger' | 'idle' | 'wound' | 'accent';

/** Trạng thái nghiệp vụ có sẵn chữ i18n + icon + tông (FRONTEND-SPEC §5 "StatusChip"). */
export const CHIP_STATES = {
  // vòng đời Role
  draft: { tone: 'idle', icon: FileText },
  born: { tone: 'info', icon: Sprout },
  training: { tone: 'info', icon: BookOpen },
  trained: { tone: 'ok', icon: CircleCheck },
  carded: { tone: 'ok', icon: IdCard },
  suspended: { tone: 'warn', icon: Pause },
  archived: { tone: 'idle', icon: Archive },
  // runtime
  running: { tone: 'ok', icon: null },
  sleeping: { tone: 'idle', icon: Moon },
  error: { tone: 'danger', icon: OctagonX },
  stopped: { tone: 'idle', icon: Square },
  awaiting_permission: { tone: 'warn', icon: Hourglass },
  // tình trạng (không phải sự cố hệ thống)
  wounded: { tone: 'wound', icon: Droplet },
} as const satisfies Record<string, { tone: ChipTone; icon: LucideIcon | null }>;

export type ChipState = keyof typeof CHIP_STATES;

const STATE_KEY: Record<ChipState, I18nKey> = {
  draft: 'status.draft',
  born: 'status.born',
  training: 'status.training',
  trained: 'status.trained',
  carded: 'status.carded',
  suspended: 'status.suspended',
  archived: 'status.archived',
  running: 'status.running',
  sleeping: 'status.sleeping',
  error: 'status.error',
  stopped: 'status.stopped',
  awaiting_permission: 'status.awaiting_permission',
  wounded: 'status.wounded',
};

export type StatusChipProps =
  | { state: ChipState; tone?: never; icon?: never; children?: never; className?: string }
  | { state?: never; tone: ChipTone; icon?: LucideIcon; children: ReactNode; className?: string };

/** Chip 20px, chữ 12px, LUÔN icon + chữ (không chỉ màu). */
export function StatusChip(props: StatusChipProps) {
  const t = useT();
  let tone: ChipTone;
  let glyph: LucideIcon | null;
  let label: ReactNode;
  let breath = false;
  if (props.state !== undefined) {
    const def = CHIP_STATES[props.state];
    tone = def.tone;
    glyph = def.icon;
    label = t(STATE_KEY[props.state]);
    breath = props.state === 'running';
  } else {
    tone = props.tone;
    glyph = props.icon ?? null;
    label = props.children;
  }
  const cls = ['ga-chip', `ga-chip--${tone}`, props.className].filter(Boolean).join(' ');
  return (
    <span className={cls}>
      {glyph ? (
        <Icon icon={glyph} size={12} />
      ) : (
        <span className={breath ? 'ga-chip__dot ga-chip__dot--breath' : 'ga-chip__dot'} aria-hidden="true" />
      )}
      {label}
    </span>
  );
}
