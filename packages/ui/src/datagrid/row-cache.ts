// Bộ đệm hàng theo khối cho lưới ảo hoá: chỉ tải khối đang thấy (+ biên), huỷ yêu cầu cũ khi đổi truy vấn,
// bỏ phản hồi trễ của truy vấn cũ (số thế hệ), giới hạn số khối giữ trong bộ nhớ (bỏ khối dùng lâu nhất).
// Không phụ thuộc React: lưới đọc qua subscribe + version (useSyncExternalStore).
import type { GridDataSource, GridQuery, GridRange } from './types.ts';

export interface RowCacheOptions<R> {
  /** số hàng mỗi khối (≤ trang lưới 500 của API) */
  blockSize?: number;
  /** số khối tối đa giữ trong bộ nhớ */
  maxBlocks?: number;
  /** kiểm từng hàng khi nạp: trả lý do nếu hàng sai (vd display_id không thuộc bảng) ⇒ cả khối thành lỗi (fail-closed) */
  validate?: (row: R) => string | null;
}

/** nguồn trả hàng không hợp lệ (vd display_id sai bảng) */
export class GridRowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GridRowError';
  }
}

interface Block<R> {
  status: 'loading' | 'ready' | 'error';
  rows: readonly R[];
  ctrl: AbortController | null;
  used: number;
}

export class RowCache<R> {
  readonly blockSize: number;
  readonly maxBlocks: number;
  #source: GridDataSource<R>;
  #getId: (row: R) => string;
  #query: GridQuery;
  #gen = 0;
  #tick = 0;
  #blocks = new Map<number, Block<R>>();
  #total: number | null = null;
  #aggregates: Readonly<Record<string, number>> = {};
  #error: unknown = null;
  #listeners = new Set<() => void>();
  #version = 0;
  #validate: ((row: R) => string | null) | undefined;

  constructor(source: GridDataSource<R>, getId: (row: R) => string, query: GridQuery, opts: RowCacheOptions<R> = {}) {
    this.blockSize = opts.blockSize ?? 100;
    this.maxBlocks = opts.maxBlocks ?? 300;
    this.#validate = opts.validate;
    if (!(this.blockSize > 0 && this.blockSize <= 500)) throw new RangeError('blockSize phải trong 1…500');
    this.#source = source;
    this.#getId = getId;
    this.#query = query;
  }

