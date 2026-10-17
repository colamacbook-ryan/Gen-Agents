import { useT } from '@ga/i18n/react';
import { CircleCheck, Info, OctagonX, TriangleAlert, X } from 'lucide-react';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { IconButton } from '../primitives/button.tsx';
import { Icon } from '../primitives/icon.tsx';
import './toast.css';

export type ToastKind = 'ok' | 'info' | 'warn' | 'danger';

export interface ToastInput {
  kind: ToastKind;
  /** dòng chính (đã dịch) */
  title: string;
  /** dòng phụ mono, một dòng (vd "EN-0004 → EN-0003 · cửa sổ 5 giờ đã reset") */
  detail?: string;
  /** ID liên quan, mono (vd "EV-8841") */
  ref?: string;
  /** hành động (vd "Xem EV-8841") */
  action?: { label: string; onClick(): void };
  /** không tự ẩn (mặc định: lỗi không tự ẩn, còn lại 6 giây) */
  persist?: boolean;
}

export interface ToastItem extends ToastInput {
  id: number;
}

/** Tối đa 3 toast cùng lúc (FRONTEND-SPEC §5): toast thứ 4 đẩy toast cũ nhất ra. */
export const MAX_TOASTS = 3;
export const DEFAULT_AUTO_HIDE_MS = 6000;

export interface ToastState {
  toasts: ToastItem[];
  push(input: ToastInput): number;
  dismiss(id: number): void;
  clear(): void;
}

export function createToastStore(): StoreApi<ToastState> {
  let seq = 0;
  return createStore<ToastState>((set) => ({
    toasts: [],
    push(input) {
      seq += 1;
      const id = seq;
      set((s) => ({ toasts: [...s.toasts, { ...input, id }].slice(-MAX_TOASTS) }));
      return id;
    },
    dismiss(id) {
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
    },
    clear() {
      set({ toasts: [] });
    },
  }));
}

const Ctx = createContext<StoreApi<ToastState> | null>(null);

const ICONS = { ok: CircleCheck, info: Info, warn: TriangleAlert, danger: OctagonX } as const;

export interface ToastProviderProps {
  children: ReactNode;
  /** chỉ để test: thời gian tự ẩn */
  autoHideMs?: number;
}

export function ToastProvider({ children, autoHideMs = DEFAULT_AUTO_HIDE_MS }: ToastProviderProps) {
  const store = useMemo(() => createToastStore(), []);
  return (
    <Ctx.Provider value={store}>
      {children}
      <ToastViewport autoHideMs={autoHideMs} />
    </Ctx.Provider>
  );
}

export interface ToastApi {
  push(input: ToastInput): number;
  dismiss(id: number): void;
  clear(): void;
}

export function useToast(): ToastApi {
  const store = useContext(Ctx);
  if (!store) throw new Error('useToast phải nằm trong <ToastProvider>');
  return useMemo(
    () => ({
      push: (input) => store.getState().push(input),
      dismiss: (id) => store.getState().dismiss(id),
      clear: () => store.getState().clear(),
    }),
    [store],
  );
}

function ToastViewport({ autoHideMs }: { autoHideMs: number }) {
  const t = useT();
  const store = useContext(Ctx) as StoreApi<ToastState>;
  const toasts = useStore(store, (s) => s.toasts);
  return (
    <section className="ga-toasts" aria-label={t('toast.region')} hidden={toasts.length === 0}>
      {toasts.map((item) => (
        <ToastView
          key={item.id}
          item={item}
          autoHideMs={autoHideMs}
          onDismiss={() => store.getState().dismiss(item.id)}
        />
      ))}
    </section>
  );
}

function ToastView({ item, autoHideMs, onDismiss }: { item: ToastItem; autoHideMs: number; onDismiss(): void }) {
  const t = useT();
  const [paused, setPaused] = useState(false);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const sticky = item.persist ?? item.kind === 'danger';

  // tự ẩn sau autoHideMs, dừng đếm khi rê chuột / có focus bên trong
  useEffect(() => {
    if (sticky || paused) return;
    const timer = setTimeout(() => dismissRef.current(), autoHideMs);
    return () => clearTimeout(timer);
  }, [sticky, paused, autoHideMs]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: rê chuột / focus chỉ tạm dừng đếm giờ tự ẩn; nút đóng và hành động đều dùng được bằng bàn phím
    <div
      className={`ga-toast ga-toast--${item.kind}`}
      role={item.kind === 'danger' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="ga-toast__icon">
        <Icon icon={ICONS[item.kind]} size={16} />
      </span>
      <div className="ga-toast__body">
        <div className="ga-toast__title">{item.title}</div>
        {item.detail ? <div className="ga-toast__detail">{item.detail}</div> : null}
        {item.action || item.ref ? (
          <div className="ga-toast__foot">
            {item.action ? (
              <button type="button" className="ga-toast__action" onClick={item.action.onClick}>
                {item.action.label}
              </button>
            ) : null}
            {item.ref ? <span className="ga-toast__ref">{item.ref}</span> : null}
          </div>
        ) : null}
      </div>
      <IconButton icon={X} size="sm" iconSize={12} label={t('toast.close')} onClick={onDismiss} />
    </div>
  );
}
