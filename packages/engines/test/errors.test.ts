import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TURN_OUTCOMES } from '@ga/contracts';
import { describe, expect, it } from 'vitest';
import { ADAPTERS, cases, text } from './helpers.ts';

// "Ánh xạ lỗi đủ lý do" (DoD L-ENG): mỗi adapter có luật cho MỌI kết quả lượt của contracts (ok, cần đăng nhập, hết hạn
// đăng nhập, sự cố hãng, hết quota, bị khoá, lỗi tạm); mỗi luật có ít nhất một ca chạm đúng nó; luật chưa kiểm có ID trong
// ASSUMPTIONS.md (không có luật "ngầm").

const assumptionsDoc = readFileSync(join(import.meta.dirname, '..', 'ASSUMPTIONS.md'), 'utf8');

for (const adapter of ADAPTERS) {
  const c = cases(adapter.slug);
  describe(`bảng lỗi ${adapter.slug}`, () => {
    it('đủ lý do: mọi TurnOutcome có ít nhất một luật', () => {
      const covered = new Set(adapter.errorRules.map((r) => r.outcome));
      for (const o of TURN_OUTCOMES) expect(covered.has(o), o).toBe(true);
    });

    it('ID luật duy nhất, có nguồn; luật cuối là dự phòng transient', () => {
      const ids = adapter.errorRules.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const r of adapter.errorRules) expect(r.source.length, r.id).toBeGreaterThan(10);
      expect(adapter.errorRules.at(-1)?.outcome).toBe('transient');
    });

    it('mỗi luật có ít nhất một ca trong fixture chạm đúng nó (không luật chết)', () => {
      const hit = new Set<string>();
      for (const k of c.classify) {
        hit.add(
          adapter.classifyDetailed(
            k.exit,
            text(adapter.slug, k.stdout, k.stdoutFile),
            text(adapter.slug, k.stderr, k.stderrFile),
          ).ruleId,
        );
      }
      for (const r of adapter.errorRules) expect(hit.has(r.id), r.id).toBe(true);
    });

    it('luật chưa kiểm (partial / assumed) đều có ID trong ASSUMPTIONS.md', () => {
      for (const r of adapter.errorRules) {
        if (r.evidence === 'observed') continue;
        expect(assumptionsDoc.includes(`| ${r.id} |`), r.id).toBe(true);
      }
    });

    it('chỉ luật dựa trên output thật mới được đánh "observed"; luật "assumed" ghi rõ chưa kiểm hoặc là dự phòng', () => {
      for (const r of adapter.errorRules) {
        if (r.evidence === 'assumed') expect(/chưa kiểm|dự phòng/.test(r.source), r.id).toBe(true);
      }
    });

    it('lỗi tạm / lạ không bị đẩy thành sự cố hãng (không fallback / O4 oan): mã thoát lạ ⇒ transient', () => {
      for (const exitCode of [1, 4, 42, 127, 255]) {
        expect(adapter.classify({ exitCode, signal: null, timedOut: false }, '', '').outcome).toBe('transient');
      }
      expect(adapter.classify({ exitCode: 0, signal: null, timedOut: false }, '', '').outcome).toBe('transient');
    });
  });
}
