// GA-FAKES-TEST-ONLY — chỉ dùng trong test / image *-test, không bao giờ vào image phát hành (BUILD-PLAN §C.3).
//
// update-feed: feed phát hành giả + khoá minisign TEST sinh lúc chạy (BUILD-PLAN §C.3, CNS-141). Mỗi bản có manifest JSON và chữ ký
// `manifest.json.minisig` theo biến thể:
//   valid       chữ ký đúng
//   badsig      chữ ký của MỘT KHOÁ KHÁC → updater phải từ chối
//   tampered    chữ ký đúng cho nội dung gốc, nhưng manifest phục vụ đã bị sửa → từ chối
//   unsigned    không có .minisig (404) → từ chối
//   downgrade   chữ ký đúng nhưng version thấp hơn bản đang chạy → phải từ chối đường cập nhật
// Danh sách mặc định lấy từ BUILD-PLAN §C.3: v0.1.0, v0.1.1 (đạt), v0.1.2-bad (healthcheck trượt: do image trong registry),
// v0.1.3-unsigned, v0.1.4-compose (đổi compose + thêm khoá .env, kiểm bước migrate); thêm badsig / tampered / downgrade.
// Định dạng feed / manifest là CỦA FAKE (ASSUMPTIONS UF-2): L-OPS đối chiếu khi viết updater (M2).
//   GET /feed.json · GET /releases/<version>/manifest.json · GET /releases/<version>/manifest.json.minisig
//   GET /minisign.pub · GET /_test/pubkey
import { createHash } from 'node:crypto';
import http from 'node:http';
import { listen, type Running, sendJson } from '../lib/http.ts';
import {
  generateMinisignKey,
  type MinisignKey,
  minisignPublicKeyBase64,
  minisignPublicKeyFile,
  signMinisign,
} from './minisign.ts';

export const VARIANTS = ['valid', 'badsig', 'tampered', 'unsigned', 'downgrade'] as const;
export type Variant = (typeof VARIANTS)[number];

export interface ReleaseSpec {
  version: string;
  variant: Variant;
  /** Bản này đổi compose + thêm khoá .env (kiểm bước migrate). */
  compose?: boolean;
}

export const DEFAULT_RELEASES: readonly ReleaseSpec[] = [
  { version: '0.1.0', variant: 'valid' },
  { version: '0.1.1', variant: 'valid' },
  { version: '0.1.2-bad', variant: 'valid' },
  { version: '0.1.3-unsigned', variant: 'unsigned' },
  { version: '0.1.3-badsig', variant: 'badsig' },
  { version: '0.1.3-tampered', variant: 'tampered' },
  { version: '0.1.4-compose', variant: 'valid', compose: true },
  { version: '0.0.9-downgrade', variant: 'downgrade' },
];

export interface BuiltRelease {
  spec: ReleaseSpec;
  /** Byte manifest mà server PHỤC VỤ. */
  manifest: string;
  /** Nội dung .minisig, hoặc null (unsigned). */
  signature: string | null;
}

export function buildManifest(spec: ReleaseSpec, registry: string, publishedAt: string): string {
  const img = (name: string) => `${registry}/genagents/${name}:${spec.version}`;
  return `${JSON.stringify(
    {
      schema: 1,
      version: spec.version,
      channel: 'stable',
      publishedAt,
      images: {
        'gen-agents': img('gen-agents'),
        'gen-agents-updater': img('gen-agents-updater'),
        'gen-agents-runtime': img('gen-agents-runtime'),
      },
      compose: {
        sha256: createHash('sha256').update(`compose-${spec.version}`).digest('hex'),
        changed: spec.compose === true,
      },
      envAdd: spec.compose ? ['GA_FAKE_NEW_SETTING'] : [],
      migrations: spec.compose ? ['0001-add-env-key.sh'] : [],
      minFrom: '0.1.0',
    },
    null,
    2,
  )}\n`;
}

export function buildRelease(
  spec: ReleaseSpec,
  good: MinisignKey,
  other: MinisignKey,
  registry: string,
  publishedAt: string,
): BuiltRelease {
  const original = buildManifest(spec, registry, publishedAt);
  const tc = `timestamp:${Math.floor(Date.parse(publishedAt) / 1000)}\tfile:manifest.json`;
  switch (spec.variant) {
    case 'unsigned':
      return { spec, manifest: original, signature: null };
    case 'badsig':
      return { spec, manifest: original, signature: signMinisign(Buffer.from(original), other, tc) };
    case 'tampered':
      return {
        spec,
        manifest: original.replace(spec.version, `${spec.version}+evil`),
        signature: signMinisign(Buffer.from(original), good, tc),
      };
    default:
      return { spec, manifest: original, signature: signMinisign(Buffer.from(original), good, tc) };
  }
}

export interface FakeUpdateFeed extends Running {
  key: MinisignKey;
  /** Nội dung tệp minisign.pub của khoá test. */
  publicKeyFile: string;
  publicKeyBase64: string;
  releases: BuiltRelease[];
}

export async function startUpdateFeed(
  opts: { host?: string; port?: number; releases?: readonly ReleaseSpec[]; registry?: string; now?: () => Date } = {},
): Promise<FakeUpdateFeed> {
  const key = generateMinisignKey(); // khoá test: chỉ sống trong tiến trình này
  const other = generateMinisignKey(); // khoá "lạ" cho biến thể badsig
  const publishedAt = (opts.now?.() ?? new Date()).toISOString();
  const releases = (opts.releases ?? DEFAULT_RELEASES).map((r) =>
    buildRelease(r, key, other, opts.registry ?? 'localhost:5000', publishedAt),
  );
  const byVersion = new Map(releases.map((r) => [r.spec.version, r]));
  const publicKeyFile = minisignPublicKeyFile(key);
  const publicKeyBase64 = minisignPublicKeyBase64(key);

  const server = http.createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' });
    if (path === '/feed.json') {
      return sendJson(res, 200, {
        schema: 1,
        channel: 'stable',
        releases: releases.map((r) => ({
          version: r.spec.version,
          manifest: `/releases/${r.spec.version}/manifest.json`,
          signature: `/releases/${r.spec.version}/manifest.json.minisig`,
        })),
      });
    }
    if (path === '/minisign.pub') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end(publicKeyFile);
    }
    if (path === '/_test/pubkey')
      return sendJson(res, 200, { publicKeyFile, publicKeyBase64, keyId: key.keyId.toString('hex') });
    const m = /^\/releases\/([^/]+)\/(manifest\.json|manifest\.json\.minisig)$/.exec(path);
    const rel = m ? byVersion.get(decodeURIComponent(m[1] as string)) : undefined;
    if (!m || !rel) return sendJson(res, 404, { error: 'not found' });
    if (m[2] === 'manifest.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(rel.manifest);
    }
    if (!rel.signature) return sendJson(res, 404, { error: 'no signature' });
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(rel.signature);
  });

  const running = await listen(server, opts);
  return { ...running, key, publicKeyFile, publicKeyBase64, releases };
}
