import { describe, expect, it } from 'vitest';
import { helpChoices, helpSubcommands, parseHelpFlags, parseVersionToken } from '../src/capabilities.ts';
import { maskAccountHint } from '../src/index.ts';
import { ADAPTERS, probeInput } from './helpers.ts';

// Parser / bộ quét nhận dữ liệu từ ngoài (stdout / stderr CLI): chặn kích thước trước khi quét, chạy tuyến tính, có số đo
// với đầu vào ≥ 1 MB và đầu vào bệnh lý (STD-11 1.13; L-20261016-30). Trần thời gian rộng để không chập chờn trên CI.

const MB = 1024 * 1024;

function timed(fn: () => unknown): number {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

describe('hiệu năng parser / phân loại / probe trên đầu vào lớn và bệnh lý', () => {
  for (const adapter of ADAPTERS) {
    it(`${adapter.slug}: dòng stream 1 MB hợp lệ, dòng > trần, dòng bệnh lý`, () => {
      const delta = JSON.stringify({ type: 'delta', text: 'a'.repeat(MB - 64) });
      const ms1 = timed(() => adapter.parseStreamLineAll(delta));
      const ms2 = timed(() => expect(adapter.parseStreamLineAll(`{"x":"${'a'.repeat(2 * MB)}"}`)).toEqual([]));
      const ms3 = timed(() => adapter.parseStreamLineAll(`{${'"a":{'.repeat(50_000)}`));
      const ms4 = timed(() => adapter.parseStreamLineAll('['.repeat(MB)));
      for (const ms of [ms1, ms2, ms3, ms4]) expect(ms).toBeLessThan(1500);
    });
    it(`${adapter.slug}: classify với stdout 8 MB + stderr 2 MB (chỉ đọc phần đuôi có trần)`, () => {
      const line = `${JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta' }, status: 'x' })}\n`;
      const stdout = line.repeat(Math.ceil((8 * MB) / line.length));
      const stderr = 'error: '.repeat(Math.ceil((2 * MB) / 7));
      const ms = timed(() => adapter.classify({ exitCode: 1, signal: null, timedOut: false }, stdout, stderr));
      expect(ms).toBeLessThan(3000);
      const ms2 = timed(() => adapter.classify({ exitCode: 1, signal: null, timedOut: false }, '{'.repeat(8 * MB), ''));
      expect(ms2).toBeLessThan(3000);
    });
    it(`${adapter.slug}: parse kết quả quét với --help 1 MB bệnh lý`, () => {
      const outcome = (stdout: string) => ({
        kind: 'cli' as const,
        exitCode: 0,
        signal: null,
        stdout,
        stderr: '',
        timedOut: false,
        durationMs: 1,
      });
      const evil = [
        `  --effort ${'('.repeat(MB)}`,
        `  --effort (${'a|'.repeat(MB / 2)})`,
        `  ${'-a, '.repeat(MB / 4)}`,
        `Commands:\n${'  x|'.repeat(MB / 4)}`,
      ];
      for (const help of evil) {
        const ms = timed(() =>
          adapter.parseCapabilitiesFor([outcome('1.0.0'), outcome(help), outcome(help), outcome(help)], {
            authMode: 'oauth',
          }),
        );
        expect(ms, help.slice(0, 20)).toBeLessThan(3000);
      }
      expect(adapter.capabilityScan({ authMode: 'oauth', ...probeInput() }).length).toBeGreaterThan(2);
    });
  }

  it('bộ parse --help dùng chung tuyến tính với 1 MB', () => {
    const big = `  --effort  x (${'a, '.repeat(MB / 3)}b)\n${'  --f-x  y\n'.repeat(MB / 11)}`;
    for (const fn of [
      () => parseHelpFlags(big),
      () => helpChoices(big, '--effort'),
      () => helpSubcommands(`Commands:\n${'  sub-a  x\n'.repeat(MB / 10)}`, 'Commands:'),
      () => parseVersionToken(`${'1.'.repeat(MB / 2)}x`),
    ]) {
      expect(timed(fn)).toBeLessThan(2000);
    }
  });

  it('che account_hint: chuỗi 1 MB / bệnh lý ⇒ null nhanh', () => {
    for (const s of ['a'.repeat(MB), `${'a'.repeat(MB)}@x.io`, '@'.repeat(MB), `a@${'.'.repeat(MB)}`]) {
      const t = timed(() => expect(maskAccountHint(s)).toBeNull());
      expect(t).toBeLessThan(200);
    }
  });
});
