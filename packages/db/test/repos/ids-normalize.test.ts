// ids (ULID, display_id theo id_counters, prefix ↔ bảng) + foldVi (chuẩn hoá tiếng Việt giữ độ dài, chặn kích thước).
import { ENTITY_TYPES, ULID_RE } from '@ga/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TABLES } from '../../src/generated/schema.ts';
import {
  allocateDisplayId,
  counterWorkspace,
  displaySeqFor,
  newUlid,
  prefixOf,
  sequentialIds,
} from '../../src/ids/index.ts';
import { createFixture, type Fixture, ManualClock } from '../../src/repos/fixture/index.ts';
import { FOLD_MAX_CHARS, foldVi } from '../../src/search/normalize.ts';

describe('ULID + bộ sinh', () => {
  it('ULID đúng hình dạng, phần thời gian theo đồng hồ, ngẫu nhiên khác nhau', () => {
    const clock = new ManualClock('2026-10-17T08:00:00.000Z');
    const a = newUlid(clock);
    const b = newUlid(clock);
    expect(ULID_RE.test(a)).toBe(true);
    expect(a.slice(0, 10)).toBe(b.slice(0, 10));
    expect(a).not.toBe(b);
    expect(newUlid(new ManualClock('1970-01-01T00:00:00.000Z'), () => new Uint8Array(10))).toBe('0'.repeat(26));
    expect(() => newUlid(clock, () => new Uint8Array(9))).toThrow(RangeError);
    const seq = sequentialIds('ABC');
    const ids = [seq(), seq(), seq()];
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(ULID_RE.test(id)).toBe(true);
    expect(() => sequentialIds('ILU')).toThrow(RangeError);
  });

  it('prefix ↔ bảng: mọi bảng của ENTITY_TYPES tồn tại; US đếm ở workspace hệ thống', () => {
    for (const [prefix, table] of Object.entries(ENTITY_TYPES)) {
      expect(TABLES as readonly string[], prefix).toContain(table);
      expect(prefixOf(table)).toBe(prefix);
    }
    expect(prefixOf('workspace_members')).toBeNull();
    expect(counterWorkspace('US', '01JTN0000000000000000000W1')).toBe('00000000000000000000000000');
    expect(displaySeqFor('roles', 'RL-0012')).toBe(12);
    expect(displaySeqFor('roles', 'TK-0012')).toBeNull();
    expect(displaySeqFor('roles', 'RL-12')).toBeNull();
  });
});

describe('allocateDisplayId (id_counters trong giao dịch)', () => {
  let f: Fixture;
  beforeEach(() => {
    f = createFixture({ coreAgentReady: false });
  });
  afterEach(() => f.close());

  it('tăng liền nhau; rollback không để lỗ', () => {
    const take = () => f.writer.write(f.systemActorId, (w) => allocateDisplayId(w, f.workspaceId, 'TK'));
    expect(take()).toEqual({ displaySeq: 1, displayId: 'TK-0001' });
    expect(() =>
      f.writer.write(f.systemActorId, (w) => {
        allocateDisplayId(w, f.workspaceId, 'TK');
        throw new Error('rollback');
      }),
    ).toThrow('rollback');
    expect(take()).toEqual({ displaySeq: 2, displayId: 'TK-0002' });
    // AU đệm 5 chữ số
    const au = f.writer.write(f.systemActorId, (w) => allocateDisplayId(w, f.workspaceId, 'AU'));
    expect(au.displayId).toMatch(/^AU-\d{5}$/);
  });

  it('ngoài giao dịch ghi của chính nó ⇒ từ chối (dml kiểm lúc chạy)', () => {
    let leaked: Parameters<typeof allocateDisplayId>[0] | null = null;
    f.writer.write(f.systemActorId, (w) => {
      leaked = w;
    });
    expect(() => allocateDisplayId(leaked as never, f.workspaceId, 'TK')).toThrow(/ngoài giao dịch/);
  });
});

describe('foldVi', () => {
  it('bỏ dấu, đ→d, chữ thường, giữ độ dài bản NFC', () => {
    expect(foldVi('Đặng Thị Hoà')).toBe('dang thi hoa');
    expect(foldVi('TRƯỜNG ĐẠI HỌC')).toBe('truong dai hoc');
    expect(foldVi('Nguyễn Văn Bảo')).toBe('nguyen van bao');
    // dạng tách (NFD) gộp về NFC trước ⇒ cùng kết quả
    const nfd = 'Hoà'.normalize('NFD');
    expect(foldVi(nfd)).toBe('hoa');
    for (const s of ['Mai Lan', 'Phở bò tái', 'ăn ơi ư', '🙂 emoji', 'Ωmega']) {
      expect(foldVi(s).length).toBe(s.normalize('NFC').length);
    }
  });

  it('chặn kích thước trước khi chuẩn hoá; tuyến tính (1 MiB / 256 KiB < 8)', () => {
    expect(() => foldVi('a'.repeat(FOLD_MAX_CHARS + 1))).toThrow(RangeError);
    const time = (n: number) => {
      const s = 'Đặng Thị Hoà '.repeat(Math.ceil(n / 13)).slice(0, n);
      const runs: number[] = [];
      foldVi(s); // làm nóng JIT trước khi đo
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        foldVi(s);
        runs.push(performance.now() - t0);
      }
      return runs.sort((a, b) => a - b)[1] as number;
    };
    const small = time(256 * 1024);
    const big = time(1024 * 1024);
    expect(big / Math.max(small, 0.01)).toBeLessThan(8);
    expect(big).toBeLessThan(2000);
  });
});
