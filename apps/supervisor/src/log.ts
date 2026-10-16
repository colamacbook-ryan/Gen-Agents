// Log của supervisor: JSON một dòng ra stderr, CHỈ METADATA (DATABASE §9.5 bước 3, 7): không bao giờ payload PTY, stdin,
// vé, env, argv đăng nhập hay output exec. Khoá có tên nhạy cảm bị bỏ; chuỗi bị cắt 200 ký tự.
// TODO(L-SEC): thay bằng pino + bộ che dùng chung @ga/security khi lane đó push (BUILD-PLAN §A.1 Log).

const DROP_KEY = /ticket|token|secret|key|password|argv|env|stdin|stdout|stderr|data|payload|bundle|cookie/i;

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, string | number | boolean | null | undefined>;

export interface Logger {
  log(level: LogLevel, event: string, fields?: LogFields): void;
}

export function sanitizeFields(fields: LogFields): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || DROP_KEY.test(k)) continue;
    out[k] = typeof v === 'string' ? v.slice(0, 200) : v;
  }
  return out;
}

export function stderrLogger(service: string, write: (s: string) => void = (s) => process.stderr.write(s)): Logger {
  return {
    log(level, event, fields = {}) {
      write(
        `${JSON.stringify({ ts: new Date().toISOString(), level, svc: service, event, ...sanitizeFields(fields) })}\n`,
      );
    },
  };
}

export const silentLogger: Logger = { log() {} };
