import {
  chmodSync,
  closeSync,
  constants,
  fsyncSync,
  openSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';
import type { EngineInstallStatus } from '@ga/contracts';
import { lstatOrNull, mkdirInside, writeFileAtomic } from '../fsutil.ts';
import { isCliBinName, isEngineSlug, RunnerError, type RunnerRoots } from '../paths.ts';
import { FetchError, fetchVia, newHash } from './fetch.ts';
import type { InstallPlatform, InstallRecipe } from './recipe.ts';
import { extractMember } from './tar.ts';

// ga-engine-install (BUILD-PLAN §A.2-5, §B.7; CNS-137): tải CLI của hãng từ nguồn chính chủ vào volume ga-engines, có %.
//   /opt/engines/<slug>/<version>/<bin>       bản đã cài (0755)
//   /opt/engines/<slug>/current → <version>    bản hiện hành (symlink tương đối, thay nguyên tử) — ga-runner chỉ chạy binary ở đây
//   /opt/engines/<slug>/status.json           trạng thái cài gần nhất (đọc bởi `ga-engine-install status`)
// Image KHÔNG chứa CLI của hãng. Chạy trong container cài riêng do supervisor dựng: ga-engines mount RW chỉ ở container này;
// container Role / hệ thống mount CHỈ ĐỌC. Mọi lần tải đi qua ga-egress. Công thức cài (URL, trường manifest, checksum) là DỮ
// LIỆU của adapter (@ga/engines, bảng đóng) — không nhận URL tự do từ ngoài.
// Mỗi dòng stdout là một EngineInstallStatus (contracts) JSON: installing (+%) … rồi installed | failed (+ lý do).

export type FailureReason = 'domain_blocked' | 'unsupported_arch' | 'network' | 'checksum_mismatch' | 'unknown';

const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const HEX128 = /^[0-9a-f]{128}$/;

export const INSTALL_LIMITS = {
  manifestBytes: 256 * 1024,
  binaryBytes: 1024 * 1024 * 1024,
  manifestTimeoutMs: 30_000,
  binaryTimeoutMs: 900_000,
  staleLockMs: 30 * 60_000,
} as const;

export class InstallFailure extends Error {
  readonly reason: FailureReason;
  constructor(reason: FailureReason, detail: string) {
    super(detail);
    this.name = 'InstallFailure';
    this.reason = reason;
  }
}

/** libc của tiến trình hiện tại: glibcVersionRuntime chỉ có khi chạy trên glibc. */
export function currentLibc(): 'glibc' | 'musl' {
  const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined;
  return report?.header?.glibcVersionRuntime ? 'glibc' : 'musl';
}

export function pickPlatform(
  recipe: InstallRecipe,
  arch: string = process.arch,
  libc: 'glibc' | 'musl' = currentLibc(),
  platform: string = process.platform,
): InstallPlatform {
  if (platform !== 'linux') throw new InstallFailure('unsupported_arch', `hệ điều hành không hỗ trợ: ${platform}`);
  const p = recipe.platforms.find((x) => x.arch === arch && x.libc === libc);
  if (!p) throw new InstallFailure('unsupported_arch', `nguồn chính chủ không có bản cho ${arch}/${libc}`);
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(p.key)) throw new InstallFailure('unknown', 'khoá nền tảng sai dạng');
  return p;
}

function fill(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(v);
  return out;
}

export interface ResolvedArtifact {
  version: string;
  url: string;
  algorithm: 'sha256' | 'sha512';
  checksum: string;
}

function checksumOf(raw: unknown): { algorithm: 'sha256' | 'sha512'; checksum: string } {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (HEX128.test(s)) return { algorithm: 'sha512', checksum: s };
  if (HEX64.test(s)) return { algorithm: 'sha256', checksum: s };
  // không có checksum hợp lệ ⇒ không cài (fail-closed)
  throw new InstallFailure('checksum_mismatch', 'manifest không có checksum hợp lệ');
}

function version(raw: unknown): string {
  if (typeof raw !== 'string' || !VERSION_RE.test(raw.trim())) throw new InstallFailure('unknown', 'version sai dạng');
  return raw.trim();
}

function parseJson(text: string): Record<string, unknown> {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    throw new InstallFailure('unknown', 'manifest không phải JSON');
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new InstallFailure('unknown', 'manifest sai dạng');
  return v as Record<string, unknown>;
}

function failureFromFetch(e: unknown, notFound: FailureReason): InstallFailure {
  if (e instanceof InstallFailure) return e;
  if (e instanceof FetchError) {
    if (e.kind === 'domain_blocked') return new InstallFailure('domain_blocked', e.message);
    if (e.kind === 'network') return new InstallFailure('network', e.message);
    if (e.kind === 'http_status' && e.status === 404)
      return new InstallFailure(notFound, `nguồn trả 404 (${e.message})`);
    return new InstallFailure('unknown', e.message);
  }
  return new InstallFailure('unknown', 'lỗi không phân loại');
}

