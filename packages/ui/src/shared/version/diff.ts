// Diff thuần (không phụ thuộc gói ngoài): LCS quy hoạch động trên dãy token (dòng hoặc từ).
export type DiffKind = 'equal' | 'add' | 'del';

export interface DiffOp {
  kind: DiffKind;
  text: string;
}

/** Trần số ô của bảng LCS (n × m). Vượt trần ⇒ rơi về diff thô "xoá hết rồi thêm hết" và báo `coarse`. */
export const MAX_DIFF_CELLS = 4_000_000;

export interface DiffResult {
  ops: DiffOp[];
  /** true khi đầu vào quá lớn nên diff chỉ là thay thế toàn bộ */
  coarse: boolean;
}

/** Diff hai dãy token. Giữ nguyên thứ tự; các token trùng nhau nằm trong LCS dài nhất. */
export function diffSeq(a: readonly string[], b: readonly string[]): DiffResult {
  // cắt đầu / đuôi trùng để bảng LCS nhỏ lại (phần lớn phiên bản khác nhau rất ít)
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const am = a.slice(head, a.length - tail);
  const bm = b.slice(head, b.length - tail);

  const ops: DiffOp[] = a.slice(0, head).map((text) => ({ kind: 'equal', text }));
  let coarse = false;

  if (am.length === 0 || bm.length === 0) {
    for (const text of am) ops.push({ kind: 'del', text });
    for (const text of bm) ops.push({ kind: 'add', text });
  } else if (am.length * bm.length > MAX_DIFF_CELLS) {
    coarse = true;
    for (const text of am) ops.push({ kind: 'del', text });
    for (const text of bm) ops.push({ kind: 'add', text });
  } else {
    const n = am.length;
    const m = bm.length;
    const w = m + 1;
    const table = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i * w + j] =
          am[i] === bm[j]
            ? (table[(i + 1) * w + j + 1] as number) + 1
            : Math.max(table[(i + 1) * w + j] as number, table[i * w + j + 1] as number);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (am[i] === bm[j]) {
        ops.push({ kind: 'equal', text: am[i] as string });
        i++;
        j++;
      } else if ((table[(i + 1) * w + j] as number) >= (table[i * w + j + 1] as number)) {
        ops.push({ kind: 'del', text: am[i++] as string });
      } else {
        ops.push({ kind: 'add', text: bm[j++] as string });
      }
    }
    while (i < n) ops.push({ kind: 'del', text: am[i++] as string });
    while (j < m) ops.push({ kind: 'add', text: bm[j++] as string });
  }
  for (const text of a.slice(a.length - tail)) ops.push({ kind: 'equal', text });
  return { ops, coarse };
}

export const splitLines = (s: string): string[] => (s === '' ? [] : s.split('\n'));

/** Từ + khoảng trắng liền nhau là hai token riêng, để ghép lại đúng nguyên văn. */
export const splitWords = (s: string): string[] => s.match(/\s+|\S+/g) ?? [];

/** Diff theo dòng (dạng YAML). */
export const diffLines = (before: string, after: string): DiffResult => diffSeq(splitLines(before), splitLines(after));

/** Diff theo từ (dạng đọc). Nếu quá lớn thì rơi về diff theo dòng để vẫn nhìn được chỗ đổi. */
export function diffWords(before: string, after: string): DiffResult {
  const a = splitWords(before);
  const b = splitWords(after);
  if (a.length * b.length > MAX_DIFF_CELLS) return { ...diffLines(before, after), coarse: true };
  return diffSeq(a, b);
}

/** Gộp các op liên tiếp cùng loại thành một đoạn (ít phần tử DOM hơn). */
export function mergeOps(ops: readonly DiffOp[], joiner = ''): DiffOp[] {
  const out: DiffOp[] = [];
  for (const op of ops) {
    const last = out[out.length - 1];
    if (last && last.kind === op.kind) last.text += joiner + op.text;
    else out.push({ ...op });
  }
  return out;
}

export interface DiffStats {
  added: number;
  removed: number;
}

export function diffStats(ops: readonly DiffOp[]): DiffStats {
  let added = 0;
  let removed = 0;
  for (const op of ops) {
    if (op.kind === 'add') added++;
    else if (op.kind === 'del') removed++;
  }
  return { added, removed };
}
