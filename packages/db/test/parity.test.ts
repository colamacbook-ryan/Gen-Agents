// Parity runner TS ↔ Python (BUILD-PLAN §C.4) trong `pnpm test`; `pnpm db:test` chạy cùng hàm sau bộ test Python.
import { describe, expect, it } from 'vitest';
import { compareMasters, runParity } from '../scripts/parity.ts';

describe('parity sqlite_master', () => {
  it('runner TS (0001 + R__triggers + R__views) ≡ DB Python dựng từ SQL đã vendor', () => {
    const r = runParity();
    expect(r.diffs).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.counts.trigger).toEqual({ ts: 402, py: 402 });
    expect(r.counts.view).toEqual({ ts: 29, py: 29 });
  });

  it('bộ so sánh bắt được lệch thứ tự trigger và lệch văn bản (đối chứng âm)', () => {
    const a = [
      { type: 'trigger', name: 't1', tbl_name: 'x', sql: 'CREATE TRIGGER t1 …' },
      { type: 'trigger', name: 't2', tbl_name: 'x', sql: 'CREATE TRIGGER t2 …' },
    ];
    expect(compareMasters(a, [...a].reverse()).ok).toBe(false);
    const b = a.map((r) => ({ ...r }));
    (b[1] as { sql: string }).sql = 'CREATE TRIGGER t2 khác';
    expect(compareMasters(a, b).diffs).toEqual(['trigger t2: văn bản SQL khác']);
    expect(compareMasters(a, a).ok).toBe(true);
  });
});
