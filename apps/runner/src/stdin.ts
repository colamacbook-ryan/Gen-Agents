import type { Readable } from 'node:stream';
import { RunnerError } from './paths.ts';

/**
 * Đọc MỘT dòng từ stdin (tới '\n' hoặc EOF), trần `maxBytes`, hết giờ `timeoutMs`; rồi huỷ stdin (BUILD-PLAN §B.5 bước 4:
 * "đọc vé từ stdin rồi đóng stdin"). Không phụ thuộc EOF: supervisor không cần half-close kết nối exec.
 */
export function readFirstLine(stdin: Readable, maxBytes: number, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const done = (err: Error | null, line?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stdin.removeAllListeners('data');
      stdin.removeAllListeners('end');
      stdin.removeAllListeners('error');
      stdin.destroy();
      if (err) reject(err);
      else resolve(line as string);
    };
    const timer = setTimeout(() => done(new RunnerError('stdin_timeout', 'hết giờ chờ dữ liệu trên stdin')), timeoutMs);
    stdin.on('data', (c: Buffer) => {
      const nl = c.indexOf(10);
      const part = nl >= 0 ? c.subarray(0, nl) : c;
      size += part.length;
      if (size > maxBytes) return done(new RunnerError('stdin_too_large', 'dữ liệu stdin quá lớn'));
      chunks.push(part);
      if (nl >= 0) done(null, Buffer.concat(chunks).toString('utf8').replace(/\r$/, ''));
    });
    stdin.on('end', () => done(null, Buffer.concat(chunks).toString('utf8').replace(/\r$/, '')));
    stdin.on('error', () => done(new RunnerError('stdin_error', 'lỗi đọc stdin')));
  });
}
