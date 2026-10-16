// Đường CSP chặt, phần Node (không cần trình duyệt): strictMarkup xoá MỌI style="…" nội tuyến của markup, không để rơi âm thầm.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildCss } from '../src/css.ts';
import { AVATAR_STATES, cast, IDLE_VARIANTS, registerAll, svg, unregister } from '../src/index.ts';
import { K_VALUES, strictMarkup } from '../src/strict.ts';
import { rawSpecs } from './support/pack.ts';

beforeAll(() => {
  registerAll(rawSpecs());
});
afterAll(() => {
  for (const c of cast()) unregister(c.id);
});

describe('strictMarkup(): không còn style="…" nội tuyến', () => {
  it('10 nhân vật × 16 trạng thái (+3 biến thể idle) × 3 cỡ + avatar tròn: 0 style nội tuyến, mọi data-chb-k có luật CSS, mọi biến là --chb-*', () => {
    const css = buildCss();
    let styled = 0;
    const kSeen = new Set<string>();
    for (const c of cast()) {
      for (const s of AVATAR_STATES) {
        for (const v of s === 'idle' ? IDLE_VARIANTS : [undefined]) {
          for (const size of [160, 64, 32]) {
            for (const round of [false, true]) {
              if (round && size !== 64) continue;
              const legacy = svg(c.id, s, { size, variant: v, fixedPhase: true, round });
              styled += (legacy.match(/ style="/g) ?? []).length;
              const out = strictMarkup(legacy);
              expect(out, `${c.id}/${s}/${size}`).not.toMatch(/ style=/);
              for (const m of out.matchAll(/ data-chb-k="([^"]+)"/g)) kSeen.add(m[1] as string);
              for (const m of out.matchAll(/ data-chb-sty="([^"]*)"/g)) {
                expect(m[1]).toMatch(/^(?:--chb-[\w-]+:[^;"<>]+;?)+$/);
              }
            }
          }
        }
      }
    }
    expect(styled).toBeGreaterThan(20_000); // đường cũ thật sự có style nội tuyến (không phải test rỗng)
    expect([...kSeen].sort()).toEqual([...K_VALUES.map(String)].sort());
    for (const k of kSeen) expect(css).toContain(`[data-chb-k="${k}"]{ stroke-width:calc(var(--chb-sw,3.4) * ${k}) }`);
  });

  it('chuyển đổi đúng nghĩa: px → thuộc tính trình bày, calc → data-chb-k, biến → data-chb-sty, overflow / opacity → thuộc tính', () => {
    expect(strictMarkup('<path style="stroke-width:1.5px"/>')).toBe('<path stroke-width="1.5"/>');
    expect(strictMarkup('<path style="stroke-width:calc(var(--chb-sw,3.4) * .8)"/>')).toBe('<path data-chb-k="0.8"/>');
    expect(strictMarkup('<path style="stroke-width:calc(var(--chb-sw,3.4) * 1.15)"/>')).toBe(
      '<path data-chb-k="1.15"/>',
    );
    expect(strictMarkup('<g style="--chb-i:2;--chb-px:-14px"/>')).toBe('<g data-chb-sty="--chb-i:2;--chb-px:-14px"/>');
    expect(strictMarkup('<svg style="overflow:visible"/>')).toBe('<svg overflow="visible"/>');
    expect(strictMarkup('<path style="opacity:0"/>')).toBe('<path opacity="0"/>');
  });

  it.each([
    ['thuộc tính CSS lạ', '<g style="fill:red"/>'],
    ['url() ngoài', '<g style="background:url(http://evil/x)"/>'],
    ['biến không có tiền tố chb-', '<g style="--x:1"/>'],
    ['hệ số nét chưa có luật', '<g style="stroke-width:calc(var(--chb-sw,3.4) * 7)"/>'],
    ['chèn thêm khai báo sau biến', '<g style="--chb-i:1;fill:red"/>'],
    ['dấu nháy trong giá trị biến', '<g style="--chb-i:1&quot;"/>'],
  ])('style lạ bị từ chối (ném lỗi, không rơi âm thầm): %s', (_n, markup) => {
    expect(() => strictMarkup(markup)).toThrow(/Chibi:/);
  });

  it('mã nguồn engine không tự ghép style nội tuyến mới ngoài các mẫu đã biết (quét src/)', () => {
    // mọi ' style="' trong src/ phải nằm trong chuỗi SVG sinh bởi svg() — và đã được kiểm 0 sót ở test trên; ở đây chặn việc đưa style
    // nội tuyến vào đường mount(): mount.ts / runtime.ts / strict.ts không được có `setAttribute('style'` hay `.cssText`.
    const dir = join(import.meta.dirname, '..', 'src');
    for (const f of ['mount.ts', 'runtime.ts', 'strict.ts']) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src, f).not.toMatch(/setAttribute\(\s*['"]style['"]/);
      expect(src, f).not.toMatch(/\.cssText\s*=/);
      // thẻ <style> chỉ được có ở adoptCSS() của runtime.ts (nhánh dự phòng cho trình duyệt không có constructable stylesheet: đúng 2 chỗ)
      const n = (src.match(/createElement\(\s*['"]style['"]\s*\)/g) ?? []).length;
      expect(n, `${f}: số createElement('style')`).toBe(f === 'runtime.ts' ? 2 : 0);
    }
    expect(readdirSync(dir).length).toBeGreaterThan(10);
  });
});
