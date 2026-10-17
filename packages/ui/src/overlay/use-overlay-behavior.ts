import { type RefObject, useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const focusables = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('hidden') && el.tabIndex >= 0,
  );

export interface OverlayBehaviorOptions {
  open: boolean;
  /** đóng khi bấm Esc; `undefined` = không đóng bằng Esc (overlay chặn) */
  onEscape?: () => void;
  /** phần tử nhận focus đầu tiên; mặc định: phần tử focus được đầu tiên trong khung */
  initialFocus?: RefObject<HTMLElement | null>;
}

let scrollLocks = 0;

/**
 * Hành vi chung của modal / drawer: bẫy focus (Tab xoay vòng trong khung), trả focus về nơi mở, Esc, khoá cuộn nền.
 * Khung phải có `tabIndex={-1}` để làm điểm rơi khi không có phần tử focus được.
 */
export function useOverlayBehavior(frame: RefObject<HTMLElement | null>, opts: OverlayBehaviorOptions): void {
  const { open, onEscape, initialFocus } = opts;
  const escRef = useRef(onEscape);
  escRef.current = onEscape;

  useEffect(() => {
    if (!open) return;
    const root = frame.current;
    if (!root) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    scrollLocks += 1;
    document.body.classList.add('ga-scroll-lock');

    const target = initialFocus?.current ?? focusables(root)[0] ?? root;
    target.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && escRef.current) {
        e.preventDefault();
        e.stopPropagation();
        escRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables(root);
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = items[0] as HTMLElement;
      const last = items[items.length - 1] as HTMLElement;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === root || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      scrollLocks = Math.max(0, scrollLocks - 1);
      if (scrollLocks === 0) document.body.classList.remove('ga-scroll-lock');
      // trả focus về nút đã mở overlay (nếu nó còn trong DOM)
      if (previous?.isConnected) previous.focus();
    };
  }, [open, frame, initialFocus]);
}
