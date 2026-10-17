import { createContext, type KeyboardEvent, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useShellLink } from './link.tsx';
import type { NavTab } from './nav-model.ts';
import './page-header.css';

interface ChromeApi {
  slot: HTMLElement | null;
  setSlot(el: HTMLElement | null): void;
}

const Chrome = createContext<ChromeApi | null>(null);

/** Cầu nối giữa PageHeader (khe nút hành động) và màn bên dưới: màn gọi `<PageActions>` ở bất kỳ đâu trong cây của nó. */
export function PageChromeProvider({ children }: { children: ReactNode }) {
  const [slot, setSlotState] = useState<HTMLElement | null>(null);
  const setSlot = useCallback((el: HTMLElement | null) => setSlotState(el), []);
  const api = useMemo(() => ({ slot, setSlot }), [slot, setSlot]);
  return <Chrome.Provider value={api}>{children}</Chrome.Provider>;
}

export interface PageHeaderProps {
  title: string;
  /** mô tả 1 dòng, mờ */
  description?: string;
  tabs?: readonly NavTab[];
  activeTabId?: string | null;
  /** nhãn truy cập của thanh tab */
  tabsLabel?: string;
  /** chữ mono mờ bên phải thanh tab (vd múi giờ · instance) */
  tabsExtra?: string;
  /** id gắn cho tab đang chọn để `role=tabpanel` trỏ `aria-labelledby` */
  tabId?(id: string): string;
}

/** Page header 2 tầng: tầng 1 cao 48 (tiêu đề 18/600 + mô tả + nút), tầng 2 thanh tab cao 36 (mỗi tab có số đếm mono). */
export function PageHeader({ title, description, tabs, activeTabId, tabsLabel, tabsExtra, tabId }: PageHeaderProps) {
  const chrome = useContext(Chrome);
  const Link = useShellLink();
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'));
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? items.length - 1
          : (i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };
  return (
    <div className="ga-page">
      <div className="ga-page__top">
        <h1 className="ga-page__title">{title}</h1>
        {description ? <span className="ga-page__desc">{description}</span> : null}
        <div className="ga-page__actions" ref={chrome?.setSlot} />
      </div>
      {tabs && tabs.length > 0 ? (
        <div className="ga-tabs" role="tablist" aria-label={tabsLabel} onKeyDown={onKeyDown}>
          {tabs.map((tab) => {
            const selected = tab.id === activeTabId;
            return (
              <Link
                key={tab.id}
                to={tab.to}
                id={tabId?.(tab.id)}
                className="ga-tab"
                role="tab"
                aria-selected={selected}
                aria-current={selected ? 'page' : undefined}
                tabIndex={selected || !activeTabId ? 0 : -1}
              >
                {tab.label}
                {tab.count !== undefined ? <span className="ga-tab__count">{tab.count}</span> : null}
              </Link>
            );
          })}
          {tabsExtra ? <span className="ga-tabs__extra">{tabsExtra}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

export interface PageActionsProps {
  /** tối đa MỘT nút accent chính */
  primary?: ReactNode;
  /** tối đa HAI nút phụ */
  secondary?: readonly [ReactNode] | readonly [ReactNode, ReactNode];
}

/** Nút hành động của trang, đưa vào khe bên phải tầng 1 của page header (≤1 accent + 2 phụ — STD-07 §3). */
export function PageActions({ primary, secondary }: PageActionsProps) {
  const chrome = useContext(Chrome);
  if (!chrome?.slot) return null;
  return createPortal(
    <>
      {secondary}
      {primary}
    </>,
    chrome.slot,
  );
}
