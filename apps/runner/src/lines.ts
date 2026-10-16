import { StringDecoder } from 'node:string_decoder';
import { RUNNER_CLI_LINE_MAX_CHARS } from '@ga/contracts';
import { MAX_SCAN_CHARS, redactLine } from './redact.ts';

// Tách luồng byte thành dòng, che credential từng dòng rồi mới ghi ra. Dòng vượt trần bị BỎ (không cắt đôi — cắt đôi có thể
// tách một token làm hai nửa lọt qua bộ che).

/** Trần một dòng = min(trần quét của bộ che, trần dòng CLI của giao thức stdout — contracts RUNNER_CLI_LINE_MAX_CHARS). */
export const MAX_LINE_CHARS = Math.min(MAX_SCAN_CHARS, RUNNER_CLI_LINE_MAX_CHARS);
export const DROPPED_LINE_MARKER = '{"$ga":"line_dropped","reason":"too_long"}';

export class RedactingLineWriter {
  private buf = '';
  private dropping = false;
  private readonly decoder = new StringDecoder('utf8');
  private readonly write: (s: string) => void;
  private readonly maxLine: number;

  constructor(write: (s: string) => void, maxLine = MAX_LINE_CHARS) {
    this.write = write;
    this.maxLine = maxLine;
  }

  push(chunk: Buffer | string): void {
    const text = typeof chunk === 'string' ? chunk : this.decoder.write(chunk);
    let start = 0;
    for (;;) {
      const nl = text.indexOf('\n', start);
      if (nl < 0) break;
      this.appendPart(text.slice(start, nl));
      this.flushLine();
      start = nl + 1;
    }
    this.appendPart(text.slice(start));
  }

  end(): void {
    const rest = this.decoder.end();
    if (rest) this.appendPart(rest);
    if (this.buf.length > 0 || this.dropping) this.flushLine();
  }

  private appendPart(part: string): void {
    if (this.dropping || part.length === 0) return;
    if (this.buf.length + part.length > this.maxLine) {
      this.buf = '';
      this.dropping = true;
      return;
    }
    this.buf += part;
  }

  private flushLine(): void {
    if (this.dropping) {
      this.write(`${DROPPED_LINE_MARKER}\n`);
    } else {
      // đoạn thay `[REDACTED:<id>]` có thể DÀI hơn đoạn gốc ⇒ kiểm trần lần nữa SAU khi che (dòng quá trần làm vỡ giao thức stdout)
      const red = redactLine(this.buf);
      this.write(`${red.length > this.maxLine ? DROPPED_LINE_MARKER : red}\n`);
    }
    this.buf = '';
    this.dropping = false;
  }
}
