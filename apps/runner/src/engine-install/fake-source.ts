import type { InstallPlatform } from '@ga/contracts';
import type { InstallSource } from '@ga/engines';

// CHỈ CÓ TRONG IMAGE TEST (deploy/docker/Dockerfile.runtime-test chép thêm tệp này; Dockerfile.runtime KHÔNG chép).
// Nguồn `fake` của ga-engine-install (BUILD-PLAN §C.2, CNS-137): máy chủ "trình cài giả" (testing/fakes/engine-source của
// L-FAKE; trong lúc chờ: stub ở testing/it/runtime/stubs/) phục vụ manifest theo nền tảng tại
//   <GA_FAKE_ENGINE_SOURCE_URL>/<slug>/manifests/<platform>.json   = { version, url, sha512 }   (platform linux_amd64 | linux_arm64;
//   giao thức của testing/fakes/engine-source — ASSUMPTIONS ES-1..ES-4)
// và đi qua ga-egress như nguồn thật ⇒ cùng đường code tải / %, checksum, phân loại lỗi. Tên binary lấy từ `installSource` thật
// của adapter (để /opt/engines/<slug>/current/<bin> đúng chỗ adapter trỏ tới).

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const BASE_RE = /^https?:\/\/[A-Za-z0-9.-]{1,253}(:[0-9]{1,5})?$/;

/** Nguồn cài giả: cùng dạng với nguồn thật (`installSource` + `platforms`) nhưng trỏ tới máy chủ giả. */
export function fakeInstall(
  slug: string,
  binaryName: string,
  env: NodeJS.ProcessEnv,
): { source: InstallSource; platforms: readonly InstallPlatform[] } {
  const base = env.GA_FAKE_ENGINE_SOURCE_URL ?? '';
  if (!SLUG_RE.test(slug)) throw new Error('slug không hợp lệ');
  if (!BASE_RE.test(base)) throw new Error('GA_FAKE_ENGINE_SOURCE_URL không hợp lệ');
  return {
    source: {
      binaryName,
      manifest: {
        kind: 'per-platform',
        urlTemplate: `${base}/${slug}/manifests/{platform}.json`,
        fields: { version: 'version', url: 'url', checksum: 'sha512' },
      },
      payload: { kind: 'raw' },
      verifiedAt: 'fake',
    },
    platforms: [
      { arch: 'x64', libc: 'glibc', key: 'linux_amd64' },
      { arch: 'arm64', libc: 'glibc', key: 'linux_arm64' },
    ],
  };
}
