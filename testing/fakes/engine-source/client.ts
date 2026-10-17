// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
//
// Máy khách THAM CHIẾU cho engine-source: làm đúng các bước của trình cài chính thức (manifest → tải có % → kiểm sha512 → cài vào
// <destDir>/<slug>/<version>/bin/<bin>) và phân loại lỗi về `EngineInstallStatus` của contracts. Dùng để test engine-source và làm mẫu
// cho `ga-engine-install` nguồn `fake` của L-RT (L-RT tự cài đặt phần của mình; đây chỉ là chuẩn so sánh).
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type InstallFailureReason = 'domain_blocked' | 'unsupported_arch' | 'network' | 'checksum_mismatch' | 'unknown';

export type InstallOutcome =
  | { state: 'installed'; version: string; path: string }
  | { state: 'failed'; reason: InstallFailureReason; detail: string };

export const platformFor = (platform = process.platform, arch = process.arch): string =>
  `${platform}_${arch === 'x64' ? 'amd64' : arch}`;

export interface InstallOptions {
  baseUrl: string;
  slug: string;
  destDir: string;
  platform?: string;
  /** Gọi mỗi khi % đổi (0–100); null nếu thiếu Content-Length. */
  onProgress?: (pct: number | null) => void;
}

const fail = (reason: InstallFailureReason, detail: string): InstallOutcome => ({
  state: 'failed',
  reason,
  detail: detail.slice(0, 500),
});

function classifyStatus(status: number, headers: Headers, what: 'manifest' | 'download'): InstallOutcome {
  if (status === 403 && headers.get('x-ga-egress') === 'blocked')
    return fail('domain_blocked', `HTTP 403: domain bị egress chặn (${what})`);
  if (status === 404 && what === 'manifest')
    return fail('unsupported_arch', 'HTTP 404: không có manifest cho nền tảng này');
  return fail('unknown', `HTTP ${status} (${what})`);
}

export async function installEngine(o: InstallOptions): Promise<InstallOutcome> {
  const platform = o.platform ?? platformFor();
  let manifest: { version?: unknown; url?: unknown; sha512?: unknown };
  try {
    const r = await fetch(`${o.baseUrl}/${o.slug}/manifests/${platform}.json`);
    if (!r.ok) return classifyStatus(r.status, r.headers, 'manifest');
    manifest = (await r.json()) as typeof manifest;
  } catch (e) {
    return fail('network', `không lấy được manifest: ${(e as Error).message}`);
  }
  if (typeof manifest.version !== 'string' || typeof manifest.url !== 'string' || typeof manifest.sha512 !== 'string') {
    return fail('unknown', 'manifest sai định dạng');
  }
  const bin = new URL(manifest.url).pathname.split('/').pop() as string;
  const chunks: Uint8Array[] = [];
  try {
    const r = await fetch(manifest.url);
    if (!r.ok || !r.body) return classifyStatus(r.status, r.headers, 'download');
    const total = Number(r.headers.get('content-length')) || null;
    let got = 0;
    let last = -1;
    for await (const c of r.body) {
      chunks.push(c);
      got += c.length;
      const pct = total ? Math.floor((got / total) * 100) : null;
      if (pct !== last) {
        last = pct as number;
        o.onProgress?.(pct);
      }
    }
    if (total && got !== total) return fail('network', `tải thiếu: ${got}/${total} byte`);
  } catch (e) {
    return fail('network', `tải đứt giữa chừng: ${(e as Error).message}`);
  }
  const buf = Buffer.concat(chunks);
  if (createHash('sha512').update(buf).digest('hex') !== manifest.sha512)
    return fail('checksum_mismatch', 'sha512 không khớp manifest');
  const dest = join(o.destDir, o.slug, manifest.version, 'bin', bin);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(`${dest}.part`, buf);
  chmodSync(`${dest}.part`, 0o755);
  renameSync(`${dest}.part`, dest);
  return { state: 'installed', version: manifest.version, path: dest };
}
