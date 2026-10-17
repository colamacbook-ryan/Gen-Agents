// Logger của control plane (DATABASE §9.5 bước 7): mỗi dòng JSON đi qua bộ che bí mật của @ga/security TRƯỚC khi ra khỏi
// tiến trình (`redactValue` trên trường + `redactLogLine` trên dòng cuối). Không console.log (lint no-console-log).
// Interface tối giản để inject (test dùng bản ghi vào bộ nhớ); bản thật ghi stderr. Không phụ thuộc pino (chưa cần).
import { redactLogLine, redactValue } from '@ga/security';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  log(level: LogLevel, event: string, fields?: Readonly<Record<string, unknown>>): void;
}

/** Một dòng log JSON đã che: `{ts, level, event, ...fields}`. */
export function formatLogLine(
  level: LogLevel,
  event: string,
  fields: Readonly<Record<string, unknown>> = {},
  at = new Date(),
): string {
  const safe = redactValue(fields) as Record<string, unknown>;
  return redactLogLine(`${JSON.stringify({ ts: at.toISOString(), level, event, ...safe })}\n`);
}

/** Logger ghi stderr (container: Docker gom stdout/stderr). */
export function createStderrLogger(opts: { minLevel?: LogLevel } = {}): Logger {
  const order: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
  const min = order[opts.minLevel ?? 'info'];
  return {
    log(level, event, fields) {
      if (order[level] < min) return;
      process.stderr.write(formatLogLine(level, event, fields));
    },
  };
}
