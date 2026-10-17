import './kbd.css';

/** Phím tắt dạng mono nhỏ có viền. `children` là chuỗi phím đã định dạng (xem formatCombo). */
export function Kbd({ children }: { children: string }) {
  return <kbd className="ga-kbd">{children}</kbd>;
}