export interface InstallRequest {
  slug: string;
  recipe: InstallRecipe;
  /** Nguồn official: mọi bước https. */
  httpsOnly: boolean;
  proxy: URL | null;
}

export interface InstallDeps {
  emit(status: EngineInstallStatus): void;
  now(): Date;
  platform?: InstallPlatform;
}

async function getText(url: string, req: InstallRequest, notFound: FailureReason): Promise<string> {
  const chunks: Buffer[] = [];
  try {
    await fetchVia(url, {
      proxy: req.proxy,
      timeoutMs: INSTALL_LIMITS.manifestTimeoutMs,
      maxBytes: INSTALL_LIMITS.manifestBytes,
      httpsOnly: req.httpsOnly,
      onChunk: (c) => chunks.push(c),
    });
  } catch (e) {
    throw failureFromFetch(e, notFound);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Đọc manifest theo công thức ⇒ phiên bản + URL tải + checksum. */
export async function resolveArtifact(req: InstallRequest, platform: InstallPlatform): Promise<ResolvedArtifact> {
  const m = req.recipe.manifest;
  if (m.kind === 'per-platform') {
    const url = fill(m.urlTemplate, { platform: platform.key });
    const doc = parseJson(await getText(url, req, 'unsupported_arch'));
    const v = version(doc[m.fields.version]);
    const raw = doc[m.fields.url];
    if (typeof raw !== 'string' || raw.length > 2048)
      throw new InstallFailure('unknown', 'url trong manifest sai dạng');
    return { version: v, url: new URL(raw, url).toString(), ...checksumOf(doc[m.fields.checksum]) };
  }
  const v = version((await getText(m.latestUrl, req, 'unknown')).slice(0, 128));
  const manifestUrl = fill(m.urlTemplate, { version: v });
  let node: unknown = parseJson(await getText(manifestUrl, req, 'unknown'));
  for (const seg of m.checksumPath) {
    const key = fill(seg, { platform: platform.key });
    if (typeof node !== 'object' || node === null || !Object.hasOwn(node, key)) {
      throw new InstallFailure(
        seg.includes('{platform}') ? 'unsupported_arch' : 'unknown',
        'manifest không có mục cho nền tảng',
      );
    }
    node = (node as Record<string, unknown>)[key];
  }
  return { version: v, url: fill(m.binaryUrlTemplate, { version: v, platform: platform.key }), ...checksumOf(node) };
}

interface StatusFile {
  state: 'installing' | 'installed' | 'failed';
  version?: string | null;
  installedAt?: string;
  bin?: string;
  reason?: FailureReason;
  detail?: string;
  startedAt?: string;
}

function statusPath(roots: RunnerRoots, slug: string): string {
  return join(roots.engines, slug, 'status.json');
}

function writeStatus(roots: RunnerRoots, slug: string, s: StatusFile): void {
  writeFileAtomic(statusPath(roots, slug), JSON.stringify(s), 0o644);
}

function openExcl(path: string): number {
  return openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
}

function acquireLock(roots: RunnerRoots, slug: string, now: Date): string {
  const lock = join(roots.engines, slug, '.lock');
  try {
    closeSync(openExcl(lock));
    return lock;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
  }
  const st = lstatOrNull(lock);
  if (st && now.getTime() - st.mtimeMs > INSTALL_LIMITS.staleLockMs) {
    unlinkSync(lock);
    closeSync(openExcl(lock));
    return lock;
  }
  throw new InstallFailure('unknown', 'đang có một lần cài khác cho loại CLI này');
}

export async function installEngine(
  roots: RunnerRoots,
  req: InstallRequest,
  deps: InstallDeps,
): Promise<EngineInstallStatus> {
  if (!isEngineSlug(req.slug)) throw new RunnerError('bad_slug', 'slug không hợp lệ');
  const bin = req.recipe.binaryName;
  mkdirInside(roots.engines, req.slug, 0o755);
  let lock: string | null = null;
  const tmps: string[] = [];
  try {
    if (!isCliBinName(bin)) throw new InstallFailure('unknown', 'tên binary trong công thức sai dạng');
    lock = acquireLock(roots, req.slug, deps.now());
    writeStatus(roots, req.slug, { state: 'installing', version: null, startedAt: deps.now().toISOString() });
    deps.emit({ state: 'installing', progressPct: 0, version: null });

    const platform = deps.platform ?? pickPlatform(req.recipe);
    const art = await resolveArtifact(req, platform);
    const versionDir = mkdirInside(roots.engines, `${req.slug}/${art.version}`, 0o755);
    const download = join(versionDir, `.download-${process.pid}`);
    tmps.push(download);
    rmSync(download, { force: true });
    const fd = openExcl(download);
    const hash = newHash(art.algorithm);
    let lastPct = -1;
    try {
      await fetchVia(art.url, {
        proxy: req.proxy,
        timeoutMs: INSTALL_LIMITS.binaryTimeoutMs,
        maxBytes: INSTALL_LIMITS.binaryBytes,
        httpsOnly: req.httpsOnly,
        hash,
        onChunk: (c) => {
          let off = 0;
          while (off < c.length) off += writeSync(fd, c, off, c.length - off);
        },
        onProgress: (received, total) => {
          const pct = total ? Math.min(99, Math.floor((received / total) * 100)) : null;
          if (pct === null ? lastPct !== -2 : pct !== lastPct) {
            lastPct = pct ?? -2;
            deps.emit({ state: 'installing', progressPct: pct, version: art.version });
          }
        },
      });
      fsyncSync(fd);
    } catch (e) {
      throw failureFromFetch(e, 'unknown');
    } finally {
      closeSync(fd);
    }
    if (hash.digest('hex') !== art.checksum) {
      throw new InstallFailure('checksum_mismatch', `${art.algorithm} của tệp tải về không khớp manifest`);
    }

    let staged = download;
    if (req.recipe.payload.kind === 'tar.gz') {
      staged = join(versionDir, `.extract-${process.pid}`);
      tmps.push(staged);
      rmSync(staged, { force: true });
      try {
        await extractMember(download, req.recipe.payload.member, staged, INSTALL_LIMITS.binaryBytes);
      } catch (e) {
        throw new InstallFailure('unknown', (e as Error).message);
      }
    }
    chmodSync(staged, 0o755);
    renameSync(staged, join(versionDir, bin));

    // current → <version>: symlink tương đối, thay nguyên tử
    const link = join(roots.engines, req.slug, 'current');
    const tmpLink = join(roots.engines, req.slug, `.current-${process.pid}`);
    tmps.push(tmpLink);
    rmSync(tmpLink, { force: true });
    symlinkSync(art.version, tmpLink);
    renameSync(tmpLink, link);

    const installedAt = deps.now().toISOString();
    writeStatus(roots, req.slug, { state: 'installed', version: art.version, installedAt, bin });
    const done: EngineInstallStatus = { state: 'installed', version: art.version, installedAt };
    deps.emit(done);
    return done;
  } catch (e) {
    const f =
      e instanceof InstallFailure
        ? e
        : new InstallFailure('unknown', e instanceof RunnerError ? e.message : 'lỗi không phân loại khi cài');
    const detail = f.message.slice(0, 500);
    try {
      writeStatus(roots, req.slug, { state: 'failed', reason: f.reason, detail });
    } catch {
      // volume hỏng: vẫn báo qua stdout
    }
    const failed: EngineInstallStatus = { state: 'failed', reason: f.reason, detail };
    deps.emit(failed);
    return failed;
  } finally {
    for (const t of tmps) rmSync(t, { force: true });
    if (lock) rmSync(lock, { force: true });
  }
}

/** `ga-engine-install status <slug>`: đọc status.json + kiểm binary còn đúng chỗ. Thiếu ⇒ not_installed (fail-closed). */
export function readInstallStatus(roots: RunnerRoots, slug: string, now: Date): EngineInstallStatus {
  if (!isEngineSlug(slug)) throw new RunnerError('bad_slug', 'slug không hợp lệ');
  let s: StatusFile;
  try {
    s = JSON.parse(readFileSync(statusPath(roots, slug), 'utf8')) as StatusFile;
  } catch {
    return { state: 'not_installed' };
  }
  if (s.state === 'installed' && typeof s.version === 'string' && typeof s.bin === 'string' && s.installedAt) {
    if (!VERSION_RE.test(s.version) || !isCliBinName(s.bin)) return { state: 'not_installed' };
    const link = join(roots.engines, slug, 'current');
    const st = lstatOrNull(link);
    if (!st?.isSymbolicLink() || readlinkSync(link) !== s.version) return { state: 'not_installed' };
    try {
      if (!statSync(join(link, s.bin)).isFile()) return { state: 'not_installed' };
    } catch {
      return { state: 'not_installed' };
    }
    return { state: 'installed', version: s.version, installedAt: s.installedAt };
  }
  if (s.state === 'failed' && s.reason) {
    return { state: 'failed', reason: s.reason, detail: String(s.detail ?? '').slice(0, 500) };
  }
  if (s.state === 'installing') {
    const started = s.startedAt ? Date.parse(s.startedAt) : Number.NaN;
    if (Number.isFinite(started) && now.getTime() - started < INSTALL_LIMITS.staleLockMs) {
      return { state: 'installing', progressPct: null, version: null };
    }
    return { state: 'failed', reason: 'unknown', detail: 'lần cài trước bị gián đoạn' };
  }
  return { state: 'not_installed' };
}

/** Ghi một dòng EngineInstallStatus ra fd (supervisor đọc stdout). */
export function writeStatusLine(fd: number, s: EngineInstallStatus): void {
  const line = Buffer.from(`${JSON.stringify(s)}\n`);
  let off = 0;
  while (off < line.length) off += writeSync(fd, line, off, line.length - off);
}
