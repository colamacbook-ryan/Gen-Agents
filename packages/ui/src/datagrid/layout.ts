// Bố cục hàng ảo của lưới: không nhóm ⇒ hàng ảo i = hàng dữ liệu i. Có nhóm ⇒ mỗi nhóm một hàng tiêu đề + các hàng của nhóm
// (ẩn khi thu gọn). Chỉ cần số hàng mỗi nhóm (GridDataSource.groups) — không tải hết dữ liệu, ảo hoá vẫn đúng với 10k hàng.
import type { CellValue, GridGroup } from './types.ts';

export type LayoutItem = { kind: 'row'; index: number } | { kind: 'group'; group: number };

/** khoá ổn định của một giá trị nhóm (để nhớ nhóm nào đang thu gọn) */
export const groupKey = (v: CellValue): string => JSON.stringify(v);

export class GridLayout {
  readonly count: number;
  readonly groups: readonly GridGroup[] | null;
  #vStart: number[] = [];
  #rStart: number[] = [];
  #open: boolean[] = [];

  constructor(total: number, groups: readonly GridGroup[] | null, collapsed: ReadonlySet<string> = new Set()) {
    this.groups = groups;
    if (!groups) {
      this.count = Math.max(0, total);
      return;
    }
    let v = 0;
    let r = 0;
    for (const g of groups) {
      const open = !collapsed.has(groupKey(g.value));
      this.#vStart.push(v);
      this.#rStart.push(r);
      this.#open.push(open);
      v += 1 + (open ? g.count : 0);
      r += g.count;
    }
    this.count = v;
  }

  /** nhóm chứa hàng ảo v (tìm nhị phân) */
  #groupAtV(v: number): number {
    let lo = 0;
    let hi = this.#vStart.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((this.#vStart[mid] as number) <= v) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  at(v: number): LayoutItem | null {
    if (v < 0 || v >= this.count) return null;
    if (!this.groups) return { kind: 'row', index: v };
    const g = this.#groupAtV(v);
    const off = v - (this.#vStart[g] as number);
    if (off === 0) return { kind: 'group', group: g };
    return { kind: 'row', index: (this.#rStart[g] as number) + off - 1 };
  }

  /** nhóm chứa hàng dữ liệu `index` */
  groupOfRow(index: number): number {
    let lo = 0;
    let hi = this.#rStart.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((this.#rStart[mid] as number) <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** hàng ảo của hàng dữ liệu `index`; null nếu nằm trong nhóm đang thu gọn / ngoài phạm vi */
  vIndexOfRow(index: number): number | null {
    if (index < 0) return null;
    if (!this.groups) return index < this.count ? index : null;
    const g = this.groupOfRow(index);
    const group = this.groups[g];
    const rs = this.#rStart[g] as number;
    if (!group || index >= rs + group.count || !this.#open[g]) return null;
    return (this.#vStart[g] as number) + 1 + (index - rs);
  }

  isOpen(group: number): boolean {
    return this.#open[group] ?? false;
  }

  /**
   * Các dải hàng dữ liệu liền nhau [start, end) ứng với hàng ảo from…to (để tải khối). Tách dải ở chỗ nhảy qua nhóm thu gọn:
   * không bao giờ tải hàng của nhóm đang thu gọn nằm giữa hai nhóm đang mở.
   */
  dataRanges(from: number, to: number): [number, number][] {
    const out: [number, number][] = [];
    for (let v = Math.max(0, from); v <= Math.min(to, this.count - 1); v++) {
      const it = this.at(v);
      if (it?.kind !== 'row') continue;
      const last = out[out.length - 1];
      if (last && last[1] === it.index) last[1] = it.index + 1;
      else out.push([it.index, it.index + 1]);
    }
    return out;
  }
}