  get version(): number {
    return this.#version;
  }
  get query(): GridQuery {
    return this.#query;
  }
  /** null = chưa biết (khối đầu chưa về) */
  get total(): number | null {
    return this.#total;
  }
  get aggregates(): Readonly<Record<string, number>> {
    return this.#aggregates;
  }
  /** lỗi của lần tải gần nhất (null = không lỗi) */
  get error(): unknown {
    return this.#error;
  }
  /** đang có khối nào đang tải */
  get loading(): boolean {
    for (const b of this.#blocks.values()) if (b.status === 'loading') return true;
    return false;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  };
  getVersion = (): number => this.#version;

  #emit(): void {
    this.#version++;
    for (const fn of [...this.#listeners]) fn();
  }

  /** đổi truy vấn: huỷ mọi yêu cầu đang chạy, xoá bộ đệm, tải lại từ đầu */
  setQuery(query: GridQuery): void {
    this.#query = query;
    this.#reset(true);
  }

  /** tải lại cùng truy vấn (giữ tổng cũ tới khi có số mới để thanh cuộn không nhảy) */
  refresh(): void {
    this.#reset(false);
  }

  #reset(clearTotal: boolean): void {
    this.#gen++;
    for (const b of this.#blocks.values()) b.ctrl?.abort();
    this.#blocks.clear();
    if (clearTotal) {
      this.#total = null;
      this.#aggregates = {};
    }
    this.#error = null;
    this.#emit();
    this.ensure(0, 1);
  }

  /** nút "Thử lại": bỏ các khối lỗi rồi tải lại chúng */
  retry(): void {
    const failed = [...this.#blocks.entries()].filter(([, b]) => b.status === 'error').map(([k]) => k);
    if (failed.length === 0) {
      this.refresh();
      return;
    }
    for (const k of failed) this.#blocks.delete(k);
    this.#error = null;
    for (const k of failed) this.#load(k);
    this.#emit();
  }

  /** huỷ mọi yêu cầu đang chạy và xoá bộ đệm (unmount). Dùng lại được: ensure() sau đó tải lại (StrictMode gắn lại effect). */
  abortAll(): void {
    this.#gen++;
    for (const b of this.#blocks.values()) b.ctrl?.abort();
    this.#blocks.clear();
  }

  /** hàng ở chỉ số `index` nếu đã tải */
  row(index: number): R | undefined {
    const b = this.#blocks.get(Math.floor(index / this.blockSize));
    if (b?.status !== 'ready') return undefined;
    b.used = ++this.#tick;
    return b.rows[index % this.blockSize];
  }

  /** chỉ số của display_id trong các khối đã tải (không gọi nguồn) */
  indexOfId(id: string): number | undefined {
    for (const [k, b] of this.#blocks) {
      if (b.status !== 'ready') continue;
      const i = b.rows.findIndex((r) => this.#getId(r) === id);
      if (i >= 0) return k * this.blockSize + i;
    }
    return undefined;
  }

  /** bảo đảm các khối phủ [start, end) đã / đang tải */
  ensure(start: number, end: number): void {
    const last = this.#total === null ? start : Math.min(end, this.#total);
    const from = Math.floor(Math.max(0, start) / this.blockSize);
    const to = Math.floor(Math.max(0, last - 1) / this.blockSize);
    for (let k = from; k <= Math.max(from, to); k++) {
      if (this.#total !== null && k * this.blockSize >= this.#total && k > 0) break;
      const b = this.#blocks.get(k);
      if (b) {
        b.used = ++this.#tick;
        continue;
      }
      this.#load(k);
    }
    this.#evict(from, to);
  }

  #load(k: number): void {
    const gen = this.#gen;
    const ctrl = new AbortController();
    const block: Block<R> = { status: 'loading', rows: [], ctrl, used: ++this.#tick };
    this.#blocks.set(k, block);
    const start = k * this.blockSize;
    this.#source
      .fetchRange({ query: this.#query, start, limit: this.blockSize, signal: ctrl.signal })
      .then((res: GridRange<R>) => {
        if (gen !== this.#gen || this.#blocks.get(k) !== block) return; // phản hồi của truy vấn cũ / khối đã bỏ
        if (this.#validate) {
          for (const row of res.rows) {
            const why = this.#validate(row);
            if (why !== null) throw new GridRowError(why);
          }
        }
        block.status = 'ready';
        block.rows = res.rows;
        block.ctrl = null;
        this.#total = res.total;
        if (res.aggregates) this.#aggregates = res.aggregates;
        this.#error = null;
        this.#emit();
      })
      .catch((err: unknown) => {
        if (gen !== this.#gen || this.#blocks.get(k) !== block) return;
        if (ctrl.signal.aborted) return;
        // giữ khối ở trạng thái lỗi: ensure() KHÔNG tự tải lại (không vòng lặp gọi lỗi); retry() mới tải lại
        block.status = 'error';
        block.ctrl = null;
        this.#error = err;
        this.#emit();
      });
  }

  #evict(from: number, to: number): void {
    if (this.#blocks.size <= this.maxBlocks) return;
    const victims = [...this.#blocks.entries()]
      .filter(([k]) => k < from || k > to)
      .sort((a, b) => a[1].used - b[1].used);
    for (const [k, b] of victims) {
      if (this.#blocks.size <= this.maxBlocks) break;
      b.ctrl?.abort();
      this.#blocks.delete(k);
    }
  }

  /** thay một hàng đã tải (sau khi sửa ô) — tìm theo display_id */
  replace(row: R): boolean {
    const id = this.#getId(row);
    for (const b of this.#blocks.values()) {
      if (b.status !== 'ready') continue;
      const i = b.rows.findIndex((r) => this.#getId(r) === id);
      if (i >= 0) {
        const next = b.rows.slice();
        next[i] = row;
        b.rows = next;
        this.#emit();
        return true;
      }
    }
    return false;
  }

  /** số khối đang giữ (test) */
  get blockCount(): number {
    return this.#blocks.size;
  }
}
