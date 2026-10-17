// Bàn phím của lưới (hàm thuần, test được không cần DOM). Phím theo Excel + FRONTEND-SPEC §2.4 (J/K, `/`, Enter).
// Tab KHÔNG bị giữ: Tab rời lưới (không bẫy bàn phím — APG grid); khi đang sửa ô, Tab = lưu + sang phải như Excel (xử lý ở editor).

export interface GridKey {
  key: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
}

export interface Cursor {
  /** chỉ số hàng hiển thị (0…rows-1) */
  row: number;
  /** chỉ số cột đang hiện (0…cols-1) */
  col: number;
}

export interface Extent {
  rows: number;
  cols: number;
  /** số hàng một trang (PageUp/PageDown) */
  pageRows: number;
}

export type GridCommand =
  | { type: 'move'; to: Cursor }
  /** F2 / Enter (khi không có hành động mở hàng): vào chế độ sửa ô */
  | { type: 'edit' }
  /** Enter khi màn có inspector / trang chi tiết */
  | { type: 'open' }
  /** Space trên ô bool */
  | { type: 'toggle' }
  /** Shift+Space: chọn / bỏ chọn hàng */
  | { type: 'select-row' }
  /** Ctrl/⌘+A: chọn mọi hàng khớp truy vấn */
  | { type: 'select-all' }
  /** `/`: focus ô truy vấn của lưới */
  | { type: 'focus-query' };

export interface KeyContext {
  /** ô đang chọn là bool */
  boolCell: boolean;
  /** màn có hành động mở hàng (inspector) */
  canOpen: boolean;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** phím → lệnh; null = lưới không xử lý (để trình duyệt / phím tắt toàn cục) */
export function keyCommand(k: GridKey, cur: Cursor | null, ext: Extent, ctx: KeyContext): GridCommand | null {
  if (ext.rows <= 0 || ext.cols <= 0) return k.key === '/' && !k.ctrl && !k.meta ? { type: 'focus-query' } : null;
  const mod = k.ctrl || k.meta;
  const lastRow = ext.rows - 1;
  const lastCol = ext.cols - 1;
  const at = cur ?? { row: 0, col: 0 };
  const move = (row: number, col: number): GridCommand => ({
    type: 'move',
    to: { row: clamp(row, 0, lastRow), col: clamp(col, 0, lastCol) },
  });
  if (k.alt) return null;
  // chưa có ô chọn: phím di chuyển đầu tiên chọn ô (0, 0)
  if (!cur && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'j', 'k', 'Home', 'End'].includes(k.key) && !mod)
    return move(0, 0);
  switch (k.key) {
    case 'ArrowUp':
      return move(mod ? 0 : at.row - 1, at.col);
    case 'ArrowDown':
      return move(mod ? lastRow : at.row + 1, at.col);
    case 'ArrowLeft':
      return move(at.row, mod ? 0 : at.col - 1);
    case 'ArrowRight':
      return move(at.row, mod ? lastCol : at.col + 1);
    case 'j':
    case 'J':
      return mod || k.shift ? null : move(at.row + 1, at.col);
    case 'k':
    case 'K':
      return mod || k.shift ? null : move(at.row - 1, at.col);
    case 'Home':
      return mod ? move(0, 0) : move(at.row, 0);
    case 'End':
      return mod ? move(lastRow, lastCol) : move(at.row, lastCol);
    case 'PageDown':
      return move(at.row + Math.max(1, ext.pageRows), at.col);
    case 'PageUp':
      return move(at.row - Math.max(1, ext.pageRows), at.col);
    case 'F2':
      return cur ? { type: 'edit' } : null;
    case 'Enter':
      if (!cur || mod || k.shift) return null;
      return ctx.canOpen ? { type: 'open' } : { type: 'edit' };
    case ' ':
      if (!cur || mod) return null;
      if (k.shift) return { type: 'select-row' };
      return ctx.boolCell ? { type: 'toggle' } : null;
    case 'a':
    case 'A':
      return mod && !k.shift ? { type: 'select-all' } : null;
    case '/':
      return mod ? null : { type: 'focus-query' };
    default:
      return null;
  }
}
