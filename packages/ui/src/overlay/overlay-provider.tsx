import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

/** Ba overlay O1–O3 (FRONTEND-SPEC §2.5). Một cái mở tại một thời điểm: mở cái mới thì đóng cái cũ. */
export type OverlayName = 'palette' | 'notifications' | 'shortcuts';

export interface OverlayApi {
  current: OverlayName | null;
  open(name: OverlayName): void;
  close(): void;
  toggle(name: OverlayName): void;
}

const Ctx = createContext<OverlayApi | null>(null);

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<OverlayName | null>(null);
  const open = useCallback((name: OverlayName) => setCurrent(name), []);
  const close = useCallback(() => setCurrent(null), []);
  const toggle = useCallback((name: OverlayName) => setCurrent((c) => (c === name ? null : name)), []);
  const api = useMemo(() => ({ current, open, close, toggle }), [current, open, close, toggle]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useOverlays(): OverlayApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useOverlays phải nằm trong <OverlayProvider>');
  return api;
}
