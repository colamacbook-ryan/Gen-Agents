import { useI18n } from '@ga/i18n/react';
import type { LucideIcon } from 'lucide-react';
import { Search, ShieldAlert } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../primitives/icon.tsx';
import { Kbd } from '../primitives/kbd.tsx';
import { formatCombo } from '../primitives/shortcuts.tsx';
import { matchesBase } from './match.ts';
import { Scrim } from './scrim.tsx';
import { useOverlayBehavior } from './use-overlay-behavior.ts';
import './modal.css';
import './command-palette.css';

export interface PaletteItem {
  id: string;
  /** nhãn đã dịch */
  label: string;
  /** ID mono phụ ở bên phải, vd "RL-0001" */
  hint?: string;
  icon?: LucideIcon;
  /** nhóm hiển thị (đã dịch): Role · ID · Hành động · Điều hướng · Cài đặt */
  group: string;
  /** từ khoá tìm thêm (không hiển thị) */
  keywords?: string;
  /** hành động nguy hiểm: `run` phải mở modal xác nhận, không làm thẳng (FRONTEND-SPEC O1) */
  danger?: boolean;
  run(): void;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose(): void;
  items: readonly PaletteItem[];
}

/** O1 Command palette (khung): ô tìm + kết quả gom theo nhóm; ↑↓ chọn, ↵ chạy, Esc đóng. Nguồn kết quả do app cấp. */
export function CommandPalette({ open, onClose, items }: CommandPaletteProps) {
  const { t, locale } = useI18n();
  const frame = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();

  useOverlayBehavior(frame, { open, onEscape: onClose, initialFocus: input });

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  const results = useMemo(
    () => items.filter((it) => matchesBase(`${it.label} ${it.hint ?? ''} ${it.keywords ?? ''}`, query, locale)),
    [items, query, locale],
  );

  // nhóm theo thứ tự xuất hiện đầu tiên; `flat` giữ thứ tự hiển thị để ↑↓ đi đúng
  const { groups, flat } = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, PaletteItem[]>();
    for (const it of results) {
      if (!map.has(it.group)) {
        map.set(it.group, []);
        order.push(it.group);
      }
      map.get(it.group)?.push(it);
    }
    const g = order.map((name) => ({ name, items: map.get(name) as PaletteItem[] }));
    return { groups: g, flat: g.flatMap((x) => x.items) };
  }, [results]);

  useEffect(() => {
    if (active >= flat.length) setActive(Math.max(0, flat.length - 1));
  }, [flat.length, active]);

  if (!open) return null;

  const run = (it: PaletteItem | undefined) => {
    if (!it) return;
    onClose();
    it.run();
  };
  const optionId = (id: string) => `${listId}-${id}`;
  const current = flat[active];

  return createPortal(
    <Scrim variant="top" onDismiss={onClose}>
      <div
        ref={frame}
        className="ga-palette"
        role="dialog"
        aria-modal="true"
        aria-label={t('palette.title')}
        tabIndex={-1}
      >
        <div className="ga-palette__search">
          <Icon icon={Search} size={16} />
          <input
            ref={input}
            className="ga-palette__input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={current ? optionId(current.id) : undefined}
            aria-label={t('palette.title')}
            placeholder={t('palette.placeholder')}
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.currentTarget.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => (flat.length === 0 ? 0 : (i + 1) % flat.length));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => (flat.length === 0 ? 0 : (i - 1 + flat.length) % flat.length));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                run(current);
              }
            }}
          />
        </div>
        <div className="ga-palette__list" id={listId} role="listbox" aria-label={t('palette.results')}>
          {flat.length === 0 ? (
            <div className="ga-palette__empty" role="status">
              {t('palette.empty')}
            </div>
          ) : (
            groups.map((g) => (
              // biome-ignore lint/a11y/useSemanticElements: nhóm trong listbox — fieldset không hợp lệ ở đây
              <div key={g.name} role="group" aria-label={g.name}>
                <div className="ga-palette__group" aria-hidden="true">
                  {g.name}
                </div>
                {g.items.map((it) => (
                  // biome-ignore lint/a11y/useKeyWithClickEvents: bàn phím đi qua ô combobox (aria-activedescendant)
                  <div
                    key={it.id}
                    id={optionId(it.id)}
                    role="option"
                    tabIndex={-1}
                    aria-selected={it === current}
                    className="ga-palette__item"
                    onMouseMove={() => setActive(flat.indexOf(it))}
                    onClick={() => run(it)}
                  >
                    {it.icon ? <Icon icon={it.icon} size={16} /> : null}
                    <span className="ga-palette__label">{it.label}</span>
                    {it.danger ? (
                      <span className="ga-palette__danger" title={t('palette.dangerHint')}>
                        <Icon icon={ShieldAlert} size={14} />
                        <span className="ga-sr-only">{t('palette.dangerHint')}</span>
                      </span>
                    ) : null}
                    {it.hint ? <span className="ga-palette__hint">{it.hint}</span> : null}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
        <div className="ga-palette__foot" aria-hidden="true">
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> {t('palette.hintMove')}
          </span>
          <span>
            <Kbd>↵</Kbd> {t('palette.hintRun')}
          </span>
          <span>
            <Kbd>{formatCombo('escape')}</Kbd> {t('palette.hintClose')}
          </span>
        </div>
      </div>
    </Scrim>,
    document.body,
  );
}
