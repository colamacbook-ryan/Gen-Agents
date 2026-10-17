import { useOverlays, useShortcut } from '@ga/ui';
import { useNavigate } from '@tanstack/react-router';
import { GO_TO, NAV_GROUPS, pathOf, resolveLocation } from '../nav.ts';

function GoTo({ letter, to }: { letter: string; to: string }) {
  const navigate = useNavigate();
  useShortcut({ id: `go-${letter}`, keys: `g ${letter}`, run: () => void navigate({ to }) });
  return null;
}

export interface GlobalShortcutsProps {
  pathname: string;
  onToggleLog(): void;
}

/** Phím tắt toàn cục (FRONTEND-SPEC §2.4): ⌘K, ?, G + chữ cái, [ ], N, ⌘J. Phím riêng từng màn do màn đó đăng ký. */
export function GlobalShortcuts({ pathname, onToggleLog }: GlobalShortcutsProps) {
  const navigate = useNavigate();
  const overlays = useOverlays();
  const loc = resolveLocation(pathname);

  const stepTab = (delta: 1 | -1) => {
    if (!loc || loc.group.tabs.length === 0 || !loc.tab) return;
    const tabs = loc.group.tabs;
    const i = tabs.findIndex((t) => t.id === loc.tab?.id);
    const next = tabs[(i + delta + tabs.length) % tabs.length];
    if (next) void navigate({ to: pathOf(loc.group, next) });
  };

  useShortcut({ id: 'palette', keys: 'mod+k', run: () => overlays.toggle('palette') });
  useShortcut({ id: 'help', keys: '?', run: () => overlays.open('shortcuts') });
  useShortcut({ id: 'log', keys: 'mod+j', run: onToggleLog });
  useShortcut({ id: 'new-role', keys: 'n', run: () => void navigate({ to: '/people/birth' }) });
  useShortcut({ id: 'tab-prev', keys: '[', run: () => stepTab(-1) });
  useShortcut({ id: 'tab-next', keys: ']', run: () => stepTab(1) });

  return (
    <>
      {Object.entries(GO_TO).map(([letter, to]) => (
        <GoTo key={letter} letter={letter} to={to} />
      ))}
    </>
  );
}

export const NAV_PATHS: readonly string[] = NAV_GROUPS.map((g) => pathOf(g));
