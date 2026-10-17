import type { I18nKey } from '@ga/i18n';
import { useI18n } from '@ga/i18n/react';
import { useMemo, useRef, useState } from 'react';
import { Kbd } from '../primitives/kbd.tsx';
import { formatCombo } from '../primitives/shortcuts.tsx';
import { TextField } from '../primitives/text-field.tsx';
import { matchesBase } from './match.ts';
import { Modal } from './modal.tsx';
import './shortcuts-dialog.css';

export interface ShortcutDoc {
  keys: string;
  label: I18nKey;
}

export interface ShortcutGroupDoc {
  title: I18nKey;
  items: readonly ShortcutDoc[];
}

/** Bảng phím tắt toàn cục (FRONTEND-SPEC §2.4; STD-07 §10). Phím riêng từng màn do màn đó tự ghi vào bảng của nó. */
export const GLOBAL_SHORTCUTS: readonly ShortcutGroupDoc[] = [
  {
    title: 'shortcuts.group.nav',
    items: [
      { keys: 'mod+k', label: 'shortcuts.palette' },
      { keys: 'g d', label: 'shortcuts.go.overview' },
      { keys: 'g u', label: 'shortcuts.go.roles' },
      { keys: 'g k', label: 'shortcuts.go.birth' },
      { keys: 'g t', label: 'shortcuts.go.training' },
      { keys: 'g c', label: 'shortcuts.go.cards' },
      { keys: 'g b', label: 'shortcuts.go.brain' },
      { keys: 'g e', label: 'shortcuts.go.engines' },
      { keys: 'g l', label: 'shortcuts.go.audit' },
      { keys: 'g v', label: 'shortcuts.go.update' },
      { keys: 'g s', label: 'shortcuts.go.settings' },
      { keys: 'g x', label: 'shortcuts.go.leaderboard' },
      { keys: 'g p', label: 'shortcuts.go.proactive' },
      { keys: '[', label: 'shortcuts.tabPrev' },
      { keys: ']', label: 'shortcuts.tabNext' },
    ],
  },
  {
    title: 'shortcuts.group.grid',
    items: [
      { keys: '/', label: 'shortcuts.focusQuery' },
      { keys: 'j', label: 'shortcuts.rowDown' },
      { keys: 'k', label: 'shortcuts.rowUp' },
      { keys: 'enter', label: 'shortcuts.openRow' },
      { keys: 'mod+.', label: 'shortcuts.toggleInspector' },
      { keys: 'alt+p', label: 'shortcuts.pinMode' },
      { keys: '@', label: 'shortcuts.pinPicker' },
    ],
  },
  {
    title: 'shortcuts.group.actions',
    items: [
      { keys: 'n', label: 'shortcuts.newRole' },
      { keys: 'mod+s', label: 'shortcuts.save' },
      { keys: 'mod+enter', label: 'shortcuts.confirm' },
      { keys: 'escape', label: 'shortcuts.close' },
      { keys: 'mod+j', label: 'shortcuts.logDrawer' },
      { keys: '?', label: 'shortcuts.help' },
    ],
  },
];

export interface ShortcutsDialogProps {
  open: boolean;
  onClose(): void;
  groups?: readonly ShortcutGroupDoc[];
}

/** O3 Bảng phím tắt: modal lưới 3 cột, tìm được theo mô tả hoặc phím. */
export function ShortcutsDialog({ open, onClose, groups = GLOBAL_SHORTCUTS }: ShortcutsDialogProps) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(
    () =>
      groups
        .map((g) => ({
          ...g,
          items: g.items.filter((it) =>
            matchesBase(`${t(it.label)} ${formatCombo(it.keys)} ${it.keys}`, query, locale),
          ),
        }))
        .filter((g) => g.items.length > 0),
    [groups, query, t, locale],
  );
  return (
    <Modal open={open} onClose={onClose} title={t('shortcuts.title')} size="lg" initialFocus={searchRef}>
      <TextField
        ref={searchRef}
        className="ga-shortcuts__search"
        label={t('shortcuts.search')}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        autoComplete="off"
      />
      {filtered.length === 0 ? (
        <p className="ga-shortcuts__empty" role="status">
          {t('shortcuts.empty')}
        </p>
      ) : (
        <div className="ga-shortcuts__grid">
          {filtered.map((g) => (
            <section key={g.title} aria-label={t(g.title)}>
              <h3 className="ga-shortcuts__group-title">{t(g.title)}</h3>
              <ul className="ga-shortcuts__list">
                {g.items.map((it) => (
                  <li key={it.keys} className="ga-shortcuts__row">
                    <span className="ga-shortcuts__label">{t(it.label)}</span>
                    <Kbd>{formatCombo(it.keys)}</Kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}
