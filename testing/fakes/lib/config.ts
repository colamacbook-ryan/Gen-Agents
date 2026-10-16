// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
//
// Cấu hình CLI giả qua TỆP, không chỉ qua env. Lý do: ga-runner tự dựng argv + env từ adapter ("bundle chỉ mang ý định"), nên
// biến GA_FAKE_* ở env của exec có thể không tới được CLI. Harness (IT / E2E) ghi một tệp JSON phẳng {"GA_FAKE_X":"giá trị"}; CLI
// giả nạp tệp đầu tiên tìm thấy theo thứ tự:
//   1. $GA_FAKE_CONFIG_FILE            (nếu env tới được)
//   2. /etc/ga-fakes/config.json       (harness ghi bằng `docker exec`; vị trí cố định, không cần env)
//   3. <thư mục gốc fakes>/config.json (cạnh mã CLI giả, vd /opt/ga-fakes/config.json)
// Giá trị trong tệp chỉ là MẶC ĐỊNH: biến đã có ở env thắng. Tệp được đọc lại mỗi lần chạy CLI.
// Chỉ nhận khoá GA_FAKE_* và HTTP(S)_PROXY / NO_PROXY (CLI thật trong container Role đi ra ga-egress qua proxy).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FAKES_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ALLOWED_KEY = /^(?:GA_FAKE_[A-Z0-9_]+|HTTPS?_PROXY|https?_proxy|NO_PROXY|no_proxy)$/;

export function configCandidates(env: NodeJS.ProcessEnv): string[] {
  return [env.GA_FAKE_CONFIG_FILE, '/etc/ga-fakes/config.json', join(FAKES_ROOT, 'config.json')].filter(
    (p): p is string => typeof p === 'string' && p !== '',
  );
}

/** env hiệu lực của CLI giả = tệp cấu hình (mặc định) + env thật (thắng). Tệp hỏng / sai kiểu / khoá lạ ⇒ ném lỗi (không nuốt). */
export function fakeEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const path = configCandidates(base).find((p) => existsSync(p));
  if (!path) return base;
  const j: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof j !== 'object' || j === null || Array.isArray(j)) throw new Error(`${path}: phải là object phẳng`);
  const fromFile: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(j)) {
    if (!ALLOWED_KEY.test(k)) throw new Error(`${path}: khoá không được phép: ${k}`);
    if (typeof v !== 'string') throw new Error(`${path}: giá trị của ${k} phải là chuỗi`);
    fromFile[k] = v;
  }
  return { ...fromFile, ...base };
}

/** Như fakeEnv nhưng cấu hình hỏng ⇒ thoát 70 với thông báo rõ (CLI giả không được chạy với cấu hình test sai). */
export function fakeEnvOrExit(who: string): NodeJS.ProcessEnv {
  try {
    return fakeEnv();
  } catch (e) {
    process.stderr.write(`${who}: lỗi cấu hình: ${(e as Error).message}\n`);
    process.exit(70);
  }
}
